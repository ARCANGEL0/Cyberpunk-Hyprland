// CP2077-style notification popup — holographic, 3D projected, animated intro
import { Window, Box, DrawingArea, EventBox } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval, timeout, execAsync } from "astal"
import AstalNotifd from "gi://AstalNotifd"
import Gdk from "gi://Gdk?version=3.0"
import { CYBER_DIR } from "../../env.ts"
import { makePlane, fillQuad, strokePath, tiltText } from "./proj.ts"
import { NEON } from "./colors.ts"

const Cairo = (imports as any).cairo
const notifd = AstalNotifd.get_default()
const LIFETIME = 15000

const TITLE = "Chakra Petch", MONO = "JetBrains Mono", ICONF = "Symbols Nerd Font"
const XICON = "\uf00d", ENVELOPE = "\uf0e0"
const YELLOW: [number, number, number] = [255, 178, 36]
const WHITE: [number, number, number] = [225, 232, 242]
const GREY: [number, number, number] = [120, 130, 140]
const GREY_DARK: [number, number, number] = [30, 32, 36]
const DIM_RED: [number, number, number] = [80, 15, 15]
const SND = `${CYBER_DIR}/assets/audio/notif.mp3`
const PHONE_ICON_PATH = `${CYBER_DIR}/assets/icons/phone.png`
let phoneIcon: any = null
// mpv/ffplay
const play = () => execAsync(["sh", "-c", `mpv --no-terminal --really-quiet "${SND}" 2>/dev/null || ffplay -nodisp -autoexit -loglevel quiet "${SND}" 2>/dev/null || paplay "${SND}" 2>/dev/null || play -q "${SND}" 2>/dev/null`]).catch(() => {})
const clamp = (n: number) => Math.max(0, Math.min(1, n))

const ICONW = 64
const W = 400
const HEADER = 48, ROWH = 50, ROW_GAP = 6, MAXROWS = 5
const H = HEADER + MAXROWS * (ROWH + ROW_GAP) + 8
const TOTALW = ICONW + W
const plane = makePlane({ w: TOTALW, h: H, yaw: -16, pitch: 5, roll: 2, focal: 1600, dist: 1600, pad: 26 })

const MARGIN_L = 18, MARGIN_T = 156
const projQuad = (x0: number, y0: number, x1: number, y1: number): [number, number][] =>
    ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]).map(([u, v]) => plane.project(u, v))

const DISMISS_Q = projQuad(ICONW + 190, 4, ICONW + 315, 44)
const pip = (px: number, py: number, q: [number, number][]) => {
    let inside = false
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const [xi, yi] = q[i], [xj, yj] = q[j]
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
    }
    return inside
}
const rowAt = (x: number, y: number) => {
    const n = Math.min(msgs.length, MAXROWS)
    for (let i = 0; i < n; i++) {
        const my = HEADER + i * (ROWH + ROW_GAP)
        if (pip(x, y, projQuad(ICONW + 12, my, ICONW + W - 2, my + ROWH))) return i
    }
    return -1
}

let msgs: any[] = []
let panelIntro = 0, lastActivity = 0
let area: any = null, loop: any = null, win: any = null
let hoverRow = -1, dismissHover = false
let clickPulse = 0, rowPulse = 0, rowPulseIdx = -1
let animProg = 0

// ── Data corruption glitch state ──
let glitchTimer = 0
let glitchPhase = 0
interface GlitchBlock { x: number; y: number; w: number; h: number; alpha: number; life: number; color: [number, number, number] }
let glitchBlocks: GlitchBlock[] = []
interface HShiftBand { y: number; h: number; shift: number; alpha: number; life: number }
let hShiftBands: HShiftBand[] = []
let headerDistort = 0

const applyInput = () => {
    try {
        const gw = win?.get_window?.(); if (!gw) return
        const r = new Cairo.Region()
        if (msgs.length > 0) {
            const bottom = HEADER + Math.min(msgs.length, MAXROWS) * (ROWH + ROW_GAP) + 12
            const c = ([[0, 0], [TOTALW, 0], [TOTALW, bottom], [0, bottom]]).map(([u, v]) => plane.project(u, v))
            const xs = c.map(p => p[0]), ys = c.map(p => p[1])
            r.unionRectangle({
                x: Math.floor(MARGIN_L + Math.min(...xs)) - 2, y: Math.floor(MARGIN_T + Math.min(...ys)) - 2,
                width: Math.ceil(Math.max(...xs) - Math.min(...xs)) + 4, height: Math.ceil(Math.max(...ys) - Math.min(...ys)) + 4,
            })
        }
        gw.input_shape_combine_region(r, 0, 0)
    } catch (e) { print("[cyber] applyInput:", e) }
}

const removeMsg = (m: any) => { m.out = Date.now(); kick(); timeout(260, () => { msgs = msgs.filter(x => x !== m); applyInput(); kick() }) }
const dismissAll = () => {
    const now = Date.now()
    msgs.forEach(m => { if (!m.out) m.out = now })
    kick(); timeout(280, () => { msgs = []; applyInput(); kick() })
    try { for (const n of (notifd?.get_notifications?.() ?? [])) n.dismiss?.() } catch {}
}
const activate = (m: any) => {
    try {
        const n = notifd?.get_notification?.(m.id)
        if (n) {
            let ids: any[] = []
            try { ids = (n.get_actions?.() ?? n.actions ?? []).map((a: any) => a?.id ?? a) } catch {}
            const act = ids.includes("default") ? "default" : ids[0]
            if (act) n.invoke?.(act)
            else n.dismiss?.()
        }
    } catch (e) { print("[cyber] activate:", e) }
    removeMsg(m)
}

const CORRUPT_COLORS: [number, number, number][] = [
    [45, 35, 40],    // dark grey-brown
    [55, 40, 45],    // slightly warmer grey
    [35, 50, 55],    // dark blue-grey
    [65, 45, 35],    // brown-grey
    [50, 38, 42],    // neutral grey
    [40, 30, 50],    // faint purple-grey
    [160, 30, 25],   // desaturated red (rare accent)
    [120, 20, 18],   // darker red (rare)
]

const drawDataCorruption = (ctx: any, pa: number) => {
    if (pa < 0.3) return
    const tl = plane.project(ICONW, 0)
    const br = plane.project(ICONW + W, H)
    const ox = MARGIN_L, oy = MARGIN_T
    ctx.save()
    hShiftBands.forEach(band => {
        if (band.alpha < 0.01) return
        const a = band.alpha * pa
        const sy = tl[1] + (band.y / H) * (br[1] - tl[1]) + oy
        const sh = (band.h / H) * (br[1] - tl[1])
        const sx = band.shift * (br[0] - tl[0]) / W
        ctx.setSourceRGBA(60/255, 45/255, 50/255, a * 0.35)
        ctx.rectangle(tl[0] + ox + sx, sy, (br[0] - tl[0]), sh)
        ctx.fill()
        ctx.setSourceRGBA(150/255, 120/255, 110/255, a * 0.15)
        ctx.setLineWidth(0.5)
        ctx.moveTo(tl[0] + ox + sx, sy)
        ctx.lineTo(tl[0] + ox + sx + (br[0] - tl[0]), sy)
        ctx.stroke()
    })

    glitchBlocks.forEach(block => {
        if (block.alpha < 0.01) return
        const [r, g, b] = block.color
        const a = block.alpha * pa

        // Project block position to screen space
        const p = plane.project(block.x, block.y)
        const pw = plane.project(block.x + block.w, block.y)
        const ph = plane.project(block.x, block.y + block.h)
        const sw = Math.abs(pw[0] - p[0])
        const sh = Math.abs(ph[1] - p[1])

        ctx.setSourceRGBA(r/255, g/255, b/255, a * 0.55)
        ctx.rectangle(p[0] + ox, p[1] + oy, Math.max(1, sw), Math.max(1, sh))
        ctx.fill()
    })

    // These are just to give the "screen" texture, not the main effect
    const minY = tl[1] + oy, maxY = br[1] + oy
    const minX = tl[0] + ox, maxX = br[0] + ox
    for (let sy = minY; sy < maxY; sy += 4) {
        const v = 0.008 + 0.005 * Math.sin(sy * 0.08 + glitchPhase * 0.02)
        if (v < 0.004) continue
        ctx.setSourceRGBA(80/255, 30/255, 25/255, v * pa)
        ctx.setLineWidth(0.3)
        ctx.moveTo(minX, sy)
        ctx.lineTo(maxX, sy)
        ctx.stroke()
    }

    // ── Header text displacement (rare, brief
    if (headerDistort > 0.01) {
        const offset = (Math.random() - 0.5) * 3 * headerDistort
        tiltText(ctx, plane, ICONW + 58 + offset * 2, 27, "MESSAGES", TITLE, 13,
            [140, 80, 70], headerDistort * 0.3 * pa, { bold: true, glow: 0.2 })
    }

    ctx.restore()
}

const draw = (ctx: any) => {
    if (msgs.length === 0 && panelIntro <= 0) return
    const shown = msgs.slice(0, MAXROWS)
    const panelH = HEADER + shown.length * (ROWH + ROW_GAP)
    const pa = clamp(panelIntro / 0.25)

    // ── Left column: static phone icon (loaded from PNG on assets) ──
    if (animProg > 0) {
        const iconA = clamp(animProg * 6) * pa
        try {
            if (!phoneIcon) phoneIcon = Cairo.ImageSurface.createFromPNG(PHONE_ICON_PATH)
            const [pw, ph] = [phoneIcon.getWidth(), phoneIcon.getHeight()]
            const iconDrawH = 26
            const iconDrawW = (pw / ph) * iconDrawH
            const iconX = 42 - iconDrawW / 2
            const iconY = 8
            ctx.save()
            ctx.setSourceRGBA(1, 1, 1, iconA)
            const [sx, sy] = plane.project(iconX, iconY + iconDrawH / 2)
            const s = plane.scaleAt(iconX, iconY + iconDrawH / 2)
            const ang = plane.angleAt(iconX, iconY + iconDrawH / 2)
            ctx.translate(sx, sy)
            ctx.rotate(ang)
            ctx.scale(s, s)
            ctx.translate(0, -iconDrawH / 2)
            ctx.scale(iconDrawW / pw, iconDrawH / ph)
            ctx.setSourceSurface(phoneIcon, 0, 0)
            ctx.paint()
            ctx.restore()
        } catch (e) {
            tiltText(ctx, plane, 42, 22, "\uf095", ICONF, 20, NEON.cyan, clamp(animProg * 6) * pa, { bold: true })
        }
    }

    // ── Header: "✉ MESSAGES" (cyan glow) and "✕ DISMISS" (red glow + hover) ──
    if (animProg > 0.10) {
        const labelA = clamp((animProg - 0.10) * 5) * pa
        tiltText(ctx, plane, ICONW + 38, 27, ENVELOPE, ICONF, 13, NEON.cyan, labelA * 0.9, { bold: true, glow: 0.6 })
        tiltText(ctx, plane, ICONW + 58, 27, "MESSAGES", TITLE, 13, NEON.cyan, labelA, { bold: true, glow: 0.7 })

        const disA = clamp((animProg - 0.14) * 5) * pa
        const disGlow = dismissHover ? 0.9 : 0.5
        tiltText(ctx, plane, ICONW + 200, 27, XICON, ICONF, 13, NEON.red, disA * 0.9, { bold: true, glow: disGlow })
        tiltText(ctx, plane, ICONW + 218, 27, "DISMISS", TITLE, 13, NEON.red, disA * (dismissHover ? 1.0 : 0.85), { bold: true, glow: disGlow })

        if (clickPulse > 0.01) {
            fillQuad(ctx, plane, ICONW + 190, 4, ICONW + 315, 44, NEON.red, 0.35 * clickPulse * pa)
        }
    }

    if (animProg > 0.15) {
        const barFrac = clamp((animProg - 0.15) / 0.25)
        const barA = clamp((animProg - 0.15) * 5) * pa
        const barStart = ICONW + 8
        const neonEnd = ICONW + 296
        const trailEnd = ICONW + W - 8
        const barEnd = barStart + (neonEnd - barStart) * barFrac
        const cyanSplit = barStart + (neonEnd - barStart) * barFrac * 0.4
        const trailBarEnd = barStart + (trailEnd - barStart) * barFrac
        fillQuad(ctx, plane, barStart, 32, trailEnd, 40, NEON.red, 0.025 * barA)
        if (barFrac > 0.05) {
            strokePath(ctx, plane, [[barEnd, 36], [trailBarEnd, 36]], DIM_RED, 0.5 * barA, 1.2)
        }
        for (const [w, a] of [[8, 0.05], [5, 0.10], [3, 0.15]] as const) {
            strokePath(ctx, plane, [[barStart, 36], [barEnd, 36]], NEON.red, a * barA, w)
        }
        if (cyanSplit > barStart + 2) {
            strokePath(ctx, plane, [[barStart, 36], [cyanSplit, 36]], NEON.cyan, 0.08 * barA, 8)
            strokePath(ctx, plane, [[barStart, 36], [cyanSplit, 36]], NEON.cyan, 0.18 * barA, 4)
            strokePath(ctx, plane, [[barStart, 36], [cyanSplit, 36]], NEON.cyan, 0.95 * barA, 1.8)
        }

        if (barEnd > cyanSplit + 2) {
            strokePath(ctx, plane, [[cyanSplit, 36], [barEnd, 36]], NEON.red, 0.08 * barA, 8)
            strokePath(ctx, plane, [[cyanSplit, 36], [barEnd, 36]], NEON.red, 0.18 * barA, 4)
            strokePath(ctx, plane, [[cyanSplit, 36], [barEnd, 36]], NEON.red, 0.95 * barA, 1.8)
        }
    }

    // ── Data corruption overlay ──
    drawDataCorruption(ctx, pa)

    // ── Message rows ──
    const activeRow = hoverRow >= 0 ? hoverRow : 0
    const now = Date.now()
    shown.forEach((m, i) => {
        const age = now - m.born
        const rowIntro = clamp((animProg - 0.25 - i * 0.06) / 0.2) * clamp(age / 60)
        const ma = m.out > 0 ? clamp(1 - (now - m.out) / 220) : clamp(rowIntro)
        if (ma <= 0.01) return

        const my = HEADER + i * (ROWH + ROW_GAP)
        const hovered = i === hoverRow
        const pulse = i === rowPulseIdx ? rowPulse : 0

        if (i === activeRow) {
            const bv = 7
            const x0 = ICONW + 12, x1 = ICONW + W - 2, y0 = my + 1, y1 = my + ROWH - 3
            const bub: [number, number][] = [
                [x0 + bv, y0], [x1 - bv, y0], [x1, y0 + bv],
                [x1, y1 - bv], [x1 - bv, y1], [x0 + 10, y1],
                [x0, y1 + 5], [x0, y0 + bv]
            ]
            const bubProj = bub.map(([u, v]) => plane.project(u, v))
            ctx.newPath()
            bubProj.forEach(([x, y], idx) => idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
            ctx.closePath()
            ctx.setSourceRGBA(15/255, 12/255, 8/255, (0.4 + 0.15 * (hovered ? 1 : 0) + 0.25 * pulse) * ma)
            ctx.fill()
            ctx.newPath()
            bubProj.forEach(([x, y], idx) => idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
            ctx.closePath()
            ctx.setSourceRGBA(255/255, 178/255, 36/255, (0.15 + 0.3 * (hovered ? 1 : 0) + 0.5 * pulse) * ma)
            ctx.setLineWidth(4)
            ctx.stroke()
            ctx.newPath()
            bubProj.forEach(([x, y], idx) => idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
            ctx.closePath()
            ctx.setSourceRGBA(255/255, 178/255, 36/255, (0.95 + 0.05 * (hovered ? 1 : 0)) * ma)
            ctx.setLineWidth(1.2)
            ctx.stroke()
            const fx = ICONW + W - 30, fy = my + 16
            const fSize = 14
            const kq: [number, number][] = [[fx, fy], [fx + fSize, fy], [fx + fSize, fy + fSize], [fx, fy + fSize]]
            const kqProj = kq.map(([u, v]) => plane.project(u, v))
            ctx.newPath()
            kqProj.forEach(([x, y], idx) => idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
            ctx.closePath()
            ctx.setSourceRGBA(255/255, 178/255, 36/255, 0.85 * ma)
            ctx.setLineWidth(1)
            ctx.stroke()
            tiltText(ctx, plane, fx + 4.5, fy + 11, "F", TITLE, 9, YELLOW, ma, { bold: true })
        } else {
            const bv = 7
            const x0 = ICONW + 12, x1 = ICONW + W - 2, y0 = my + 1, y1 = my + ROWH - 3
            const bub: [number, number][] = [
                [x0 + bv, y0], [x1 - bv, y0], [x1, y0 + bv],
                [x1, y1 - bv], [x1 - bv, y1], [x0 + 10, y1],
                [x0, y1 + 5], [x0, y0 + bv]
            ]
            const bubProj = bub.map(([u, v]) => plane.project(u, v))
            ctx.newPath()
            bubProj.forEach(([x, y], idx) => idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
            ctx.closePath()
            ctx.setSourceRGBA(GREY_DARK[0]/255, GREY_DARK[1]/255, GREY_DARK[2]/255, 0.4 * ma)
            ctx.fill()
            ctx.newPath()
            bubProj.forEach(([x, y], idx) => idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
            ctx.closePath()
            ctx.setSourceRGBA(GREY[0]/255, GREY[1]/255, GREY[2]/255, 0.4 * ma)
            ctx.setLineWidth(1)
            ctx.stroke()
        }

        const ta = Math.min(1, ma * (hovered ? 1.1 : 1))
        const titleColor = i === activeRow ? YELLOW : GREY
        tiltText(ctx, plane, ICONW + 22, my + 20, m.title, TITLE, 13, titleColor, ta, { bold: true })
        tiltText(ctx, plane, ICONW + 22, my + 36, m.body || "//", MONO, 10, WHITE, 0.65 * ma)
    })
}

const kick = () => {
    lastActivity = Date.now()
    if (loop) return
    loop = interval(16, () => {
        const active = msgs.length > 0
        if (active && panelIntro < 1) panelIntro = Math.min(1, panelIntro + 0.04)
        if (!active && panelIntro > 0) panelIntro = Math.max(0, panelIntro - 0.06)
        if (active && animProg < 1) animProg = Math.min(1, animProg + 0.02)
        if (!active) animProg = Math.max(0, animProg - 0.06)

        if (clickPulse > 0) clickPulse = Math.max(0, clickPulse - 0.05)
        if (rowPulse > 0) rowPulse = Math.max(0, rowPulse - 0.06)

        glitchTimer++
        glitchPhase += 0.3
        if (glitchTimer > 120 + Math.random() * 300 && msgs.length > 0) {
            glitchTimer = 0
            const r = Math.random()

            if (r < 0.35) {
                hShiftBands.push({
                    y: Math.floor(Math.random() * (H - 4)) + 2,
                    h: 1 + Math.floor(Math.random() * 3),  // 1-3px tall
                    shift: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.floor(Math.random() * 6)),  // 2-8px shift
                    alpha: 0.15 + Math.random() * 0.25,
                    life: 3 + Math.floor(Math.random() * 6)
                })
            } else if (r < 0.65) {
                const count = 2 + Math.floor(Math.random() * 4)
                const baseY = Math.floor(Math.random() * (H - 20)) + 10
                const baseX = ICONW + 8 + Math.floor(Math.random() * W * 0.3)
                for (let i = 0; i < count; i++) {
                    const color = CORRUPT_COLORS[Math.floor(Math.random() * CORRUPT_COLORS.length)]
                    glitchBlocks.push({
                        x: baseX + Math.floor(Math.random() * W * 0.5),
                        y: baseY + Math.floor(Math.random() * 20) - 10,
                        w: 1 + Math.floor(Math.random() * 5),   // 1-5px wide
                        h: 1 + Math.floor(Math.random() * 3),   // 1-3px tall
                        alpha: 0.12 + Math.random() * 0.2,
                        life: 3 + Math.floor(Math.random() * 7),
                        color: color
                    })
                }
            } else if (r < 0.8) {
                // Single wider pixel block (bigger corrupted region)
                const color = CORRUPT_COLORS[Math.floor(Math.random() * CORRUPT_COLORS.length)]
                glitchBlocks.push({
                    x: ICONW + 10 + Math.floor(Math.random() * (W - 40)),
                    y: Math.floor(Math.random() * (H - 10)) + 5,
                    w: 4 + Math.floor(Math.random() * 12),  // 4-16px wide
                    h: 1 + Math.floor(Math.random() * 2),   // 1-2px tall
                    alpha: 0.08 + Math.random() * 0.15,
                    life: 4 + Math.floor(Math.random() * 8),
                    color: color
                })
            } else if (r < 0.92) {
                // Header text displacement
                headerDistort = 0.15 + Math.random() * 0.3
            }
        }

        // Decay corruption effects
        hShiftBands = hShiftBands.filter(b => {
            b.life--
            b.alpha *= 0.7
            return b.life > 0 && b.alpha > 0.005
        })
        glitchBlocks = glitchBlocks.filter(b => {
            b.life--
            b.alpha *= 0.72
            return b.life > 0 && b.alpha > 0.005
        })
        if (headerDistort > 0) headerDistort *= 0.68

        area?.queue_draw()
        const animating = (active && panelIntro < 1) || (!active && panelIntro > 0)
            || msgs.some(m => Date.now() - m.born < 400 || m.out > 0)
            || clickPulse > 0.01 || rowPulse > 0.01
            || animProg > 0.01 || (active && animProg < 1)
            || hShiftBands.length > 0 || glitchBlocks.length > 0
        if (!animating && Date.now() - lastActivity > 400) { loop.cancel(); loop = null }
    })
}

const add = (n: any) => {
    if (msgs.length === 0) { panelIntro = 0; animProg = 0 }
    msgs.unshift({
        title: (n?.summary || n?.app_name || "INCOMING MESSAGE").toString().toUpperCase().slice(0, 30),
        body: (n?.body || "").toString().replace(/\s+/g, " ").slice(0, 46),
        born: Date.now(), out: 0, id: n?.id ?? 0,
    })
    while (msgs.length > MAXROWS + 3) msgs.pop()
    play(); kick(); applyInput()
    const m = msgs[0]
    timeout(LIFETIME, () => { if (!m.out) removeMsg(m) })
}

export const NotifPopupWindow = () => {
    area = DrawingArea({}); area.set_size_request(plane.width, plane.height)
    area.connect("draw", (_w, ctx) => (draw(ctx), false))

    const evt = EventBox({ child: area })
    try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK | Gdk.EventMask.POINTER_MOTION_MASK) } catch {}
    const coords = (e: any): [number, number] => { try { const c = e.get_coords?.(); if (c && c.length >= 3) return [c[1], c[2]] } catch {} return [-1, -1] }
    const updateHover = (x: number, y: number) => {
        const d = msgs.length ? pip(x, y, DISMISS_Q) : false
        const r = d ? -1 : rowAt(x, y)
        if (r !== hoverRow || d !== dismissHover) { hoverRow = r; dismissHover = d; kick() }
    }
    evt.connect("motion-notify-event", (_w, e) => { const [x, y] = coords(e); updateHover(x, y); return false })
    evt.connect("enter-notify-event", (_w, e) => { const [x, y] = coords(e); updateHover(x, y); return false })
    evt.connect("leave-notify-event", () => { if (hoverRow !== -1 || dismissHover) { hoverRow = -1; dismissHover = false; kick() } return false })
    evt.connect("button-press-event", (_w, e) => {
        const [x, y] = coords(e)
        if (!msgs.length) return false
        if (pip(x, y, DISMISS_Q)) { clickPulse = 1; kick(); dismissAll() }
        else { const r = rowAt(x, y); if (r >= 0 && r < msgs.length) { rowPulse = 1; rowPulseIdx = r; kick(); activate(msgs[r]) } }
        return false
    })

    win = Window({
        name: "notifpopups", className: "aug notifpopups",
        anchor: Anchor.TOP | Anchor.LEFT, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
        child: Box({ className: "notifpopups-wrap", child: evt }),
    })
    win.connect("realize", applyInput); win.connect("map", applyInput); timeout(120, applyInput)
    try {
        notifd.connect("notified", (_s: any, id: number) => {
            try { add((notifd.get_notification ? notifd.get_notification(id) : null) ?? { summary: "", body: "" }) } catch (e) { print("[cyber] popup:", e) }
        })
    } catch (e) { print("[cyber] notifpopup init:", e) }
    return win
}