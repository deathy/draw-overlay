import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { applyKey, keyDistances, type Rgb } from '../lib/colorKey';

interface Props {
  pixels: ImageData;
  color: Rgb;
  tolerance: number;
  style: Record<string, string | number>;
  /** No 2D context — iOS refuses once its canvas memory budget is spent. */
  onUnavailable(): void;
}

/**
 * The overlay with one colour keyed out, drawn into a <canvas>. It takes the
 * plain <img>'s place and its `.overlay` class: a canvas sized by its width/height
 * attributes is a replaced element with the same intrinsic size and ratio, so the
 * layout fit — and therefore the placement transform — carries over unchanged.
 */
export function KeyedOverlay({ pixels, color, tolerance, style, onUnavailable }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const out = useRef<ImageData | null>(null);
  // The expensive part, once per colour; tolerance changes reuse it.
  const distances = useMemo(() => keyDistances(pixels.data, color), [pixels, color]);
  // What's on the canvas now, so the deferred redraw can tell it has nothing to do.
  const drawn = useRef<{ distances: Uint8Array; tolerance: number } | null>(null);

  const draw = (tol: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) {
      onUnavailable();
      return;
    }
    if (out.current?.width !== pixels.width || out.current.height !== pixels.height) {
      out.current = new ImageData(pixels.width, pixels.height);
    }
    applyKey(pixels.data, distances, out.current.data, tol);
    ctx.putImageData(out.current, 0, 0);
    drawn.current = { distances, tolerance: tol };
  };

  // A new picture or colour is drawn before paint: the <img> it replaces is
  // already gone, and a deferred first draw would blink the overlay out.
  useLayoutEffect(() => draw(tolerance), [pixels, distances]);

  // Slider input can fire faster than a large picture can be redrawn, so only
  // the latest value per frame is drawn.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const d = drawn.current;
      if (d?.distances !== distances || d.tolerance !== tolerance) draw(tolerance);
    });
    return () => cancelAnimationFrame(frame);
  }, [distances, tolerance]);

  // Hand the backing store back on the way out instead of waiting for GC: iOS
  // counts detached canvases against its budget until they're collected.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) canvas.width = canvas.height = 0;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      class="overlay"
      width={pixels.width}
      height={pixels.height}
      style={style}
    />
  );
}
