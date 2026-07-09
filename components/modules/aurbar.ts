// the "AUR UPDATE AVAILABLE" bar + the "PACKAGES ADDED" popup. same green cyberpunk bar, two
// modes, and it draws itself together outta a lil circle icon. street-cred animation from the game ^^
// it has the auxiliary images like that star circle and the "hexagon" which i made on photoshop
import { Window, DrawingArea } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval, timeout, execAsync } from "astal"
import { CYBER_DIR } from "../../env.ts"
import { TITLE, RAJDHANI, RAJDHANI_MED } from "./fonts.ts"
import { makePlane, tiltText, strokePath } from "./proj.ts"

const Cairo = (imports as any).cairo

// palette — the frame green is #2be185, rest is just accents for the chips/glow
const GREEN: [number, number, number] = [43, 225, 133]
const GRBRT: [number, number, number] = [150, 255, 200]   // brighter green for the highlight line + glow
const BLACK: [number, number, number] = [6, 14, 9]
const CYAN: [number, number, number] = [108, 230, 246]
const RED: [number, number, number] = [255, 74, 68]
const WHT: [number, number, number] = [232, 255, 240]
const CAPBG: [number, number, number] = [4, 14, 16]

const TFONT = RAJDHANI, GFONT = RAJDHANI_MED   // rajdhani = that cp2077 look

// sizes/positions in flat coords (before the tilt warps em)
const DC = 46, BH = 38, BW = 300, CHAMF = 8
const CIRCX_F = 31, CIRCX_S = 49   // circle x: where it ends up vs where it starts (it nudges left)
const LINEX = 66, BARX = 66, ROWY = 27
const CW = BARX + BW + 14, CH = 124
const GIGSY = ROWY + BH / 2 + 22, TIPY = GIGSY + 30

const D2R = Math.PI / 180
const BADGE_ROT = 0 * D2R   // nudge the updt.png icon if the tilt ever looks off just change the number (its degrees)
const GIGS_ROT = 0 * D2R    // same thing but for the whole "NEW GIGS" row underneath

// the 3d tilt. yaw/pitch = perspective depth, roll = the up/down aim of the bar
const plane = makePlane({ w: CW, h: CH, yaw: -19, pitch: 10, roll: 1, focal: 1080, dist: 1080, pad: 26 })

// load + cache the pngs so im not hitting disk every single frame
const IMG: any = {}
const png = (n: string) => { try { if (IMG[n] === undefined) IMG[n] = Cairo.ImageSurface.createFromPNG(`${CYBER_DIR}/assets/icons/${n}`) } catch { IMG[n] = null } return IMG[n] }

// live state. mode = the update bar vs the 'installed' popup, phase = where we r in the anim
let area: any = null, win: any = null, loop: any = null
let dismissed = false, count = 0
let lastList: string[] = []
let phase = "hidden", phaseStart = 0
let recheck: any = null
let mode = "update", autoT: any = null
let cTitle = "AUR UPDATE AVAILABLE!", cLabel = "NEW GIGS AVAILABLE:", cValue = "", cShowU = true

// lil math helpers for the anims
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const easeOut = (t: number) => 1 - (1 - clamp(t)) * (1 - clamp(t))
const easeIn = (t: number) => clamp(t) * clamp(t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rgba = (ctx: any, c: number[], a: number) => ctx.setSourceRGBA(c[0] / 255, c[1] / 255, c[2] / 255, a)
const blink2 = (q: number) => { if (q >= 0.75) return 1; const c = (q / 0.75) * 2; return (c % 1) < 0.5 ? 1 : 0.14 }   // flashes twice then stays on

// ask aur script whats outdated. first line = the count, rest = each pkg
export const getAurUpdates = () =>
    execAsync(["sh", "-c", `'${CYBER_DIR}/scripts/aur' check`]).then((out: string) => {
        const lines = out.split("\n")
        count = parseInt((lines[0] || "0").trim()) || 0
        lastList = lines.slice(1).map((s) => s.trim()).filter(Boolean)
        return { count, list: lastList }
    }).catch(() => ({ count: 0, list: [] as string[] }))

export const cachedAurUpdates = () => ({ count, list: lastList })

export const startUpgrade = () => execAsync(["sh", "-c", `'${CYBER_DIR}/scripts/aur' upgrade`]).catch(() => { })   // yeet the upgrade into a terminal

// the anim timeline,each phase, how long it lasts (ms), and what comes next
const DUR: any = { circle: 820, line: 720, bar: 460, outbar: 340, outline: 240, outcircle: 300 }
const NEXT: any = { circle: "line", line: "bar", bar: "shown", outbar: "outline", outline: "outcircle", outcircle: "hidden" }

// the anim loop. ticks every 16ms, walks the phases till it settles (shown) or hides
const kick = () => {
    if (loop) return
    loop = interval(16, () => {
        const p = clamp((Date.now() - phaseStart) / (DUR[phase] || 1))
        if (p >= 1 && NEXT[phase]) {
            phase = NEXT[phase]; phaseStart = Date.now()
            if (phase === "shown" || phase === "hidden") {
                if (phase === "hidden") {
                    if (win) win.visible = false
                    if (mode === "installed" && !dismissed && count > 0) timeout(500, showAurBar)   // after an 'installed' popup, bring the update bar back if theres still updates
                }
                area?.queue_draw(); loop.cancel(); loop = null; return
            }
        }
        area?.queue_draw()
    })
}

// play it backwards from wherever we currently r
const startOut = () => {
    if (phase === "hidden") return
    phase = phase === "circle" ? "outcircle" : phase === "line" ? "outline" : "outbar"
    phaseStart = Date.now(); kick()
}

// the normal "u got updates" bar
export const showAurBar = () => {
    if (dismissed || count <= 0 || phase !== "hidden") return
    mode = "update"; cTitle = "AUR UPDATE AVAILABLE!"; cLabel = "NEW GIGS AVAILABLE:"; cValue = `${count}`; cShowU = true
    if (win) win.visible = true
    phase = "circle"; phaseStart = Date.now(); kick()
}
// the "PACKAGES ADDED" popup (fired by the pacman hook). no U key, auto-dies after 2min
export const showInstalled = (title: string, info: string) => {
    mode = "installed"; cTitle = title; cLabel = info; cValue = ""; cShowU = false
    if (autoT) { autoT.cancel(); autoT = null }
    if (win) win.visible = true
    phase = "circle"; phaseStart = Date.now(); kick()
    autoT = timeout(120000, () => { autoT = null; startOut() })
}
// J key / manual close. if its the update bar it stays gone till hypr restarts
export const dismissAurBar = () => {
    if (phase === "hidden") return
    if (autoT) { autoT.cancel(); autoT = null }
    if (mode === "update") dismissed = true
    startOut()
}

// draw a shape by pushing the points thru the tilt plane
const projPath = (ctx: any, pts: [number, number][]) => {
    ctx.newPath()
    pts.forEach(([u, v], i) => { const [x, y] = plane.project(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
    ctx.closePath()
}
const pfill = (ctx: any, pts: [number, number][], c: number[], a: number) => { projPath(ctx, pts); rgba(ctx, c, a); ctx.fill() }
const uwidth = (ctx: any, font: string, size: number, text: string) => { ctx.selectFontFace(font, 0, 0); ctx.setFontSize(size); return ctx.textExtents(text).width }   // measure text so i can place stuff right after it

// paint a png onto the tilted plane (the circle icon + the updt badge)
const pimg = (ctx: any, surf: any, cu: number, cv: number, boxW: number, boxH: number, a: number, extraRot = 0) => {
    if (!surf || a <= 0.01) return
    const pw = surf.getWidth(), ph = surf.getHeight()
    const fit = Math.min(boxW / pw, boxH / ph), w = pw * fit, h = ph * fit
    const [sx, sy] = plane.project(cu, cv), sc = plane.scaleAt(cu, cv), ang = plane.angleAt(cu, cv)
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang + extraRot); ctx.scale(sc, sc); ctx.translate(-w / 2, -h / 2); ctx.scale(fit, fit)
    ctx.setSourceSurface(surf, 0, 0); ctx.paintWithAlpha(a); ctx.restore()
}

// one lil [KEY] tooltip chip + its label, gives back how wide it came out
const ptip = (ctx: any, u: number, by: number, key: string, label: string, a: number) => {
    const s = 20, cv = by - 14
    pfill(ctx, [[u, cv], [u + s, cv], [u + s, cv + s], [u, cv + s]], CAPBG, 0.55 * a)
    strokePath(ctx, plane, [[u, cv], [u + s, cv], [u + s, cv + s], [u, cv + s]], CYAN, 0.95 * a, 1, true)
    tiltText(ctx, plane, u + s / 2, by, key, TITLE, 12, WHT, a, { align: "c" } as any)
    tiltText(ctx, plane, u + s + 6, by, label, TITLE, 11, RED, a, { align: "l" } as any)
    return s + 6 + uwidth(ctx, TITLE, 11, label)
}

// works out what everything looks like RIGHT NOW from the phase + how far into it we r.
// "circle/line/bar" build it up, "shown" holds, "out*" tear it back down
const visuals = () => {
    const p = (phase === "shown" || phase === "hidden") ? 1 : clamp((Date.now() - phaseStart) / (DUR[phase] || 1))
    const V: any = { circleA: 0, circleX: CIRCX_F, lineA: 0, lineH: 0, barW: 0, textA: 0, badgeA: 0, metaA: 0 }
    switch (phase) {
        case "circle":   // circle fades in then blink-pulses twice
            V.circleA = p < 0.22 ? p / 0.22 : blink2((p - 0.22) / 0.78); V.circleX = CIRCX_S; break
        case "line":     // circle slides left, green line grows + pulses to its right
            V.circleA = 1; V.circleX = lerp(CIRCX_S, CIRCX_F, easeOut(Math.min(1, p / 0.55)))
            V.lineH = Math.min(1, p / 0.4); V.lineA = p < 0.4 ? p / 0.4 : blink2((p - 0.4) / 0.6); break
        case "bar":      // bar sweeps out from the line, text/badge/row fade in after it
            V.circleA = 1; V.lineA = 1; V.lineH = 1; V.barW = easeOut(p)
            V.textA = clamp((p - 0.25) / 0.5); V.badgeA = clamp((p - 0.55) / 0.4); V.metaA = clamp((p - 0.6) / 0.4); break
        case "shown":    // everything at full, just sits there
            V.circleA = 1; V.lineA = 1; V.lineH = 1; V.barW = 1; V.textA = 1; V.badgeA = 1; V.metaA = 1; break
        case "outbar":   // reverse: bar shrinks back into the line, no blink this time
            V.circleA = 1; V.lineA = 1; V.lineH = 1; V.barW = 1 - easeIn(p)
            V.metaA = 1 - clamp(p / 0.4); V.textA = 1 - clamp(p / 0.5); V.badgeA = 1 - clamp(p / 0.4); break
        case "outline":
            V.circleA = 1; V.lineH = 1 - easeIn(p); V.lineA = 1 - p; break
        case "outcircle":
            V.circleX = lerp(CIRCX_F, CIRCX_S, easeIn(p)); V.circleA = 1 - easeIn(p); break
    }
    return V
}

// the actual paint, runs every frame while its animating
const draw = (ctx: any) => {
    ctx.setOperator(0); ctx.paint(); ctx.setOperator(2)
    const V = visuals()
    if (V.circleA <= 0.003 && V.barW <= 0.003 && V.lineA <= 0.003) return   // nothing to show, bail early

    pimg(ctx, png("circle.png"), V.circleX, ROWY + 2, DC, DC, V.circleA)   // the circle/star icon on the left

    // the green vertical line the whole bar grows outta
    if (V.lineA > 0.01 && V.lineH > 0.01) {
        const lh = BH * V.lineH, y0 = ROWY - lh / 2, y1 = ROWY + lh / 2
        ctx.setOperator(12); pfill(ctx, [[LINEX - 2, y0], [LINEX + 4, y0], [LINEX + 4, y1], [LINEX - 2, y1]], GRBRT, 0.5 * V.lineA); ctx.setOperator(2)
        pfill(ctx, [[LINEX, y0], [LINEX + 3, y0], [LINEX + 3, y1], [LINEX, y1]], GRBRT, V.lineA)
    }

    // fram drawin' the main bar, chamfer bevel only on the bottom-right corner
    if (V.barW > 0.005) {
        const bw = BW * V.barW, y0 = ROWY - BH / 2, y1 = ROWY + BH / 2
        const bvx = Math.min(18, bw), bvy = 13
        const barPts: [number, number][] = [[BARX, y0], [BARX + bw, y0], [BARX + bw, y1 - bvy], [BARX + bw - bvx, y1], [BARX, y1]]
        pfill(ctx, barPts, GREEN, 0.97 * clamp(V.barW * 4))
        ctx.setOperator(12); strokePath(ctx, plane, barPts, GRBRT, 0.12, 2, true); ctx.setOperator(2)

        // clip to the bar so the title reveals as the bar sweeps right
        ctx.save(); projPath(ctx, [[BARX, y0 - 7], [BARX + bw, y0 - 7], [BARX + bw, y1 + 7], [BARX, y1 + 7]]); ctx.clip()
        const tcx = BARX + 18
        pfill(ctx, [[tcx, ROWY - 7], [tcx + 8, ROWY + 5], [tcx - 8, ROWY + 5]], BLACK, 0.92 * V.textA)   // the lil ▲ triangle
        const tfs = cTitle.length > 22 ? 13 : 16   // shrink long titles so they dont overflow the bar
        tiltText(ctx, plane, BARX + 34, ROWY + tfs * 0.34, cTitle, TFONT, tfs, BLACK, 0.95 * V.textA, { align: "l", bold: true } as any)
        ctx.restore()

        if (V.badgeA > 0.01) pimg(ctx, png("updt.png"), BARX + BW - 45, ROWY, 54, 46, V.badgeA, BADGE_ROT)   // the updt icon badge, right side
    }

    // the "NEW GIGS AVAILABLE: x" row + the [U]/[J] chips under the bar
    if (V.metaA > 0.01) {
        const A = V.metaA
        const ts = 14, tx0 = BARX + 1, tyT = GIGSY - ts + 1
        // spin the whole gigs row as one lump round its left end, so GIGS_ROT moves it all together
        const [pgx, pgy] = plane.project(tx0, GIGSY)
        ctx.save(); ctx.translate(pgx, pgy); ctx.rotate(GIGS_ROT); ctx.translate(-pgx, -pgy)
        pfill(ctx, [[tx0 + ts, tyT], [tx0 + ts, tyT + ts], [tx0, tyT + ts]], GREEN, 0.95 * A)   // the /| triangle bullet
        strokePath(ctx, plane, [[tx0, tyT + ts], [tx0 + ts, tyT]], GRBRT, 0.5 * A, 1)   // subtle highlight along its top edge
        const gfs = 14
        tiltText(ctx, plane, tx0 + ts + 8, GIGSY, cLabel, GFONT, gfs, GREEN, 0.96 * A, { align: "l" } as any)
        if (cValue) {   // only the update bar has a separate value (the count); the installed one bakes it into the label
            const lw = uwidth(ctx, GFONT, gfs, cLabel)
            tiltText(ctx, plane, tx0 + ts + 8 + lw + 7, GIGSY, cValue, GFONT, gfs + 1, GREEN, 0.98 * A, { align: "l" } as any)
        }
        ctx.restore()

        // tooltips pinned to the right. update bar = both [U][J], installed popup = just [J]
        const w2 = 26 + uwidth(ctx, TITLE, 11, "DISMISS")
        if (cShowU) {
            const w1 = 26 + uwidth(ctx, TITLE, 11, "UPGRADE"), gap = 18
            let tx = BARX + BW - (w1 + gap + w2)
            tx += ptip(ctx, tx, TIPY, "U", "UPGRADE", A) + gap
            ptip(ctx, tx, TIPY, "J", "DISMISS", A)
        } else {
            ptip(ctx, BARX + BW - w2, TIPY, "J", "DISMISS", A)
        }
    }
}

export const AurBarWindow = () => {
    area = DrawingArea({}); area.set_size_request(plane.width, plane.height)
    area.connect("draw", (_w: any, ctx: any) => (draw(ctx), false))
    win = Window({
        name: "aurbar", className: "aug aurbar",
        anchor: Anchor.LEFT, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
        margin_left: 14, visible: false, child: area,
    })
    timeout(3500, () => { getAurUpdates().then((r) => { if (r.count > 0) showAurBar() }) })   // let boot settle then peek
    recheck = interval(1800000, () => { if (!dismissed) getAurUpdates().then((r) => { if (r.count > 0) showAurBar() }) })
    return win
}
