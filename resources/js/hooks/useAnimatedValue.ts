import { useEffect, useRef, useState } from "react";

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that counts up from 0 when it first appears and then tweens
 * smoothly whenever `target` changes (so a live refresh never "jumps").
 * Skips straight to the final value for reduced-motion users and when printing.
 */
export function useAnimatedNumber(target: number, ms = 900, delay = 0): number {
  const safe = Number.isFinite(target) ? target : 0;
  const [val, setVal] = useState(() => (prefersReducedMotion() ? safe : 0));
  const cur = useRef(val);
  const targetRef = useRef(safe);
  targetRef.current = safe;

  useEffect(() => {
    if (prefersReducedMotion() || cur.current === safe) {
      cur.current = safe;
      setVal(safe);
      return;
    }
    const from = cur.current;
    let raf = 0;
    let started = 0;
    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!started) started = now;
        const p = Math.min(1, (now - started) / ms);
        cur.current = from + (safe - from) * easeOutCubic(p);
        setVal(cur.current);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, cur.current === 0 ? delay : 0);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [safe, ms, delay]);

  // Never print a half-counted number.
  useEffect(() => {
    const done = () => { cur.current = targetRef.current; setVal(targetRef.current); };
    window.addEventListener("beforeprint", done);
    return () => window.removeEventListener("beforeprint", done);
  }, []);

  return val;
}

/** 0 → 1 once, on mount (eased). Used for "draw in" reveals; later data changes do not replay it. */
export function useReveal(ms = 1100, delay = 0): number {
  const [p, setP] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion()) { setP(1); return; }
    let raf = 0;
    let started = 0;
    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!started) started = now;
        const t = Math.min(1, (now - started) / ms);
        setP(easeOutCubic(t));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    const done = () => setP(1);
    window.addEventListener("beforeprint", done);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeprint", done);
    };
  }, [ms, delay]);

  return p;
}

/** false on the first paint, true right after -- lets CSS width/height transitions grow from zero. */
export function useEntered(): boolean {
  const [on, setOn] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (on) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setOn(true)); });
    const done = () => setOn(true);
    window.addEventListener("beforeprint", done);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); window.removeEventListener("beforeprint", done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return on;
}
