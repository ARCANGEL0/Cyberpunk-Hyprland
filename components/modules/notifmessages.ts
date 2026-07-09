// STORED: the old multi-row "MESSAGES" notification panel + glitch animation, kept for reuse elsewhere.
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

import { TITLE, MONO, ICONF, NAVINE, NEUE, ROBOTO, ROBOTO_BOLD, ROBOTO_LIGHT, PLAY, RAJDHANI } from "./fonts.ts"
import { dockNotifDecr } from "./dock.ts"
import { startTray, onTrayChange, getTrayItems, trayActivate, trayMenu, trayMenuClick, TrayItem, MenuNode } from "./tray.ts"
const XICON = "\uf00d", ENVELOPE = "\uf0e0"
const YELLOW: [number, number, number] = [255, 178, 36]
const RED: [number, number, number] = [255, 74, 68]
const WHITE: [number, number, number] = [225, 232, 242]
const GREY: [number, number, number] = [120, 130, 140]
const GREY_DARK: [number, number, number] = [30, 32, 36]
const DIM_RED: [number, number, number] = [80, 15, 15]
const DIM_BG: [number, number, number] = [10, 12, 20]
const SND = `${CYBER_DIR}/assets/audio/notif.mp3`
const ICON_3D = `${CYBER_DIR}/assets/icons/file.png`
let phoneIcon: any = null
// mpv/ffplay
const play = () => execAsync(["sh", "-c", `mpv --no-terminal --really-quiet "${SND}" 2>/dev/null || ffplay -nodisp -autoexit -loglevel quiet "${SND}" 2>/dev/null || paplay "${SND}" 2>/dev/null || play -q "${SND}" 2>/dev/null`]).catch(() => {})
const clamp = (n: number) => Math.max(0, Math.min(1, n))

const ICONW = 64
const W = 400
const HEADER = 48, ROWH = 50, ROW_GAP = 6, MAXROWS = 7, FOOTER_H = 24
const H = HEADER + MAXROWS * (ROWH + ROW_GAP) + FOOTER_H + 8
const TOTALW = ICONW + W
const plane = makePlane({ w: TOTALW, h: H, yaw: -16, pitch: 5, roll: 1, focal: 1600, dist: 1600, pad: 26 })

const MARGIN_L = 30, MARGIN_T = 170
const projQuad = (x0: number, y0: number, x1: number, y1: number): [number, number][] =>
    ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]).map(([u, v]) => plane.project(u, v))

const DISMISS_Q = projQuad(ICONW + 145, 4, ICONW + 275, 28)
const FOOTER_Y = HEADER + MAXROWS * (ROWH + ROW_GAP) + 6
const CLOSE_Q = projQuad(ICONW + 330, FOOTER_Y + 2, ICONW + 400, FOOTER_Y + 31)
const DISMISS_FOOTER_Q = projQuad(ICONW + 230, FOOTER_Y + 2, ICONW + 290, FOOTER_Y + 31)
// header tabs (MESSAGES | APPS) + the new bottom-left dismiss-all
const MSG_TAB_Q = projQuad(ICONW + 16, 2, ICONW + 130, 30)
const APPS_TAB_Q = projQuad(ICONW + 138, 2, ICONW + 250, 30)
const DISMISS_BL_Q = projQuad(ICONW + 12, FOOTER_Y + 2, ICONW + 130, FOOTER_Y + 31)
const APPS_GLYPH = "󰀻"   // nf-md-apps grid — swap this glyph if u want a diff icon
const pip = (px: number, py: number, q: [number, number][]) => {
    let inside = false
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const [xi, yi] = q[i], [xj, yj] = q[j]
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
    }
    return inside
}
const projPath = (ctx: any, pts: [number, number][]) => { ctx.newPath(); pts.forEach(([u, v], i) => { const [x, y] = plane.project(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }); ctx.closePath() }
const keycap = (ctx: any, u: number, v: number, label: string, a: number, dx = 0, rot = 0) => {
    const s = 24; const cx = u + s / 2, cy = v + s / 2
    const cos = Math.cos(rot), sin = Math.sin(rot)
    const kp: [number, number][] = [[u, v], [u + s, v], [u + s, v + s], [u, v + s]].map(([px, py]) => {
        const rx = cx + (px - cx) * cos - (py - cy) * sin
        const ry = cy + (px - cx) * sin + (py - cy) * cos
        return [rx, ry]
    })
    projPath(ctx, kp); ctx.setSourceRGBA(0.02, 0.06, 0.07, 0.55 * a); ctx.fill()
    ctx.setOperator(12); projPath(ctx, kp); ctx.setSourceRGBA(NEON.cyan[0]/255, NEON.cyan[1]/255, NEON.cyan[2]/255, 0.25 * a); ctx.setLineWidth(4); ctx.stroke(); ctx.setOperator(2)
    projPath(ctx, kp); ctx.setSourceRGBA(NEON.cyan[0]/255, NEON.cyan[1]/255, NEON.cyan[2]/255, 0.95 * a); ctx.setLineWidth(1); ctx.stroke()
    tiltText(ctx, plane, u + s / 2 + dx, v + s / 2 + 4, label, TITLE, 13, NEON.cyan, a, { bold: true, align: "c", glow: 0.6, extraRotate: 0.009 })
}
// paint a tray item's pixbuf onto the tilted plane, centered at (u, vCenter)
const drawTrayIcon = (ctx: any, pixbuf: any, u: number, vCenter: number, size: number, a: number) => {
    if (!pixbuf || a <= 0.01) return
    try {
        const pw = pixbuf.get_width(), ph = pixbuf.get_height()
        const dw = size, dh = size * ph / pw
        const [sx, sy] = plane.project(u, vCenter)
        const s = plane.scaleAt(u, vCenter), ang = plane.angleAt(u, vCenter)
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(s, s)
        ctx.translate(-dw / 2, -dh / 2); ctx.scale(dw / pw, dh / ph)
        Gdk.cairo_set_source_pixbuf(ctx, pixbuf, 0, 0)
        ctx.paintWithAlpha(a); ctx.restore()
    } catch (e) { print("[tray] drawIcon:", e) }
}

const getGroups = () => {
    const g = new Map<string, { app: string, last: any, count: number }>()
    for (const m of msgs) {
        const key = m.app || "UNKNOWN"
        if (!g.has(key)) g.set(key, { app: key, last: m, count: 0 })
        const t = g.get(key)!
        t.count++
        t.last = m
    }
    return Array.from(g.values()).sort((a, b) => b.last.born - a.last.born)
}

const rowItems = () => {
    if (view === "detail" && selectedApp) return msgs.filter(m => m.app === selectedApp)
    return getGroups()
}

const trayRows = () => getTrayItems().filter(t => t.status !== "Passive")
const rowAt = (x: number, y: number) => {
    if (view === "apps") {
        const t = trayRows()
        for (let i = 0; i < t.length; i++) {
            const my = HEADER + i * (ROWH + ROW_GAP) - scrollOffset
            if (pip(x, y, projQuad(ICONW + 24, my, ICONW + W - 20, my + ROWH))) return i
        }
        return -1
    }
    const items = rowItems()
    const n = Math.min(items.length, MAXROWS + 8)
    if (view === "detail" && selectedApp) {
        const soff = scrollOffset
        let acc = 0
        for (let i = items.length - 1; i >= 0 && i > items.length - 1 - n; i--) {
            const body = (items[i].body || "//")
            const idealW = 100 + Math.min(body.length * 4, 286)
            const fw = Math.min(W - 70, Math.max(117, idealW - 3))
            const cpl = Math.max(4, Math.floor((fw - 12) / 8))
            const lines = Math.max(1, Math.ceil(body.length / cpl))
            const fh = Math.max(36, 18 + lines * 22 + 10)
            const my = HEADER + acc - soff
            if (pip(x, y, projQuad(ICONW + 24, my, ICONW + 24 + fw, my + fh))) return i
            acc += fh + ROW_GAP
        }
    } else {
        const soff = scrollOffset
        for (let i = 0; i < n; i++) {
            const my = HEADER + i * (ROWH + ROW_GAP) - soff
            if (pip(x, y, projQuad(ICONW + 24, my, ICONW + W - 20, my + ROWH))) return i
        }
    }
    return -1
}

const onScroll = (_w: any, e: any) => {
    let dy = 0
    try {
        const [hasDir, dir] = e.get_scroll_direction()
        if (hasDir) {
            if (dir === Gdk.ScrollDirection.UP) dy = 1
            else if (dir === Gdk.ScrollDirection.DOWN) dy = -1
        } else {
            const [, , dy_val] = e.get_scroll_deltas()
            if (dy_val > 0.5 || dy_val < -0.5) dy = -dy_val
        }
    } catch { try { const [, , dy_val] = e.get_scroll_deltas(); if (dy_val > 0.5 || dy_val < -0.5) dy = -dy_val } catch {} }
    if (dy === 0) return true
    // scroll the open right-click menu instead of the list
    if (menuState && menuState.mmax) {
        menuState.mscroll = Math.max(0, Math.min(menuState.mmax, (menuState.mscroll || 0) - dy * 28))
        kick(); return true
    }
    if (view === "apps") {
        const gContentH = trayRows().length * (ROWH + ROW_GAP)
        const maxOff = Math.max(0, gContentH - MAXROWS * (ROWH + ROW_GAP))
        scrollOffset = Math.max(0, Math.min(maxOff, scrollOffset - dy * 30))
        kick(); return true
    }
    if (view === "detail" && selectedApp) {
        const detailItems = msgs.filter(m => m.app === selectedApp)
        let totalH = 0
        for (let i = detailItems.length - 1; i >= 0; i--) {
            const body = (detailItems[i].body || "//")
            const idealW = 100 + Math.min(body.length * 4, 286)
            const fw = Math.min(W - 70, Math.max(117, idealW - 3))
            const cpl = Math.max(4, Math.floor((fw - 12) / 8))
            const lines = Math.max(1, Math.ceil(body.length / cpl))
            const fh = Math.max(36, 18 + lines * 22 + 10)
            totalH += fh + ROW_GAP
        }
        const visibleH2 = MAXROWS * (ROWH + ROW_GAP)
        const maxOff = Math.max(0, totalH - visibleH2)
        scrollOffset = Math.max(0, Math.min(maxOff, scrollOffset - dy * 30))
    } else {
        const gs = getGroups()
        const gContentH = gs.length * (ROWH + ROW_GAP)
        const maxOff = Math.max(0, gContentH - MAXROWS * (ROWH + ROW_GAP))
        scrollOffset = Math.max(0, Math.min(maxOff, scrollOffset - dy * 30))
    }
    kick(); return true
}

let msgs: any[] = []
let panelIntro = 0, lastActivity = 0, hudVisible = false
let area: any = null, loop: any = null, win: any = null
let hoverRow = -1, dismissHover = false
let tabHover: "msg" | "apps" | null = null, blDismissHover = false
let trayHoverIdx = -1
let menuState: { item: TrayItem, nodes: MenuNode[], ax: number, ay: number, hover: number, mx?: number, my?: number, mh?: number, mw?: number, mscroll?: number, mmax?: number } | null = null
let clickPulse = 0, rowPulse = 0, rowPulseIdx = -1
let animProg = 0
let _readFilter: ((id: number) => boolean) | null = null
let view: "main" | "detail" | "apps" = "apps"
let selectedApp: string | null = null
let scrollOffset = 0
let draggingScroll = false

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
        const c = ([[0, 0], [TOTALW, 0], [TOTALW, H], [0, H]]).map(([u, v]) => plane.project(u, v))
        const xs = c.map(p => p[0]), ys = c.map(p => p[1])
        r.unionRectangle({
            x: Math.floor(MARGIN_L + Math.min(...xs)) - 2, y: Math.floor(MARGIN_T + Math.min(...ys)) - 2,
            width: Math.ceil(Math.max(...xs) - Math.min(...xs)) + 4, height: Math.ceil(Math.max(...ys) - Math.min(...ys)) + 4,
        })
        gw.input_shape_combine_region(r, 0, 0)
    } catch (e) { print("[cyber] applyInput:", e) }
}

const removeMsg = (m: any) => { m.out = Date.now(); kick(); timeout(260, () => {
    msgs = msgs.filter(x => x !== m)
    if (view === "detail" && selectedApp && !msgs.some(x => x.app === selectedApp)) {
        view = "main"; selectedApp = null; hoverRow = -1; dismissHover = false; scrollOffset = 0
    }
    applyInput(); kick()
}) }
export const dismissAll = () => {
    const now = Date.now()
    if (view === "detail" && selectedApp) {
        const appMsgs = msgs.filter(m => m.app === selectedApp && !m.out)
        appMsgs.forEach(m => { m.out = now })
        dockNotifDecr(appMsgs.length)
        kick(); timeout(280, () => {
            msgs = msgs.filter(m => m.app !== selectedApp)
            view = "main"; selectedApp = null; hoverRow = -1; dismissHover = false; scrollOffset = 0
            applyInput(); kick()
        })
        try { for (const m of appMsgs) { const n = notifd?.get_notification?.(m.id); if (n) n.dismiss?.() } } catch {}
    } else {
        msgs.forEach(m => { if (!m.out) m.out = now })
        kick(); timeout(280, () => { msgs = []; applyInput(); kick() })
        try { for (const n of (notifd?.get_notifications?.() ?? [])) n.dismiss?.() } catch {}
    }
}
// same window-hunt as the popup's E key — find the app in hyprland n jump to it (like double-clickin a KDE notif)
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
                let s = 0   // exact class = best, partial class = ok, title = last resort
                if (cls === k || icls === k) s = 100
                else if (cls.includes(k) || icls.includes(k) || (k.length > 3 && cls.length > 2 && k.includes(cls))) s = 60
                else if (t.includes(k) || it.includes(k)) s = 30
                if (s > bs) { bs = s; best = c }
            }
        }
        if (best && best.address) execAsync(["sh", "-c", `hyprctl dispatch focuswindow address:${best.address}`]).catch(() => { })
    }).catch(() => { })
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
    focusApp(m.appRaw, m.desktopEntry)   // ...then jump to the app window too
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
        const hText = view === "detail" && selectedApp ? `MESSAGES > ${selectedApp}` : "MESSAGES"
        tiltText(ctx, plane, ICONW + 58 + offset * 2, 27, hText, TITLE, 13,
            [140, 80, 70], headerDistort * 0.3 * pa, { bold: true, glow: 0.2 })
    }

    ctx.restore()
}

const draw = (ctx: any) => {
    const groups = getGroups()
    const hasItems = view === "apps" ? true : (view === "detail" && selectedApp ? msgs.some(m => m.app === selectedApp) : groups.length > 0)
    if (!hasItems && panelIntro <= 0) return

    const items = view === "detail" && selectedApp
        ? msgs.filter(m => m.app === selectedApp)
        : groups
    const shown = items.slice(0, MAXROWS + 8)
    const pa = clamp(panelIntro / 0.25)

    // ── Phone icon ──
    if (animProg > 0) {
        const iconA = clamp(animProg * 6) * pa
        try {
            if (!phoneIcon) phoneIcon = Cairo.ImageSurface.createFromPNG(ICON_3D)
            const [pw, ph] = [phoneIcon.getWidth(), phoneIcon.getHeight()]
            const iconDrawH = 90; const iconDrawW = (pw / ph) * iconDrawH
            const iconX = 42 - iconDrawW / 2; const iconY = -24
            ctx.save(); ctx.setSourceRGBA(1, 1, 1, iconA)
            const [sx, sy] = plane.project(iconX, iconY + iconDrawH / 2)
            const s = plane.scaleAt(iconX, iconY + iconDrawH / 2)
            const ang = plane.angleAt(iconX, iconY + iconDrawH / 2)
            ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(s, s)
            ctx.translate(0, -iconDrawH / 2)
            ctx.scale(iconDrawW / pw, iconDrawH / ph)
            ctx.setSourceSurface(phoneIcon, 0, 0); ctx.paint(); ctx.restore()
        } catch (e) {
            tiltText(ctx, plane, 42, 22, "\uf095", ICONF, 20, NEON.cyan, clamp(animProg * 6) * pa, { bold: true })
        }
    }

    // ── Content container glass background ──
    if (animProg > 0) {
        const GL = ICONW + 10, GR = ICONW + W - 4, GT = HEADER - 19, GB = FOOTER_Y + 2
        fillQuad(ctx, plane, GL, GT, GR, GB, [22, 30, 45], 0.25 * pa)
        fillQuad(ctx, plane, GL, GT, GR, GB, NEON.cyan, 0.02 * pa)
        strokePath(ctx, plane, [[GL, GT], [GL, GB]], [60, 100, 130], 0.1 * pa, 0.8)
        strokePath(ctx, plane, [[GL, GB], [GR, GB]], [60, 100, 130], 0.1 * pa, 0.8)
        strokePath(ctx, plane, [[GR, GT], [GR, GB]], [60, 100, 130], 0.1 * pa, 0.8)
    }

    // ── Header: MESSAGES | APPS tabs ──
    if (animProg > 0.10) {
        const labelA = clamp((animProg - 0.10) * 5) * pa
        const msgActive = view !== "apps", appsActive = view === "apps"
        const msgHov = tabHover === "msg", appsHov = tabHover === "apps"
        const BCYAN: [number, number, number] = [160, 250, 255]   // very bright cyan for active/hover
        // active (or hovered) tab = bright cyan, inactive = bright red neon — both glow
        const tcol = (active: boolean, hov: boolean): [number, number, number] => (active || hov) ? BCYAN : NEON.red
        const mC = tcol(msgActive, msgHov), aC = tcol(appsActive, appsHov)

        // MESSAGES tab (+ breadcrumb in detail)
        tiltText(ctx, plane, ICONW + 22, 16, ENVELOPE, ICONF, 13, mC, labelA * 0.9, { bold: true, glow: 0.6 })
        tiltText(ctx, plane, ICONW + 42, 16, "MESSAGES", RAJDHANI, 18, mC, labelA, { bold: true, glow: 0.6 })
        if (view === "detail" && selectedApp) {
            tiltText(ctx, plane, ICONW + 110, 16, ">", ROBOTO_BOLD, 11, BCYAN, labelA, { glow: 0.6 })
            tiltText(ctx, plane, ICONW + 122, 16, selectedApp, ROBOTO_BOLD, 11, BCYAN, labelA, { glow: 0.6 })
        } else {
            // APPS tab (hidden in detail view to keep the breadcrumb clean)
            tiltText(ctx, plane, ICONW + 144, 16, APPS_GLYPH, ICONF, 17, aC, labelA * 0.9, { bold: true, glow: 0.6 })
            tiltText(ctx, plane, ICONW + 166, 16, "APPS", RAJDHANI, 18, aC, labelA, { bold: true, glow: 0.6 })
        }

        // underline under the active tab (bright cyan, matching the active tab)
        const barY = 26
        if (view === "detail" && selectedApp) {
            const msgBarEnd = ICONW + 105
            const titleBarEnd = msgBarEnd + 14 + Math.max(40, selectedApp.length * 7)
            fillQuad(ctx, plane, ICONW + 12, barY, msgBarEnd, barY + 2, BCYAN, 0.75 * labelA)
            fillQuad(ctx, plane, msgBarEnd + 14, barY, titleBarEnd, barY + 2, BCYAN, 0.75 * labelA)
            strokePath(ctx, plane, [[titleBarEnd + 4, barY + 0.5], [ICONW + W - 8, barY + 0.5]], NEON.red, 0.4 * labelA, 1.2)
        } else {
            // a bar under each tab, coloured to match it (active/hover = cyan, inactive = red)
            fillQuad(ctx, plane, ICONW + 16, barY, ICONW + 128, barY + 2, mC, 0.75 * labelA)
            fillQuad(ctx, plane, ICONW + 138, barY, ICONW + 240, barY + 2, aC, 0.75 * labelA)
            strokePath(ctx, plane, [[ICONW + 250, barY + 0.5], [ICONW + W - 8, barY + 0.5]], NEON.red, 0.4 * labelA, 1.2)
        }
    }

    // ── Data corruption overlay ──
    drawDataCorruption(ctx, pa)

    // ── Rows ──
    const now = Date.now()
    const visibleH = MAXROWS * (ROWH + ROW_GAP)
    ctx.save()
    const cq = projQuad(ICONW + 10, HEADER - 12, ICONW + W - 2, FOOTER_Y - 4)
    ctx.newPath(); cq.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip()

    if (view === "apps") {
        const tItems = getTrayItems().filter(t => t.status !== "Passive")
        const gContentH = tItems.length * (ROWH + ROW_GAP)
        const gMaxOff = Math.max(0, gContentH - visibleH)
        scrollOffset = Math.min(gMaxOff, Math.max(0, scrollOffset))
        for (let i = 0; i < tItems.length; i++) {
            const t = tItems[i]
            const ma = Math.min(1, clamp((animProg - 0.25 - i * 0.05) / 0.2))
            if (ma <= 0.01) continue
            const my = HEADER + i * (ROWH + ROW_GAP) - scrollOffset
            if (my + ROWH < HEADER || my > FOOTER_Y) continue
            const hovered = i === trayHoverIdx
            if (hovered) {
                const bv = 7, x0 = ICONW + 24, x1 = ICONW + W - 20, y0 = my + 1, y1 = my + ROWH - 3
                const bub: [number, number][] = [[x0 + bv, y0], [x1, y0], [x1, y1 - bv], [x1 - bv, y1], [x0 + 10, y1], [x0 + 5, y1 + 3], [x0, y1 + 3], [x0, y0 + bv]]
                const rp = bub.map(([u, v]) => plane.project(u, v))
                ctx.newPath(); rp.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
                ctx.setSourceRGBA(NEON.cyan[0] / 255, NEON.cyan[1] / 255, NEON.cyan[2] / 255, 0.5 * ma); ctx.setLineWidth(1.5); ctx.stroke()
            }
            strokePath(ctx, plane, [[ICONW + 24, my + ROWH - 1], [ICONW + W - 20, my + ROWH - 1]], GREY, 0.2 * ma, 0.5)
            drawTrayIcon(ctx, t.pixbuf, ICONW + 42, my + ROWH / 2 - 2, 22, ma)
            const nameCol: [number, number, number] = hovered ? NEON.cyan : WHITE
            tiltText(ctx, plane, ICONW + 66, my + 22, (t.title || t.id || "?").slice(0, 30), TITLE, 14, nameCol, ma, { bold: true })
            tiltText(ctx, plane, ICONW + 66, my + 39, t.id.slice(0, 36), MONO, 9, GREY, 0.5 * ma)
        }
        if (gContentH > visibleH) {
            const sbX = ICONW + W - 6, sbTop = HEADER + 4, sbH = visibleH - 8
            const thumbH = Math.max(8, sbH * (visibleH / gContentH))
            const thumbTop = sbTop + (scrollOffset / (gContentH - visibleH)) * (sbH - thumbH)
            fillQuad(ctx, plane, sbX, sbTop, sbX + 2, sbTop + sbH, DIM_RED, 0.3 * pa)
            fillQuad(ctx, plane, sbX, thumbTop, sbX + 2, thumbTop + thumbH, NEON.red, 0.9 * pa)
        }
        if (tItems.length === 0) tiltText(ctx, plane, ICONW + 22, HEADER + 26, "NO TRAY APPS", MONO, 11, GREY, 0.5 * pa)
    } else if (view === "detail" && selectedApp) {
        const detailItems = shown as any[]

        // Compute adaptive frame sizes
        const layouts = detailItems.map((m: any) => {
            const body = m.body || "//"
            const idealW = 100 + Math.min(body.length * 4, 286)
            const fw = Math.min(W - 70, Math.max(117, idealW - 3))
            const cpl = Math.max(4, Math.floor((fw - 12) / 8))
            const lines = Math.max(1, Math.ceil(body.length / cpl))
            const fh = Math.max(36, 18 + lines * 22 + 10)
            return { fw, fh, cpl, lines, body }
        })

        // Compute Y positions from bottom
        const yPos: number[] = []
        let acc = 0
        for (let i = layouts.length - 1; i >= 0; i--) {
            yPos[i] = acc
            acc += layouts[i].fh + ROW_GAP
        }
        const totalContentH = Math.max(acc, visibleH)
        const maxOff = Math.max(0, totalContentH - visibleH)
        scrollOffset = Math.min(maxOff, Math.max(0, scrollOffset))

        for (let idx = layouts.length - 1; idx >= 0; idx--) {
            const m = detailItems[idx]; const { fw, fh, cpl, lines, body } = layouts[idx]
            const age = now - m.born
            const rowIntro = clamp((animProg - 0.25 - idx * 0.04) / 0.15) * clamp(age / 60)
            const ma = m.out > 0 ? clamp(1 - (now - m.out) / 220) : clamp(rowIntro)
            if (ma <= 0.01) continue
            const my = HEADER + yPos[idx] - scrollOffset
            if (my + fh < HEADER || my > FOOTER_Y) continue
            const hovered = idx === hoverRow; const pulse = idx === rowPulseIdx ? rowPulse : 0
            const FC: [number, number, number] = NEON.cyan

            const x0 = ICONW + 24
            const x1 = x0 + fw
            const y0 = my + 1
            const y1 = my + fh - 3
            const bv = 7
            const bub: [number, number][] = [[x0 + bv, y0], [x1, y0], [x1, y1 - bv], [x1 - bv, y1], [x0 + 10, y1], [x0 + 5, y1 + 3], [x0, y1 + 3], [x0, y0 + bv]]
            const bp = bub.map(([u, v]) => plane.project(u, v))
            ctx.newPath(); bp.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
            ctx.setOperator(12); ctx.setSourceRGBA(NEON.cyan[0]/255, NEON.cyan[1]/255, NEON.cyan[2]/255, 0.2 * ma); ctx.fill(); ctx.setOperator(2)
            if (hovered) {
                ctx.newPath(); bp.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
                ctx.setSourceRGBA(NEON.cyan[0]/255, NEON.cyan[1]/255, NEON.cyan[2]/255, 0.5 * ma); ctx.setLineWidth(2); ctx.stroke()
            }
            ctx.newPath(); bp.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
            ctx.setSourceRGBA(NEON.cyan[0]/255, NEON.cyan[1]/255, NEON.cyan[2]/255, ma * (hovered ? 1 : 0.7)); ctx.setLineWidth(hovered ? 1.5 : 0.8); ctx.stroke()

            // Body text only (no title), wrapped
            const ta = Math.min(1, ma * (hovered ? 1.1 : 1))
            let ty = my + 17
            for (let j = 0; j < lines; j++) {
                const line = body.slice(j * cpl, (j + 1) * cpl)
                tiltText(ctx, plane, x0 + 6, ty, line, PLAY, 14, FC, 0.85 * ma)
                ty += 22
            }
        }

        if (totalContentH > visibleH) {
            const sbX = ICONW + W - 6; const sbTop = HEADER + 4; const sbH = visibleH - 8
            const thumbH = Math.max(8, sbH * (visibleH / totalContentH))
            const maxOff2 = totalContentH - visibleH; const thumbTop = sbTop + (scrollOffset / maxOff2) * (sbH - thumbH)
            fillQuad(ctx, plane, sbX, sbTop, sbX + 2, sbTop + sbH, DIM_RED, 0.3 * pa)
            ctx.setOperator(12)
            fillQuad(ctx, plane, sbX, thumbTop, sbX + 2, thumbTop + thumbH, NEON.red, 0.9 * pa)
            strokePath(ctx, plane, [[sbX + 0.5, thumbTop], [sbX + 0.5, thumbTop + thumbH]], NEON.red, 0.5 * pa, 3)
            ctx.setOperator(2)
            strokePath(ctx, plane, [[sbX + 0.5, thumbTop], [sbX + 0.5, thumbTop + thumbH]], NEON.red, 0.3 * pa, 5)
        }

        if (shown.length === 0) {
            tiltText(ctx, plane, ICONW + 22, HEADER + 26, "NO MESSAGES", MONO, 11, GREY, 0.5 * pa)
        }
    } else {
        const gs = shown as { app: string; last: any; count: number }[]
        const gContentH = gs.length * (ROWH + ROW_GAP)
        const gMaxOff = Math.max(0, gContentH - visibleH)
        scrollOffset = Math.min(gMaxOff, Math.max(0, scrollOffset))

        const activeRow = hoverRow >= 0 ? hoverRow : 0
        for (let i = 0; i < gs.length; i++) {
            const g = gs[i]
            const rowIntro = clamp((animProg - 0.25 - i * 0.06) / 0.2)
            const ma = Math.min(1, rowIntro)
            if (ma <= 0.01) continue
            const my = HEADER + i * (ROWH + ROW_GAP) - scrollOffset
            if (my + ROWH < HEADER || my > FOOTER_Y) continue
            const hovered = i === hoverRow
            if (hovered) {
                const bv = 7; const x0 = ICONW + 24, x1 = ICONW + W - 20, y0 = my + 1, y1 = my + ROWH - 3
const bub: [number, number][] = [[x0 + bv, y0], [x1, y0], [x1, y1 - bv], [x1 - bv, y1], [x0 + 10, y1], [x0 + 5, y1 + 3], [x0, y1 + 3], [x0, y0 + bv]]
                const rp = bub.map(([u, v]) => plane.project(u, v))
                ctx.newPath(); rp.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
                ctx.setSourceRGBA(YELLOW[0]/255, YELLOW[1]/255, YELLOW[2]/255, 0.7 * ma); ctx.setLineWidth(1); ctx.stroke()
            }
            strokePath(ctx, plane, [[ICONW + 24, my + ROWH - 1], [ICONW + W - 20, my + ROWH - 1]], GREY, 0.2 * ma, 0.5)
            const appCol: [number, number, number] = hovered ? YELLOW : GREY
            const bodyCol: [number, number, number] = hovered ? GREY : GREY
            const ta = Math.min(1, ma * (hovered ? 1.1 : 1))
            tiltText(ctx, plane, ICONW + 30, my + 16, g.app, TITLE, 14, appCol, ta, { bold: true })
            const preview = (g.last.body || g.last.title || "//").slice(0, 36)
            tiltText(ctx, plane, ICONW + 30, my + 39, preview, TITLE, 12, bodyCol, 0.55 * ma, { bold: true })
        }

        if (gContentH > visibleH) {
            const sbX = ICONW + W - 6; const sbTop = HEADER + 4; const sbH = visibleH - 8
            const thumbH = Math.max(8, sbH * (visibleH / gContentH))
            const gMaxOff2 = gContentH - visibleH; const thumbTop = sbTop + (scrollOffset / gMaxOff2) * (sbH - thumbH)
            fillQuad(ctx, plane, sbX, sbTop, sbX + 2, sbTop + sbH, DIM_RED, 0.3 * pa)
            ctx.setOperator(12)
            fillQuad(ctx, plane, sbX, thumbTop, sbX + 2, thumbTop + thumbH, NEON.red, 0.9 * pa)
            strokePath(ctx, plane, [[sbX + 0.5, thumbTop], [sbX + 0.5, thumbTop + thumbH]], NEON.red, 0.5 * pa, 3)
            ctx.setOperator(2)
            strokePath(ctx, plane, [[sbX + 0.5, thumbTop], [sbX + 0.5, thumbTop + thumbH]], NEON.red, 0.3 * pa, 5)
        }

        if (gs.length === 0) {
            tiltText(ctx, plane, ICONW + 22, HEADER + 26, "NO RECENT ALERTS", MONO, 11, GREY, 0.5 * pa)
        }
    }
    ctx.restore()

    // ── Footer ──
    const fA = clamp((animProg - 0.30) * 5) * pa
    if (fA > 0.01) {
        strokePath(ctx, plane, [[ICONW + 12, FOOTER_Y], [ICONW + W - 2, FOOTER_Y]], NEON.red, 0.6 * fA, 1.5)
        // bottom-LEFT dismiss-all (plain clickable, no shortcut) — only in messages views w/ notifs
        if (view !== "apps" && getGroups().length > 0) {
            const dc: [number, number, number] = blDismissHover ? NEON.cyan : NEON.red
            const dg = blDismissHover ? 0.9 : 0.5
            tiltText(ctx, plane, ICONW + 14, FOOTER_Y + 22, XICON, ICONF, 12, dc, fA * 0.9, { bold: true, glow: dg })
            tiltText(ctx, plane, ICONW + 30, FOOTER_Y + 22, view === "detail" ? "DISMISS ALL" : "DISMISS", ROBOTO_BOLD, 10, dc, fA * (blDismissHover ? 1 : 0.85), { bold: true, glow: dg })
        }
        keycap(ctx, ICONW + 326, FOOTER_Y + 7, "M", fA)
        tiltText(ctx, plane, ICONW + 358, FOOTER_Y + 22, "CLOSE", ROBOTO_BOLD, 10, RED, fA, { bold: true, glow: 0.7, bloom: 0.3 })
    }

    // ── tray right-click menu overlay (flat, area-local coords) ──
    if (menuState) drawTrayMenu(ctx)
}

const MENU_ITEM_H = 24, MENU_SEP_H = 8
// filled quad on the tilted plane from a UV rect
const projRect = (ctx: any, ux: number, uy: number, w: number, h: number) => {
    const q = projQuad(ux, uy, ux + w, uy + h)
    ctx.newPath(); q.forEach(([px, py]: any, i: number) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath()
}
// the right-click menu, drawn IN the plane so it shares the widget's tilt; width auto-fits the text
const drawTrayMenu = (ctx: any) => {
    if (!menuState) return
    const vis = menuState.nodes
    ctx.selectFontFace(ROBOTO_BOLD, 0, 0); ctx.setFontSize(13)
    let maxw = 40
    for (const n of vis) if (n.type !== "separator") maxw = Math.max(maxw, ctx.textExtents(n.label || "•").width + (n.children && n.children.length ? 18 : 0))
    const mw = Math.min(TOTALW - ICONW - 12, Math.max(96, Math.ceil(maxw) + 30))
    const fullH = vis.reduce((a, n) => a + (n.type === "separator" ? MENU_SEP_H : MENU_ITEM_H), 0) + 8
    let ux = menuState.ax, uy = menuState.ay
    if (ux + mw > TOTALW - 4) ux = TOTALW - 4 - mw
    if (ux < ICONW + 6) ux = ICONW + 6
    // RULE: the menu top stays UNDER the selected app — never above it. if it's too tall to fit
    // below, cap the height and scroll instead (never grow upward past the row).
    const availBot = FOOTER_Y - 2
    const maxH = Math.max(MENU_ITEM_H + 6, availBot - uy)
    const mh = Math.min(fullH, maxH)
    const mmax = Math.max(0, fullH - mh)   // how far it can scroll
    let msc = menuState.mscroll || 0; if (msc > mmax) msc = mmax; if (msc < 0) msc = 0
    menuState.mx = ux; menuState.my = uy; menuState.mh = mh; menuState.mw = mw; menuState.mscroll = msc; menuState.mmax = mmax
    // bg + border
    projRect(ctx, ux, uy, mw, mh); ctx.setSourceRGBA(0.03, 0.05, 0.07, 0.98); ctx.fill()
    projRect(ctx, ux, uy, mw, mh); ctx.setSourceRGBA(NEON.cyan[0] / 255, NEON.cyan[1] / 255, NEON.cyan[2] / 255, 0.9); ctx.setLineWidth(1); ctx.stroke()
    // clip to the box so scrolled items don't spill
    ctx.save(); projRect(ctx, ux, uy, mw, mh); ctx.clip()
    let yy = uy + 4 - msc
    for (let i = 0; i < vis.length; i++) {
        const n = vis[i]
        const h = n.type === "separator" ? MENU_SEP_H : MENU_ITEM_H
        if (yy + h < uy || yy > uy + mh) { yy += h; continue }   // fully off-box, skip
        if (n.type === "separator") { strokePath(ctx, plane, [[ux + 8, yy + 4], [ux + mw - 8, yy + 4]], NEON.cyan, 0.25, 0.8); yy += h; continue }
        const hov = i === menuState.hover
        if (hov) { projRect(ctx, ux + 2, yy, mw - 4, MENU_ITEM_H); ctx.setSourceRGBA(NEON.cyan[0] / 255, NEON.cyan[1] / 255, NEON.cyan[2] / 255, 0.18); ctx.fill() }
        const col: [number, number, number] = n.enabled ? (hov ? [255, 255, 255] : [210, 230, 245]) : [100, 110, 120]
        tiltText(ctx, plane, ux + 12, yy + 16, n.label || "•", ROBOTO_BOLD, 12.5, col, 1, {})
        if (n.children && n.children.length) tiltText(ctx, plane, ux + mw - 15, yy + 16, "›", ROBOTO_BOLD, 12.5, col, 1, {})
        yy += h
    }
    ctx.restore()
    // scrollbar when it overflows
    if (mmax > 0) {
        const barH = mh * (mh / fullH), barY = uy + (mh - barH) * (msc / mmax)
        fillQuad(ctx, plane, ux + mw - 4, uy + 2, ux + mw - 2, uy + mh - 2, DIM_RED, 0.4)
        fillQuad(ctx, plane, ux + mw - 4, barY, ux + mw - 2, barY + barH, NEON.cyan, 0.9)
    }
}
// hit-test a screen click against the tilted menu quads (-2 = outside → close)
const menuHit = (x: number, y: number): number => {
    if (!menuState || menuState.mx == null) return -1
    const ux = menuState.mx, uy = menuState.my!, mw = menuState.mw!, mh = menuState.mh!
    if (!pip(x, y, projQuad(ux, uy, ux + mw, uy + mh))) return -2
    let yy = uy + 4 - (menuState.mscroll || 0)
    for (let i = 0; i < menuState.nodes.length; i++) {
        const n = menuState.nodes[i]
        const h = n.type === "separator" ? MENU_SEP_H : MENU_ITEM_H
        if (yy >= uy && yy + h <= uy + mh && pip(x, y, projQuad(ux, yy, ux + mw, yy + h))) return n.type === "separator" ? -1 : i
        yy += h
    }
    return -1
}

const kick = () => {
    lastActivity = Date.now()
    if (loop) return
    loop = interval(16, () => {
        const active = hudVisible
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
        if (!active && panelIntro <= 0 && win) win.visible = false
    })
}

const add = (n: any) => {
    if (_readFilter && _readFilter(n.id ?? 0)) return
    const appName = (n?.summary || n?.app_name || "UNKNOWN").toString().toUpperCase().slice(0, 24)
    let desktopEntry = ""
    try { desktopEntry = ((n?.get_str_hint?.("desktop-entry") ?? n?.desktopEntry ?? "") + "").trim() } catch { }
    msgs.unshift({
        app: appName,
        title: appName,
        body: (n?.body || "").toString().replace(/\s+/g, " ").slice(0, 240),
        appRaw: (n?.app_name || "").toString(), desktopEntry,   // keep the real app id so clickin a msg can go find its window
        born: Date.now(), out: 0, id: n?.id ?? 0,
    })
    while (msgs.length > MAXROWS + 8) msgs.pop()
    if (view === "detail" && selectedApp && appName === selectedApp) {
        const items = msgs.filter(m => m.app === selectedApp)
        let totalH = 0
        for (let i = items.length - 1; i >= 0; i--) {
            const body = (items[i].body || "//")
            const idealW = 100 + Math.min(body.length * 4, 286)
            const fw = Math.min(W - 70, Math.max(117, idealW - 3))
            const cpl = Math.max(4, Math.floor((fw - 12) / 8))
            const lines = Math.max(1, Math.ceil(body.length / cpl))
            const fh = Math.max(36, 18 + lines * 22 + 10)
            totalH += fh + ROW_GAP
        }
        const visibleH = MAXROWS * (ROWH + ROW_GAP)
        scrollOffset = Math.max(0, totalH - visibleH)
    }
    if (hudVisible) { kick(); applyInput() }
}

export const isNotifHudOpen = () => hudVisible
export const isDetailView = () => view === "detail" && !!selectedApp
export const notifCount = () => getGroups().length
export const setReadFilter = (fn: (id: number) => boolean) => { _readFilter = fn }
export const removeFromHistory = (id: number) => {
    const m = msgs.find(x => x.id === id)
    if (m) { m.out = Date.now(); kick(); timeout(260, () => { msgs = msgs.filter(x => x !== m); applyInput(); kick() }) }
}
const switchNotifView = (v: "main" | "apps") => {
    if (v === "apps") view = "apps"; else { view = "main"; selectedApp = null }
    hoverRow = -1; trayHoverIdx = -1; tabHover = null; blDismissHover = false; scrollOffset = 0; menuState = null
    kick()
}
const openTrayMenu = (t: TrayItem, rowIdx: number) => {
    trayMenu(t).then(nodes => {
        if (!nodes || !nodes.length) return
        // drop it UNDER the clicked row (dropdown style) — covers the rows below, keeps the ones above visible
        const rowBottom = HEADER + rowIdx * (ROWH + ROW_GAP) - scrollOffset + ROWH - 2
        menuState = { item: t, nodes, ax: ICONW + 44, ay: rowBottom, hover: -1 }; kick()
    })
}
export const toggleNotifHud = () => {
    if (hudVisible && view === "detail") { switchNotifView("main"); return }
    hudVisible = !hudVisible
    if (hudVisible) { panelIntro = 0; animProg = 0; view = "apps"; selectedApp = null; scrollOffset = 0; menuState = null; win.visible = true; applyInput() }
    kick()
}

export const NotifHudWindow = () => {
    area = DrawingArea({})
    area.set_size_request(plane.width, plane.height)
    area.connect("draw", (_w, ctx) => (draw(ctx), false))
    try { area.add_events(Gdk.EventMask.SCROLL_MASK | Gdk.EventMask.SMOOTH_SCROLL_MASK) } catch {}
    area.connect("scroll-event", onScroll)

    const evt = EventBox({ child: area })
    try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK | Gdk.EventMask.POINTER_MOTION_MASK) } catch {}
    const coords = (e: any): [number, number] => { try { const c = e.get_coords?.(); if (c && c.length >= 3) return [c[1], c[2]] } catch {} return [-1, -1] }

    const scrollbarMetrics = () => {
        const items = rowItems(); let totalH = 0
        if (view === "detail" && selectedApp) {
            const d = msgs.filter(m => m.app === selectedApp)
            for (let i = d.length - 1; i >= 0; i--) {
                const body = (d[i].body || "//")
                const idealW = 100 + Math.min(body.length * 4, 286)
            const fw = Math.min(W - 70, Math.max(117, idealW - 3))
                const cpl = Math.max(4, Math.floor((fw - 12) / 8))
                const lines = Math.max(1, Math.ceil(body.length / cpl))
                const fh = Math.max(36, 18 + lines * 22 + 10)
                totalH += fh + ROW_GAP
            }
        } else { totalH = getGroups().length * (ROWH + ROW_GAP) }
        const visibleH = MAXROWS * (ROWH + ROW_GAP)
        const maxOff = Math.max(0, totalH - visibleH)
        const sbX = ICONW + W - 6; const sbTop = HEADER + 4; const sbH = visibleH - 8
        const pTop = plane.project(sbX, sbTop); const pBot = plane.project(sbX, sbTop + sbH)
        return { maxOff, projX: pTop[0], projY0: Math.min(pTop[1], pBot[1]), projY1: Math.max(pTop[1], pBot[1]) }
    }

    const sDrag = (y: number) => { const sm = scrollbarMetrics(); if (sm.maxOff <= 0) return; const h = sm.projY1 - sm.projY0; if (h > 0) scrollOffset = Math.max(0, Math.min(sm.maxOff, ((y - sm.projY0) / h) * sm.maxOff)); kick() }

    const inScrollTrack = (x: number, y: number) => {
        const sm = scrollbarMetrics(); if (sm.maxOff <= 0) return false
        return x > sm.projX - 4 && x < sm.projX + 8 && y > sm.projY0 - 4 && y < sm.projY1 + 4
    }

    const updateHover = (x: number, y: number) => {
        if (menuState) { const mi = menuHit(x, y); const h = mi >= 0 ? mi : -1; if (h !== menuState.hover) { menuState.hover = h; kick() }; return }
        const nTab: "msg" | "apps" | null = (view !== "detail" && pip(x, y, APPS_TAB_Q)) ? "apps" : (pip(x, y, MSG_TAB_Q) ? "msg" : null)
        const bl = view !== "apps" && getGroups().length > 0 && pip(x, y, DISMISS_BL_Q)
        let hr = -1, tr = -1
        if (!nTab && !bl) { if (view === "apps") tr = rowAt(x, y); else hr = rowAt(x, y) }
        if (nTab !== tabHover || bl !== blDismissHover || hr !== hoverRow || tr !== trayHoverIdx) {
            tabHover = nTab; blDismissHover = bl; hoverRow = hr; trayHoverIdx = tr; kick()
        }
    }
    evt.connect("motion-notify-event", (_w, e) => {
        const [x, y] = coords(e)
        if (draggingScroll) { sDrag(y); return false }
        updateHover(x, y); return false
    })
    evt.connect("enter-notify-event", (_w, e) => { const [x, y] = coords(e); updateHover(x, y); return false })
    evt.connect("leave-notify-event", () => { draggingScroll = false; if (hoverRow !== -1 || trayHoverIdx !== -1 || tabHover || blDismissHover) { hoverRow = -1; trayHoverIdx = -1; tabHover = null; blDismissHover = false; kick() } return false })
    evt.connect("button-press-event", (_w, e) => {
        const [x, y] = coords(e)
        let b = 1; try { b = e.get_button?.()[1] ?? 1 } catch { }
        // right-click menu overlay eats everything while open
        if (menuState) {
            const mi = menuHit(x, y)
            if (mi >= 0) {
                const node = menuState.nodes[mi]
                if (node.children && node.children.length) { menuState = { ...menuState, nodes: node.children.filter(c => c.visible), ax: menuState.mx!, ay: menuState.my!, hover: -1 } }
                else { trayMenuClick(menuState.item, node.id); menuState = null }
            } else menuState = null
            kick(); return false
        }
        // tabs
        if (view !== "detail" && pip(x, y, APPS_TAB_Q)) { switchNotifView("apps"); return false }
        if (pip(x, y, MSG_TAB_Q)) { switchNotifView("main"); return false }
        // close (M)
        if (pip(x, y, CLOSE_Q)) { toggleNotifHud(); return false }
        // bottom-left dismiss-all (messages views)
        if (view !== "apps" && getGroups().length > 0 && pip(x, y, DISMISS_BL_Q)) { clickPulse = 1; kick(); dismissAll(); return false }
        if (inScrollTrack(x, y)) { draggingScroll = true; sDrag(y); return false }
        // rows
        if (view === "apps") {
            const r = rowAt(x, y); const t = trayRows()[r]
            if (t) { if (b === 3) openTrayMenu(t, r); else { trayActivate(t); rowPulse = 1; rowPulseIdx = r; kick() } }
            return false
        }
        const items = rowItems()
        if (!items.length) return false
        const r = rowAt(x, y)
        if (r >= 0 && r < items.length) {
            if (view === "detail" && selectedApp) {
                const detailMsgs = msgs.filter(m => m.app === selectedApp)
                if (r < detailMsgs.length) { rowPulse = 1; rowPulseIdx = r; kick(); activate(detailMsgs[r]) }
            } else {
                const gs = getGroups()
                if (r < gs.length) { selectedApp = gs[r].app; view = "detail"; animProg = 0; hoverRow = -1; scrollOffset = 0; kick() }
            }
        }
        return false
    })
    evt.connect("button-release-event", () => { draggingScroll = false; return false })

    win = Window({
        name: "notifhud", className: "aug notifhud",
        anchor: Anchor.TOP | Anchor.LEFT, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
        visible: false,
        child: Box({ className: "notifpopups-wrap", child: evt }),
    })
    win.connect("realize", applyInput); win.connect("map", applyInput); timeout(120, applyInput)
    try {
        notifd.connect("notified", (_s: any, id: number) => {
            try { add((notifd.get_notification ? notifd.get_notification(id) : null) ?? { summary: "", body: "" }) } catch (e) { print("[cyber] popup:", e) }
        })
    } catch (e) { print("[cyber] notifpopup init:", e) }
    // fire up the tray host + redraw the APPS page whenever the tray changes
    try { startTray(); onTrayChange(() => { if (hudVisible && view === "apps") kick() }) } catch (e) { print("[cyber] tray init:", e) }
    return win
}
