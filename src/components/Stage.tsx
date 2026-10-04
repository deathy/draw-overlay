import { useEffect, useRef } from 'preact/hooks';
import type { Rgb } from '../lib/colorKey';
import {
  applyGesture,
  gestureDelta,
  toCss,
  type Grip,
  type Point,
  type Transform
} from '../lib/transform';
import { KeyedOverlay } from './KeyedOverlay';

interface Props {
  videoRef: { current: HTMLVideoElement | null };
  imageUrl: string | null;
  /** When set, the picture is drawn with this colour made transparent. */
  keyed: {
    pixels: ImageData;
    color: Rgb;
    tolerance: number;
    onUnavailable(): void;
  } | null;
  transform: Transform;
  opacity: number;
  locked: boolean;
  onTransform(next: Transform): void;
  onTapFocus(xNorm: number, yNorm: number): void;
}

/** How far a pointer may wander and still count as a tap rather than a drag. */
const TAP_SLOP_PX = 8;

interface ActiveGesture {
  ids: number[];
  grip: Grip;
  base: Transform;
  /** Stage rect captured once per gesture — it can't change mid-gesture. */
  rect: DOMRect;
}

export function Stage({
  videoRef,
  imageUrl,
  keyed,
  transform,
  opacity,
  locked,
  onTransform,
  onTapFocus
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const order = useRef<number[]>([]);
  const gesture = useRef<ActiveGesture | null>(null);
  const moved = useRef(false);
  // The live transform. Gestures read the value they started from here rather
  // than from props, so a render lagging a frame behind can't rewind the drag.
  const current = useRef(transform);
  current.current = transform;

  // Offsets from the stage centre, matching the frame src/lib/transform.ts works in.
  const toStage = (rect: DOMRect, clientX: number, clientY: number): Point => ({
    x: clientX - rect.left - rect.width / 2,
    y: clientY - rect.top - rect.height / 2
  });

  const gripFor = (ids: number[]): Grip => ({
    a: pointers.current.get(ids[0])!,
    b: ids.length > 1 ? pointers.current.get(ids[1])! : null
  });

  // Re-seat the gesture against the pointers that are down right now. Called on
  // every touch/lift so that adding or removing a finger continues smoothly from
  // where the image currently is, instead of snapping back to the first grip.
  const reseat = () => {
    const ids = order.current.slice(0, 2);
    if (!ids.length || !stageRef.current) {
      gesture.current = null;
      return;
    }
    gesture.current = {
      ids,
      grip: gripFor(ids),
      base: current.current,
      rect: stageRef.current.getBoundingClientRect()
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (locked || !imageUrl) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // The pointer can already be gone by the time we get here; capture is an
      // optimisation (it keeps a drag alive past the stage edge), not a
      // requirement, so carry on without it.
    }
    pointers.current.set(e.pointerId, toStage(rect, e.clientX, e.clientY));
    if (!order.current.includes(e.pointerId)) order.current.push(e.pointerId);
    if (order.current.length === 1) moved.current = false;
    reseat();
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const p = toStage(g.rect, e.clientX, e.clientY);
    const prev = pointers.current.get(e.pointerId)!;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0) {
      const start = g.grip.a;
      if (Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP_PX) moved.current = true;
    }
    pointers.current.set(e.pointerId, p);
    if (!g.ids.includes(e.pointerId)) return;
    const d = gestureDelta(g.grip, gripFor(g.ids));
    onTransform(applyGesture(g.base, d.pivot, d.k, d.dTheta, d.pan));
  };

  const endPointer = (e: PointerEvent) => {
    const wasSingleTap = order.current.length === 1 && !moved.current;
    pointers.current.delete(e.pointerId);
    order.current = order.current.filter((id) => id !== e.pointerId);
    reseat();
    if (wasSingleTap) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) {
        onTapFocus(
          (e.clientX - rect.left) / rect.width,
          (e.clientY - rect.top) / rect.height
        );
      }
    }
  };

  // While locked the overlay must not intercept anything, but a tap should still
  // re-focus the lens — the paper moves, hands cast shadows, focus drifts.
  const onLockedTap = (e: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    onTapFocus((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  // A gesture can't survive the pointers being forgotten, so drop state whenever
  // the lock flips rather than resuming a half-finished drag later.
  useEffect(() => {
    pointers.current.clear();
    order.current = [];
    gesture.current = null;
  }, [locked, imageUrl]);

  return (
    <div
      class="stage"
      ref={stageRef}
      onPointerDown={locked ? undefined : onPointerDown}
      onPointerMove={locked ? undefined : onPointerMove}
      onPointerUp={locked ? onLockedTap : endPointer}
      onPointerCancel={locked ? undefined : endPointer}
    >
      <video class="feed" ref={videoRef} playsInline muted autoPlay />
      {imageUrl && keyed && (
        <KeyedOverlay {...keyed} style={{ transform: toCss(transform), opacity }} />
      )}
      {imageUrl && !keyed && (
        <img
          class="overlay"
          src={imageUrl}
          alt=""
          draggable={false}
          style={{ transform: toCss(transform), opacity }}
        />
      )}
    </div>
  );
}
