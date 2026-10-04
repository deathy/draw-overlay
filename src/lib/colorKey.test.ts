import { describe, expect, it } from 'vitest';
import {
  applyKey,
  dominantColors,
  FEATHER,
  keyDistances,
  sameColor,
  toHex,
  type Pixels,
  type Rgb
} from './colorKey';

/** A 1-row image from a list of [colour, how many pixels] runs. */
function strip(runs: [Rgb, number, number?][]): Pixels {
  const width = runs.reduce((n, [, count]) => n + count, 0);
  const data = new Uint8ClampedArray(width * 4);
  let i = 0;
  for (const [[r, g, b], count, a = 255] of runs) {
    for (let j = 0; j < count; j++, i += 4) data.set([r, g, b, a], i);
  }
  return { width, height: 1, data };
}

describe('dominantColors', () => {
  it('ranks colours by how much of the picture they cover', () => {
    const px = strip([
      [[20, 20, 200], 300],
      [[255, 255, 255], 600],
      [[200, 20, 20], 100]
    ]);
    expect(dominantColors(px)).toEqual([
      [255, 255, 255],
      [20, 20, 200],
      [200, 20, 20]
    ]);
  });

  it('averages a noisy background into one swatch', () => {
    const px = strip([
      [[250, 250, 250], 100],
      [[254, 254, 254], 100],
      [[0, 0, 0], 10]
    ]);
    expect(dominantColors(px)[0]).toEqual([252, 252, 252]);
  });

  it('folds near-identical colours split across a bucket boundary', () => {
    // 127 and 128 land in different 4-bit buckets but are the same grey.
    const px = strip([
      [[127, 127, 127], 100],
      [[128, 128, 128], 90],
      [[0, 0, 0], 50]
    ]);
    expect(dominantColors(px)).toEqual([
      [127, 127, 127],
      [0, 0, 0]
    ]);
  });

  it('skips transparent pixels and colours too rare to matter', () => {
    const px = strip([
      [[0, 255, 0], 500, 0],
      [[255, 255, 255], 995],
      [[255, 0, 0], 5]
    ]);
    expect(dominantColors(px)).toEqual([[255, 255, 255]]);
  });

  it('stops at the requested count', () => {
    const px = strip([
      [[255, 0, 0], 40],
      [[0, 255, 0], 30],
      [[0, 0, 255], 20]
    ]);
    expect(dominantColors(px, 2)).toHaveLength(2);
  });
});

describe('applyKey', () => {
  const key: Rgb = [255, 255, 255];

  function alphaAt(color: Rgb, tolerance: number): number {
    const src = strip([[color, 1]]).data;
    const dst = new Uint8ClampedArray(4);
    applyKey(src, keyDistances(src, key), dst, tolerance);
    expect(Array.from(dst.slice(0, 3))).toEqual([...color]);
    return dst[3];
  }

  it('clears the key colour and anything within tolerance', () => {
    expect(alphaAt([255, 255, 255], 0)).toBe(0);
    expect(alphaAt([235, 235, 235], 40)).toBe(0); // distance ~34.6
  });

  it('leaves distant colours fully opaque', () => {
    expect(alphaAt([0, 0, 0], 40)).toBe(255);
    expect(alphaAt([200, 200, 200], 40)).toBe(255); // distance ~95, past the feather
  });

  it('fades linearly across the feather band', () => {
    // Pure blue channel offset: distance equals the offset exactly.
    const half = 40 + FEATHER / 2;
    expect(alphaAt([255, 255, 255 - half], 40)).toBe(128); // 255 * 0.5, rounded in the lookup table
  });

  it('keeps existing transparency', () => {
    const src = strip([[[0, 0, 0], 1, 100]]).data;
    const dst = new Uint8ClampedArray(4);
    applyKey(src, keyDistances(src, key), dst, 40);
    expect(dst[3]).toBe(100);
  });
});

describe('keyDistances', () => {
  it('measures RGB distance per pixel, capped at 255', () => {
    const px = strip([
      [[255, 255, 255], 1],
      [[255, 255, 225], 1],
      [[0, 0, 0], 1]
    ]);
    expect(Array.from(keyDistances(px.data, [255, 255, 255]))).toEqual([0, 30, 255]);
  });
});

describe('toHex', () => {
  it('formats as a 6-digit hex colour', () => {
    expect(toHex([255, 8, 0])).toBe('#ff0800');
  });
});

describe('sameColor', () => {
  it('compares by value and treats null as no match', () => {
    expect(sameColor([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameColor([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(sameColor(null, [1, 2, 3])).toBe(false);
  });
});
