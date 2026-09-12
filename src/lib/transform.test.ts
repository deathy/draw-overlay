import { describe, expect, it } from 'vitest';
import {
  applyGesture,
  clampScale,
  gestureDelta,
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  rotationDegrees,
  toCss,
  wrapAngle,
  type Point,
  type Transform
} from './transform';

/** Where an image-local point (offset from the image centre) lands on screen. */
function mapPoint(t: Transform, p: Point): Point {
  const sx = (t.mirrored ? -p.x : p.x) * t.scale;
  const sy = p.y * t.scale;
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return { x: t.x + sx * cos - sy * sin, y: t.y + sx * sin + sy * cos };
}

/** The image-local point currently sitting under a given screen point. */
function unmapPoint(t: Transform, s: Point): Point {
  const dx = s.x - t.x;
  const dy = s.y - t.y;
  const cos = Math.cos(-t.rotation);
  const sin = Math.sin(-t.rotation);
  const rx = (dx * cos - dy * sin) / t.scale;
  const ry = (dx * sin + dy * cos) / t.scale;
  return { x: t.mirrored ? -rx : rx, y: ry };
}

describe('wrapAngle', () => {
  it('leaves small angles alone', () => {
    expect(wrapAngle(0.3)).toBeCloseTo(0.3, 12);
  });

  it('wraps a gesture that crosses the seam to the short way round', () => {
    // Fingers turning from just under +PI to just over -PI is a few degrees of
    // twist, not a 350-degree spin.
    const raw = -Math.PI + 0.05 - (Math.PI - 0.05);
    expect(wrapAngle(raw)).toBeCloseTo(0.1, 12);
  });

  it('puts an exact half-turn at the low end of the range', () => {
    // [-PI, PI): the endpoint choice is arbitrary, but it must be consistent.
    expect(wrapAngle(Math.PI)).toBeCloseTo(-Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(-Math.PI, 12);
  });

  it('stays inside the range for large inputs', () => {
    for (const a of [7, -7, 100, -100, 3 * Math.PI]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThan(Math.PI);
    }
  });
});

describe('clampScale', () => {
  it('holds the limits', () => {
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });
});

describe('applyGesture', () => {
  it('pans by the drag distance', () => {
    const t = applyGesture(IDENTITY, { x: 10, y: 10 }, 1, 0, { x: 30, y: -12 });
    expect(t.x).toBeCloseTo(30, 12);
    expect(t.y).toBeCloseTo(-12, 12);
    expect(t.scale).toBe(1);
    expect(t.rotation).toBe(0);
  });

  it('keeps the point under the pivot fixed while pinching and twisting', () => {
    const base: Transform = { x: 40, y: -25, scale: 1.3, rotation: 0.4, mirrored: false };
    const pivot: Point = { x: -60, y: 90 };
    const held = unmapPoint(base, pivot);

    const next = applyGesture(base, pivot, 1.75, -0.6, { x: 0, y: 0 });

    const after = mapPoint(next, held);
    expect(after.x).toBeCloseTo(pivot.x, 9);
    expect(after.y).toBeCloseTo(pivot.y, 9);
  });

  it('keeps the pivot fixed for a mirrored image too', () => {
    const base: Transform = { x: -15, y: 70, scale: 0.8, rotation: -1.2, mirrored: true };
    const pivot: Point = { x: 120, y: 35 };
    const held = unmapPoint(base, pivot);

    const next = applyGesture(base, pivot, 0.6, 0.9, { x: 0, y: 0 });

    const after = mapPoint(next, held);
    expect(after.x).toBeCloseTo(pivot.x, 9);
    expect(after.y).toBeCloseTo(pivot.y, 9);
  });

  it('carries the pan on top of the pivot-anchored zoom', () => {
    const base: Transform = { x: 0, y: 0, scale: 1, rotation: 0, mirrored: false };
    const pivot: Point = { x: 50, y: 0 };
    const withoutPan = applyGesture(base, pivot, 2, 0, { x: 0, y: 0 });
    const withPan = applyGesture(base, pivot, 2, 0, { x: 7, y: -3 });
    expect(withPan.x - withoutPan.x).toBeCloseTo(7, 12);
    expect(withPan.y - withoutPan.y).toBeCloseTo(-3, 12);
  });

  it('stops translating once the scale clamp is hit', () => {
    // Pinching wildly past MAX_SCALE must not keep dragging the image off-screen.
    const base: Transform = { x: 0, y: 0, scale: MAX_SCALE, rotation: 0, mirrored: false };
    const next = applyGesture(base, { x: 100, y: 0 }, 4, 0, { x: 0, y: 0 });
    expect(next.scale).toBe(MAX_SCALE);
    expect(next.x).toBeCloseTo(0, 12);
  });

  it('preserves the mirror flag', () => {
    const base: Transform = { ...IDENTITY, mirrored: true };
    expect(applyGesture(base, { x: 0, y: 0 }, 2, 1, { x: 5, y: 5 }).mirrored).toBe(true);
  });
});

describe('gestureDelta', () => {
  it('treats a single pointer as pure pan', () => {
    const d = gestureDelta({ a: { x: 0, y: 0 }, b: null }, { a: { x: 25, y: 40 }, b: null });
    expect(d).toEqual({ pivot: { x: 0, y: 0 }, k: 1, dTheta: 0, pan: { x: 25, y: 40 } });
  });

  it('reads a symmetric spread as scale about the midpoint', () => {
    const start = { a: { x: -50, y: 0 }, b: { x: 50, y: 0 } };
    const now = { a: { x: -100, y: 0 }, b: { x: 100, y: 0 } };
    const d = gestureDelta(start, now);
    expect(d.k).toBeCloseTo(2, 12);
    expect(d.dTheta).toBeCloseTo(0, 12);
    expect(d.pan).toEqual({ x: 0, y: 0 });
    expect(d.pivot).toEqual({ x: 0, y: 0 });
  });

  it('reads a quarter turn of the finger axis as 90 degrees', () => {
    const start = { a: { x: -50, y: 0 }, b: { x: 50, y: 0 } };
    const now = { a: { x: 0, y: -50 }, b: { x: 0, y: 50 } };
    const d = gestureDelta(start, now);
    expect(d.dTheta).toBeCloseTo(Math.PI / 2, 12);
    expect(d.k).toBeCloseTo(1, 12);
  });

  it('reports a moving midpoint as pan', () => {
    const start = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
    const now = { a: { x: 20, y: 10 }, b: { x: 120, y: 10 } };
    const d = gestureDelta(start, now);
    expect(d.pan.x).toBeCloseTo(20, 12);
    expect(d.pan.y).toBeCloseTo(10, 12);
    expect(d.k).toBeCloseTo(1, 12);
  });

  it('ignores scale from a degenerate (zero-span) start grip', () => {
    const start = { a: { x: 10, y: 10 }, b: { x: 10, y: 10 } };
    const now = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } };
    expect(gestureDelta(start, now).k).toBe(1);
  });
});

describe('rotationDegrees', () => {
  it('reports a positive 0..359 readout', () => {
    expect(rotationDegrees({ ...IDENTITY, rotation: Math.PI })).toBe(180);
    expect(rotationDegrees({ ...IDENTITY, rotation: -Math.PI / 2 })).toBe(270);
    expect(rotationDegrees({ ...IDENTITY, rotation: 4 * Math.PI })).toBe(0);
  });
});

describe('toCss', () => {
  it('emits translate/rotate/scale in that order', () => {
    expect(toCss(IDENTITY)).toBe('translate(0.00px, 0.00px) rotate(0.00000rad) scale(1.00000)');
  });

  it('appends the mirror only when set', () => {
    expect(toCss({ ...IDENTITY, mirrored: true })).toContain('scaleX(-1)');
    expect(toCss(IDENTITY)).not.toContain('scaleX');
  });
});
