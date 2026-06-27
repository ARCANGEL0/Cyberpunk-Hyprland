import GLib from "gi://GLib"
import GdkPixbuf from "gi://GdkPixbuf"
import Gtk from "gi://Gtk?version=3.0"
import Gdk from "gi://Gdk?version=3.0"
import { Variable } from "astal"

// ── Paths ───────────────────────────────────────────────────────────────
export const HOME = GLib.get_home_dir()
export const CYBER_DIR = `${HOME}/.config/hypr/themes/cyberpunk`
export const COMPONENTS_DIR = `${CYBER_DIR}/components`
export const STYLE_CSS = `${COMPONENTS_DIR}/style/cyber.css`
const ASSETS_BASE = `${CYBER_DIR}/assets`
const display = Gdk.Display.get_default()!
const monitor = display.get_primary_monitor() ?? display.get_monitor(0)!
const geo = monitor.get_geometry()
export const SCREEN_WIDTH = geo.width
export const SCREEN_HEIGHT = geo.height
export const dark = Variable(false)
export const assetsDir = () => `${ASSETS_BASE}/${dark.get() ? "dark" : "light"}`
export async function get_cursor() {
 const { execAsync } = await import("astal")
 const res = await execAsync("hyprctl cursorpos")
 const parts = res.trim().split(",").map(Number)
 return [parts[0], parts[1]]
}

export const arradd = (w: any, cls: string) => {
 if (!w) return
 let ctx = null
 try { ctx = w.get_style_context?.() } catch {}
 if (!ctx) return
 try {
 if (!ctx.has_class(cls)) ctx.add_class(cls)
 } catch {}}

export const arrremove = (w: any, cls: string) => {
 if (!w) return 
 try { w.get_style_context?.()?.remove_class(cls) } catch {}}
export const hasclass = (w: any, cls: string) => {
 if (!w) return false
 try { return !!w.get_style_context?.()?.has_class(cls) } catch {}
 return false
}

export const setclasses = (w: any, classes: string[]) => {
 if (!w) return
 let ctx = null
 try { ctx = w.get_style_context?.() } catch {}
 if (!ctx) return
 try {
 ctx.list_classes?.()?.forEach((c) => ctx.remove_class(c))
 classes.forEach(c => ctx.add_class(c))
 } catch {}
}

// ── math helprs ────────────────────────────────────────────────────────
export const rand_int = (a, b) =>
 Math.round(Math.random() * (b - a) + a)
