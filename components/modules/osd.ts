import { Window, Box, DrawingArea, activeMonitor } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval, timeout } from "astal"
import GLib from "gi://GLib"
import AstalWp from "gi://AstalWp"
import { makePlane, tiltBar, tiltText, strokePath } from "./proj.ts"
import { NEON } from "./colors.ts"
const TITLE = "Chakra Petch"
const ICONF = "FiraCode Nerd Font"
const read = (p) => { try { const [ok, d] = GLib.file_get_contents(p); return ok ? new TextDecoder().decode(d).trim() : "" } catch { return "" } }
const exists = (p) => GLib.file_test(p, GLib.FileTest.EXISTS)
const findBacklight = (): string | null => {
 for (const d of ["/sys/class/backlight/intel_backlight", "/sys/class/backlight/amdgpu_bl0",
 "/sys/class/backlight/amdgpu_bl1", "/sys/class/backlight/acpi_video0"])
 if (exists(`${d}/brightness`)) return d
 return null
}
const W = 300, H = 64
const plane = makePlane({ w: W, h: H, yaw: -3, pitch: 4, roll: 0, focal: 1300, dist: 1300, pad: 22 })
export const OsdWindow = () => {
 let kind: "vol" | "brt" = "vol"
 let frac = 0, muted = false
 let hideTimer = null
 const area = DrawingArea({})
 area.set_size_request(plane.width, plane.height)
 area.connect("draw", (_w, ctx) => {
 const col = kind === "vol" ? NEON.cyan : NEON.amber
 const icon = kind === "vol" ? (muted ? "\uf026" : (frac > 0.5 ? "\uf028" : "\uf027")) : "\uf185"
 const label = kind === "vol" ? "VOLUME" : "BRIGHTNESS"
 strokePath(ctx, plane, [[0, 4], [16, 4]], col, 0.8, 2)
 strokePath(ctx, plane, [[0, 4], [0, H - 6]], col, 0.4, 1)
 strokePath(ctx, plane, [[W - 16, H - 6], [W, H - 6]], col, 0.8, 2)
 tiltText(ctx, plane, 12, 26, icon, ICONF, 22, col, 1, { glow: 0.7 })
 tiltText(ctx, plane, 48, 22, label, TITLE, 13, col, 1, { bold: true, glow: 0.5 })
 tiltText(ctx, plane, W - 6, 22, muted && kind === "vol" ? "MUTE" : `${Math.round(frac * 100)}%`,
 TITLE, 15, col, 1, { align: "r", bold: true, glow: 0.6 })
 tiltBar(ctx, plane, 48, W - 10, 44, muted ? 0 : frac, col, 9)
 return false
 })

 const win = Window({
 name: "osd", className: "aug osd",
 anchor: Anchor.BOTTOM, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
 visible: false,
 child: Box({ className: "osd-wrap", child: area }),
 })

 const show = () => {
 area.queue_draw()
 if (!win.visible) { try { (win as any).gdkmonitor = activeMonitor() } catch {} }
 win.visible = true
 if (hideTimer) { hideTimer.cancel?.() }
 hideTimer = timeout(1500, () => { win.visible = false })
 }

 try {
 const wp = AstalWp.get_default()
 const spk = (wp)?.audio?.defaultSpeaker ?? (wp)?.defaultSpeaker
 if (spk) {
 let first = true
 const onVol = () => {
 frac = Math.max(0, Math.min(1.5, spk.volume ?? 0))
 muted = !!spk.mute
 kind = "vol"
 if (first) { first = false; return }
 show()
 }
 spk.connect("notify::volume", onVol)
 spk.connect("notify::mute", onVol)
 frac = Math.max(0, Math.min(1.5, spk.volume ?? 0)); muted = !!spk.mute
 }
 } catch (e) { print("[cyber] osd wp:", e) }

 const bl = findBacklight()
 if (bl) {
 const maxB = parseInt(read(`${bl}/max_brightness`)) || 1
 let last = parseInt(read(`${bl}/brightness`)) || 0
 interval(800, () => {
 const cur = parseInt(read(`${bl}/brightness`)) || 0
 if (cur !== last) {
 last = cur; frac = cur / maxB; muted = false; kind = "brt"; show()
 }
 })
 }

 return win
}
