/**
 * Bar paths with a rounded *data end* and a square baseline end, so bars read as anchored to
 * the axis rather than floating.
 */

/** Vertical bar from baseline (bottom) up to `y`; the top corners are rounded. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    "Z",
  ].join("");
}

/** Horizontal bar from x0 (the zero line) to x1; the end at x1 is rounded. Works both ways. */
export function barPath(x0: number, x1: number, y: number, h: number, r = 4): string {
  const w = Math.abs(x1 - x0);
  if (w <= 0 || h <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  const dir = x1 >= x0 ? 1 : -1;
  const end = x1 - dir * rr;
  return [
    `M${x0},${y}`,
    `H${end}`,
    `Q${x1},${y} ${x1},${y + rr}`,
    `V${y + h - rr}`,
    `Q${x1},${y + h} ${end},${y + h}`,
    `H${x0}`,
    "Z",
  ].join("");
}
