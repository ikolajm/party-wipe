'use client';

import React, { useState, useEffect } from 'react';
import { useGame } from '@/components/providers/GameProvider';
import { Scroll, ChevronUp } from 'lucide-react';
import { motion } from 'motion/react';
import { HUD_SURFACE } from './hud';
import { DAMAGE_VISUALS } from '@/data/damage-visuals';
import { CONDITION_VISUALS } from '@/data/condition-visuals';

const KEYWORD_COLORS: Record<string, string> = {
  // Damage types — every entry of DAMAGE_VISUALS
  fire:        DAMAGE_VISUALS.fire.color,
  cold:        DAMAGE_VISUALS.cold.color,
  lightning:   DAMAGE_VISUALS.lightning.color,
  thunder:     DAMAGE_VISUALS.thunder.color,
  acid:        DAMAGE_VISUALS.acid.color,
  necrotic:    DAMAGE_VISUALS.necrotic.color,
  radiant:     DAMAGE_VISUALS.radiant.color,
  force:       DAMAGE_VISUALS.force.color,
  slashing:    DAMAGE_VISUALS.slashing.color,
  piercing:    DAMAGE_VISUALS.piercing.color,
  bludgeoning: DAMAGE_VISUALS.bludgeoning.color,
  // Conditions — pulled from the visual registry
  paralyzed:   CONDITION_VISUALS.paralyzed.color,
  unconscious: CONDITION_VISUALS.unconscious.color,
  restrained:  CONDITION_VISUALS.restrained.color,
  poisoned:    CONDITION_VISUALS.poisoned.color,
  frightened:  CONDITION_VISUALS.frightened.color,
  staggered:   CONDITION_VISUALS.staggered.color,
  burning:     CONDITION_VISUALS.burning.color,
  frozen:      CONDITION_VISUALS.frozen.color,
  // Keywords
  'CRIT': 'var(--qualifier-crit)', 'critical': 'var(--qualifier-crit)',
};

const KEYWORD_PATTERN = new RegExp(
  `\\b(${Object.keys(KEYWORD_COLORS).join('|')})\\b`,
  'gi'
);

function colorizeLog(message: string, partyNames: string[], enemyNames: string[]): React.ReactNode {
  const allNames = [...partyNames, ...enemyNames].filter(n => n.length > 0);
  // Combined pattern: names + keywords
  const namePattern = allNames.length > 0
    ? new RegExp(`(${allNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
    : null;

  // First pass: split by names
  const nameParts = namePattern ? message.split(namePattern) : [message];

  return nameParts.map((part, i) => {
    if (partyNames.includes(part)) return <span key={i} style={{ color: 'var(--primary)' }} className="font-semibold">{part}</span>;
    if (enemyNames.includes(part)) return <span key={i} style={{ color: 'var(--error)' }} className="font-semibold">{part}</span>;

    // Second pass: highlight keywords within non-name parts
    const keyParts = part.split(KEYWORD_PATTERN);
    return <span key={i}>{keyParts.map((kp, j) => {
      const lower = kp.toLowerCase();
      const kwColor = KEYWORD_COLORS[lower];
      if (kwColor) return <span key={j} style={{ color: kwColor }}>{kp}</span>;
      return kp;
    })}</span>;
  });
}

const TYPE_INDICATOR: Record<string, { color: string; dot: string }> = {
  combat: { color: 'text-on-surface-variant', dot: 'bg-on-surface-variant/40' },
  death:  { color: 'text-error', dot: 'bg-error' },
  system: { color: 'text-primary', dot: 'bg-primary' },
  loot:   { color: 'text-success', dot: 'bg-success' },
  levelup: { color: 'text-primary', dot: 'bg-primary' },
};

export function GameLog() {
  const { state } = useGame();
  const [expanded, setExpanded] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const partyNames = state.party.map(c => c.name);
  const enemyNames = state.combat?.enemies.map(e => e.name) || [];
  const recentLogs = state.log.slice(-3);
  const allLogs = state.log.slice(-50);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.log.length, expanded]);

  const shown = expanded ? allLogs : recentLogs;

  return (
    <motion.div
      layout
      transition={{ duration: 0.2 }}
      // 272px keeps it clear of the action bar, which starts 300px in at 1280 wide.
      className={`absolute bottom-4 left-4 z-20 w-[272px] flex flex-col rounded-card overflow-hidden ${HUD_SURFACE}`}
    >
      {/* Header — the whole row opens and closes the full log */}
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="flex items-center gap-2 px-3 py-2 border-b border-outline-subtle/50 bg-transparent cursor-pointer text-left hover:bg-white/5 transition-colors"
      >
        <Scroll className="size-3.5 text-on-surface-variant" />
        <span className="text-label-sm font-semibold uppercase tracking-widest text-on-surface-variant">Combat log</span>
        {state.log.length > 0 && (
          <span className="text-label-sm tabular-nums text-on-surface-variant opacity-60">{state.log.length}</span>
        )}
        <ChevronUp className={`size-4 ml-auto text-on-surface-variant transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Entries — the last three, or the full log scrolling */}
      <div ref={scrollRef} className={`px-2 py-2 ${expanded ? 'max-h-[320px] overflow-y-auto' : ''}`}>
        <div className="flex flex-col">
          {shown.map((entry) => {
            const indicator = TYPE_INDICATOR[entry.type] || TYPE_INDICATOR.combat;
            const isIndented = expanded && entry.message.startsWith('  ');
            return (
              <div key={entry.id} className={`flex items-start gap-2 px-1 py-0.5 ${isIndented ? 'pl-5' : ''}`}>
                {!isIndented && <span className={`size-1.5 rounded-full shrink-0 mt-1.5 ${indicator.dot}`} />}
                <span className={`text-label-sm leading-relaxed ${indicator.color}`}>
                  {colorizeLog(entry.message.trim(), partyNames, enemyNames)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
