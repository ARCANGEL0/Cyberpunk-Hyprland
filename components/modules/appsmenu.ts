import { Window, DrawingArea, EventBox, activeMonitor } from "../../widget.ts"
import { Anchor, Layer, Exclusivity, Keymode } from "../../widget.ts"
import { interval, timeout, execAsync } from "astal"
import Gdk from "gi://Gdk?version=3.0"
import Gtk from "gi://Gtk?version=3.0"
import Gio from "gi://Gio"
import { SCREEN_WIDTH, SCREEN_HEIGHT, CYBER_DIR } from "../../env.ts"
import { NEON, f } from "./colors.ts"

// ── cyberpunk SFX ──
const AUDIO = `${CYBER_DIR}/assets/audio`
const playSnd = (file) => execAsync(["sh", "-c", // tries several audio play fallbacks here, depeneding on what u have installed
 `pw-play --volume=1.5 "${AUDIO}/${file}" 2>/dev/null || play -q -v 1.5 "${AUDIO}/${file}" 2>/dev/null || mpv --no-config --no-terminal --really-quiet --volume=150 "${AUDIO}/${file}" 2>/dev/null || ffplay -nodisp -autoexit -loglevel quiet -volume 150 "${AUDIO}/${file}" 2>/dev/null`]).catch(() => {})
let lastBeep = 0
const beep = () => { const t = Date.now(); if (t - lastBeep < 35) return; lastBeep = t; playSnd("kiroshi_beep.ogg") }   // navigation blip (throttled so fast scroll doesn't stack)

// Loops the kiroshi ambient effect, that "scanning sound" that keeps playing.
// Might be my audio device or the audio is low volume because i can't barely hear it, so i make it run in loop at 200% vol while launcher is active.
// if it earrapes for you, better to reduce that.
// also that same loop for me cost (~0.7s, up to several seconds in practice)which makes it lag badly. A lock file
// gates the loop; the sh stays alive as a managed execAsync child re-running play.
const MENU_LOCK = "/tmp/kiroshi_menu.lock"
const startMenuLoop = () => execAsync(["sh", "-c",
 `touch '${MENU_LOCK}'; while [ -e '${MENU_LOCK}' ]; do ` +
 `pw-play --volume=2.0 "${AUDIO}/kiroshi_menu.ogg" 2>/dev/null || play -q -v 2.0 "${AUDIO}/kiroshi_menu.ogg" 2>/dev/null || { mpv --no-config --no-terminal --really-quiet --no-video --volume=200 "${AUDIO}/kiroshi_menu.ogg" 2>/dev/null || break; }; done`]).catch(() => {})

 const stopMenuLoop = () => execAsync(["sh", "-c",
 `rm -f '${MENU_LOCK}'; pkill -f 'kiroshi_menu[.]ogg' 2>/dev/null; ` +
 `play -q -v 1.5 "${AUDIO}/kiroshi_off.ogg" 2>/dev/null || mpv --no-config --really-quiet --volume=150 "${AUDIO}/kiroshi_off.ogg" 2>/dev/null`]).catch(() => {})

import { TITLE, MONO, ICONF } from "./fonts.ts"
const [RR, RG, RB] = f(NEON.red)
const [CR, CG, CB] = f(NEON.cyan)

const FOOTER_APPS = "[ TYPE ] SEARCH    [ SCROLL / ARROW KEYS ] NAVIGATE    [ ENTER / CLICK ] LAUNCH    [ ESC ] CLOSE"
let wheelCfg: any = { title: "APPS", subtitle: "// CYBERDECK.OS — RUNNING", footer: FOOTER_APPS, searchable: true, onActivate: null, onSecondary: null, onReset: null, emptyText: "// NO APPS" }

const VISIBLE = 9            
const ROW_H = 50, ROW_W = 400, LIST_X = 150
const CURVE = 46            // px horizontal arc depth with subtle wheel like curvature thing
const mod = (a, n) => n > 0 ? ((a % n) + n) % n : 0

let menuWin = null, menuArea = null
let active = false
let apps: any[] = []                       // all apps
let filtered: any[] = []                   // current (search-filtered) list shown
let query = "", searchFlash = 0            // search text + glitch pulse (1→0) on each change
let scroll = 0, scrollTarget = 0          // center-focused index (float)
let mouseY = 0
let lastFocusIdx = -1
let animT = null
let intro = 0, introTarget = 0            // open/close boot animation (0 hidden → 1 shown)
const iconCache = new Map<string, any>()
const RENDER: any[] = []                  // rebuilt each draw for hit-testing: {app, y0, y1, num}
const GLYPH = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ#%@/<>*"

const applyFilter = () => {
 const q = query.toLowerCase().trim()
 if (!q) filtered = apps.slice()
 else filtered = apps.map((a) => [a, (a.label || "").toLowerCase()] as [any, string])
     .filter((p) => p[1].includes(q))                                   // substring match — predictable
     .sort((a, b) => (a[1].indexOf(q) - b[1].indexOf(q)) || a[1].localeCompare(b[1]))
     .map((p) => p[0])
 scroll = 0; scrollTarget = 0; searchFlash = 1
 animate()
}

const bandTop = () => Math.round((SCREEN_HEIGHT - VISIBLE * ROW_H) / 2 + 18)
const centerY = () => bandTop() + VISIBLE * ROW_H / 2

let appInfoCache: any[] | null = null
const loadApps = () => {
 if (appInfoCache) return appInfoCache
 try {
     const list = Gio.AppInfo.get_all().filter((a) => { try { return a.should_show() } catch { return true } })
     list.sort((a, b) => (a.get_name() || "").toLowerCase().localeCompare((b.get_name() || "").toLowerCase()))
     appInfoCache = list; return list
 } catch (e) { print("[apps]", e); return [] }
}
const buildAppEntries = () => loadApps().map((a) => ({ label: a.get_name() || "", badge: "READY", icon: null, glyph: null, data: a }))

const iconFor = (app) => {
 const key = app.get_name() || ""
 if (iconCache.has(key)) return iconCache.get(key)
 let pb = null
 try { const g = app.get_icon(); if (g) { const info = Gtk.IconTheme.get_default().lookup_by_gicon(g, 40, 0); if (info) pb = info.load_icon() } } catch {}
 iconCache.set(key, pb); return pb
}

const truncate = (s, n) => (s && s.length > n) ? s.slice(0, n - 1) + "…" : (s || "")

// the CP2077 kiroshi quickhacks item box: 
const itemPath = (ctx, bx, by, bw, bh) => {
 const inX = 4, bvTop = 24, bvBot = 20, tc = 5   
 // small, shallow step on the left edge (higher up), longer inset run to the bottom; small top-right cut
 ///// tried ot recreate literally identical to the quickhack items shape.
 ctx.newPath()
 ctx.moveTo(bx, by)                       // top-left 90°
 ctx.lineTo(bx + bw - tc, by)             // top edge
 ctx.lineTo(bx + bw, by + tc)             // top-right small bevel
 ctx.lineTo(bx + bw, by + bh)             // right edge → bottom-right 90°
 ctx.lineTo(bx + inX, by + bh)            // bottom edge left to the chamfer foot
 ctx.lineTo(bx + inX, by + bh - bvBot)    // up (inset vertical segment)
 ctx.lineTo(bx, by + bh - bvTop)          // bevel diagonal out to the left edge
 ctx.closePath()                          // left edge straight up to top-left
}

const drawRow = (ctx, entry, x, ry, num, A, focused) => {
 const app = entry
 const h = ROW_H - 8
 const nsz = 26, nx = x, ny = ry + (h - nsz) / 2          // separate number square on the left, which would be the "RAM usage" being just the numbered label
 const bx = x + nsz + 11, bw = ROW_W - nsz - 11, by = ry  // item box
 const gl = focused ? 1 : 0.72

 // ── number square here
 ctx.setOperator(12); ctx.setSourceRGBA(CR, CG, CB, 0.2 * A * gl); ctx.setLineWidth(4); ctx.rectangle(nx, ny, nsz, nsz); ctx.stroke(); ctx.setOperator(2)
 ctx.setSourceRGBA(CR * 0.16, CG * 0.16, CB * 0.2, 0.34 * A); ctx.rectangle(nx, ny, nsz, nsz); ctx.fill()
 ctx.setSourceRGBA(CR, CG, CB, 0.92 * A * gl); ctx.setLineWidth(1.5); ctx.rectangle(nx, ny, nsz, nsz); ctx.stroke()
 const nm = num <= 9 ? String(num) : (num === 10 ? "0" : "")
 if (nm) {
     ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(14)
     const tw = ctx.textExtents(nm).width
     ctx.setSourceRGBA(CR, CG, CB, A); ctx.moveTo(nx + nsz / 2 - tw / 2, ny + nsz / 2 + 5); ctx.showText(nm)
 }

 // ── item box  with glow
 itemPath(ctx, bx, by, bw, h); ctx.setSourceRGBA(CR * 0.16, CG * 0.16, CB * 0.2, (focused ? 0.5 : 0.3) * A); ctx.fill()
 ctx.setOperator(12); itemPath(ctx, bx, by, bw, h); ctx.setSourceRGBA(CR, CG, CB, 0.22 * A * gl); ctx.setLineWidth(focused ? 5 : 4); ctx.stroke(); ctx.setOperator(2)
 itemPath(ctx, bx, by, bw, h); ctx.setSourceRGBA(CR, CG, CB, (focused ? 0.97 : 0.72) * A); ctx.setLineWidth(1.6); ctx.stroke()

//item name
 ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(15); ctx.setSourceRGBA(1, 1, 1, (focused ? 1 : 0.9) * A)
 let nm2 = truncate(entry.label, 22)
 if (searchFlash > 0.03) nm2 = nm2.split("").map((c) => (c === " " || Math.random() > searchFlash * 0.85) ? c : GLYPH[(Math.random() * GLYPH.length) | 0]).join("")
 ctx.moveTo(bx + 20, by + h / 2 - 2); ctx.showText(nm2)
 const bg = (entry.badge || "").toString().slice(0, 14)
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(8); const bgw = Math.max(46, ctx.textExtents(bg).width + 10)
 ctx.setSourceRGBA(CR, CG, CB, 0.85 * A); ctx.setLineWidth(0.8); ctx.rectangle(bx + 20, by + h / 2 + 6, bgw, 13); ctx.stroke(); ctx.moveTo(bx + 24, by + h / 2 + 16); ctx.showText(bg)

 // icon on the right: a loaded pixbuf (apps) or a nerd-font glyph (wifi/bt)
 if (entry.glyph) { ctx.selectFontFace(ICONF, 0, 0); ctx.setFontSize(22); const gw = ctx.textExtents(entry.glyph).width; ctx.setSourceRGBA(CR, CG, CB, 0.92 * A * gl); ctx.moveTo(bx + bw - 34 - gw / 2, by + h / 2 + 8); ctx.showText(entry.glyph) }
}

const drawSearchGlitch = (ctx, top, bandH) => {
 const sf = searchFlash, s = Math.floor(Date.now() / 38)
 const nz = (k) => { const x = Math.sin(s * 1.3 + k) * 43758.5; return x - Math.floor(x) }
 for (let i = 0; i < 6; i++) {
     const by = top + nz(i * 2.1) * bandH, bh = 2 + nz(i * 0.7 + 9) * 10, sh = (nz(i * 3 + 4) - 0.5) * 55 * sf
     ctx.setSourceRGBA(CR * 0.3, CG, CB, 0.11 * sf); ctx.rectangle(LIST_X - 60 + sh, by, ROW_W + 120, bh); ctx.fill()
     ctx.setSourceRGBA(RR, RG * 0.2, RB * 0.2, 0.07 * sf); ctx.rectangle(LIST_X - 60 - sh, by + 1, ROW_W + 120, Math.max(1, bh - 2)); ctx.fill()
 }
}

// horizontal RGB-split anim for open/close of apps menu
const drawIntroGlitch = (ctx, e) => {
 const amt = 1 - e, s = Math.floor(Date.now() / 28)
 const nz = (k) => { const x = Math.sin(s * 1.7 + k) * 43758.5; return x - Math.floor(x) }
 const top = bandTop(), bandH = VISIBLE * ROW_H
 ctx.setOperator(12)
 for (let i = 0; i < 6; i++) {
     const by = top - 40 + nz(i * 2.3) * (bandH + 80), bh = 2 + nz(i + 5) * 16, sh = (nz(i * 3 + 1) - 0.5) * 140 * amt
     ctx.setSourceRGBA(CR * 0.4, CG, CB, 0.12 * amt); ctx.rectangle(LIST_X - 90 + sh, by, ROW_W + 220, bh); ctx.fill()
     ctx.setSourceRGBA(RR, RG * 0.2, RB * 0.2, 0.09 * amt); ctx.rectangle(LIST_X - 90 - sh, by + 2, ROW_W + 220, Math.max(1, bh - 2)); ctx.fill()
 }
 ctx.setOperator(2)
}

const draw = (ctx) => {
 if (!active && intro <= 0.002) return
 ctx.setOperator(0); ctx.paint(); ctx.setOperator(2)
 const e = intro
 ctx.setSourceRGBA(0.01, 0.004, 0.015, 0.85 * Math.min(1, e * 2)); ctx.rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT); ctx.fill()
 if (e >= 0.998) { drawContent(ctx); return }
 const gt = bandTop(), gy1 = gt + VISIBLE * ROW_H + 44
 ctx.save(); ctx.rectangle(LIST_X - 100, gt - 54, ROW_W + 240, gy1 - (gt - 54)); ctx.clip()
 ctx.pushGroup()
 drawContent(ctx)
 ctx.popGroupToSource()
 const px = LIST_X + ROW_W / 2, py = centerY()
 const ey = 0.04 + 0.96 * e, ex = 0.72 + 0.28 * e
 ctx.translate(px, py); ctx.scale(ex, ey); ctx.translate(-px, -py)
 ctx.paintWithAlpha(Math.min(1, e * 1.6))
 ctx.restore()
 if (e < 0.98) drawIntroGlitch(ctx, e)
}

const drawContent = (ctx) => {
 const n = filtered.length
 const top = bandTop(), cy = centerY(), bandH = VISIBLE * ROW_H
 // header + search field
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(11); ctx.setSourceRGBA(RR, RG, RB, 0.55); ctx.moveTo(LIST_X, top - 46); ctx.showText(wheelCfg.subtitle)
 ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(22)
 const titleW = ctx.textExtents(wheelCfg.title).width
 ctx.setOperator(12); ctx.setSourceRGBA(CR, CG, CB, 0.4); ctx.moveTo(LIST_X + 1, top - 16); ctx.showText(wheelCfg.title); ctx.setOperator(2)
 ctx.setSourceRGBA(CR, CG, CB, 0.97); ctx.moveTo(LIST_X, top - 16); ctx.showText(wheelCfg.title)
 if (wheelCfg.searchable) {
     ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(13)
     const cur = (Math.floor(Date.now() / 450) % 2) ? "▌" : " "
     ctx.setSourceRGBA(CR, CG, CB, query ? 0.95 : 0.4); ctx.moveTo(LIST_X + titleW + 24, top - 16); ctx.showText("› " + (query ? query.toUpperCase() + cur : "SEARCH…"))
 }
 ctx.setSourceRGBA(CR, CG, CB, 0.4); ctx.setLineWidth(1); ctx.newPath(); ctx.moveTo(LIST_X, top - 8); ctx.lineTo(LIST_X + ROW_W, top - 8); ctx.stroke()

 if (n === 0) {
     ctx.selectFontFace(TITLE, 0, 1); ctx.setFontSize(18); ctx.setSourceRGBA(RR, RG, RB, 0.85)
     ctx.moveTo(LIST_X + 30, cy); ctx.showText(query ? "// NO MATCH" : wheelCfg.emptyText)
 } else {
    // curved wheel component: the list of apps is drawn in a curved wheel-like fashion, with the center app being the focus and the others curving away from it.
    //  The RENDER array is rebuilt each draw for hit-testing. 
     RENDER.length = 0
     const base = Math.round(scroll), frac = scroll - base
     const HALF = Math.ceil(VISIBLE / 2) + 2
     const wrap = n > VISIBLE
     ctx.save(); ctx.rectangle(LIST_X - 70, top - 6, ROW_W + 170, bandH + 12); ctx.clip()
     let num = 0
     for (let k = -HALF; k <= HALF; k++) {
         const idx = wrap ? mod(base + k, n) : (base + k)
         if (!wrap && (idx < 0 || idx >= n)) continue
         const slotPos = k - frac
         const t = slotPos / (VISIBLE / 2)
         const A = Math.max(0, 1 - Math.pow(Math.min(1.35, Math.abs(t)) / 1.12, 2.4))
         if (A < 0.03) continue
         const ry = Math.round(cy + slotPos * ROW_H - (ROW_H - 8) / 2)
         const x = LIST_X + CURVE * t * t
         num++
         RENDER.push({ entry: filtered[idx], y0: ry, y1: ry + ROW_H - 8, num })
         drawRow(ctx, filtered[idx], x, ry, num, A, Math.abs(slotPos) < 0.5)
     }
     ctx.restore()
     if (searchFlash > 0.02) drawSearchGlitch(ctx, top, bandH)
 }
 // footer hint
 ctx.selectFontFace(MONO, 0, 1); ctx.setFontSize(10); ctx.setSourceRGBA(RR, RG, RB, 0.5)
 ctx.moveTo(LIST_X, top + bandH + 30); ctx.showText(wheelCfg.footer)
}

const stopAnim = () => { if (animT) { animT.cancel(); animT = null } }
const animate = () => {
  if (animT) return
  animT = interval(16, () => {
      scroll += (scrollTarget - scroll) * 0.28
      if (searchFlash > 0) searchFlash = Math.max(0, searchFlash - 0.06)
      intro += (introTarget - intro) * 0.4   // slower so the open/close unfold clearly reads (~0.5s)
      if (introTarget === 0 && intro < 0.02) { intro = 0; if (menuWin) menuWin.visible = false }   // fully faded → hide
      const settled = Math.abs(scrollTarget - scroll) < 0.002 && searchFlash <= 0 && Math.abs(introTarget - intro) < 0.004
      if (settled) { scroll = scrollTarget; intro = introTarget; stopAnim() }
      const fi = Math.round(scroll)
      if (fi !== lastFocusIdx && filtered.length > 0) { lastFocusIdx = fi; const idx = ((fi % filtered.length) + filtered.length) % filtered.length; wheelCfg.onFocus?.(filtered[idx].data) }
      menuArea && menuArea.queue_draw()
  })
}

const activate = (entry) => { if (!entry) return; wheelCfg.onActivate?.(entry.data) }
const rowAtY = (y) => RENDER.find((r) => y >= r.y0 && y <= r.y1)


export const openWheel = (cfg, entries) => {
  if (!menuWin) return
  wheelCfg = cfg
  apps = entries; query = ""; filtered = apps.slice(); searchFlash = 0; scroll = 0; scrollTarget = 0
  active = true; intro = 1; introTarget = 1; lastFocusIdx = -1
  try { menuWin.gdkmonitor = activeMonitor() } catch {}
  try { menuWin.keymode = cfg.keymode ?? Keymode.ON_DEMAND } catch {}
  menuWin.visible = true; try { menuWin.present?.() } catch {}
  menuArea?.queue_draw()
  animate()
}
export const updateWheel = (entries) => {
  if (!active) return
  apps = entries
  const q = query.toLowerCase().trim()
  filtered = q ? apps.filter((a) => (a.label || "").toLowerCase().includes(q)) : apps.slice()
  const n = filtered.length
  if (n <= VISIBLE) scrollTarget = Math.max(0, Math.min(n - 1, scrollTarget))
  menuArea?.queue_draw()
}
export const isWheelOpen = () => active
export const closeWheel = () => {
  if (!active) return
  active = false; introTarget = 0; animate()
  const r = wheelCfg.onReset; if (r) r()
}
export const openAppsMenu = () => {
 if (!menuWin) return
 if (active) { closeWheel(); return }
 openWheel({ title: "APPS", subtitle: "// CYBERDECK.OS — RUNNING", footer: FOOTER_APPS, searchable: true, onActivate: (a) => { try { a.launch([], null) } catch (e) { print("[apps] launch:", e) } closeWheel() }, onSecondary: null, onReset: null, emptyText: "// NO APPS" }, buildAppEntries())
}

export const AppsMenuWindow = () => {
 menuArea = DrawingArea({})
 menuArea.set_size_request(SCREEN_WIDTH, SCREEN_HEIGHT)
 menuArea.connect("draw", (_w, ctx) => (draw(ctx), false))

 const evt = EventBox({ child: menuArea })
 try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.SCROLL_MASK) } catch {}
 evt.connect("motion-notify-event", (_w, e) => { try { const c = e.get_coords?.(); mouseY = c && c.length >= 3 ? c[2] : e.y } catch { mouseY = e.y } return false })
 evt.connect("button-press-event", (_w, e) => {
     if (!active) return true                                          // ignore clicks during fade-out
     let b = 1; try { b = e.get_button?.()[1] ?? e.button } catch {}
     const r = rowAtY(mouseY)
     if (b === 3) { if (r && wheelCfg.onSecondary) wheelCfg.onSecondary(r.entry.data); else closeWheel(); return true }
     if (r) activate(r.entry)
     return true
 })
  evt.connect("scroll-event", (_w, e) => {
      if (!active) return true
      let up = false, down = false
      try {
          const r = e.get_scroll_direction?.()
          if (r && r[0]) { if (r[1] === Gdk.ScrollDirection.UP) up = true; else if (r[1] === Gdk.ScrollDirection.DOWN) down = true }
          else { const sd = e.get_scroll_deltas?.(); const dy = sd ? sd[2] : 0; if (dy < -0.05) up = true; else if (dy > 0.05) down = true }
      } catch {}
      let moved = false
      if (up) { scrollTarget -= 1; moved = true }
      else if (down) { scrollTarget += 1; moved = true }
      if (moved) { const n = filtered.length; if (n <= VISIBLE) scrollTarget = Math.max(0, Math.min(n - 1, scrollTarget)); beep() }
      animate(); return true
  })

 menuWin = Window({
     name: "appsmenu", className: "aug appsmenu",
     anchor: Anchor.TOP | Anchor.BOTTOM | Anchor.LEFT | Anchor.RIGHT,
     layer: Layer.TOP, exclusivity: Exclusivity.IGNORE, keymode: Keymode.ON_DEMAND,
     visible: false, child: evt,
 })
 menuWin.connect("key-press-event", (_w, e) => {
     let k = 0; try { const r = e.get_keyval?.(); k = r ? r[1] : e.keyval } catch { k = e.keyval }
     const n = filtered.length
     if (k === Gdk.KEY_Escape) { if (query) { query = ""; applyFilter() } else closeWheel(); return true }
      if (k === Gdk.KEY_Up) { scrollTarget -= 1; const n = filtered.length; if (n <= VISIBLE) scrollTarget = Math.max(0, scrollTarget); beep(); animate(); return true }
      if (k === Gdk.KEY_Down) { scrollTarget += 1; const n = filtered.length; if (n <= VISIBLE) scrollTarget = Math.min(n - 1, scrollTarget); beep(); animate(); return true }
     if (k === Gdk.KEY_Return || k === Gdk.KEY_KP_Enter) { if (n) activate(filtered[mod(Math.round(scroll), n)]); return true }
     if (k === Gdk.KEY_BackSpace) { if (wheelCfg.searchable && query) { query = query.slice(0, -1); applyFilter() } return true }
     // any printable character → search querys
     const uni = Gdk.keyval_to_unicode(k)
     if (wheelCfg.searchable && uni >= 32 && uni < 0x10000) { query += String.fromCharCode(uni); applyFilter(); return true }
     return false
 })
 timeout(2500, () => loadApps())
 return menuWin
}
