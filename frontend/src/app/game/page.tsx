'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/components/providers/GameProvider';
import { useCombat } from '@/hooks/useCombat';
import { classBuilds } from '@/data/classes';
import { generateRoom, floorFromRoom } from '@/data/room-generator';
import { encounterForRoom } from '@/data/encounter-generator';
import { shouldDropLoot, generateLootChoices, applyLootItem } from '@/data/loot-generator';
import { awardVictoryXp, checkLevelUp, applyLevelUp, type LevelUpResult } from '@/data/progression';
import { useRest } from '@/hooks/useRest';
import { useInspect } from '@/hooks/useInspect';
import { pickFloorModifier } from '@/data/floor-modifiers';
import { startingZone } from '@/data/zones';
import { InitiativeBar, ZoneLayout, ActionBar, GameLog, InspectSheet, FloorChip, RoomModifiers, PhaseFade, useFadeThrough, useAfter, ARRIVAL_BEAT_MS } from '@/components/game';
import { RoomPreview } from '@/components/game/RoomPreview';
import { LootScreen } from '@/components/game/LootScreen';
import { LevelUpScreen } from '@/components/game/LevelUpScreen';
import { RestScreen } from '@/components/game/RestScreen';
import { GameOverScreen } from '@/components/game/GameOverScreen';
import { GlobalFeedbackOverlay } from '@/components/game/feedback';
import { PhaseBanner } from '@/components/game/PhaseBanner';
import { VictoryOverlay } from '@/components/game/VictoryOverlay';
import { AnimatePresence } from 'motion/react';
import type { Character, Enemy } from '@/data/game-types';
import type { LootItem } from '@/data/loot-generator';

export default function GamePage() {
  const { state, initParty, setPhase, setRoom, setCombat, addLog, updateCharacter, advanceRoom, setFloorModifier } = useGame();

  const router = useRouter();
  const { inspecting, selectTarget, closeInspect } = useInspect();
  const [lootChoices, setLootChoices] = useState<LootItem[]>([]);
  const [levelUpResults, setLevelUpResults] = useState<LevelUpResult[]>([]);
  const [victoryXp, setVictoryXp] = useState<number | null>(null);
  const { overlay, through, settled, revealed } = useFadeThrough();
  const live = useAfter(settled && state.phase === 'combat' && !!state.combat, ARRIVAL_BEAT_MS);
  // `leave` clears the screen being walked away from, once it is dark.
  const walkOn = (leave?: () => void) => through(() => { leave?.(); advanceRoom(); });
  const { handleFullRest, handleQuickRest, handleTrain } = useRest({ onComplete: walkOn });

  // ─── Victory Handler ──────────────────────────────────────────

  const handleVictory = useCallback((defeatedEnemies: Enemy[]) => {
    const { party: updatedParty, xpTotal, message } = awardVictoryXp(state.party, defeatedEnemies);
    if (message) addLog(message, 'system');
    updatedParty.forEach(c => updateCharacter(c.id, { xp: c.xp }));

    // Capture before async delay
    const roomType = state.currentRoom?.type || 'combat';
    const currentFloor = state.floor;

    // Show victory overlay, then proceed after delay
    setVictoryXp(xpTotal);
    setTimeout(() => {
      setVictoryXp(null);

      if (shouldDropLoot(roomType)) {
        const choices = generateLootChoices(currentFloor);
        setLootChoices(choices);
        setPhase('loot');
      } else {
        checkAndQueueLevelUps(updatedParty);
      }
    }, 2500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.party, state.currentRoom, state.floor]);

  const combat = useCombat({ onVictory: handleVictory, live });

  // ─── Level-Up ──────────────────────────────────────────────────

  function checkAndQueueLevelUps(party: Character[], leave?: () => void) {
    const eligible = party.filter(c => c.isAlive && checkLevelUp(c));
    if (eligible.length === 0) { walkOn(leave); return; }
    leave?.();

    // Apply all level-ups immediately, collect results for recap
    const results: LevelUpResult[] = [];
    for (const char of eligible) {
      const result = applyLevelUp(char);
      updateCharacter(char.id, result.character);
      addLog(`${result.character.name} reached level ${result.newLevel}!`, 'levelup');
      results.push(result);
    }
    setLevelUpResults(results);
    setPhase('level-up');
  }

  function handleLevelUpDismiss() {
    walkOn(() => setLevelUpResults([]));
  }

  // ─── Room Generation ──────────────────────────────────────────

  useEffect(() => {
    if (state.party.length !== 4 || state.phase !== 'room-preview') return;
    if (state.currentRoom) return; // room already set, waiting for player

    const nextRoomNumber = state.roomNumber + 1;
    const floor = floorFromRoom(nextRoomNumber);
    const room = generateRoom(floor, nextRoomNumber);

    // Pick a new floor modifier when floor changes
    if (floor !== state.floor) {
      const modifier = pickFloorModifier(floor);
      setFloorModifier(modifier);
      if (modifier) {
        addLog(`Floor ${floor}: ${modifier.name} — ${modifier.description}`, 'system');
      }
    }

    setRoom(room);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.party.length, state.phase, state.currentRoom]);

  // ─── Init ─────────────────────────────────────────────────────

  const initRef = React.useRef(false);
  useEffect(() => {
    if (state.party.length > 0 || initRef.current) return;
    const stored = sessionStorage.getItem('party-wipe-draft');
    if (!stored) {
      router.replace('/draft');
      return;
    }
    initRef.current = true;
    let indices: string[];
    try { indices = JSON.parse(stored); } catch { router.replace('/draft'); return; }
    sessionStorage.removeItem('party-wipe-draft');
    const builds = indices.map(idx => classBuilds.find(b => b.index === idx)).filter(Boolean);
    if (builds.length === 4) initParty(builds as typeof classBuilds);
    else router.replace('/draft');
  }, [state.party.length, initParty, router]);

  // ─── Enter Room ───────────────────────────────────────────────

  function enterRoom() {
    const room = state.currentRoom;
    if (!room) return;

    if (room.type === 'combat' || room.type === 'elite_combat' || room.type === 'boss') {
      state.party.forEach(char => updateCharacter(char.id, { zone: startingZone(char.classIndex) }));

      const encounter = encounterForRoom(room, state.party, state.floorModifier);
      setCombat(encounter);
      setPhase('combat');

      const enemyNames = encounter.enemies.map(e => e.name).join(', ');
      addLog(`Combat begins! ${enemyNames} ${encounter.enemies.length === 1 ? 'appears' : 'appear'}!`, 'system');
    } else if (room.type === 'rest') {
      setPhase('rest');
    } else if (room.type === 'treasure') {
      const choices = generateLootChoices(state.floor);
      setLootChoices(choices);

      setPhase('loot');
      addLog('The party finds treasure!', 'loot');
    }
  }

  // ─── Loot ─────────────────────────────────────────────────────

  function handleLootPick(item: LootItem, charId: string) {
    const char = state.party.find(c => c.id === charId);
    if (!char) return;

    const result = applyLootItem(char, item);
    if (result) {
      updateCharacter(charId, result.updates);
      addLog(result.message, 'loot');
    }

    checkAndQueueLevelUps(state.party, () => setLootChoices([]));
  }

  function handleSkipLoot() {
    checkAndQueueLevelUps(state.party, () => setLootChoices([]));
  }

  // ─── Render ───────────────────────────────────────────────────

  if (state.party.length === 0) {
    return <div className="min-h-dvh bg-black" />;
  }

  return (
    <div className="relative h-dvh bg-surface overflow-hidden">

      {/* First in the DOM so it is the first Tab stop, as it is the top of the screen */}
      <RoomModifiers />

      <AnimatePresence custom={!settled}>
        {/* ─── Combat ──────────────────────────────────────── */}
        {state.phase === 'combat' && state.combat && (
          <PhaseFade key="combat">
            <ZoneLayout onSelectTarget={selectTarget} />
          </PhaseFade>
        )}

        {/* ─── Room Preview ────────────────────────────────── */}
        {state.phase === 'room-preview' && state.currentRoom && (
          <PhaseFade key={`room-${state.currentRoom.roomNumber}`}>
            <RoomPreview room={state.currentRoom} floorModifier={state.floorModifier} onEnter={() => through(enterRoom)} ready={revealed} />
          </PhaseFade>
        )}

        {state.phase === 'room-preview' && !state.currentRoom && (
          <PhaseFade key="preparing">
            <div className="flex items-center justify-center h-full text-on-surface-variant">Preparing next room...</div>
          </PhaseFade>
        )}

        {/* ─── Loot ────────────────────────────────────────── */}
        {state.phase === 'loot' && lootChoices.length > 0 && (
          <PhaseFade key="loot">
            <LootScreen
              choices={lootChoices}
              party={state.party}
              onPick={handleLootPick}
              onSkip={handleSkipLoot}
            />
          </PhaseFade>
        )}

        {/* ─── Rest ────────────────────────────────────────── */}
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

        {/* ─── Level-Up Recap ─────────────────────────────── */}
        {state.phase === 'level-up' && levelUpResults.length > 0 && (
          <PhaseFade key="level-up">
            <LevelUpScreen results={levelUpResults} onContinue={handleLevelUpDismiss} />
          </PhaseFade>
        )}

        {/* ─── Game Over ───────────────────────────────────── */}
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

      {/* ─── HUD Overlays ────────────────────────────────── */}
      <FloorChip />

      {state.combat && <InitiativeBar />}
      <GameLog />
      {state.phase === 'combat' && <GlobalFeedbackOverlay />}
      {live && <PhaseBanner />}
      <AnimatePresence>
        {victoryXp !== null && <VictoryOverlay xpGained={victoryXp} />}
      </AnimatePresence>

      {live && combat.isPlayerTurn && combat.activeCharacter && (
        <ActionBar
          key={combat.activeCharacter.id}
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
