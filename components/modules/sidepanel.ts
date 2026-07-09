// top-right minimap + weather panel, cyberpunk 2077 style.
// small osm map with red frame, a compass marker and geo coords,
// then a weather bar with 7 day forecast based on  open-meteo api, change if needed to something
// else like wttr.in if desired. right-click con widget shows modal to changes the city.
import { Box, DrawingArea, EventBox } from "../../widget.ts"
import Gdk from "gi://Gdk?version=3.0"
import GLib from "gi://GLib"
import { interval, execAsync } from "astal"
import { CYBER_DIR } from "../../env.ts"
import { makePlane, tiltText, strokePath, fillQuad, alertChip } from "./proj.ts"
import { NEON } from "./colors.ts"
import { createModal } from "./cmodal.ts"
import { txt as gtxt, pango as gpango, RED, RACC, HEADER as GHEAD, TITLE as GTITLE, MONO as GMONO } from "./glass.ts"

const Cairo = (imports).cairo

import { TITLE, MONO, ICONF } from "./fonts.ts"
const NETCOL: [number, number, number] = [255, 222, 105]
const PGREEN: [number, number, number] = [176, 255, 157]
const W = 320, H = 530
const MAP_DX = 100
const minimapBase = makePlane({ w: W, h: H, yaw: 24, pitch: 3, roll: -1, focal: 1300, dist: 1300, pad: 0 })
const minimap = {
 ...minimapBase,
 project: (u, v) => {
 const [x, y] = minimapBase.project(u, v)
 return [x + MAP_DX, y]
 },
 width: minimapBase.width + MAP_DX,
}
const plane = makePlane({ w: W, h: H, yaw: 24, pitch: 2, roll: -2, focal: 4600, dist: 4200, pad: 42 })


const CONN_DX = 0, CONN_DY = -60
const connBase = makePlane({ w: W, h: H, yaw: 34, pitch: -12, roll: 6, focal: 4600, dist: 4200, pad: 42 })
const connPlane = {
 ...connBase,
 project: (u, v) => { const [x, y] = connBase.project(u, v); return [x + CONN_DX, y + CONN_DY] as [number, number] },
}
const ICON_DX = 0, ICON_DY = 0
const iconBase = makePlane({ w: W, h: H, yaw: 34, pitch: -12, roll: 6, focal: 4600, dist: 4200, pad: 42 })
const iconPlane = {
 ...iconBase,
 project: (u, v) => { const [x, y] = iconBase.project(u, v); return [x + CONN_DX + ICON_DX, y + CONN_DY + ICON_DY] as [number, number] },
}
const pad2 = (n) => String(n).padStart(2, "0")
const WD3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
const ch = (c) => String.fromCharCode(c)
const WXI = { sun: ch(0xe30d), part: ch(0xe302), cloud: ch(0xe312), rain: ch(0xe318), snow: ch(0xe31a), storm: ch(0xe31d), fog: ch(0xe313) }
const wxIcon = (desc) => {
 const d = desc.toLowerCase()
 if (/thunder|storm/.test(d)) return WXI.storm
 if (/snow|sleet|ice|blizzard/.test(d)) return WXI.snow
 if (/rain|drizzle|shower/.test(d)) return WXI.rain
 if (/fog|mist|haze/.test(d)) return WXI.fog
 if (/part|few/.test(d)) return WXI.part
 if (/cloud|overcast/.test(d)) return WXI.cloud
 return WXI.sun
}

// live state
let geoCity = "NEW YORK", geoCoords = "40.713°N 74.006°W", geoOK = true // default is new york
let geoLat = 40.7128, geoLon = -74.006, mapTile = null, mapVer = 0 // map point = weather city + small random offset
let wxLat = 40.7128, wxLon = -74.006, wxName = "NEW YORK", wxFull = "NEW YORK" // weather location, default NYC
let wxTemp = "--°", wxDesc = "—", wxFeels = "--°", wxHum = "--", wxWind = "--"
let netName = "OFFLINE"   // "WiFi: <SSID>" | "Ethernet <n>" | "OFFLINE"
const refreshNet = () => {
 // wifi ssid first, else first connected ethernet, else OFFLINE
 execAsync(["sh", "-c", "iwgetid -r 2>/dev/null | sed 's/^/WiFi: /' | grep . || nmcli -t -f TYPE,STATE device 2>/dev/null | awk -F: '$1==\"ethernet\" && $2==\"connected\"{c++; print \"Ethernet \" c; exit}' | grep . || echo OFFLINE"])
     .then((o) => { const s = (o || "").trim(); netName = s || "OFFLINE"; areas.forEach(a => a?.queue_draw()) })
     .catch(() => { netName = "OFFLINE" })
}
let netUp = "0.0", netDown = "0.0"
let _prx = -1, _ptx = 0, _pnt = 0
const readProc = (p) => { try { const [ok, d] = GLib.file_get_contents(p); return ok ? new TextDecoder().decode(d) : "" } catch { return "" } }
const netIface = () => { for (const l of readProc("/proc/net/route").split("\n").slice(1)) { const p = l.split(/\s+/); if (p[1] === "00000000" && p[0]) return p[0] } return "" }
const netCounters = (iface) => { const l = readProc("/proc/net/dev").split("\n").find(x => x.trim().startsWith(iface + ":")); if (!l) return [0, 0]; const p = l.split(":")[1].trim().split(/\s+/).map(Number); return [p[0], p[8]] }
const mbpsFmt = (bps) => { const m = bps * 8 / 1e6; return m >= 100 ? m.toFixed(0) : m.toFixed(1) }
const refreshNetSpeed = () => {
 const iface = netIface()
 const now = GLib.get_monotonic_time()
 const [rx, tx] = iface ? netCounters(iface) : [0, 0]
 if (_prx >= 0 && _pnt > 0) { const dt = Math.max(1e-6, (now - _pnt) / 1e6); netDown = mbpsFmt(Math.max(0, (rx - _prx) / dt)); netUp = mbpsFmt(Math.max(0, (tx - _ptx) / dt)) }
 _prx = rx; _ptx = tx; _pnt = now
 areas.forEach(a => a?.queue_draw())
}
const WMO = { 0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm" }
const forecast: { day: string; hi: string; lo: string; code: number; pop: number }[] = []
let areas: any[] = []

// map point follows the city saved from weather, and gets a random location (This theme doesnt track ur location, chill)
const ro = () => (Math.random() - 0.5) * 0.055 // about 3km random offset
const setMapPoint = (rerandom) => {
 if (rerandom) { geoLat = wxLat + ro(); geoLon = wxLon + ro() }
 geoCoords = `${Math.abs(geoLat).toFixed(3)}°${geoLat >= 0 ? "N" : "S"} ${Math.abs(geoLon).toFixed(3)}°${geoLon >= 0 ? "E" : "W"}`
 geoCity = wxFull; geoOK = true
 areas.forEach(a => a?.queue_draw()); fetchMap()
}

// save the city to disk so it stays after a restart
const WX_STORE = `${CYBER_DIR}/city.json`
const saveWxLocation = () => {
 try { GLib.file_set_contents(WX_STORE, new TextEncoder().encode(JSON.stringify({ name: wxName, full: wxFull, lat: wxLat, lon: wxLon, mapLat: geoLat, mapLon: geoLon }))) } catch (e) { print("[cyber] wx save:", e) }
}
const loadWxLocation = () => {
 try {
 const [ok, data] = GLib.file_get_contents(WX_STORE)
 if (ok) {
 const o = JSON.parse(new TextDecoder().decode(data))
 if (typeof o.lat === "number" && typeof o.lon === "number") {
 wxLat = o.lat; wxLon = o.lon; wxName = String(o.name || wxName); wxFull = String(o.full || o.name || wxName)
 if (typeof o.mapLat === "number" && typeof o.mapLon === "number") { geoLat = o.mapLat; geoLon = o.mapLon; setMapPoint(false) }
 else setMapPoint(true)
 return
 }
 }
 } catch {}
 setMapPoint(true) // nothing saved yet, random spot near NYC default
}

// download 3x3 osm tiles around the point, merge them and tint dark
const fetchMap = async () => {
 try {
 const z = 16, nn = 2 ** z
 const xt = Math.floor((geoLon + 180) / 360 * nn)
 const lr = geoLat * Math.PI / 180
 const yt = Math.floor((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * nn)
 const dir = "/tmp/aug-tiles", dl: string[] = []
 for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
 dl.push(`curl -sf --retry 3 --retry-delay 1 --retry-all-errors --max-time 15 -A 'cyberpunk-hud/1.0 (linux desktop)' 'https://a.basemaps.cartocdn.com/dark_nolabels/${z}/${xt + dx}/${yt + dy}.png' -o ${dir}/t${dl.length}.png`)
 await execAsync(["sh", "-c", `mkdir -p ${dir} && ${dl.join(" && ")}`])
 await execAsync(["sh", "-c", `magick montage ${dir}/t0.png ${dir}/t1.png ${dir}/t2.png ${dir}/t3.png ${dir}/t4.png ${dir}/t5.png ${dir}/t6.png ${dir}/t7.png ${dir}/t8.png -tile 3x3 -geometry +0+0 -background black ${dir}/grid.png && magick ${dir}/grid.png -modulate 108,42 /tmp/aug-map.png`])
 mapTile = Cairo.ImageSurface.createFromPNG("/tmp/aug-map.png"); mapVer++
 areas.forEach(a => a?.queue_draw())
 } catch (e) { print("[cyber] map:", e) }
}
const refreshWeather = async () => {
 try {
 const url = `https://api.open-meteo.com/v1/forecast?latitude=${wxLat}&longitude=${wxLon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto`
 const j = JSON.parse(await execAsync(["curl", "-sf", "--max-time", "9", url]))
 const c = j.current
 if (c) { wxTemp = `${Math.round(c.temperature_2m)}°`; wxFeels = `${Math.round(c.apparent_temperature)}°`; wxDesc = WMO[c.weather_code] || "—"; wxHum = `${Math.round(c.relative_humidity_2m)}`; wxWind = `${Math.round(c.wind_speed_10m)}` }
 const dd = j.daily; forecast.length = 0
 if (dd && dd.time) for (let i = 0; i < dd.time.length && i < 7; i++) {
 const dt = new Date(dd.time[i] + "T12:00:00")
 forecast.push({ day: WD3[dt.getDay()], hi: `${Math.round(dd.temperature_2m_max[i])}°`, lo: `${Math.round(dd.temperature_2m_min[i])}°`, code: c.weather_code?.[i] ?? 0, pop: c.precipitation_probability_max?.[i] ?? 0 })
 }
 } catch (e) { wxDesc = "OFFLINE" }
 areas.forEach(a => a?.queue_draw())
}

// square map shape: big bevel on bottom-left, small notch on the left
const MX0 = 14, MY0 = 50, MX1 = W - 14, MY1 = 318
const BLV = 10
// notch knobs: NTW = depth, NTY0/NTY1 = top/bottom position, NDD = corner slope
const NTY1 = MY0 + (MY1 - MY0) * 0.74, NTY0 = MY0 + (MY1 - MY0) * 0.24, NTW = 5, NDD = 8
const MAP_SHAPE = [
 [MX0, MY0], [MX1, MY0], [MX1, MY1], // top-left, top-right, bottom-right
 [MX0 + BLV, MY1], [MX0, MY1 - BLV], // bottom-left bevel
 [MX0, NTY1], [MX0 + NTW, NTY1 - NDD], [MX0 + NTW, NTY0 + NDD], [MX0, NTY0],// small middle-left notch
]
// fake building boxes, fixed layout (same every run)
const BUILDINGS: [number, number, number, number][] = (() => {
 const b: [number, number, number, number][] = []; let s = 91
 const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647 }
 for (let gy = MY0 + 12; gy < MY1 - 30; gy += 40)
 for (let gx = MX0 + 12; gx < MX1 - 36; gx += 52) {
 if (rnd() < 0.18) continue
 b.push([gx + rnd() * 10, gy + rnd() * 8, 26 + rnd() * 28, 18 + rnd() * 20])
 }
 return b
})()
const clipMap = (ctx) => {
 ctx.newPath(); MAP_SHAPE.map(([u, v]: [number, number]) => minimap.project(u, v)).forEach(([x, y]: [number, number], i: number) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip()
}
// draws the static map: tiles or fake buildings, red frame, coords. cached.
const drawMapStatic = (ctx) => {
 const cx = (MX0 + MX1) / 2, cy = (MY0 + MY1) / 2
 ctx.save(); clipMap(ctx) // clip everything to the map shape
 if (mapTile) {
 // fit the osm tile image into the projected map box
 const c = MAP_SHAPE.map(([u, v]) => minimap.project(u, v)), xs = c.map(p => p[0]), ys = c.map(p => p[1])
 const mnx = Math.min(...xs), mxx = Math.max(...xs), mny = Math.min(...ys), mxy = Math.max(...ys)
 const tw = mapTile.getWidth(), th = mapTile.getHeight()
 ctx.save(); ctx.translate(mnx, mny); ctx.scale((mxx - mnx) / tw, (mxy - mny) / th)
 ctx.setSourceSurface(mapTile, 0, 0); try { ctx.getSource().setFilter(1) } catch {}; ctx.paint(); ctx.restore()
 fillQuad(ctx, minimap, MX0, MY0, MX1, MY1, [6, 7, 10], 0.16)
 } else {
 fillQuad(ctx, minimap, MX0, MY0, MX1, MY1, [14, 8, 10], 0.87)
 for (const [bx, by, bw, bh] of BUILDINGS) {
 strokePath(ctx, minimap, [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]], NEON.white, 0.32, 1, true)
 if (((bx + by) | 0) % 3 === 0) strokePath(ctx, minimap, [[bx + bw * 0.5, by], [bx + bw * 0.5, by + bh]], NEON.white, 0.18, 1)
 }
 }
 ctx.restore()
 strokePath(ctx, minimap, MAP_SHAPE, [81, 104, 111], 0.25, 1.4, true)
 strokePath(ctx, minimap, MAP_SHAPE, [81, 104, 111], 1, 0.9, true)
 // coordinates
 tiltText(ctx, minimap, MX1 - 8, MY1 - 10, geoCoords, MONO, 8, geoOK ? NEON.cyan : NEON.red, 0.55, { align: "r" })
}
// compass marker on top of the cache, this part animates.
// shape is a small cyan "A": two legs plus a little v bar in the middle
const drawCompassScan = (ctx, tick) => {
 const px = 150 + Math.sin(tick / 30) * 3, py = 216 + Math.cos(tick / 36) * 2
 const legs = [[px - 6, py + 6], [px, py - 7], [px + 6, py + 6]] // the two legs of the A
 const bar = [[px - 3.3, py], [px, py + 3.5], [px + 3.3, py]]    // crossbar, small v pointing down
 strokePath(ctx, minimap, legs, NEON.cyan, 0.3, 3.5)
 strokePath(ctx, minimap, bar, NEON.cyan, 0.3, 3.5)
 strokePath(ctx, minimap, legs, NEON.cyan, 0.95, 1.5)
 strokePath(ctx, minimap, bar, NEON.cyan, 0.9, 1.3)
}
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const ordDay = (d) => { const j = d % 10, k = d % 100; return d + (j === 1 && k !== 11 ? "st" : j === 2 && k !== 12 ? "nd" : j === 3 && k !== 13 ? "rd" : "th") }
const fmtDate = (now) => `${ordDay(now.getDate())} ${MON3[now.getMonth()]}, ${now.getFullYear()}`
// text layer: header, weather, forecast, connection. also cached.
const drawOverlay = (ctx, now) => {
 tiltText(ctx, minimap, MX0 + 8, MY0 + 10, "55S.441.20", MONO, 7, NEON.cyan, 0.34)
 tiltText(ctx, minimap, MX1, MY0 - 5, (geoCity || "NIGHT CITY").slice(0, 32), TITLE, 9, PGREEN, 0.9, { align: "r", bold: true, glow: 0.4 })
  const tstr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
 const tcx = MX0 + 4, tcy = MY0 - 7
 tiltText(ctx, minimap, tcx, tcy, tstr, TITLE, 18.1, [130, 231, 215], 0.92, { bold: true, glow: 0.82,extraRotate: 0.01  })
 tiltText(ctx, minimap, MX0 + 14, MY1 - 14, wxIcon(wxDesc), ICONF, 10, NETCOL, 0.95, { bold: true, glow: 0.3 })
 tiltText(ctx, minimap, MX0 + 30, MY1 - 14, `${wxDesc.toUpperCase()} · ${wxTemp}`, TITLE, 9.5, NETCOL, 0.92, { bold: true, glow: 0.3 })
 tiltText(ctx, minimap, MX0 + 2, MY1 + 16, `FEELS LIKE ${wxFeels} · HUM ${wxHum}% · WIND ${wxWind}`, MONO, 6.6, NEON.cyan, 0.52, { bold: true })
 tiltText(ctx, minimap, MX1, MY1 + 16, fmtDate(now), MONO, 9.5, NETCOL, 0.9, { bold: true, align: "r", glow: 0.38 })
 const fy = MY1 + 36
 fillQuad(ctx, minimap, MX0 - 2, fy - 8, MX1 + 2, fy + 70, [0, 0, 0], 0.012)
 strokePath(ctx, minimap, [[MX0 + 2, fy + 5], [MX1 - 2, fy + 5]], NETCOL, 0.16, 5)
 strokePath(ctx, minimap, [[MX0 + 2, fy + 5], [MX1 - 2, fy + 5]], NETCOL, 0.62, 1)
 tiltText(ctx, minimap, MX0, fy, "7-DAY FORECAST", TITLE, 9, NETCOL, 0.85, { bold: true, glow: 0.32 })
 tiltText(ctx, minimap, MX1, fy, "RIGHT-CLICK \u25B8 CITY", MONO, 7, NEON.cyan, 0.38, { align: "r" })
 const span = (MX1 - MX0) / 7
 for (let i = 0; i < 7; i++) {
 const cx = MX0 + i * span + span / 2, d = forecast[i], today = i === 0
 if (today) fillQuad(ctx, minimap, MX0 + i * span + 1, fy + 8, MX0 + (i + 1) * span - 1, fy + 66, NETCOL, 0.1)
 tiltText(ctx, minimap, cx, fy + 20, d ? d.day : "--", TITLE, 9, today ? NETCOL : NEON.white, today ? 0.97 : 0.6, { align: "c", bold: true, glow: today ? 0.3 : 0 })
 tiltText(ctx, minimap, cx, fy + 37, d ? wxIcon(WMO[d.code] || "") : "", ICONF, 13, today ? NETCOL : NEON.cyan, 0.85, { align: "c" })
 tiltText(ctx, minimap, cx, fy + 51, d ? d.hi : "--", MONO, 10, today ? NETCOL : NEON.white, 0.9, { align: "c", bold: true })
 tiltText(ctx, minimap, cx, fy + 63, d ? d.lo : "--", MONO, 8, NEON.cyan, 0.5, { align: "c" })
 }
 // connection status: red header, alert chip, then ssid/type
 // amber when connected, red when offline
 const ny = fy + 121, dx = 72
 const off = !netName || netName === "OFFLINE"
 const stxt = off ? "OFFLINE!" : netName
 tiltText(ctx, connPlane, MX0 - 16 + dx, ny, "NETWORK STATUS", TITLE, 14, NETCOL, 1, { bold: true, glow: 0.22, bloom: 0.45, shadow: 1 })
 alertChip(ctx, iconPlane, MX0 + 6 + dx, ny + 11, NETCOL, 0.8)
 tiltText(ctx, connPlane, MX0 + 26 + dx, ny + 22, stxt, TITLE, 14, NETCOL, 0.95, { bold: true, glow: off ? 0.22 : 0.1, bloom: 0.45, shadow: 1 })
}
const drawNetSpeed = (ctx) => {
 const fy = MY1 + 65, ny = fy + 91, ux = MX0 + 276
 tiltText(ctx, connPlane, ux - 70, ny - 1, "", ICONF, 9, NEON.cyan, 0.95, { bold: true, align: "r" })
 tiltText(ctx, connPlane, ux - 25, ny - 1, `${netUp} Mbps`, MONO, 8.5, NEON.cyan, 0.92, { bold: true, align: "r", glow: 0.3 })
 tiltText(ctx, connPlane, ux - 50, ny + 22, "", ICONF, 9, NEON.red, 0.95, { bold: true, align: "r" })
 tiltText(ctx, connPlane, ux - 8, ny + 22, `${netDown} Mbps`, MONO, 8.5, NEON.red, 0.92, { bold: true, align: "r", glow: 0.3 })
}
let cache = null, cacheKey = ""

export const SidePanel = () => {
 ensureWxModal()
 loadWxLocation(); refreshWeather()
 interval(1_800_000, refreshWeather)
 refreshNet(); interval(15_000, refreshNet)
 refreshNetSpeed(); interval(1000, refreshNetSpeed)
 const area = DrawingArea({}); areas.push(area); area.set_size_request(plane.width, plane.height)
 try { mapTile = Cairo.ImageSurface.createFromPNG("/tmp/aug-map.png"); mapVer++ } catch {} // load last saved map png right away
 let tick = 0
 area.connect("draw", (_w, ctx) => {
 const now = new Date()
 // cache the whole static widget, rebuild only when minute or data changes
 const key = `${mapVer}|${pad2(now.getHours())}${pad2(now.getMinutes())}|${wxName}|${wxTemp}|${wxDesc}|${wxFeels}|${geoCoords}|${geoCity}|${wxHum}|${wxWind}|${netName}|${forecast.map(f => f.hi + f.lo).join("")}`
 if (!cache || cacheKey !== key) {
 cacheKey = key
 cache = new Cairo.ImageSurface(Cairo.Format.ARGB32, plane.width, plane.height)
 const cx = new Cairo.Context(cache)
 drawMapStatic(cx); drawOverlay(cx, now)
 }
 ctx.setSourceSurface(cache, 0, 0); ctx.paint()
 drawCompassScan(ctx, tick) // only the compass animates
 drawNetSpeed(ctx)          // live up/down speeds
 return false
 })
 let lastCk = ""
 const t = interval(120, () => { tick++; const ck = Math.round(Math.sin(tick / 30) * 3) + "," + Math.round(Math.cos(tick / 36) * 2); if (ck !== lastCk) { lastCk = ck; area.queue_draw() } })
 area.connect("destroy", () => t.cancel())

 // right-click opens the city modal
 const evt = EventBox({ child: Box({ className: "side-panel", children: [area] }) })
 try { evt.add_events(Gdk.EventMask.BUTTON_PRESS_MASK) } catch {}
 evt.connect("button-press-event", (_w, e) => {
 let btn = 0
 try { btn = e.get_button?.()[1] ?? 0 } catch {}
 if (btn === 3) openCityModal()
 return false
 })
 return evt
}

// city search modal, red glass style. type a name, geocodes via open-meteo
let wxModal: any = null
let wxQuery = "", wxResults: any[] = [], wxHint = "TYPE A CITY ▸", wxScroll = 0
let wxSearchTimer: number | null = null
const aPath = (ctx, x, y, w, h, c = 5) => { ctx.newPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); ctx.closePath() }

const wxRunSearch = async () => {
 const q = wxQuery.trim()
 if (q.length < 2) { wxResults = []; wxHint = "TYPE A CITY ▸"; wxModal?.requestDraw(); return }
 wxHint = "SEARCHING…"; wxModal?.requestDraw()
 try {
 const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
 const data = JSON.parse(await execAsync(["curl", "-sf", "--max-time", "6", url]))
 wxResults = (data.results || []).map((r) => ({ lat: r.latitude, lon: r.longitude, name: r.name, full: [r.name, r.admin1, r.country].filter(Boolean).join(", ") }))
 wxHint = wxResults.length ? `${wxResults.length} MATCHES — CLICK ONE` : "NO MATCHES"
 } catch (e) { wxHint = "SEARCH FAILED"; print("[cyber] geocode:", e) }
 wxScroll = 0; wxModal?.requestDraw()
}
const wxQueueSearch = () => { if (wxSearchTimer !== null) GLib.source_remove(wxSearchTimer); wxSearchTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 340, () => { wxSearchTimer = null; wxRunSearch().catch(print); return false }) }
const wxPick = (r) => { wxLat = r.lat; wxLon = r.lon; wxName = String(r.name || "").toUpperCase(); wxFull = r.full.toUpperCase(); setMapPoint(true); saveWxLocation(); refreshWeather(); wxModal.close() }

const ensureWxModal = () => {
 if (wxModal) return
 wxModal = createModal({
 name: "weather", tabTitle: "WEATHER UPLINK", W: 384, H: 312, hud: true, col: RED, accent: RACC,
 onOpen: () => { wxQuery = ""; wxResults = []; wxHint = "TYPE A CITY ▸"; wxScroll = 0 },
 onKey: (k) => {
 if (k === Gdk.KEY_BackSpace) wxQuery = wxQuery.slice(0, -1)
 else { const u = Gdk.keyval_to_unicode(k); if (u >= 32 && u < 0x10000) wxQuery += String.fromCharCode(u); else return }
 wxQueueSearch(); wxModal.requestDraw()
 },
 onScroll: (d) => { wxScroll = Math.max(0, Math.min(Math.max(0, wxResults.length - 1), wxScroll + d)); wxModal.requestDraw() },
 draw: (ctx, g) => {
 const x = g.X + 18, w = g.w - 36
 gtxt(ctx, x + w - 4 - ctx.textExtents(`NOW: ${wxName}`).width, g.Y + GHEAD + 22, `NOW: ${wxName}`, GMONO, 9, RED, 0.6)
 gtxt(ctx, x, g.Y + GHEAD + 22, "SEARCH FORECAST CITY", GMONO, 10, RED, 0.85, 1)
 const by = g.Y + GHEAD + 32, bh = 30
 aPath(ctx, x, by, w, bh, 6); ctx.setSourceRGBA(RED[0] * 0.12, RED[1] * 0.06, RED[2] * 0.06, 0.5); ctx.fill()
 aPath(ctx, x, by, w, bh, 6); ctx.setSourceRGBA(RED[0], RED[1], RED[2], 0.85); ctx.setLineWidth(0.9); ctx.stroke()
 const cur = (Math.floor(Date.now() / 450) % 2) ? "▌" : " "
 gpango(ctx, x + 14, by + bh / 2 + 5, (wxQuery ? wxQuery + cur : "Search a city…"), GTITLE, false, 13, wxQuery ? RACC : RED, wxQuery ? 0.96 : 0.4)
 gtxt(ctx, x, by + bh + 18, "// " + wxHint, GMONO, 9, RED, 0.6)
 const ly = by + bh + 28, lh = (g.Y + g.h) - ly - 22, rowH = 30, gap = 5, step = rowH + gap, vis = Math.max(1, Math.floor(lh / step))
 const maxS = Math.max(0, wxResults.length - vis), sc = Math.min(wxScroll, maxS)
 ctx.save(); ctx.rectangle(x - 2, ly - 2, w + 4, lh + 4); ctx.clip()
 for (let i = 0; i <= vis; i++) {
 const idx = sc + i; if (idx >= wxResults.length) break
 const r = wxResults[idx], ry = ly + i * step; if (ry + rowH > ly + lh + step) break
 aPath(ctx, x, ry, w, rowH, 5); ctx.setSourceRGBA(RED[0] * 0.16, RED[1] * 0.08, RED[2] * 0.08, 0.34); ctx.fill()
 aPath(ctx, x, ry, w, rowH, 5); ctx.setSourceRGBA(RED[0], RED[1], RED[2], 0.6); ctx.setLineWidth(0.9); ctx.stroke()
 gpango(ctx, x + 14, ry + rowH / 2 + 4, r.full, GTITLE, true, 11, RACC, 0.95)
 g.push({ kind: "row", bx0: x, by0: ry, bx1: x + w, by1: ry + rowH, on: () => wxPick(r) })
 }
 ctx.restore()
 gtxt(ctx, x, g.Y + g.h - 10, "type ▸ click a result · ESC cancels", GMONO, 8, RED, 0.42)
 },
 })
}
export const openCityModal = () => { ensureWxModal(); wxModal.toggle() }
