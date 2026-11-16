'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameProvider, useGame } from '@/components/providers/GameProvider';
import { useCombat } from '@/hooks/useCombat';
import { classBuilds } from '@/data/classes';
import { generateRoom } from '@/data/room-generator';
import { encounterForRoom } from '@/data/encounter-generator';
import { generateLootChoices, applyLootItem } from '@/data/loot-generator';
import { startingZone } from '@/data/zones';
import { useInspect } from '@/hooks/useInspect';
import { InitiativeBar, ZoneLayout, ActionBar, GameLog, InspectSheet, FloorChip, RoomModifiers, PhaseFade, useFadeThrough, useAfter, ARRIVAL_BEAT_MS } from '@/components/game';
import { AnimatePresence } from 'motion/react';
import { RoomPreview } from '@/components/game/RoomPreview';
import { LootScreen } from '@/components/game/LootScreen';
import { LevelUpScreen } from '@/components/game/LevelUpScreen';
import { RestScreen } from '@/components/game/RestScreen';
import { GameOverScreen } from '@/components/game/GameOverScreen';
import { GlobalFeedbackOverlay } from '@/components/game/feedback';
import { PhaseBanner } from '@/components/game/PhaseBanner';
import type { Enemy, GamePhase, Room, CombatState } from '@/data/game-types';
import type { LootItem } from '@/data/loot-generator';
import { awardVictoryXp, applyLevelUp, XP_THRESHOLDS, type LevelUpResult } from '@/data/progression';
import { useRest } from '@/hooks/useRest';
import { applyCondition, makeEffectId, type ActiveEffect, type GameCondition } from '@/data/status-effects';
import { FLOOR_MODIFIERS } from '@/data/floor-modifiers';

const PHASES: { id: GamePhase | 'room-preview-boss'; label: string }[] = [
  { id: 'room-preview', label: 'Room Preview' },
  { id: 'room-preview-boss', label: 'Room Preview (Boss)' },
  { id: 'combat', label: 'Combat' },
  { id: 'loot', label: 'Loot' },
  { id: 'rest', label: 'Rest' },
  { id: 'level-up', label: 'Level Up' },
  { id: 'game-over', label: 'Game Over' },
];

const INFLICT_CONDITIONS: GameCondition[] = ['paralyzed', 'unconscious', 'restrained', 'poisoned', 'frightened', 'prone', 'burning', 'frozen', 'commanded', 'staggered', 'hunterMarked'];
const BUFF_CONDITIONS: GameCondition[] = ['blessed', 'shielded'];

const noSubscription = () => () => {};

function DevHarness() {
  const router = useRouter();
  const { state, initParty, setPhase, setRoom, setCombat, addLog, updateCharacter, updateStats, setFloorModifier } = useGame();
  const combatState = state.combat;
  const [activePhase, setActivePhase] = useState<string>('room-preview');
  const { inspecting, selectTarget, closeInspect } = useInspect();
  const { overlay, through, settled, revealed } = useFadeThrough();
  const live = useAfter(settled && state.phase === 'combat' && !!state.combat, ARRIVAL_BEAT_MS);
  const [lootChoices, setLootChoices] = useState<LootItem[]>([]);
  const [levelUpResults, setLevelUpResults] = useState<LevelUpResult[]>([]);
  const { handleFullRest, handleQuickRest, handleTrain } = useRest();

  // Capture mode: `?capture` lays the page out as the game page does, with the
  // dev bars kept in the DOM for a script to click but not shown, and no dev lines in the log.
  const capture = React.useSyncExternalStore(
    noSubscription,
    () => new URLSearchParams(window.location.search).has('capture'),
    () => false,
  );
  const devLog = (message: string) => { if (!capture) addLog(message, 'system'); };

  function applyDevEffect(current: CombatState, effect: ActiveEffect, targetName: string) {
    const { effects, applied, reason } = applyCondition(current.activeEffects, effect);
    if (applied) {
      setCombat({ ...current, activeEffects: effects });
      devLog(`DEV: Applied ${effect.condition} to ${targetName}${reason === 'refreshed' ? ' (refreshed)' : ''}`);
    } else {
      devLog(`DEV: ${targetName} already ${reason || 'affected'}`);
    }
  }

  // Init default party on first load
  React.useEffect(() => {
    if (state.party.length > 0) return;
    const defaults = ['fighter', 'ranger', 'wizard', 'cleric'];
    const builds = defaults.map(idx => classBuilds.find(b => b.index === idx)).filter(Boolean);
    if (builds.length === 4) initParty(builds as typeof classBuilds);
  }, [state.party.length, initParty]);

  // `?mod=<floor modifier id>&phase=<phase id>` opens on that screen once the
  // party is in, so each capture section is one URL that starts fresh from the seed.
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current || state.party.length === 0) return;
    opened.current = true;
    const params = new URLSearchParams(window.location.search);
    const mod = FLOOR_MODIFIERS.find(m => m.id === params.get('mod'));
    if (mod) setFloorModifier(mod);
    const phase = params.get('phase');
    if (phase && PHASES.some(p => p.id === phase)) jumpTo(phase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.party.length]);

  function jumpTo(phaseId: string, enterRoom?: Room | null) {
    setActivePhase(phaseId);

    if (phaseId === 'room-preview') {
      const room = generateRoom(state.floor || 1, (state.roomNumber || 0) + 1);
      setRoom(room);
      setPhase('room-preview');
    } else if (phaseId === 'room-preview-boss') {
      const room = generateRoom(1, 5); // boss room
      setRoom(room);
      setPhase('room-preview');
    } else if (phaseId === 'combat') {
      // Entering from a room preview fights that room, so the boss preview leads to the boss.
      const room = enterRoom ?? generateRoom(1, 1);
      setRoom(room);
      state.party.forEach(char => updateCharacter(char.id, { zone: startingZone(char.classIndex) }));
      setCombat(encounterForRoom(room, state.party, state.floorModifier));
      setPhase('combat');
      devLog('Dev: Combat started.');
    } else if (phaseId === 'loot') {
      const choices = generateLootChoices(state.floor || 1);
      setLootChoices(choices);
      setPhase('loot');
    } else if (phaseId === 'rest') {
      const room = generateRoom(1, 2);
      room.type = 'rest';
      room.flavorText = 'A quiet alcove, untouched by corruption. The party catches their breath.';
      setRoom(room);
      setPhase('rest');
    } else if (phaseId === 'level-up') {
      // Force level-up: repeatedly apply until all characters gain a level
      const results: LevelUpResult[] = [];
      for (const c of state.party) {
        if (!c.isAlive) continue;
        // Give enough XP to guarantee next level, then apply
        const char = { ...c, xp: (XP_THRESHOLDS[c.level + 1] || 999999) };
        const result = applyLevelUp(char);
        updateCharacter(c.id, { ...result.character, xp: char.xp });
        results.push(result);
      }
      setLevelUpResults(results);
      setPhase('level-up');
    } else if (phaseId === 'game-over') {
      updateStats({ roomsCleared: 7, enemiesKilled: 12, totalDamageDealt: 340, totalDamageTaken: 180 });
      setPhase('game-over');
    }
  }

  // ─── Handlers (same as game page) ─────────────────────────────

  const handleVictory = React.useCallback((defeatedEnemies: Enemy[]) => {
    const { party: updatedParty, message } = awardVictoryXp(state.party, defeatedEnemies);
    if (message) addLog(message, 'system');
    updatedParty.forEach(c => updateCharacter(c.id, { xp: c.xp }));
    devLog('Dev: Victory! Use nav to jump to next phase.');
    setPhase('room-preview');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.party]);

  const combat = useCombat({ onVictory: handleVictory, live });

  function handleLootPick(item: LootItem, charId: string) {
    const char = state.party.find(c => c.id === charId);
    if (!char) return;
    const result = applyLootItem(char, item);
    if (result) {
      updateCharacter(charId, result.updates);
      addLog(result.message, 'loot');
    }
    setLootChoices([]);
  }

  function handleLevelUpDismiss() {
    setLevelUpResults([]);
  }


  if (state.party.length === 0) {
    return <div className="min-h-dvh bg-black" />;
  }

  return (
    <div className="relative h-dvh bg-surface overflow-hidden">

      {/* ─── Dev Nav Bar ─────────────────────────────────── */}
      <div className={`${capture ? 'hidden' : 'flex'} absolute top-0 left-0 right-0 z-50 items-center gap-1 px-3 py-2 bg-black/80 backdrop-blur-sm overflow-x-auto`}>
        <span className="text-label-sm text-primary font-semibold uppercase tracking-wider mr-2 shrink-0">DEV</span>
        {PHASES.map(p => (
          <button key={p.id} onClick={() => jumpTo(p.id)}
            className={`text-label-sm px-2 py-1 rounded-full shrink-0 transition-colors
              ${activePhase === p.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-2'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ─── Dev Condition Injector (combat only) ──────── */}
      {state.phase === 'combat' && combatState && (
        <div className={`${capture ? 'hidden' : 'flex'} absolute top-10 left-0 right-0 z-50 items-center gap-1 px-3 py-1.5 bg-black/70 backdrop-blur-sm overflow-x-auto`}>
          <span className="text-label-sm text-error font-semibold uppercase tracking-wider mr-2 shrink-0">Inflict</span>
          {INFLICT_CONDITIONS.map(cond => (
            <button key={cond} onClick={() => {
              // Apply to first alive enemy
              const target = combatState.enemies.find(e => e.isAlive);
              if (!target) return;
              applyDevEffect(combatState, {
                id: makeEffectId(), name: cond, condition: cond,
                sourceId: state.party[0]?.id || 'dev', targetId: target.id,
                turnsRemaining: cond === 'unconscious' ? 10 : cond === 'staggered' ? 1 : cond === 'commanded' ? 1 : -1,
                ...(cond === 'paralyzed' ? { saveDC: 12, saveAbility: 'wis' } : {}),
                ...(cond === 'restrained' ? { saveDC: 12, saveAbility: 'dex' } : {}),
                ...(cond === 'burning' ? { damagePerTurn: '1d6', damageType: 'fire', turnsRemaining: 3 } : {}),
              }, target.name);
            }}
              className="text-label-sm px-2 py-0.5 rounded-full shrink-0 text-error hover:bg-error/20 transition-colors"
            >
              {cond}
            </button>
          ))}
          <span className="text-label-sm text-primary font-semibold uppercase tracking-wider mx-2 shrink-0">Buff Ally</span>
          {BUFF_CONDITIONS.map(cond => (
            <button key={`ally-${cond}`} onClick={() => {
              const target = state.party.find(c => c.isAlive);
              if (!target) return;
              applyDevEffect(combatState, {
                id: makeEffectId(), name: cond, condition: cond,
                sourceId: 'dev', targetId: target.id, turnsRemaining: -1,
                ...(cond === 'shielded' ? { value: 2 } : {}),
              }, target.name);
            }}
              className="text-label-sm px-2 py-0.5 rounded-full shrink-0 text-primary hover:bg-primary/20 transition-colors"
            >
              {cond}
            </button>
          ))}
          <button onClick={() => {
            setCombat({ ...combatState, activeEffects: [] });
            devLog('DEV: Cleared all effects');
          }} className="text-label-sm px-2 py-0.5 rounded-full shrink-0 text-on-surface-variant hover:bg-surface-2 transition-colors ml-auto">
            Clear All
          </button>
        </div>
      )}

      {/* ─── Dev Floor Modifier Selector ────────────────── */}
      <div className={`${capture ? 'hidden' : 'flex'} absolute top-[calc(2.25rem)] left-0 right-0 z-40 items-center gap-1 px-3 py-1 bg-black/60 backdrop-blur-sm overflow-x-auto`}>
        <span className="text-label-sm text-primary font-semibold uppercase tracking-wider mr-2 shrink-0">Floor Mod</span>
        <button onClick={() => { setFloorModifier(null); devLog('DEV: Cleared floor modifier'); }}
          className={`text-label-sm px-2 py-0.5 rounded-full shrink-0 transition-colors ${!state.floorModifier ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-2'}`}>
          None
        </button>
        {FLOOR_MODIFIERS.map(m => (
          <button key={m.id} onClick={() => { setFloorModifier(m); devLog(`DEV: Set floor modifier — ${m.name}`); }}
            className={`text-label-sm px-2 py-0.5 rounded-full shrink-0 transition-colors ${state.floorModifier?.id === m.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-2'}`}>
            {m.name}
          </button>
        ))}
      </div>

      {/* First after the dev bars so it is the first Tab stop on the game's own screen */}
      <RoomModifiers className={capture ? 'top-3' : 'top-[84px]'} />

      {/* ─── Phase Content (offset for nav bar) ──────────── */}
      <div className={`h-full ${capture ? '' : state.phase === 'combat' ? 'pt-[72px]' : 'pt-10'}`}>
        <div className="relative h-full">
          <AnimatePresence custom={!settled}>
            {/* Combat */}
            {state.phase === 'combat' && combatState && (
              <PhaseFade key="combat">
                <ZoneLayout onSelectTarget={selectTarget} />
              </PhaseFade>
            )}

            {/* Room Preview */}
            {state.phase === 'room-preview' && state.currentRoom && (
              <PhaseFade key={`room-${state.currentRoom.roomNumber}`}>
                <RoomPreview room={state.currentRoom} floorModifier={state.floorModifier} onEnter={() => through(() => jumpTo('combat', state.currentRoom))} ready={revealed} />
              </PhaseFade>
            )}

            {/* Loot */}
            {state.phase === 'loot' && lootChoices.length > 0 && (
              <PhaseFade key="loot">
                <LootScreen
                  choices={lootChoices}
                  party={state.party}
                  onPick={handleLootPick}
                  onSkip={() => { setLootChoices([]); }}
                />
              </PhaseFade>
            )}

            {/* Rest */}
            {state.phase === 'rest' && (
              <PhaseFade key="rest">
                <RestScreen
                  flavorText={state.currentRoom?.flavorText}
                  onFullRest={handleFullRest}
                  onQuickRest={handleQuickRest}
                  onTrain={handleTrain}
                />
              </PhaseFade>
            )}

            {/* Level-Up Recap */}
            {state.phase === 'level-up' && levelUpResults.length > 0 && (
              <PhaseFade key="level-up">
                <LevelUpScreen results={levelUpResults} onContinue={handleLevelUpDismiss} />
              </PhaseFade>
            )}

            {/* Game Over */}
            {state.phase === 'game-over' && (
              <PhaseFade key="game-over">
                <GameOverScreen
                  stats={state.stats}
                  floor={state.floor}
                  onRetry={() => router.push('/draft')}
                />
              </PhaseFade>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── HUD Overlays ────────────────────────────────── */}
      <FloorChip className={capture ? 'top-3' : 'top-12'} />

      {combatState && <InitiativeBar />}
      <GameLog />
      {state.phase === 'combat' && <GlobalFeedbackOverlay />}
      {live && <PhaseBanner />}

      {live && combat.isPlayerTurn && combat.activeCharacter && (
        <ActionBar
          onAttack={combat.handleAttack}
          onCast={combat.handleCast}
          onDefend={combat.handleDefend}
          onUseItem={combat.handleUseItem}
          onBonusAction={combat.handleBonusAction}
          onMove={combat.handleMove}
          onEndTurn={() => combat.advanceTurn()}
        />
      )}

      <InspectSheet inspecting={inspecting} onClose={closeInspect} />
      {overlay}
    </div>
  );
}

export default function DevPage() {
  return (
    <GameProvider>
      <DevHarness />
    </GameProvider>
  );
}
