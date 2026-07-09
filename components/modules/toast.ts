import { Window, DrawingArea } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval } from "astal"
import Gdk from "gi://Gdk?version=3.0"
import GdkPixbuf from "gi://GdkPixbuf"
import { SCREEN_WIDTH, SCREEN_HEIGHT, CYBER_DIR } from "../../env.ts"
import { makePlane, strokePath, tiltText } from "./proj.ts"
import { NEON, f } from "./colors.ts"
import { TITLE } from "./fonts.ts"
import { passthrough } from "./anim.ts"

const cR = NEON.red, cC = NEON.cyan

let ALERT: any = null
try { ALERT = GdkPixbuf.Pixbuf.new_from_file(`${CYBER_DIR}/assets/icons/alert.png`) } catch (e) { print("[toast] alert.png:", e) }

type Cfg = { x: number; y: number; w: number; h: number; yaw: number; pitch: number; roll: number; focal: number; dist: number; text: string; col: [number, number, number]; textCol: [number, number, number] }
const DEF: Cfg = { x: -1, y: 70, w: 360, h: 40, yaw: 0, pitch: 0, roll: 0, focal: 2000, dist: 2000, text: "NOTIFICATION TESTING", col: cR, textCol: cC }

let ICON = 30
const GAP = 8, ACW = 9
const A_BLINK = 350, EDGE_HOLD = 1000, OPEN = 300, HOLD = 1700, CLOSE = 230, ENDF = 200
const clamp01 = (v) => Math.max(0, Math.min(1, v))

let cfg: Cfg = { ...DEF }
let plane: any = null, bx = 0
const buildPlane = () => {
 ICON = Math.max(34, Math.round(cfg.h * 1.05))
 plane = makePlane({ w: ICON + GAP + ACW + cfg.w, h: cfg.h, yaw: cfg.yaw, pitch: cfg.pitch, roll: cfg.roll, focal: cfg.focal, dist: cfg.dist, pad: 40 })
 bx = ICON + GAP + ACW
}

const fillPoly = (ctx, pts, col, a) => {
 ctx.newPath(); pts.forEach(([u, v], i) => { const [x, y] = plane.project(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }); ctx.closePath()
 ctx.setSourceRGBA(col[0], col[1], col[2], a); ctx.fill()
}
const strokePoly = (ctx, pts, col, a, w) => strokePath(ctx, plane, pts, col, a, w, true)

const bevelPts = (x, y, w, h, bev): [number, number][] => { bev = Math.min(bev, Math.max(0, w - 1), h * 0.5); return [[x, y], [x + w, y], [x + w, y + h - bev], [x + w - bev, y + h], [x, y + h]] }
const accentPts = (x, y, w, h): [number, number][] => {
 const c = 2, cut = 1, topH = 9, dia = 3, tabW = 3, tabD = 2, tabH = 4
 return [
 [x, y + tabH], [x + w - tabW - tabD, y + tabH], [x + w - tabW, y], [x + w, y],
 [x + w, y + topH], [x + w - cut, y + topH + dia], [x + w - cut, y + h - topH - dia],
 [x + w, y + h - topH], [x + w, y + h], [x + c, y + h], [x, y + h - c],
 ]
}

const drawIcon = (ctx, a) => {
 if (!ALERT) return
 const iy = (cfg.h - ICON) / 2, cu = ICON / 2, cv = iy + ICON / 2
 const pc = plane.project(cu, cv), pr = plane.project(cu + ICON / 2, cv), pb = plane.project(cu, cv + ICON / 2)
 const hw = Math.hypot(pr[0] - pc[0], pr[1] - pc[1]), hh = Math.hypot(pb[0] - pc[0], pb[1] - pc[1])
 const ang = Math.atan2(pr[1] - pc[1], pr[0] - pc[0])
 const pbW = ALERT.get_width(), pbH = ALERT.get_height()
 ctx.save()
 ctx.translate(pc[0], pc[1]); ctx.rotate(ang); ctx.scale((2 * hw) / pbW, (2 * hh) / pbH)
 ctx.setOperator(12)
 Gdk.cairo_set_source_pixbuf(ctx, ALERT, -pbW / 2, -pbH / 2); ctx.paintWithAlpha(0.3 * a)
 ctx.setOperator(2)
 Gdk.cairo_set_source_pixbuf(ctx, ALERT, -pbW / 2, -pbH / 2); ctx.paintWithAlpha(a)
 ctx.restore()
}

const drawAccent = (ctx, a) => {
 const ax = ICON + GAP, y = 1, h = cfg.h - 2
 const [rr, rg, rb] = f(cfg.col)
 ctx.setOperator(12); strokePoly(ctx, accentPts(ax, y, ACW, h), cfg.col, 0.5 * a, 4); ctx.setOperator(2)
 fillPoly(ctx, accentPts(ax, y, ACW, h), [rr, rg, rb], 0.95 * a)
 strokePoly(ctx, accentPts(ax, y, ACW, h), [rr * 0.5, rg * 0.5, rb * 0.5], 0.9 * a, 1.2)
}

const drawBar = (ctx, frac, textA) => {
 const w = Math.max(1, cfg.w * frac), bev = Math.min(13, cfg.h * 0.42)
 const pts = bevelPts(bx, 0, w, cfg.h, bev)
 const [fr, fg, fb] = f(cfg.col)
 fillPoly(ctx, pts, [fr * 0.18, fg * 0.06, fb * 0.06], 0.55)
 ctx.setOperator(12); strokePoly(ctx, pts, cfg.col, 0.14, 4); ctx.setOperator(2)
 strokePoly(ctx, pts, cfg.col, 0.85, 1.4)
 if (frac < 0.992) {
 const hx = bx + w
 ctx.setOperator(12); strokePoly(ctx, [[hx, 1], [hx, cfg.h - 1]], [255, 255, 255] as any, 0.45, 3); ctx.setOperator(2)
 strokePoly(ctx, [[hx, 1], [hx, cfg.h - 1]], cfg.col, 0.95, 1.6)
 }
 if (textA > 0.01) tiltText(ctx, plane, bx + cfg.w / 2, cfg.h / 2 + cfg.h * 0.13, cfg.text, TITLE, cfg.h * 0.4, cfg.textCol, textA, { bold: true, align: "c", glow: 0.3 })
}

let area: any = null, win: any = null
let t0 = 0, anim: any = null, running = false
const toastX = () => cfg.x < 0 ? Math.round((SCREEN_WIDTH - plane.width) / 2) : cfg.x

const draw = (ctx) => {
 if (!running) return
 const e = Date.now() - t0
 const tEdge = A_BLINK, tOpen = tEdge + EDGE_HOLD, tHold = tOpen + OPEN, tClose = tHold + HOLD, tEnd = tClose + CLOSE, tDone = tEnd + ENDF
 ctx.save()
 ctx.translate(toastX(), cfg.y)

 let alertA = 0.3 + 0.7 * Math.abs(Math.sin(e / 90))
 if (e >= tEnd) alertA *= Math.max(0, 1 - (e - tEnd) / ENDF)
 drawIcon(ctx, alertA)

 if (e >= tEdge) {
 let edgeA = 0
 if (e < tEdge + 150) edgeA = (e - tEdge) / 150
 else if (e < tEnd) edgeA = 0.6 + 0.4 * Math.abs(Math.sin(e / 240))
 else edgeA = Math.max(0, 1 - (e - tEnd) / ENDF)
 drawAccent(ctx, edgeA)
 }

 let frac = 0, textA = 0
 if (e >= tOpen && e < tHold) { const p = (e - tOpen) / OPEN; frac = 1 - Math.pow(1 - p, 3); textA = clamp01((p - 0.55) / 0.4) }
 else if (e >= tHold && e < tClose) { frac = 1; textA = 1 }
 else if (e >= tClose && e < tEnd) { const p = (e - tClose) / CLOSE; frac = 1 - p * p * p; textA = clamp01(1 - p * 2) }
 if (frac > 0.005) drawBar(ctx, frac, textA)

 ctx.restore()
 if (e > tDone) { running = false; win.visible = false; if (anim) { anim.cancel(); anim = null } }
}

export const hideToast = () => { running = false; if (win) win.visible = false; if (anim) { anim.cancel(); anim = null } }

export const showToast = (text?: string, opts?: Partial<Cfg>) => {
 cfg = { ...DEF, ...(opts || {}) }
 if (text) cfg.text = text
 buildPlane()
 t0 = Date.now(); running = true; win.visible = true
 if (anim) anim.cancel()
 anim = interval(16, () => area.queue_draw())
}

export const ToastWindow = () => {
 buildPlane()
 area = DrawingArea({}); area.set_size_request(SCREEN_WIDTH, SCREEN_HEIGHT)
 area.connect("draw", (_w, ctx) => { draw(ctx); return false })
 win = Window({
 name: "toast", className: "aug toast",
 anchor: Anchor.TOP | Anchor.BOTTOM | Anchor.LEFT | Anchor.RIGHT,
 layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
 visible: false, child: area,
 })
 passthrough(win)
 return win
}
