export type StatusId = "dexterity" | "focus" | "riposte-prep" | "recovery-step" | "strength" | "vulnerable";

export type StatusDuration = "untilTurnEnd" | "combat";

export type StatusInstance = {
  id: StatusId;
  stacks: number;
  duration: StatusDuration;
};

export type StatusCollection = Partial<Record<StatusId, StatusInstance>>;

export const hasStatus = (statuses: StatusCollection, id: StatusId): boolean => (statuses[id]?.stacks ?? 0) > 0;

export const getStatusStacks = (statuses: StatusCollection, id: StatusId): number => statuses[id]?.stacks ?? 0;

export const applyStrengthToDamage = (statuses: StatusCollection, damage: number): number =>
  Math.max(0, Math.round(damage) + getStatusStacks(statuses, "strength"));

export const applyDexterityToBlock = (statuses: StatusCollection, block: number): number =>
  Math.max(0, Math.round(block) + getStatusStacks(statuses, "dexterity"));

export const addStatus = (
  statuses: StatusCollection,
  id: StatusId,
  stacks = 1,
  duration: StatusDuration = "untilTurnEnd",
): StatusCollection => {
  const current = statuses[id];

  return {
    ...statuses,
    [id]: {
      id,
      duration: current?.duration ?? duration,
      stacks: (current?.stacks ?? 0) + stacks,
    },
  };
};

export const removeStatus = (statuses: StatusCollection, id: StatusId, stacks?: number): StatusCollection => {
  const current = statuses[id];

  if (!current) {
    return statuses;
  }

  if (stacks === undefined || current.stacks <= stacks) {
    const { [id]: _removed, ...rest } = statuses;
    return rest;
  }

  return {
    ...statuses,
    [id]: {
      ...current,
      stacks: current.stacks - stacks,
    },
  };
};

export const setStatusStacks = (
  statuses: StatusCollection,
  id: StatusId,
  stacks: number,
  duration: StatusDuration = "combat",
): StatusCollection => {
  if (stacks <= 0) {
    return removeStatus(statuses, id);
  }

  return {
    ...statuses,
    [id]: {
      id,
      duration,
      stacks,
    },
  };
};

export const clearUntilTurnEndStatuses = (statuses: StatusCollection): StatusCollection =>
  Object.fromEntries(
    Object.entries(statuses).filter(([, status]) => status.duration !== "untilTurnEnd"),
  ) as StatusCollection;
