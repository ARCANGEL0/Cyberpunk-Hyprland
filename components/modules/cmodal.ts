// Control modals using Cairo, recreating the "glass" like modals present in the game's UI, like the kiroshi scanner "scan info" and etc
// (angular cyan glass, perspective warp, etc etc)
import { Window, DrawingArea, EventBox, activeMonitor } from "../../widget.ts"
import { Layer, Exclusivity, Keymode } from "../../widget.ts"
import { execAsync, interval, timeout } from "astal"
import Gdk from "gi://Gdk?version=3.0"
import GLib from "gi://GLib"
import { CYBER_DIR, SCREEN_WIDTH, SCREEN_HEIGHT } from "../../env.ts"
import { Anchor } from "../../widget.ts"
import {
    Cairo, TITLE, MONO, ICONF, ch, RR, RG, RB, CR, CG, CB, CYAN, ACC, HEADER,
    makeModalPlane, drawGlass, txt, pango, pip, projQuad, segParam, warpReveal, setTxtFX,
} from "./glass.ts"
import { openWheel, updateWheel, closeWheel, isWheelOpen } from "./appsmenu.ts"
import { makePlane } from "./proj.ts"
import { getAurUpdates, cachedAurUpdates, startUpgrade, dismissAurBar } from "./aurbar.ts"

const sh = (c) => execAsync(["sh", "-c", c]).catch(() => "")

const YEL = [1, 0.84, 0.12]   // neon yellow — highlights the currently-connected network
const GRN = [0.42, 1, 0.6]
const HUDRED: [number, number, number] = [0.95, 0.36, 0.34]
let HUDC: any = null
// red inside a hud (red holographic) modal, cyan otherwise. lets the shared list/proc widgets grab
// the right colour on their own instead of passing a colour into every single call
const rcBase = (): [number, number, number] => HUDC || [RR, RG, RB]
const rcLabel = (): [number, number, number] => HUDC ? [1, 0.64, 0.6] : CYAN
const rcAcc = (): [number, number, number] => HUDC ? [1, 0.58, 0.55] : ACC
let NCORES = 4
sh("nproc").then((o) => { NCORES = parseInt(o.trim()) || 4 })
const fmtTime = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`

// spike/history sparkline graph (area + line, framed)
const drawGraph = (ctx, x, y, w, h, data, maxV, col) => {
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.06); ctx.rectangle(x, y, w, h); ctx.fill()
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.22); ctx.setLineWidth(0.8); ctx.rectangle(x, y, w, h); ctx.stroke()
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.1); ctx.setLineWidth(0.5)   // midline
    ctx.newPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke()
    if (data.length < 2) return
    const n = data.length, step = w / (n - 1), mv = Math.max(1, maxV)
    const yOf = (v) => y + h - Math.min(1, Math.max(0, v / mv)) * (h - 2) - 1
    ctx.newPath(); ctx.moveTo(x, y + h)
    data.forEach((v, i) => ctx.lineTo(x + i * step, yOf(v))); ctx.lineTo(x + (n - 1) * step, y + h); ctx.closePath()
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.16); ctx.fill()
    ctx.newPath(); data.forEach((v, i) => i ? ctx.lineTo(x + i * step, yOf(v)) : ctx.moveTo(x + i * step, yOf(v)))
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.95); ctx.setLineWidth(1.4); ctx.stroke()
}

// reusable widgets (draw + register a hit region)
const drawSlider = (ctx, push, x, ty, trackW, value, onChange) => {
    value = Math.max(0, Math.min(1, value))
    const [sr, sg, sb] = HUDC || [RR, RG, RB], hk = HUDC ? [1, 0.62, 0.58] : [0.85, 0.98, 1]
    ctx.setSourceRGBA(sr, sg, sb, 0.14); ctx.rectangle(x, ty - 2, trackW, 4); ctx.fill()
    ctx.setOperator(12); ctx.setSourceRGBA(sr, sg, sb, 0.32); ctx.rectangle(x, ty - 3, trackW * value, 6); ctx.fill(); ctx.setOperator(2)
    ctx.setSourceRGBA(sr, sg, sb, 0.95); ctx.rectangle(x, ty - 2, trackW * value, 4); ctx.fill()
    const hx = x + trackW * value, sw = 9
    ctx.setOperator(12); ctx.setSourceRGBA(sr, sg, sb, 0.45); ctx.rectangle(hx - sw, ty - 4, sw, 8); ctx.fill(); ctx.setOperator(2)
    ctx.setSourceRGBA(hk[0], hk[1], hk[2], 1); ctx.rectangle(hx - sw, ty - 3, sw, 6); ctx.fill()
    ctx.setSourceRGBA(sr, sg, sb, 0.85); ctx.rectangle(hx - 1, ty - 5, 1.5, 10); ctx.fill()
    push({ kind: "sld", bx0: x - 8, by0: ty - 13, bx1: x + trackW + 8, by1: ty + 13, u0: x, v0: ty, u1: x + trackW, v1: ty, on: onChange })
}
const btnPath = (ctx, bx, by, bw, bh) => { const c = 6; ctx.newPath(); ctx.moveTo(bx + c, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh - c); ctx.lineTo(bx + bw - c, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + c); ctx.closePath() }
const drawBtn = (ctx, push, bx, by, bw, bh, label, on, active = false, col: any = CYAN, icon = "") => {
    const key = `${bx}|${by}`
    const hovered = push.hoverKey === key
    const fillA = active ? (hovered ? 0.62 : 0.55) : (hovered ? 0.5 : 0.34)
    const strokeA = active ? (hovered ? 1 : 0.97) : (hovered ? 1 : 0.78)
    btnPath(ctx, bx, by, bw, bh); ctx.setSourceRGBA(col[0] * 0.18, col[1] * 0.18, col[2] * 0.2, fillA); ctx.fill()
    if (hovered) {   // additive neon glow on hover
        ctx.setOperator(12)
        btnPath(ctx, bx, by, bw, bh); ctx.setSourceRGBA(col[0], col[1], col[2], 0.45); ctx.setLineWidth(2.6); ctx.stroke()
        ctx.setOperator(2)
    }
    btnPath(ctx, bx, by, bw, bh); ctx.setSourceRGBA(col[0], col[1], col[2], strokeA); ctx.setLineWidth(hovered ? 1.3 : 0.9); ctx.stroke()
    ctx.setSourceRGBA(col[0], col[1], col[2], hovered ? 1 : 0.95)
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(11); const tw = ctx.textExtents(label).width
    let iw = 0
    if (icon) { ctx.selectFontFace(ICONF, 0, 0); ctx.setFontSize(12); iw = ctx.textExtents(icon).width + 6 }
    const sx = bx + bw / 2 - (tw + iw) / 2
    if (icon) { ctx.selectFontFace(ICONF, 0, 0); ctx.setFontSize(12); ctx.moveTo(sx, by + bh / 2 + 4); ctx.showText(icon) }
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(11); ctx.moveTo(sx + iw, by + bh / 2 + 4); ctx.showText(label)
    push({ kind: "btn", hoverable: true, key, bx0: bx, by0: by, bx1: bx + bw, by1: by + bh, on })
}

const TAU = Math.PI * 2
const STRIPW = 28
const drawHudFrame = (ctx, x, y, w, h, title) => {
    const [hr, hg, hb] = HUDRED, px = x + STRIPW, pw = w - STRIPW, bev = 16, hd = 38, ft = 36

    const aw = STRIPW, ec = 4, cut = 3, topH = 13, dia = 5, tabW = 6, tabD = 4, tabH = 6
    const strip = () => {
        ctx.newPath()
        ctx.moveTo(x, y + tabH); ctx.lineTo(x + aw - tabW - tabD, y + tabH); ctx.lineTo(x + aw - tabW, y); ctx.lineTo(x + aw, y)
        ctx.lineTo(x + aw, y + topH); ctx.lineTo(x + aw - cut, y + topH + dia); ctx.lineTo(x + aw - cut, y + h - topH - dia)
        ctx.lineTo(x + aw, y + h - topH); ctx.lineTo(x + aw, y + h); ctx.lineTo(x + ec, y + h); ctx.lineTo(x, y + h - ec); ctx.closePath()
    }
    ctx.setOperator(12); strip(); ctx.setSourceRGBA(0.906, 0.341, 0.294, 0.22); ctx.setLineWidth(8); ctx.stroke(); ctx.setOperator(2)
    strip(); ctx.setSourceRGBA(0.906, 0.341, 0.294, 0.92); ctx.fill()

    const panel = () => { ctx.newPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.lineTo(px + pw, y + h - bev); ctx.lineTo(px + pw - bev, y + h); ctx.lineTo(px, y + h); ctx.closePath() }
    ctx.setOperator(12)
    for (const [lw, a] of [[12, 0.05], [7, 0.08], [3, 0.14]] as const) { panel(); ctx.setSourceRGBA(hr, hg, hb, a); ctx.setLineWidth(lw); ctx.stroke() }
    ctx.setOperator(2)
    panel(); const g = new Cairo.LinearGradient(px, y, px, y + h)
    g.addColorStopRGBA(0, 0.16, 0.012, 0.03, 0.58); g.addColorStopRGBA(1, 0.08, 0.005, 0.018, 0.62)
    ctx.setSource(g); ctx.fill()
    ctx.save(); panel(); ctx.clip()
    ctx.setSourceRGBA(0, 0, 0, 0.1); for (let yy = y + 1; yy < y + h; yy += 3) ctx.rectangle(px, yy, pw, 1); ctx.fill()
    ctx.restore()
    panel(); ctx.setSourceRGBA(hr, hg, hb, 0.95); ctx.setLineWidth(1.3); ctx.stroke()

    const hx = px + 12, hy = y + 9
    txt(ctx, hx, hy + 13, title, TITLE, 11, HUDRED, 0.95, 1)
    let bxx = hx + 92
    for (let i = 0; bxx < px + pw - 10; i++) { const bw = 1 + (i * 37 % 3); ctx.setSourceRGBA(hr, hg, hb, 0.3 + 0.5 * ((i * 53 % 3) / 2)); ctx.rectangle(bxx, hy + 2, bw, 13); ctx.fill(); bxx += bw + 2 }
    ctx.setSourceRGBA(hr, hg, hb, 0.5); ctx.setLineWidth(1); ctx.newPath(); ctx.moveTo(px + 10, y + hd); ctx.lineTo(px + pw - 10, y + hd); ctx.stroke()

    const fy = y + h - ft
    ctx.setSourceRGBA(hr, hg, hb, 0.5); ctx.setLineWidth(1); ctx.newPath(); ctx.moveTo(px + 10, fy); ctx.lineTo(px + pw - 10, fy); ctx.stroke()
    txt(ctx, px + 12, fy + 11, "ELISA TEST — DECLARATION", MONO, 6.5, HUDRED, 0.72)
    txt(ctx, px + 12, fy + 19, "MEDICAL EXAMINATION REPORT", MONO, 6.5, HUDRED, 0.72)
    txt(ctx, px + 12, fy + 27, "4455.444.492513", MONO, 6.5, HUDRED, 0.5)
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(26); ctx.setSourceRGBA(hr, hg, hb, 0.96)
    const lg = "cc+", lw2 = ctx.textExtents(lg).width
    ctx.moveTo(px + pw - lw2 - 12, fy + 27); ctx.showText(lg)
}

// ── modal framework ──
export const createModal = (spec) => {
    const { name, W, H, tabTitle } = spec
    const col = spec.col || (spec.hud ? HUDRED : CYAN), accent = spec.accent || (spec.hud ? HUDRED : ACC)
    const yaw = spec.yaw ?? 0, pitch = spec.pitch ?? 0, roll = spec.roll ?? 0
    const plane = (yaw || pitch || roll)
        ? makePlane({ w: W, h: H, yaw, pitch, roll, focal: 1000, dist: 1000, pad: 30 })
        : makeModalPlane(W, H)
    let surf: any = null, sctx: any = null, win: any = null, area: any = null
    let visible = false, intro = 0, introTarget = 0, seed = 0
    let animT: any = null, pollT: any = null
    let hitRegions: any[] = [], drag: any = null, hoverKey: any = null
    const ctrl: any = { name }

    const push: any = (reg) => { reg.quad = projQuad(plane, reg.bx0, reg.by0, reg.bx1, reg.by1); hitRegions.push(reg) }
    const renderFlat = (ctx) => {
        const X = 12, Y = 12, w = W - 24, h = H - 24
        setTxtFX(spec.hud)
        if (spec.hud) { drawHudFrame(ctx, X, Y, w, h, tabTitle) }
        else if (!spec.noGlass) {
            drawGlass(ctx, X, Y, w, h, col)
            txt(ctx, X + 24, Y + 27, tabTitle, TITLE, 15, accent, 0.98, 1, 0.45)
            ctx.setSourceRGBA(col[0], col[1], col[2], 0.32); ctx.setLineWidth(1); ctx.newPath(); ctx.moveTo(X + 14, Y + HEADER); ctx.lineTo(X + w - 14, Y + HEADER); ctx.stroke()
        }
        hitRegions = []; push.hoverKey = hoverKey
        HUDC = spec.hud ? HUDRED : null
        const bX = spec.hud ? X + STRIPW : X, bW = spec.hud ? w - STRIPW : w
        spec.draw(ctx, { push, X: bX, Y, w: bW, h, col, accent, refresh: () => ctrl.requestDraw() })
        HUDC = null; setTxtFX(false)
    }
    const draw = (screenCtx) => {
        screenCtx.setOperator(0); screenCtx.paint(); screenCtx.setOperator(2)
        if (intro <= 0.002 && !visible) return
        if (!surf) { surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, W, H); sctx = new Cairo.Context(surf) }
        sctx.save(); sctx.setOperator(0); sctx.paint(); sctx.setOperator(2); sctx.restore()
        renderFlat(sctx); surf.flush()
        warpReveal(screenCtx, surf, plane, W, H, intro, seed)
    }
    const startTimers = () => {
        if (!animT) animT = interval(60, () => {
            seed += 0.05; spec.onFrame?.()
            const sp = introTarget > intro ? 0.2 : 0.26
            if (Math.abs(introTarget - intro) <= sp) intro = introTarget; else intro += Math.sign(introTarget - intro) * sp
            if (introTarget === 0 && intro <= 0.001) { intro = 0; if (win) win.visible = false; stopTimers() }
            area && area.queue_draw()
        })
        if (spec.poll && !pollT) pollT = interval(spec.pollMs || 1500, spec.poll)
    }
    const stopTimers = () => { if (animT) { animT.cancel(); animT = null } if (pollT) { pollT.cancel(); pollT = null } }

    ctrl.open = () => { if (visible) return; visible = true; introTarget = 1; try { win.gdkmonitor = activeMonitor() } catch {} spec.onOpen?.(); win.visible = true; try { win.present?.() } catch {} startTimers(); area && area.queue_draw() }
    ctrl.close = () => { if (!visible && introTarget === 0) return; visible = false; introTarget = 0; spec.onClose?.(); startTimers() }
    ctrl.toggle = () => visible ? ctrl.close() : ctrl.open()
    ctrl.isOpen = () => visible
    ctrl.requestDraw = () => area && area.queue_draw()

    area = DrawingArea({}); area.set_size_request(plane.width, plane.height)
    area.connect("draw", (_w, ctx) => (draw(ctx), false))

    const evt = EventBox({ child: area })
    try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK | Gdk.EventMask.SCROLL_MASK | Gdk.EventMask.SMOOTH_SCROLL_MASK) } catch {}
    const wbtn = (e) => { try { return e.get_button?.()[1] ?? e.button } catch { return 1 } }
    const xy = (e) => { try { const c = e.get_coords?.(); if (c && c.length >= 3) return [c[1], c[2]] } catch {} try { const x = e.x, y = e.y; if (x != null && y != null) return [x, y] } catch {} return [0, 0] }
    evt.connect("button-press-event", (_w, e) => {
        if (!visible) return true
        const [x, y] = xy(e); const b = wbtn(e)
        let hit = false
        for (const r of hitRegions) {
            if (pip(x, y, r.quad)) {
                hit = true
                if (r.kind === "sld") { drag = r; r.on(segParam(plane, r.u0, r.v0, r.u1, r.v1, x, y)); area.queue_draw() }
                else if (b === 3 && r.onRight) r.onRight()
                else if (r.on) r.on()
                break
            }
        }
        return hit
    })
    evt.connect("motion-notify-event", (_w, e) => {
        if (!visible) return false
        const [x, y] = xy(e)
        if (drag) { drag.on(segParam(plane, drag.u0, drag.v0, drag.u1, drag.v1, x, y)); area.queue_draw(); return false }
        let nk: any = null
        for (const r of hitRegions) { if (r.hoverable && pip(x, y, r.quad)) { nk = r.key; break } }
        if (nk !== hoverKey) { hoverKey = nk; area.queue_draw() }
        return false
    })
    evt.connect("leave-notify-event", () => { if (hoverKey !== null) { hoverKey = null; area.queue_draw() } return false })
    evt.connect("button-release-event", () => { drag = null; return false })
    if (spec.onScroll) evt.connect("scroll-event", (_w, e) => {
        if (!visible) return true
        let dy = 0
        try { const sd = e.get_scroll_deltas?.(); if (sd && sd[0]) dy = sd[2] } catch {}
        if (dy === 0) { let d = 1; try { const r = e.get_scroll_direction?.(); d = r ? r[1] : e.direction } catch {} dy = (d === Gdk.ScrollDirection.UP || d === 0) ? -1 : 1 }
        spec.onScroll(dy > 0 ? 1 : -1); area.queue_draw(); return true
    })
    const onKeyPress = (_w, e) => { let k = 0; try { const r = e.get_keyval?.(); k = r ? r[1] : e.keyval } catch {} if (k === Gdk.KEY_Escape) ctrl.close(); else spec.onKey?.(k); return true }

    const winOpts: any = { name: `modal_${name}`, className: "aug modal", layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE, keymode: spec.keymode ?? Keymode.EXCLUSIVE, visible: false, child: evt }
    if (spec.anchorRight) { winOpts.anchor = Anchor.RIGHT; winOpts.margin_right = Math.round(SCREEN_WIDTH * 0.25) }
    win = Window(winOpts)
    win.connect("key-press-event", onKeyPress)
    ctrl.win = win
    return ctrl
}

// ── VOL / MIC / BRIGHTNESS ──
const sectionHeader = (ctx, g, x, y, label, w) => {
    txt(ctx, x, y, label, MONO, 9, g.col, 0.85)
    ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(9)
    const lw = ctx.textExtents(label).width
    ctx.setSourceRGBA(g.col[0], g.col[1], g.col[2], 0.28); ctx.rectangle(x + lw + 10, y - 3, (x + w) - (x + lw + 10), 1.2); ctx.fill()
}

const APPS_CMD = `pactl list sink-inputs 2>/dev/null | awk '/^Sink Input #/{if(i!="")print i"|"n"|"v;i=substr($3,2);n="App";v=""}/Volume:/&&v==""{for(k=1;k<=NF;k++)if($k ~ /%$/){g=$k;sub(/%/,"",g);v=g;break}}/[Aa]pplication.name = /{n=$0;sub(/.*= "/,"",n);sub(/".*/,"",n)}END{if(i!="")print i"|"n"|"v}'`
// small helper to set persistent per-app volume configuration (since im running plain on hyprland and not a DE like KDE, theres no volume control per app, so i had to make this.)
const APPVOL_STATE = `$HOME/.cache/cyberpunk/appvol.conf`
const shq = (s) => String(s).replace(/'/g, `'\\''`)
const setAppVol = (name, id, t) => {
    const pct = Math.round(t * 100), nm = shq(name)
    // write the target volume FIRST, so when the keeper reacts to its own 'change' event it sees a
    // matching target and doesnt fight back — THEN actually shove it onto the live stream
    sh(`f="${APPVOL_STATE}"; mkdir -p "$(dirname "$f")"; touch "$f"; awk -F= -v n='${nm}' -v v='${pct}' 'BEGIN{s=0}$1==n{print n"="v;s=1;next}{print}END{if(!s)print n"="v}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"; pactl set-sink-input-volume ${id} ${pct}%`)
}
const VolCtrl = () => {
    const st: any = { master: 0.5, muted: false, apps: [], mic: 0.5, micMuted: false }
    let ctrl
    const refresh = () => {
        sh("wpctl get-volume @DEFAULT_AUDIO_SINK@").then((o) => { const m = o.match(/([\d.]+)/); st.master = m ? Math.min(1, parseFloat(m[1])) : 0; st.muted = /MUTED/.test(o); ctrl.requestDraw() })
        sh("wpctl get-volume @DEFAULT_AUDIO_SOURCE@").then((o) => { const m = o.match(/([\d.]+)/); st.mic = m ? Math.min(1, parseFloat(m[1])) : 0; st.micMuted = /MUTED/.test(o); ctrl.requestDraw() })
        Promise.all([sh(APPS_CMD), sh(`cat "${APPVOL_STATE}" 2>/dev/null`)]).then(([o, s]) => {
            const want: any = {}
            String(s).trim().split("\n").filter(Boolean).forEach((l) => { const i = l.indexOf("="); if (i > 0) want[l.slice(0, i)] = parseInt(l.slice(i + 1)) })
            st.apps = o.trim().split("\n").filter(Boolean).map((l) => {
                // APPS_CMD spits out lines like "id|name|volume". split each one, then peek at the 'want'
                // map (built from APPVOL_STATE) for a saved volume for that app — use that if its there,
                // otherwise just roll w/ whatever the system reports rn. hand back {id, name, volume 0-1}
                const a = l.split("|"), name = (a[1] || "App"), live = Math.min(1, (parseInt(a[2]) || 0) / 100), w = want[name]
                return { id: a[0], name, vol: (w != null && !isNaN(w)) ? Math.min(1, w / 100) : live }
            })
            ctrl.requestDraw()
        })
    }
    ctrl = createModal({
        name: "vol", tabTitle: "AUDIO", W: 348, H: 432, hud: true, onOpen: refresh, poll: refresh, pollMs: 2000,
        draw: (ctx, g) => {
            const x = g.X + 18, trackW = g.w - 36 - 54, secW = g.w - 36
            const yO = g.Y + HEADER + 30
            sectionHeader(ctx, g, x, yO - 18, "OUTPUT", secW)
            drawSlider(ctx, g.push, x, yO, trackW, st.master, (t) => { st.master = t; sh(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${t.toFixed(2)}`); g.refresh() })
            txt(ctx, x + trackW + 12, yO + 5, st.muted ? "MUTE" : `${Math.round(st.master * 100)}%`, TITLE, 14, g.accent, 0.96, 1)
            drawBtn(ctx, g.push, x, yO + 18, 132, 24, st.muted ? "MUTED" : "MUTE", () => sh("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle").then(() => timeout(140, refresh)), st.muted, g.col, ch(st.muted ? 0xf026 : 0xf028))

            const yA = yO + 64
            sectionHeader(ctx, g, x, yA, "// APPS", secW)
            let ay = yA + 22
            if (!st.apps.length) txt(ctx, x, ay, "no apps playing audio", MONO, 9, g.col, 0.35)
            for (const a of st.apps.slice(0, 3)) {
                txt(ctx, x, ay, a.name.slice(0, 22).toUpperCase(), MONO, 9, g.col, 0.95)
                txt(ctx, x + trackW + 12, ay + 17, `${Math.round(a.vol * 100)}%`, TITLE, 12, g.col, 0.9, 1)
                drawSlider(ctx, g.push, x, ay + 12, trackW, a.vol, (t) => { a.vol = t; setAppVol(a.name, a.id, t); g.refresh() })
                ay += 46
            }

            const yI = g.Y + g.h - 36 - 58
            sectionHeader(ctx, g, x, yI - 18, "INPUT", secW)
            drawSlider(ctx, g.push, x, yI, trackW, st.mic, (t) => { st.mic = t; sh(`wpctl set-volume @DEFAULT_AUDIO_SOURCE@ ${t.toFixed(2)}`); g.refresh() })
            txt(ctx, x + trackW + 12, yI + 5, st.micMuted ? "MUTE" : `${Math.round(st.mic * 100)}%`, TITLE, 14, g.accent, 0.96, 1)
            drawBtn(ctx, g.push, x, yI + 18, 132, 24, st.micMuted ? "MUTED" : "MUTE", () => sh("wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle").then(() => timeout(140, refresh)), st.micMuted, g.col, ch(st.micMuted ? 0xf131 : 0xf130))
        },
    })
    return ctrl
}
const BrtCtrl = () => {
    const st = { val: 0.5 }; let ctrl
    const refresh = () => sh("echo $(brightnessctl get) $(brightnessctl max)").then((o) => { const [c, m] = o.trim().split(" ").map(Number); st.val = m ? c / m : 0; ctrl.requestDraw() })
    ctrl = createModal({
        name: "brt", tabTitle: "DISPLAY", W: 312, H: 176, hud: true, onOpen: refresh, poll: refresh, pollMs: 2500,
        draw: (ctx, g) => {
            const x = g.X + 18, trackW = g.w - 36 - 52, secW = g.w - 36
            const ty = g.Y + HEADER + 48
            sectionHeader(ctx, g, x, ty - 18, "BRIGHTNESS", secW)
            drawSlider(ctx, g.push, x, ty, trackW, st.val, (t) => { st.val = Math.max(0.02, t); sh(`brightnessctl set ${Math.round(st.val * 100)}%`); g.refresh() })
            txt(ctx, x + trackW + 12, ty + 5, `${Math.round(st.val * 100)}%`, TITLE, 14, g.accent, 0.96, 1)
        },
    })
    return ctrl
}

// ── device list + right-click context menu (WiFi / BT etc etc ettc)
const rowPath = (ctx, x, y, w, h) => { const c = 5; ctx.newPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); ctx.closePath() }
const ROW_H = 32, ROW_GAP = 6
const drawList = (ctx, push, x, y, w, h, items, scroll, meta, onClick, onRight) => {
    const step = ROW_H + ROW_GAP, vis = Math.max(1, Math.floor(h / step))
    const maxS = Math.max(0, items.length - vis); scroll = Math.min(scroll, maxS)
    const [BR, BG, BB] = rcBase(), LBL = rcLabel(), ACX = rcAcc()
    ctx.save(); ctx.rectangle(x - 3, y - 3, w + 6, h + 6); ctx.clip()
    for (let i = 0; i <= vis; i++) {
        const idx = scroll + i; if (idx >= items.length) break
        const it = items[idx], ry = y + i * step, m = meta(it); if (ry + ROW_H > y + h + step) break
        const hl = m.col || ACX
        rowPath(ctx, x, ry, w, ROW_H)
        if (m.active) ctx.setSourceRGBA(hl[0] * 0.18, hl[1] * 0.18, hl[2] * 0.22, 0.5); else ctx.setSourceRGBA(BR * 0.16, BG * 0.16, BB * 0.22, 0.3)
        ctx.fill()
        rowPath(ctx, x, ry, w, ROW_H); if (m.active) ctx.setSourceRGBA(hl[0], hl[1], hl[2], 0.95); else ctx.setSourceRGBA(BR, BG, BB, 0.55); ctx.setLineWidth(0.9); ctx.stroke()
        if (m.dot) { const d = m.active ? hl : ACX; ctx.setSourceRGBA(d[0], d[1], d[2], 0.95); ctx.newPath(); ctx.arc(x + 14, ry + ROW_H / 2, 3.4, 0, Math.PI * 2); ctx.fill() }
        pango(ctx, x + 26, ry + ROW_H / 2 + 4, m.label, TITLE, true, 12, m.active ? hl : LBL, 0.95)
        if (m.right) txt(ctx, x + w - 12 - ctx.textExtents(m.right).width, ry + ROW_H / 2 + 4, m.right, MONO, 9, m.active ? hl : LBL, 0.7)
        push({ kind: "row", bx0: x, by0: ry, bx1: x + w, by1: ry + ROW_H, on: () => onClick(it), onRight: () => onRight(it, x + w - 30, ry + ROW_H - 4) })
    }
    ctx.restore()
    if (items.length > vis) {                                          // scrollbar
        const bh = h * vis / items.length, by = y + (h - bh) * (scroll / maxS || 0)
        ctx.setSourceRGBA(BR, BG, BB, 0.5); ctx.rectangle(x + w + 4, by, 3, bh); ctx.fill()
    }
}
const menuPath = (ctx, x, y, w, h) => { const c = 6; ctx.newPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); ctx.closePath() }
const drawMenu = (ctx, push, fx, fy, items, onDismiss, X, Y, W, H) => {
    const mw = 150, ih = 28, mh = items.length * ih + 8
    let mx = fx, my = fy
    if (mx + mw > X + W - 12) mx = X + W - 12 - mw
    if (my + mh > Y + H - 12) my = Y + H - 12 - mh
    if (mx < X + 12) mx = X + 12; if (my < Y + 12) my = Y + 12
    push({ kind: "btn", bx0: X, by0: Y, bx1: X + W, by1: Y + H, on: onDismiss })   // dismiss
    ctx.setOperator(12); menuPath(ctx, mx - 2, my - 2, mw + 4, mh + 4); ctx.setSourceRGBA(RR, RG, RB, 0.25); ctx.setLineWidth(6); ctx.stroke(); ctx.setOperator(2)
    menuPath(ctx, mx, my, mw, mh); ctx.setSourceRGBA(0.02, 0.07, 0.1, 0.97); ctx.fill()
    menuPath(ctx, mx, my, mw, mh); ctx.setSourceRGBA(0.72, 0.96, 1, 0.95); ctx.setLineWidth(0.9); ctx.stroke()
    items.forEach((it, i) => {
        const iy = my + 4 + i * ih
        txt(ctx, mx + 16, iy + ih / 2 + 4, it.label, TITLE, 11, it.danger ? [1, 0.4, 0.44] : CYAN, 0.93, 1)
        if (i > 0) { ctx.setSourceRGBA(RR, RG, RB, 0.18); ctx.rectangle(mx + 6, iy, mw - 12, 1); ctx.fill() }
        push({ kind: "btn", bx0: mx, by0: iy, bx1: mx + mw, by1: iy + ih, on: () => { it.on(); onDismiss() } })   // items 
    })
}

// ── WIFI ──


const WifiCtrl = () => {
    const st: any = { on: false, nets: [], saved: [], selected: null }
    let ctrl
    const refresh = () => sh("nmcli radio wifi 2>/dev/null").then((o) => {
        st.on = /enabled/i.test(o)
        if (!st.on) { st.nets = []; if (ctrl.isOpen()) updateWheel([]); ctrl.requestDraw(); return }
        sh("nmcli -t -f ACTIVE,SSID,SIGNAL dev wifi 2>/dev/null | awk -F: 'NF>=3 && $2!=\"\"' | head -80").then((l) => {
            const raw = l.trim().split("\n").filter(Boolean).map((line) => { const p = line.split(":"); return { active: p[0] === "yes", ssid: p[1], sig: parseInt(p[p.length - 1]) || 0 } })
            const by = new Map()
            for (const n of raw) { const e = by.get(n.ssid); if (!e) by.set(n.ssid, { ...n }); else { e.active = e.active || n.active; e.sig = Math.max(e.sig, n.sig) } }
            st.nets = [...by.values()].sort((a, b) => (Number(b.active) - Number(a.active)) || (b.sig - a.sig))
            if (ctrl.isOpen()) updateWheel(wheelList())
            ctrl.requestDraw()
        })
        sh("nmcli -t -f NAME con show 2>/dev/null | head -10").then((o) => {
            st.saved = o.trim().split("\n").filter(Boolean)
            ctrl.requestDraw()
        })
    })
    const toggle = () => { sh(`nmcli radio wifi ${st.on ? "off" : "on"}`).then(() => timeout(900, refresh)) }
    const wheelList = () => st.nets.map((n) => ({ label: n.ssid, badge: n.active ? "CONNECTED" : `${n.sig}%`, glyph: null, data: n }))
    ctrl = createModal({
        name: "wifi", tabTitle: "NETWORK", W: 320, H: 380, yaw: 15, pitch: 0, roll: 0, anchorRight: true, noBuiltinClose: true, noGlass: true, keymode: Keymode.ON_DEMAND,
        onOpen: () => { st.selected = null; st.scroll = 0; refresh(); openWheel({ title: "NETWORK", subtitle: "// NETWATCH — SCANNING", footer: "[ SCROLL / ARROWS ] NAVIGATE   [ ENTER / CLICK ] CONNECT   [ ESC ] CLOSE", searchable: true, reserveX: 600, onActivate: (n) => { if (!n.active) sh(`nmcli dev wifi connect "${n.ssid}"`).then(() => timeout(2200, refresh)) }, onFocus: (n) => { st.selected = n; ctrl.requestDraw() }, onReset: () => ctrl.close(), emptyText: "// NO NETWORKS" }, wheelList()) },
        onClose: () => { closeWheel(); st.selected = null },
        poll: () => refresh(), pollMs: 5000,
        draw: (ctx, g) => {
            const panelW = 280, panelX = g.X + g.w - panelW - 6, panelH = g.h
            drawGlass(ctx, panelX, g.Y, panelW, panelH, g.col)
            txt(ctx, panelX + 16, g.Y + 27, "NETWORK", TITLE, 14, g.accent, 0.98, 1, 0.45)
            ctx.setSourceRGBA(g.col[0], g.col[1], g.col[2], 0.32); ctx.setLineWidth(1)
            ctx.newPath(); ctx.moveTo(panelX + 8, g.Y + HEADER); ctx.lineTo(panelX + panelW - 8, g.Y + HEADER); ctx.stroke()
            const px = panelX + 14, py = g.Y + HEADER + 10
            drawBtn(ctx, g.push, px, py, panelW - 28, 26, st.on ? "WIFI: ON" : "WIFI: OFF", toggle, st.on)
            if (st.on) drawBtn(ctx, g.push, px, py + 46, panelW - 28, 22, "SCAN", refresh, false, g.col)
            let ty = py + (st.on ? 88 : 50)
            txt(ctx, px, ty, `STATUS: ${st.on ? "ACTIVE" : "INACTIVE"}`, MONO, 10, st.on ? [CR, CG, CB] : g.col, 0.85)
            ty += 20
            if (st.on && st.selected) {
                txt(ctx, px, ty, st.selected.ssid.slice(0, 22), TITLE, 13, g.accent, 0.95, 1)
                ty += 20
                const btnH = 24, gap = 8
                const isActive = st.selected.active
                drawBtn(ctx, g.push, px, ty, 130, btnH, isActive ? "DISCONNECT" : "CONNECT",
                    () => sh(isActive ? `nmcli con down id "${st.selected.ssid}"` : `nmcli dev wifi connect "${st.selected.ssid}"`).then(() => timeout(2200, refresh)),
                    false, g.col)
                const forgetW = panelW - 28 - 130 - gap
                const isSaved = st.saved.some((s) => s === st.selected.ssid)
                if (isSaved) {
                    drawBtn(ctx, g.push, px + 130 + gap, ty, forgetW, btnH, "FORGET",
                        () => sh(`nmcli con delete id "${st.selected.ssid}"`).then(() => timeout(600, refresh)),
                        false, g.col)
                } else {
                    const [br, bg, bb] = g.col
                    btnPath(ctx, px + 130 + gap, ty, forgetW, btnH)
                    ctx.setSourceRGBA(br * 0.1, bg * 0.1, bb * 0.1, 0.3); ctx.fill()
                    btnPath(ctx, px + 130 + gap, ty, forgetW, btnH)
                    ctx.setSourceRGBA(br, bg, bb, 0.25); ctx.setLineWidth(0.9); ctx.stroke()
                    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(11)
                    const lw = ctx.textExtents("FORGET").width
                    ctx.setSourceRGBA(g.col[0], g.col[1], g.col[2], 0.3)
                    ctx.moveTo(px + 130 + gap + forgetW / 2 - lw / 2, ty + btnH / 2 + 4); ctx.showText("FORGET")
                }
                ty += btnH + 10
            } else if (st.on) {
                txt(ctx, px, ty, "~ SELECT A NETWORK ~", MONO, 9, g.col, 0.5)
                ty += 18
            } else {
                txt(ctx, px, ty, "~ OFFLINE ~", MONO, 9, g.col, 0.5)
                ty += 18
            }
            const sepY = ty
            ctx.setSourceRGBA(g.col[0], g.col[1], g.col[2], 0.2); ctx.rectangle(px, sepY, panelW - 28, 1); ctx.fill()
            txt(ctx, px, sepY + 12, "SAVED CONNECTIONS", MONO, 9, g.col, 0.72)
            const savedY = sepY + 26
            if (!st.saved.length) txt(ctx, px, savedY, "none", MONO, 9, g.col, 0.35)
            else st.saved.slice(0, 6).forEach((s, i) => txt(ctx, px, savedY + i * 18, s, TITLE, 11, g.col, 0.78, 1))
        },
    })
    return ctrl
}

// BLUETOOTH 
const macsOf = (s) => (s.match(/Device (\S+)/g) || []).map((m) => m.split(" ")[1])
const BtCtrl = () => {
    const st: any = { on: false, devs: [], paired: [], selected: null }
    let ctrl
    const refresh = () => sh("bluetoothctl show 2>/dev/null | grep -q 'Powered: yes' && echo on || echo off").then((p) => {
        st.on = p.trim() === "on"
        if (!st.on) { st.devs = []; if (ctrl.isOpen()) updateWheel([]); ctrl.requestDraw(); return }
        Promise.all([sh("bluetoothctl devices 2>/dev/null"), sh("bluetoothctl devices Paired 2>/dev/null"), sh("bluetoothctl devices Connected 2>/dev/null")]).then(([all, pd, cd]) => {
            const paired = new Set(macsOf(pd)), conn = new Set(macsOf(cd))
            st.devs = (all.trim().split("\n").filter(Boolean)).map((line) => { const m = line.match(/Device (\S+) (.+)/); return m ? { mac: m[1], name: m[2], paired: paired.has(m[1]), connected: conn.has(m[1]) } : null }).filter(Boolean)
            if (ctrl.isOpen()) updateWheel(wheelList())
            ctrl.requestDraw()
        })
        sh("bluetoothctl devices Paired 2>/dev/null").then((o) => {
            st.paired = o.trim().split("\n").filter(Boolean).map((l) => { const m = l.match(/Device (\S+) (.+)/); return m ? m[2] : "" }).filter(Boolean)
            ctrl.requestDraw()
        })
    })
    const scanBT = () => { print("[bt] scanning..."); sh("bluetoothctl --timeout 8 scan on 2>&1; echo '---'; bluetoothctl devices 2>&1").then((o) => { print("[bt] result: " + o.trim().slice(0, 500)); refresh() }) }
    const toggle = () => { if (st.on) { sh("bluetoothctl power off").then(() => timeout(700, refresh)) } else { sh("rfkill unblock bluetooth; sleep 0.3; bluetoothctl power on").then(() => timeout(1500, scanBT)) } }
    const wheelList = () => st.devs.map((d) => ({ label: d.name, badge: d.connected ? "CONNECTED" : d.paired ? "PAIRED" : d.mac.slice(0, 8), glyph: null, data: d }))
    ctrl = createModal({
        name: "bt", tabTitle: "BLUETOOTH", W: 320, H: 380, yaw: 15, pitch: 0, roll: 0, anchorRight: true, noBuiltinClose: true, noGlass: true, keymode: Keymode.ON_DEMAND,
        onOpen: () => { st.selected = null; st.scroll = 0; refresh(); if (st.on) timeout(800, scanBT); openWheel({ title: "BLUETOOTH", subtitle: "// KIROSHI — SCANNING", footer: "[ SCROLL / ARROWS ] NAVIGATE   [ ENTER / CLICK ] CONNECT   [ ESC ] CLOSE", searchable: true, reserveX: 600, onActivate: (d) => sh(`bluetoothctl ${d.connected ? "disconnect" : "connect"} ${d.mac}`).then(() => timeout(1800, refresh)), onFocus: (d) => { st.selected = d; ctrl.requestDraw() }, onReset: () => ctrl.close(), emptyText: "// NO DEVICES" }, wheelList()) },
        onClose: () => { closeWheel(); st.selected = null },
        poll: () => refresh(), pollMs: 5000,
        draw: (ctx, g) => {
            const panelW = 280, panelX = g.X + g.w - panelW - 6
            drawGlass(ctx, panelX, g.Y, panelW, g.h, g.col)
            txt(ctx, panelX + 16, g.Y + 27, "BLUETOOTH", TITLE, 14, g.accent, 0.98, 1, 0.45)
            ctx.setSourceRGBA(g.col[0], g.col[1], g.col[2], 0.32); ctx.setLineWidth(1)
            ctx.newPath(); ctx.moveTo(panelX + 8, g.Y + HEADER); ctx.lineTo(panelX + panelW - 8, g.Y + HEADER); ctx.stroke()
            const px = panelX + 14, py = g.Y + HEADER + 10
            drawBtn(ctx, g.push, px, py, panelW - 28, 26, st.on ? "BT: ON" : "BT: OFF", toggle, st.on)
            if (st.on) drawBtn(ctx, g.push, px, py + 46, panelW - 28, 22, "SCAN", scanBT, false, g.col)
            let ty = py + (st.on ? 88 : 50)
            txt(ctx, px, ty, `STATUS: ${st.on ? "ACTIVE" : "INACTIVE"}`, MONO, 10, st.on ? [CR, CG, CB] : g.col, 0.85)
            ty += 20
            if (st.on && st.selected) {
                txt(ctx, px, ty, st.selected.name.slice(0, 22), TITLE, 13, g.accent, 0.95, 1)
                ty += 20
                const btnH = 24, gap = 8
                const isConnected = st.selected.connected
                drawBtn(ctx, g.push, px, ty, 130, btnH, isConnected ? "DISCONNECT" : "CONNECT",
                    () => sh(`bluetoothctl ${isConnected ? "disconnect" : "connect"} ${st.selected.mac}`).then(() => timeout(1800, refresh)),
                    false, g.col)
                const pairW = panelW - 28 - 130 - gap
                const isPaired = st.selected.paired
                if (isPaired) {
                    drawBtn(ctx, g.push, px + 130 + gap, ty, pairW, btnH, "UNPAIR",
                        () => sh(`bluetoothctl remove ${st.selected.mac}`).then(() => timeout(900, refresh)),
                        false, [1, 0.4, 0.44])
                } else {
                    drawBtn(ctx, g.push, px + 130 + gap, ty, pairW, btnH, "PAIR",
                        () => sh(`bluetoothctl pair ${st.selected.mac}`).then(() => timeout(2500, refresh)),
                        false, g.col)
                }
                ty += btnH + 10
            } else if (st.on) {
                txt(ctx, px, ty, "~ SELECT A DEVICE ~", MONO, 9, g.col, 0.5)
                ty += 18
            } else {
                txt(ctx, px, ty, "~ OFFLINE ~", MONO, 9, g.col, 0.5)
                ty += 18
            }
            const sepY = ty
            ctx.setSourceRGBA(g.col[0], g.col[1], g.col[2], 0.2); ctx.rectangle(px, sepY, panelW - 28, 1); ctx.fill()
            txt(ctx, px, sepY + 12, "PAIRED DEVICES", MONO, 9, g.col, 0.72)
            const savedY = sepY + 26
            if (!st.paired.length) txt(ctx, px, savedY, "none", MONO, 9, g.col, 0.35)
            else st.paired.slice(0, 6).forEach((s, i) => txt(ctx, px, savedY + i * 18, s, TITLE, 11, g.col, 0.78, 1))
        },
    })
    return ctrl
}

// ── PWR MENU ──
const PWRBRIGHT: [number, number, number] = [1, 0.58, 0.55]
const drawPwrBtn = (ctx, push, bx, by, bw, bh, glyph, label, on) => {
    const key = `${bx}|${by}`, hovered = push.hoverKey === key, [hr, hg, hb] = HUDRED
    btnPath(ctx, bx, by, bw, bh); ctx.setSourceRGBA(hr * 0.16, hg * 0.16, hb * 0.18, hovered ? 0.55 : 0.4); ctx.fill()
    if (hovered) { ctx.setOperator(12); btnPath(ctx, bx, by, bw, bh); ctx.setSourceRGBA(hr, hg, hb, 0.4); ctx.setLineWidth(2.4); ctx.stroke(); ctx.setOperator(2) }
    btnPath(ctx, bx, by, bw, bh); ctx.setSourceRGBA(hr, hg, hb, hovered ? 1 : 0.82); ctx.setLineWidth(hovered ? 1.2 : 0.9); ctx.stroke()
    ctx.selectFontFace(ICONF, 0, 0); ctx.setFontSize(24); const gw = ctx.textExtents(glyph).width
    ctx.setSourceRGBA(PWRBRIGHT[0], PWRBRIGHT[1], PWRBRIGHT[2], 0.97); ctx.moveTo(bx + bw / 2 - gw / 2, by + bh / 2 + 2); ctx.showText(glyph)
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(11); const tw = ctx.textExtents(label).width
    ctx.setSourceRGBA(hr, hg, hb, 0.95); ctx.moveTo(bx + bw / 2 - tw / 2, by + bh - 11); ctx.showText(label)
    push({ kind: "btn", hoverable: true, key, bx0: bx, by0: by, bx1: bx + bw, by1: by + bh, on })
}
const PwrCtrl = () => {
    const items = [
        [ch(0xf023), "LOCK", "loginctl lock-session"],
        [ch(0xf2f5), "LOGOUT", "hyprctl dispatch exit"],
        [ch(0xf021), "REBOOT", "systemctl reboot"],
        [ch(0xf011), "SHUTDOWN", "systemctl poweroff"],
    ]
    return createModal({
        name: "pwr", tabTitle: "POWER", W: 312, H: 252, hud: true,
        draw: (ctx, g) => {
            const gap = 12, bw = (g.w - 36 - gap) / 2, bh = 58, x0 = g.X + 18, y0 = g.Y + 48
            items.forEach(([glyph, label, cmd], i) => {
                const bx = x0 + (i % 2) * (bw + gap), by = y0 + ((i / 2) | 0) * (bh + gap)
                drawPwrBtn(ctx, g.push, bx, by, bw, bh, glyph, label, () => sh(cmd as string))
            })
        },
    })
}

const procRow = (ctx, push, x, ry, w, p, on, cpuHX, memHX, onClick, onRight, pinned = false) => {
    const [BR, BG, BB] = rcBase(), LBL = rcLabel(), ACX = rcAcc()
    const hl = on ? [1, 0.4, 0.44] : ACX
    rowPath(ctx, x, ry, w, ROW_H); ctx.setSourceRGBA(on ? hl[0] * 0.2 : BR * 0.16, on ? hl[1] * 0.2 : BG * 0.16, on ? hl[2] * 0.24 : BB * 0.22, on ? 0.55 : 0.3); ctx.fill()
    rowPath(ctx, x, ry, w, ROW_H); ctx.setSourceRGBA(on ? hl[0] : BR, on ? hl[1] : BG, on ? hl[2] : BB, on ? 0.97 : 0.5); ctx.setLineWidth(on ? 1.2 : 0.9); ctx.stroke()
    let nx = x + 12
    if (pinned) { ctx.selectFontFace(ICONF, 0, 0); ctx.setFontSize(10); ctx.setSourceRGBA(hl[0], hl[1], hl[2], 0.95); ctx.moveTo(x + 10, ry + ROW_H / 2 + 4); ctx.showText(ch(0xf08d)); nx = x + 28 }
    const lim = pinned ? 15 : 18, nm = p.name.length > lim ? p.name.slice(0, lim - 1) + "…" : p.name
    pango(ctx, nx, ry + ROW_H / 2 + 4, nm, TITLE, true, 12, on ? hl : LBL, 0.95)
    ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(10)
    const cs = `${p.cpu}%`, ms = `${p.mem}%`
    txt(ctx, cpuHX - ctx.textExtents(cs).width, ry + ROW_H / 2 + 4, cs, MONO, 10, on ? hl : ACX, 0.92)
    txt(ctx, memHX - ctx.textExtents(ms).width, ry + ROW_H / 2 + 4, ms, MONO, 10, on ? hl : LBL, 0.85)
    push({ kind: "row", bx0: x, by0: ry, bx1: x + w, by1: ry + ROW_H, on: () => onClick(p), onRight: () => onRight(p) })
}
// process list:
const drawProcList = (ctx, push, x, y, w, h, items, scroll, sel, pinned, onClick, onRight) => {
    const [BR, BG, BB] = rcBase(), LBL = rcLabel()
    const cpuHX = x + w - 92, memHX = x + w - 26
    txt(ctx, x + 6, y + 8, "PROCESS", MONO, 8.5, LBL, 0.5)
    ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(8.5)
    txt(ctx, cpuHX - ctx.textExtents("CPU").width, y + 8, "CPU", MONO, 8.5, LBL, 0.5)
    txt(ctx, memHX - ctx.textExtents("MEM").width, y + 8, "MEM", MONO, 8.5, LBL, 0.5)
    ctx.setSourceRGBA(BR, BG, BB, 0.2); ctx.rectangle(x, y + 13, w, 1); ctx.fill()
    let listTop = y + 18
    if (pinned) {
        procRow(ctx, push, x, listTop, w, pinned, true, cpuHX, memHX, onClick, onRight, true)
        listTop += ROW_H + 9
        ctx.setSourceRGBA(BR, BG, BB, 0.16); ctx.rectangle(x, listTop - 6, w, 1); ctx.fill()
    }
    const lh = (y + h) - listTop, step = ROW_H + ROW_GAP, vis = Math.max(1, Math.floor(lh / step))
    const maxS = Math.max(0, items.length - vis); scroll = Math.min(scroll, maxS)
    ctx.save(); ctx.rectangle(x - 3, listTop - 3, w + 6, lh + 6); ctx.clip()
    for (let i = 0; i <= vis; i++) {
        const idx = scroll + i; if (idx >= items.length) break
        const p = items[idx], ry = listTop + i * step; if (ry + ROW_H > listTop + lh + step) break
        procRow(ctx, push, x, ry, w, p, p.pid === sel, cpuHX, memHX, onClick, onRight, false)
    }
    ctx.restore()
    if (items.length > vis) { const bh = lh * vis / items.length, by = listTop + (lh - bh) * (scroll / maxS || 0); ctx.setSourceRGBA(BR, BG, BB, 0.5); ctx.rectangle(x + w + 4, by, 3, bh); ctx.fill() }
}

// ── BATTERY 
const PROFILES = [["PERFORMANCE", "performance"], ["NEUTRAL", "balanced"], ["ECONOMIC", "power-saver"]]
const BatCtrl = () => {
    const st: any = { present: true, status: "", pct: 0, rate: 0, mins: 0, perMin: 0, profile: "balanced", apps: [], hist: [] }
    let ctrl
    const refresh = () => {
        sh("B=''; for d in /sys/class/power_supply/*; do [ \"$(cat \"$d/type\" 2>/dev/null)\" = Battery ] && B=$d && break; done; if [ -z \"$B\" ]; then echo none; else echo \"$(cat \"$B/status\" 2>/dev/null) $(cat \"$B/capacity\" 2>/dev/null)\"; fi").then((o) => {
            const t = o.trim()
            if (t === "none" || t === "") st.present = false
            else { st.present = true; const [s, c] = t.split(/\s+/); st.status = s; st.pct = parseInt(c) || 0 }
            ctrl.requestDraw()
        })
        sh("LC_ALL=C upower -i \"$(upower -e 2>/dev/null | grep -m1 -i battery)\" 2>/dev/null | grep -iE 'energy-rate|time to (empty|full)|energy-full:'").then((o) => {
            const r = o.match(/energy-rate:\s*([\d.]+)/i); st.rate = r ? parseFloat(r[1]) : 0
            const ef = o.match(/energy-full:\s*([\d.]+)/i); const full = ef ? parseFloat(ef[1]) : 0
            const tm = o.match(/time to (?:empty|full):\s*([\d.]+)\s*(\w+)/i)
            st.mins = tm ? (/hour/i.test(tm[2]) ? parseFloat(tm[1]) * 60 : parseFloat(tm[1])) : 0
            st.perMin = full > 0 ? st.rate / full * 100 / 60 : 0
            st.hist.push(st.rate); if (st.hist.length > 48) st.hist.shift()
            ctrl.requestDraw()
        })
        sh("powerprofilesctl get 2>/dev/null").then((o) => { st.profile = o.trim() || "balanced"; ctrl.requestDraw() })
        sh("ps -eo comm,%cpu --no-headers 2>/dev/null | awk '{a[$1]+=$2} END{for(k in a) print a[k], k}' | sort -rn | head -5").then((o) => {
            st.apps = o.trim().split("\n").filter(Boolean).map((l) => { const m = l.trim().match(/^([\d.]+)\s+(.+)$/); return m ? { name: m[2], cpu: parseFloat(m[1]) / NCORES } : null }).filter(Boolean)
            ctrl.requestDraw()
        })
    }
    const setProfile = (p) => { sh(`powerprofilesctl set ${p}`).then(() => timeout(300, refresh)) }
    ctrl = createModal({
        name: "bat", tabTitle: "POWER CELL", W: 352, H: 470, hud: true,
        onOpen: () => { st.hist = []; refresh() }, poll: refresh, pollMs: 4000,
        draw: (ctx, g) => {
            const x = g.X + 20, w = g.w - 40, RED = g.col, BR = rcAcc()
            let cy = g.Y + HEADER + 16
            if (!st.present) {
                ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(28); const aw = ctx.textExtents("AC POWERED").width
                ctx.setSourceRGBA(BR[0], BR[1], BR[2], 0.98); ctx.moveTo(g.X + g.w / 2 - aw / 2, cy + 30); ctx.showText("AC POWERED")
                txt(ctx, g.X + g.w / 2 - aw / 2, cy + 50, "// DIRECT SUPPLY", MONO, 9, g.col, 0.82); cy += 74
            } else {
                const charging = st.status === "Charging", full = st.status === "Full" || st.status === "Not charging"
                const col = st.pct <= 15 ? [1, 0.4, 0.44] : BR
                ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(46); const big = `${st.pct}%`; const bw = ctx.textExtents(big).width
                ctx.setSourceRGBA(col[0], col[1], col[2], 0.98); ctx.moveTo(x, cy + 36); ctx.showText(big)
                txt(ctx, x + bw + 16, cy + 18, full ? "✓ FULLY CHARGED" : charging ? "⚡ CHARGING" : "ON BATTERY", MONO, 11, RED, 0.92)
                txt(ctx, x + bw + 16, cy + 37, full ? "AC CONNECTED" : `${st.rate.toFixed(1)} W · ${st.perMin.toFixed(1)} %/min${st.mins > 0 ? " · " + fmtTime(st.mins) + (charging ? " to full" : " left") : ""}`, MONO, 8.5, col, 0.72)
                ctx.setSourceRGBA(RED[0], RED[1], RED[2], 0.18); ctx.rectangle(x, cy + 48, w, 5); ctx.fill()
                ctx.setSourceRGBA(col[0], col[1], col[2], 0.9); ctx.rectangle(x, cy + 48, w * st.pct / 100, 5); ctx.fill()
                txt(ctx, x, cy + 68, "// DRAW HISTORY · W", MONO, 8, RED, 0.45)
                drawGraph(ctx, x, cy + 72, w, 42, st.hist, Math.max(5, ...(st.hist.length ? st.hist : [5])), col); cy += 128
            }
            const gap = 10, bw2 = (w - 2 * gap) / 3
            PROFILES.forEach(([label, prof], i) => drawBtn(ctx, g.push, x + i * (bw2 + gap), cy, bw2, 30, label, () => setProfile(prof), st.profile === prof, g.col))
            cy += 45
            txt(ctx, x, cy, `CURRENT MODE: ${st.profile.toUpperCase()}`, MONO, 9, g.accent, 0.9)
            cy += 14
            txt(ctx, x, cy, "// TOP POWER DRAW · approx by CPU", MONO, 9, g.col, 0.82)
            const ly = cy + 12, lh = (g.Y + g.h - 44) - ly
            drawList(ctx, g.push, x, ly, w, lh, st.apps, 0, (a) => ({ label: a.name, right: `${a.cpu.toFixed(1)}%`, active: false, dot: false }), () => { }, () => { })
        },
    })
    return ctrl
}

// ── SYSTEM MONITOR (CPU / RAM graphs + process kille and etc
const SysCtrl = () => {
    const st: any = { cpu: 0, memU: 0, memT: 1, procs: [], sel: "", selProc: null, scroll: 0, cpuHist: [], ramHist: [] }
    let ctrl
    const refresh = () => {
        sh("read -r _ a b c d e f h r < /proc/stat; i1=$d; t1=$((a+b+c+d+e+f+h)); sleep 0.25; read -r _ a b c d e f h r < /proc/stat; i2=$d; t2=$((a+b+c+d+e+f+h)); dt=$((t2-t1)); di=$((i2-i1)); echo $(( dt>0 ? 100*(dt-di)/dt : 0 ))").then((o) => { st.cpu = parseInt(o.trim()) || 0; st.cpuHist.push(st.cpu); if (st.cpuHist.length > 60) st.cpuHist.shift(); ctrl.requestDraw() })
        sh("free -m | awk '/^Mem:/{print $3, $2}'").then((o) => { const [u, t] = o.trim().split(/\s+/).map(Number); st.memU = u || 0; st.memT = t || 1; st.ramHist.push(100 * st.memU / st.memT); if (st.ramHist.length > 60) st.ramHist.shift(); ctrl.requestDraw() })
        sh("ps -eo pid,comm,%cpu,%mem --sort=-%cpu --no-headers 2>/dev/null | head -16").then((o) => {
            st.procs = o.trim().split("\n").filter(Boolean).map((l) => { const p = l.trim().split(/\s+/); return { pid: p[0], name: p.slice(1, p.length - 2).join(" "), cpu: Math.round(parseFloat(p[p.length - 2]) / NCORES), mem: Math.round(parseFloat(p[p.length - 1])) } })
            ctrl.requestDraw()
        })
        if (st.sel) sh(`ps -p ${st.sel} -o comm=,%cpu=,%mem= 2>/dev/null`).then((o) => {
            const t = o.trim()
            if (t) { const p = t.split(/\s+/); st.selProc = { pid: st.sel, name: p.slice(0, p.length - 2).join(" "), cpu: Math.round(parseFloat(p[p.length - 2]) / NCORES), mem: Math.round(parseFloat(p[p.length - 1])) } }
            ctrl.requestDraw()   
        })
    }
    const select = (p) => { st.sel = p.pid; st.selProc = p; st.scroll = 0; ctrl.requestDraw() }
    const killSel = () => { if (st.sel) sh(`kill -9 ${st.sel} 2>/dev/null`).then(() => { st.sel = ""; st.selProc = null; timeout(400, refresh) }) }
    ctrl = createModal({
        name: "sys", tabTitle: "SYSTEM MONITOR", W: 430, H: 432, hud: true,
        onOpen: () => { st.sel = ""; st.selProc = null; st.scroll = 0; st.cpuHist = []; st.ramHist = []; refresh() }, poll: refresh, pollMs: 1500,
        onScroll: (d) => { st.scroll = Math.max(0, Math.min(Math.max(0, st.procs.length - 1), st.scroll + d)); ctrl.requestDraw() },
        draw: (ctx, g) => {
            const x = g.X + 20, w = g.w - 40, top = g.Y + HEADER + 14, gw = (w - 14) / 2, gH = 50, BR = rcAcc()
            // CPU graph
            txt(ctx, x, top + 2, "CPU", MONO, 9, g.col, 0.6)
            ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(12); let v = `${st.cpu}%`
            txt(ctx, x + gw - ctx.textExtents(v).width, top + 2, v, MONO, 12, BR, 0.96)
            drawGraph(ctx, x, top + 8, gw, gH, st.cpuHist, 100, BR)
            // RAM graph
            const rx = x + gw + 14
            txt(ctx, rx, top + 2, "MEMORY", MONO, 9, g.col, 0.6)
            v = `${(st.memU / 1024).toFixed(1)}/${(st.memT / 1024).toFixed(1)}G`; ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(10)
            txt(ctx, rx + gw - ctx.textExtents(v).width, top + 2, v, MONO, 10, g.col, 0.92)
            drawGraph(ctx, rx, top + 8, gw, gH, st.ramHist, 100, g.col)
            // kill button + section label
            const ky = top + gH + 32
            drawBtn(ctx, g.push, x + w - 124, ky - 18, 124, 24, st.sel ? "FORCE KILL" : "SELECT A PROC", killSel, !!st.sel, g.col, st.sel ? ch(0xf011) : "")
            txt(ctx, x, ky, "// TOP PROCESSES", MONO, 9, g.col, 0.82)
            const ly = ky + 8, lh = (g.Y + g.h - 44) - ly
            const pinned = st.sel ? (st.selProc || st.procs.find((p) => p.pid === st.sel)) : null
            const rest = pinned ? st.procs.filter((p) => p.pid !== st.sel) : st.procs
            drawProcList(ctx, g.push, x, ly, w, lh, rest, st.scroll, st.sel, pinned,
                select, (p) => { select(p); killSel() })
        },
    })
    return ctrl
}

// ── KEYBINDS cheat-sheet ──
const KEYBINDS = [
    ["SUPER", "APP LAUNCHER"], ["H", "HELP MENU"], ["Z", "HUD OVERLAY"], ["V", "VOLUME"],
    ["I", "BRIGHTNESS"], ["U", "SYSTEM UPGRADE"], ["J", "DISMISS UPDATE"], ["M", "MICROPHONE"], ["O", "MUSIC PLAYER"], ["N", "NETWORKS"],
    ["B", "BLUETOOTH"], ["W", "WEATHER"], ["P", "POWER MENU"], ["Y", "BATTERY"],
    ["C", "CPU / RAM"], ["L", "LOCKSCREEN"], ["R", "SCREEN RECORD"], ["S", "SCREENSHOT"],
    ["T", "TERMINAL"], ["K", "KILL MODE"],
]
const drawKeyCap = (ctx, x, y, label, h) => {
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(11); const tw = ctx.textExtents(label).width
    const w = Math.max(26, tw + 16)
    btnPath(ctx, x, y, w, h); ctx.setSourceRGBA(CR * 0.2, CG * 0.2, CB * 0.28, 0.55); ctx.fill()
    btnPath(ctx, x, y, w, h); ctx.setSourceRGBA(CYAN[0], CYAN[1], CYAN[2], 0.85); ctx.setLineWidth(1); ctx.stroke()
    ctx.setSourceRGBA(0.92, 0.99, 1, 0.97); ctx.moveTo(x + w / 2 - tw / 2, y + h / 2 + 4); ctx.showText(label)
    return w
}
// Standard Hyprland window-management binds (shipped in theme.conf). Fixed mods,
// so they're listed literally — not under the $themeMod prefix above. 
// These are hyprland keybind related and not to the cyberpunk HUD. Keybinds are individual per change.
const HYPRBINDS = [
    ["SUPER + SHIFT + F", "FULLSCREEN TOGGLE"],
    ["SUPER + F", "FLOAT / TILE TOGGLE"],
    ["SUPER + ← → ↑ ↓", "FOCUS WINDOW"],
    ["SUPER + SHIFT + ← → ↑ ↓", "MOVE WINDOW"],
    ["CTRL + SHIFT + ← → ↑ ↓", "RESIZE WINDOW"],
    ["ALT + SHIFT + 1…0", "WINDOW → WORKSPACE"],
    ["SUPER + D", "PEEK DESKTOP"],
]
// The cheat-sheet prefix follows $themeMod live: read it from theme.conf and
const readThemeMod = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(`${CYBER_DIR}/theme.conf`)
        if (ok) {
            const m = new TextDecoder().decode(bytes).match(/^\s*\$themeMod\s*=\s*(.+?)\s*$/m)
            if (m) return m[1].trim().split(/\s+/).join(" + ")
        }
    } catch { }
    return "SUPER + SHIFT"
}
let keysMod = readThemeMod()
const KeysCtrl = () => createModal({
    name: "keys", tabTitle: "KEYBINDS", W: 470, H: 600,
    onOpen: () => { keysMod = readThemeMod() },        // re-read so a changed $themeMod shows up
    draw: (ctx, g) => {
        const x = g.X + 24, top = g.Y + HEADER + 10
        txt(ctx, x, top + 6, `// PREFIX  ${keysMod}  +  KEY`, MONO, 10, ACC, 0.72, 1)
        const gridTop = top + 26, colW = (g.w - 48) / 2, rowH = 30, capH = 22, half = Math.ceil(KEYBINDS.length / 2)
        KEYBINDS.forEach(([key, action], i) => {
            const cx = x + (i < half ? 0 : 1) * colW, cy = gridTop + (i % half) * rowH
            const cw = drawKeyCap(ctx, cx, cy, key, capH)
            txt(ctx, cx + cw + 10, cy + capH / 2 + 4, action, TITLE, 11, CYAN, 0.92, 1)
        })
        // ── HYPRLAND window-management section ──
        const sepY = gridTop + half * rowH + 16
        txt(ctx, x, sepY, "// HYPRLAND", MONO, 10, ACC, 0.72, 1)
        ctx.setSourceRGBA(CYAN[0], CYAN[1], CYAN[2], 0.28); ctx.setLineWidth(1)
        ctx.newPath(); ctx.moveTo(x + 98, sepY - 4); ctx.lineTo(g.X + g.w - 24, sepY - 4); ctx.stroke()
        const hTop = sepY + 20, hRow = 22, actX = x + 210
        HYPRBINDS.forEach(([combo, action], i) => {
            const hy = hTop + i * hRow
            txt(ctx, x, hy, combo, MONO, 10, CYAN, 0.92, 1)
            txt(ctx, actX, hy, action, TITLE, 11, ACC, 0.85, 1)
        })
        txt(ctx, x, g.Y + g.h - 14, "ESC to close", MONO, 9, g.col, 0.42)
    },
})

const cregistry: any = {}
const register = (c) => { cregistry[c.name] = c; return c.win }
// ── AUR / SYSTEM UPGRADE ──
const AurCtrl = () => {
    const st: any = { list: [], count: 0, scroll: 0, loading: true }
    let ctrl
    const load = () => {
        const c = cachedAurUpdates()
        if (c.count > 0 || c.list.length > 0) { st.list = c.list; st.count = c.count; st.loading = false } else { st.loading = true }
        ctrl.requestDraw()
        getAurUpdates().then((r) => { st.list = r.list; st.count = r.count; st.loading = false; ctrl.requestDraw() })
    }
    ctrl = createModal({
        name: "aur", tabTitle: "SYSTEM UPGRADE", W: 470, H: 512, hud: true,
        onOpen: () => { st.scroll = 0; load() },
        onScroll: (d) => { st.scroll = Math.max(0, Math.min(Math.max(0, st.list.length - 1), st.scroll + d)); ctrl.requestDraw() },
        draw: (ctx, g) => {
            const x = g.X + 22, w = g.w - 44, BR = rcAcc()
            let cy = g.Y + HEADER + 20
            if (st.loading) { txt(ctx, x, cy + 8, "// QUERYING MIRRORS + AUR …", MONO, 11, g.col, 0.82); return }
            if (st.count <= 0) {
                ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(26)
                ctx.setSourceRGBA(GRN[0], GRN[1], GRN[2], 0.96); ctx.moveTo(x, cy + 26); ctx.showText("SYSTEM UP TO DATE")
                txt(ctx, x, cy + 48, "// no pending package updates", MONO, 10, g.col, 0.7)
                drawBtn(ctx, g.push, x, g.Y + g.h - 44 - 34, w, 34, "CLOSE", () => ctrl.close(), false, g.col)
                return
            }
            ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(40)
            const big = `${st.count}`, bw = ctx.textExtents(big).width
            ctx.setSourceRGBA(BR[0], BR[1], BR[2], 0.98); ctx.moveTo(x, cy + 30); ctx.showText(big)
            txt(ctx, x + bw + 14, cy + 14, "PACKAGE UPDATES", TITLE, 14, g.accent, 0.95, 1)
            txt(ctx, x + bw + 14, cy + 33, "// review, then proceed with upgrade", MONO, 9, g.col, 0.7)
            cy += 52
            const btnH = 36, listBottom = g.Y + g.h - 44 - btnH - 16
            drawList(ctx, g.push, x, cy, w, listBottom - cy, st.list, st.scroll, (line) => {
                const sp = line.indexOf(" ")
                return { label: sp > 0 ? line.slice(0, sp) : line, right: sp > 0 ? line.slice(sp + 1).replace("->", "→") : "", active: false, dot: true }
            }, () => { }, () => { })
            const by = g.Y + g.h - 44 - btnH, gap = 12, hbw = (w - gap) / 2
            drawBtn(ctx, g.push, x, by, hbw, btnH, "PROCEED", () => { startUpgrade(); dismissAurBar(); ctrl.close() }, true, GRN, ch(0xf021))
            drawBtn(ctx, g.push, x + hbw + gap, by, hbw, btnH, "CANCEL", () => ctrl.close(), false, g.col)
        },
    })
    return ctrl
}

export const CModalWindows = () => [register(VolCtrl()), register(BrtCtrl()), register(WifiCtrl()), register(BtCtrl()), register(PwrCtrl()), register(BatCtrl()), register(SysCtrl()), register(KeysCtrl()), register(AurCtrl())]

// ── dispatcher: routes to the cairo modal ──
export const toggleModal = (name) => {
    if (name === "mic") name = "vol"
    for (const k in cregistry) if (k !== name) cregistry[k].close()
    if (cregistry[name]) { cregistry[name].toggle() }
    else { for (const k in cregistry) cregistry[k].close() }
}
export const isModalOpen = (name) => { if (name === "mic") name = "vol"; return cregistry[name] ? cregistry[name].isOpen() : false }
