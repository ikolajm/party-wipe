'use client';

import { Sheet, SheetContent } from '@/components/atoms/Sheet';
import { CharacterInspect } from './CharacterInspect';
import { EnemyInspect } from './EnemyInspect';
import type { Character, Enemy } from '@/data/game-types';

export function InspectSheet({ inspecting, onClose }: {
  inspecting: Character | Enemy | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!inspecting} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" size="lg" className="overflow-y-auto">
        {inspecting && ('monsterIndex' in inspecting
          ? <EnemyInspect enemy={inspecting} />
          : <CharacterInspect char={inspecting} />)}
      </SheetContent>
    </Sheet>
  );
}
