import { Widget, App, Astal } from "astal/gtk3"
import Gdk from "gi://Gdk?version=3.0"
const W = Widget
export { App, Astal }

export const activeMonitor = () => {
 try {
 const d = Gdk.Display.get_default()
 const [, x, y] = d.get_default_seat().get_pointer().get_position()
 return d.get_monitor_at_point(x, y)
 } catch { return null }
}

export const monitorAtPoint = (x, y) => {
 try {
 const d = Gdk.Display.get_default()
 return d.get_monitor_at_point(x, y)
 } catch { return null }
}
export const Anchor = Astal.WindowAnchor
export const Layer = Astal.Layer
export const Exclusivity = Astal.Exclusivity
export const Keymode = Astal.Keymode
export const Box = (p) => new W.Box(p)
export const Button = (p) => new W.Button(p)
export const Label = (p) => new W.Label(p)
export const Icon = (p) => new W.Icon(p)
export const Window = (p) => new W.Window({ application: App, ...p })
export const EventBox = (p) => new W.EventBox(p)
export const Overlay = (p) => new W.Overlay(p)
export const Scrollable = (p) => new W.Scrollable(p)
export const Revealer = (p) => new W.Revealer(p)
export const Entry = (p) => new W.Entry(p)
export const Slider = (p) => new W.Slider(p)
export const DrawingArea = (p) => new W.DrawingArea(p)
export const CenterBox = (p) => new W.CenterBox(p)
