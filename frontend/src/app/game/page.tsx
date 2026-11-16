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
import { InitiativeBar, ZoneLayout, ActionBar, GameLog, InspectSheet, FloorChip, RoomModifiers } from '@/components/game';
import { RoomPreview } from '@/components/game/RoomPreview';
import { LootScreen } from '@/components/game/LootScreen';
import { LevelUpScreen } from '@/components/game/LevelUpScreen';
import { RestScreen } from '@/components/game/RestScreen';
import { GameOverScreen } from '@/components/game/GameOverScreen';
import { GlobalFeedbackOverlay } from '@/components/game/feedback';
import { PhaseBanner } from '@/components/game/PhaseBanner';
import { VictoryOverlay } from '@/components/game/VictoryOverlay';
import { AnimatePresence, motion } from 'motion/react';
import type { Character, Enemy } from '@/data/game-types';
import type { LootItem } from '@/data/loot-generator';

export default function GamePage() {
  const { state, initParty, setPhase, setRoom, setCombat, addLog, updateCharacter, advanceRoom, setFloorModifier } = useGame();

  const router = useRouter();
  const { inspecting, selectTarget, closeInspect } = useInspect();
  const [lootChoices, setLootChoices] = useState<LootItem[]>([]);
  const [levelUpResults, setLevelUpResults] = useState<LevelUpResult[]>([]);
  const [victoryXp, setVictoryXp] = useState<number | null>(null);
  const { handleFullRest, handleQuickRest, handleTrain } = useRest({ onComplete: advanceRoom });

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

  const combat = useCombat({ onVictory: handleVictory });

  // ─── Level-Up ──────────────────────────────────────────────────

  function checkAndQueueLevelUps(party: Character[]) {
    const eligible = party.filter(c => c.isAlive && checkLevelUp(c));
    if (eligible.length === 0) { advanceRoom(); return; }

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
    setLevelUpResults([]);
    advanceRoom();
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

    setLootChoices([]);
    checkAndQueueLevelUps(state.party);
  }

  function handleSkipLoot() {
    setLootChoices([]);
    checkAndQueueLevelUps(state.party);
  }

  // ─── Render ───────────────────────────────────────────────────

  if (state.party.length === 0) {
    return <div className="flex items-center justify-center min-h-dvh bg-surface"><p className="text-body-md text-on-surface-variant">Loading party...</p></div>;
  }

  return (
    <div className="relative h-dvh bg-surface overflow-hidden animate-[fade-in_0.5s_ease-out]">

      {/* First in the DOM so it is the first Tab stop, as it is the top of the screen */}
      <RoomModifiers />

      {/* ─── Combat ──────────────────────────────────────── */}
      {state.phase === 'combat' && state.combat && (
        <ZoneLayout onSelectTarget={selectTarget} />
      )}

      {/* ─── Room Preview ────────────────────────────────── */}
      {state.phase === 'room-preview' && state.currentRoom && (
        <RoomPreview key={`room-${state.currentRoom.roomNumber}`} room={state.currentRoom} floorModifier={state.floorModifier} onEnter={enterRoom} />
      )}

      {state.phase === 'room-preview' && !state.currentRoom && (
        <div className="flex items-center justify-center h-full text-on-surface-variant">Preparing next room...</div>
      )}

      {/* ─── Loot ────────────────────────────────────────── */}
      {state.phase === 'loot' && lootChoices.length > 0 && (
        <LootScreen
          choices={lootChoices}
          party={state.party}
          onPick={handleLootPick}
          onSkip={handleSkipLoot}
        />
      )}

      {/* ─── Rest ────────────────────────────────────────── */}
      {state.phase === 'rest' && (
        <RestScreen
          flavorText={state.currentRoom?.flavorText}
          onFullRest={handleFullRest}
          onQuickRest={handleQuickRest}
          onTrain={handleTrain}
        />
      )}

      {/* ─── Level-Up Recap ─────────────────────────────── */}
      {state.phase === 'level-up' && levelUpResults.length > 0 && (
        <LevelUpScreen results={levelUpResults} onContinue={handleLevelUpDismiss} />
      )}

      {/* ─── Game Over ───────────────────────────────────── */}
      {state.phase === 'game-over' && (
        <GameOverScreen
          stats={state.stats}
          floor={state.floor}
          onRetry={() => router.push('/draft')}
        />
      )}

      {/* ─── HUD Overlays ────────────────────────────────── */}
      <FloorChip />

      {state.combat && <InitiativeBar />}
      <GameLog />
      {state.phase === 'combat' && <GlobalFeedbackOverlay />}
      {state.phase === 'combat' && <PhaseBanner />}
      <AnimatePresence>
        {victoryXp !== null && <VictoryOverlay xpGained={victoryXp} />}
      </AnimatePresence>

      <AnimatePresence>
      {state.phase === 'combat' && combat.isPlayerTurn && combat.activeCharacter && (
        <motion.div
          key="action-bar"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
        <ActionBar
          onAttack={combat.handleAttack}
          onCast={combat.handleCast}
          onDefend={combat.handleDefend}
          onUseItem={combat.handleUseItem}
          onBonusAction={combat.handleBonusAction}
          onMove={combat.handleMove}
          onEndTurn={() => combat.advanceTurn()}
        />
        </motion.div>
      )}
      </AnimatePresence>

      <InspectSheet inspecting={inspecting} onClose={closeInspect} />
    </div>
  );
}
