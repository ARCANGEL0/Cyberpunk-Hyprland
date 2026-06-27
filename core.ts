// M a d e  b y:
// ╔═════════════════════════════════════════════════════════════════════════╗
// ║   ██████    ████████      ████████  ██      ██  ██            ██████    ║
// ║ ██ ░░░░░██  ██░░░░░░██  ██ ░░░░░░░░  ░██  ██ ░░ ██░         ██ ░░░░░██  ║
// ║ ██████████░ ████████ ░░ ██░            ░██ ░░   ██░         ██░     ██░ ║
// ║ ██░░░░░░██░ ██░░░░██░   ██░           ██ ░██    ██░         ██░     ██░ ║
// ║ ██░     ██░ ██░    ░██   ░████████  ██ ░░  ░██  ██████████   ░██████ ░░ ║
// ╚═════════════════════════════════════════════════════════════════════════╝ 
// ------------------------------------------------------------------------------------------
// -------------------------------------
// main file for AGS for building the Cyberpunk 2077 HUD and drawing widgets on screen similar to in-game hud. 
import { App, Window, Box } from "./widget.ts"
import { Anchor, Layer, Exclusivity } from "./widget.ts"
import { execAsync, timeout, interval } from "astal"
import AstalNotifd from "gi://AstalNotifd"
import Gdk from "gi://Gdk?version=3.0"
import { COMPONENTS_DIR, CYBER_DIR, SCREEN_WIDTH, SCREEN_HEIGHT } from "./env.ts"
import { Monitors } from "./components/modules/monitors.ts"
import { SidePanel, openCityModal } from "./components/modules/sidepanel.ts"
import { TopClockWindow } from "./components/modules/topclock.ts"
import { Toggles, HorizDock } from "./components/modules/dock.ts"
import { OsdWindow } from "./components/modules/osd.ts"
import { NotifPopupWindow } from "./components/modules/notifpopup.ts"
import {
 WsAnimWindow, triggerWsSwitch, BannerWindow, triggerShutter,
 RecWindow, RecGlitchWindow, setRecording, passthrough, registerHudWindows,
 isRecording, toggleHudDuringRec,
} from "./components/modules/anim.ts"
import { RegionWindow, triggerRegion } from "./components/modules/region.ts"
import { setTextHalo } from "./components/modules/proj.ts"
import { CModalWindows, toggleModal } from "./components/modules/cmodal.ts"
import { LauncherWindow } from "./components/modules/launcher.ts"
import { AppsMenuWindow, openAppsMenu } from "./components/modules/appsmenu.ts"
import { PlayerWindow, togglePlayer } from "./components/modules/player.ts"
import { NowPlayingWindow } from "./components/modules/nowplaying.ts"

const SCSS = `${COMPONENTS_DIR}/style/cyber.scss`
const CSS = `${COMPONENTS_DIR}/style/cyber.css`

const compileCss = async () => {
 try {
 await execAsync(["sassc", SCSS, CSS])
 App.apply_css(CSS, true)
 } catch (e) { print("[cyberpunk] sassc:", e) }
}
// ── surface factory + global list for the HUD windows ───────────────────────────────
const hudWins = []
const surface = (mon, name, anchor, child) => {
 const w = Window({
 name,
 className: `aug ${name}`,
 gdkmonitor: mon,
 anchor,
 exclusivity: Exclusivity.IGNORE,
 layer: Layer.BOTTOM,
 child: Box({ className: `aug-wrap ${name}-wrap`, child }),
 })
 hudWins.push(w)
 return w
}

let hudOnTop = false
// ── input shaping for click-through HUD windows ───────────────────────────────
const Cairo = (imports as any).cairo
const hudInputRegion = (win) => {
 try {
 const w = win.get_allocated_width?.() || 0, h = win.get_allocated_height?.() || 0
 if (w < 1 || h < 1) return null
 const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h)
 const cr = new Cairo.Context(surf)
 win.draw(cr)                                   // paint the HUD into surf so it can read which pixels are solid
 surf.flush()
 return Gdk.cairo_region_create_from_surface(surf)
 } catch (e) { print("[cyberpunk] hud region:", e); return null }
}
let winCache: any[] = []
let winKey = ""
const surfaceRect = (win) => {
 try {
 const aw = win.get_allocated_width?.() || 0, ah = win.get_allocated_height?.() || 0
 if (aw < 1 || ah < 1) return null
 const a = (win.anchor as any) | 0
 if (!a) return null
 let mx = 0, my = 0, mw = SCREEN_WIDTH, mh = SCREEN_HEIGHT      // window's own monitor rect, so overlap math works per-monitor
 try { const g = (win as any).gdkmonitor?.get_geometry?.(); if (g) { mx = g.x; my = g.y; mw = g.width; mh = g.height } } catch {}
 const L = !!(a & Anchor.LEFT), Rr = !!(a & Anchor.RIGHT), T = !!(a & Anchor.TOP), Bm = !!(a & Anchor.BOTTOM)
 const x = mx + ((L && Rr) ? 0 : Rr ? mw - aw : L ? 0 : Math.round((mw - aw) / 2))
 const y = my + ((T && Bm) ? 0 : Bm ? mh - ah : T ? 0 : Math.round((mh - ah) / 2))
 return { x, y, w: aw, h: ah }
 } catch { return null }
}
const winOverlaps = (win) => {
 const s = surfaceRect(win); if (!s) return false
 for (const r of winCache) {
 if (r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y) return true
 }
 return false
}
const applyHudInput = (win) => {
 try {
 const gw = win.get_window?.(); if (!gw) return
 if (hudOnTop) { gw.input_shape_combine_region(null, 0, 0); return }   // on top = take all input
 if (winOverlaps(win)) { gw.input_shape_combine_region(new Cairo.Region(), 0, 0); return }
 const r = hudInputRegion(win)
 gw.input_shape_combine_region(r || null, 0, 0)                        // tight shape; if it failed, null = whole rect
} catch {}
}
const applyHudInputAll = () => { for (const w of hudWins) applyHudInput(w) }
const refreshWins = () => Promise.all([execAsync(["hyprctl", "clients", "-j"]), execAsync(["hyprctl", "activeworkspace", "-j"])]).then(([co, wo]) => {
 try {
 const ws = JSON.parse(wo).id
 const next = JSON.parse(co).filter((c: any) => c && c.mapped && !c.hidden && c.workspace && c.workspace.id === ws && c.size && c.size[0] > 0 && c.at).map((c: any) => ({ x: c.at[0], y: c.at[1], w: c.size[0], h: c.size[1] }))
 const key = JSON.stringify(next)
 if (key !== winKey) { winKey = key; winCache = next; applyHudInputAll() }
 } catch {}
}).catch(() => {})

// ── toggle the whole HUD between top/bottom layers ───────────────────────────────
const toggleHudTop = () => {
 hudOnTop = !hudOnTop
 setTextHalo(hudOnTop) // add a dark halo behind text so it stays readable once it's over your windows
 const L = hudOnTop ? Layer.TOP : Layer.BOTTOM
 for (const w of hudWins) {
 try { if (typeof w.set_layer === "function") w.set_layer(L); else w.layer = L }
 catch (e) { print("[cyberpunk] hud layer:", e) }
 applyHudInput(w)        // redo the click-through shaping so it matches the layer we just moved to
 try { w.queue_draw() } catch {} // force a repaint right now so the halo shows up immediately
 }
}

// ── main app entry point ───────────────────────────────────────────────────────
// the app is basically just a message router -- it listens for requests from the widgets and routes them to the right handler function, which might be in a different module. the handlers do things like open the launcher, toggle recording, switch workspaces, etc. the main() function at the bottom sets up the surfaces and widgets and registers the handlers, and then it's mostly just event-driven from there.
App.start({
 instanceName: "cyberpunk",
 requestHandler(request, res) {
 const reply = (r) => { try { res(r) } catch {} }
 if (request === "launcher") {
 execAsync(["sh", "-c", "rofi -show drun || rofi -show run"]).catch(print)
 reply("ok")
 } else if (request === "apps-menu") { // apps launcher, mimicking Kiroshi scanner from game's UI plus sounds
 try { openAppsMenu() } catch (e) { print(e) }
 reply("ok")
 } else if (request === "player") { // toggles music player
 try { togglePlayer() } catch (e) { print(e) }
 reply("ok")
 } else if (request === "dismiss-notifs") { // obvious name 
 try {
 const nd = AstalNotifd.get_default()
 const list = Array.from((nd.get_notifications?.() ?? nd.notifications) ?? [])
 for (const n of list) { try { (n).dismiss() } catch {} }
 } catch (e) { print(e) }
 reply("ok")
 } else if (request.startsWith("ws-go ")) { // listens for "ws-go <workspace name>" requests from the workspace switcher widget and animte with that cyberpun glitch
 try { triggerWsSwitch(request.slice(6).trim()) } catch (e) { print(e) }
 reply("ok")
 } else if (request.startsWith("shutter")) { 
 try { triggerShutter(request.slice(7).trim()) } catch (e) { print(e) }
 reply("ok")
 } else if (request.startsWith("region-shot")) { // listens for screencapture requests from the region capture widget
 try { triggerRegion(request.slice(11).trim()) } catch (e) { print(e) }
 reply("ok")
 } else if (request.startsWith("modal ")) { // listens for "modal <name>" to toggle modals by name -- used for the weather and audio modals, and can be used for any future modals too without needing to add new handlers for them
 try { toggleModal(request.slice(6).trim()) } catch (e) { print(e) }
 reply("ok")
 } else if (request.startsWith("record-start")) {
 try { setRecording(true, request.slice(12).trim()) } catch (e) { print(e) }
 reply("ok")
 } else if (request === "record-stop") {
 try { setRecording(false) } catch (e) { print(e) }
 reply("ok")
 } else if (request === "toggle-hud") {
 try {
 // Toggle hud does two different things depending on context: if its recording,
 // the desktop HUD is hidden, so this just toggles it back on/off for the capture.
 // otherwise (normal use) it flips the whole HUD above/below your windows.
 if (isRecording()) { const shown = toggleHudDuringRec(); reply(shown ? "rec-hud-on" : "rec-hud-off") }
 else { toggleHudTop(); reply(hudOnTop ? "top" : "bottom") }
 } catch (e) { print(e); reply("err") }
 } else if (request === "weather") {
 try { openCityModal() } catch (e) { print(e) }
 reply("ok")
 } else reply("unknown request")
 },
 // in here is where we set up the surfaces and widgets and hand off the HUD windows to anim.ts so it can hide them during recording. 
 // e also set up the click-through shaping for the corner widgets here, which is important to do right away so they don't 
 // steal clicks from your windows before the first animation happens and applies the shape.
 main() {
 compileCss()
 // build the full corner HUD on every monitor so each screen gets its own copy
 for (const mon of (App as any).get_monitors()) {
 surface(mon, "monitors", Anchor.TOP | Anchor.LEFT, Monitors())
 surface(mon, "sidepanel", Anchor.TOP | Anchor.RIGHT, SidePanel())
 surface(mon, "hordock", Anchor.BOTTOM | Anchor.LEFT, HorizDock())
 surface(mon, "toggles", Anchor.BOTTOM | Anchor.LEFT, Toggles())
 hudWins.push(TopClockWindow(mon))
 hudWins.push(LauncherWindow(mon))
 }
 passthrough(OsdWindow())
 passthrough(NotifPopupWindow())
 NowPlayingWindow()
 WsAnimWindow()
 BannerWindow()
 RecWindow()
 RecGlitchWindow()
 RegionWindow()
 CModalWindows()
 AppsMenuWindow()
 PlayerWindow()
 registerHudWindows(hudWins)
 execAsync(["sh", "-c", `'${CYBER_DIR}/scripts/appvol-keeper'`]).catch(() => {})
 for (const w of hudWins) {
 try {
 w.connect("size-allocate", () => timeout(0, () => applyHudInput(w)))
 w.connect("map", () => timeout(0, () => applyHudInput(w)))
 } catch {}
 }
 timeout(400, applyHudInputAll); timeout(1200, applyHudInputAll)
 refreshWins(); interval(700, refreshWins)
 },
})
