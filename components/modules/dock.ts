// the dock toggle tiles -- the little angular slots styled like the cyberware slots from
// the CP2077 inventory screen. there are two groups, each its own widget:
//   - VertDock: the vertical column on the LEFT (VOL / BRT / MIC / MUSIC). each tile has a
//     stepped notch top-left, a square top-right, and chamfered bottom corners.
//   - HorizDock: the row along the BOTTOM (REC / WIFI / BT / PWR). every corner is beveled
//     but at a different size, which is what gives the row its lopsided cyberpunk look.
// clicking a tile toggles its modal (from cmodal.ts) or fires its action; the little keycap
// box drawn next to each tile is just a reminder of the keyboard shortcut for it.
import { Box, DrawingArea, EventBox } from "../../widget.ts"
import Gdk from "gi://Gdk?version=3.0"
import { interval, timeout, execAsync } from "astal"
import AstalNotifd from "gi://AstalNotifd"
import { toggleModal, isModalOpen } from "./cmodal.ts"
import { toggleNotifHud, isNotifHudOpen, notifCount } from "./notifmessages.ts"
import { togglePlayer, isPlayerOpen, playPauseActive } from "./player.ts"
import { makePlane, strokePath, tiltText, tiltImage, fillQuad } from "./proj.ts"
import { NEON, f, RGB } from "./colors.ts"
// purer red just for the notif-icon wash (NEON.red leans pink because its blue > green)
const NOTIF_RED: RGB = [240, 24, 20]
import { CYBER_DIR } from "../../env.ts"

const Cairo: any = (imports as any).cairo
let _phoneIcon: any = null
const phoneIcon = () => { if (!_phoneIcon) try { _phoneIcon = Cairo.ImageSurface.createFromPNG(`${CYBER_DIR}/assets/icons/phone.png`) } catch { _phoneIcon = null } return _phoneIcon }

const sh = (c) => execAsync(["sh", "-c", c]).catch(() => "")
const shBool = (c) => sh(c).then(o => /\b(on|yes|true|1|enabled|RUNNING)\b/i.test(o.trim()))
import { TITLE, ICONF } from "./fonts.ts"

// ── what each tile is: its icon, the shortcut letter on its keycap (sc), and a state()  ──
// ── that returns a promise<bool> for whether it's "active" (lit up). the music tile gets ──
// ── eq:true so it draws the animated equalizer instead of a static icon.                 ──
const VERT_TILES = [
 { key: "vol", icon: "", label: "", sc: "V", state: () => sh("wpctl get-volume @DEFAULT_AUDIO_SINK@").then(o => !/MUTED/.test(o)) },
 { key: "brt", icon: "", label: "", sc: "I", state: () => Promise.resolve(true) },
 { key: "notification", icon: "", label: "", sc: "M", state: () => Promise.resolve(isNotifHudOpen()) },
 { key: "music", icon: "", label: "", sc: "O", eq: true, state: () => sh("playerctl -a status 2>/dev/null").then(o => /playing/i.test(o)) },
]
const HORIZ_TILES = [
 { key: "rec", icon: "", label: "", sc: "R", state: () => shBool("[ -f /tmp/hypr-record.pid ] && echo 1 || echo 0") },
 { key: "wifi", icon: "", label: "", sc: "N", state: () => shBool("nmcli radio wifi") },
 { key: "bt", icon: "", label: "", sc: "B", state: () => shBool("bluetoothctl show | grep Powered") },
 { key: "pwr", icon: "", label: "", sc: "P" },
]

// ── sizes. VSW/VSH = vertical tile width/height, VG = gap between them; same H* for horiz ──
const VSW = 44, VSH = 42, VG = 6
const HSW = 50, HSH = 48, HG = 8
const BADGE = 19, BGAP = 5      // the keycap box: its size + the gap between it and the tile (it's drawn outside the tile just like the game keycaps for radio, call car etc)

const VPLANE_W = BADGE + BGAP + VSW           // wide enough for the keycap column + the tile
const VPLANE_H = 4 * VSH + 3 * VG - 15
// these are the tilt knobs for the vertical dock -- if you want it leaning more/less, change
// here. yaw = swing left/right (more negative = more clockwise), pitch = tip forward/back,
// roll = lean sideways, focal/dist = how strong the perspective is (lower = more dramatic).
const vsp = makePlane({ w: VPLANE_W, h: VPLANE_H, yaw: -30, pitch: 12, roll: 1, focal: 1050, dist: 1050, pad: 20 })

const HPLANE_W = 4 * HSW + 3 * HG
const HPLANE_H = HSH + BGAP + BADGE -15         // tall enough for the tile row + the keycaps below it
// same tilt knobs, but for the horizontal dock (it leans differently, more pitch + roll)
const hsp = makePlane({ w: HPLANE_W, h: HPLANE_H, yaw: -15, pitch: 20, roll: 3.2, focal: 1050, dist: 1050, pad: 20 })

const VLAYOUT: { k: string; x: number; y: number; w: number; h: number }[] = [
 { k: "vol", x: BADGE + BGAP, y: 0, w: VSW, h: VSH },
 { k: "brt", x: BADGE + BGAP, y: VSH + VG, w: VSW, h: VSH },
 { k: "notification", x: BADGE + BGAP, y: 2 * (VSH + VG), w: VSW, h: VSH },
 { k: "music", x: BADGE + BGAP, y: 3 * (VSH + VG), w: VSW, h: VSH },
]

const HLAYOUT: { k: string; x: number; y: number; w: number; h: number }[] = [
 { k: "rec", x: 0, y: 0, w: HSW, h: HSH },
 { k: "wifi", x: HSW + HG, y: 0, w: HSW, h: HSH },
 { k: "bt", x: 2 * (HSW + HG), y: 0, w: HSW, h: HSH },
 { k: "pwr", x: 3 * (HSW + HG), y: 0, w: HSW, h: HSH },
]

// VLAYOUT/HLAYOUT hold WHERE each tile sits; VERT_TILES/HORIZ_TILES hold WHAT it is. this
// looks up the "what" by key. (kept separate so positions and definitions don't tangle.)
const tileOf = (k: string) => [...VERT_TILES, ...HORIZ_TILES].find(t => t.key === k)!

// the music tile's little equalizer: 5 bars whose heights get randomized each frame while
// something's playing, then eased back down to flat when playback stops.
const eqBars = [0.3, 0.5, 0.4, 0.6, 0.45]
let musicPlaying = false
const drawEq = (ctx, plane, s, edge, alpha) => {
 const n = eqBars.length, cw = s.w * 0.46, x0 = s.x + s.w / 2 - cw / 2
 const baseY = s.y + s.h * 0.66, maxH = s.h * 0.40, slot = cw / n, bw = slot * 0.6
 for (let i = 0; i < n; i++) {
     const bh = (0.16 + eqBars[i] * 0.84) * maxH
     fillQuad(ctx, plane, x0 + i * slot, baseY - bh, x0 + i * slot + bw, baseY, edge, alpha)
 }
}
// draws the little shortcut keycap next to a tile. it goes through the same projection plane bascally
// as the tiles so it leans identically. 
const drawBadgeBox = (ctx, plane, bx, by, bsz, sc, edge) => {
 if (!sc) return
 const p00 = plane.project(bx, by), p10 = plane.project(bx + bsz, by)
 const p11 = plane.project(bx + bsz, by + bsz), p01 = plane.project(bx, by + bsz)
 const [r, g, b] = f(edge)
 const quad = () => { ctx.newPath(); ctx.moveTo(p00[0], p00[1]); ctx.lineTo(p10[0], p10[1]); ctx.lineTo(p11[0], p11[1]); ctx.lineTo(p01[0], p01[1]); ctx.closePath() }
 quad(); ctx.setSourceRGBA(0.008, 0.043, 0.06, 0.92); ctx.fill()
 quad(); ctx.setSourceRGBA(r, g, b, 0.85); ctx.setLineWidth(1.2); ctx.stroke()
 const ccx = (p00[0] + p10[0] + p11[0] + p01[0]) / 4, ccy = (p00[1] + p10[1] + p11[1] + p01[1]) / 4
 const ang = Math.atan2(p10[1] - p00[1], p10[0] - p00[0])
 const psc = Math.hypot(p10[0] - p00[0], p10[1] - p00[1]) / bsz
 ctx.save(); ctx.translate(ccx, ccy); ctx.rotate(ang*0.38); ctx.scale(psc, psc)
 ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(bsz * 0.58)
 const tw = ctx.textExtents(sc).width                          // gjs's cairo only gives a reliable .width, so i centre off that
 ctx.setSourceRGBA(r, g, b, 0.97); ctx.moveTo(-tw / 2, bsz * 0.2); ctx.showText(sc)   // centred horizontally, baseline nudged just below centre
 ctx.restore()
}

const vertSlotFrame = (x: number, y: number, w: number, h: number): [number, number][] => {
 const step = Math.max(5, h * 0.05) 
 const jog = Math.max(5, w * 0.35)  
 const cutTR = Math.max(3, Math.min(w, h) * 0)    
 const cutBR = Math.max(4, Math.min(w, h) * 0.14) 
 const cutBL = Math.max(2, Math.min(w, h) * 0.08)  
 return [
 [x + 1 + jog + 4, y + 1],        
 [x + 1 + jog, y + 1 + step * 0.5], 
 [x + 1, y - 1 + step],             
 [x + 1, y + h - 1 - cutBL],        
 [x + 1 + cutBL, y + h - 1],         
 [x + w - 1 - cutBR, y + h - 1],     
 [x + w - 1, y + h - 1 - cutBR],   
 [x + w - 1, y + 1 + cutTR],       
 [x + w - 1 - cutTR, y + 1],        
 [x + 1 + jog + 4, y + 1],    
 ]
}

const horizSlotFrame = (x: number, y: number, w: number, h: number): [number, number][] => {
    const nx = Math.max(6, w * 0.32)
    const nw = Math.max(14, w * 0.40)
    const nd = Math.max(1, h * 0.02)
    const dw = nw * 0.10
    const chamferH = Math.max(2, h * 0.05)
    const chamferW = Math.max(3, h * 0.08)
    const vertAfter = Math.max(6, h * 0.20)
    const cutBL = Math.max(2, Math.min(w, h) * 0.10)
    return [
        [x + 1, y + 1],
        [x + 1 + nx, y + 1],
        [x + 1 + nx + dw, y + 1 + nd],
        [x + 1 + nx + nw - dw, y + 1 + nd],
        [x + 1 + nx + nw, y + 1],
        [x + w - 1, y + 1],
        [x + w - 1, y + h - 1 - chamferH - vertAfter],
        [x + w - 1 - chamferW, y + h - 1 - vertAfter],
        [x + w - 1 - chamferW, y + h - 1],
        [x + 1 + cutBL, y + h - 1],
        [x + 1, y + h - 1 - cutBL],
        [x + 1, y + 1],
    ]}
const pip = (px: number, py: number, poly: [number, number][]) => {
 let inside = false
 for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
 const [xi, yi] = poly[i], [xj, yj] = poly[j]
 if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
 }
 return inside
}
let _dockArea: any = null
const _notifd = AstalNotifd.get_default()
try { _notifd.connect("notified", () => { if (_dockArea) _dockArea.queue_draw() }) } catch {}
export const dockNotifDecr = () => { if (_dockArea) _dockArea.queue_draw() }
const VertDock = () => {
 const on = {}, open = {}, hv = {}
 let hovered: string | null = null
  const area = DrawingArea({}); area.set_size_request(vsp.width + 10, vsp.height + 20); _dockArea = area
 area.connect("draw", (_w, ctx) => {
 for (const s of VLAYOUT) {
    // edge colour goes red when tile is in active state
 const t = tileOf(s.k), edge = open[s.k] ? NEON.red : NEON.cyan, hov = hv[s.k] || 0
 const fr = vertSlotFrame(s.x, s.y, s.w, s.h)
 const [br, bg, bb] = f([4, 9, 13])
 ctx.newPath(); fr.map(([u, v]) => vsp.project(u, v)).forEach(([x, y]: [number, number], j: number) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
 ctx.setSourceRGBA(br + hov * 0.05, bg + hov * 0.09, bb + hov * 0.11, 0.55 + hov * 0.2); ctx.fill()  // dark fill that brightens slightly on hover
 if (hov > 0.02) { ctx.setOperator(12); strokePath(ctx, vsp, fr, edge, hov * 0.5, 3.4, true); ctx.setOperator(2) }  // extra additive glow while hovering
 strokePath(ctx, vsp, fr, edge, Math.min(1, (open[s.k] ? 0.9 : 0.6) + hov * 0.4), 1.4, true)
 // icon placement: s.x + s.w/2 = horizontally centred; the 0.60 is the vertical spot (0.5 = dead centre, higher = lower)
  const isz = s.h * 0.35  // icon size as a fraction of tile height 
  const ialpha = Math.min(1, (on[s.k] ? 1 : 0.78) + hov * 0.22)
  if (t.eq) drawEq(ctx, vsp, s, edge, ialpha)
  else if (t.key === "notification") {
    tiltImage(ctx, vsp, 45, 98, phoneIcon(), s.h * 0.47, ialpha, (on[s.k] ? 0.4 : 0) + hov * 0.5, 0.08, open[s.k] ? NOTIF_RED : null, 0.95)
    const nc = notifCount()
    if (nc > 0) {
      const bx = 58, by = 90, bw = 13, bh = 18, bv = 3
      const oc: [number, number][] = [[bx + bv, by], [bx + bw - bv, by], [bx + bw, by + bv], [bx + bw, by + bh - bv], [bx + bw - bv, by + bh], [bx + bv, by + bh], [bx, by + bh - bv], [bx, by + bv]]
      const op = oc.map(([u, v]) => vsp.project(u, v))
      ctx.newPath(); op.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
      ctx.setSourceRGBA(108/255, 230/255, 246/255, 0.92); ctx.fill()
      const ccx = op.reduce((s, p) => s + p[0], 0) / 8, ccy = op.reduce((s, p) => s + p[1], 0) / 8
      const ang = Math.atan2(op[1][1] - op[0][1], op[1][0] - op[0][0])
      const psc = Math.hypot(op[2][0] - op[1][0], op[2][1] - op[1][1]) / bv
      ctx.save(); ctx.translate(ccx, ccy); ctx.rotate(ang * 0.38); ctx.scale(psc, psc)
      ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(bh * 0.45)
      const tw = ctx.textExtents(String(nc)).width
      ctx.setSourceRGBA(0, 0, 0, 1); ctx.moveTo(-tw / 2, bh * 0.2); ctx.showText(String(nc))
      ctx.restore()
    }
  }
  else tiltText(ctx, vsp, s.x + s.w / 2, s.y + s.h * 0.60, t.icon, ICONF, isz, edge, ialpha, { align: "c", extraRotate: 0.10, glow: (on[s.k] ? 0.4 : 0) + hov * 0.5 })
 drawBadgeBox(ctx, vsp, 0, s.y + (s.h - BADGE) / 2, BADGE, t.sc, edge)
 }
 return false
 })
 const hitSlot = (x: number, y: number): string | null => {
 for (const s of VLAYOUT) if (pip(x, y, vertSlotFrame(s.x, s.y, s.w, s.h).map(([u, v]) => vsp.project(u, v)) as [number, number][])) return s.k
 return null
 }
 let openRefresh = () => {}
 const evt = EventBox({ child: area })
 let musicTap: any = null
 try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK) } catch {}
 evt.connect("button-press-event", (_w, e) => { let x = 0, y = 0; try { const c = e.get_coords?.(); if (c) { x = c[1]; y = c[2] } } catch {} const k = hitSlot(x, y); if (!k) return false; if (k === "music") { let dbl = false; try { dbl = e.get_event_type() === Gdk.EventType.DOUBLE_BUTTON_PRESS } catch {} if (dbl) { if (musicTap) { musicTap.cancel(); musicTap = null } togglePlayer(); openRefresh() } else { if (musicTap) musicTap.cancel();             musicTap = timeout(230, () => { musicTap = null; playPauseActive() }) } } else if (k === "notification") { toggleNotifHud(); openRefresh() } else { toggleModal(k); openRefresh() } return false })
 evt.connect("motion-notify-event", (_w, e) => { let x = 0, y = 0; try { const c = e.get_coords?.(); if (c) { x = c[1]; y = c[2] } } catch {} hovered = hitSlot(x, y); return false })
 evt.connect("leave-notify-event", () => { hovered = null; return false })
 // openRefresh: check if tile panel is open and update the edge colour accordingly
 openRefresh = () => { let ch = false; for (const s of VLAYOUT) { const o = s.k === "music" ? isPlayerOpen() : s.k === "notification" ? isNotifHudOpen() : isModalOpen(s.k); if (o !== open[s.k]) { open[s.k] = o; ch = true } } if (ch) area.queue_draw() }
 // stateRefresh: check if tile is active (lit up)
 const stateRefresh = () => { VLAYOUT.forEach(s => { const t = tileOf(s.k); (t.state ? t.state() : Promise.resolve(true)).then(v => { if (v !== on[s.k]) { on[s.k] = v; area.queue_draw() } }).catch(() => {}) }) }
 stateRefresh()
 const hoverTick = interval(40, () => {
 let busy = false
 for (const s of VLAYOUT) { const tgt = hovered === s.k ? 1 : 0; const cur = hv[s.k] || 0; if (Math.abs(tgt - cur) > 0.015) { hv[s.k] = cur + (tgt - cur) * 0.3; busy = true } else if (cur !== tgt) hv[s.k] = tgt }
 if (busy) area.queue_draw()
 })
 // music tile is special: poll playerctl for whether something's playing, and let musicTick, also checks teh audio sources being played
 // (below) jiggle the equalizer bars while it is like the game tile, when radio is playin'
 const musicPoll = () => sh("playerctl -a status 2>/dev/null").then(o => { const p = /playing/i.test(o); musicPlaying = p; if (p !== on["music"]) { on["music"] = p; area.queue_draw() } }).catch(() => {})
 musicPoll()
 const musicTick = interval(110, () => {
 if (musicPlaying) { for (let i = 0; i < eqBars.length; i++) eqBars[i] = 0.12 + Math.random() * 0.88; area.queue_draw() }
 })
 const a = interval(6000, stateRefresh), b = interval(450, openRefresh), mp = interval(1500, musicPoll)
 area.connect("destroy", () => { a.cancel(); b.cancel(); hoverTick.cancel(); mp.cancel(); musicTick.cancel() })
 return evt
}

const HorizDock = () => {
 const on = {}, open = {}, hv = {}
 let hovered: string | null = null
 const area = DrawingArea({}); area.set_size_request(hsp.width, hsp.height)
 area.connect("draw", (_w, ctx) => {
 for (const s of HLAYOUT) {
 const t = tileOf(s.k), edge = open[s.k] ? NEON.red : NEON.cyan, hov = hv[s.k] || 0
 const fr = horizSlotFrame(s.x, s.y, s.w, s.h)
 const [br, bg, bb] = f([4, 9, 13])
 ctx.newPath(); fr.map(([u, v]) => hsp.project(u, v)).forEach(([x, y]: [number, number], j: number) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
 ctx.setSourceRGBA(br + hov * 0.05, bg + hov * 0.09, bb + hov * 0.11, 0.55 + hov * 0.2); ctx.fill()
 if (hov > 0.02) { ctx.setOperator(12); strokePath(ctx, hsp, fr, edge, hov * 0.5, 3.4, true); ctx.setOperator(2) }
 strokePath(ctx, hsp, fr, edge, Math.min(1, (open[s.k] ? 0.9 : 0.6) + hov * 0.4), 1.4, true)
 // same icon-placement knobs as the vertical dock: centred horizontally, 0.60 down the tile
 const isz = s.h * 0.42 // icon size (fraction of tile height) -- a touch bigger than the vertical ones
  tiltText(ctx, hsp, s.x + s.w / 2 + 0.5, s.y + s.h * 0.62, t.icon, ICONF, isz, edge, Math.min(1, (on[s.k] ? 1 : 0.78) + hov * 0.22), { align: "c",extraRotate: 0.05, glow: (on[s.k] ? 0.4 : 0) + hov * 0.5 })
 drawBadgeBox(ctx, hsp, s.x + (s.w - BADGE) / 2, HSH + BGAP, BADGE, t.sc, edge)   // shortcut keycap sits below each horizontal tile
 }
 return false
 })
 const hitSlot = (x: number, y: number): string | null => {
 for (const s of HLAYOUT) if (pip(x, y, horizSlotFrame(s.x, s.y, s.w, s.h).map(([u, v]) => hsp.project(u, v)) as [number, number][])) return s.k
 return null
 }
 let openRefresh = () => {}
 const evt = EventBox({ child: area })
 try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK) } catch {}
 // the REC tile is the odd one out: instead of opening a modal it just fires the screenrecord script (start/stop toggle lives in there). everything else opens its panel.
 evt.connect("button-press-event", (_w, e) => { let x = 0, y = 0; try { const c = e.get_coords?.(); if (c) { x = c[1]; y = c[2] } } catch {} const k = hitSlot(x, y); if (k) { if (k === "rec") sh("$HOME/.config/hypr/themes/cyberpunk/scripts/screenrecord"); else toggleModal(k); openRefresh() } return false })
 evt.connect("motion-notify-event", (_w, e) => { let x = 0, y = 0; try { const c = e.get_coords?.(); if (c) { x = c[1]; y = c[2] } } catch {} hovered = hitSlot(x, y); return false })
 evt.connect("leave-notify-event", () => { hovered = null; return false })
  openRefresh = () => { for (const s of HLAYOUT) open[s.k] = isModalOpen(s.k); area.queue_draw() }
 const stateRefresh = () => { HLAYOUT.forEach(s => { const t = tileOf(s.k); (t.state ? t.state() : Promise.resolve(true)).then(v => { if (v !== on[s.k]) { on[s.k] = v; area.queue_draw() } }).catch(() => {}) }) }
 stateRefresh()
 const hoverTick = interval(40, () => {
 let busy = false
 for (const s of HLAYOUT) { const tgt = hovered === s.k ? 1 : 0; const cur = hv[s.k] || 0; if (Math.abs(tgt - cur) > 0.015) { hv[s.k] = cur + (tgt - cur) * 0.3; busy = true } else if (cur !== tgt) hv[s.k] = tgt }
 if (busy) area.queue_draw()
 })
 const a = interval(6000, stateRefresh), b = interval(450, openRefresh)
 area.connect("destroy", () => { a.cancel(); b.cancel(); hoverTick.cancel() })
 return evt
}

// what core.ts actually mounts on the left: just wraps VertDock in a .dock box
export const Toggles = () => Box({ className: "dock", children: [VertDock()] })

// ── Exported HorizDock for bottom bar ────────────────────────────────────────
export { HorizDock }
