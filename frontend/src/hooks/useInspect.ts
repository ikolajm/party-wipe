'use client';

import { useState } from 'react';
import { useGame } from '@/components/providers/GameProvider';
import type { Character, Enemy } from '@/data/game-types';

/** The entity open in the inspect sheet, read live from game state */
export function useInspect() {
  const { state } = useGame();
  const [target, setTarget] = useState<{ id: string; type: 'character' | 'enemy' } | null>(null);

  const inspecting: Character | Enemy | null = !target ? null
    : target.type === 'character'
      ? state.party.find(c => c.id === target.id) ?? null
      : state.combat?.enemies.find(e => e.id === target.id) ?? null;

  return {
    inspecting,
    selectTarget: (id: string, type: 'character' | 'enemy') => setTarget({ id, type }),
    closeInspect: () => setTarget(null),
  };
}
