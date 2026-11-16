'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

/** Each end of a walk: down to black, or back up to the new screen. */
export const FADE_THROUGH_MS = 1500;

/** The beat after a screen has fully arrived, before anything on it moves. */
export const ARRIVAL_BEAT_MS = 1500;

/**
 * Walking between screens. `through` fades to black, runs the change unseen,
 * and fades the new screen up; `leave` fades to black and stays there for a
 * route change, so the next page can fade up from the same black. The overlay
 * sits above the HUD, so nothing pops in over a dimming screen. It starts black
 * unless told otherwise, so a page arrives the way a room does.
 *
 * `settled` is true once the overlay has fully lifted; `revealed` from halfway
 * through the lift, for a screen's own entrance to start as the room comes up.
 */
export function useFadeThrough({ startDark = true }: { startDark?: boolean } = {}) {
  const [dark, setDark] = useState(false);
  const [settled, setSettled] = useState(!startDark);
  const [revealed, setRevealed] = useState(!startDark);
  const walking = useRef(false);

  useEffect(() => {
    if (!startDark) return;
    const t = setTimeout(() => setRevealed(true), FADE_THROUGH_MS / 2);
    return () => clearTimeout(t);
  }, [startDark]);

  // The screen being left keeps `revealed` until it is black, so it dims as it stands.
  const through = useCallback((change: () => void) => {
    if (walking.current) return;
    walking.current = true;
    setSettled(false);
    setDark(true);
    setTimeout(() => {
      setRevealed(false);
      change();
      setDark(false);
      setTimeout(() => setRevealed(true), FADE_THROUGH_MS / 2);
      setTimeout(() => { walking.current = false; }, FADE_THROUGH_MS);
    }, FADE_THROUGH_MS);
  }, []);

  const leave = useCallback((go: () => void) => {
    if (walking.current) return;
    walking.current = true;
    setSettled(false);
    setDark(true);
    setTimeout(go, FADE_THROUGH_MS);
  }, []);

  const overlay = (
    <motion.div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] bg-black ${settled ? 'pointer-events-none' : 'pointer-events-auto'}`}
      initial={{ opacity: startDark ? 1 : 0 }}
      animate={{ opacity: dark ? 1 : 0 }}
      transition={{ duration: FADE_THROUGH_MS / 1000, ease: 'easeInOut' }}
      onAnimationComplete={() => { if (!dark) setSettled(true); }}
    />
  );

  return { overlay, through, leave, settled, revealed };
}

/** True once `condition` has held for `ms`; false again as soon as it stops. */
export function useAfter(condition: boolean, ms: number) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!condition) return;
    const t = setTimeout(() => setDone(true), ms);
    return () => { clearTimeout(t); setDone(false); };
  }, [condition, ms]);
  return condition && done;
}
