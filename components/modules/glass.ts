// this is the shared toolkit for the "cyber glass" look -- the angular cyan glass panel,
// the text drawing, and that glitchy "decode" open animation.

import Gdk from "gi://Gdk?version=3.0"
import Pango from "gi://Pango?version=1.0"
import PangoCairo from "gi://PangoCairo?version=1.0"
import { NEON, f } from "./colors.ts"
import { makePlane, Plane } from "./proj.ts"

export const Cairo: any = (imports as any).cairo
import { TITLE, MONO, ICONF } from "./fonts.ts"
export { TITLE, MONO, ICONF }
export const [RR, RG, RB] = f(NEON.cyan)            // the main cyan everything is tinted with
export const [CR, CG, CB] = f([196, 248, 255])      // a brighter near-white cyan for accents/highlights
export const CYAN: [number, number, number] = [RR, RG, RB]
export const ACC: [number, number, number] = [CR, CG, CB]
export const RED: [number, number, number] = f(NEON.red) as any            // the weather modal stays red
export const RACC: [number, number, number] = [1, 0.42, 0.46]              // brighter red accent to match it
export const ch = (c: number) => String.fromCharCode(c)

// the modals live dead centre of the screen, so unlike the corner HUD i don't want any
// fisheye/tilt on them -- this builds a "flat" plane  where focal == dist thus no perspective.
export const makeModalPlane = (W: number, H: number): Plane =>
    makePlane({ w: W, h: H, yaw: 0, pitch: 0, roll: 0, focal: 1000, dist: 1000, pad: 30 })

// this traces the actual panel outline -- the angular cyberpunk frame shape. thath as several chamfered edges and notchs on the top right edges and
// stuff, like an assymetric lateral cut
export const HEADER = 36                     // how tall the title band at the top is
export const panelPath = (ctx, x, y, w, h) => {
    const ny = Math.round(h * 0.42), ndep = 7, ncut = 9, brc = 26, tlc = 8   // tlc = size of the tiny top-left bevel
    const pts = [
        [x + tlc, y],                        // start just past the small top-left bevel
        [x + w, y],                          // straight across to the square top-right corner
        [x + w, y + ny],                     // down the right edge
        [x + w - ndep, y + ny + ncut],       // bite the chamfer notch inward
        [x + w - ndep, y + h - brc],         // continue down the now-inset right edge
        [x + w - ndep - brc, y + h],         // cut the big diagonal bottom-right bevel
        [x, y + h],                          // back across the bottom
        [x, y + tlc],                        // up the left edge to where the top-left bevel starts
    ]
    ctx.newPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath()
    return pts
}

export const drawGlass = (ctx, x, y, w, h, col: [number, number, number] = CYAN) => {
    const [r, g, b] = col
    panelPath(ctx, x, y, w, h)
    const gb = new Cairo.LinearGradient(x, y, x + w * 0.5, y + h)
    gb.addColorStopRGBA(0, r * 0.14, g * 0.14 + 0.06, b * 0.18 + 0.02, 0.93)
    gb.addColorStopRGBA(0.5, r * 0.02 + 0.004, g * 0.04 + 0.02, b * 0.06 + 0.03, 0.9)
    gb.addColorStopRGBA(1, r * 0.04, g * 0.06 + 0.03, b * 0.1 + 0.03, 0.94)
    ctx.setSource(gb); ctx.fill()
    ctx.save(); panelPath(ctx, x, y, w, h); ctx.clip()
    const gs = new Cairo.LinearGradient(x, y, x + w * 0.65, y + h * 0.55)
    gs.addColorStopRGBA(0, 0.8, 0.97, 1, 0.13); gs.addColorStopRGBA(0.5, r, g, b, 0)
    ctx.setOperator(12); ctx.setSource(gs); ctx.rectangle(x, y, w, h); ctx.fill(); ctx.setOperator(2)
    ctx.restore()
    const lr = r + (1 - r) * 0.45, lg = g + (1 - g) * 0.45, lb = b + (1 - b) * 0.45
    panelPath(ctx, x, y, w, h); ctx.setSourceRGBA(lr, lg, lb, 0.92); ctx.setLineWidth(0.9); ctx.stroke()
}

// two ways to draw text. txt() uses cairo's built-in "toy" font API, fast, fine for
// fixed ASCII labels. pango() goes through Pango which does proper font fallback, so use
// that for anything dynamic (song titles, etc.) that might contain weird unicode/glyphs
// the main font doesn't have. pango() falls back to txt() if it throws for some reason.
let _txtfx = false
export const setTxtFX = (v) => { _txtfx = v }
export const txt = (ctx, x, y, s, font, size, col, a, bold = 0, glow = 0) => {
    ctx.selectFontFace(font, 0, bold); ctx.setFontSize(size)
    if (glow > 0) { ctx.setOperator(12); ctx.setSourceRGBA(col[0], col[1], col[2], glow * a); ctx.moveTo(x + 0.6, y); ctx.showText(s); ctx.setOperator(2) }
    if (_txtfx) {
        ctx.setOperator(12)
        ctx.setSourceRGBA(col[0], col[1], col[2], 0.3 * a); ctx.moveTo(x + 0.8, y + 0.6); ctx.showText(s)
        ctx.setSourceRGBA(1, 0.12, 0.16, 0.45 * a); ctx.moveTo(x - 1.5, y); ctx.showText(s)
        ctx.setSourceRGBA(1, 0.55, 0.3, 0.3 * a); ctx.moveTo(x + 1.5, y); ctx.showText(s)
        ctx.setOperator(2)
    }
    ctx.setSourceRGBA(col[0], col[1], col[2], a); ctx.moveTo(x, y); ctx.showText(s)
}
export const pango = (ctx, x, yBase, s, family, bold, px, col, a) => {
    try {
        const layout = PangoCairo.create_layout(ctx)
        const desc = Pango.FontDescription.new()
        desc.set_family(family); desc.set_weight(bold ? Pango.Weight.BOLD : Pango.Weight.NORMAL); desc.set_absolute_size(px * Pango.SCALE)
        layout.set_font_description(desc); layout.set_text(s, -1)
        const base = layout.get_baseline() / Pango.SCALE
        ctx.setSourceRGBA(col[0], col[1], col[2], a); ctx.moveTo(x, yBase - base); PangoCairo.show_layout(ctx, layout)
    } catch (e) { txt(ctx, x, yBase, s, family, px, col, a, bold ? 1 : 0, 0) }
}
const GLY = "ABCDEF0123456789#%&@/<>*=+|".split("")
export const scramble = (s, gl) => (gl > 0.03) ? s.split("").map((c) => (c === " " || Math.random() > gl * 0.92) ? c : GLY[(Math.random() * GLY.length) | 0]).join("") : s

export const pip = (px, py, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside } return inside }
export const projQuad = (plane: Plane, u0, v0, u1, v1) => [plane.project(u0, v0), plane.project(u1, v0), plane.project(u1, v1), plane.project(u0, v1)]
// given a click and a projected line segment, returns how far along it you are (0..1).
// this is how the sliders (volume etc.) know what value you dragged to on a tilted panel.
export const segParam = (plane: Plane, u0, v0, u1, v1, px, py) => {
    const L = plane.project(u0, v0), R = plane.project(u1, v1)
    const dx = R[0] - L[0], dy = R[1] - L[1], len2 = dx * dx + dy * dy || 1
    return Math.max(0, Math.min(1, ((px - L[0]) * dx + (py - L[1]) * dy) / len2))
}

// thisdefinition below handles the animation for the "warp reveal" effect when a modal opens. it takes the screen context, the surface to draw, 
// the projection plane, the width and height of the surface, an intro value (0..1) that controls how far along the animation is, and a seed
//  for randomization. it draws horizontal bands of the surface with slight shifts and slides to create a glitchy reveal effect.
export const warpReveal = (screenCtx, surf, plane: Plane, PW, PH, intro, seed) => {

    const e = intro, full = e >= 0.999
    const ease = full ? 1 : e * e * (3 - 2 * e)
    const dec = full ? 0 : 1 - ease
    const slideX = full ? 0 : -26 * dec
    const s = Math.floor(seed * 55)
    const nz = (k) => { const x = Math.sin(s * 12.9 + k * 78.2) * 43758.5; return x - Math.floor(x) }
    const BANDS = 9
    const shiftAt = (v) => full ? 0 : (nz(Math.floor(v / (PH / BANDS)) + 1) * 2 - 1) * 50 * dec * dec
    const N = 50
    for (let i = 0; i < N; i++) {
        const v0 = i * PH / N, v1 = (i + 1) * PH / N
        const dx = slideX + shiftAt(v0)
        const tl = plane.project(0, v0), tr = plane.project(PW, v0), bl = plane.project(0, v1)
        const ulen = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), vlen = Math.hypot(bl[0] - tl[0], bl[1] - tl[1])
        const ang = Math.atan2(tr[1] - tl[1], tr[0] - tl[0])
        screenCtx.save()
        screenCtx.translate(tl[0] + dx, tl[1]); screenCtx.rotate(ang); screenCtx.scale(ulen / PW, vlen / (v1 - v0))
        screenCtx.rectangle(0, -0.4, PW, (v1 - v0) + 0.8); screenCtx.clip()
        screenCtx.setSourceSurface(surf, 0, -v0); screenCtx.paint()
        screenCtx.restore()
    }
    if (!full) {
        screenCtx.setOperator(12); screenCtx.setLineJoin(0)
        for (let b = 1; b < BANDS; b++) {
            const v = b * PH / BANDS, off = 3 + dec * 6, a = dec * 0.6
            const l = plane.project(14, v), rp = plane.project(PW - 14, v)
            screenCtx.setLineWidth(1.6)
            screenCtx.setSourceRGBA(1, 0.13, 0.24, a); screenCtx.newPath(); screenCtx.moveTo(l[0] - off, l[1]); screenCtx.lineTo(rp[0] - off, rp[1]); screenCtx.stroke()
            screenCtx.setSourceRGBA(0.2, 1, 1, a); screenCtx.newPath(); screenCtx.moveTo(l[0] + off, l[1]); screenCtx.lineTo(rp[0] + off, rp[1]); screenCtx.stroke()
        }
        const a0 = plane.project(14, 0), a1 = plane.project(14, PH)
        screenCtx.setSourceRGBA(0.85, 0.98, 1, dec * 0.85); screenCtx.setLineWidth(2.4)
        screenCtx.newPath(); screenCtx.moveTo(a0[0] + slideX, a0[1]); screenCtx.lineTo(a1[0] + slideX, a1[1]); screenCtx.stroke()
        screenCtx.setOperator(2)
    }
}
