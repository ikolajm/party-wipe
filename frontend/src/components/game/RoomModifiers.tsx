'use client';

import { useState } from 'react';
import { useGame } from '@/components/providers/GameProvider';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/atoms/Accordion';

/**
 * The modifiers in effect during combat, top right, opposite the floor chip.
 * Each opens to its rule; Escape closes an open one.
 */
export function RoomModifiers({ className = 'top-3' }: { className?: string }) {
  const { state } = useGame();
  const [open, setOpen] = useState('');
  const modifiers = state.phase === 'combat' && state.floorModifier ? [state.floorModifier] : [];
  if (modifiers.length === 0) return null;

  return (
    <div className={`absolute ${className} right-3 z-20 w-64 flex flex-col gap-2 px-3 py-2 rounded-card bg-black/50 backdrop-blur-sm border border-outline-subtle`}>
      <span className="text-label-sm font-semibold uppercase tracking-widest text-on-surface-variant">Floor modifiers</span>
      <Accordion
        type="single"
        collapsible
        value={open}
        onValueChange={setOpen}
        onKeyDown={e => { if (e.key === 'Escape' && open) setOpen(''); }}
        className="border-0 bg-transparent gap-1"
      >
        {modifiers.map(m => (
          <AccordionItem key={m.id} value={m.id} className="rounded-component bg-surface-2 overflow-hidden">
            <AccordionTrigger size="sm" className="hover:bg-surface-3 px-3 py-2 focus-visible:ring-inset">
              <span className="text-body-sm font-medium text-on-surface text-left">{m.name}</span>
            </AccordionTrigger>
            <AccordionContent size="sm" className="px-3 py-2">
              <p className="text-body-sm text-on-surface-variant leading-relaxed">{m.description}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
