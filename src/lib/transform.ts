// Placement of the reference picture over the camera feed.
//
// The overlay <img> is centred in the stage by layout (`inset: 0; margin: auto`)
// and sized with `max-width/height: 100%`, so the *identity* transform already
// means "fitted and centred" and `scale: 1` is a meaningful baseline rather than
// an arbitrary pixel ratio. Everything here therefore works in one frame:
// offsets from the stage centre, in CSS pixels.

export interface Point {
  x: number;
  y: number;
}

export interface Transform {
  /** Screen offset of the image centre from the stage centre, in CSS px. */
  x: number;
  y: number;
  /** Uniform scale. 1 = the fitted size. */
  scale: number;
  /** Clockwise rotation in radians. Accumulates; not wrapped. */
  rotation: number;
  /** Mirrored horizontally. Applied before rotation. */
  mirrored: boolean;
}

export const IDENTITY: Transform = { x: 0, y: 0, scale: 1, rotation: 0, mirrored: false };

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 20;

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/**
 * Wrap to [-PI, PI), so a gesture crossing the +/-PI seam turns the short way
 * instead of spinning the image most of a full turn. Which end of the range an
 * exact half-turn lands on is arbitrary — a 180-degree twist has no direction.
 */
export function wrapAngle(rad: number): number {
  const t = ((rad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return t - Math.PI;
}

/** Rotation as a 0..359 degree readout for the UI. */
export function rotationDegrees(t: Transform): number {
  const deg = Math.round((t.rotation * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

/**
 * Re-anchor a transform so that whatever sits under `pivot` stays under it
 * while the image is scaled by `k` and turned by `dTheta`, then shift the whole
 * thing by `pan`.
 *
 * This is what makes a two-finger gesture feel like the paper is being moved
 * rather than driven: without the pivot term the image jumps to centre-scale
 * and the point between your fingers slides away.
 */
export function applyGesture(
  base: Transform,
  pivot: Point,
  k: number,
  dTheta: number,
  pan: Point
): Transform {
  const scale = clampScale(base.scale * k);
  // Honour the clamp in the pivot maths too, so pinching past the limit doesn't
  // keep translating the image while its size stays put.
  const effectiveK = scale / base.scale;
  const cos = Math.cos(dTheta);
  const sin = Math.sin(dTheta);
  const vx = base.x - pivot.x;
  const vy = base.y - pivot.y;
  return {
    x: pivot.x + effectiveK * (vx * cos - vy * sin) + pan.x,
    y: pivot.y + effectiveK * (vx * sin + vy * cos) + pan.y,
    scale,
    rotation: base.rotation + dTheta,
    mirrored: base.mirrored
  };
}

export interface Grip {
  a: Point;
  b: Point | null;
}

export interface GestureDelta {
  pivot: Point;
  k: number;
  dTheta: number;
  pan: Point;
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/**
 * Reduce "where the fingers were" + "where they are now" to a single delta.
 * One finger pans; two fingers pan, pinch and twist at once.
 */
export function gestureDelta(start: Grip, now: Grip): GestureDelta {
  if (!start.b || !now.b) {
    return {
      pivot: start.a,
      k: 1,
      dTheta: 0,
      pan: { x: now.a.x - start.a.x, y: now.a.y - start.a.y }
    };
  }
  const c0 = mid(start.a, start.b);
  const c1 = mid(now.a, now.b);
  const d0 = dist(start.a, start.b);
  const d1 = dist(now.a, now.b);
  // Two pointers landing on the same pixel would divide by zero; treat a
  // degenerate start span as "no scale information".
  const k = d0 > 1 ? d1 / d0 : 1;
  return {
    pivot: c0,
    k,
    dTheta: wrapAngle(angle(now.a, now.b) - angle(start.a, start.b)),
    pan: { x: c1.x - c0.x, y: c1.y - c0.y }
  };
}

/** The CSS `transform` value for the overlay image. */
export function toCss(t: Transform): string {
  const parts = [
    `translate(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px)`,
    `rotate(${t.rotation.toFixed(5)}rad)`,
    `scale(${t.scale.toFixed(5)})`
  ];
  if (t.mirrored) parts.push('scaleX(-1)');
  return parts.join(' ');
}

export interface Size {
  width: number;
  height: number;
}

/** Within this ratio of square, a shape has no orientation worth matching. */
const SQUARE_TOLERANCE = 1.05;

function orientation({ width, height }: Size): 'portrait' | 'landscape' | 'square' {
  if (width > height * SQUARE_TOLERANCE) return 'landscape';
  if (height > width * SQUARE_TOLERANCE) return 'portrait';
  return 'square';
}

/**
 * The starting placement for a freshly loaded picture: fitted and centred, and
 * turned a quarter clockwise when its orientation disagrees with the stage's — a
 * landscape photo on an upright phone would otherwise be a thin strip across the
 * middle. `natural` is the picture's size as displayed (browsers apply EXIF
 * orientation to naturalWidth/Height already).
 *
 * The scale is relative to the identity fit, which the layout computes for the
 * *unrotated* picture and never enlarges past natural size; the turned picture
 * keeps that same never-enlarge rule.
 */
export function autoOrient(natural: Size, stage: Size): Transform {
  const pic = orientation(natural);
  const view = orientation(stage);
  if (pic === 'square' || view === 'square' || pic === view) return IDENTITY;
  const fit = Math.min(1, stage.width / natural.width, stage.height / natural.height);
  const shownW = natural.width * fit;
  const shownH = natural.height * fit;
  // Turned, the picture's height runs across the stage and its width down it.
  const scale = Math.min(stage.width / shownH, stage.height / shownW, 1 / fit);
  return { ...IDENTITY, scale: clampScale(scale), rotation: Math.PI / 2 };
}
