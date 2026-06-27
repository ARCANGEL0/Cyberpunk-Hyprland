import { App, Window, Box, DrawingArea, activeMonitor, monitorAtPoint } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval, timeout, execAsync } from "astal"
import { SCREEN_WIDTH, SCREEN_HEIGHT, CYBER_DIR } from "../../env.ts"
import { NEON, f, RGB } from "./colors.ts"
import { makePlane, tiltText, fillQuad } from "./proj.ts"
import GLib from "gi://GLib"
import Gdk from "gi://Gdk?version=3.0"
import GdkPixbuf from "gi://GdkPixbuf"

let _empty= null
const emptyRegion = () => { if (_empty) return _empty; try { _empty = new (imports as any).cairo.Region() } catch (e) { print(e) } return _empty }
export const passthrough = (win) => {
 const apply = () => { try { const gw = win.get_window?.(); const r = emptyRegion(); if (gw && r) gw.input_shape_combine_region(r, 0, 0) } catch {} }
 win.connect("realize", apply); win.connect("map", apply); timeout(60, apply)
}

const rnd = (a, b) => a + Math.random() * (b - a)
const HEX = ["1C", "55", "BD", "E9", "7A", "FF", "A3", "2D", "C0", "E1", "9F", "B4"]
const MONO = "JetBrains Mono"
const TITLE = "Chakra Petch"
const GX = 78, GY = 52

let grid= []
let seq: [number, number][] = []
let cols = 0, rows = 0
const genBreach = () => {
 cols = Math.ceil(SCREEN_WIDTH / GX); rows = Math.ceil(SCREEN_HEIGHT / GY)
 grid = []
 for (let r = 0; r < rows; r++) { const row= []; for (let c = 0; c < cols; c++) row.push(HEX[(Math.random() * HEX.length) | 0]); grid.push(row) }
 seq = []
 let cr = (rows / 2) | 0, cc = (cols / 4) | 0
 for (let k = 0; k < 6; k++) {
 seq.push([cr, cc])
 if (k % 2 === 0) cc = Math.min(cols - 2, cc + 1 + ((Math.random() * 3) | 0))
 else cr = Math.min(rows - 2, Math.max(1, cr + (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 2) | 0))))
 }
}

const drawBreach = (ctx, W, H, p, title, sub, flash) => {
 const env = p < 0.14 ? p / 0.14 : 1 - (p - 0.14) / 0.86
 const [rr, rg, rb] = f(NEON.red)
 const [gr, gg, gb] = f(NEON.green)
 ctx.setSourceRGBA(0.02, 0.0, 0.01, 0.4 * env)
 ctx.rectangle(0, 0, W, H); ctx.fill()
 if (flash) { ctx.setSourceRGBA(rr, rg, rb, 0.32 * env * flash); ctx.rectangle(0, 0, W, H); ctx.fill() }
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(15)
 const reveal = p * 1.35
 const cursor = Math.min(seq.length - 1, Math.floor(p * 1.3 * seq.length))
 const seqSet = new Map<string, number>(); seq.forEach((s, i) => seqSet.set(`${s[0]},${s[1]}`, i))
 for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
 const order = (c + r) / (cols + rows)
 if (order > reveal) continue
 const x = c * GX + 14, y = r * GY + 34
 const key = `${r},${c}`, si = seqSet.get(key)
 if (si !== undefined) {
 const done = si <= cursor
 ctx.setSourceRGBA(rr, rg, rb, (si === cursor ? 1 : 0.85) * env)
 ctx.moveTo(x - 6, y); ctx.showText("[")
 ctx.moveTo(x + 22, y); ctx.showText("]")
 if (si === cursor) ctx.setSourceRGBA(1, 1, 1, env)
 else ctx.setSourceRGBA(done ? gr : rr, done ? gg : rg, done ? gb : rb)
 ctx.moveTo(x, y); ctx.showText(grid[r][c])
 } else {
 const edge = Math.max(0, 1 - (reveal - order) * 4)
 ctx.setSourceRGBA(rr, rg, rb, (0.4 + 0.5 * edge) * env)
 ctx.moveTo(x, y); ctx.showText(grid[r][c])
 }
 }
 for (let i = 0; i < 5; i++) { const yy = rnd(0, H), off = rnd(-40, 40) * env; ctx.setSourceRGBA(rr, rg, rb, 0.10 * env); ctx.rectangle(off, yy, W, 3); ctx.fill() }
 ctx.setFontSize(20)
 ctx.setSourceRGBA(rr, rg, rb, 0.95 * env)
 ctx.moveTo(60, 64); ctx.showText(`BREACH PROTOCOL // ${title}`)
 ctx.setFontSize(13); ctx.setSourceRGBA(rr, rg, rb, 0.6 * env)
 ctx.moveTo(60, 86); ctx.showText("BUFFER " + seq.map((s, i) => i <= cursor ? grid[s[0]][s[1]] : "··").join(" "))
 const complete = p > 0.66
 ctx.setFontSize(46); ctx.selectFontFace(TITLE, 0, 1)
 const msg = complete ? "UPLOAD COMPLETE" : sub
 const te = ctx.textExtents(msg); const cxm = W / 2 - te.width / 2, cym = H / 2
 const j = rnd(-2, 2) * env
 ctx.setSourceRGBA(complete ? gr : rr, complete ? gg : rg, complete ? gb : rb, 0.55 * env)
 ctx.moveTo(cxm - 3 + j, cym); ctx.showText(msg)
 ctx.setSourceRGBA(1, 1, 1, 0.95 * env); ctx.moveTo(cxm, cym); ctx.showText(msg)
 ctx.setFontSize(15); ctx.setSourceRGBA(rr, rg, rb, 0.8 * env)
 const t2 = `// ${title}`; ctx.moveTo(W / 2 - ctx.textExtents(t2).width / 2, cym + 28); ctx.showText(t2)
}

// cairo animation helpers
type WsState = {
 win: any, area: any, prog: number, timer: any, seed: number, start: number, busy: boolean,
 cachePix: any, frames: any[], small: any, pixbuf: any, lastCap: number, capPending: boolean,
 x: number, y: number, w: number, h: number, hw: number, hh: number, tmp: string, cache: string,
}
let wsStates: WsState[] = []
const WsCairo: any = (imports as any).cairo
const WS_DURATION = 320  // ms wall-clock for the whole glitch — snappy (~300ms faster)
const WS_FPS_MS   = 50    // ~20fps playback — plenty for datamosh flicker, light on CPU
const WS_FRAMES   = 9     // how many shatter frames to pre-render (flipbook length)
const WS_BANDS    = 14    // horizontal tear bands per frame
const WS_MAX_SHIFT = 120  // px max sideways displacement of real content
const WS_CACHE_TTL = 6000


const drawWsGlitchProc = (ctx, W, H, p, seed) => {
 // animation for workspace switch: horizontal tear bands, RGB split, pixel noise, and a quick flash. 
 const [rr, rg, rb] = f(NEON.red)
 const [cr, cg, cb] = f(NEON.cyan)
 // Fast envelope: quick in, hold, quick out
 const env = p < 0.06 ? p / 0.06 : p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45
 const s = seed
 const t = Date.now()
 const tr = (seed) => { let x = Math.sin(seed) * 43758.5453; return x - Math.floor(x) }

 // ── Full-screen dark flash) ──
 ctx.setSourceRGBA(0.03, 0.01, 0.02, 0.35 * env)
 ctx.rectangle(0, 0, W, H); ctx.fill()

 // horizontal glitch 
 for (let i = 0; i < 14; i++) {
     // Band Y
     const bandY = tr(s * 0.1 + i * 0.133) * H * 0.95 + H * 0.025
     // Band height:
     const isThin = tr(s * 0.15 + i * 0.271) > 0.45
     const bandH = isThin
         ? (8 + tr(s * 0.2 + i * 0.387) * 20)     // 8-28px thin bands
         : (35 + tr(s * 0.25 + i * 0.431) * 80)   // 35-115px thick bands
     // Displacemen for big shifts 
     const shiftDir = (i % 2 === 0) ? 1 : -1
     const maxShift = isThin
         ? (12 + tr(s * 0.3 + i * 0.519) * 25)    // 12-37px for thin
         : (25 + tr(s * 0.35 + i * 0.571) * 75)   // 25-100px for thick
     // Animate: fast slide out, hold, fast slide back
     let shiftFactor: number
     if (p < 0.10) shiftFactor = p / 0.10
     else if (p < 0.50) shiftFactor = 1
     else shiftFactor = 1 - (p - 0.50) / 0.50
     const shift = shiftDir * maxShift * shiftFactor * env

     ctx.setSourceRGBA(0.08, 0.04, 0.06, (0.5 + tr(s + i * 0.37) * 0.3) * env)
     ctx.rectangle(shift, bandY, W, bandH)
     ctx.fill()
     ctx.setSourceRGBA(0.15, 0.12, 0.14, (0.2 + tr(s + i * 0.41) * 0.15) * env)
     ctx.rectangle(shift + shiftDir * 3, bandY + 1, W * 0.85, bandH - 2)
     ctx.fill()

     // ── RGB channel split — Red channel ──
     ctx.setSourceRGBA(rr, rg * 0.05, rb * 0.08, (0.12 + tr(s + i * 0.29) * 0.1) * env)
     ctx.rectangle(shift + shiftDir * 8, bandY, W, bandH)
     ctx.fill()

     // ── RGB channel split — Cyan channel ──
     ctx.setSourceRGBA(cr * 0.1, cg * 0.5, cb * 0.7, (0.06 + tr(s + i * 0.33) * 0.06) * env)
     ctx.rectangle(shift - shiftDir * 5, bandY, W, bandH)
     ctx.fill()

// channel split tear line
     ctx.setSourceRGBA(1, 1, 1, 0.12 * env)
     ctx.setLineWidth(1)
     ctx.moveTo(Math.min(0, shift), bandY)
     ctx.lineTo(W + Math.max(0, shift), bandY)
     ctx.stroke()

     if (!isThin && env > 0.4) {
         const echoShift = shiftDir * (maxShift + 30) * shiftFactor * env
         ctx.setSourceRGBA(0.05, 0.03, 0.04, 0.12 * env)
         ctx.rectangle(echoShift, bandY + 2, W * 0.5, bandH - 4)
         ctx.fill()
     }
 }

 // ── Blocky data corruption chunks 
 for (let i = 0; i < 5; i++) {
     const bx = tr(s * 0.4 + i * 0.317) * W * 0.7 + W * 0.1
     const by = tr(s * 0.45 + i * 0.431) * H * 0.8 + H * 0.1
     const bw = 60 + tr(s * 0.5 + i * 0.547) * 250
     const bh = 20 + tr(s * 0.55 + i * 0.661) * 60
     const bShift = (tr(s * 0.6 + i * 0.773) - 0.5) * 120 * env
     ctx.setSourceRGBA(0.1, 0.06, 0.08, (0.25 + tr(s + i * 0.89) * 0.2) * env)
     ctx.rectangle(bx + bShift, by, bw, bh)
     ctx.fill()

     // RGB splitzz
     ctx.setSourceRGBA(rr * 0.4, 0, 0, 0.08 * env)
     ctx.rectangle(bx + bShift + 6, by, bw, bh)
     ctx.fill()
     ctx.setSourceRGBA(0, cg * 0.4, cb * 0.5, 0.05 * env)
     ctx.rectangle(bx + bShift - 4, by, bw, bh)
     ctx.fill()
 }

 // pixelated noise
    for (let i = 0; i < 15; i++) {
     const px = tr(t * 0.0004 + i * 0.191 + s * 0.04) * W
     const py = tr(t * 0.00045 + i * 0.307 + s * 0.05) * H
     const ps = 1 + (tr(s + i * 0.127) * 3 | 0)
     const pa = (0.15 + tr(s + i * 0.41) * 0.25) * env
     const cType = tr(s + i * 0.53)
     if (cType > 0.6) ctx.setSourceRGBA(1, 0.25, 0.55, pa)     // pink/magenta
     else if (cType > 0.3) ctx.setSourceRGBA(0.15, 0.7, 0.85, pa)  // cyan
     else ctx.setSourceRGBA(1, 0.85, 0.15, pa)                   // yellow
     ctx.rectangle(px, py, ps, ps); ctx.fill()
 }

 //wokrpace flash
 if (p >= 0.18 && p < 0.24) {
     const flashA = (1 - Math.abs(p - 0.21) / 0.03) * 0.15 * env
     ctx.setSourceRGBA(1, 1, 1, Math.max(0, flashA))
     ctx.rectangle(0, 0, W, H); ctx.fill()
 }
}

// sys failure animations 
const renderShatterFrame = (ctx, W, H, pix, seed) => {
 const tr = (s2) => { const x = Math.sin(s2) * 43758.5453; return x - Math.floor(x) }
 const [rr, rg, rb] = f(NEON.red)
 const [cr, cg, cb] = f(NEON.cyan)
 const NEAR = () => { try { ctx.getSource().setFilter(WsCairo.Filter.NEAREST) } catch {} }
 const s = seed
 const MS = WS_MAX_SHIFT >> 1   

 // frozen desktop + power-dip cast
 Gdk.cairo_set_source_pixbuf(ctx, pix, 0, 0); NEAR(); ctx.paint()
 ctx.setSourceRGBA(0.02, 0, 0.02, 0.22); ctx.rectangle(0, 0, W, H); ctx.fill()

 // horizontal displacement bands 
 for (let i = 0; i < WS_BANDS; i++) {
     const bandY = tr(s * 0.11 + i * 0.137) * H
     const thin  = tr(s * 0.17 + i * 0.271) > 0.5
     const bandH = thin ? 3 + tr(s * 0.2 + i * 0.39) * 10 : 13 + tr(s * 0.25 + i * 0.43) * 48
     const dir   = (i % 2 === 0) ? 1 : -1
     const mag   = thin ? 4 + tr(s * 0.3 + i * 0.52) * 17 : 12 + tr(s * 0.35 + i * 0.57) * (MS - 12)
     const shift = dir * mag
     ctx.save()
     ctx.rectangle(0, bandY, W, bandH); ctx.clip()
     Gdk.cairo_set_source_pixbuf(ctx, pix, shift, 0); NEAR(); ctx.paint()
     ctx.restore()
     ctx.setSourceRGBA(rr, rg * 0.1, rb * 0.1, 0.5); ctx.rectangle(shift, bandY, 2, bandH); ctx.fill()
     ctx.setSourceRGBA(cr * 0.2, cg, cb, 0.4); ctx.rectangle(shift + W - 2, bandY, 2, bandH); ctx.fill()
     ctx.setSourceRGBA(1, 1, 1, 0.08); ctx.setLineWidth(1)
     ctx.moveTo(0, bandY + 0.5); ctx.lineTo(W, bandY + 0.5); ctx.stroke()
 }

 const nBars = 2 + (tr(s * 0.6) * 2 | 0)   // 2-3 per frame
 for (let i = 0; i < nBars; i++) {
     const by = tr(s * 0.62 + i * 0.277) * H
     const bh = 1 + tr(s * 0.64 + i * 0.331) * 2                       // thin core
     const bx = tr(s * 0.66 + i * 0.419) * W * 0.35
     const bw = W * (0.45 + tr(s * 0.68 + i * 0.523) * 0.55)           // partial→near-full
     ctx.setSourceRGBA(rr, rg * 0.05, rb * 0.05, 0.10)                 // soft halo
     ctx.rectangle(bx, by - 3, bw, bh + 6); ctx.fill()
     ctx.setSourceRGBA(rr, rg * 0.18, rb * 0.18, 0.5)                  // bright core
     ctx.rectangle(bx, by, bw, bh); ctx.fill()
 }

 // sparse data-corruption specks
 for (let i = 0; i < 12; i++) {
     const px = tr(s * 0.81 + i * 0.191) * W, py = tr(s * 0.83 + i * 0.307) * H
     const ps = 1 + (tr(s + i * 0.127) * 2 | 0), pa = 0.12 + tr(s + i * 0.41) * 0.22
     const ct = tr(s + i * 0.53)
     if (ct > 0.6) ctx.setSourceRGBA(1, 0.25, 0.55, pa)
     else if (ct > 0.3) ctx.setSourceRGBA(0.15, 0.7, 0.85, pa)
     else ctx.setSourceRGBA(1, 0.85, 0.15, pa)
     ctx.rectangle(px, py, ps, ps); ctx.fill()
 }
}


// capture the current desktop to a half-res pixbuf for the shatter flipbook like 
const prepFrames = (st: WsState, pixbuf) => {
 st.small = pixbuf.scale_simple(st.hw, st.hh, GdkPixbuf.InterpType.NEAREST)
 st.frames = new Array(WS_FRAMES).fill(null)
}
const makeFrame = (st: WsState, idx) => {
 if (st.frames[idx]) return st.frames[idx]
 const surf = new WsCairo.ImageSurface(WsCairo.Format.ARGB32, st.hw, st.hh)
 const c = new WsCairo.Context(surf)
 renderShatterFrame(c, st.hw, st.hh, st.small, ((st.seed + idx * 131) % 9973) + 1)
 surf.flush()
 st.frames[idx] = surf
 return surf
}
const recache = (st: WsState) => {
 const now = Date.now()
 if (st.capPending || (st.cachePix && now - st.lastCap < WS_CACHE_TTL)) return
 st.capPending = true
 execAsync(["grim", "-t", "ppm", "-s", "0.5", "-g", `${st.x},${st.y} ${st.w}x${st.h}`, st.cache]).then(() => {
     try {
         st.cachePix = GdkPixbuf.Pixbuf.new_from_file(st.cache)
         for (const sf of st.frames) { try { sf && sf.finish() } catch {} }
         prepFrames(st, st.cachePix)
         for (let i = 0; i < WS_FRAMES; i++) makeFrame(st, i)
     } catch (e) { print(e) }
     st.lastCap = Date.now(); st.capPending = false
 }).catch(() => { st.capPending = false })
}

// Per animation frame: ONE scaled blit of a cached frame + a brief flash
const drawWs = (ctx, st: WsState, p) => {
 if (p <= 0 || p >= 1) return
 if (!st.small) { if (!st.pixbuf) drawWsGlitchProc(ctx, st.w, st.h, p, st.seed); return }
 let baseA = 1
 if (p > 0.70) {
     const tp = (p - 0.70) / 0.30                 // tail 0..1
     baseA = tp > 0.82 ? 0 : (Math.floor(tp * 5) % 2 === 0 ? 1 : 0)   // on/off strobe -> off
 }
 if (baseA <= 0.01) return
 const idx = p < 0.5
     ? Math.floor(p / 0.5 * WS_FRAMES * 2) % WS_FRAMES
     : (WS_FRAMES - 1)
 const surf = makeFrame(st, idx)
 ctx.save()
 ctx.scale(st.w / st.hw, st.h / st.hh)
 ctx.setSourceSurface(surf, 0, 0)
 try { ctx.getSource().setFilter(WsCairo.Filter.NEAREST) } catch {}
 ctx.paintWithAlpha(baseA)
 ctx.restore()
 if (p < 0.07) {
     const fa = (1 - p / 0.07) * 0.16
     ctx.setSourceRGBA(1, 1, 1, Math.max(0, fa)); ctx.rectangle(0, 0, st.w, st.h); ctx.fill()
 }
}

export const WsAnimWindow = () => {
 wsStates = []
 const mons = (() => { try { return Array.from((App as any).get_monitors()) } catch { return [] } })()
 const list = mons.length ? mons : [activeMonitor()].filter(Boolean)
 list.forEach((mon: any, i) => {
     const g = mon?.get_geometry?.()
     const x = g?.x ?? 0, y = g?.y ?? 0, w = g?.width ?? SCREEN_WIDTH, h = g?.height ?? SCREEN_HEIGHT
     const area = DrawingArea({})
     const st: WsState = {
         win: null, area, prog: 0, timer: null, seed: 0, start: 0, busy: false,
         cachePix: null, frames: [], small: null, pixbuf: null, lastCap: 0, capPending: false,
         x, y, w, h, hw: Math.max(1, w >> 1), hh: Math.max(1, h >> 1),
         tmp: `/tmp/aug_ws_frame_${i}.ppm`, cache: `/tmp/aug_ws_cache_${i}.ppm`,
     }
     area.set_size_request(w, h)
     area.connect("draw", (_w, ctx) => (drawWs(ctx, st, st.prog), false))
     st.win = Window({ name: `ws_anim_${i}`, className: "aug ws_anim", gdkmonitor: mon, anchor: Anchor.TOP | Anchor.BOTTOM | Anchor.LEFT | Anchor.RIGHT, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE, visible: false, child: area })
     wsStates.push(st)
 })
 return wsStates[0]?.win
}

const endWsAnim = (st: WsState) => {
 if (st.timer) { st.timer.cancel(); st.timer = null }
 st.win.visible = false
 st.busy = false
 recache(st)
}

const startWsAnim = (st: WsState) => {
 if (st.timer) { st.timer.cancel(); st.timer = null }
 st.start = Date.now(); st.prog = 0
 st.win.visible = true
 // NOTE: do NOT passthrough() this window — setting an empty input-shape region
 // freezes the layer-shell frame clock and the glitch never redraws (stays on
 // frame 0). The overlay is brief so blocking pointer input that long is fine.
 st.timer = interval(WS_FPS_MS, () => {
     const p = (Date.now() - st.start) / WS_DURATION
     st.prog = p
     if (p >= 1) { endWsAnim(st); return }
     st.area.queue_draw()
 })
}

export const triggerWsSwitch = (target) => {
 for (const st of wsStates) {
     st.seed = (Date.now() * 9301 + 49297 + st.x + st.y) % 233280
     recache(st)
     startWsAnim(st)
 }
}

let bnWin= null, bnArea = null, bnProg = 0, bnTimer = null
let bnTitle = "", bnSub = "", bnFlash = 0

export const BannerWindow = () => {
 bnArea = DrawingArea({})
 bnArea.set_size_request(SCREEN_WIDTH, SCREEN_HEIGHT)
 bnArea.connect("draw", (_w, ctx) => (drawBreach(ctx, SCREEN_WIDTH, SCREEN_HEIGHT, bnProg, bnTitle, bnSub, bnFlash), false))
 bnWin = Window({ name: "banner", className: "aug banner", anchor: Anchor.TOP | Anchor.BOTTOM | Anchor.LEFT | Anchor.RIGHT, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE, visible: false, child: bnArea })
 return bnWin
}
export const triggerBanner = (title, sub, flash = 0, payload = "") => {
 bnTitle = title; bnSub = sub; bnFlash = flash; genBreach()
 if (bnTimer) bnTimer.cancel()
 bnProg = 0; try { bnWin.gdkmonitor = geomMonitor(parseGeom(payload)) } catch {} bnWin.visible = true
 bnTimer = interval(16, () => { bnProg += 0.03; if (bnProg >= 1) { bnTimer.cancel(); bnTimer = null; bnWin.visible = false; return } bnArea.queue_draw() })
}
export const triggerShutter = (payload = "") => triggerBanner("SNAPSHOT", "CAPTURING", 1, payload)

const getUsername = () => { try { const [ok, bytes] = GLib.file_get_contents("/proc/sys/kernel/hostname"); return ok ? new TextDecoder().decode(bytes).trim() : "USER" } catch { return "USER" } }

const LEFT_W = 200, LEFT_H = 160
const RIGHT_W = 360, RIGHT_H = 100   // wide enough for CAMERA + POWER on one line
const BOT_W = 800, BOT_H = 60
// HUD perspective just like in the game, the two side panels mirror (left edge of the left panel)
// moderate mirrored HUD perspective (focal 1350 = enough skew to read, not over-warped)
/// reference for this can be seen at https://interfaceingame.com/wp-content/uploads/02-CamHUD_res-1920x1080.jpg

const leftPlane = makePlane({ w: LEFT_W, h: LEFT_H, yaw: 16, pitch: 1.5, roll: -2.5, focal: 1350, dist: 1350, pad: 34 })
const rightPlane = makePlane({ w: RIGHT_W, h: RIGHT_H, yaw: -16, pitch: 1.5, roll: 2.5, focal: 1350, dist: 1350, pad: 34 })
const botPlane = makePlane({ w: BOT_W, h: BOT_H, yaw: 0, pitch: 0, roll: 0, focal: 1300, dist: 1300, pad: 16 })
let recLeftWin= null, recLeftArea = null
let recRightWin= null, recRightArea = null
let recBotWin= null, recBotArea = null
let recTopWin= null, recTopArea = null
const REC_TOP_W = 780, REC_TOP_H = 48
let recOn = false, recStart = 0, recBlink = 0, recTimer = null, recHudShown = false
let recFade = 0, recFadeTimer = null
let recHudTick = 0, recNumStream: string[] = []
let recGeom: any = null
const pad2 = (n) => String(n).padStart(2, "0")
const genNumStream = () => Array.from({ length: 20 }, () => {
 const len = 4 + Math.floor(Math.random() * 5)
 return Array.from({ length: len }, () => "0123456789ABCDEF"[(Math.random() * 16) | 0]).join("")
})

const drawRecLeft = (ctx, tick) => {
 const [rr, rg, rb] = f(NEON.red)
 const a = recFade
 if (a < 0.01) return

 const elapsed = Math.floor((Date.now() - recStart) / 1000)
 const hh = Math.floor(elapsed / 3600), mm = Math.floor((elapsed % 3600) / 60), ss = elapsed % 60
 const timeStr = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
 const recBlinkA = 0.3 + 0.7 * Math.abs(Math.sin(recBlink))

 tiltText(ctx, leftPlane, 12, 28, "TIME", TITLE, 11, NEON.red, 0.85 * a, { bold: true, glow: 0.6 })
 fillQuad(ctx, leftPlane, 48, 16, 126, 35, [255, 36, 44], a)                    // saturated bright red box
 tiltText(ctx, leftPlane, 56, 30, timeStr, MONO, 12, [10, 0, 2], 1.0 * a, { bold: true })   // crisp DARK digits
 tiltText(ctx, leftPlane, 124, 45, "SCANNER", MONO, 6, NEON.red, 0.6 * a, { align: "r", bold: true })

 const dotA = (0.62 + 0.38 * Math.abs(Math.sin(recBlink))) * a   //sublte pulse
 const dc = leftPlane.project(18, 52.5), dr = 5 * leftPlane.scaleAt(18, 52.5)   // projected centre + scaled radius
 ctx.setOperator(12); ctx.setSourceRGBA(rr, rg, rb, 0.15 * dotA); ctx.newPath(); ctx.arc(dc[0], dc[1], dr * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.setOperator(2)   // subtle soft glow (rest comes from bloom)
 ctx.setSourceRGBA(rr, rg, rb, dotA); ctx.newPath(); ctx.arc(dc[0], dc[1], dr, 0, Math.PI * 2); ctx.fill()   // circle blip
 tiltText(ctx, leftPlane, 30, 57, "REC", TITLE, 12, NEON.red, 0.95 * a, { bold: true, glow: 0.6 })

 tiltText(ctx, leftPlane, 12, 88, "HD", TITLE, 12, NEON.red, 0.85 * a, { bold: true, glow: 0.55 })
 tiltText(ctx, leftPlane, 12, 108, "F 5.6", MONO, 11, NEON.red, 0.8 * a, { bold: true, glow: 0.5 })
 tiltText(ctx, leftPlane, 12, 128, "ISO 100", MONO, 11, NEON.red, 0.8 * a, { bold: true, glow: 0.5 })
}

const drawRecRight = (ctx) => {
 const [rr, rg, rb] = f(NEON.red)
 const a = recFade
 if (a < 0.01) return

 // CAMERA + POWER on ONE line.
 // ⚡ lightning bolt glyph (bigger), projected through the tilt plane
 const bolt = [[20, 9], [11, 24], [17, 24], [11, 37], [29, 18], [21, 18], [24, 9]]
 const boltPath = () => { ctx.newPath(); for (let i = 0; i < bolt.length; i++) { const q = rightPlane.project(bolt[i][0], bolt[i][1]); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]) } ctx.closePath() }
 ctx.setOperator(12); boltPath(); ctx.setSourceRGBA(rr, rg, rb, 0.4 * a); ctx.setLineWidth(5); ctx.setLineJoin(1); ctx.stroke(); ctx.setLineJoin(0); ctx.setOperator(2)   // bolt glow
 boltPath(); ctx.setSourceRGBA(rr, rg, rb, 0.97 * a); ctx.fill()
 const camName = getUsername()
 tiltText(ctx, rightPlane, 33, 30, `CAMERA 01: ${camName}`, TITLE, 14, NEON.red, 0.95 * a, { bold: true, glow: 0.7 })
 const pwr = "POWER CONNECTED"                                  // same line, far right
 fillQuad(ctx, rightPlane, RIGHT_W - 124, 16, RIGHT_W - 6, 33, [255, 36, 44], a)                        
 tiltText(ctx, rightPlane, RIGHT_W - 13, 29, pwr, MONO, 8, [10, 0, 2], 1.0 * a, { align: "r" })         
}

const drawRecBot = (ctx, tick) => {
 const [rr, rg, rb] = f(NEON.red)
 const a = recFade
 if (a < 0.01) return

 if (tick % 3 === 0) recNumStream = genNumStream()

 let nx = 20
 for (let i = 0; i < recNumStream.length && nx < BOT_W - 30; i++) {
 const val = recNumStream[i]
 const alpha = (0.15 + 0.12 * Math.sin(tick * 0.25 + i * 0.7)) * a
 tiltText(ctx, botPlane, nx, 28, val, MONO, 9, NEON.red, alpha)
 nx += ctx.measure ? 60 : 60
 }
}

// label, like the in-game "CYBERDECK RAM: 5/5" element (not dashes/end-brackets tho)
const drawRecTop = (ctx) => {
 const a = recFade; if (a < 0.01) return
 const [rr, rg, rb] = f(NEON.red)
 const W = REC_TOP_W, cy = 28, label = "CYBERDECK RECORDER"
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(12)
 const tw = ctx.textExtents(label).width, cx = W / 2
 const gap = 16, lineLen = 180
 const lx2 = cx - tw / 2 - gap, lx1 = lx2 - lineLen
 const rx1 = cx + tw / 2 + gap, rx2 = rx1 + lineLen
 // solid side lines
 ctx.setSourceRGBA(rr, rg, rb, 0.7 * a); ctx.setLineWidth(1.2)
 ctx.newPath(); ctx.moveTo(lx1, cy); ctx.lineTo(lx2, cy); ctx.stroke()
 ctx.newPath(); ctx.moveTo(rx1, cy); ctx.lineTo(rx2, cy); ctx.stroke()
 const tick = (x, hh, al) => { ctx.setSourceRGBA(rr, rg, rb, al * a); ctx.setLineWidth(1.5); ctx.newPath(); ctx.moveTo(x, cy - hh); ctx.lineTo(x, cy + hh); ctx.stroke() }
 tick(lx1, 7, 0.9); tick(rx2, 7, 0.9)                       // outer ends
 tick((lx1 + lx2) / 2, 4, 0.7); tick((rx1 + rx2) / 2, 4, 0.7)   // mid
 tick(lx2 - 6, 3, 0.6); tick(rx1 + 6, 3, 0.6)               // inner (near text)
 ctx.setOperator(12)
 ctx.setSourceRGBA(rr, rg, rb, 0.35 * a); ctx.moveTo(cx - tw / 2 - 1, cy + 5); ctx.showText(label)
 ctx.setSourceRGBA(rr, rg, rb, 0.35 * a); ctx.moveTo(cx - tw / 2 + 1, cy + 4); ctx.showText(label)
 ctx.setOperator(2)
 ctx.setSourceRGBA(rr, rg, rb, 0.95 * a); ctx.moveTo(cx - tw / 2, cy + 4); ctx.showText(label)
}

// ── soft red "glow-blur" bloom (the CP2077 HUD defocus look) ──
// renders the widget to an offscreen surface, then composites downscaled→upscaled blurred copies to create a soft halo around the edges of the widget
const recBloom = (screenCtx, w, h, renderFn) => {
 w = Math.ceil(w); h = Math.ceil(h)
 screenCtx.setOperator(0); screenCtx.paint(); screenCtx.setOperator(2)   // clear
 const surf = new WsCairo.ImageSurface(WsCairo.Format.ARGB32, w, h)
 renderFn(new WsCairo.Context(surf)); surf.flush()
 const blurAt = (scale, alpha) => {
     const bw = Math.max(1, Math.round(w / scale)), bh = Math.max(1, Math.round(h / scale))
     const sm = new WsCairo.ImageSurface(WsCairo.Format.ARGB32, bw, bh)
     const c = new WsCairo.Context(sm)
     c.scale(bw / w, bh / h); c.setSourceSurface(surf, 0, 0)
     try { c.getSource().setFilter(WsCairo.Filter.GOOD) } catch {}
     c.paint(); sm.flush()
     screenCtx.save(); screenCtx.setOperator(12)                          // ADD = bloom
     screenCtx.scale(w / bw, h / bh); screenCtx.setSourceSurface(sm, 0, 0)
     try { screenCtx.getSource().setFilter(WsCairo.Filter.GOOD) } catch {}
     screenCtx.paintWithAlpha(alpha); screenCtx.restore(); screenCtx.setOperator(2)
 }
 blurAt(9, 0.5)      // wide soft halo (motion-blur feel)
 blurAt(4, 0.6)      
 blurAt(2, 0.5)    
 screenCtx.setSourceSurface(surf, 0, 0); screenCtx.paint()       
}

export const RecWindow = () => {
 recLeftArea = DrawingArea({})
 recLeftArea.set_size_request(leftPlane.width, leftPlane.height)
 recLeftArea.connect("draw", (_w, ctx) => { recBloom(ctx, leftPlane.width, leftPlane.height, (c) => drawRecLeft(c, recHudTick)); return false })
 recLeftWin = Window({
 name: "rec_left", className: "aug rec_left",
 anchor: Anchor.TOP | Anchor.LEFT,
 layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
 visible: false, child: Box({ className: "rec-wrap", child: recLeftArea }),
 })
 passthrough(recLeftWin)

 recRightArea = DrawingArea({})
 recRightArea.set_size_request(rightPlane.width, rightPlane.height)
 recRightArea.connect("draw", (_w, ctx) => { recBloom(ctx, rightPlane.width, rightPlane.height, (c) => drawRecRight(c)); return false })
 recRightWin = Window({
 name: "rec_right", className: "aug rec_right",
 anchor: Anchor.TOP | Anchor.RIGHT,
 layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
 visible: false, child: Box({ className: "rec-wrap", child: recRightArea }),
 })
 passthrough(recRightWin)

 recBotArea = DrawingArea({})
 recBotArea.set_size_request(botPlane.width, botPlane.height)
 recBotArea.connect("draw", (_w, ctx) => { recBloom(ctx, botPlane.width, botPlane.height, (c) => drawRecBot(c, recHudTick)); return false })
 recBotWin = Window({
 name: "rec_bot", className: "aug rec_bot",
 anchor: Anchor.BOTTOM | Anchor.LEFT,
 layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
 visible: false, child: Box({ className: "rec-wrap", child: recBotArea }),
 })
 passthrough(recBotWin)

 recTopArea = DrawingArea({})
 recTopArea.set_size_request(REC_TOP_W, REC_TOP_H)
 recTopArea.connect("draw", (_w, ctx) => { recBloom(ctx, REC_TOP_W, REC_TOP_H, (c) => drawRecTop(c)); return false })
 recTopWin = Window({
 name: "rec_top", className: "aug rec_top",
 anchor: Anchor.TOP,                              // centred horizontally at the top
 layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
 visible: false, child: Box({ className: "rec-wrap", child: recTopArea }),
 })
 passthrough(recTopWin)

 return recLeftWin
}

let recTransArea= null, recTransWin = null
let recTransProg = 0, recTransDir: "on" | "off" | null = null, recTransTimer = null
let recBannerMsg = "RECORDING STARTED"
const REC_GLYPH = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ#%/<>"
let recIconPix: any = null
try { recIconPix = GdkPixbuf.Pixbuf.new_from_file(`${CYBER_DIR}/assets/icons/record.png`) } catch (e) { print("[rec-banner] record.png:", e) }

const drawRecIcon = (ctx, x, y, sz, a, pulse) => {
 if (a <= 0 || !recIconPix) return
 const [rr, rg, rb] = f(NEON.cyan)
 const iw = recIconPix.get_width(), ih = recIconPix.get_height()
 const scale = sz / Math.max(iw, ih)
 const dw = Math.round(iw * scale), dh = Math.round(ih * scale)
 const dx = x + Math.round((sz - dw) / 2), dy = y + Math.round((sz - dh) / 2)
 ctx.save()

// this is for the "glow" effect around the icon, using additive blending to create a soft halo
 ctx.setOperator(12) // ADD
 for (let g = 3; g >= 1; g--) {
     ctx.setSourceRGBA(rr, rg, rb, 0.035 * a * (0.7 + 0.3 * pulse) / g)
     ctx.rectangle(dx - g * 3, dy - g * 3, dw + g * 6, dh + g * 6); ctx.fill()
 }
 ctx.setOperator(2) // SOURCE — paint the transparent PNG directly, no background
 const scaled = recIconPix.scale_simple(dw, dh, GdkPixbuf.InterpType.BILINEAR)
 Gdk.cairo_set_source_pixbuf(ctx, scaled, dx, dy)
 ctx.paintWithAlpha(a)
 ctx.restore()
}
const recGlitchText = (ctx, x, y, full, prog, size, alpha) => {
 if (prog <= 0) return
 const [rr, rg, rb] = f(NEON.cyan)
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(size)
 const adv = ctx.textExtents("M").width, n = full.length, shown = prog * n
 for (let i = 0; i < n; i++) {
     let ch = full[i]; if (ch === " ") continue
     if (i >= shown) { if (i < shown + 1.6) ch = REC_GLYPH[(Math.random() * REC_GLYPH.length) | 0]; else continue }
     else if (Math.random() < 0.03) ch = REC_GLYPH[(Math.random() * REC_GLYPH.length) | 0]
     const head = i >= shown - 1 && i < shown + 1.6, cxp = x + i * adv, jx = head ? rnd(-1, 1) : 0
     ctx.setSourceRGBA(rr, rg, rb, alpha * 0.5); ctx.moveTo(cxp - 1.5 + jx, y); ctx.showText(ch)
     ctx.setSourceRGBA(head ? 1 : rr, head ? 1 : rg, head ? 1 : rb, alpha); ctx.moveTo(cxp + jx, y); ctx.showText(ch)
 }
}

// component for the "RECORDING STARTED" / "RECORDING STOPPED" banner that appears in the middle of the screen
const drawRecBanner = (ctx, W, H, p, msg) => {
 const load = p < 0.08 ? p / 0.08 : p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35)
 if (load <= 0.001) return
 const [rr, rg, rb] = f(NEON.cyan), pulse = 0.5 + 0.5 * Math.sin(p * 30)

 // --- frame geometry (matching player.ts `cut` / panelFrame style) 
 const ico = 42, bw = 360, c = 10  // c = chamfer size (same as player.ts cut way)
 const bh = msg.includes("STARTED") ? 80 : 56   // taller on START so the STOP-hint fits INSIDE
 const totW = ico + 12 + bw, bx = Math.round(W / 2 - totW / 2), by = Math.round(H * 0.72)
 const FX = bx + ico + 12, FY = by

 // frame path: cut() style — chamfer top-left + bottom-right, 90° on top-right + bottom-left, adjust if u think its off
 const framePath = (ctx2) => {
    // the corners accordingly
     ctx2.newPath()
     ctx2.moveTo(FX + c, FY)                       // top-left chamfer start
     ctx2.lineTo(FX + bw, FY)                        // top edge (top-right 90°)
     ctx2.lineTo(FX + bw, FY + bh - c)               // right edge → chamfer start
     ctx2.lineTo(FX + bw - c, FY + bh)               // bottom-right chamfer
     ctx2.lineTo(FX, FY + bh)                        // bottom edge (bottom-left 90°)
     ctx2.lineTo(FX, FY + c)                         // left edge → chamfer start
     ctx2.closePath()
 }

 // --- ANIMATION PHASES 
 const lineFrac = Math.min(1, p / 0.04)                // top/bottom line draw progress (fast)
 const closeFrac = Math.min(1, Math.max(0, (p - 0.04) / 0.04)) // vertical close (fast)
 const contentFrac = Math.min(1, Math.max(0, (p - 0.06) / 0.06)) // content fade in (fast)

 ctx.save()
 const lw = 1.8
 ctx.setSourceRGBA(rr, rg, rb, 0.95 * load)
 ctx.setLineWidth(lw); ctx.setLineCap(1)

 // --- top line: draws from left→right across full width ---
 const topLen = bw - c  // from chamfer tip to right corner
 const topDraw = topLen * lineFrac
 ctx.newPath(); ctx.moveTo(FX + c, FY); ctx.lineTo(FX + c + topDraw, FY); ctx.stroke()

 // --- bottom line: draws from right→left across full width ---
 const botLen = bw - c  // from left corner to chamfer tip
 const botDraw = botLen * lineFrac
 ctx.newPath(); ctx.moveTo(FX + bw - c, FY + bh); ctx.lineTo(FX + bw - c - botDraw, FY + bh); ctx.stroke()

 // --- verticals + chamfers close the frame ---
 if (closeFrac > 0) {
     // right vertical (top-right 90° down to bottom-right chamfer)
     const rvLen = (bh - c) * closeFrac
     ctx.newPath(); ctx.moveTo(FX + bw, FY); ctx.lineTo(FX + bw, FY + rvLen); ctx.stroke()

     // left vertical (bottom-left 90° up to top-left chamfer)
     const lvLen = (bh - c) * closeFrac
     ctx.newPath(); ctx.moveTo(FX, FY + bh); ctx.lineTo(FX, FY + bh - lvLen); ctx.stroke()

     // top-left chamfer diagonal
     if (closeFrac > 0.3) {
         const cf = Math.min(1, (closeFrac - 0.3) / 0.7)
         ctx.newPath()
         ctx.moveTo(FX, FY + c - c * cf); ctx.lineTo(FX + c * cf, FY)
         ctx.stroke()
     }

     // bottom-right chamfer diagonal
     if (closeFrac > 0.3) {
         const cf = Math.min(1, (closeFrac - 0.3) / 0.7)
         ctx.newPath()
         ctx.moveTo(FX + bw - c * cf, FY + bh); ctx.lineTo(FX + bw, FY + bh - c + c * cf)
         ctx.stroke()
     }
 }

 // --- additive glow on the frame ---
 ctx.setOperator(12) // ADD
 ctx.setSourceRGBA(rr, rg, rb, 0.06 * load)
 ctx.setLineWidth(lw * 5); ctx.setLineCap(1)
 framePath(ctx); ctx.stroke()
 ctx.setOperator(2)

 // --- fill once frame is closed enough ---
 if (closeFrac > 0.6) {
     const fillA = Math.min(1, (closeFrac - 0.6) / 0.4) * load
     ctx.setSourceRGBA(0.04, 0.01, 0.02, 0.80 * fillA)
     framePath(ctx); ctx.fill()

     // left accent bar
     ctx.setSourceRGBA(rr, rg, rb, 0.90 * fillA)
     ctx.rectangle(FX + 5, FY + 7, 2.5, bh - 14); ctx.fill()
 }

 // --->>> content: icon + text 
    if (contentFrac > 0) {
     const cA = contentFrac * load
     drawRecIcon(ctx, bx, by + (bh - ico) / 2, ico, cA, pulse)

     ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(9)
     ctx.setSourceRGBA(rr, rg, rb, 0.6 * cA)
     ctx.moveTo(FX + 14, FY + 20); ctx.showText("// SYS.CAPTURE")

     recGlitchText(ctx, FX + 14, FY + 44, msg, cA, 17, 0.95)

     // small hint INSIDE the START banner (below the main text): how to stop, using the themeMod + R again
     if (msg.includes("STARTED")) {
         ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(8)
         ctx.setSourceRGBA(rr, rg, rb, 0.55 * cA)
         ctx.moveTo(FX + 14, FY + bh - 14); ctx.showText("__/ USE [ KEY + R ] TO STOP RECORDING")
     }

     // flash on appear
     if (p > 0.20 && p < 0.32 && Math.floor((p - 0.20) * 80) % 2 === 0) {
         ctx.setSourceRGBA(1, 0.9, 0.92, 0.12 * cA)
         framePath(ctx); ctx.fill()
     }
 }

 ctx.restore()    }
const drawRecTransition = (ctx, W, H, p) => {
 const [rr, rg, rb] = f(NEON.red)
 const [cr, cg, cb] = f(NEON.cyan)
 const genv = p < 0.08 ? p / 0.08 : p < 0.32 ? 1 : Math.max(0, 1 - (p - 0.32) / 0.25)
 if (genv > 0.01) {
     ctx.setSourceRGBA(0.02, 0, 0.01, 0.12 * genv); ctx.rectangle(0, 0, W, H); ctx.fill()
     const s = Math.floor(p * 30)
     const nz = (k) => { const x = Math.sin(s * 1.3 + k) * 43758.5; return x - Math.floor(x) }
     for (let i = 0; i < 5; i++) {
         const by = nz(i * 2.1) * H, bh = 2 + nz(i * 0.7 + 9) * 15, sh = (nz(i * 3 + 4) - 0.5) * 60 * genv
         ctx.setSourceRGBA(rr, rg * 0.1, rb * 0.12, 0.10 * genv); ctx.rectangle(sh, by, W, bh); ctx.fill()
         ctx.setSourceRGBA(cr * 0.25, cg, cb, 0.05 * genv); ctx.rectangle(-sh, by + 2, W, Math.max(1, bh - 3)); ctx.fill()
     }
     const sweepY = p * 2.6 * H
     if (sweepY < H) { ctx.setSourceRGBA(rr, rg, rb, 0.16 * genv); ctx.setLineWidth(1); ctx.newPath(); ctx.moveTo(0, sweepY); ctx.lineTo(W, sweepY); ctx.stroke() }
     for (let i = 0; i < 10; i++) {
         const nx = nz(i * 5.1 + 1) * W, ny = nz(i * 2.3 + 7) * H
         if (i % 3 === 0) ctx.setSourceRGBA(cr, cg, cb, 0.22 * genv); else ctx.setSourceRGBA(rr, rg * 0.2, rb * 0.2, 0.22 * genv)
         ctx.rectangle(nx, ny, 2, 2); ctx.fill()
     }
 }
 drawRecBanner(ctx, W, H, p, recBannerMsg)}

export const RecGlitchWindow = () => {
 recTransArea = DrawingArea({})
 recTransArea.set_size_request(SCREEN_WIDTH, SCREEN_HEIGHT)
 recTransArea.connect("draw", (_w, ctx) => {
 if (!recTransDir) return false
 drawRecTransition(ctx, SCREEN_WIDTH, SCREEN_HEIGHT, recTransProg)
 return false
 })
 recTransWin = Window({
 name: "rec_glitch", className: "aug rec_glitch",
 anchor: Anchor.TOP | Anchor.BOTTOM | Anchor.LEFT | Anchor.RIGHT,
 layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
 visible: false, child: recTransArea,
 })
 passthrough(recTransWin)
 return recTransWin
}

const parseGeom = (payload = "") => {
 const p = payload.trim().split(/\s+/).map(Number)
 if (p.length >= 4 && p.every(Number.isFinite)) return { x: p[0], y: p[1], w: p[2], h: p[3] }
 try {
     const m = activeMonitor()
     const g = m?.get_geometry?.()
     if (g) return { x: g.x, y: g.y, w: g.width, h: g.height }
 } catch {}
 return null
}
const geomMonitor = (g) => g ? monitorAtPoint(g.x + 1, g.y + 1) || activeMonitor() : activeMonitor()
const sameMonitor = (win, g) => {
 if (!g) return true
 try {
     const wg = (win as any).gdkmonitor?.get_geometry?.()
     return wg && wg.x === g.x && wg.y === g.y
 } catch {}
 return true
}
const setRecMonitor = (g) => {
 recGeom = g
 const m = geomMonitor(g)
 try { recLeftWin.gdkmonitor = m; recRightWin.gdkmonitor = m; recBotWin.gdkmonitor = m; recTopWin.gdkmonitor = m; recTransWin.gdkmonitor = m } catch {}
}

const showRecHud = (g = null) => {
 recOn = true; recHudTick = 0; recFade = 0
 recNumStream = genNumStream()
 setRecMonitor(g)
 recLeftWin.visible = true; recRightWin.visible = true; recBotWin.visible = true; recTopWin.visible = true
 if (recFadeTimer) recFadeTimer.cancel()
 recFadeTimer = interval(16, () => {
 recFade = Math.min(1, recFade + 0.035)
 recLeftArea.queue_draw(); recRightArea.queue_draw(); recBotArea.queue_draw(); recTopArea.queue_draw()
 if (recFade >= 1) { recFadeTimer.cancel(); recFadeTimer = null }
 })
 if (recTimer) recTimer.cancel()
 recTimer = interval(120, () => { recBlink += 0.25; recHudTick++; recLeftArea.queue_draw(); recRightArea.queue_draw(); recBotArea.queue_draw(); recTopArea.queue_draw() })
}

const hideRecHud = () => {
 if (recTimer) { recTimer.cancel(); recTimer = null }
 if (recFadeTimer) recFadeTimer.cancel()
 recFadeTimer = interval(16, () => {
 recFade = Math.max(0, recFade - 0.05)
 recLeftArea.queue_draw(); recRightArea.queue_draw(); recBotArea.queue_draw(); recTopArea.queue_draw()
 if (recFade <= 0) {
 recFadeTimer.cancel(); recFadeTimer = null
 recLeftWin.visible = false; recRightWin.visible = false; recBotWin.visible = false; recTopWin.visible = false
 }
 })
}

// other desktop HUD windows (registered from core.ts)
let _hudWins: any[] = []
export const registerHudWindows = (wins) => { _hudWins = wins || [] }
const setHudHidden = (hidden, g = recGeom) => { for (const w of _hudWins) { try { if (sameMonitor(w, g)) w.visible = !hidden } catch {} } }
const showAllHud = () => { for (const w of _hudWins) { try { w.visible = true } catch {} } }
export const isRecording = () => recOn
// toggle the desktop HUD on/off on the recorded monitor while recording.
export const toggleHudDuringRec = () => { recHudShown = !recHudShown; setHudHidden(!recHudShown); return recHudShown }

// play the START/STOP banner transition (~1.5s), then run `done`
const playRecTrans = (dir, msg, done?, g = recGeom) => {
 recTransDir = dir; recBannerMsg = msg; recTransProg = 0; try { recTransWin.gdkmonitor = geomMonitor(g) } catch {} recTransWin.visible = true
 if (recTransTimer) recTransTimer.cancel()
 recTransTimer = interval(16, () => {
     recTransProg += 0.014   // ~1.1s total (was 0.006 ≈ 2.7s): quick snap-in, short hold, fast fade — like the region selector
     if (recTransProg >= 1) {
         recTransTimer.cancel(); recTransTimer = null
         recTransWin.visible = false; recTransDir = null
         if (done) done()
         return
     }
     recTransArea.queue_draw()
 })
}

export const setRecording = (on, payload = "") => {
 const g = on ? (parseGeom(payload) || recGeom) : (recGeom || parseGeom(payload))
 if (on) {
     recStart = Date.now()
     recOn = true; recHudShown = false
     recGeom = g
     showAllHud()
     setHudHidden(true, g)                           // default: hide normal HUD only on the recorded monitor
     showRecHud(g)                                   // start rec hud on the recorded monitor
     playRecTrans("on", "RECORDING STARTED", null, g)
 } else {
     recOn = false
     hideRecHud()                                    // rec widgets fade out
     timeout(180, () => playRecTrans("off", "RECORDING STOPPED!", () => showAllHud(), g))
 }
}
