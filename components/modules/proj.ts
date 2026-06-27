// this is what makes the whole "tilted 3D HUD" effect work.
// basically every widget that looks like going inside the screen
// (meters, clock, launcher, OSD...) is drawn using a "plane" from makePlane().
//
// the plane is like a small fake camera. you give it a flat area (width x height)
// and how it is rotated (yaw / pitch / roll), and it gives back a project(u, v)
// function. this function takes a point from the flat surface and tells where it
// should be on the screen.
//
// all the tilt* and *Quad helpers just draw normal flat UV coords, then pass
// through project(), so everything shares the same fake 3D perspective.


// quick explanation of terms:
// yaw   = rotate left/right (like opening a door)
// pitch = tilt forward/back (like putting it on the floor)
// roll  = rotate like a clock hand
// focal / dist = camera settings; bigger value = less perspective effect
// pad   = extra empty space around edges so things don’t get cut

import { RGB, f } from "./colors.ts"
type Ctx = any
const D2R = Math.PI / 180   // degrees -> radians, since i write all the angles in degrees

// when you flip the HUD on top of your windows (SUPER+SHIFT+Z), we set this flag so text
// can add a backing halo to stay readable over all that busy window stuff. 
let _halo = false
export const setTextHalo = (v: boolean) => { _halo = v }
export interface PlaneOpts {
    w: number
    h: number
    yaw?: number
    pitch?: number
    roll?: number
    focal?: number
    dist?: number
    pad?: number
}

export interface Plane {
    project: (u: number, v: number) => [number, number]
    scaleAt: (u: number, v: number) => number
    angleAt: (u: number, v: number) => number
    width: number
    height: number
}

export const makePlane = (o: PlaneOpts): Plane => {
    const yaw = (o.yaw ?? 22) * D2R
    const pitch = (o.pitch ?? 8) * D2R
    const roll = (o.roll ?? 0) * D2R
    const focal = o.focal ?? 1000
    const dist = o.dist ?? 1000
    const pad = o.pad ?? 24
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw)
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch)
    const cosR = Math.cos(roll), sinR = Math.sin(roll)
    const cx = o.w / 2, cy = o.h / 2

    // take a point on the flat rectangle, spin it around (yaw then pitch) into "camera space",
    // then shove it out to the camera distance. spits back 3D coords (x,y,z) where z is how deep it sits.
    const toCam = (u: number, v: number): [number, number, number] => {
        const lx = u - cx, ly = v - cy
        let x = lx * cosY, z = -lx * sinY
        let y = ly
        const y2 = y * cosP - z * sinP
        const z2 = y * sinP + z * cosP
        return [x, y2, z2 + dist]
    }
    // do the perspective divide (x/z, y/z) to squash the 3D back down to 2D, then spin it with roll.
    // called "raw" because we haven't shifted it into the padded canvas yet -- that's project()'s job.
    const rawProject = (u: number, v: number): [number, number] => {
        const [X, Y, Z] = toCam(u, v)
        const sx = focal * X / Z, sy = focal * Y / Z
        return [sx * cosR - sy * sinR, sx * sinR + sy * cosR]
    }

    // fire the four corners through the projector first to figure out where the whole thing lands,
    // then bump everything out by `pad` so the tilted shape stays fully inside the DrawingArea
    // and nothing gets clipped. the width/height we hand back come straight from this
    const corners = [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(([u, v]) => rawProject(u, v))
    const xs = corners.map(c => c[0]), ys = corners.map(c => c[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...xs), maxY = Math.max(...ys)
    const offX = pad - minX, offY = pad - minY

    const project = (u: number, v: number): [number, number] => {
        const [x, y] = rawProject(u, v)
        return [x + offX, y + offY]
    }
    // scaleAt: tells you how much bigger something at (u,v) looks compared to the center
    // (stuff closer to you gets bigger). tiltText uses this to shrink text that sits deep in the plane.
    const centreZ = toCam(cx, cy)[2]
    const scaleAt = (u: number, v: number) => centreZ / toCam(u, v)[2]
    // angleAt: how tilted the horizontal axis looks at that spot, so we can rotate text/chips
    // to sit flat on the plane. we just fire a point 10px to the right and measure the angle.
    const angleAt = (u: number, v: number) => {
        const [ax, ay] = project(u, v)
        const [bx, by] = project(u + 10, v)
        return Math.atan2(by - ay, bx - ax)
    }

    return {
        project, scaleAt, angleAt,
        width: Math.ceil(maxX - minX + pad * 2),
        height: Math.ceil(maxY - minY + pad * 2),
    }
}

// ── from here down: little drawing helpers that all take flat UV coords + a plane and ──
//push the points through plane.project(), so callers never touch the math bein used here

// draw a polyline through points 
const moveLine = (ctx: Ctx, pts: [number, number][], close: boolean) => {
    ctx.newPath()
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    if (close) ctx.closePath()
}

// fill a rectangle on the plane from (u0,v0) to (u1,v1)
export const fillQuad = (
    ctx: Ctx, pl: Plane, u0: number, v0: number, u1: number, v1: number,
    color: RGB, alpha: number,
) => {
    const [r, g, b] = f(color)
    moveLine(ctx, [pl.project(u0, v0), pl.project(u1, v0), pl.project(u1, v1), pl.project(u0, v1)], true)
    ctx.setSourceRGBA(r, g, b, alpha)
    ctx.fill()
}

// draw a line or path given as UV points leik corners, brackets, accent lines, that sorta thing.
export const strokePath = (
    ctx: Ctx, pl: Plane, pts: [number, number][], color: RGB, alpha: number,
    width: number, close = false,
) => {
    const [r, g, b] = f(color)
    moveLine(ctx, pts.map(([u, v]) => pl.project(u, v)), close)
    ctx.setSourceRGBA(r, g, b, alpha)
    ctx.setLineWidth(width)
    ctx.setLineJoin(0)
    ctx.setMiterLimit(10)
    ctx.stroke()
}

// draws a smooth progress/level bar on the plane (frac runs 0..1).
export const tiltBar = (
    ctx: Ctx, pl: Plane, u0: number, u1: number, vc: number, frac: number,
    color: RGB, thick: number,
) => {
    frac = Math.max(0, Math.min(1, frac))
    const fillU = u0 + (u1 - u0) * frac
    fillQuad(ctx, pl, u0, vc - 1, u1, vc + 1, color, 0.16)
    for (const [t, a] of [[thick * 2.4, 0.06], [thick * 1.4, 0.13], [thick * 0.7, 0.5]] as const) {
        fillQuad(ctx, pl, u0, vc - t / 2, fillU, vc + t / 2, color, a)
    }
    const [r, g, b] = f(color)
    fillQuad(ctx, pl, u0, vc - thick * 0.28, fillU, vc + thick * 0.28,
        [Math.min(255, color[0] + 60), Math.min(255, color[1] + 60), Math.min(255, color[2] + 60)] as any, 1)
    if (frac > 0.01) {
        fillQuad(ctx, pl, fillU - 2, vc - thick * 0.75, fillU + 1, vc + thick * 0.75, [255, 255, 255] as any, 0.9)
    }
}

export const tiltText = (
    ctx: Ctx, pl: Plane, u: number, v: number, text: string,
    font: string, size: number, color: RGB, alpha: number,
    opts: { glow?: number; align?: "l" | "r" | "c"; bold?: boolean; extraRotate?: number; vcenter?: boolean } = {},
) => {
    const [sx, sy] = pl.project(u, v)
    const s = pl.scaleAt(u, v)
    const ang = pl.angleAt(u, v)
    const [r, g, b] = f(color)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(ang + (opts.extraRotate || 0))
    ctx.scale(s, s)
    ctx.selectFontFace(font, 0, opts.bold ? 1 : 0)
    ctx.setFontSize(size)
    let ox = 0, oy = 0
    if (opts.align === "r") { const te = ctx.textExtents(text); ox = -te.width }
    else if (opts.align === "c") { const te = ctx.textExtents(text); ox = -te.width / 2 }
    if (opts.vcenter) { const te = ctx.textExtents(text); oy = -te.height / 2 - te.y }
    const glowIntensity = opts.glow || 0.25
    ctx.setOperator(12) // 12 = cairo OPERATOR_ADD (additive blending; the offset copies stack light)
    for (const [dx, dy, a] of [[-1.2, 0, 0.12], [1.2, 0, 0.12], [0, -1.2, 0.12], [0, 1.2, 0.12], [-0.8, -0.8, 0.08], [0.8, -0.8, 0.08], [-0.8, 0.8, 0.08], [0.8, 0.8, 0.08]] as const) {
        ctx.setSourceRGBA(r, g, b, a * glowIntensity * 2)
        ctx.moveTo(ox + dx, oy + dy); ctx.showText(text)
    }
    ctx.setOperator(2) // 2 = OPERATOR_OVER (flip back to normal blending)
    ctx.setSourceRGBA(r, g, b, alpha)
    ctx.moveTo(ox, oy)
    ctx.showText(text)
    ctx.restore()
}

export const tiltFrame = (
    ctx: Ctx, pl: Plane, u0: number, v0: number, u1: number, v1: number,
    color: RGB, opts: { notch?: number; border?: number; bracket?: number } = {},
) => {
    const notch = opts.notch ?? 14
    const border = opts.border ?? 0.18
    const br = opts.bracket ?? 22
    strokePath(ctx, pl, [
        [u0, v0], [u1 - notch, v0], [u1, v0 + notch], [u1, v1], [u0, v1],
    ], color, border, 1, true)
    const L = (ux: number, vy: number, du: number, dv: number) => {
        strokePath(ctx, pl, [[ux, vy], [ux + du, vy]], color, 0.9, 2)
        strokePath(ctx, pl, [[ux, vy], [ux, vy + dv]], color, 0.9, 2)
    }
    L(u0, v0, br, br)
    L(u0, v1, br, -br)
    L(u1, v1, -br, -br)
    strokePath(ctx, pl, [[u1 - notch, v0], [u1, v0 + notch]], color, 0.9, 2)
}

export const measure = (ctx: Ctx, text: string, font: string, size: number) => {
    ctx.save(); ctx.selectFontFace(font, 0, 0); ctx.setFontSize(size)
    const w = ctx.textExtents(text).width; ctx.restore(); return w
}

// the ! alert chip used on cyberpunk 2077s notifications
export const alertChip = (ctx: Ctx, pl: Plane, x: number, y: number, color: RGB, s = 1) => {
    const w = 16 * s, h = 16 * s, cut = 5.5 * s
    const [r, g, b] = f(color)
    const [px, py] = pl.project(x, y)
    const sc = pl.scaleAt(x, y)
    const ang = pl.angleAt(x, y)
    ctx.save()
    ctx.translate(px, py); ctx.rotate(ang); ctx.scale(sc, sc)
    const body = () => {
        ctx.newPath()
        ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h)
        ctx.lineTo(cut, h); ctx.lineTo(0, h - cut); ctx.closePath()
    }
    ctx.setLineJoin(0)
    body(); ctx.setSourceRGBA(r, g, b, 0.16); ctx.fill()      // soft translucent fill
    body(); ctx.setSourceRGBA(r, g, b, 0.95); ctx.setLineWidth(1.5); ctx.stroke()   
    ctx.selectFontFace("Chakra Petch", 0, 1); ctx.setFontSize(13.5)
    const te = ctx.textExtents("!")
    ctx.setSourceRGBA(r, g, b, 1); ctx.moveTo(w / 2 - te.width / 2 + 0.3, h / 2 + 4.6); ctx.showText("!")
    ctx.restore()
}
