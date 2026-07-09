import { Window, DrawingArea, EventBox, activeMonitor, monitorAtPoint } from "../../widget.ts"
import { Anchor, Layer, Exclusivity, Keymode } from "../../widget.ts"
import { interval, timeout, execAsync } from "astal"
import Gdk from "gi://Gdk?version=3.0"
import { SCREEN_WIDTH , SCREEN_HEIGHT } from "../../env.ts"
import { NEON, f } from "./colors.ts"
import { MONO } from "./fonts.ts"
import { CYBER_DIR } from "../../env.ts"
import { setRecording } from "./anim.ts"
import { showToast, hideToast } from "./toast.ts"
import GdkPixbuf from "gi://GdkPixbuf"

const Cairo: any = (imports as any).cairo
const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v) => Math.max(0, Math.min(1, v))
const easeOut = (t) => 1 - (1 - t) * (1 - t)
const [RR, RG, RB] = f(NEON.red)
const [RRR, RRG, RRB] = f(NEON.red)
const [CR, CG, CB] = f(NEON.cyan)   // card-only accent
const F25: [number, number, number] = [242, 91, 86]
let W = SCREEN_WIDTH, H = SCREEN_HEIGHT
let monX = 0, monY = 0

let recIconPix: any = null
try { recIconPix = GdkPixbuf.Pixbuf.new_from_file(`${CYBER_DIR}/assets/icons/record.png`) } catch (e) { print("[region] record.png:", e) }
let alertPix: any = null
try { alertPix = GdkPixbuf.Pixbuf.new_from_file(`${CYBER_DIR}/assets/icons/alert.png`) } catch (e) { print("[region] alert.png:", e) }
// This block is the "region capture" overlay that appears when you hit the hotkey to take a screenshot.
//  It crashes in with a glitchy corruption effect, then lets you drag a rectangle to select a region, 
// then dissolves out. The actual screenshot is taken by the main process after this overlay has 
// finished dissolving.
const INTRO_MS = 460          // crash-in duration
const DISSOLVE_MS = 240
const CARD_DELAY = 140        // card starts shortly after the crash settles
const CARD_DUR = 5200
const GLYPHS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ#%/<>=*"

// compact card and centred, lower-middle at screen
const ICO = 38
const FRW = 220, FRH = 36
const CARD_W = ICO + 10 + FRW
const cardGeom = () => {
 const cx = Math.round((W - CARD_W) / 2)
 const cy = Math.round(H * 0.72)
 return { cx, cy, frx: cx + ICO + 10, fry: cy }
}

// state
let rWin = null, rArea = null
let recordMode = false
let active = false, dragging = false, draggable = false
let phase: "intro" | "select" | "dissolve" = "intro"
let startT = 0, loopT = null
let curX = 0, curY = 0, sx = 0, sy = 0, ex = 0, ey = 0
let corruptSurf: any = null   
let settled = false
let dissolveStart = 0

const coords = (e) => {
 try { const c = e.get_coords?.(); if (c && c.length >= 3) return [c[1], c[2]] } catch {}
 try { return [e.x, e.y] } catch {}
 return [0, 0]
}
const sel = () => [Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy)]

let vigSurf: any = null
const buildVignette = () => {
 const sw = Math.max(2, Math.floor(W / 4)), sh = Math.max(2, Math.floor(H / 4))
 vigSurf = new Cairo.ImageSurface(Cairo.Format.ARGB32, sw, sh)
 const c2 = new Cairo.Context(vigSurf)
 const vcx = sw / 2, vcy = sh / 2, reach = Math.hypot(sw, sh) / 2
 const g = new Cairo.RadialGradient(vcx, vcy, reach * 0.16, vcx, vcy, reach * 0.98)
 g.addColorStopRGBA(0.0, 0.02, 0.0, 0.01, 0.5)
 g.addColorStopRGBA(0.5, 0.06, 0.0, 0.01, 0.72)
 g.addColorStopRGBA(1.0, 0.19, 0.0, 0.03, 0.97)
 c2.setSource(g); c2.rectangle(0, 0, sw, sh); c2.fill(); vigSurf.flush()
}
const drawVignette = (ctx, a) => {
 if (!vigSurf || a <= 0.01) return
 ctx.save(); ctx.scale(W / vigSurf.getWidth(), H / vigSurf.getHeight())
 ctx.setSourceSurface(vigSurf, 0, 0)
 try { ctx.getSource().setFilter(Cairo.Filter.BILINEAR) } catch {}
 ctx.paintWithAlpha(a); ctx.restore()
}

const easeC = (t) => 1 - Math.pow(1 - clamp(t), 3)
const strokePartial = (ctx, pts, prog) => {
 if (prog <= 0) return
 const segs: number[] = []; let total = 0
 for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); total += d }
 let target = total * Math.min(1, prog)
 ctx.newPath(); ctx.moveTo(pts[0][0], pts[0][1])
 for (let i = 1; i < pts.length && target > 0; i++) {
     const d = segs[i - 1]
     if (d <= target) { ctx.lineTo(pts[i][0], pts[i][1]); target -= d }
     else { const r = target / d; ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r); target = 0 }
 }
 ctx.stroke()
}
const triShape = (ctx, x, y, size, up) => {
 ctx.newPath()
 if (up) { ctx.moveTo(x, y - size); ctx.lineTo(x - size * 0.9, y + size * 0.7); ctx.lineTo(x + size * 0.9, y + size * 0.7) }
 else { ctx.moveTo(x, y + size); ctx.lineTo(x - size * 0.9, y - size * 0.7); ctx.lineTo(x + size * 0.9, y - size * 0.7) }
 ctx.closePath(); ctx.fill()
}
const TAU = Math.PI * 2
const seg = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)))
const gstroke = (ctx, col, a, w) => {
 ctx.setOperator(12); ctx.setSourceRGBA(col[0], col[1], col[2], 0.3 * a); ctx.setLineWidth(w + 3); ctx.strokePreserve(); ctx.setOperator(2)
 ctx.setSourceRGBA(col[0], col[1], col[2], a); ctx.setLineWidth(w); ctx.stroke()
}
const CYC: [number, number, number] = [CR, CG, CB]
const REDC: [number, number, number] = [RRR, RRG, RRB]

// the middle reticle: just a 3-line crosshair (two diagonals up-left/up-right, one stem down,
// a centre dot), all spaced off centre, with a gentle continuous breathe -- kept smooth.
const drawCrosshair = (ctx, rev, col) => {
 const cx = W / 2, cy = H / 2
 const ci = easeOut(clamp(rev))
 if (ci <= 0.01) return
 const breathe = 0.5 + 0.5 * Math.sin(Date.now() / 1000 * 1.8)
 const gap = 9 + breathe * 2.5, dlen = 18 * ci, vlen = 20 * ci, a = (0.72 + 0.22 * breathe) * ci
 const vgap = gap * Math.SQRT2   // the diagonals start gap*√2 from centre; match the stem to it so all 3 are equidistant
 ctx.setLineCap(1)
 ctx.newPath()
 ctx.moveTo(cx - gap, cy - gap); ctx.lineTo(cx - gap - dlen, cy - gap - dlen)
 ctx.moveTo(cx + gap, cy - gap); ctx.lineTo(cx + gap + dlen, cy - gap - dlen)
 ctx.moveTo(cx, cy + vgap); ctx.lineTo(cx, cy + vgap + vlen)
 gstroke(ctx, col, a, 2)
 ctx.setSourceRGBA(col[0], col[1], col[2], a); ctx.newPath(); ctx.arc(cx, cy, 2, 0, TAU); ctx.fill()
}

const drawHud = (ctx, rev) => {
 const cal = clamp(rev / 0.9)
 if (cal <= 0.01) return
 drawCrosshair(ctx, cal, recordMode ? REDC : CYC)
}

// thin full-screen lines tracing the cursor position (the "scanner" position readout)
const drawTrace = (ctx) => {
 const col = recordMode ? REDC : CYC
 ctx.setSourceRGBA(col[0], col[1], col[2], 0.16); ctx.setLineWidth(1)
 ctx.newPath(); ctx.moveTo(0, curY + 0.5); ctx.lineTo(W, curY + 0.5); ctx.stroke()
 ctx.newPath(); ctx.moveTo(curX + 0.5, 0); ctx.lineTo(curX + 0.5, H); ctx.stroke()
}

// screen-corner brackets — "intercept active" frame
const cornerTicks = (ctx) => {
 ctx.setSourceRGBA(RRR, RRG, RRB, 0.55); ctx.setLineWidth(2)
 const L = 26, m = 18
 for (const [px, py, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
     ctx.moveTo(px, py); ctx.lineTo(px + L * dx, py); ctx.stroke()
     ctx.moveTo(px, py); ctx.lineTo(px, py + L * dy); ctx.stroke()
 }
}

const glitchType = (ctx, x, y, full, prog, size, alpha, bold = 1, col = [RR, RG, RB], font = MONO) => {
 if (prog <= 0) return
 ctx.selectFontFace(font, 0, bold); ctx.setFontSize(size)
 const adv = ctx.textExtents("M").width
 const n = full.length, shown = prog * n
 for (let i = 0; i < n; i++) {
     let ch = full[i]
     if (ch === " ") continue
     if (i >= shown) { if (i < shown + 1.6) ch = GLYPHS[(Math.random() * GLYPHS.length) | 0]; else continue }
     else if (Math.random() < 0.035) ch = GLYPHS[(Math.random() * GLYPHS.length) | 0]
     const head = i >= shown - 1 && i < shown + 1.6
     const cxp = x + i * adv, jx = head ? rnd(-1, 1) : 0
     // lightened tint of the passed colour as the offset ghost
     ctx.setSourceRGBA(Math.min(1, col[0] + 0.5), Math.min(1, col[1] + 0.4), Math.min(1, col[2] + 0.4), alpha * 0.4); ctx.moveTo(cxp - 1.5 + jx, y); ctx.showText(ch)
     ctx.setSourceRGBA(head ? Math.min(1, col[0] * 1.4) : col[0], head ? Math.min(1, col[1] * 1.4) : col[1], head ? Math.min(1, col[2] * 1.4) : col[2], alpha); ctx.moveTo(cxp + jx, y); ctx.showText(ch)
 }
}

// the icons for the RECORDING hud thingy, same overlay as when hacking cameras in the game
const drawRecIcon = (ctx, x, y, sz, a, pulse) => {
 if (a <= 0 || !recIconPix) return
 const iw = recIconPix.get_width(), ih = recIconPix.get_height()
 const scale = sz / Math.max(iw, ih)
 const dw = Math.round(iw * scale), dh = Math.round(ih * scale)
 const dx = x + Math.round((sz - dw) / 2), dy = y + Math.round((sz - dh) / 2)
 ctx.save()
 ctx.setOperator(12)
 for (let g = 3; g >= 1; g--) {
     ctx.setSourceRGBA(CR, CG, CB, 0.04 * a * (0.7 + 0.3 * pulse) / g)
     ctx.rectangle(dx - g * 3, dy - g * 3, dw + g * 6, dh + g * 6); ctx.fill()
 }
 ctx.setOperator(2) // SOURCE — paint transparent png directly
 const scaled = recIconPix.scale_simple(dw, dh, GdkPixbuf.InterpType.BILINEAR)
 Gdk.cairo_set_source_pixbuf(ctx, scaled, dx, dy)
 ctx.paintWithAlpha(a)
 ctx.restore()
}

//the beleved card: animated CP2077 cut-frame with red glow, draws in then holds → unloads
const drawCard = (ctx, cp) => {
 const { cx: CX, cy: CY, frx: FRX, fry: FRY } = cardGeom()
 const load = cp < 0.10 ? cp / 0.10 : cp < 0.82 ? 1 : clamp(1 - (cp - 0.82) / 0.18)
 if (load <= 0.001) return
 const contentFrac = Math.min(1, Math.max(0, (cp - 0.10) / 0.08))
 const bev = 11, ax = FRX - 9
 const accent = (): [number, number][] => { const ac = 2, cut = 1, topH = 9, dia = 3, tabW = 3, tabD = 2, tabH = 4, x = ax, y = FRY + 1, w = 9, h = FRH - 2; return [[x, y + tabH], [x + w - tabW - tabD, y + tabH], [x + w - tabW, y], [x + w, y], [x + w, y + topH], [x + w - cut, y + topH + dia], [x + w - cut, y + h - topH - dia], [x + w, y + h - topH], [x + w, y + h], [x + ac, y + h], [x, y + h - ac]] }
 const bevel = (): [number, number][] => [[FRX, FRY], [FRX + FRW, FRY], [FRX + FRW, FRY + FRH - bev], [FRX + FRW - bev, FRY + FRH], [FRX, FRY + FRH]]
 const trace = (pts) => { ctx.newPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath() }

 ctx.save()
 trace(bevel()); ctx.setSourceRGBA(0.16, 0.015, 0.025, 0.55 * load); ctx.fill()
 ctx.setOperator(12); trace(bevel()); ctx.setSourceRGBA(RR, RG, RB, 0.12 * load); ctx.setLineWidth(4); ctx.stroke(); ctx.setOperator(2)
 trace(bevel()); ctx.setSourceRGBA(RR, RG, RB, 0.85 * load); ctx.setLineWidth(1.4); ctx.stroke()

 const blink = 0.6 + 0.4 * Math.abs(Math.sin(cp * 30))
 ctx.setOperator(12); trace(accent()); ctx.setSourceRGBA(RR, RG, RB, 0.4 * load * blink); ctx.setLineWidth(4); ctx.stroke(); ctx.setOperator(2)
 trace(accent()); ctx.setSourceRGBA(RR, RG, RB, 0.95 * load * blink); ctx.fill()
 trace(accent()); ctx.setSourceRGBA(RR * 0.5, RG * 0.5, RB * 0.5, 0.9 * load); ctx.setLineWidth(1.2); ctx.stroke()

 if (contentFrac > 0) {
     const cA = contentFrac * load
     drawAlertIcon(ctx, CX, CY + (FRH - ICO) / 2, ICO, cA)
     glitchType(ctx, FRX + 17, FRY + 21, recordMode ? "SELECT A REGION TO RECORD" : "SELECT A REGION TO CAPTURE", cA, 10, 0.97, 1, [CR, CG, CB])
     if (cA > 0.55) {
         const ma = (cA - 0.55) / 0.45, my = FRY + FRH + 8
         ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(7); ctx.setSourceRGBA(RR, RG, RB, 0.55 * ma)
         ctx.moveTo(FRX + 2, my); ctx.showText(recordMode ? "NETWATCH   // FEED INTERCEPT" : "NETWATCH   // SIGNAL INTERCEPT")
         ctx.moveTo(FRX + 2, my + 9); ctx.showText(recordMode ? "OUTPUT     // ~/VIDEOS/RECORDINGS" : "OUTPUT     // ~/PICTURES/SCREENSHOTS")
         ctx.moveTo(FRX + 2, my + 18); ctx.showText("STATUS     // AWAITING INPUT")
     }
 }

 ctx.restore()
}

const drawSelChrome = (ctx, X, Y, W2, H2) => {
 ctx.setSourceRGBA(RRR, RRG, RRB, 0.95); ctx.setLineWidth(1.5)
 ctx.rectangle(X, Y, W2, H2); ctx.stroke()
 const L = 22; ctx.setLineWidth(2.5)
 for (const [px, py, dx, dy] of [[X, Y, 1, 1], [X + W2, Y, -1, 1], [X, Y + H2, 1, -1], [X + W2, Y + H2, -1, -1]]) {
     ctx.moveTo(px, py); ctx.lineTo(px + L * dx, py); ctx.stroke()
     ctx.moveTo(px, py); ctx.lineTo(px, py + L * dy); ctx.stroke()
 }
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(13)
 const dim = `${Math.round(W2)} × ${Math.round(H2)}`
 const dimW = ctx.textExtents(dim).width
 const dX = X + W2 / 2 - dimW / 2 - 6, dY = Y + H2 + 8
 ctx.setSourceRGBA(0, 0, 0, 0.65); ctx.rectangle(dX, dY, dimW + 12, 20); ctx.fill()
 ctx.setSourceRGBA(RRR, RRG, RRB, 0.5); ctx.setLineWidth(0.8); ctx.rectangle(dX, dY, dimW + 12, 20); ctx.stroke()
 ctx.setSourceRGBA(RRR, RRG, RRB, 1); ctx.moveTo(dX + 6, dY + 15); ctx.showText(dim)
}

const drawAlertIcon = (ctx, x, y, sz, a) => {
 if (a <= 0 || !alertPix) return // should get the alert.png from assets or return if not found
 const iw = alertPix.get_width(), ih = alertPix.get_height() 
 const scale = sz / Math.max(iw, ih) 
 const dw = Math.round(iw * scale), dh = Math.round(ih * scale)
 const dx = x + Math.round((sz - dw) / 2), dy = y + Math.round((sz - dh) / 2)
 ctx.save()
 const sc = alertPix.scale_simple(dw, dh, GdkPixbuf.InterpType.BILINEAR)
 Gdk.cairo_set_source_pixbuf(ctx, sc, dx, dy)
 ctx.paintWithAlpha(a)
 ctx.restore()
}

const drawInterceptBanner = (ctx, k) => {
 if (k <= 0.02) return
 if (Math.random() < 0.16) return        // light flicker
 const txt = "SIGNAL INTERCEPT"
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(22)
 const tw = ctx.textExtents(txt).width
 const ICON = 46, GAP = 14, DIVGAP = 14
 const totalW = ICON + GAP + 3 + DIVGAP + tw
 const x0 = (W - totalW) / 2 + rnd(-2, 2) * k, yC = H * 0.42
 const ix = x0, iy = yC - ICON / 2

 drawAlertIcon(ctx, ix, iy, ICON, Math.min(1, k + 0.3))

 // vertical divider bar 
 const divX = x0 + ICON + GAP
 ctx.setSourceRGBA(0.659, 0.243, 0.212, 0.9); ctx.rectangle(divX, yC - 16, 2.6, 32); ctx.fill()
 // text 
 const tx = divX + 3 + DIVGAP, ty = yC + 8
 ctx.setSourceRGBA(1, 0.72, 0.76, 0.35); ctx.moveTo(tx - 1.5, ty); ctx.showText(txt)
 ctx.setSourceRGBA(0.659, 0.243, 0.212, 1.0); ctx.moveTo(tx, ty); ctx.showText(txt)
}

const draw = (ctx) => {
 if (!active) return
 ctx.setOperator(0); ctx.paint(); ctx.setOperator(2)
 const now = Date.now()

 if (phase === "dissolve") {
     const t = clamp((now - dissolveStart) / DISSOLVE_MS)
     drawVignette(ctx, 1 - t)
     drawHud(ctx, 1 - t)
     return
 }

 if (!settled) {
     const p = clamp((now - startT) / INTRO_MS)
     drawVignette(ctx, easeOut(Math.min(1, p * 1.3)))
     drawHud(ctx, p)
     return
 }

 drawVignette(ctx, 1)
 cornerTicks(ctx)

 const [selX, selY, selW, selH] = sel()
 const hasSel = (dragging || (selW > 4 && selH > 4)) && selW > 2 && selH > 2
 drawHud(ctx, 1)
 if (hasSel) {
     ctx.setOperator(0); ctx.rectangle(selX, selY, selW, selH); ctx.fill(); ctx.setOperator(2)
     ctx.setSourceRGBA(RRR, RRG, RRB, 0.28); ctx.setLineWidth(1)
     ctx.rectangle(selX + 0.5, selY + 0.5, selW - 1, selH - 1); ctx.stroke()
 }

 if (hasSel) drawSelChrome(ctx, selX, selY, selW, selH)

 drawTrace(ctx)
}

const stopLoop = () => { if (loopT) { loopT.cancel(); loopT = null } }

const tick = () => {
 const now = Date.now()
 if (!settled && (now - startT) >= INTRO_MS) { settled = true; draggable = true }
 rArea.queue_draw()   // keep redrawing — the glitch is animated the whole time the selector is open
}
const ensureLoop = () => { if (!loopT) loopT = interval(16, tick) }

const beginDissolve = (after?) => {
 phase = "dissolve"; dissolveStart = Date.now(); stopLoop()
 loopT = interval(33, () => {
     const t = clamp((Date.now() - dissolveStart) / DISSOLVE_MS)
     rArea.queue_draw()
     if (t >= 1) { stopLoop(); active = false; rWin.visible = false; corruptSurf = null; if (after) after() }
 })
}

const finish = () => {
 const [x, y, w, h] = sel()
 draggable = false; dragging = false
 if (w < 6 || h < 6) { beginDissolve(); return }
 stopLoop(); active = false; rWin.visible = false; corruptSurf = null; phase = "select"; hideToast()
 const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h)
 const geom = `${monX + rx},${monY + ry} ${rw}x${rh}`
 if (recordMode) {
     const AUDIO = `${CYBER_DIR}/assets/audio`
     timeout(60, () => {
         execAsync(["sh", "-c",
             `D="$HOME/Videos/Recordings"; mkdir -p "$D"; F="$D/$(date +%Y-%m-%d_%H-%M-%S).mp4"; ` +
             `setsid wf-recorder -g "${geom}" -f "$F" -p preset=ultrafast -p crf=28 >/dev/null 2>&1 & ` +
             `setsid -f sh -c 'play -q -v 1.5 "${AUDIO}/active.ogg" 2>/dev/null || mpv --no-video --really-quiet --volume=150 "${AUDIO}/active.ogg" 2>/dev/null' >/dev/null 2>&1`])
         .catch(print)
         try { setRecording(true, `${monX} ${monY} ${W} ${H}`, { x: rx, y: ry, w: rw, h: rh }) } catch (e) { print(e) }
     })
     return
 }
 timeout(60, () => {
     execAsync(["sh", "-c",
         `D="$HOME/Pictures/Screenshots"; mkdir -p "$D"; F="$D/$(date +%Y-%m-%d_%H-%M-%S).png"; ` +
         `grim -g "${geom}" "$F" && wl-copy < "$F" && ` +
         `(command -v notify-send >/dev/null && notify-send -t 2500 "Screenshot" "Saved to ~/Pictures/Screenshots & copied" -i "$F" || true)`])
     .catch(print)
 })
}
const cancel = () => { beginDissolve() }

const monitorPayload = (payload = "") => {
 const p = payload.trim().split(/\s+/).map(Number)
 if (p.length >= 4 && p.every(Number.isFinite)) return { x: p[0], y: p[1], w: p[2], h: p[3] }
 try {
     const m = activeMonitor()
     const g = m?.get_geometry?.()
     if (g) return { x: g.x, y: g.y, w: g.width, h: g.height }
 } catch {}
 return { x: 0, y: 0, w: SCREEN_WIDTH, h: SCREEN_HEIGHT }
}

export const triggerRecordRegion = (payload = "") => { recordMode = true; triggerRegion(payload, true) }

export const triggerRegion = (payload = "", record = false) => {
 recordMode = record
 const m = monitorPayload(payload)
 monX = m.x; monY = m.y; W = m.w; H = m.h
 try { (rWin as any).gdkmonitor = monitorAtPoint(monX + 1, monY + 1) || activeMonitor() } catch {}
 try { rArea.set_size_request(W, H) } catch {}
 active = true; dragging = false; draggable = false; phase = "intro"
 settled = false; sx = sy = ex = ey = 0
 buildVignette()
 startT = Date.now()
 rWin.visible = true
 stopLoop(); ensureLoop()
 showToast(record ? "SELECT A REGION TO RECORD" : "SELECT A REGION TO CAPTURE", { x: -1, y: 34, w: 540, h: 56, col: F25, textCol: F25 })
}

export const RegionWindow = () => {
 rArea = DrawingArea({})
 rArea.set_size_request(W, H)
 rArea.connect("draw", (_w, ctx) => (draw(ctx), false))

 const evt = EventBox({ child: rArea })
 try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.POINTER_MOTION_MASK) } catch {}
 evt.connect("button-press-event", (_w, e) => {
     if (!draggable) return true
     const [x, y] = coords(e); sx = ex = curX = x; sy = ey = curY = y; dragging = true
     ensureLoop(); rArea.queue_draw(); return true
 })
 evt.connect("motion-notify-event", (_w, e) => {
     const [x, y] = coords(e); curX = x; curY = y
     if (dragging) { ex = x; ey = y }
     if (draggable) rArea.queue_draw(); return true
 })
 evt.connect("button-release-event", (_w, e) => {
     if (!draggable) return true
     const [x, y] = coords(e); ex = x; ey = y; finish(); return true
 })

 rWin = Window({
     name: "region", className: "aug region",
     anchor: Anchor.TOP | Anchor.BOTTOM | Anchor.LEFT | Anchor.RIGHT,
     layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE, keymode: Keymode.EXCLUSIVE,
     visible: false, child: evt,
 })
 rWin.connect("key-press-event", (_w, e) => {
     let k = 0; try { const r = e.get_keyval?.(); k = r ? r[1] : e.keyval } catch { k = e.keyval }
     if (k === Gdk.KEY_Escape) cancel()
     return true
 })
 return rWin
}
