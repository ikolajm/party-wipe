'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '@/components/providers/GameProvider';

/** How long the turn banner stays up. The action bar fades in as it clears. */
export const BANNER_MS = 1200;

/** Names whose turn it is, at the start of every turn. */
export function PhaseBanner() {
  const { state } = useGame();
  const [cleared, setCleared] = useState<string | null>(null);

  const combat = state.phase === 'combat' ? state.combat : null;
  const current = combat?.initiativeOrder[combat.currentTurnIndex];
  const entity = !combat || !current ? undefined
    : current.type === 'character'
      ? state.party.find(c => c.id === current.id)
      : combat.enemies.find(e => e.id === current.id);
  const turnKey = combat ? `${combat.roundNumber}-${combat.currentTurnIndex}` : null;

  useEffect(() => {
    if (!turnKey) return;
    const t = setTimeout(() => setCleared(turnKey), BANNER_MS);
    return () => clearTimeout(t);
  }, [turnKey]);

  // A fallen combatant's turn is skipped at once, so it gets no banner.
  const banner = entity && entity.isAlive && current && turnKey !== cleared
    ? { key: turnKey, name: entity.name, side: current.type === 'character' ? 'party' as const : 'enemy' as const }
    : null;

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.key}
          className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.span
            className={`font-heading text-[clamp(1.5rem,4vw,2.5rem)] uppercase tracking-widest ${
              banner.side === 'party' ? 'text-primary' : 'text-error'
            }`}
            initial={{ x: banner.side === 'party' ? -100 : 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: banner.side === 'party' ? 100 : -100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {banner.name}&rsquo;s turn
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
