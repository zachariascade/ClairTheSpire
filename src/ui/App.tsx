import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  attackOrder,
  attackPatterns,
  getAttackDuration,
  type AttackHit,
  type AttackId,
  type AttackPattern,
} from "../game/combat/attackPatterns";
import { cardDefinitions } from "../game/combat/cards";
import { getActiveEnemy } from "../game/combat/enemies";
import { combatReducer, createInitialCombatState } from "../game/combat/reducer";
import { hasStatus } from "../game/combat/statuses";
import type { CombatCard, EnemyPhaseSummary, ReactionResult } from "../game/combat/types";
import { PhaserBattlefield, type PhaserBattlefieldHandle } from "./PhaserBattlefield";
import { TargetingOverlay } from "./TargetingOverlay";

type CardRects = Record<string, DOMRect>;
type PointerPoint = {
  x: number;
  y: number;
};
type BattlefieldTextTone = "good" | "bad" | "neutral" | "damage" | "block";
type ActorFeedback = {
  id: number;
  text: string;
  tone: "damage" | "good" | "block" | "perfect" | "parry" | "dodge" | "miss";
};
type TimingInputMarker = {
  id: number;
  percent: number;
  tone: "perfect" | "parry" | "dodge" | "miss";
};

const TURN_BANNER_DURATION_MS = 1300;
const PLAYER_TURN_AFTER_ENEMY_PAUSE_MS = 750;

const getCardBattlefieldEffect = (
  definitionId: string,
  perfection: number,
): { target: "player" | "enemy"; text: string; tone: BattlefieldTextTone; impact?: boolean } | null => {
  if (definitionId === "strike") {
    return { target: "enemy", text: "-6", tone: "damage", impact: true };
  }

  if (definitionId === "crescendo") {
    return { target: "enemy", text: `-${4 + perfection * 2}`, tone: "damage", impact: true };
  }

  if (definitionId === "guard") {
    return { target: "player", text: "+5 Block", tone: "block" };
  }

  if (definitionId === "focus") {
    return { target: "player", text: "Focus", tone: "good" };
  }

  if (definitionId === "riposte-prep") {
    return { target: "player", text: "Riposte Ready", tone: "good" };
  }

  if (definitionId === "recovery-step") {
    return { target: "player", text: "Recovery Ready", tone: "good" };
  }

  return null;
};

export function App() {
  const [state, dispatch] = useReducer(combatReducer, undefined, createInitialCombatState);
  const [enemyRect, setEnemyRect] = useState<DOMRect | null>(null);
  const [playerRect, setPlayerRect] = useState<DOMRect | null>(null);
  const [cardRects, setCardRects] = useState<CardRects>({});
  const [targetPointer, setTargetPointer] = useState<PointerPoint | null>(null);
  const [isEnemyTargetHovered, setIsEnemyTargetHovered] = useState(false);
  const [isPlayerTargetHovered, setIsPlayerTargetHovered] = useState(false);
  const [targetCornersExiting, setTargetCornersExiting] = useState(false);
  const [enemyFeedback, setEnemyFeedback] = useState<ActorFeedback | null>(null);
  const [playerFeedback, setPlayerFeedback] = useState<ActorFeedback | null>(null);
  const [timingInputMarker, setTimingInputMarker] = useState<TimingInputMarker | null>(null);
  const [animatingCardId, setAnimatingCardId] = useState<string | null>(null);
  const [attackStartedAt, setAttackStartedAt] = useState<number | null>(null);
  const [showTimingAssist, setShowTimingAssist] = useState(true);
  const [debugCollapsed, setDebugCollapsed] = useState(true);
  const battlefieldRef = useRef<PhaserBattlefieldHandle | null>(null);
  const resolvedHitIdsRef = useRef<Set<number>>(new Set());
  const hadTargetCornerHoverRef = useRef(false);
  const targetCornerExitTimerRef = useRef<number | null>(null);
  const feedbackIdRef = useRef(0);

  const selectedCard = useMemo(
    () => state.hand.find((card) => card.instanceId === state.selectedCardId) ?? null,
    [state.hand, state.selectedCardId],
  );

  const selectedDefinition = selectedCard ? cardDefinitions[selectedCard.definitionId] : null;
  const selectedCardRect = selectedCard ? cardRects[selectedCard.instanceId] ?? null : null;
  const isAimingEnemyCard = selectedDefinition?.target === "enemy";
  const isAimingPlayerCard = selectedDefinition?.target === "self";
  const isAimingTargetedCard = isAimingEnemyCard || isAimingPlayerCard;
  const targetBounds = isAimingEnemyCard ? enemyRect : isAimingPlayerCard ? playerRect : null;
  const isTargetHovered = isAimingEnemyCard ? isEnemyTargetHovered : isAimingPlayerCard ? isPlayerTargetHovered : false;
  const targetLabel = isAimingEnemyCard ? "enemy" : "player";
  const activeEnemy = getActiveEnemy(state);
  const currentAttackPattern = attackPatterns[activeEnemy.attackId];

  const showActorFeedback = useCallback((target: "player" | "enemy", text: string, tone: ActorFeedback["tone"]) => {
    feedbackIdRef.current += 1;
    const feedback = { id: feedbackIdRef.current, text, tone };
    const setter = target === "enemy" ? setEnemyFeedback : setPlayerFeedback;

    setter(feedback);
    window.setTimeout(() => {
      setter((current) => (current?.id === feedback.id ? null : current));
    }, 950);
  }, []);

  const showTimingInputMarker = useCallback((percent: number, tone: TimingInputMarker["tone"]) => {
    feedbackIdRef.current += 1;
    const marker = { id: feedbackIdRef.current, percent, tone };

    setTimingInputMarker(marker);
    window.setTimeout(() => {
      setTimingInputMarker((current) => (current?.id === marker.id ? null : current));
    }, 900);
  }, []);

  const playCard = useCallback(
    (card: CombatCard) => {
      const definition = cardDefinitions[card.definitionId];
      const effect = getCardBattlefieldEffect(definition.id, state.player.perfection);
      setAnimatingCardId(card.instanceId);
      if (effect?.impact) {
        battlefieldRef.current?.playCardImpact(effect.text);
        showActorFeedback("enemy", effect.text, "damage");
      } else if (effect) {
        if (effect.tone !== "block") {
          battlefieldRef.current?.showFloatingText(effect.target, effect.text, effect.tone);
        }
        showActorFeedback(effect.target, effect.text, effect.tone === "block" ? "block" : "good");
      }

      window.setTimeout(() => {
        dispatch({ type: "PLAY_CARD", cardId: card.instanceId });
        setIsEnemyTargetHovered(false);
        setIsPlayerTargetHovered(false);
        setTargetPointer(null);
        setAnimatingCardId(null);
      }, definition.target === "enemy" ? 260 : 80);
    },
    [showActorFeedback, state.player.perfection],
  );

  const handleCardClick = useCallback(
    (card: CombatCard) => {
      const definition = cardDefinitions[card.definitionId];

      if (definition.target === "none") {
        playCard(card);
        return;
      }

      dispatch({
        type: "SELECT_CARD",
        cardId: state.selectedCardId === card.instanceId ? null : card.instanceId,
      });
    },
    [playCard, state.selectedCardId],
  );

  const playSelectedCard = useCallback(() => {
    if (!selectedCard) {
      return;
    }

    playCard(selectedCard);
  }, [playCard, selectedCard]);

  useEffect(() => {
    if (!isAimingTargetedCard || !selectedCardRect) {
      setTargetPointer(null);
      setIsEnemyTargetHovered(false);
      setIsPlayerTargetHovered(false);
      return;
    }

    setTargetPointer((pointer) => pointer ?? {
      x: selectedCardRect.left + selectedCardRect.width / 2,
      y: selectedCardRect.top + selectedCardRect.height / 2,
    });

    const handlePointerMove = (event: PointerEvent) => {
      setTargetPointer({ x: event.clientX, y: event.clientY });
      if (isAimingEnemyCard && enemyRect) {
        const hovered =
          event.clientX >= enemyRect.left &&
          event.clientX <= enemyRect.right &&
          event.clientY >= enemyRect.top &&
          event.clientY <= enemyRect.bottom;
        setIsEnemyTargetHovered(hovered);
        setIsPlayerTargetHovered(false);
        return;
      }

      if (isAimingPlayerCard && playerRect) {
        const hovered =
          event.clientX >= playerRect.left &&
          event.clientX <= playerRect.right &&
          event.clientY >= playerRect.top &&
          event.clientY <= playerRect.bottom;
        setIsPlayerTargetHovered(hovered);
        setIsEnemyTargetHovered(false);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [enemyRect, isAimingEnemyCard, isAimingPlayerCard, isAimingTargetedCard, playerRect, selectedCardRect]);

  useEffect(() => {
    if (targetCornerExitTimerRef.current !== null) {
      window.clearTimeout(targetCornerExitTimerRef.current);
      targetCornerExitTimerRef.current = null;
    }

    if (isTargetHovered) {
      hadTargetCornerHoverRef.current = true;
      setTargetCornersExiting(false);
      return;
    }

    if (hadTargetCornerHoverRef.current) {
      hadTargetCornerHoverRef.current = false;
      setTargetCornersExiting(true);
      targetCornerExitTimerRef.current = window.setTimeout(() => {
        setTargetCornersExiting(false);
        targetCornerExitTimerRef.current = null;
      }, 180);
    }
  }, [isTargetHovered]);

  useEffect(() => () => {
    if (targetCornerExitTimerRef.current !== null) {
      window.clearTimeout(targetCornerExitTimerRef.current);
    }
  }, []);

  const completeEnemyAttackSoon = useCallback(() => {
    window.setTimeout(() => dispatch({ type: "ENEMY_ATTACK_COMPLETE" }), PLAYER_TURN_AFTER_ENEMY_PAUSE_MS);
  }, []);

  const handleReactionResult = useCallback((hitIndex: number, hit: AttackHit, result: ReactionResult, label: string) => {
    if (resolvedHitIdsRef.current.has(hitIndex)) {
      return;
    }

    resolvedHitIdsRef.current.add(hitIndex);
    const recoveryCatches = result === "REACTION_FAILED" && hasStatus(state.player.statuses, "recovery-step");
    const riposteCounters =
      (result === "PARRY_PERFECT" || result === "PARRY_NORMAL") && hasStatus(state.player.statuses, "riposte-prep");
    const tone = result === "HIT_TAKEN" || (result === "REACTION_FAILED" && !recoveryCatches) ? "bad" : "good";
    const displayLabel = recoveryCatches ? "Recovery" : riposteCounters ? "Riposte" : label;
    const baseDamage = result === "REACTION_FAILED" ? Math.max(1, hit.damage - 2) : hit.damage;
    const mitigatedDamage = Math.max(0, baseDamage - (hasStatus(state.player.statuses, "guard") ? 5 : 0));
    const hpDamage = Math.max(0, mitigatedDamage - state.player.block);

    battlefieldRef.current?.showReactionLabel(displayLabel, tone);
    if (result === "HIT_TAKEN" || (result === "REACTION_FAILED" && !recoveryCatches)) {
      battlefieldRef.current?.flashPlayer();
      if (hpDamage > 0) {
        battlefieldRef.current?.showFloatingText("player", `-${hpDamage}`, "bad");
      }
      showActorFeedback("player", hpDamage > 0 ? `-${hpDamage}` : "Blocked", hpDamage > 0 ? "damage" : "block");
    }
    if (result === "REACTION_FAILED" && recoveryCatches) {
      battlefieldRef.current?.showFloatingText("player", "Saved", "good");
      showActorFeedback("player", "Saved", "good");
    }
    if (result === "PARRY_PERFECT") {
      battlefieldRef.current?.showFloatingText("player", "Perfect", "good");
      showActorFeedback("player", "Perfect", "perfect");
    }
    if (result === "PARRY_NORMAL") {
      battlefieldRef.current?.showReactionLabel("Parry", "good");
    }
    if (result === "DODGE_SUCCESS") {
      battlefieldRef.current?.dodgePlayer();
    }
    if (riposteCounters) {
      battlefieldRef.current?.flashEnemy();
      battlefieldRef.current?.showFloatingText("enemy", "-5", "damage");
      showActorFeedback("enemy", "-5", "damage");
    }
    dispatch({ type: "REACTION_RESULT", result, damage: hit.damage, hitLabel: hit.label });

    if (resolvedHitIdsRef.current.size >= currentAttackPattern.hits.length) {
      completeEnemyAttackSoon();
    }
  }, [
    completeEnemyAttackSoon,
    currentAttackPattern.hits.length,
    state.player.statuses,
  ]);

  const resolveReactionInput = useCallback(
    (input: "parry" | "dodge" | "miss") => {
      if (attackStartedAt === null) {
        return;
      }

      const elapsed = performance.now() - attackStartedAt;
      const focusWindowBonus = hasStatus(state.player.statuses, "focus") ? 140 : 0;
      const nextHit = currentAttackPattern.hits
        .map((hit, index) => ({ hit, index, offset: Math.abs(elapsed - hit.atMs) }))
        .filter(({ index }) => !resolvedHitIdsRef.current.has(index))
        .sort((a, b) => a.offset - b.offset)[0];

      if (!nextHit) {
        return;
      }

      const markerPercent = Math.min(100, Math.max(0, (elapsed / getAttackDuration(currentAttackPattern)) * 100));

      if (input === "miss") {
        showTimingInputMarker(markerPercent, "miss");
        handleReactionResult(nextHit.index, nextHit.hit, "REACTION_FAILED", "Miss");
        return;
      }

      if (input === "dodge") {
        const result =
          nextHit.offset <= currentAttackPattern.dodgeWindowMs + focusWindowBonus ? "DODGE_SUCCESS" : "REACTION_FAILED";
        showTimingInputMarker(markerPercent, result === "DODGE_SUCCESS" ? "dodge" : "miss");
        handleReactionResult(nextHit.index, nextHit.hit, result, result === "DODGE_SUCCESS" ? "Dodge" : "Early");
        return;
      }

      if (nextHit.offset <= currentAttackPattern.perfectParryWindowMs + focusWindowBonus / 2) {
        showTimingInputMarker(markerPercent, "perfect");
        handleReactionResult(nextHit.index, nextHit.hit, "PARRY_PERFECT", "Perfect");
        return;
      }

      if (nextHit.offset <= currentAttackPattern.normalParryWindowMs + focusWindowBonus) {
        showTimingInputMarker(markerPercent, "parry");
        handleReactionResult(nextHit.index, nextHit.hit, "PARRY_NORMAL", "Parry");
        return;
      }

      showTimingInputMarker(markerPercent, "miss");
      handleReactionResult(nextHit.index, nextHit.hit, "REACTION_FAILED", elapsed < nextHit.hit.atMs ? "Early" : "Late");
    },
    [attackStartedAt, currentAttackPattern, handleReactionResult, showTimingInputMarker, state.player.statuses],
  );

  useEffect(() => {
    if (state.phase !== "enemyTurn") {
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "BEGIN_ENEMY_ATTACK" });
    }, TURN_BANNER_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "enemyAttack") {
      resolvedHitIdsRef.current = new Set();
      setAttackStartedAt(null);
      return;
    }

    resolvedHitIdsRef.current = new Set();
    const startedAt = performance.now();
    setAttackStartedAt(startedAt);

    const hitTimers = currentAttackPattern.hits.map((hit, index) =>
      window.setTimeout(() => {
        if (resolvedHitIdsRef.current.has(index)) {
          return;
        }

        resolvedHitIdsRef.current.add(index);
        battlefieldRef.current?.showReactionLabel("Hit", "bad");
        battlefieldRef.current?.flashPlayer();
        battlefieldRef.current?.showFloatingText("player", `-${hit.damage}`, "bad");
        showActorFeedback("player", `-${hit.damage}`, "damage");
        dispatch({ type: "REACTION_RESULT", result: "HIT_TAKEN", damage: hit.damage, hitLabel: hit.label });
      }, hit.atMs + currentAttackPattern.dodgeWindowMs),
    );

    const completionTimer = window.setTimeout(() => {
      dispatch({ type: "ENEMY_ATTACK_COMPLETE" });
    }, getAttackDuration(currentAttackPattern) + PLAYER_TURN_AFTER_ENEMY_PAUSE_MS);

    return () => {
      for (const timer of hitTimers) {
        window.clearTimeout(timer);
      }
      window.clearTimeout(completionTimer);
    };
  }, [currentAttackPattern, showActorFeedback, state.phase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (state.phase !== "enemyAttack") {
        return;
      }

      if (key === "a") {
        resolveReactionInput("parry");
      }
      if (key === "s") {
        resolveReactionInput("dodge");
      }
      if (key === "d") {
        resolveReactionInput("miss");
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [resolveReactionInput, state.phase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch({ type: "SELECT_CARD", cardId: null });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="app-shell">
      <section className="combat-root" aria-label="Combat prototype">
        <PhaserBattlefield
          ref={battlefieldRef}
          phase={state.phase}
          attackId={activeEnemy.attackId}
          onEnemyBoundsChange={setEnemyRect}
          onPlayerBoundsChange={setPlayerRect}
        />

        {(state.phase === "playerTurn" || state.phase === "enemyTurn") && (
          <TurnBanner key={state.phase} label={state.phase === "playerTurn" ? "Player Turn" : "Enemy Turn"} />
        )}

        <TargetingOverlay
          activeCardRect={selectedCardRect}
          pointer={isAimingTargetedCard ? targetPointer : null}
          isAnimating={Boolean(animatingCardId)}
          target={isAimingEnemyCard ? "enemy" : isAimingPlayerCard ? "player" : null}
          isTargetHovered={isTargetHovered}
        />

        {isAimingTargetedCard && targetBounds && (
          <button
            className={`enemy-target-button ${isTargetHovered ? "is-armed" : ""}`}
            type="button"
            style={{
              left: targetBounds.left,
              top: targetBounds.top,
              width: targetBounds.width,
              height: targetBounds.height,
            }}
            aria-label={`Play ${selectedDefinition?.name ?? "card"} on ${targetLabel}`}
            onPointerEnter={() => {
              if (isAimingEnemyCard) {
                setIsEnemyTargetHovered(true);
                return;
              }
              setIsPlayerTargetHovered(true);
            }}
            onPointerLeave={() => {
              if (isAimingEnemyCard) {
                setIsEnemyTargetHovered(false);
                return;
              }
              setIsPlayerTargetHovered(false);
            }}
            onClick={playSelectedCard}
          />
        )}

        {isAimingTargetedCard && targetBounds && (isTargetHovered || targetCornersExiting) && (
          <div
            className={`enemy-target-corners ${targetCornersExiting ? "is-exiting" : ""}`}
            style={{
              left: targetBounds.left,
              top: targetBounds.top,
              width: targetBounds.width,
              height: targetBounds.height,
            }}
            aria-hidden="true"
          />
        )}

        <ActorFeedbackOverlay target="enemy" bounds={enemyRect} feedback={enemyFeedback} />
        <EnemyAttackOverlay
          enemyBounds={enemyRect}
          playerBounds={playerRect}
          active={state.phase === "enemyAttack"}
          attackStartedAt={attackStartedAt}
          pattern={currentAttackPattern}
        />
        <ActorFeedbackOverlay target="player" bounds={playerRect} feedback={playerFeedback} />

        <div className="top-hud">
          <Meter label="HP" value={state.player.hp} max={state.player.maxHp} tone="red" />
          <Meter label="Perfection" value={state.player.perfection} max={state.player.maxPerfection} tone="gold" />
          <Meter label="Enemy" value={activeEnemy.hp} max={activeEnemy.maxHp} tone="violet" />
        </div>

        <aside className="intent-panel">
          <span>Intent</span>
          <strong>{activeEnemy.intent}</strong>
          <p className="phase-readout">Phase: {state.phase}</p>
          <p>A to parry, S to dodge</p>
        </aside>

        <div className="left-rail">
          <DebugPanel
            collapsed={debugCollapsed}
            currentAttack={currentAttackPattern}
            disabled={state.phase !== "playerTurn"}
            attackStartedAt={attackStartedAt}
            inputMarker={timingInputMarker}
            log={state.log}
            lastEnemyPhaseSummary={state.lastEnemyPhaseSummary}
            showTimingAssist={showTimingAssist}
            onReset={() => {
              dispatch({ type: "RESET_COMBAT" });
            }}
            onSetAttack={(attackId) => dispatch({ type: "SET_NEXT_ATTACK", attackId })}
            onToggleCollapsed={() => setDebugCollapsed((value) => !value)}
            onToggleTiming={() => setShowTimingAssist((value) => !value)}
          />
        </div>

        <div className="bottom-ui">
          <div className="energy-readout">
            <span>Energy</span>
            <strong>{state.player.energy}</strong>
          </div>

          <div className="pile-readout" aria-label="Card piles">
            <span>Draw</span>
            <strong>{state.drawPile.length}</strong>
            <span>Discard</span>
            <strong>{state.discard.length}</strong>
          </div>

          <div className="hand" aria-label="Card hand">
            {state.hand.map((card) => (
              <CombatCardView
                key={card.instanceId}
                card={card}
                selected={state.selectedCardId === card.instanceId}
                disabled={state.phase !== "playerTurn" || state.player.energy < cardDefinitions[card.definitionId].cost}
                onBoundsChange={(rect) => setCardRects((rects) => ({ ...rects, [card.instanceId]: rect }))}
                onPlay={() => handleCardClick(card)}
              />
            ))}
          </div>

          <button
            className="end-turn-button"
            type="button"
            disabled={state.phase !== "playerTurn"}
            onClick={() => {
              dispatch({ type: "END_TURN" });
            }}
          >
            End Turn
          </button>
        </div>

        {(state.phase === "won" || state.phase === "lost") && (
          <div className="result-panel">
            <strong>{state.phase === "won" ? "Victory" : "Defeat"}</strong>
            <button type="button" onClick={() => dispatch({ type: "RESET_COMBAT" })}>
              Reset
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function TurnBanner({ label }: { label: string }) {
  return (
    <div className="turn-banner" aria-live="polite" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

function EnemyPhaseSummaryPanel({ summary }: { summary: EnemyPhaseSummary | null }) {
  if (!summary) {
    return null;
  }

  const defenses: string[] = [];
  if (summary.guardPrevented > 0) {
    defenses.push(`Guard prevented ${summary.guardPrevented}`);
  }
  if (summary.blockPrevented > 0) {
    defenses.push(`Block prevented ${summary.blockPrevented}`);
  }
  if (summary.recoverySaves > 0) {
    defenses.push(`Recovery saved ${summary.recoverySaves}`);
  }
  if (summary.riposteDamage > 0) {
    defenses.push(`Riposte dealt ${summary.riposteDamage}`);
  }

  return (
    <aside className="summary-panel" aria-label="Enemy phase summary">
      <span>Last Enemy Phase</span>
      <div className="summary-panel-scroll">
        <strong>{summary.attackName}</strong>
        <p>
          {summary.parries} {summary.parries === 1 ? "parry" : "parries"}, {summary.dodges} dodge
          {summary.dodges === 1 ? "" : "s"}, {summary.hitsTaken} hit{summary.hitsTaken === 1 ? "" : "s"},{" "}
          {summary.failedReactions} mistake{summary.failedReactions === 1 ? "" : "s"}
        </p>
        <p>{summary.damageTaken} damage taken</p>
        {defenses.length > 0 && <p>{defenses.join(" | ")}</p>}
      </div>
    </aside>
  );
}

function EnemyAttackOverlay({
  enemyBounds,
  playerBounds,
  active,
  attackStartedAt,
  pattern,
}: {
  enemyBounds: DOMRect | null;
  playerBounds: DOMRect | null;
  active: boolean;
  attackStartedAt: number | null;
  pattern: AttackPattern;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || attackStartedAt === null) {
      setElapsed(0);
      return;
    }

    let frame = 0;
    const tick = () => {
      setElapsed(performance.now() - attackStartedAt);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, attackStartedAt]);

  if (!enemyBounds || !playerBounds || !active) {
    return null;
  }

  const beamDurationMs = 360;
  const activeHitIndex = pattern.hits.findIndex((hit) => elapsed >= hit.atMs && elapsed <= hit.atMs + beamDurationMs);
  const activeHit = activeHitIndex >= 0 ? pattern.hits[activeHitIndex] : null;
  const nextHitIndex = pattern.hits.findIndex((hit) => elapsed < hit.atMs);
  const nextHit = nextHitIndex >= 0 ? pattern.hits[nextHitIndex] : null;
  const previousHit = nextHitIndex > 0 ? pattern.hits[nextHitIndex - 1] : null;
  const chargeStartMs = previousHit ? previousHit.atMs + beamDurationMs : 0;
  const chargeEndMs = nextHit?.atMs ?? pattern.hits[pattern.hits.length - 1].atMs;
  const chargeDurationMs = Math.max(1, chargeEndMs - chargeStartMs);
  const chargeProgress = nextHit ? Math.max(0, Math.min(1, (elapsed - chargeStartMs) / chargeDurationMs)) : 0;
  const msUntilNextHit = nextHit ? nextHit.atMs - elapsed : Number.POSITIVE_INFINITY;
  const chargePhase = activeHit ? "release" : msUntilNextHit <= 420 ? "shake" : "charge";
  const startX = enemyBounds.left + enemyBounds.width * 0.28;
  const startY = enemyBounds.top + enemyBounds.height * 0.3;
  const endX = playerBounds.left + playerBounds.width * 0.66;
  const endY = playerBounds.top + playerBounds.height * 0.48;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const length = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
  const orbSize = 96;
  const impactSize = Math.min(playerBounds.width, playerBounds.height) * 0.72;
  const beamKey = activeHit ? `${pattern.id}-${activeHitIndex}-${activeHit.atMs}` : "charging";

  return (
    <>
      <div
        className={`enemy-attack-origin is-${chargePhase}`}
        style={{
          left: startX - orbSize / 2,
          top: startY - orbSize / 2,
          width: orbSize,
          height: orbSize,
          "--charge-progress": chargeProgress,
        } as CSSProperties}
        aria-hidden="true"
      />
      {activeHit && (
        <>
          <div
            key={`beam-${beamKey}`}
            className="enemy-attack-vector"
            style={{
              left: midX,
              top: midY,
              width: length,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
            }}
            aria-hidden="true"
          >
            <div className="enemy-attack-beam" />
          </div>
          <div
            key={`impact-${beamKey}`}
            className="enemy-attack-impact"
            style={{
              left: endX - impactSize / 2,
              top: endY - impactSize / 2,
              width: impactSize,
              height: impactSize,
            }}
            aria-hidden="true"
          />
        </>
      )}
    </>
  );
}

function ActorFeedbackOverlay({
  target,
  bounds,
  feedback,
}: {
  target: "player" | "enemy";
  bounds: DOMRect | null;
  feedback: ActorFeedback | null;
}) {
  if (!bounds || !feedback) {
    return null;
  }

  return (
    <div
      key={feedback.id}
      className={`actor-feedback actor-feedback-${target} actor-feedback-${feedback.tone}`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
      aria-hidden="true"
    >
      <div className="actor-feedback-wash" />
      {feedback.tone === "damage" && (
        <>
          <div className="actor-feedback-slash actor-feedback-slash-main" />
          <div className="actor-feedback-slash actor-feedback-slash-secondary" />
          <div className="actor-feedback-spark" />
        </>
      )}
      {feedback.tone === "block" && (
        <div className="actor-feedback-shield">
          <div className="actor-feedback-shield-core" />
          <div className="actor-feedback-shield-rim" />
          <div className="actor-feedback-shield-shine" />
        </div>
      )}
      <span>{feedback.text}</span>
    </div>
  );
}

function DebugPanel({
  collapsed,
  currentAttack,
  disabled,
  attackStartedAt,
  inputMarker,
  log,
  lastEnemyPhaseSummary,
  showTimingAssist,
  onReset,
  onSetAttack,
  onToggleCollapsed,
  onToggleTiming,
}: {
  collapsed: boolean;
  currentAttack: AttackPattern;
  disabled: boolean;
  attackStartedAt: number | null;
  inputMarker: TimingInputMarker | null;
  log: string[];
  lastEnemyPhaseSummary: EnemyPhaseSummary | null;
  showTimingAssist: boolean;
  onReset: () => void;
  onSetAttack: (attackId: AttackId) => void;
  onToggleCollapsed: () => void;
  onToggleTiming: () => void;
}) {
  return (
    <aside className={`debug-panel ${collapsed ? "is-collapsed" : ""}`} aria-label="Debug controls">
      <div className="debug-panel-header">
        <span>Debug</span>
        <div className="debug-header-actions">
          <button type="button" onClick={onToggleCollapsed}>
            {collapsed ? "Show" : "Hide"}
          </button>
          <button type="button" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="debug-attack-buttons" aria-label="Force next attack">
            {attackOrder.map((attackId) => (
              <button
                className={currentAttack.id === attackId ? "is-active" : ""}
                disabled={disabled}
                key={attackId}
                type="button"
                onClick={() => onSetAttack(attackId)}
              >
                {attackPatterns[attackId].name}
              </button>
            ))}
          </div>

          <label className="timing-toggle">
            <input checked={showTimingAssist} type="checkbox" onChange={onToggleTiming} />
            Timing assist
          </label>

          {showTimingAssist && (
            <div className="debug-timing-meter">
              <ReactionTimingBar attackStartedAt={attackStartedAt} inputMarker={inputMarker} pattern={currentAttack} />
            </div>
          )}

          <dl className="attack-stats">
            <div>
              <dt>Hits</dt>
              <dd>{currentAttack.hits.length}</dd>
            </div>
            <div>
              <dt>Damage</dt>
              <dd>{currentAttack.hits.map((hit) => hit.damage).join(" / ")}</dd>
            </div>
            <div>
              <dt>Parry</dt>
              <dd>{currentAttack.normalParryWindowMs}ms</dd>
            </div>
            <div>
              <dt>Dodge</dt>
              <dd>{currentAttack.dodgeWindowMs}ms</dd>
            </div>
          </dl>

          <EnemyPhaseSummaryPanel summary={lastEnemyPhaseSummary} />

          <aside className="log-panel" aria-label="Combat log">
            <div className="log-panel-scroll">
              {log.map((entry, index) => (
                <p key={`${entry}-${index}`}>{entry}</p>
              ))}
            </div>
          </aside>
        </>
      )}
    </aside>
  );
}

function ReactionTimingBar({
  attackStartedAt,
  inputMarker,
  pattern,
}: {
  attackStartedAt: number | null;
  inputMarker: TimingInputMarker | null;
  pattern: AttackPattern;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (attackStartedAt === null) {
      setProgress(0);
      return;
    }

    let animationFrame = 0;
    const total = getAttackDuration(pattern);

    const update = () => {
      setProgress(Math.min(1, (performance.now() - attackStartedAt) / total));
      animationFrame = window.requestAnimationFrame(update);
    };

    animationFrame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [attackStartedAt, pattern]);

  const totalMs = getAttackDuration(pattern);
  const perfectWidth = (pattern.perfectParryWindowMs * 2 / totalMs) * 100;
  const normalWidth = (pattern.normalParryWindowMs * 2 / totalMs) * 100;

  return (
    <div className="reaction-timing" aria-label="Reaction timing">
      {pattern.hits.map((hit) => {
        const impactPercent = (hit.atMs / totalMs) * 100;
        return (
          <span key={`${pattern.id}-${hit.label}`}>
            <span className="normal-window" style={{ left: `${impactPercent}%`, width: `${normalWidth}%` }} />
            <span className="perfect-window" style={{ left: `${impactPercent}%`, width: `${perfectWidth}%` }} />
            <span className="impact-marker" style={{ left: `${impactPercent}%` }} />
          </span>
        );
      })}
      {inputMarker && (
        <span
          key={inputMarker.id}
          className={`input-marker input-marker-${inputMarker.tone}`}
          style={{ left: `${inputMarker.percent}%` }}
        />
      )}
      <span className="timing-sweep" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone: "red" | "gold" | "violet" }) {
  return (
    <div className={`meter meter-${tone}`}>
      <div className="meter-label">
        <span>{label}</span>
        <strong>
          {value}/{max}
        </strong>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}

function CombatCardView({
  card,
  selected,
  disabled,
  onBoundsChange,
  onPlay,
}: {
  card: CombatCard;
  selected: boolean;
  disabled: boolean;
  onBoundsChange: (rect: DOMRect) => void;
  onPlay: () => void;
}) {
  const definition = cardDefinitions[card.definitionId];
  const ref = useRef<HTMLButtonElement | null>(null);

  const updateBounds = useCallback(() => {
    if (ref.current) {
      onBoundsChange(ref.current.getBoundingClientRect());
    }
  }, [onBoundsChange]);

  return (
    <button
      ref={ref}
      className={`combat-card ${selected ? "is-selected" : ""}`}
      type="button"
      disabled={disabled}
      onMouseEnter={updateBounds}
      onFocus={updateBounds}
      onClick={() => {
        updateBounds();
        onPlay();
      }}
    >
      <span className="card-cost">{definition.cost}</span>
      <span className={`card-title ${definition.name.length > 10 ? "card-title-long" : ""}`} title={definition.name}>
        {definition.name}
      </span>
      <span className={`card-art card-art-${definition.id}`} aria-hidden="true">
        <span className="card-art-vignette" />
        <span className="card-art-mark card-art-mark-primary" />
        <span className="card-art-mark card-art-mark-secondary" />
        <span className="card-art-spark" />
      </span>
      <span className="card-kind">{definition.kind}</span>
      <span className="card-rules">{definition.rulesText}</span>
    </button>
  );
}
