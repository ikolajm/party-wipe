'use client';

import { useGame } from '@/components/providers/GameProvider';
import { HUD_SURFACE } from './hud';

/** The floor/room chip, top left. */
export function FloorChip({ className = 'top-3' }: { className?: string }) {
  const { state } = useGame();

  return (
    <div className={`absolute ${className} left-3 z-20`}>
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${HUD_SURFACE}`}>
        <span className="font-heading text-label-sm tracking-widest uppercase text-primary">Party Wipe</span>
        <span className="text-label-sm text-on-surface-variant">F{state.floor} · R{state.roomNumber}</span>
      </div>
    </div>
  );
}
