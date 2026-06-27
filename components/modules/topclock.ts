// the big red holographic clock pinned to the top-centre of the screen. time + full date,
// soft red glow, occasional glitch (rgb split + a couple chars scrambling) that fires every
// few seconds rather than constantly so it doesn't get annoying.
//
// fair warning before you read on: this file is messy because i tried a TON of different
// clock layouts and never deleted the ones i didn't pick -- they're all still here, gated
// behind the three knobs right below (CLAYOUT / VARIANT / DSTYLE). only ONE branch actually
// runs at a time. if you just want to change how the clock looks, flip those numbers and
// reload; don't bother reading every branch. the one that's live right now is CLAYOUT = 2.
import { Window, Box, DrawingArea } from "../../widget.ts"
import { Anchor, Layer, Exclusivity } from "../../widget.ts"
import { interval } from "astal"
import { makePlane, tiltText, strokePath, fillQuad, measure } from "./proj.ts"

const TITLE = "Orbitron", MONO = "JetBrains Mono"   // Orbitron for the time (that blocky sci-fi look), mono for the small text
const W = 440, H = 92
const plane = makePlane({ w: W, h: H, yaw: -3, pitch: 4, roll: 0, focal: 1300, dist: 1300, pad: 14 })
const pad2 = (n) => String(n).padStart(2, "0")
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const SCRAM = "ABCDEF0123456789#%&/<>*+=".split("")
const RED = [255, 42, 58]
const REDLT = [255, 120, 130]
const CYA = [60, 226, 255]
// the three layout knobs. CLAYOUT is checked FIRST -- if it's > 0 it wins and VARIANT/DSTYLE
// are ignored entirely (the code returns before it ever reaches them). so:
//   CLAYOUT = 0  -> fall through and use the older VARIANT + DSTYLE combos instead
//   CLAYOUT = 1..5 -> use one of the newer all-in-one clock+date layouts (this is what's live)
const VARIANT = 1   // older outer style (only matters if CLAYOUT=0): 1=cut-panel 2=quest-tracker 3=lower-third 4=condensed
const DSTYLE = 2    // older date style (only matters if CLAYOUT=0 and VARIANT=1): 1=segmented cells 2=big-day 3=two-line 4=pipe dividers
const CLAYOUT = 2   // THE main switch: 0=use VARIANT/DSTYLE above, else 1=tight 2=side-by-side 3=full-width footer 4=left-accent 5=bracketed
const HUD = "Oxanium"

export const TopClockWindow = (mon?) => {
 const area = DrawingArea({}); area.set_size_request(plane.width, plane.height)
 let glitch = 0
 const cx = W / 2

 area.connect("draw", (_w, ctx) => {
 const now = new Date()
 const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
 const sec = pad2(now.getSeconds())
 const date = `${DAYS[now.getDay()]} // ${MONS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
 const on = now.getSeconds() % 2 === 0

 // every layout below calls this to draw the actual time. it does the red holo look:
 // when a glitch is active it scrambles a random digit and draws offset red/cyan ghosts,
 // then always lays down a faint double-image + the crisp glowing time on top.
 const drawTime = (x, ty, size, align) => {
 let tt = time
 if (glitch > 0.02) {
 if (Math.random() < 0.5) { const i = (Math.random() * tt.length) | 0; if (tt[i] !== ":") tt = tt.slice(0, i) + SCRAM[(Math.random() * SCRAM.length) | 0] + tt.slice(i + 1) }
 const dx = (Math.random() - 0.5) * 10 * glitch
 tiltText(ctx, plane, x + dx, ty, tt, TITLE, size, RED, 0.5 * glitch, { align, bold: true })
 tiltText(ctx, plane, x - dx, ty, tt, TITLE, size, CYA, 0.45 * glitch, { align, bold: true })
 }
 for (const [ox, oy, a] of [[-1.5, 0, 0.05], [1.5, 0, 0.05]])
 tiltText(ctx, plane, x + ox, ty + oy, tt, TITLE, size, RED, a, { align, bold: true })
 tiltText(ctx, plane, x, ty, tt, TITLE, size, RED, 0.95, { align, bold: true, glow: 0.18 })
 }
 // the angular panel behind the clock: a rectangle with two opposite corners sliced off
 // (top-right + bottom-left), filled dark + stroked. `cut` is how big the corner slices are.
 const cutPanel = (x0, y0, x1, y1, cut, fillA, lineA) => {
 const pts = [[x0, y0], [x1 - cut, y0], [x1, y0 + cut], [x1, y1], [x0 + cut, y1], [x0, y1 - cut]]
 if (fillA > 0) { fillQuad(ctx, plane, x0, y0, x1, y1, [22, 3, 6], fillA) }
 strokePath(ctx, plane, pts, RED, lineA, 1.3, true)
 }

 // ════════ the newer all-in-one layouts. only one of these runs, picked by CLAYOUT ════════
 // (each `else if` is a totally separate design i tried -- skim for the one matching CLAYOUT)
 if (CLAYOUT > 0) {
 const dAbbr = DAYS[now.getDay()].slice(0, 3), dd = pad2(now.getDate())
 const mon = MONS[now.getMonth()], yr = String(now.getFullYear())

 if (CLAYOUT === 1) {
 // tight: panel shrinks to hug the text so there's no big empty side margins
 const timeW = measure(ctx, time, TITLE, 38)
 const dw = measure(ctx, dd, HUD, 30), sw = Math.max(measure(ctx, dAbbr, HUD, 12), measure(ctx, `${mon} ${yr}`, HUD, 13))
 const dateW = dw + 26 + sw, pw = Math.max(timeW, dateW) + 60
 const x0 = cx - pw / 2, x1 = cx + pw / 2
 cutPanel(x0, 24, x1, 94, 14, 0.28, 0.5)
 drawTime(cx, 56, 38, "c")
 const bx = cx - dateW / 2
 tiltText(ctx, plane, bx, 90, dd, HUD, 30, REDLT, 0.97, { align: "l", bold: true, glow: 0.25 })
 const divx = bx + dw + 12
 strokePath(ctx, plane, [[divx, 72], [divx, 91]], RED, 0.6, 1.5)
 tiltText(ctx, plane, divx + 12, 79, dAbbr, HUD, 12, RED, 0.8, { align: "l", bold: true })
 tiltText(ctx, plane, divx + 12, 91, `${mon} ${yr}`, HUD, 13, REDLT, 0.9, { align: "l", bold: true })
 }
 else if (CLAYOUT === 2) {
 // side-by-side (THE LIVE ONE): time on the left, a divider, then date on the right
 const x0 = cx - 142, x1 = cx + 142
 cutPanel(x0, 20, x1, 70, 12, 0.28, 0.5)
 const tx = x0 + 18
 drawTime(tx, 56, 29, "l")
 const timeW = measure(ctx, time, TITLE, 29), divx = tx + timeW + 18
 strokePath(ctx, plane, [[divx, 28], [divx, 62]], RED, 0.55, 1.4)
 const rx = divx + 14
 tiltText(ctx, plane, rx, 56, dd, HUD, 33, REDLT, 0.97, { align: "l", bold: true, glow: 0.22 })
 const dw = measure(ctx, dd, HUD, 33)
 tiltText(ctx, plane, rx + dw + 10, 45, dAbbr, HUD, 12.5, RED, 0.82, { align: "l", bold: true })
 tiltText(ctx, plane, rx + dw + 10, 60, `${mon} ${yr}`, HUD, 14.5, REDLT, 0.92, { align: "l", bold: true, glow: 0.12 })
 }
 else if (CLAYOUT === 3) {
 // footer: time up top, date stretched across a full-width bar underneath
 const x0 = cx - 142, x1 = cx + 142
 cutPanel(x0, 22, x1, 94, 14, 0.26, 0.45)
 drawTime(cx, 54, 36, "c")
 const sy0 = 70, sy1 = 92, cut = 10
 fillQuad(ctx, plane, x0 + 8, sy0, x1 - 8, sy1, [40, 4, 8], 0.5)
 strokePath(ctx, plane, [[x0 + 8, sy0], [x1 - 8 - cut, sy0], [x1 - 8, sy0 + cut], [x1 - 8, sy1], [x0 + 8 + cut, sy1], [x0 + 8, sy1 - cut]], RED, 0.5, 1, true)
 tiltText(ctx, plane, x0 + 24, sy0 + 15, dAbbr, HUD, 12.5, RED, 0.85, { align: "l", bold: true })
 tiltText(ctx, plane, cx, sy0 + 16, dd, HUD, 17, REDLT, 0.96, { align: "c", bold: true, glow: 0.15 })
 tiltText(ctx, plane, x1 - 24, sy0 + 15, `${mon} ${yr}`, HUD, 12.5, REDLT, 0.9, { align: "r", bold: true })
 }
 else if (CLAYOUT === 4) {
 // left-accent: a bright bar down the left, content flush-left, little tick marks on the right to balance it
 const x0 = cx - 142, x1 = cx + 142
 fillQuad(ctx, plane, x0, 28, x0 + 4, 90, RED, 0.9)
 tiltText(ctx, plane, x0 + 14, 30, "// SYS.TIME", MONO, 8, RED, 0.55, { align: "l", bold: true })
 drawTime(x0 + 16, 66, 34, "l")
 const bx = x0 + 16
 tiltText(ctx, plane, bx, 90, dd, HUD, 26, REDLT, 0.95, { align: "l", bold: true, glow: 0.2 })
 const dw = measure(ctx, dd, HUD, 26)
 tiltText(ctx, plane, bx + dw + 10, 80, dAbbr, HUD, 11, RED, 0.8, { align: "l", bold: true })
 tiltText(ctx, plane, bx + dw + 10, 90, `${mon} ${yr}`, HUD, 12, REDLT, 0.9, { align: "l", bold: true })
 for (let i = 0; i < 5; i++) strokePath(ctx, plane, [[x1, 34 + i * 13], [x1 - 12, 34 + i * 13]], RED, 0.4, 1)
 }
 else {
 // bracketed (CLAYOUT 5): compact time+date with big [ ] brackets squeezing it from both sides
 const timeW = measure(ctx, time, TITLE, 38)
 const dw = measure(ctx, dd, HUD, 28), sw = Math.max(measure(ctx, dAbbr, HUD, 11), measure(ctx, `${mon} ${yr}`, HUD, 12))
 const dateW = dw + 23 + sw, cW = Math.max(timeW, dateW)
 drawTime(cx, 56, 38, "c")
 const bx = cx - dateW / 2
 tiltText(ctx, plane, bx, 90, dd, HUD, 28, REDLT, 0.97, { align: "l", bold: true, glow: 0.22 })
 const divx = bx + dw + 11
 strokePath(ctx, plane, [[divx, 73], [divx, 90]], RED, 0.6, 1.4)
 tiltText(ctx, plane, divx + 11, 79, dAbbr, HUD, 11, RED, 0.8, { align: "l", bold: true })
 tiltText(ctx, plane, divx + 11, 90, `${mon} ${yr}`, HUD, 12, REDLT, 0.9, { align: "l", bold: true })
 const bL = cx - cW / 2 - 18, bR = cx + cW / 2 + 18
 strokePath(ctx, plane, [[bL + 9, 40], [bL, 40], [bL, 92], [bL + 9, 92]], RED, 0.6, 2)
 strokePath(ctx, plane, [[bR - 9, 40], [bR, 40], [bR, 92], [bR - 9, 92]], RED, 0.6, 2)
 }
 return false
 }

 // ════════ below here = the OLDER layouts, only reached when CLAYOUT===0 ════════
 // ════════ VARIANT 1 — clean cut-corner panel, date row style picked by DSTYLE ════════
 if (VARIANT === 1) {
 // cut-corner panel holding the time plus a date row (the date row look comes from DSTYLE)
 const x0 = cx - 138, x1 = cx + 138, y0 = 24, y1 = 94
 cutPanel(x0, y0, x1, y1, 16, 0.28, 0.5)
 const dAbbr = DAYS[now.getDay()].slice(0, 3), dFull = DAYS[now.getDay()]
 const dd = pad2(now.getDate()), mon = MONS[now.getMonth()], yr = String(now.getFullYear())
 if (DSTYLE === 1) {
 // each bit of the date in its own little boxed cell: [SUN][14][JUN][2026]
 drawTime(cx, 56, 36, "c")
 const parts = [dAbbr, dd, mon, yr], cy0 = 72, cy1 = 87, pad = 7, gap = 5
 const ws = parts.map(p => measure(ctx, p, MONO, 8.5) + pad * 2)
 const total = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1)
 let xx = cx - total / 2
 parts.forEach((p, i) => {
 strokePath(ctx, plane, [[xx, cy0], [xx + ws[i] - 4, cy0], [xx + ws[i], cy0 + 4], [xx + ws[i], cy1], [xx, cy1]], RED, 0.5, 1, true)
 tiltText(ctx, plane, xx + ws[i] / 2, cy1 - 4, p, MONO, 8.5, REDLT, 0.88, { align: "c", bold: true })
 xx += ws[i] + gap
 })
 } else if (DSTYLE === 2) {
 // big day number, with the weekday + month/year stacked next to it and a little angular divider
 drawTime(cx, 54, 36, "c")
 const HUD = "Oxanium"
 const dw = measure(ctx, dd, HUD, 34)
 const sw = Math.max(measure(ctx, dAbbr, HUD, 12.5), measure(ctx, `${mon} ${yr}`, HUD, 13.5))
 const total = dw + 28 + sw
 const bx = cx - total / 2
 // the big glowing day-of-month number
 tiltText(ctx, plane, bx, 91, dd, HUD, 34, REDLT, 0.97, { align: "l", bold: true, glow: 0.28 })
 // the little angular divider between the day number and the stacked text
 const divx = bx + dw + 13
 strokePath(ctx, plane, [[divx, 70], [divx, 92]], RED, 0.65, 1.6)
 strokePath(ctx, plane, [[divx - 5, 70], [divx, 70]], RED, 0.65, 1.6)
 strokePath(ctx, plane, [[divx, 92], [divx + 5, 92]], RED, 0.65, 1.6)
 // weekday on top, month + year underneath
 tiltText(ctx, plane, divx + 13, 79, dAbbr, HUD, 12.5, RED, 0.82, { align: "l", bold: true })
 tiltText(ctx, plane, divx + 13, 92, `${mon} ${yr}`, HUD, 13.5, REDLT, 0.92, { align: "l", bold: true, glow: 0.12 })
 } else if (DSTYLE === 3) {
 // simple centred two-line stack: weekday on top, the date below it
 drawTime(cx, 58, 38, "c")
 tiltText(ctx, plane, cx, 76, dFull, MONO, 8, RED, 0.6, { align: "c", bold: true })
 tiltText(ctx, plane, cx, 89, `${mon} ${dd}  ·  ${yr}`, MONO, 11, REDLT, 0.9, { align: "c", bold: true, glow: 0.15 })
 } else {
 // date in one row with vertical pipe dividers between the chunks: SUN | 14 JUN | 2026
 drawTime(cx, 58, 38, "c")
 const segs = [dAbbr, `${dd} ${mon}`, yr], gap = 14
 const ws = segs.map(s => measure(ctx, s, MONO, 10))
 const total = ws.reduce((a, b) => a + b, 0) + gap * 2 * (segs.length - 1)
 let xx = cx - total / 2
 segs.forEach((s, i) => {
 tiltText(ctx, plane, xx, 88, s, MONO, 10, REDLT, 0.88, { align: "l", bold: true })
 xx += ws[i] + gap
 if (i < segs.length - 1) { strokePath(ctx, plane, [[xx - gap / 2, 80], [xx - gap / 2, 90]], RED, 0.55, 1.4); }
 })
 }
 }

 // ════════ VARIANT 2 — left-aligned, styled like a CP2077 quest tracker ════════
 else if (VARIANT === 2) {
 const lx = cx - 150
 fillQuad(ctx, plane, lx, 24, lx + 4, 92, RED, 0.92)                          // the tall red accent bar down the left
 strokePath(ctx, plane, [[lx + 12, 24], [lx + 22, 24], [lx + 22, 30]], RED, 0.7, 1.5)  // tiny corner tick up top
 tiltText(ctx, plane, lx + 14, 34, "// NIGHT CITY", MONO, 9, REDLT, 0.72, { align: "l", bold: true })
 drawTime(lx + 13, 70, 40, "l")
 tiltText(ctx, plane, lx + 150, 56, sec, MONO, 12, REDLT, 0.6, { align: "l", bold: true })
 tiltText(ctx, plane, lx + 14, 90, date, MONO, 10, REDLT, 0.8, { align: "l", bold: true, glow: 0.2 })
 fillQuad(ctx, plane, lx + 150, 84, lx + 154, 88, RED, on ? 0.95 : 0.3)
 tiltText(ctx, plane, lx + 160, 90, "SYNCED", MONO, 8.5, REDLT, 0.65, { align: "l", bold: true })
 }

 // ════════ VARIANT 3 — broadcast "lower third" feel: time over an angular date strip ════════
 else if (VARIANT === 3) {
 tiltText(ctx, plane, cx - 150, 20, "// NIGHT CITY", MONO, 9, REDLT, 0.7, { align: "l", bold: true })
 fillQuad(ctx, plane, cx + 108, 16, cx + 112, 20, RED, on ? 0.95 : 0.3)
 tiltText(ctx, plane, cx + 150, 20, "SYNCED", MONO, 9, REDLT, 0.7, { align: "r", bold: true })
 drawTime(cx, 60, 42, "c")
 // the filled angular strip underneath that holds the date
 const sx0 = cx - 134, sx1 = cx + 134, sy0 = 72, sy1 = 96, cut = 12
 fillQuad(ctx, plane, sx0, sy0, sx1, sy1, [40, 4, 8], 0.55)
 strokePath(ctx, plane, [[sx0, sy0], [sx1 - cut, sy0], [sx1, sy0 + cut], [sx1, sy1], [sx0 + cut, sy1], [sx0, sy1 - cut]], RED, 0.55, 1.2, true)
 fillQuad(ctx, plane, sx0 + 4, sy0 + 4, sx0 + 6, sy1 - 4, RED, 0.85)
 tiltText(ctx, plane, cx, sy0 + 17, date, MONO, 11, REDLT, 0.88, { align: "c", bold: true, glow: 0.2 })
 }

 // ════════ VARIANT 4 — the stripped-down one: just a small chevron next to the time ════════
 else {
 tiltText(ctx, plane, cx, 22, "// NIGHT CITY", MONO, 8.5, REDLT, 0.6, { align: "c", bold: true })
 // a single ">" chevron accent sitting to the left of the time
 strokePath(ctx, plane, [[cx - 118, 50], [cx - 108, 56], [cx - 118, 62]], RED, 0.6, 2)
 drawTime(cx, 66, 40, "c")
 tiltText(ctx, plane, cx + 116, 62, sec, MONO, 12, REDLT, 0.6, { align: "l", bold: true })
 tiltText(ctx, plane, cx, 90, date, MONO, 10, REDLT, 0.82, { align: "c", bold: true, glow: 0.2 })
 }
 return false
 })

 let lastSec = -1
 const t = interval(110, () => {
 const s = new Date().getSeconds()
 let redraw = false
 if (s !== lastSec) { lastSec = s; redraw = true; if (Math.random() < 0.14) glitch = 1 } // ~14% chance each second to kick off a glitch, so it fires every few seconds on average
 if (glitch > 0) { glitch = Math.max(0, glitch - 0.13); redraw = true }
 if (redraw) area.queue_draw()
 })
 area.connect("destroy", () => t.cancel())

 return Window({
 name: "topclock", className: "aug topclock", gdkmonitor: mon, anchor: Anchor.TOP,
 layer: Layer.BOTTOM, exclusivity: Exclusivity.IGNORE,
 child: Box({ className: "topclock-wrap", child: area }),
 })
}
