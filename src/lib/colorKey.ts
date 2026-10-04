// Making one colour of the picture transparent — almost always its background,
// so only the subject sits over the paper instead of a tinted wash across it.
//
// This is the only place the picture's pixels are read, and only once the user
// asks for it: a thumbnail when the placement sheet opens (for the swatches), the
// full picture when a swatch is picked. All of it happens in this tab; nothing is
// uploaded or stored, and the buffers are dropped with the picture.

export type Rgb = readonly [number, number, number];

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Bits kept per channel for the histogram: 16 levels, 4096 buckets. */
const BITS = 4;
const SHIFT = 8 - BITS;
/** Swatches nearer than this (RGB distance) look like the same colour. */
const DISTINCT = 48;
/** A colour covering less of the picture than this isn't worth a swatch. */
const MIN_SHARE = 0.01;
/** How far past the tolerance pixels take to fade back in, so outlines stay smooth. */
export const FEATHER = 32;
/** Default and maximum tolerance, as RGB distance from the chosen colour. */
export const DEFAULT_TOLERANCE = 40;
export const MAX_TOLERANCE = 120;

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function sameColor(a: Rgb | null, b: Rgb | null): boolean {
  return a !== null && b !== null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function toCssColor(c: Rgb): string {
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/**
 * The picture's most common colours, most common first. A coarse histogram
 * groups JPEG noise and gentle gradients into one bucket; each swatch is the
 * true average of its bucket rather than the bucket's corner, and near-duplicate
 * buckets either side of a boundary are folded into the first.
 */
export function dominantColors(px: Pixels, count = 5): Rgb[] {
  const buckets = 1 << (BITS * 3);
  const hits = new Uint32Array(buckets);
  const sums = new Float64Array(buckets * 3);
  const d = px.data;
  let seen = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue; // already see-through: not a colour anyone sees
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const k = ((r >> SHIFT) << (2 * BITS)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);
    hits[k]++;
    sums[k * 3] += r;
    sums[k * 3 + 1] += g;
    sums[k * 3 + 2] += b;
    seen++;
  }
  const minHits = Math.max(1, seen * MIN_SHARE);
  const order: number[] = [];
  for (let k = 0; k < buckets; k++) if (hits[k] >= minHits) order.push(k);
  order.sort((a, b) => hits[b] - hits[a]);

  const out: Rgb[] = [];
  for (const k of order) {
    const n = hits[k];
    const c: Rgb = [
      Math.round(sums[k * 3] / n),
      Math.round(sums[k * 3 + 1] / n),
      Math.round(sums[k * 3 + 2] / n)
    ];
    if (out.some((o) => distance(o, c) < DISTINCT)) continue;
    out.push(c);
    if (out.length === count) break;
  }
  return out;
}

/**
 * Each pixel's distance from `key`, rounded and capped at 255 (well past any
 * tolerance plus feather). Worked out once per chosen colour, so dragging the
 * tolerance slider only has to re-run the cheap lookup in applyKey.
 */
export function keyDistances(src: Uint8ClampedArray, key: Rgb): Uint8Array {
  const [kr, kg, kb] = key;
  const out = new Uint8Array(src.length / 4);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    const dr = src[i] - kr;
    const dg = src[i + 1] - kg;
    const db = src[i + 2] - kb;
    out[p] = Math.min(255, Math.round(Math.sqrt(dr * dr + dg * dg + db * db)));
  }
  return out;
}

/**
 * Copy `src` into `dst`, clearing every pixel within `tolerance` of the key
 * colour and fading those up to FEATHER beyond it. A hard cut would leave a
 * jagged halo around anti-aliased outlines.
 */
export function applyKey(
  src: Uint8ClampedArray,
  distances: Uint8Array,
  dst: Uint8ClampedArray,
  tolerance: number
): void {
  // Alpha kept at each distance, as a fraction and pre-scaled for opaque pixels
  // (nearly all of them) so the common case is one table lookup.
  const keep = new Float32Array(256);
  const opaque = new Uint32Array(256);
  for (let d = 0; d < 256; d++) {
    keep[d] = Math.min(1, Math.max(0, (d - tolerance) / FEATHER));
    opaque[d] = Math.round(255 * keep[d]) << 24;
  }
  // Whole pixels at a time. RGBA bytes read as one little-endian word put alpha
  // in the top byte; every platform a browser runs on is little-endian.
  const s32 = new Uint32Array(src.buffer, src.byteOffset, distances.length);
  const d32 = new Uint32Array(dst.buffer, dst.byteOffset, distances.length);
  for (let p = 0; p < s32.length; p++) {
    const v = s32[p];
    const a = v >>> 24;
    const out = a === 255 ? opaque[distances[p]] : Math.round(a * keep[distances[p]]) << 24;
    d32[p] = ((v & 0xffffff) | out) >>> 0;
  }
}

/**
 * Decode a picture into pixels, shrunk so its long edge is at most `maxEdge`.
 * Drawing an <img> applies EXIF orientation, same as the overlay itself shows it.
 */
export async function readPixels(url: string, maxEdge: number): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
