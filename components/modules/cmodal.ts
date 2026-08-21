

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
import { startModalStats, stopModalStats } from "./sys.ts"

const sh = (c) => execAsync(["sh", "-c", c]).catch(() => "")

const YEL = [1, 0.84, 0.12]
const GRN = [0.42, 1, 0.6]
const HUDRED: [number, number, number] = [0.95, 0.36, 0.34]
let HUDC: any = null


const rcBase = (): [number, number, number] => HUDC || [RR, RG, RB]
const rcLabel = (): [number, number, number] => HUDC ? [1, 0.64, 0.6] : CYAN
const rcAcc = (): [number, number, number] => HUDC ? [1, 0.58, 0.55] : ACC
let NCORES = 4
sh("nproc").then((o) => { NCORES = parseInt(o.trim()) || 4 })
const fmtTime = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`


const drawGraph = (ctx, x, y, w, h, data, maxV, col) => {
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.06); ctx.rectangle(x, y, w, h); ctx.fill()
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.22); ctx.setLineWidth(0.8); ctx.rectangle(x, y, w, h); ctx.stroke()
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.1); ctx.setLineWidth(0.5)
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
    if (hovered) {
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


export const createModal = (spec) => {
    const { name, W, H, tabTitle } = spec
    const col = spec.col || (spec.hud ? HUDRED : CYAN), accent = spec.accent || (spec.hud ? HUDRED : ACC)
    const yaw = spec.yaw ?? 0, pitch = spec.pitch ?? 0, roll = spec.roll ?? 0
    const plane = (yaw || pitch || roll)
        ? makePlane({ w: W, h: H, yaw, pitch, roll, focal: spec.focal ?? 1000, dist: spec.dist ?? 1000, pad: 30 })
        : makePlane({ w: W, h: H, yaw: 0, pitch: 0, roll: 0, focal: 1000, dist: 1000, pad: spec.pad ?? 30 })
    let surf: any = null, sctx: any = null, win: any = null, area: any = null
    let visible = false, intro = 0, introTarget = 0, seed = 0
    let animT: any = null, pollT: any = null, lastFrame = 0
    let hitRegions: any[] = [], drag: any = null, hoverKey: any = null
    const ctrl: any = { name }

    const push: any = (reg) => { reg.quad = projQuad(plane, reg.bx0, reg.by0, reg.bx1, reg.by1); hitRegions.push(reg) }
    const renderFlat = (ctx) => {
        const X = 12, Y = 12, w = W - 24, h = H - 24
        setTxtFX(spec.hud)
        if (spec.hud) { drawHudFrame(ctx, X, Y, w, h, tabTitle) }
        else if (!spec.noGlass) {
            drawGlass(ctx, X, Y, w, h, col, spec.glass ?? 1)
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
            const idleMs = spec.idleFrameMs ?? 0
            const now = Date.now()
            if (intro !== introTarget || idleMs <= 0 || now - lastFrame >= idleMs) { lastFrame = now; area && area.queue_draw() }
        })
        if (spec.poll && !pollT) pollT = interval(spec.pollMs || 1500, spec.poll)
    }
    const stopTimers = () => { if (animT) { animT.cancel(); animT = null } if (pollT) { pollT.cancel(); pollT = null } }

    const shapeInput = () => {
        try {
            const gw = win?.get_window?.(); if (!gw) return
            const reg = new Cairo.Region()
            if (visible) {
                const steps = 56
                for (let i = 0; i < steps; i++) {
                    const v0 = (i / steps) * H, v1 = ((i + 1) / steps) * H
                    const a0 = plane.project(0, v0), a1 = plane.project(W, v0)
                    const b0 = plane.project(0, v1), b1 = plane.project(W, v1)
                    const x0 = Math.floor(Math.min(a0[0], b0[0])) - 3
                    const x1 = Math.ceil(Math.max(a1[0], b1[0])) + 3
                    const y0 = Math.floor(Math.min(a0[1], a1[1])) - 1
                    const y1 = Math.ceil(Math.max(b0[1], b1[1])) + 1
                    reg.unionRectangle({ x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) })
                }
            }
            gw.input_shape_combine_region(reg, 0, 0)
        } catch (e) { print("[cyber] modal input shape:", e) }
    }
    ctrl.open = () => { if (visible) return; visible = true; introTarget = 1; try { win.gdkmonitor = activeMonitor() } catch {} spec.onOpen?.(); win.visible = true; try { win.present?.() } catch {} startTimers(); area && area.queue_draw(); timeout(40, shapeInput); fireChange() }
    ctrl.close = () => { if (!visible && introTarget === 0) return; visible = false; introTarget = 0; shapeInput(); spec.onClose?.(); fireChange(); startTimers() }
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

    const winOpts: any = { name: `modal_${name}`, namespace: `modal_${name}`, className: "aug modal", layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE, keymode: spec.keymode ?? Keymode.EXCLUSIVE, visible: false, child: evt }
    if (spec.anchorRight) { winOpts.anchor = Anchor.RIGHT; winOpts.margin_right = Math.round(SCREEN_WIDTH * 0.25) }
    else if (spec.anchorLeft) { winOpts.anchor = Anchor.LEFT; winOpts.margin_left = spec.marginLeft ?? Math.round(SCREEN_WIDTH * 0.03) }
    win = Window(winOpts)
    win.connect("key-press-event", onKeyPress)
    ctrl.win = win
    return ctrl
}


const sectionHeader = (ctx, g, x, y, label, w) => {
    txt(ctx, x, y, label, MONO, 9, g.col, 0.85)
    ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(9)
    const lw = ctx.textExtents(label).width
    ctx.setSourceRGBA(g.col[0], g.col[1], g.col[2], 0.28); ctx.rectangle(x + lw + 10, y - 3, (x + w) - (x + lw + 10), 1.2); ctx.fill()
}

const APPS_CMD = `pactl list sink-inputs 2>/dev/null | awk '/^Sink Input #/{if(i!="")print i"|"n"|"v;i=substr($3,2);n="App";v=""}/Volume:/&&v==""{for(k=1;k<=NF;k++)if($k ~ /%$/){g=$k;sub(/%/,"",g);v=g;break}}/[Aa]pplication.name = /{n=$0;sub(/.*= "/,"",n);sub(/".*/,"",n)}END{if(i!="")print i"|"n"|"v}'`

const APPVOL_STATE = `$HOME/.cache/cyberpunk/appvol.conf`
const shq = (s) => String(s).replace(/'/g, `'\\''`)
const setAppVol = (name, id, t) => {
    const pct = Math.round(t * 100), nm = shq(name)
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
    if (items.length > vis) {
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
    push({ kind: "btn", bx0: X, by0: Y, bx1: X + W, by1: Y + H, on: onDismiss })
    ctx.setOperator(12); menuPath(ctx, mx - 2, my - 2, mw + 4, mh + 4); ctx.setSourceRGBA(RR, RG, RB, 0.25); ctx.setLineWidth(6); ctx.stroke(); ctx.setOperator(2)
    menuPath(ctx, mx, my, mw, mh); ctx.setSourceRGBA(0.02, 0.07, 0.1, 0.97); ctx.fill()
    menuPath(ctx, mx, my, mw, mh); ctx.setSourceRGBA(0.72, 0.96, 1, 0.95); ctx.setLineWidth(0.9); ctx.stroke()
    items.forEach((it, i) => {
        const iy = my + 4 + i * ih
        txt(ctx, mx + 16, iy + ih / 2 + 4, it.label, TITLE, 11, it.danger ? [1, 0.4, 0.44] : CYAN, 0.93, 1)
        if (i > 0) { ctx.setSourceRGBA(RR, RG, RB, 0.18); ctx.rectangle(mx + 6, iy, mw - 12, 1); ctx.fill() }
        push({ kind: "btn", bx0: mx, by0: iy, bx1: mx + mw, by1: iy + ih, on: () => { it.on(); onDismiss() } })
    })
}

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
        onOpen: () => { st.selected = null; st.scroll = 0; refresh(); openWheel({ title: "NETWORK", subtitle: "// NETWATCH :: TRACING FOR CONNECTIONS", footer: "[ SCROLL / ARROWS ] NAVIGATE   [ ENTER / CLICK ] CONNECT   [ ESC ] CLOSE", searchable: true, reserveX: 600, onActivate: (n) => { if (!n.active) sh(`nmcli dev wifi connect "${n.ssid}"`).then(() => timeout(2200, refresh)) }, onFocus: (n) => { st.selected = n; ctrl.requestDraw() }, onReset: () => ctrl.close(), emptyText: "// NO NETWORKS" }, wheelList()) },
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
        onOpen: () => { st.selected = null; st.scroll = 0; refresh(); if (st.on) timeout(800, scanBT); openWheel({ title: "BLUETOOTH", subtitle: "// KIROSHI :: TRACING DEVICES", footer: "[ SCROLL / ARROWS ] NAVIGATE   [ ENTER / CLICK ] CONNECT   [ ESC ] CLOSE", searchable: true, reserveX: 600, onActivate: (d) => sh(`bluetoothctl ${d.connected ? "disconnect" : "connect"} ${d.mac}`).then(() => timeout(1800, refresh)), onFocus: (d) => { st.selected = d; ctrl.requestDraw() }, onReset: () => ctrl.close(), emptyText: "// NO DEVICES" }, wheelList()) },
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

const SYSY: [number, number, number] = [252 / 255, 238 / 255, 10 / 255]
const SYSC: [number, number, number] = [94 / 255, 244 / 255, 248 / 255]
const SYSR: [number, number, number] = [255 / 255, 42 / 255, 58 / 255]
const SYS_LOCK = "/tmp/cyber-sysmon.lock"
const SYS_AUDIO = `${CYBER_DIR}/assets/audio`
const sysPlay = (f, vol, mvol) => sh(`setsid -f sh -c "play -q -v ${vol} '${SYS_AUDIO}/${f}' 2>/dev/null || mpv --no-video --really-quiet --volume=${mvol} '${SYS_AUDIO}/${f}' 2>/dev/null" >/dev/null 2>&1`)
const sysSndOn = () => {
    sysPlay("kiroshi_on.ogg", "1.2", "120")
    sh(`touch ${SYS_LOCK}; setsid -f sh -c "while [ -e '${SYS_LOCK}' ]; do play -q -v 0.9 '${SYS_AUDIO}/kiroshi_menu.ogg' 2>/dev/null || { mpv --no-video --really-quiet --volume=90 '${SYS_AUDIO}/kiroshi_menu.ogg' 2>/dev/null || break; }; done" >/dev/null 2>&1`)
}
const sysSndOff = () => {
    sh(`rm -f ${SYS_LOCK}`)
    sysPlay("kiroshi_off.ogg", "1.2", "120")
}
const bevel = (ctx, x, y, w, h, c = 10) => {
    ctx.newPath()
    ctx.moveTo(x, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c)
    ctx.lineTo(x + w, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.closePath()
}
const SYSDIM: [number, number, number] = [0.62, 0.72, 0.75]
const SEGOFF: [number, number, number] = [0.34, 0.40, 0.42]
const rdf = (f) => { try { const [ok, b2] = GLib.file_get_contents(f); return ok ? new TextDecoder().decode(b2) : "" } catch { return "" } }
const kbToG = (kb) => kb / 1048576
const cpuSnap = () => {
    const out: any = { total: [], idle: [] }
    for (const line of rdf("/proc/stat").split("\n")) {
        if (!/^cpu/.test(line)) continue
        const f = line.trim().split(/\s+/)
        const n = f.slice(1, 9).map(Number)
        if (n.length < 4 || isNaN(n[0])) continue
        out.total.push(n.reduce((a2, b2) => a2 + (b2 || 0), 0))
        out.idle.push((n[3] || 0) + (n[4] || 0))
    }
    return out
}
const netSnap = () => {
    let rx = 0, tx = 0
    for (const line of rdf("/proc/net/dev").split("\n").slice(2)) {
        const i = line.indexOf(":"); if (i < 0) continue
        const name = line.slice(0, i).trim(); if (name === "lo") continue
        const f = line.slice(i + 1).trim().split(/\s+/).map(Number)
        rx += f[0] || 0; tx += f[8] || 0
    }
    return { rx, tx, t: GLib.get_monotonic_time() }
}
const cpuTemp = () => {
    for (const z of ["thermal_zone0", "thermal_zone1", "thermal_zone2", "thermal_zone3"]) {
        const v = parseInt(rdf(`/sys/class/thermal/${z}/temp`).trim())
        if (v > 1000 && v < 150000) return Math.round(v / 1000)
    }
    return 0
}
const cpuMHz = () => {
    const v = parseInt(rdf("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq").trim())
    if (v > 0) return Math.round(v / 1000)
    const m = rdf("/proc/cpuinfo").match(/cpu MHz\s*:\s*([\d.]+)/)
    return m ? Math.round(parseFloat(m[1])) : 0
}
const fmtUp = (secs) => {
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60)
    return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`
}
const mbps = (bps) => { const m = bps * 8 / 1e6; return m >= 100 ? m.toFixed(0) : m.toFixed(1) }
const TICKS = ["XC", "XT", "BR", "XY", "CD"]

const ladder = (ctx, x, y, w, h, frac, col, icon, label, valTxt, side) => {
    const segH = 5, gap = 5, step = segH + gap
    const track = h - 40
    const segs = Math.floor(track / step)
    const f = Math.max(0, Math.min(1, frac))
    const mi = Math.round((1 - f) * (segs - 1))
    const left = side === "l"

    ctx.setSourceRGBA(SYSDIM[0], SYSDIM[1], SYSDIM[2], 0.22); ctx.setLineWidth(1)
    for (const gx of [x - 16, x + w + 16]) {
        ctx.newPath(); ctx.moveTo(gx, y - 10); ctx.lineTo(gx, y + track + 10); ctx.stroke()
    }
    TICKS.forEach((t, i) => {
        const ty = y + 6 + (i / (TICKS.length - 1)) * (track - 16)
        ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(8)
        txt(ctx, x - 22 - ctx.textExtents(t).width, ty, t, MONO, 8, SYSDIM, 0.4)
        txt(ctx, x + w + 22, ty, TICKS[(i + 2) % TICKS.length], MONO, 8, SYSDIM, 0.4)
    })

    const tt = Date.now() / 320
    const EXT = [
        (58 + 92 * f) * (1 + 0.05 * Math.sin(tt)),
        (38 + 58 * f) * (1 + 0.07 * Math.sin(tt + 1.1)),
        (22 + 34 * f) * (1 + 0.09 * Math.sin(tt + 2.2)),
    ]
    for (let i = 0; i < segs; i++) {
        const sy = y + i * step
        const k = mi - i
        const ext = (k >= 0 && k < EXT.length) ? EXT[k] : 0
        const marked = ext > 0
        const filled = i > mi
        const sx = left ? x - ext : x
        const c: any = (marked || filled) ? col : SEGOFF
        ctx.setSourceRGBA(c[0], c[1], c[2], marked ? 0.98 : (filled ? 0.72 : 0.5))
        ctx.rectangle(sx, sy, w + ext, segH); ctx.fill()
    }

    ctx.selectFontFace(ICONF, 0, 0); ctx.setFontSize(13)
    txt(ctx, x + w / 2 - ctx.textExtents(icon).width / 2, y - 20, icon, ICONF, 13, col, 0.9)

    const cw2 = 54, chY = y + mi * step - 9
    const cx2 = left ? x - EXT[0] - cw2 - 6 : x + w + EXT[0] + 6
    ctx.setSourceRGBA(col[0], col[1], col[2], 0.95)
    ctx.rectangle(cx2, chY, cw2, 22); ctx.fill()
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(15)
    txt(ctx, cx2 + cw2 / 2 - ctx.textExtents(valTxt).width / 2, chY + 17, valTxt, TITLE, 15, [0.03, 0.05, 0.06], 1, 1)

    ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(9)
    txt(ctx, x + w / 2 - ctx.textExtents(label).width / 2, y + track + 26, label, MONO, 9, col, 0.85, 1)
}

const slotSq = (ctx, x, y, w, h, label, val, frac, col, hot) => {
    const c: any = hot ? SYSR : col
    bevel(ctx, x, y, w, h, 10)
    ctx.setSourceRGBA(c[0] * 0.16, c[1] * 0.16, c[2] * 0.18, 0.30); ctx.fill()
    bevel(ctx, x, y, w, h, 10)
    ctx.setSourceRGBA(c[0], c[1], c[2], hot ? 0.95 : 0.6); ctx.setLineWidth(1.1); ctx.stroke()
    bevel(ctx, x + 6, y + 6, w - 12, h - 12, 6)
    ctx.setSourceRGBA(c[0], c[1], c[2], 0.14); ctx.setLineWidth(0.8); ctx.stroke()
    txt(ctx, x + 10, y + 18, label, MONO, 9.5, c, 0.95, 1)
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(17)
    txt(ctx, x + 10, y + 40, val, TITLE, 17, c, 0.97, 1)
    if (frac >= 0) {
        const bh = h - 22
        ctx.setSourceRGBA(c[0], c[1], c[2], 0.14)
        ctx.rectangle(x + w - 14, y + 11, 5, bh); ctx.fill()
        ctx.setSourceRGBA(c[0], c[1], c[2], 0.92)
        const fh = bh * Math.max(0, Math.min(1, frac))
        ctx.rectangle(x + w - 14, y + 11 + bh - fh, 5, fh); ctx.fill()
    }
}
const groupLabel = (ctx, x, y, s) => txt(ctx, x, y, s, MONO, 9.5, SYSR, 0.85, 1)
const initRow = (ctx, push, x, y, w, app, onToggle) => {
  const rh = 40, c: any = app.enabled ? SYSC : SYSR
    bevel(ctx, x, y, w, rh, 8); ctx.setSourceRGBA(c[0] * 0.16, c[1] * 0.16, c[2] * 0.18, 0.26); ctx.fill()
  bevel(ctx, x, y, w, rh, 8)
      ctx.setSourceRGBA(c[0], c[1], c[2], 0.5); ctx.setLineWidth(0.9); ctx.stroke()
    ctx.setSourceRGBA(c[0], c[1], c[2], 0.9); ctx.newPath(); ctx.arc(x + 18, y + rh / 2, 3.4, 0, Math.PI * 2); ctx.fill()
  txt(ctx, x + 32, y + rh / 2 + 5, app.name, TITLE, 13.5, SYSC, 0.95, 1)
    const bw = 176, bh = 26
  const bx = x + w - bw - 12, by = y + (rh - bh) / 2
    drawBtn(ctx, push, bx, by, bw, bh, app.enabled ? "ENABLED ON BOOT" : "DISABLED ON BOOT", () => onToggle(app), app.enabled, c)
}

const SysCtrl = (SW, SH) => {
    const st: any = {
        cpu: 0, cores: [], cpuHist: [], memU: 0, memT: 1, memCache: 0, swapU: 0, swapT: 0, ramHist: [],
        up: "0.0", down: "0.0", upHist: [], downHist: [], temp: 0, mhz: 0, load: "—", uptime: "—",
        disks: [], procs: [], sel: "", selProc: null, scroll: 0, prevCpu: null, prevNet: null, aCpu: 0, aMem: 0,
        tab: "task",
        sysInfo: { distro: "—", kernel: "—", host: "—", user: "—", cpu: "—", gpu: "—", gtk: "—", icon: "—", shell: "—", wm: "—", res: `${SW}x${SH}`,
          pkgs: "—", session: "—", term: "—", arch: "—", gpuLoad: -1, gpuHist: [],
        coresPhys: "—", maxFreq: "—", cache: "—", gpuDriver: "—", gpuVram: "—", gpuTemp: "—",
            procCount: "—", localIp: "—", battery: "—" },
        initApps: [], initScroll: 0,
    }
    let ctrl
    const fetchInitApps = () => {
        sh(`seen=""
for f in "$HOME/.config/autostart"/*.desktop /etc/xdg/autostart/*.desktop; do
  [ -f "$f" ] || continue
  b=$(basename "$f")
  case " $seen " in *" $b "*) continue;; esac
  seen="$seen $b"
  NAME=$(grep -m1 '^Name=' "$f" | cut -d= -f2-)
  EN=1
  grep -qE '^Hidden=true|^X-GNOME-Autostart-enabled=false' "$f" && EN=0
  printf '%s\\t%s\\t%s\\n' "$f" "$NAME" "$EN"
done`).then((o) => {
            st.initApps = o.trim().split("\n").filter(Boolean).map((l) => {
                const [path, name, en] = l.split("\t")
                const base = (path || "").split("/").pop() || ""
                return { path, base, name: name || base.replace(/\.desktop$/, ""), enabled: en === "1" }
            })
            ctrl.requestDraw()
        })
    }
    const toggleAutostart = (app) => {
        sh(`mkdir -p "$HOME/.config/autostart"
DST="$HOME/.config/autostart/${app.base}"
[ "${app.path}" != "$DST" ] && cp -f "${app.path}" "$DST"
if grep -qE '^Hidden=true|^X-GNOME-Autostart-enabled=false' "$DST"; then
  sed -i '/^Hidden=/d;/^X-GNOME-Autostart-enabled=/d' "$DST"
else
  printf '\\nX-GNOME-Autostart-enabled=false\\n' >> "$DST"
fi`).then(() => timeout(200, fetchInitApps))
    }
    const fetchSysInfo = () => {
        sh("uname -r").then((o) => { st.sysInfo.kernel = o.trim() || "—"; ctrl.requestDraw() })
        sh("whoami").then((o) => { st.sysInfo.user = o.trim() || "—"; ctrl.requestDraw() })
        sh("hostname").then((o) => { st.sysInfo.host = o.trim() || "—"; ctrl.requestDraw() })
        sh("grep -m1 'model name' /proc/cpuinfo | cut -d: -f2").then((o) => { st.sysInfo.cpu = o.trim() || "—"; ctrl.requestDraw() })
        sh("lspci 2>/dev/null | grep -Ei 'vga|3d|display' | head -1 | sed 's/^.*: //'").then((o) => { st.sysInfo.gpu = o.trim() || "—"; ctrl.requestDraw() })
        sh("grep -m1 PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"'").then((o) => { st.sysInfo.distro = o.trim() || "—"; ctrl.requestDraw() })
        sh("gsettings get org.gnome.desktop.interface icon-theme 2>/dev/null | tr -d \"'\"").then((o) => { st.sysInfo.icon = o.trim() || "—"; ctrl.requestDraw() })
        sh("gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null | tr -d \"'\"").then((o) => { st.sysInfo.gtk = o.trim() || "—"; ctrl.requestDraw() })
        sh("hyprctl version -j 2>/dev/null | jq -r .version").then((o) => { st.sysInfo.wm = o.trim() ? `Hyprland ${o.trim()}` : "Hyprland"; ctrl.requestDraw() })
        sh("basename \"$SHELL\"").then((o) => { st.sysInfo.shell = o.trim() || "—"; ctrl.requestDraw() })
      sh("pacman -Q 2>/dev/null | wc -l").then((o) => { st.sysInfo.pkgs = o.trim() || "—"; ctrl.requestDraw() })
        sh("echo \"$XDG_SESSION_TYPE\"").then((o) => { st.sysInfo.session = o.trim() || "—"; ctrl.requestDraw() })
    sh("basename \"$(echo $TERM)\"").then((o) => { st.sysInfo.term = o.trim() || "—"; ctrl.requestDraw() })
        sh("uname -m").then((o) => { st.sysInfo.arch = o.trim() || "—"; ctrl.requestDraw() })
      sh("ps -e --no-headers 2>/dev/null | wc -l").then((o) => { st.sysInfo.procCount = o.trim() || "—"; ctrl.requestDraw() })
    sh("ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \\K\\S+'").then((o) => { st.sysInfo.localIp = o.trim() || "—"; ctrl.requestDraw() })
        sh("cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -1").then((o) => { st.sysInfo.battery = o.trim() ? `${o.trim()}%` : "N/A"; ctrl.requestDraw() })
    }
  const fetchCpuExtra = () => {
      sh("lscpu 2>/dev/null").then((o) => {
    const cpuMetr = o
        const grb = (re) => { const m = cpuMetr.match(re); return m ? m[1].trim() : "" }
      const cps = parseInt(grb(/Core\(s\) per socket:\s*(\d+)/)) || 0, sock = parseInt(grb(/Socket\(s\):\s*(\d+)/)) || 1
    st.sysInfo.coresPhys = cps ? `${cps * sock}` : "—"
          const mhzRaw = parseFloat(grb(/CPU max MHz:\s*([\d.]+)/))
        st.sysInfo.maxFreq = !isNaN(mhzRaw) ? `${(mhzRaw / 1000).toFixed(2)}GHz` : "—"
      st.sysInfo.cache = grb(/L3 cache:\s*(.+)/) || grb(/L2 cache:\s*(.+)/) || "—"
          ctrl.requestDraw()
    })
  }
    const fetchGpuExtra = () => {
        sh("lspci -k 2>/dev/null | grep -A3 -Ei 'vga|3d|display' | grep 'Kernel driver in use' | head -1 | cut -d: -f2").then((o) => { st.sysInfo.gpuDriver = o.trim() || "—"; ctrl.requestDraw() })
      sh("cat /sys/class/drm/card*/device/mem_info_vram_total 2>/dev/null | head -1").then((o) => {
        const vb = parseInt(o.trim())
            st.sysInfo.gpuVram = vb > 0 ? `${(vb / 1073741824).toFixed(1)}G` : "—"
        ctrl.requestDraw()
      })
        sh("nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null").then((o) => {
      const gt = parseFloat(o.trim())
          st.sysInfo.gpuTemp = !isNaN(gt) ? `${gt}°C` : "—"
      ctrl.requestDraw()
        })
    }
  const pushGpu = (v) => {
    st.sysInfo.gpuLoad = v; st.sysInfo.gpuHist.push(v)
    if (st.sysInfo.gpuHist.length > 40) st.sysInfo.gpuHist.shift()
      ctrl.requestDraw()
  }
    const fetchGpuLoad = () => {
      sh("nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null").then((o) => {
        const v = parseFloat(o.trim()); if (!isNaN(v)) return pushGpu(v)
      sh("cat /sys/class/drm/card*/device/gpu_busy_percent 2>/dev/null | head -1").then((o2) => {
            const v2 = parseFloat(o2.trim()); if (!isNaN(v2)) return pushGpu(v2)
        sh("A=$(cat /sys/class/drm/card*/device/drm/*/gt_act_freq_mhz 2>/dev/null|head -1); M=$(cat /sys/class/drm/card*/device/drm/*/gt_max_freq_mhz 2>/dev/null|head -1); echo \"$A $M\"").then((o3) => {
          const [a, m] = o3.trim().split(/\s+/).map(Number)
                if (m > 0 && !isNaN(a)) pushGpu(Math.round(a / m * 100))
        })
      })
        })
    }
    const sample = () => {
        const c = cpuSnap()
        if (st.prevCpu && st.prevCpu.total.length === c.total.length) {
            const pct: number[] = []
            for (let i = 0; i < c.total.length; i++) {
                const dt = c.total[i] - st.prevCpu.total[i], di = c.idle[i] - st.prevCpu.idle[i]
                pct.push(dt > 0 ? Math.max(0, Math.min(100, Math.round(100 * (dt - di) / dt))) : 0)
            }
            st.cpu = pct[0] ?? 0
            st.cores = pct.slice(1)
            st.cpuHist.push(st.cpu); if (st.cpuHist.length > 60) st.cpuHist.shift()
        }
        st.prevCpu = c

        const mi: any = {}
        for (const line of rdf("/proc/meminfo").split("\n")) {
            const m = line.match(/^(\w+):\s+(\d+)/); if (m) mi[m[1]] = parseInt(m[2])
        }
        st.memT = mi.MemTotal || 1
        st.memU = st.memT - (mi.MemAvailable ?? st.memT)
        st.memCache = (mi.Cached || 0) + (mi.Buffers || 0)
        st.swapT = mi.SwapTotal || 0
        st.swapU = st.swapT - (mi.SwapFree || 0)
        st.ramHist.push(100 * st.memU / st.memT); if (st.ramHist.length > 60) st.ramHist.shift()

        const n = netSnap()
        if (st.prevNet) {
            const dt = Math.max(1e-6, (n.t - st.prevNet.t) / 1e6)
            const d = Math.max(0, (n.rx - st.prevNet.rx) / dt), u = Math.max(0, (n.tx - st.prevNet.tx) / dt)
            st.down = mbps(d); st.up = mbps(u)
            st.downHist.push(d * 8 / 1e6); if (st.downHist.length > 40) st.downHist.shift()
            st.upHist.push(u * 8 / 1e6); if (st.upHist.length > 40) st.upHist.shift()
        }
        st.prevNet = n

        st.temp = cpuTemp(); st.mhz = cpuMHz()
        st.load = rdf("/proc/loadavg").trim().split(/\s+/).slice(0, 3).join("  ") || "—"
        st.uptime = fmtUp(parseFloat(rdf("/proc/uptime").split(" ")[0]) || 0)
        ctrl.requestDraw()
    }
    const refreshDisks = () => sh("df -B1 --output=source,target,size,used -x tmpfs -x devtmpfs -x efivarfs -x squashfs -x overlay 2>/dev/null | tail -n +2 | awk '$3>0 && !seen[$1]++ {print $2, $3, $4}' | head -4").then((o) => {
        st.disks = o.trim().split("\n").filter(Boolean).map((l) => {
            const f = l.trim().split(/\s+/)
            const size = Number(f[1]), used = Number(f[2])
            return { mount: f[0], frac: size > 0 ? used / size : 0, used: used / 1e9, size: size / 1e9 }
        })
        ctrl.requestDraw()
    })
    const refresh = () => {
        sample()
        fetchGpuLoad()
        sh("ps -eo pid,comm,%cpu,%mem --sort=-%cpu --no-headers 2>/dev/null | head -20").then((o) => {
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
        name: "sys", tabTitle: "SYSTEM MONITOR", W: SW, H: SH, noGlass: true, pad: 0,
        idleFrameMs: 70,
        onFrame: () => {
            const tc = st.cpu / 100, tm = st.memU / st.memT
            st.aCpu += (tc - st.aCpu) * 0.16
            st.aMem += (tm - st.aMem) * 0.16
        },
        onOpen: () => {
            st.sel = ""; st.selProc = null; st.scroll = 0; st.cpuHist = []; st.ramHist = []
            st.upHist = []; st.downHist = []; st.prevCpu = null; st.prevNet = null
            startModalStats(); sample(); refresh(); refreshDisks(); fetchSysInfo(); fetchCpuExtra(); fetchGpuExtra(); fetchInitApps(); sysSndOn()
        },
        onClose: () => { stopModalStats(); sysSndOff() },
        poll: refresh, pollMs: 900,
        onScroll: (d) => {
            if (st.tab === "task") { st.scroll = Math.max(0, Math.min(Math.max(0, st.procs.length - 1), st.scroll + d)); ctrl.requestDraw() }
            else if (st.tab === "init") { st.initScroll = Math.max(0, Math.min(Math.max(0, st.initApps.length - 1), st.initScroll + d)); ctrl.requestDraw() }
        },
        draw: (ctx, g) => {
            const X = g.X, Y = g.Y, W = g.w, H = g.h
            const memF = st.memU / st.memT

            const FW = SW, FH = SH
            ctx.setSourceRGBA(0.015, 0.02, 0.03, 0.42); ctx.rectangle(0, 0, FW, FH); ctx.fill()
            const pulse = 0.94 + 0.06 * Math.sin(Date.now() / 500)
            const vcx = FW / 2, vcy = FH / 2, reach = Math.hypot(FW, FH) / 2
            const vg = new Cairo.RadialGradient(vcx, vcy, reach * 0.16, vcx, vcy, reach * 0.98)
            vg.addColorStopRGBA(0, 0.02, 0, 0.01, 0.46)
            vg.addColorStopRGBA(0.5, 0.06, 0, 0.01, 0.68)
            vg.addColorStopRGBA(1, 0.19, 0, 0.03, 0.92 * pulse)
            ctx.setSource(vg); ctx.rectangle(0, 0, FW, FH); ctx.fill()

            const hy = Y + 40
            ctx.setSourceRGBA(SYSR[0], SYSR[1], SYSR[2], 0.55); ctx.setLineWidth(1)
            ctx.newPath(); ctx.moveTo(X + 40, hy + 26); ctx.lineTo(X + W - 40, hy + 26); ctx.stroke()
            const pair = (px, num, lab, col) => {
                ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(23)
                txt(ctx, px, hy + 18, num, TITLE, 23, col, 0.98, 1, 0.4)
                const nw = ctx.textExtents(num).width
                txt(ctx, px + nw + 8, hy + 18, lab, TITLE, 12, col, 0.8, 1)
                for (let i = 0; i < 6; i++) {
                    ctx.setSourceRGBA(col[0], col[1], col[2], i < 3 ? 0.8 : 0.25)
                    ctx.rectangle(px + i * 9, hy + 30, i < 3 ? 7 : 3, 2); ctx.fill()
                }
                return px + nw + 14 + ctx.textExtents(lab).width
            }
            let hx = X + 46
            hx = pair(hx, `${st.cpu}`, "CPU", SYSY) + 34
            hx = pair(hx, `${Math.round(memF * 100)}`, "MEM", SYSC) + 34
            const tabs = [["PROC_LIST", "task"], ["SYS_INFO", "system"], ["INIT_DAEMON", "init"]]
            ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(13)
            let tw2 = tabs.reduce((a2, [t]) => a2 + ctx.textExtents(t).width + 30, 0)
            let tx3 = X + W / 2 - tw2 / 2
            tabs.forEach(([t, id]) => {
              const w2 = ctx.textExtents(t).width, active = st.tab === id
                const hv = g.push.hoverKey === `tab:${id}`
              const tcol: any = active ? SYSC : (hv ? [1, 0.55, 0.5] : SYSR)
                if (hv && !active) {
              ctx.setSourceRGBA(tcol[0], tcol[1], tcol[2], 0.06 + 0.04 * Math.sin(Date.now() / 130))
                    ctx.rectangle(tx3 - 8, hy, w2 + 16, 28); ctx.fill()
                }
                txt(ctx, tx3, hy + 16, t, TITLE, 13, tcol, active ? 0.98 : (hv ? 0.9 : 0.72), 1)
              if (active) { ctx.setSourceRGBA(SYSC[0], SYSC[1], SYSC[2], 0.95); ctx.rectangle(tx3, hy + 23, w2, 2); ctx.fill() }
                g.push({ kind: "tab", key: `tab:${id}`, hoverable: true, bx0: tx3 - 10, by0: hy, bx1: tx3 + w2 + 10, by1: hy + 28, on: () => { st.tab = id; ctrl.requestDraw() } })
              tx3 += w2 + 30
            })
            const rt = `${st.temp ? st.temp + "°C" : "—"}    ${st.mhz ? (st.mhz / 1000).toFixed(2) + "GHz" : "—"}    ${kbToG(st.memU).toFixed(1)}/${kbToG(st.memT).toFixed(1)}G`
            ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(15)
            txt(ctx, X + W - ctx.textExtents(rt).width - 46, hy + 18, rt, TITLE, 15, SYSY, 0.92, 1)
            ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(9)
            const lt = `UP ${st.uptime}   LOAD ${st.load}`
            txt(ctx, X + W - ctx.textExtents(lt).width - 46, hy + 40, lt, MONO, 9, SYSDIM, 0.6)

            const gTop = Y + 190, gH = H - 400
            ladder(ctx, X + 70, gTop, 30, gH, st.aCpu, SYSY, ch(0xf2db), "CPU", `${st.cpu}`, "r")
            ladder(ctx, X + W - 100, gTop, 30, gH, st.aMem, SYSC, ch(0xefc5), "MEM", `${Math.round(memF * 100)}`, "l")

            const mx = X + 350, mw = W - 700
            let cy3 = Y + 150

            if (st.tab === "task") {
                groupLabel(ctx, mx, cy3, "// CORE ARRAY")
                const ncols = Math.max(1, st.cores.length)
                const sw3 = Math.min(120, (mw - (ncols - 1) * 14) / ncols), sgw = ncols * sw3 + (ncols - 1) * 14
                st.cores.forEach((v, i) => {
                    slotSq(ctx, mx + (mw - sgw) / 2 + i * (sw3 + 14), cy3 + 10, sw3, 62, `C${i}`, `${v}%`, v / 100, SYSY, v > 85)
                })

                cy3 += 92
                groupLabel(ctx, mx, cy3, "// MEMORY")
                const m3 = (mw / 2 - 40 - 28) / 3
                slotSq(ctx, mx, cy3 + 10, m3, 62, "USED", `${kbToG(st.memU).toFixed(1)}G`, memF, SYSC, false)
                slotSq(ctx, mx + m3 + 14, cy3 + 10, m3, 62, "CACHE", `${kbToG(st.memCache).toFixed(1)}G`, st.memCache / st.memT, SYSC, false)
                slotSq(ctx, mx + (m3 + 14) * 2, cy3 + 10, m3, 62, "SWAP", st.swapT ? `${kbToG(st.swapU).toFixed(1)}G` : "—", st.swapT ? st.swapU / st.swapT : 0, SYSC, false)

                const nx = mx + mw / 2 + 20
                groupLabel(ctx, nx, cy3, "// NETWORK")
                const n2 = (mw / 2 - 20 - 14) / 2
                slotSq(ctx, nx, cy3 + 10, n2, 62, "UPLINK", `${st.up}`, -1, SYSY, false)
                slotSq(ctx, nx + n2 + 14, cy3 + 10, n2, 62, "DOWNLINK", `${st.down}`, -1, SYSC, false)
                drawGraph(ctx, nx, cy3 + 78, n2, 44, st.upHist, Math.max(1, ...st.upHist), SYSY)
                drawGraph(ctx, nx + n2 + 14, cy3 + 78, n2, 44, st.downHist, Math.max(1, ...st.downHist), SYSC)

                groupLabel(ctx, mx, cy3 + 92, "// STORAGE")
                st.disks.slice(0, 2).forEach((d, i) => {
                    slotSq(ctx, mx + i * (m3 + 14), cy3 + 102, m3, 44, d.mount.slice(0, 10), `${Math.round(d.frac * 100)}%`, d.frac, d.frac > 0.9 ? SYSR : SYSC, d.frac > 0.9)
                })

                const py = cy3 + 172
                groupLabel(ctx, mx, py, "// PROCESSES")
                drawBtn(ctx, g.push, mx + mw - 150, py - 16, 150, 26, st.sel ? "FORCE KILL" : "SELECT A PROC", killSel, !!st.sel, SYSR, st.sel ? ch(0xf011) : "")
                const ly = py + 14, lh = (Y + H) - ly - 46
                const pinned = st.sel ? (st.selProc || st.procs.find((p) => p.pid === st.sel)) : null
                const rest = pinned ? st.procs.filter((p) => p.pid !== st.sel) : st.procs
                drawProcList(ctx, g.push, mx, ly, mw, lh, rest, st.scroll, st.sel, pinned, select, (p) => { select(p); killSel() })
                txt(ctx, X + 46, Y + H - 22, "SCROLL processes · CLICK to select · RIGHT-CLICK kills · ESC closes", MONO, 9, SYSDIM, 0.5)
            } else if (st.tab === "system") {
            groupLabel(ctx, mx, cy3, "// SYS_INFO")
                  const sw4 = (mw - 28) / 3, gpuOk = st.sysInfo.gpuLoad >= 0
              slotSq(ctx, mx, cy3 + 14, sw4, 62, "GPU LOAD", gpuOk ? `${st.sysInfo.gpuLoad}%` : "N/A", gpuOk ? st.sysInfo.gpuLoad / 100 : -1, SYSY, gpuOk && st.sysInfo.gpuLoad > 85)
                slotSq(ctx, mx + sw4 + 14, cy3 + 14, sw4, 62, "CORES", `${NCORES}`, -1, SYSC, false)
              slotSq(ctx, mx + (sw4 + 14) * 2, cy3 + 14, sw4, 62, "UPTIME", st.uptime, -1, SYSC, false)

                  let gy = cy3 + 94
              groupLabel(ctx, mx, gy, "// CPU")
                drawGraph(ctx, mx, gy + 10, mw, 38, st.cpuHist, 100, SYSY)
              gy += 62
                  if (gpuOk) {
                groupLabel(ctx, mx, gy, "// GPU")
                    drawGraph(ctx, mx, gy + 10, mw, 38, st.sysInfo.gpuHist, 100, SYSC)
                  gy += 62
                  }

              const fields = [
                  ["MACHINE_NAME", st.sysInfo.host], ["ACTIVE_USER", st.sysInfo.user], ["OS", st.sysInfo.distro],
                ["KERNEL", st.sysInfo.kernel], ["ARCH", st.sysInfo.arch], ["CORE_CPU", st.sysInfo.coresPhys],
                    ["THREADS", `${NCORES}`], ["CPU_MODEL", st.sysInfo.cpu], ["CPU_FREQ", st.sysInfo.maxFreq],
                ["CPU_CACHE", st.sysInfo.cache], ["GPU_MODEL", st.sysInfo.gpu], ["GPU_DRIVER", st.sysInfo.gpuDriver],
                  ["GPU_VRAM", st.sysInfo.gpuVram], ["GPU_TEMP", st.sysInfo.gpuTemp],
                ["MEMORY", `${kbToG(st.memU).toFixed(1)}/${kbToG(st.memT).toFixed(1)}G`],
                    ["SWAP", st.swapT ? `${kbToG(st.swapU).toFixed(1)}/${kbToG(st.swapT).toFixed(1)}G` : "—"],
                  ["DISK", st.disks[0] ? `${st.disks[0].used.toFixed(0)}/${st.disks[0].size.toFixed(0)}G` : "—"],
                ["BATTERY", st.sysInfo.battery], ["WM", st.sysInfo.wm], ["SESSION", st.sysInfo.session],
                    ["SHELL", st.sysInfo.shell], ["TERMINAL", st.sysInfo.term], ["ICON_THEME", st.sysInfo.icon],
                  ["GTK_THEME", st.sysInfo.gtk], ["RESOLUTION", st.sysInfo.res], ["PACKAGES", st.sysInfo.pkgs],
                ["PROCESSES", st.sysInfo.procCount], ["LOAD_AVG", st.load], ["LOCAL_IP", st.sysInfo.localIp],
              ]
                  const cw3 = mw / 3
              fields.forEach(([k, v], i) => {
                const fx = mx + (i % 3) * cw3, fy = gy + 8 + Math.floor(i / 3) * 20
                    const lbl = `// ${k}: `
                  txt(ctx, fx, fy, lbl, MONO, 8.5, SYSR, 0.85, 0)
                txt(ctx, fx + ctx.textExtents(lbl).width, fy, String(v || "—"), TITLE, 9.5, SYSC, 0.95, 0)
              })
            } else if (st.tab === "init") {
              groupLabel(ctx, mx, cy3, "// INIT_DAEMON")
                const total = st.initApps.length, onBoot = st.initApps.filter((a) => a.enabled).length
              const cnt = `TOTAL ${total}   ON BOOT ${onBoot}   OFF ${total - onBoot}`
                ctx.selectFontFace(MONO, 0, 0); ctx.setFontSize(9.5)
              txt(ctx, mx + mw - ctx.textExtents(cnt).width, cy3, cnt, MONO, 9.5, SYSDIM, 0.75, 0)
                const ly = cy3 + 24, lh = (Y + H) - ly - 46, step = 46
              const vis = Math.max(1, Math.floor(lh / step))
                st.initScroll = Math.min(st.initScroll, Math.max(0, st.initApps.length - vis))
              ctx.save(); ctx.rectangle(mx - 3, ly - 3, mw + 6, lh + 6); ctx.clip()
                for (let i = 0; i <= vis; i++) {
                  const idx = st.initScroll + i; if (idx >= st.initApps.length) break
                    initRow(ctx, g.push, mx, ly + i * step, mw, st.initApps[idx], toggleAutostart)
                }
                ctx.restore()
                txt(ctx, X + 46, Y + H - 22, "SCROLL apps · CLICK button to toggle · ESC closes", MONO, 9, SYSDIM, 0.5)
            }
        },
    })
    return ctrl
}
const KEYBINDS = [
    ["SUPER + TAB", "APP LAUNCHER"], ["H", "HELP MENU"], ["Z", "HUD OVERLAY"], ["V", "VOLUME"],
    ["I", "BRIGHTNESS"], ["U", "SYSTEM UPGRADE"], ["J", "DISMISS UPDATE"], ["M", "MICROPHONE"],["G", "MARKETS"], ["O", "MUSIC PLAYER"], ["N", "NETWORKS"],
    ["B", "BLUETOOTH"], ["W", "FORECAST"], ["P", "POWER MENU"], ["Y", "BATTERY"],
    ["C", "CPU / RAM"], ["L", "LOCKSCREEN"], ["R", "SCREEN RECORD"], ["S", "SCREENSHOT"],
    ["T", "TERMINAL"], ["K", "KILL MODE"], ["-", "TIME / TIMEZONE"], 
]
const drawKeyCap = (ctx, x, y, label, h) => {
    ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(11); const tw = ctx.textExtents(label).width
    const w = Math.max(26, tw + 16)
    btnPath(ctx, x, y, w, h); ctx.setSourceRGBA(CR * 0.2, CG * 0.2, CB * 0.28, 0.55); ctx.fill()
    btnPath(ctx, x, y, w, h); ctx.setSourceRGBA(CYAN[0], CYAN[1], CYAN[2], 0.85); ctx.setLineWidth(1); ctx.stroke()
    ctx.setSourceRGBA(0.92, 0.99, 1, 0.97); ctx.moveTo(x + w / 2 - tw / 2, y + h / 2 + 4); ctx.showText(label)
    return w
}
const HYPRBINDS = [
    ["SUPER + SHIFT + F", "FULLSCREEN TOGGLE"],
    ["SUPER + F", "FLOAT / TILE TOGGLE"],
    ["SUPER + ← → ↑ ↓", "FOCUS WINDOW"],
    ["SUPER + SHIFT + ← → ↑ ↓", "MOVE WINDOW"],
    ["CTRL + SHIFT + ← → ↑ ↓", "RESIZE WINDOW"],
    ["ALT + SHIFT + 1…0", "WINDOW → WORKSPACE"],
    ["SUPER + D", "PEEK DESKTOP"],
]
const readThemeMod = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(`${CYBER_DIR}/theme.lua`)
        if (ok) {
            const m = new TextDecoder().decode(bytes).match(/^\s*local\s+themeMod\s*=\s*"([^"]+)"/m)
            if (m) return m[1].trim().replace(/\s*\+\s*/g, " + ")
        }
    } catch { }
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
    name: "keys", tabTitle: "KEYBINDS", W: 470, H: 660,
    onOpen: () => { keysMod = readThemeMod() },
    draw: (ctx, g) => {
        const x = g.X + 24, top = g.Y + HEADER + 10
        txt(ctx, x, top + 6, `// PREFIX  ${keysMod}  +  KEY`, MONO, 10, ACC, 0.72, 1)
        const gridTop = top + 26, colW = (g.w - 48) / 2, rowH = 30, capH = 22, half = Math.ceil(KEYBINDS.length / 2)
        KEYBINDS.forEach(([key, action], i) => {
            const cx = x + (i < half ? 0 : 1) * colW, cy = gridTop + (i % half) * rowH
            const cw = drawKeyCap(ctx, cx, cy, key, capH)
            txt(ctx, cx + cw + 10, cy + capH / 2 + 4, action, TITLE, 11, CYAN, 0.92, 1)
        })

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
const chgCbs: any[] = []
export const onModalChange = (cb) => { chgCbs.push(cb) }
const fireChange = () => { for (const cb of chgCbs) cb() }

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

let sysInst: any = null, sysKey = ""
const sysDims = () => {
  try {
    const m = activeMonitor()
    const g = m && m.get_geometry ? m.get_geometry() : null
    if (g && g.width > 0 && g.height > 0) return [g.width, g.height]
  } catch { }
  return [SCREEN_WIDTH, SCREEN_HEIGHT]
}
const sysGet = () => {
  const d = sysDims(), key = `${d[0]}x${d[1]}`
  if (!sysInst || sysKey !== key) {
    if (sysInst) { try { sysInst.close() } catch { } }
    sysInst = SysCtrl(d[0], d[1]); sysKey = key; cregistry["sys"] = sysInst
  }
  return sysInst
}
export const CModalWindows = () => [register(VolCtrl()), register(BrtCtrl()), register(WifiCtrl()), register(BtCtrl()), register(PwrCtrl()), register(BatCtrl()), register(KeysCtrl()), register(AurCtrl())]


export const toggleModal = (name) => {
    if (name === "mic") name = "vol"
    if (name === "sys") sysGet()
    for (const k in cregistry) if (k !== name) cregistry[k].close()
    if (cregistry[name]) { cregistry[name].toggle() }
    else { for (const k in cregistry) cregistry[k].close() }
}
export const isModalOpen = (name) => { if (name === "mic") name = "vol"; return cregistry[name] ? cregistry[name].isOpen() : false }
