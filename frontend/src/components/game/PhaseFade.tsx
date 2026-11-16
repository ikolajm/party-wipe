'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

const FADE_S = 0.5;

// The exiting screen reads AnimatePresence's `custom`: true while walking, when
// the swap happens in the dark and an exit fade would show through the lift.
// It stays mounted for any fade, so it stops taking clicks at once.
const variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: FADE_S, ease: 'easeInOut' as const } },
  gone: (instant: boolean) => ({
    opacity: 0,
    pointerEvents: 'none' as const,
    transition: { duration: instant ? 0 : FADE_S, ease: 'easeInOut' as const },
  }),
};

/**
 * One full-screen phase (room preview, combat, loot, …), crossfading with the
 * phase before it. Used inside `<AnimatePresence custom={walking}>`, keyed per
 * screen. Walking between rooms goes through black instead, in FadeThrough.
 */
export function PhaseFade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0"
      variants={variants}
      initial="hidden"
      animate="shown"
      exit="gone"
    >
      {children}
    </motion.div>
  );
}
