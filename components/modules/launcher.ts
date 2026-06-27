import { Window, Box, DrawingArea, EventBox } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import Gdk from "gi://Gdk?version=3.0"
import GdkPixbuf from "gi://GdkPixbuf"
import { interval } from "astal"
import { CYBER_DIR } from "../../env.ts"
import { makePlane, tiltText, fillQuad, alertChip } from "./proj.ts"
import { NEON, f } from "./colors.ts"
import { openAppsMenu } from "./appsmenu.ts"

const TITLE = "Chakra Petch"
const W = 200, H = 128
const plane = makePlane({ w: W, h: H, yaw: -16, pitch: 1, roll: 4, focal: 1180, dist: 1180, pad: 18 })

let ICON: any = null
try { ICON = GdkPixbuf.Pixbuf.new_from_file(`${CYBER_DIR}/assets/icons/launcher.png`) } catch (e) { print("[launcher] launcher.png:", e) }

export const LauncherWindow = (mon?) => {
 const area = DrawingArea({}); area.set_size_request(plane.width, plane.height)
 let hover = false
 let glitch = 0                 // 0..1 strength of the current glitch burst; only moves while hovering
 let gx = 0                     // how many px the chromatic tear is shifted sideways right now
 let gTimer: any = null

 area.connect("draw", (_w, ctx) => {
     const col = hover ? NEON.cyan : NEON.red
     const [rr, rg, rb] = f(col)
     const cx = W / 2
     const g = hover ? glitch : 0

     // the "! Apps launcher" label. while glitching i draw it three times: a red copy and
     // a cyan copy shoved apart sideways (the chromatic-aberration split) plus the real one
     const qy = 18, qx = cx - 58
     alertChip(ctx, plane, qx, qy - 11, col)
     if (g > 0.02) {
         tiltText(ctx, plane, qx + 26 + gx * 0.5, qy, "Apps launcher", TITLE, 14, NEON.red, 0.5 * g, { bold: true })
         tiltText(ctx, plane, qx + 26 - gx * 0.5, qy, "Apps launcher", TITLE, 14, NEON.cyan, 0.45 * g, { bold: true })
     }
     tiltText(ctx, plane, qx + 26, qy, "Apps launcher", TITLE, 14, col, hover ? 1 : 0.95, { bold: true, glow: 0.3 })

     // the launcher.png icon itself, drawn in perspective with a red inner glow tint
     if (ICON) {
         const iconW = 62, iconH = 62
         const ICON_DX = 54                              // nudge JUST the icon to the right (the text doesn't move)
         const ICON_ROT = 0 * Math.PI / 180             // spin JUST the icon if you want -- set the 0 to degrees (+ = clockwise)
         const ix = cx - iconW / 2 + ICON_DX, iy = 36
         const pbW = ICON.get_width(), pbH = ICON.get_height()

         // gjs's cairo binding doesn't give me a real matrix/shear, so i fake the tilt with
    // translate+rotate+scale: anchor at the icon's projected centre, rotate to match
     // the plane's horizontal axis, then scale to the projected width/height. 
         const cu = ix + iconW / 2, cv = iy + iconH / 2
         const pc = plane.project(cu, cv), pr = plane.project(cu + iconW / 2, cv), pbm = plane.project(cu, cv + iconH / 2)
         const halfW = Math.hypot(pr[0] - pc[0], pr[1] - pc[1]), halfH = Math.hypot(pbm[0] - pc[0], pbm[1] - pc[1])
         const ang = Math.atan2(pr[1] - pc[1], pr[0] - pc[0])
         const paintIcon = (ox: number, oy: number, tint: number | null, alpha: number) => {
             ctx.save()
             ctx.translate(pc[0] + ox, pc[1] + oy); ctx.rotate(ang); ctx.scale((2 * halfW) / pbW, (2 * halfH) / pbH)
             Gdk.cairo_set_source_pixbuf(ctx, ICON, -pbW / 2, -pbH / 2); ctx.paintWithAlpha(alpha)
             ctx.rectangle(-pbW / 2, -pbH / 2, pbW, pbH); ctx.clip()
             if (tint !== null) { ctx.setOperator(5); ctx.setSourceRGBA(rr, rg, rb, tint); ctx.paint(); ctx.setOperator(2) }
             ctx.restore()
         }
         if (g > 0.02) {
             ctx.setOperator(12)
             paintIcon(gx, 0, 1, 0.5 * g); paintIcon(-gx, 0, 1, 0.4 * g)
             ctx.setOperator(2)
         }
         paintIcon(g > 0.02 ? gx * 0.35 : 0, 0, hover ? 0.5 : 0.42, 1)
         if (g > 0.3) {
             const ty = iy + 6 + Math.random() * (iconH - 12)
             fillQuad(ctx, plane, ix - 4, ty, ix + iconW + 4, ty + 2, NEON.cyan, 0.5 * g)
         }
     }

     return false
 })

 const evt = EventBox({ child: area })
 try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK) } catch {}
 evt.connect("button-press-event", () => { try { openAppsMenu() } catch (e) { print(e) } return false })
 evt.connect("enter-notify-event", () => {
     hover = true
     if (!gTimer) gTimer = interval(60, () => {
         if (!hover) return
         if (glitch < 0.05 && Math.random() < 0.18) { glitch = 1; gx = (Math.random() - 0.5) * 7 }
         if (glitch > 0) { glitch = Math.max(0, glitch - 0.16); gx *= 0.82 }
         area.queue_draw()
     })
     area.queue_draw(); return false
 })
 evt.connect("leave-notify-event", () => {
     hover = false; glitch = 0; gx = 0
     if (gTimer) { gTimer.cancel(); gTimer = null }
     area.queue_draw(); return false
 })

 return Window({
     name: "launcher", className: "aug launcher", gdkmonitor: mon, anchor: Anchor.BOTTOM | Anchor.RIGHT,
     layer: Layer.BOTTOM, exclusivity: Exclusivity.IGNORE,
     child: Box({ className: "launcher-wrap", child: evt }),
 })
}
