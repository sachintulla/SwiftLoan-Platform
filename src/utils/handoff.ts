// Lightweight shared-element ("magic move") handoff between screens.
//
// The source screen (splash) records where a named element sits on screen; the
// destination screen animates its matching element IN from that recorded spot,
// so the element appears to travel across the navigation instead of the screens
// hard-cutting. Purely geometric (translate + scale via the native driver) — no
// navigation library needed for this hand-rolled router.
import { useCallback, useRef } from 'react';
import { Animated, View, type LayoutChangeEvent } from 'react-native';

type Rect = { x: number; y: number; width: number; height: number };

const sources: Record<string, Rect> = {};

/** Record a source element's on-screen rect (call after it has laid out). */
export function setHandoffSource(key: string, rect: Rect) {
  sources[key] = rect;
}

/** Measure a ref's window rect and record it as a handoff source. */
export function reportHandoffSource(key: string, ref: React.RefObject<View | null>) {
  const node = ref.current;
  if (!node) return;
  node.measureInWindow((x, y, width, height) => {
    if (width && height) setHandoffSource(key, { x, y, width, height });
  });
}

/**
 * Destination hook: attach `ref` + `onLayout` to a wrapper around the element,
 * and spread `style` onto it. On layout it measures its own target rect, reads
 * the recorded source rect for `key`, and springs the element from the source
 * position/scale to its natural spot. If no source was recorded it just fades in.
 */
export function useHandoffIn(key: string, opts?: { duration?: number }) {
  const ref = useRef<View>(null);
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const op = useRef(new Animated.Value(0)).current;
  const done = useRef(false);

  const onLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      if (done.current) return;
      const node = ref.current;
      const src = sources[key];
      if (!node) return;
      if (!src) {
        // No source recorded — just show it in place.
        done.current = true;
        op.setValue(1);
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        if (done.current || !w || !h) return;
        done.current = true;
        const targetCx = x + w / 2;
        const targetCy = y + h / 2;
        const srcCx = src.x + src.width / 2;
        const srcCy = src.y + src.height / 2;
        // Start at the source: offset to its centre + scaled to its size.
        tx.setValue(srcCx - targetCx);
        ty.setValue(srcCy - targetCy);
        sc.setValue(src.height / h);
        op.setValue(1);
        const cfg = { useNativeDriver: true, friction: 8, tension: 58 } as const;
        Animated.parallel([
          Animated.spring(tx, { toValue: 0, ...cfg }),
          Animated.spring(ty, { toValue: 0, ...cfg }),
          Animated.spring(sc, { toValue: 1, ...cfg }),
        ]).start();
        // Consume the source so a later unrelated mount doesn't reuse a stale rect.
        delete sources[key];
      });
    },
    [key, tx, ty, sc, op],
  );

  return {
    ref,
    onLayout,
    style: { opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] },
  };
}
