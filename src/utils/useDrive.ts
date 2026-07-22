import { useEffect, useRef, useState } from 'react';

/**
 * Drives a value 0 → 1 over `dur` ms using easeOutCubic, mirroring the design's
 * `_drive(key, dur)` count-up animations (credit score, repay %, hero stats, …).
 */
export function useDrive(dur: number, run: boolean = true): number {
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number>(0);

  useEffect(() => {
    if (!run) {
      setT(1);
      return;
    }
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    setT(0);
    start.current = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - start.current) / dur);
      setT(ease(p));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [dur, run]);

  return t;
}
