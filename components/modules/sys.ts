import { Variable, interval, execAsync } from "astal"
import GLib from "gi://GLib"
import { NEON, RGB } from "./colors.ts"

// tiny helpers for reading those /proc + /sys files. they swallow errors and return empty/0
// instead of throwing, because a missing sensor file should just show 0, not crash the HUD.
const read = (path: string) => {
 try {
 const [ok, data] = GLib.file_get_contents(path)
 if (!ok) return ""
 return new TextDecoder().decode(data)
 } catch { return "" }
}
const readInt = (path: string) => parseInt(read(path).trim()) || 0
const exists = (path: string) => GLib.file_test(path, GLib.FileTest.EXISTS)

export type Stat = {
 key: string; color: RGB; icon: string
 label: string; sublabel: string
 frac: ReturnType<typeof Variable<number>>
 percent: ReturnType<typeof Variable<string>>
 substat: ReturnType<typeof Variable<string>>
}

const pct = (frac: number) => `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`
const pad2 = (n: number) => String(n).padStart(2, "0")
const gib = (kb: number) => (kb / 1048576).toFixed(1)

// CPU usage isn't a number you can just read -- /proc/stat gives cumulative tick counters,
// so you have to sample it twice and look at the DELTA between samples. _pi/_pt remember the
// previous idle + total ticks; usage = 1 - (idle gained / total gained) since last call.
// that's why cpuStat() calls cpuFrac() once up front just to prime these before the interval.
let _pi = 0, _pt = 0
const cpuFrac = () => {
 const line = read("/proc/stat").split("\n")[0]
 const n = line.split(/\s+/).slice(1).map(Number)
 if (n.length < 4) return 0
 const idle = n[3] + (n[4] || 0)
 const total = n.reduce((a, b) => a + (b || 0), 0)
 const di = idle - _pi, dt = total - _pt
 _pi = idle; _pt = total
 return dt > 0 ? Math.max(0, Math.min(1, 1 - di / dt)) : 0}
const cpuModel = () => {
 const m = read("/proc/cpuinfo").split("\n").find(l => l.startsWith("model name"))
 return (m?.split(":")[1] ?? "CPU")
 .replace(/\(R\)|\(TM\)|CPU|Processor/g, "")
 .replace(/@.*$/, "").replace(/\s+/g, " ").trim().toUpperCase()
}
const cpuGHz = () => {
 const mhz = read("/proc/cpuinfo").split("\n")
 .filter(l => l.startsWith("cpu MHz"))
 .map(l => parseFloat(l.split(":")[1]))
 if (!mhz.length) return ""
 const avg = mhz.reduce((a, b) => a + b, 0) / mhz.length
 return `${(avg / 1000).toFixed(2)} GHz`
}
const cpuStat = (): Stat => {
 cpuFrac()
 const s = {
 key: "cpu", color: NEON.red, icon: "\uf2db",
 label: "CPU", sublabel: cpuModel(),
 frac: Variable(0), percent: Variable("0%"), substat: Variable(""),
 }
 interval(1000, () => {
 const fr = cpuFrac()
 s.frac.set(fr); s.percent.set(pct(fr)); s.substat.set(cpuGHz())
 })
 return s
}
const gpuCard: string | null = (() => {
 for (let i = 0; i < 4; i++) {
 const dev = `/sys/class/drm/card${i}/device`
 if (exists(`${dev}/gpu_busy_percent`) || exists(`/sys/class/drm/card${i}/gt_act_freq_mhz`))
 return `/sys/class/drm/card${i}`
 }
 return null
})()
const gpuName = () => {
 try {
 const out = GLib.spawn_command_line_sync("lspci")
 if (out[0]) {
 const txt = new TextDecoder().decode(out[1])
 const l = txt.split("\n").find(x => /VGA|3D|Display/i.test(x))
 if (l) {
 const m = l.match(/\[([^\]]+)\]/) || l.match(/: (.+)(\(rev|$)/)
 if (m) return m[1].trim().toUpperCase()
 }
 }
 } catch {}
 return "GPU"
}
const gpuStat = (): Stat => {
 const card = gpuCard
 const s = {
 key: "gpu", color: NEON.cyan, icon: "\uf1bc",
 label: "GPU", sublabel: gpuName(),
 frac: Variable(0), percent: Variable("0%"), substat: Variable(""),
 }
 const maxF = card ? readInt(`${card}/gt_max_freq_mhz`) : 0
 interval(1000, () => {
 if (!card) { s.percent.set("N/A"); return }
 let fr = 0, ghz = ""
 if (exists(`${card}/device/gpu_busy_percent`)) {
 fr = readInt(`${card}/device/gpu_busy_percent`) / 100
 }
 const act = readInt(`${card}/gt_act_freq_mhz`)
 if (act && maxF) {
 if (!fr) fr = act / maxF  
 ghz = `${(act / 1000).toFixed(2)} GHz`
 }
 s.frac.set(fr); s.percent.set(pct(fr)); s.substat.set(ghz)
 })
 return s
}

const meminfo = (key: string) => {
 const l = read("/proc/meminfo").split("\n").find(x => x.startsWith(key + ":"))
 return l ? parseInt(l.split(/\s+/)[1]) : 0
}
// RAM: used = total - available. note i use MemAvailable (not MemFree) on purpose -- it
// accounts for reclaimable cache, so the number matches what `free -h` and htop show you.
const ramStat = (): Stat => {
 const total = meminfo("MemTotal")
 const s = {
 key: "ram", color: NEON.magenta, icon: "\ueb8d",
 label: "RAM",
 sublabel: `${Math.round(total / 1048576)}GB`,
 frac: Variable(0), percent: Variable("0%"), substat: Variable(""),
 }
 interval(1000, () => {
 const avail = meminfo("MemAvailable")
 const used = total - avail
 const fr = total ? used / total : 0
 s.frac.set(fr); s.percent.set(pct(fr)); s.substat.set(`${gib(used)} GB`)
 })
   return s
   }

const vramCard: string | null = (() => {
   for (let i = 0; i < 4; i++) {
  const t = `/sys/class/drm/card${i}/device/mem_info_vram_total`
     if (exists(t) && readInt(t) > 0) return `/sys/class/drm/card${i}/device`
  }
   return null
})()
const vramOrSwapStat = (): Stat => {
 if (vramCard) {
 const total = readInt(`${vramCard}/mem_info_vram_total`)
 const s = {
 key: "vram", color: NEON.green, icon: "\uf233",
 label: "VRAM",
 sublabel: `${Math.round(total / 1073741824)}GB`,
 frac: Variable(0), percent: Variable("0%"), substat: Variable(""),
}
 interval(2000, () => {
 const used = readInt(`${vramCard}/mem_info_vram_used`)
 const fr = total ? used / total : 0
 s.frac.set(fr); s.percent.set(pct(fr))
 s.substat.set(`${(used / 1073741824).toFixed(1)} GB`)
 })
 return s
 }
 const total = meminfo("SwapTotal")
 const s = {
 key: "swap", color: NEON.green, icon: "\uf233",
 label: "SWAP",
 sublabel: total ? `${(total / 1048576).toFixed(0)}GB` : "OFF",
 frac: Variable(0), percent: Variable("0%"), substat: Variable(""),
 }
 interval(3000, () => {
 const free = meminfo("SwapFree")
 const used = total - free
 const fr = total ? used / total : 0
 s.frac.set(fr); s.percent.set(total ? pct(fr) : "\u2014")
 s.substat.set(total ? `${gib(used)} GB` : "DISABLED")
 })
 return s
}
const osName = () => {
 const l = read("/etc/os-release").split("\n").find(x => x.startsWith("PRETTY_NAME"))
 return (l?.split("=")[1] ?? "LINUX").replace(/"/g, "").trim().toUpperCase()
}
const nproc = Math.max(1, GLib.get_num_processors())
const sysStat = (): Stat => {
 const s = {
 key: "sys", color: NEON.amber, icon: "\uf46f",
 label: "SYSTEM USAGE", sublabel: osName(),
 frac: Variable(0), percent: Variable("0%"), substat: Variable(""),
 }
 interval(2000, () => {
 const load1 = parseFloat(read("/proc/loadavg").trim().split(" ")[0]) || 0
 const fr = Math.min(1, load1 / nproc)
 const up = Math.floor(parseFloat(read("/proc/uptime").trim().split(" ")[0]) || 0)
 const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), sec = up % 60
 s.frac.set(fr); s.percent.set(pct(fr))
 s.substat.set(`UPTIME ${pad2(h)}:${pad2(m)}:${pad2(sec)}`)
 })
 return s
}
const defaultIface = () => {
 const lines = read("/proc/net/route").split("\n").slice(1)
 for (const l of lines) {
 const p = l.split(/\s+/)
 if (p[1] === "00000000" && p[0]) return p[0]
 }
 try {
 const dir = GLib.Dir.open("/sys/class/net", 0)
 let name: string | null
 while ((name = dir.read_name())) {
 if (name === "lo") continue
 if (read(`/sys/class/net/${name}/operstate`).trim() === "up") return name
 }
 } catch {}
 return "lo"
}
const ifaceBytes = (iface: string): [number, number] => {
 const l = read("/proc/net/dev").split("\n").find(x => x.trim().startsWith(iface + ":"))
 if (!l) return [0, 0]
 const p = l.split(":")[1].trim().split(/\s+/).map(Number)
 return [p[0], p[8]]
}
const netStat = (): Stat => {
 let iface = defaultIface()
 let [pr, pt] = ifaceBytes(iface)
 let pms = GLib.get_monotonic_time()
 const CAP = 2_000_000   // the bar maxes out at ~2 MB/s of combined traffic -- bump this if you've got fast internet
 const s = {
 key: "net", color: NEON.blue, icon: "\udb84\udca7",
 label: "NETWORK", sublabel: iface,
 frac: Variable(0), percent: Variable("0%"), substat: Variable(""),
 }
 const fmt = (bps: number) =>
 bps > 1048576 ? `${(bps / 1048576).toFixed(1)} MB/s`
 : `${(bps / 1024).toFixed(1)} KB/s`
 interval(1000, () => {
 const cur = defaultIface()
 if (cur !== iface) { iface = cur; [pr, pt] = ifaceBytes(iface) }
 const now = GLib.get_monotonic_time()
 const dt = Math.max(1e-6, (now - pms) / 1e6)
 pms = now
 const [r, t] = ifaceBytes(iface)
 const dr = Math.max(0, (r - pr) / dt), dtx = Math.max(0, (t - pt) / dt)
 pr = r; pt = t
 const total = dr + dtx
 const fr = Math.min(1, total / CAP)
 s.frac.set(fr); s.percent.set(pct(fr))
 s.substat.set(`\u2193 ${fmt(dr)} \u2191 ${fmt(dtx)}`)
 })
 const refreshName = () => execAsync(["sh", "-c",
 `iwgetid -r 2>/dev/null || echo ${iface}`])
 .then(v => s.sublabel.set((v.trim() || iface).toUpperCase())).catch(() => {})
 refreshName(); interval(15000, refreshName)
 return s
}
export const buildStats = (): Stat[] => [
 cpuStat(), gpuStat(), ramStat(), vramOrSwapStat(), sysStat(), netStat(),
]
