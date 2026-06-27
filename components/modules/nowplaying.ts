import { Window, Box, DrawingArea, App } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval } from "astal"
import AstalMpris from "gi://AstalMpris"
import { NEON, f } from "./colors.ts"
import { makePlane, tiltText, strokePath, fillQuad } from "./proj.ts"

const TITLE = "Chakra Petch"
const IW = 300, IH = 54
const plane = makePlane({ w: IW, h: IH, yaw: 8, pitch: 2, roll: -1, focal: 3600, dist: 3600, pad: 12 })
const BW = plane.width, BH = plane.height
const TOTAL_MS = 7500, SCAN_MS = 2000, INTRO_MS = 620, OUTRO_MS = 500

let areas: any[] = [], wins: any[] = []
const redrawAll = () => areas.forEach(a => { try { a.queue_draw() } catch {} })
const setShown = (v) => wins.forEach(w => { try { w.visible = v } catch {} })

let curTitle = "", curArtist = "", curSrc = ""
let el = 0, animTimer: any = null, visible = false
let eqBars = [0.4, 0.7, 0.45, 0.8], eqT = 0

const trunc = (s, n) => (s && s.length > n) ? s.slice(0, n - 1) + "…" : (s || "")

const drawBanner = (ctx) => {
 if (!visible) return
 const e = el
 const [rr, rg, rb] = f(NEON.red)

 let reveal = 1, contentA = 1, barW = 1, barA = 0, barOnly = false
 if (e < INTRO_MS) {
     const ip = e / INTRO_MS
     reveal = 0; contentA = 0; barA = 1; barOnly = ip < 0.6
     if (ip < 0.28) barW = Math.max(0.02, ip / 0.28)
     else if (ip < 0.6) { barW = 1; const bp = (ip - 0.28) / 0.32; barA = (Math.floor(bp * 4) % 2 === 0) ? 1 : 0.12 }
     else { reveal = (ip - 0.6) / 0.4; contentA = Math.max(0, (ip - 0.8) / 0.2) }
 } else if (e > TOTAL_MS - OUTRO_MS) {
     const op = (e - (TOTAL_MS - OUTRO_MS)) / OUTRO_MS
     if (op < 0.45) { reveal = 1 - op / 0.45; contentA = Math.max(0, 1 - op / 0.28) }
     else { reveal = 0; contentA = 0; barOnly = true
         if (op < 0.74) { barW = 1; const bp = (op - 0.45) / 0.29; barA = (Math.floor(bp * 4) % 2 === 0) ? 1 : 0.12 }
         else { barA = 1; barW = Math.max(0, 1 - (op - 0.74) / 0.26) }
     }
 }

 if (barOnly) {
     const yb = IH / 2, half = 1.7
     fillQuad(ctx, plane, 0, yb - half, barW * IW, yb + half, NEON.red, 0.85 * barA)
     strokePath(ctx, plane, [[0, yb], [barW * IW, yb]], NEON.red, barA, 1.4)
     return
 }

 const v0 = IH / 2 * (1 - reveal), v1 = IH / 2 * (1 + reveal)

 fillQuad(ctx, plane, 0, v0, IW, v1, [120, 150, 185], 0.12)
 if (reveal > 0.6) {
     for (let gu = IW / 6; gu < IW; gu += IW / 6) strokePath(ctx, plane, [[gu, v0], [gu, v1]], NEON.grid, 0.08 * contentA, 1)
     for (let gv = IH / 3; gv < IH; gv += IH / 3) if (gv > v0 && gv < v1) strokePath(ctx, plane, [[0, gv], [IW, gv]], NEON.grid, 0.08 * contentA, 1)
 }

 const se = e - INTRO_MS
 if (reveal >= 1 && se >= 0 && se < SCAN_MS) {
     const cyc = (se / SCAN_MS) * 2, fr = cyc % 1, pos = fr < 0.5 ? fr * 2 : 2 - fr * 2
     const segW = IW * 0.46
     const a = Math.max(0, pos * IW - segW / 2), b = Math.min(IW, pos * IW + segW / 2)
     strokePath(ctx, plane, [[a, 0], [b, 0]], NEON.red, 0.2, 4)
     strokePath(ctx, plane, [[a, 0], [b, 0]], NEON.red, 1, 1.4)
 }

 const cs = 1.8
 ctx.setSourceRGBA(rr, rg, rb, 0.95)
 for (const [u, v] of [[0, v0], [IW, v0], [IW, v1], [0, v1]]) {
     const [x, y] = plane.project(u, v)
     ctx.rectangle(x - cs, y - cs, cs * 2, cs * 2); ctx.fill()
 }

 if (contentA > 0.01) {
     const ebN = eqBars.length, ebW = 3.4, ebGap = 2.6, ebMaxH = 12, ebBase = 21
     const ebX0 = IW - 14 - ebN * (ebW + ebGap)
     for (let i = 0; i < ebN; i++) {
         const bx = ebX0 + i * (ebW + ebGap), bh = (0.16 + eqBars[i] * 0.84) * ebMaxH
         fillQuad(ctx, plane, bx, ebBase - bh, bx + ebW, ebBase, NEON.cyan, 0.85 * contentA)
     }
     const top = trunc(curArtist || curSrc, 26)
     tiltText(ctx, plane, 16, 24, top, TITLE, 13, NEON.cyan, contentA, { bold: true, glow: 0.32 })
     if (curTitle) tiltText(ctx, plane, 16, 42, trunc(curTitle, 32), TITLE, 11, NEON.cyan, contentA * 0.9, { glow: 0.2 })
 }
}

const show = (t, a, src) => {
 curTitle = t; curArtist = a; curSrc = src
 el = 0; eqT = 0; visible = true; setShown(true)
 if (animTimer) animTimer.cancel()
 const start = Date.now()
 animTimer = interval(33, () => {
     el = Date.now() - start
     if (el >= TOTAL_MS) { visible = false; el = 0; animTimer.cancel(); animTimer = null; setShown(false); return }
     if (el - eqT > 95) { eqT = el; for (let i = 0; i < eqBars.length; i++) eqBars[i] = 0.18 + Math.random() * 0.82 }
     redrawAll()
 })
 redrawAll()
}

let mpris: any = null
const seen = new Map()
const srcLabel = (pl) => { const s = (pl?.identity || pl?.busName || "").toString().split(".").pop() || ""; return s.toUpperCase().slice(0, 12) }
const watch = (pl) => {
 const id = (pl?.busName || pl?.identity || Math.random()).toString()
 if (!seen.has(id)) seen.set(id, { was: false, last: "" })
 const check = () => {
     try {
         const playing = pl.playbackStatus === AstalMpris.PlaybackStatus.PLAYING
         const t = (pl.title || "").toString(), a = (pl.artist || "").toString()
         const st = seen.get(id)
         if (t && playing && (!st.was || t !== st.last)) show(t, a, srcLabel(pl))
         st.was = playing; st.last = t
     } catch {}
 }
 try { pl.connect("notify::playback-status", check); pl.connect("notify::title", check) } catch {}
 check()
}
const initMpris = () => {
 if (mpris) return
 try {
     mpris = AstalMpris.Mpris.get_default()
     const ps = mpris.get_players?.() ?? mpris.players ?? []
     for (const pl of ps) watch(pl)
     mpris.connect("player-added", (_m, pl) => watch(pl))
 } catch (e) { print("[cyber] nowplaying mpris:", e) }
}

export const NowPlayingWindow = () => {
 const mons = (() => { try { return Array.from((App as any).get_monitors()) } catch { return [] } })()
 const list = mons.length ? mons : [null]
 list.forEach((mon: any) => {
     const area = DrawingArea({})
     area.set_size_request(BW, BH)
     area.connect("draw", (_w, ctx) => (drawBanner(ctx), false))
     areas.push(area)
     const win = Window({
         name: "nowplaying", className: "aug nowplaying", gdkmonitor: mon, visible: false,
         anchor: Anchor.TOP | Anchor.RIGHT, layer: Layer.OVERLAY, exclusivity: Exclusivity.IGNORE,
         child: Box({ className: "aug-wrap nowplaying-wrap", children: [area] }),
     })
     wins.push(win)
 })
 initMpris()
 return areas[0]
}
