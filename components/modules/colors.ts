export type RGB = readonly [number, number, number]

export const NEON = {
 red: [255, 42, 58] as RGB,
 cyan: [94, 244, 248] as RGB,
 magenta: [228, 50, 200] as RGB,
 green: [80, 240, 150] as RGB,
 amber: [255, 178, 36] as RGB,
 blue: [60, 120, 255] as RGB,
 white: [225, 232, 242] as RGB,
 dim: [80, 80, 100] as RGB,
 grid: [40, 50, 70] as RGB,
}

export const f = (c: RGB): [number, number, number] =>
 [c[0] / 255, c[1] / 255, c[2] / 255]

export const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
