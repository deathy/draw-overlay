import { useEffect, useMemo, useRef } from 'preact/hooks';
import { applyKey, keyDistances, type Rgb } from '../lib/colorKey';

interface Props {
  pixels: ImageData;
  color: Rgb;
  tolerance: number;
  style: Record<string, string | number>;
}

/**
 * The overlay with one colour keyed out, drawn into a <canvas>. It takes the
 * plain <img>'s place and its `.overlay` class: a canvas sized by its width/height
 * attributes is a replaced element with the same intrinsic size and ratio, so the
 * layout fit — and therefore the placement transform — carries over unchanged.
 */
export function KeyedOverlay({ pixels, color, tolerance, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const out = useRef<ImageData | null>(null);
  // The expensive part, once per colour; tolerance changes reuse it.
  const distances = useMemo(() => keyDistances(pixels.data, color), [pixels, color]);

  useEffect(() => {
    // Slider input can fire faster than a large picture can be redrawn, so only
    // the latest value per frame is drawn.
    const frame = requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      if (out.current?.width !== pixels.width || out.current.height !== pixels.height) {
        out.current = new ImageData(pixels.width, pixels.height);
      }
      applyKey(pixels.data, distances, out.current.data, tolerance);
      ctx.putImageData(out.current, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [pixels, distances, tolerance]);

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
