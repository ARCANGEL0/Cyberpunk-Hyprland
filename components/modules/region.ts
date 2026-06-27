import { Window, DrawingArea, EventBox, activeMonitor, monitorAtPoint } from "../../widget.ts"
import { Anchor, Layer, Exclusivity, Keymode } from "../../widget.ts"
import { interval, timeout, execAsync } from "astal"
import Gdk from "gi://Gdk?version=3.0"
import { SCREEN_WIDTH , SCREEN_HEIGHT } from "../../env.ts"
import { NEON, f } from "./colors.ts"
import { CYBER_DIR } from "../../env.ts"
import GdkPixbuf from "gi://GdkPixbuf"

const Cairo: any = (imports as any).cairo
const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v) => Math.max(0, Math.min(1, v))
const easeOut = (t) => 1 - (1 - t) * (1 - t)
const [RR, RG, RB] = f(NEON.red)
const [RRR, RRG, RRB] = f(NEON.red)
const [CR, CG, CB] = f(NEON.cyan)   // card-only accent
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

// base tint surface with scanlines, drawn once at the start of the crash-in and then
// reused for the rest of the overlay's life
const buildCorruptSurf = () => {
 corruptSurf = new Cairo.ImageSurface(Cairo.Format.ARGB32, W, H)
 const c = new Cairo.Context(corruptSurf)
 c.setSourceRGBA(0.10, 0.012, 0.02, 0.71); c.rectangle(0, 0, W, H); c.fill()   // dark red tint (~30% see-through)
 c.setSourceRGBA(0, 0, 0, 0.17); for (let y = 0; y < H; y += 3) c.rectangle(0, y, W, 1); c.fill()   // scanlines
 corruptSurf.flush()
}

// dynamic glitches effect 
const drawGlitch = (ctx, k) => {
 if (k <= 0.01) return
 const n = Math.round(4 + k * 16)
 for (let i = 0; i < n; i++) {
     const y = rnd(0, H), bh = rnd(1, 4 + k * 18)
     ctx.setSourceRGBA(RRR, RRG, RRB, rnd(0.05, 0.32) * k); ctx.rectangle(0, y, W, bh); ctx.fill()
     if (Math.random() < 0.25 * k) { ctx.setSourceRGBA(1, 0.82, 0.86, 0.45 * k); ctx.rectangle(rnd(0, W * 0.5), y, rnd(40, W * 0.6), 1); ctx.fill() }
 }
 const nb = Math.round(k * 7)
 for (let i = 0; i < nb; i++) {
     const bx = rnd(0, W), by = rnd(0, H), bw = rnd(60, 380), bhh = rnd(20, 130)
     ctx.setSourceRGBA(0.7, 0.02, 0.06, rnd(0.06, 0.2) * k); ctx.rectangle(bx, by, bw, bhh); ctx.fill()
     ctx.setSourceRGBA(1, 0.2, 0.26, 0.4 * k); ctx.rectangle(bx, by, 2, bhh); ctx.fill()
 }
 // red-channel split ghost bars 
 if (Math.random() < 0.7 * k) {
     const y = rnd(0, H), bh = rnd(6, 32)
     ctx.setOperator(12) // ADD
     ctx.setSourceRGBA(RRR, RRG, RRB, 0.28 * k); ctx.rectangle(-7, y, W, bh); ctx.fill()
     ctx.setSourceRGBA(1, 0.55, 0.6, 0.16 * k); ctx.rectangle(7, y, W, bh); ctx.fill()
     ctx.setOperator(2)
 }
 // full-frame flash
 if (Math.random() < 0.09 * k) { ctx.setSourceRGBA(1, 0.22, 0.28, 0.1 * k); ctx.rectangle(0, 0, W, H); ctx.fill() }
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

const glitchType = (ctx, x, y, full, prog, size, alpha, bold = 1, col = [RR, RG, RB], font = "JetBrains Mono") => {
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
 const RR = CR, RG = CG, RB = CB   // base color for the card 
 const load = cp < 0.10 ? cp / 0.10 : cp < 0.82 ? 1 : clamp(1 - (cp - 0.82) / 0.18)
 if (load <= 0.001) return
 const pulse = 0.5 + 0.5 * Math.sin(cp * 26)
 const c = 10  // chamfer size

 const card = () => { // heres the geometry of it
     ctx.newPath()
     ctx.moveTo(FRX + c, FRY)
     ctx.lineTo(FRX + FRW, FRY)
     ctx.lineTo(FRX + FRW, FRY + FRH - c)
     ctx.lineTo(FRX + FRW - c, FRY + FRH)
     ctx.lineTo(FRX, FRY + FRH)
     ctx.lineTo(FRX, FRY + c)
     ctx.closePath()
 }

 const lineFrac = Math.min(1, cp / 0.06)
 const closeFrac = Math.min(1, Math.max(0, (cp - 0.06) / 0.06))
 const contentFrac = Math.min(1, Math.max(0, (cp - 0.10) / 0.08))

 ctx.save()
 const lw = 1.8
 ctx.setSourceRGBA(RR, RG, RB, 0.95 * load)
 ctx.setLineWidth(lw); ctx.setLineCap(1)

 const topDraw = (FRW - c) * lineFrac
 ctx.newPath(); ctx.moveTo(FRX + c, FRY); ctx.lineTo(FRX + c + topDraw, FRY); ctx.stroke()
 const botDraw = (FRW - c) * lineFrac
 ctx.newPath(); ctx.moveTo(FRX + FRW - c, FRY + FRH); ctx.lineTo(FRX + FRW - c - botDraw, FRY + FRH); ctx.stroke()

 if (closeFrac > 0) {
     const rvLen = (FRH - c) * closeFrac
     ctx.newPath(); ctx.moveTo(FRX + FRW, FRY); ctx.lineTo(FRX + FRW, FRY + rvLen); ctx.stroke()
     const lvLen = (FRH - c) * closeFrac
     ctx.newPath(); ctx.moveTo(FRX, FRY + FRH); ctx.lineTo(FRX, FRY + FRH - lvLen); ctx.stroke()
     if (closeFrac > 0.3) {
         const cf = Math.min(1, (closeFrac - 0.3) / 0.7)
         ctx.newPath(); ctx.moveTo(FRX, FRY + c - c * cf); ctx.lineTo(FRX + c * cf, FRY); ctx.stroke()
         ctx.newPath(); ctx.moveTo(FRX + FRW - c * cf, FRY + FRH); ctx.lineTo(FRX + FRW, FRY + FRH - c + c * cf); ctx.stroke()
     }
 }

 ctx.setOperator(12) // add glow
 ctx.setSourceRGBA(RR, RG, RB, 0.07 * load)
 ctx.setLineWidth(lw * 5); ctx.setLineCap(1)
 card(); ctx.stroke()
 ctx.setOperator(2)

 if (closeFrac > 0.6) {
     const fillA = Math.min(1, (closeFrac - 0.6) / 0.4) * load
     ctx.setSourceRGBA(0.01, 0.04, 0.05, 0.82 * fillA)
     card(); ctx.fill()
     ctx.setSourceRGBA(RR, RG, RB, 0.9 * fillA)
     ctx.rectangle(FRX + 4, FRY + 5, 2, FRH - 10); ctx.fill()
 }

 if (contentFrac > 0) {
     const cA = contentFrac * load
     drawRecIcon(ctx, CX, CY + (FRH - ICO) / 2, ICO, cA, pulse)
     glitchType(ctx, FRX + 17, FRY + 21, "SELECT A REGION TO CAPTURE", cA, 10, 0.97, 1, [RR, RG, RB])
     if (cA > 0.55) {
         const ma = (cA - 0.55) / 0.45, my = FRY + FRH + 8
         ctx.selectFontFace("JetBrains Mono", 0, 0); ctx.setFontSize(7); ctx.setSourceRGBA(RR, RG, RB, 0.55 * ma)
         ctx.moveTo(FRX + 2, my); ctx.showText("NETWATCH   // SIGNAL INTERCEPT")
         ctx.moveTo(FRX + 2, my + 9); ctx.showText("OUTPUT     // ~/PICTURES/SCREENSHOTS")
         ctx.moveTo(FRX + 2, my + 18); ctx.showText("STATUS     // AWAITING INPUT")
     }
     if (cp > 0.12 && cp < 0.22 && Math.floor((cp - 0.12) * 90) % 2 === 0) {
         ctx.setSourceRGBA(0.8, 0.97, 1, 0.12 * cA)
         card(); ctx.fill()
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
 ctx.selectFontFace("JetBrains Mono", 0, 1); ctx.setFontSize(13)
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
 ctx.selectFontFace("JetBrains Mono", 0, 1); ctx.setFontSize(22)
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

 if (phase === "dissolve") {                                  // glitch-out
     const t = clamp((now - dissolveStart) / DISSOLVE_MS)
     if (corruptSurf && t < 1) { ctx.setSourceSurface(corruptSurf, 0, 0); ctx.paintWithAlpha(1 - t) }
     drawGlitch(ctx, (1 - t) * 0.9)
     return
 }

 if (!settled) {                                              //intro animation
     const p = clamp((now - startT) / INTRO_MS)
     if (corruptSurf) { ctx.setSourceSurface(corruptSurf, 0, 0); ctx.paintWithAlpha(easeOut(Math.min(1, p * 1.3))) }
     drawGlitch(ctx, Math.pow(1 - p, 0.6) * 0.95 + 0.1)
     drawInterceptBanner(ctx, 1 - p)
     return
 }

 // selection phase 
 if (corruptSurf) { ctx.setSourceSurface(corruptSurf, 0, 0); ctx.paint() }
 drawGlitch(ctx, 0.36)   
 cornerTicks(ctx)

 const [selX, selY, selW, selH] = sel()
 const hasSel = (dragging || (selW > 4 && selH > 4)) && selW > 2 && selH > 2
 if (hasSel) {
     ctx.setOperator(0); ctx.rectangle(selX, selY, selW, selH); ctx.fill(); ctx.setOperator(2)
     ctx.setSourceRGBA(RRR, RRG, RRB, 0.28); ctx.setLineWidth(1)
     ctx.rectangle(selX + 0.5, selY + 0.5, selW - 1, selH - 1); ctx.stroke()
 }

 const cp = (now - startT - INTRO_MS - CARD_DELAY) / CARD_DUR
 if (cp >= 0 && cp < 1) drawCard(ctx, cp)
 if (hasSel) drawSelChrome(ctx, selX, selY, selW, selH)

 // crosshair
 ctx.setSourceRGBA(RRR, RRG, RRB, 0.2); ctx.setLineWidth(1)
 ctx.moveTo(0, curY + 0.5); ctx.lineTo(W, curY + 0.5); ctx.stroke()
 ctx.moveTo(curX + 0.5, 0); ctx.lineTo(curX + 0.5, H); ctx.stroke()
}

const stopLoop = () => { if (loopT) { loopT.cancel(); loopT = null } }

const tick = () => {
 const now = Date.now()
 if (!settled && (now - startT) >= INTRO_MS) { settled = true; draggable = true }
 rArea.queue_draw()   // keep redrawing — the glitch is animated the whole time the selector is open
}
const ensureLoop = () => { if (!loopT) loopT = interval(45, tick) }

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
 stopLoop(); active = false; rWin.visible = false; corruptSurf = null; phase = "select"
 const geom = `${monX + Math.round(x)},${monY + Math.round(y)} ${Math.round(w)}x${Math.round(h)}`
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

export const triggerRegion = (payload = "") => {
 const m = monitorPayload(payload)
 monX = m.x; monY = m.y; W = m.w; H = m.h
 try { (rWin as any).gdkmonitor = monitorAtPoint(monX + 1, monY + 1) || activeMonitor() } catch {}
 try { rArea.set_size_request(W, H) } catch {}
 active = true; dragging = false; draggable = false; phase = "intro"
 settled = false; sx = sy = ex = ey = 0
 buildCorruptSurf()
 startT = Date.now()
 rWin.visible = true
 stopLoop(); ensureLoop()
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
