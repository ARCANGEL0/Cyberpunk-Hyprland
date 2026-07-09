import { Window, DrawingArea } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval, timeout, execAsync } from "astal"
import AstalNotifd from "gi://AstalNotifd"
import { CYBER_DIR } from "../../env.ts"
import { TITLE, MONO, NAVINE, NEUE, ORBITRON } from "./fonts.ts"
import { makePlane, tiltText, strokePath } from "./proj.ts"
import { setReadFilter, removeFromHistory } from "./notifmessages.ts"
import { dockNotifDecr } from "./dock.ts"

const Cairo = (imports as any).cairo
const notifd = AstalNotifd.get_default()
const LIFETIME = 15000
const MAXFR = 8

const RED: [number, number, number] = [255, 74, 68]
const YEL: [number, number, number] = [255, 214, 46]
const CYN: [number, number, number] = [108, 230, 246]
const GOLDF: [number, number, number] = [112, 94, 26]
const GOLDD: [number, number, number] = [74, 61, 15]
const GREY: [number, number, number] = [178, 184, 192]
const GLYPH_COL: [number, number, number] = [175, 48, 42]
const WHT: [number, number, number] = [255, 255, 255]

const SND = `${CYBER_DIR}/assets/audio/notif.mp3`
const play = () => execAsync(["sh", "-c", `mpv --no-terminal --really-quiet "${SND}" 2>/dev/null || play -q "${SND}" 2>/dev/null || ffplay -nodisp -autoexit -loglevel quiet "${SND}" 2>/dev/null`]).catch(() => { })
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const easeOut = (t: number) => 1 - (1 - clamp(t)) * (1 - clamp(t))
const seg = (v: number, a: number, b: number) => clamp((v - a) / (b - a))
const beep = (p: number) => { if (p <= 0) return 0; if (p >= 1) return 1; const strobe = Math.sin(Date.now() / 1000 * 44) * 0.5 + 0.5; return clamp(p * 1.3) * (strobe > (1 - p) ? 1 : 0.16) }
const softg = (p: number) => { if (p <= 0) return 0; if (p >= 1) return 1; const dip = Math.sin(Date.now() / 1000 * 30) > 0.86 ? 0.55 : 1; return easeOut(clamp(p * 1.1)) * dip }
const GLY = "ABCDEF0123456789#%&/<>*=+|".split("")
const scramble = (s: string, amt: number) => amt < 0.02 ? s : s.split("").map((c) => c === " " ? c : (Math.random() < amt * 0.55 ? GLY[(Math.random() * GLY.length) | 0] : c)).join("")

const ICONS: any = {}
const png = (name: string) => { try { if (!ICONS[name]) ICONS[name] = Cairo.ImageSurface.createFromPNG(`${CYBER_DIR}/assets/icons/${name}`) } catch (e) { ICONS[name] = null } return ICONS[name] }
const _readIds = new Set<number>()

setReadFilter((id) => _readIds.has(id))

const TOTALW = 700, TOTALH = 650
const plane = makePlane({ w: TOTALW, h: TOTALH, yaw: -13, pitch: 3, roll: 0.1, focal: 1600, dist: 1600, pad: 32 })
const MARGIN_L = 16, MARGIN_T = 199
const CX = 68, FW = 400, BASEV = 74, FH = 43, STEP = 55

let msgs: any[] = []
let intro = 0, closing = false, lastActivity = 0, holdUntil = 0
let area: any = null, loop: any = null, win: any = null

const projPath = (ctx: any, pts: [number, number][]) => { ctx.newPath(); pts.forEach(([u, v], i) => { const [x, y] = plane.project(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }); ctx.closePath() }
const drawIcon = (ctx: any, surf: any, u: number, v: number, targetW: number, a: number, glow = false, glitch = 0) => {
    if (!surf || a <= 0.01) return
    const tt = Date.now()
    const jx = glitch > 0.02 ? (Math.sin(tt / 21) * 3 + (Math.sin(tt / 6.5) > 0.82 ? 6 : 0)) * glitch : 0
    const jy = glitch > 0.02 ? Math.sin(tt / 29) * 1.4 * glitch : 0
    const pw = surf.getWidth(), ph = surf.getHeight(), dh = targetW * ph / pw
    const [sx, sy] = plane.project(u + jx, v + jy + dh / 2), s = plane.scaleAt(u, v + dh / 2), ang = plane.angleAt(u, v + dh / 2)
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(s, s); ctx.translate(0, -dh / 2); ctx.scale(targetW / pw, dh / ph)
    if (glow || glitch > 0.02) { ctx.setOperator(12); ctx.setSourceSurface(surf, 0, 0); ctx.paintWithAlpha((glitch > 0.02 ? 0.5 : 0.3) * a); ctx.setOperator(2) }
    ctx.setSourceSurface(surf, 0, 0); ctx.paintWithAlpha(a)
    if (glitch > 0.1 && Math.sin(tt / 5) > 0.7) {
        const by = ph * (0.15 + 0.6 * (Math.sin(tt / 13) * 0.5 + 0.5)), bh = ph * 0.13
        ctx.save(); ctx.rectangle(0, by, pw, bh); ctx.clip(); ctx.setSourceSurface(surf, pw * 0.07 * glitch, 0); ctx.paintWithAlpha(a); ctx.restore()
    }
    ctx.restore()
}
const glitchText = (ctx: any, u: number, v: number, text: string, font: string, size: number, col: number[], a: number, p: number, opts: any = {}) => {
    if (a <= 0.01) return
    const g = 1 - clamp(p), s = scramble(text, g)
    if (g > 0.04) {
        const ox = 1.4 + g * 2.6
        tiltText(ctx, plane, u - ox, v, s, font, size, [255, 40, 60] as any, a * 0.5, { ...opts, glow: 0 })
        tiltText(ctx, plane, u + ox, v, s, font, size, [40, 230, 255] as any, a * 0.4, { ...opts, glow: 0 })
    }
    tiltText(ctx, plane, u, v, s, font, size, col as any, a, opts)
}
const glyphBlock = (ctx: any, u: number, v: number, a: number) => {
    const [sx, sy] = plane.project(u, v), s = plane.scaleAt(u, v), ang = plane.angleAt(u, v)
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(s, s)
    const cols = 7, rows = 4, fs = 3, gapx = 3, gapy = 6, off = 1
    ctx.selectFontFace(MONO, 0, 0)
    ctx.setFontSize(fs)
    const chars = () => {
        for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++) {
                ctx.moveTo(off + col * gapx, off + row * gapy + fs)
                ctx.showText(GLY[(row * cols + col * 3 + row * 7) % GLY.length])
            }
    }
    ctx.setOperator(12)
    for (const [dx, dy, da] of [[-3, 2, 0.04], [2, -3, 0.04], [0, 4, 0.05], [4, 0, 0.04]])
        { ctx.setSourceRGBA(0.5, 0.12, 0.1, da * a); ctx.translate(dx, dy); for (let t = 0; t < 2; t++) { ctx.translate(0.2, 0.2); chars(); ctx.translate(-0.2, -0.2) } chars(); ctx.translate(-dx, -dy) }
    for (const [dx, dy, da] of [[-1.5, 1.5, 0.08], [-2, 0, 0.1], [2, 0, 0.1], [0, -2, 0.1], [0, 2, 0.1]])
        { ctx.setSourceRGBA(0.75, 0.2, 0.15, da * a); ctx.translate(dx, dy); for (let t = 0; t < 2; t++) { ctx.translate(0.2, 0.2); chars(); ctx.translate(-0.2, -0.2) } chars(); ctx.translate(-dx, -dy) }
    for (const [dx, dy, da] of [[-1, 0, 0.12], [1, 0, 0.12], [0, -1, 0.12]])
        { ctx.setSourceRGBA(0.9, 0.28, 0.22, da * a); ctx.translate(dx, dy); chars(); ctx.translate(-dx, -dy) }
    ctx.setOperator(2)
    ctx.setSourceRGBA(0.5, 0.12, 0.1, 0.8 * a)
    for (let t = 0; t < 2; t++) { ctx.translate(0.3, 0.3); chars(); ctx.translate(-0.3, -0.3) }
    chars()
    ctx.restore()
}
const keycap = (ctx: any, u: number, v: number, label: string, a: number, dx = 0) => {
    const s = 24, kp: [number, number][] = [[u, v], [u + s, v], [u + s, v + s], [u, v + s]]
    projPath(ctx, kp); ctx.setSourceRGBA(0.02, 0.06, 0.07, 0.55 * a); ctx.fill()
    ctx.setOperator(12)
    projPath(ctx, kp); ctx.setSourceRGBA(CYN[0] / 255, CYN[1] / 255, CYN[2] / 255, 0.25 * a); ctx.setLineWidth(4); ctx.stroke()
    ctx.setOperator(2)
    projPath(ctx, kp); ctx.setSourceRGBA(CYN[0] / 255, CYN[1] / 255, CYN[2] / 255, 0.95 * a); ctx.setLineWidth(1); ctx.stroke()
    tiltText(ctx, plane, u + s / 2 + dx, v + s / 2 + 4, label, TITLE, 13, CYN, a, { bold: true, align: "c", glow: 0.6 })
}
const drawFrame = (ctx: any, vTop: number, prog: number, body: string, app: string, top: boolean, a: number) => {
    if (a <= 0.01) return
    const fe = easeOut(prog), Af = clamp(prog * 2.6) * a
    const u0 = CX + 5, v0 = vTop, v1 = vTop + FH, ch = 2, cw = 5, bc = 3
    const u1 = u0 + Math.max(122, FW * fe)
    const flk = prog > 0.02 && prog < 0.92 ? (Math.sin(Date.now() / 1000 * 52) > -0.35 ? 1 : 0.45) : 1
    const fill = top ? GOLDF : GOLDD, bA = (top ? 0.95 : 0.8) * flk
    const fpts: [number, number][] = [[u0, v0 - ch], [u0 + cw, v0], [u1, v0], [u1, v1], [u0 + bc, v1], [u0, v1 - bc]]
    projPath(ctx, fpts); ctx.setSourceRGBA(fill[0] / 255, fill[1] / 255, fill[2] / 255, 0.85 * Af * flk); ctx.fill()
    ctx.setOperator(12); projPath(ctx, fpts); ctx.setSourceRGBA(YEL[0] / 255, YEL[1] / 255, YEL[2] / 255, 0.18 * Af); ctx.setLineWidth(2); ctx.stroke(); ctx.setOperator(2)
    projPath(ctx, fpts); ctx.setSourceRGBA(YEL[0] / 255, YEL[1] / 255, YEL[2] / 255, bA * Af); ctx.setLineWidth(1); ctx.stroke()
    if (prog > 0.03 && prog < 0.97) { strokePath(ctx, plane, [[u1, v0 - 1], [u1, v1 + 1]], WHT, 0.7, 1.5); strokePath(ctx, plane, [[u1, v0 - 1], [u1, v1 + 1]], YEL, 0.5, 0.7) }
    const txt = clamp((prog - 0.55) / 0.3) * a
    if (txt > 0.01) {
        glitchText(ctx, u0 + 15, v0 + FH / 2 + 3, body, NEUE, 14, YEL, txt, clamp((prog - 0.55) / 0.4), { bold: true })
        if (!top) tiltText(ctx, plane, u1 - 5, v0 + 7, app, NEUE, 5, GREY, txt * 0.95, { bold: true, align: "r" })
    }
}

const draw = (ctx: any) => {
    ctx.setOperator(0); ctx.paint(); ctx.setOperator(2)
    if (!msgs.length) return
    const e = easeOut(intro)
    if (e <= 0.004) return
    ctx.save(); ctx.translate(MARGIN_L, MARGIN_T)

    const pA = seg(intro, 0, 0.30), aA = beep(pA)
    glyphBlock(ctx, -15, 2, aA * 0.9)
    glitchText(ctx, 20, 9, "CONNECTION 201.89.43", ORBITRON, 7, GLYPH_COL, aA, pA, { bold: true, glow: 0.4 })
    drawIcon(ctx, png("notif.png"), -24, 35, 42, aA, true, 1 - pA)

    const pB = seg(intro, 0.22, 0.48)
    drawIcon(ctx, png("file.png"), 3, 23, 76, softg(pB), true, (1 - pB) * 0.5)

    const pC = seg(intro, 0.52, 0.74), aC = beep(pC)
    drawIcon(ctx, png("message.png"), 67, 16, 30, aC, true, 1 - pC)
    glitchText(ctx, CX + 32, 36, msgs.length > 1 ? "NEW MESSAGES" : "NEW MESSAGE", NAVINE, 15, YEL, aC, pC, { bold: true, glow: 0.5, shadow: 0.8 })
    const pN = seg(intro, 0.58, 0.80)
    glitchText(ctx, CX + 2, 63, msgs[0].app, NAVINE, 20, CYN, clamp(pN * 1.3), pN, { bold: true, glow: 0.45 })

    const stackA = closing ? clamp(intro * 1.4) : 1
    msgs.forEach((m, i) => {
        const oa = m.out ? clamp(1 - (Date.now() - m.out) / 240) : 1
        drawFrame(ctx, BASEV + m.y, m.prog, m.text, m.app, i === 0, stackA * oa)
    })

    const lowY = BASEV + (msgs.length ? msgs[msgs.length - 1].y : 0) + FH + 12
    const rA = seg(intro, 0.8, 1) * stackA
    if (rA > 0.01) {
        const uR = CX + FW
        keycap(ctx, uR - 24, lowY, "E", rA, -1)
        tiltText(ctx, plane, uR - 34, lowY + 15, "READ MESSAGE", TITLE, 12, RED, rA, { bold: true, align: "r", glow: 0.7, bloom: 0.3 })
        keycap(ctx, uR - 165, lowY, "X", rA)
        tiltText(ctx, plane, uR - 175, lowY + 15, "DISMISS", TITLE, 12, RED, rA, { bold: true, align: "r", glow: 0.7, bloom: 0.3 })
    }

    ctx.restore()
}

const kick = () => {
    lastActivity = Date.now()
    if (loop) return
    loop = interval(16, () => {
        const now = Date.now()
        if (!closing) {
            if (intro < 0.5) intro = Math.min(0.5, intro + 0.045)
            else if (holdUntil === 0) holdUntil = now + 700
            else if (now >= holdUntil && intro < 1) intro = Math.min(1, intro + 0.045)
        } else if (intro > 0) {
            intro = Math.max(0, intro - 0.05)
            if (intro <= 0.0001) { msgs = []; closing = false; holdUntil = 0 }
        }
        msgs.forEach((m, i) => {
            const target = i * STEP
            if (m.y === undefined) m.y = target
            m.y += (target - m.y) * 0.25
            if (!closing && intro > 0.7 && !m.out && m.prog < 1) m.prog = Math.min(1, m.prog + 0.06)
        })
        const before = msgs.length
        msgs = msgs.filter((m) => !(m.out && now - m.out > 240))
        if (msgs.length !== before && msgs.length === 0 && !closing) closing = true
        area?.queue_draw()
        const animating = closing || intro < 1 || msgs.some((m) => m.prog < 1 || m.out || Math.abs(m.y - msgs.indexOf(m) * STEP) > 0.5)
        const busy = msgs.length > 0 && animating
        if (!busy && now - lastActivity > 300) { loop.cancel(); loop = null }
    })
}

const removeMsg = (m: any) => { if (m && !m.out) { m.out = Date.now(); kick() } }

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
const focusApp = (appRaw: string, desktopEntry: string) => {
    const keys = [norm(desktopEntry), norm(appRaw)].filter((k) => k.length > 1)
    if (!keys.length) return
    execAsync(["sh", "-c", "hyprctl clients -j"]).then((out: string) => {
        let clients: any[] = []
        try { clients = JSON.parse(out) } catch { return }
        let best: any = null, bs = 0
        for (const c of clients) {
            if (c.mapped === false) continue
            const cls = norm(c.class), icls = norm(c.initialClass), t = norm(c.title), it = norm(c.initialTitle)
            for (const k of keys) {
                let s = 0   // exact class hit is gold, partial class ok, title match is a last resort
                if (cls === k || icls === k) s = 100
                else if (cls.includes(k) || icls.includes(k) || (k.length > 3 && cls.length > 2 && k.includes(cls))) s = 60
                else if (t.includes(k) || it.includes(k)) s = 30
                if (s > bs) { bs = s; best = c }
            }
        }
        if (best && best.address) execAsync(["sh", "-c", `hyprctl dispatch focuswindow address:${best.address}`]).catch(() => { })
    }).catch(() => { })
}

export const notifReadCurrent = () => {
    const m = msgs[0]; if (!m || m.out) return
    m.read = true; _readIds.add(m.id)
    removeFromHistory(m.id); dockNotifDecr()
    try {
        const n = notifd?.get_notification?.(m.id)
        if (n) {
            let ids: any[] = []
            try { ids = (n.get_actions?.() ?? n.actions ?? []).map((a: any) => a?.id ?? a) } catch { }
            const act = ids.includes("default") ? "default" : ids[0]
            if (act) n.invoke?.(act); else n.dismiss?.()
        }
    } catch (e) { print("[cyber] notifRead:", e) }
    focusApp(m.appRaw, m.desktopEntry)   // ...then actually jump to the app, like i double-clicked the notif
    removeMsg(m)
}

export const notifDismiss = () => {
    if (!msgs.length) return
    const m = msgs[0]
    if (m && !m.out) {
        m.read = true; _readIds.add(m.id)
        removeFromHistory(m.id); dockNotifDecr()
        try { notifd?.get_notification?.(m.id)?.dismiss?.() } catch { }
        removeMsg(m)
    }
}

const add = (n: any) => {
    const appName = (n?.app_name || "").toString().trim()
    const summary = (n?.summary || "").toString().trim()
    const body = (n?.body || "").toString().replace(/\s+/g, " ").trim()
    const generic = !appName || appName.toLowerCase() === "notify-send"
    let desktopEntry = ""
    try { desktopEntry = ((n?.get_str_hint?.("desktop-entry") ?? n?.desktopEntry ?? "") + "").trim() } catch { }
    const m = {
        app: (generic ? (summary || appName || "MESSAGE") : appName).toUpperCase().slice(0, 24),
        text: ((s) => s.length > 70 ? s.slice(0, 50) + " __[...]" : s)((body || summary || "//")),
        appRaw: appName, desktopEntry,   // real app name + desktop id, so E can go find the window later
        id: n?.id ?? 0, born: Date.now(), out: 0, prog: 0, y: 0, read: false,
    }
    if (msgs.length === 0) { intro = 0; closing = false; holdUntil = 0 }
    closing = false
    msgs.unshift(m)
    while (msgs.length > MAXFR) msgs.pop()
    play(); kick()
    timeout(LIFETIME, () => { if (msgs.includes(m) && !m.read) removeMsg(m) })
}

export const NotifPopupWindow = () => {
    area = DrawingArea({}); area.set_size_request(MARGIN_L + plane.width + 20, MARGIN_T + plane.height + 20)
    area.connect("draw", (_w: any, ctx: any) => (draw(ctx), false))
    win = Window({
        name: "notifpopups", className: "aug notifpopups",
        anchor: Anchor.TOP | Anchor.LEFT, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
        child: area,
    })
    try {
        notifd.connect("notified", (_s: any, id: number) => {
            try { add((notifd.get_notification ? notifd.get_notification(id) : null) ?? { summary: "", body: "" }) } catch (e) { print("[cyber] popup:", e) }
        })
    } catch (e) { print("[cyber] notifpopup init:", e) }
    return win
}
