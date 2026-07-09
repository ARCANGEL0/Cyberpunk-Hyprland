// the top-left system meters -- CPU / RAM / STORAGE / BATTERY drawn to look like the player
// status overlay (health/stamina bars) from Cyberpunk 2077's HUD. the look is ported from a
// react mockup i found of that HUD ("cyberpunk-hud-react"), tuned by eye against a real
// it tries to mimick at full V's stats bars
// HEALTH BAR -> CPU monitor
// RAM Bar -> RAM monitor aswell lol
// EXPERIENCE -> Storage monitor 
// STAMINA -> battery percentage 
// .
import { Box, DrawingArea, EventBox } from "../../widget.ts"
import { interval } from "astal"
import { buildStats } from "./sys.ts"
import { makePlane, fillQuad, tiltText } from "./proj.ts"
import { RGB, f } from "./colors.ts"
import GLib from "gi://GLib"
import Gdk from "gi://Gdk"
import Gio from "gi://Gio"

import { TITLE, MONO, ICONF } from "./fonts.ts"
const stats = buildStats()
const get = (k: string) => stats.find(s => s.key === k)
const cpu = get("cpu")!, ram = get("ram")!

// the exact colours lifted from the game hud, using colorpicker
const GRAY: RGB = [200, 200, 200] as any
const LIGHTRED: RGB = [252, 113, 115] as any
const DARKRED: RGB = [120, 36, 40] as any
const CYAN: RGB = [85, 222, 255] as any
// battery colour shifts with charge: red when nearly dead -> orange -> amber -> green when healthy
const batColor = (p: number): RGB => p < 10 ? [255, 55, 55] as any : p < 50 ? [255, 120, 45] as any : p < 70 ? [255, 205, 55] as any : [80, 240, 150] as any

const read = (p: string) => { try { const [ok, d] = GLib.file_get_contents(p); return ok ? new TextDecoder().decode(d) : "" } catch { return "" } }
// find the battery in /sys/class/power_supply and checks if AC powered or normal lithium battery like laptop. if there's
// none, readBat() just returns 1 (full) so the rail sits full instead of looking broken.
const batDir = ((): string | null => {
    try { const d = GLib.Dir.open("/sys/class/power_supply", 0); let n: string | null
        while ((n = d.read_name())) { const p = `/sys/class/power_supply/${n}`; if (read(`${p}/type`).trim() === "Battery") return p } } catch {}
    return null
})()
const readBat = () => batDir ? (parseInt(read(`${batDir}/capacity`).trim()) || 0) / 100 : 1
// disk usage of the root filesystem (/), via gio so i don't have to parse `df`. which polls slow af
let diskFrac = 0, diskUsedG = 0, diskTotG = 0
const readDisk = () => { try {
    const i = Gio.File.new_for_path("/").query_filesystem_info("filesystem::size,filesystem::used", null)
    const sz = Number(i.get_attribute_uint64("filesystem::size")), us = Number(i.get_attribute_uint64("filesystem::used"))
    diskTotG = Math.round(sz / 1e9); diskUsedG = Math.round(us / 1e9); diskFrac = sz > 0 ? us / sz : 0
} catch {} }
readDisk(); let batteryV = readBat()
interval(8000, () => { readDisk(); batteryV = readBat() })

const readTemp = (): number => {
    for (const z of ["thermal_zone0", "thermal_zone1", "thermal_zone2", "thermal_zone3"]) {
        const t = parseInt(read(`/sys/class/thermal/${z}/temp`).trim())
        if (t > 1000 && t < 150000) return Math.round(t / 1000)
    }
    return 0
}
const uptimeDays = () => Math.floor((parseFloat(read("/proc/uptime").split(" ")[0]) || 0) / 86400)
let badgeVal = "00"
const refreshBadge = () => { const t = readTemp(); badgeVal = t ? `${t}°` : String(uptimeDays()).padStart(2, "0") }
refreshBadge(); interval(3000, refreshBadge)

const W = 500, H = 96
const X0 = 62, MAIN = W - 78, RAMX = X0 + (MAIN - X0) * 0.42, BATX = W - 46
const plane = makePlane({ w: W, h: H, yaw: -24, pitch: -6, roll: 1.6, focal: 2100, dist: 2200, pad: 2 })
const clamp = (n: number) => Math.max(0, Math.min(1, n))

const poly = (ctx: any, pts: [number, number][], col: RGB, a: number, fill = true, lw = 2) => {
    const [r, g, b] = f(col)
    ctx.newPath(); pts.map(([u, v]) => plane.project(u, v)).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
    ctx.setSourceRGBA(r, g, b, a); if (fill) ctx.fill(); else { ctx.setLineWidth(lw); ctx.stroke() }
}
const glowPath = (ctx: any, pts: [number, number][], col: RGB, blur: number, k: number) => {
    const [r, g, b] = f(col)
    const trace = () => { ctx.newPath(); pts.map(([u, v]) => plane.project(u, v)).forEach(([x, y]: [number, number], i: number) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath() }
    ctx.setOperator(12)
    for (const [w, a] of [[blur * 1.5, 0.10], [blur * 0.8, 0.17]] as const) {
        trace(); ctx.setSourceRGBA(r, g, b, a * k); ctx.setLineWidth(w); ctx.stroke()
    }
    ctx.setOperator(2)
    ctx.save(); trace(); ctx.clip(); ctx.setOperator(12)
    for (const [w, a] of [[blur * 1.8, 0.13], [blur * 1.0, 0.20], [blur * 0.5, 0.32]] as const) {
        trace(); ctx.setSourceRGBA(r, g, b, a * k); ctx.setLineWidth(w); ctx.stroke()
    }
    ctx.setOperator(2); ctx.restore()
}
const bloom = (ctx: any, x0: number, y0: number, x1: number, y1: number, col: RGB, blur: number, k: number) =>
    glowPath(ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], col, blur, k)
const glowShape = (ctx: any, pts: [number, number][], col: RGB, blur: number, k: number) => glowPath(ctx, pts, col, blur, k)

const holoFill = (ctx: any, x0: number, x1: number, y: number, h: number, base: RGB, a: number) => {
    fillQuad(ctx, plane, x0, y, x1, y + h, base, a)   // intentionally flat & matte -- no gloss, that's what keeps it holographic not glassy
}

const scanlines = (ctx: any, x0: number, x1: number, y: number, h: number, gap: number) => {
    for (let sy = y + gap * 0.6; sy < y + h - 0.3; sy += gap)
        fillQuad(ctx, plane, x0, sy, x1, sy + 0.5, [255, 255, 255] as any, 0.06)
}

export const Monitors = () => {
    const area = DrawingArea({}); area.set_size_request(plane.width, plane.height)
    const d = { sto: 0, cpu: 0, ram: 0, bat: 0 }

    let mx = -1, my = -1, hovered: string | null = null
    const hitTest = (x: number, y: number): string | null => {
        const [sto_l, sto_t] = plane.project(X0, 15)
        const [sto_r] = plane.project(MAIN, 15)
        const [cpu_l, cpu_t] = plane.project(X0, 22)
        const [cpu_r] = plane.project(MAIN, 22)
        const [ram_l, ram_t] = plane.project(X0, 44)
        const [ram_r] = plane.project(RAMX, 44)
        const [bat_l, bat_t] = plane.project(22, 78)
        const [bat_r, bat_b] = plane.project(BATX, 90)
        const [bx_l, bx_t] = plane.project(18, 14)
        const [bx_r, bx_b] = plane.project(62, 54)

        // the y-boundaries between adjacent meters, sitting halfway between each row's top edge
        const mid1 = (sto_t + cpu_t) / 2   // storage|cpu boundary (~44.6)
        const mid2 = (cpu_t + ram_t) / 2   // cpu|ram boundary (~59.0)
        const mid3 = (ram_t + bat_t) / 2   // ram|battery boundary (~85.2)

        // now just bucket the cursor into whichever zone it falls in
        if (x >= bx_l - 4 && x <= bx_r + 4 && y >= bx_t - 4 && y <= bx_b + 4) return "badge"  // the badge box, left side
        if (y >= bat_t - 6 && y <= bat_b + 6 && x >= bat_l - 6 && x <= bat_r + 6) return "bat" // battery rail, down below
        if (y >= mid1 && y < mid2 && x >= sto_l - 6 && x <= sto_r + 6) return "sto"            // thin storage bar up top
        if (y >= mid2 && y < mid3 && x >= cpu_l - 6 && x <= cpu_r + 6) return "cpu"            // cpu bar, middle
        if (y >= mid3 && y < bat_t + 10 && x >= ram_l - 6 && x <= ram_r + 6) return "ram"      // ram ticks, lower
        return null
    }
    const tooltipLabels: Record<string, string> = {
        bat: "BATTERY LEVEL",
        sto: "STORAGE INFO",
        cpu: "CPU USAGE",
        ram: "RAM USAGE",
        badge: "SYSTEM STATUS",
    }

    const evt = EventBox({ child: area })
    try { evt.add_events(Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK) } catch {}
    evt.connect("motion-notify-event", (_w: any, e: any) => {
        let x = 0, y = 0
        try { const c = e.get_coords?.(); if (c) { x = c[1]; y = c[2] } } catch {}
        mx = x; my = y
        const prev = hovered
        hovered = hitTest(x, y)
        if (hovered !== prev) area.queue_draw()
        return false
    })
    evt.connect("leave-notify-event", () => {
        mx = -1; my = -1; hovered = null; area.queue_draw(); return false
    })
    area.connect("draw", (_w: any, ctx: any) => {
        const bcol = batColor(batteryV * 100)
        const bx = 18, by = 14, S = 40
        const P = (px: number, py: number): [number, number] => [bx + px / 45 * S, by + py / 45 * S]
        const badge: [number, number][] = [P(1, 1), P(44, 1), P(44, 44), P(14.6, 44), P(1, 27.4)]
        poly(ctx, badge, [4, 15, 19] as any, 0.55)
        glowShape(ctx, badge, CYAN, 3, 0.8)
        poly(ctx, badge, CYAN, 0.96, false, 1.4)
        const num = badgeVal.replace("°", ""), nw = num.length * 11
        tiltText(ctx, plane, bx + 20, by + 24, num, TITLE, 15, CYAN, 0.95, { align: "c", bold: true, glow: 0.8 })

        {
            const y = 15, h = 4, end = X0 + (MAIN - X0) * clamp(d.sto)
            fillQuad(ctx, plane, X0, y, MAIN, y + h, GRAY, 0.10)
            bloom(ctx, X0, y, end, y + h, CYAN, 7, 1.2)
            holoFill(ctx, X0, end, y, h, CYAN, 0.9)
        }
        {
            const y = 22, h = 18, ch = (MAIN - X0) * 0.05
            poly(ctx, [[X0, y], [MAIN, y], [MAIN, y + h * 0.5], [MAIN - ch, y + h], [X0, y + h]], DARKRED, 0.42)
            const end = X0 + (MAIN - X0) * clamp(d.cpu)
            const fillPts: [number, number][] = end <= MAIN - ch
                ? [[X0, y], [end, y], [end, y + h], [X0, y + h]]
                : [[X0, y], [end, y], [end, y + h / 2 + (h / 2) * (MAIN - end) / ch], [MAIN - ch, y + h], [X0, y + h]]
            glowShape(ctx, fillPts, LIGHTRED, 8, 1.1)        
            poly(ctx, fillPts, LIGHTRED, 0.85)                
            scanlines(ctx, X0, end, y, h, 2.8)
        }
        {
            const y = 44, h = 18, tw = 8, gap = 1.6
            const n = Math.max(1, Math.floor((RAMX - X0 + gap) / (tw + gap)))   // how many ticks fit
            const lit = Math.round(clamp(d.ram) * n)                            // how many are lit
            const RAMP: [number, number][] = [[11.29, 0], [18, 0], [18, 52.09], [11.29, 60], [4.58, 60], [4.58, 30], [0, 30], [0, 0]]
            for (let i = 0; i < n; i++) {
                const sx = X0 + i * (tw + gap)
                const pts = RAMP.map(([px, py]) => [sx + px / 18 * tw, y + py / 60 * h]) as [number, number][]
                if (i < lit) { glowShape(ctx, pts, CYAN, 2.8, 1.0); poly(ctx, pts, CYAN, 0.9) }
                else poly(ctx, pts, CYAN, 0.14)
            }
        }
        {
            const bat0 = 22, y = 78, h = 7, bv = 3
            const end = bat0 + (BATX - bat0) * clamp(d.bat)
            const barShape: [number, number][] = [[bat0, y], [BATX, y], [BATX + bv, y + h], [bat0 + bv, y + h]]
            const fillPts: [number, number][] = end <= bat0 + bv
                ? [[bat0, y], [end, y], [end + bv, y + h], [bat0 + bv, y + h]]
                : [[bat0, y], [end, y], [end + bv * (end - bat0) / (BATX - bat0), y + h], [bat0 + bv, y + h]]
            poly(ctx, barShape, darken(bcol, 0.6), 0.25)
            glowShape(ctx, fillPts, bcol, 5, 0.8)
            poly(ctx, fillPts, bcol, 0.88)
            scanlines(ctx, bat0, end, y, h, 2.2)
            poly(ctx, barShape, bcol, 0.96, false, 1.2)
                    }

        tiltText(ctx, plane, W, 11, `${diskUsedG}/${diskTotG}G`, MONO, 8, CYAN, 0.85, { align: "r", bold: true })
        tiltText(ctx, plane, W, 46, cpu.percent.get(), TITLE, 24, LIGHTRED, 1, { align: "r", bold: true, glow: 0.42 })
        const ramUsed = ram.substat.get().replace(/\s*GB/i, ""), ramTot = ram.sublabel.replace(/\s*GB/i, "")
        tiltText(ctx, plane, W - 216, 59, `${ramUsed} / ${ramTot} GB`, MONO, 10.5, CYAN, 0.95, { align: "r", bold: true, glow: 0.3 })
        tiltText(ctx, plane, 6, 84, "\uf0e7", ICONF, 10, bcol, 0.95)
        tiltText(ctx, plane, W, 85, `${Math.round(batteryV * 100)}%`, TITLE, 10, bcol, 0.92, { align: "r", bold: true })

        if (hovered && mx >= 0) {
            const label = tooltipLabels[hovered]
            if (label) {
                const fs = 9, pad = 8, notch = 7
                ctx.save()
                ctx.selectFontFace(TITLE, 0, 1)
                ctx.setFontSize(fs)
                const te = ctx.textExtents(label)
                const tw = te.width + pad * 2, th = te.height + pad * 2 + 2
                let tx = mx + 14, ty = my - th - 6
                if (tx + tw > plane.width) tx = mx - tw - 10
                if (ty < 0) ty = my + 20

                const shape: [number, number][] = [
                    [tx + notch, ty],           // top-left chamfer start
                    [tx + tw, ty],              // top-right corner
                    [tx + tw, ty + th - notch],  // right side down to chamfer
                    [tx + tw - notch, ty + th],  // bottom-right chamfer
                    [tx, ty + th],              // bottom-left corner
                    [tx, ty + notch],           // left side up to chamfer
                ]

                ctx.newPath()
                shape.forEach(([sx, sy], i) => i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy))
                ctx.closePath()
                ctx.setSourceRGBA(0.12, 0, 0, 0.92)
                ctx.fill()

                ctx.newPath()
                shape.forEach(([sx, sy], i) => i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy))
                ctx.closePath()
                ctx.setSourceRGBA(252/255, 113/255, 115/255, 0.08)
                ctx.fill()

                for (let sy = ty + 2; sy < ty + th - 2; sy += 2.5) {
                    ctx.newPath(); ctx.moveTo(tx + 2, sy); ctx.lineTo(tx + tw - 2, sy)
                    ctx.setSourceRGBA(252/255, 113/255, 115/255, 0.04)
                    ctx.setLineWidth(0.5); ctx.stroke()
                }

                // outer red glow around the tooltip (same stacked-stroke trick as glowPath)
                ctx.setOperator(12) // additive blend
                for (const [w, a] of [[6, 0.06], [4, 0.10], [2.5, 0.16]] as const) {
                    ctx.newPath()
                    shape.forEach(([sx, sy], i) => i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy))
                    ctx.closePath()
                    ctx.setSourceRGBA(252/255, 60/255, 70/255, a)
                    ctx.setLineWidth(w)
                    ctx.stroke()
                }
                ctx.setOperator(2) // back to normal blend

                // the crisp red outline
                ctx.newPath()
                shape.forEach(([sx, sy], i) => i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy))
                ctx.closePath()
                ctx.setSourceRGBA(252/255, 113/255, 115/255, 0.95)
                ctx.setLineWidth(1.3)
                ctx.stroke()

                // brighten just the two chamfered cut edges so the cut corners pop
                ctx.setSourceRGBA(1, 200/255, 200/255, 1)
                ctx.setLineWidth(1.5)
                ctx.newPath(); ctx.moveTo(tx, ty + notch); ctx.lineTo(tx + notch, ty); ctx.stroke()
                ctx.newPath(); ctx.moveTo(tx + tw - notch, ty + th); ctx.lineTo(tx + tw, ty + th - notch); ctx.stroke()

                // the label text itself
                const baseline = ty + pad + te.height + (te.y < 0 ? te.y : 0)
                ctx.setSourceRGBA(1, 180/255, 180/255, 1)
                ctx.moveTo(tx + pad, baseline)
                ctx.showText(label)
                ctx.restore()
            }
        }

        return false
    })
    const tgt = () => ({ sto: diskFrac, cpu: clamp(cpu.frac.get()), ram: clamp(ram.frac.get()), bat: batteryV })
    let last = "", lastDraw = 0
    const t = interval(110, () => {
        let busy = false, changed = false
        const g = tgt()
        for (const k of ["sto", "cpu", "ram", "bat"] as const) {
            const di = g[k] - (d as any)[k]
            if (Math.abs(di) > 0.04) { (d as any)[k] += di * 0.22; busy = true }  // far away -> ease toward it
            else if (di !== 0) (d as any)[k] = g[k]                               // close enough -> just snap and stop
        }
        const sig = `${cpu.percent.get()}|${ram.substat.get()}|${diskUsedG}|${Math.round(batteryV * 100)}`
        if (sig !== last) { last = sig; changed = true }
        const now = Date.now()
        if (busy || (changed && now - lastDraw > 320)) { lastDraw = now; area.queue_draw() }
    })
    area.connect("destroy", () => t.cancel())
    return Box({ className: "monitors", children: [evt] })
}
const lighten = (c: RGB, t: number): RGB => [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t] as any
const darken = (c: RGB, t: number): RGB => [c[0] * (1 - t), c[1] * (1 - t), c[2] * (1 - t)] as any
