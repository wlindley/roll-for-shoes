import { isDieValue, type DieValue } from '../dice';
import type { CheckOutcome } from '../checks';
import { PendingAdvancement } from './advancement';
import type { Character } from './character';
import { requireNonBlank, Skill } from './skill';
import { Status } from './status';

export interface SkillSnapshot {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly parentSkillId?: string;
}

export interface StatusSnapshot {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly note?: string;
}

export interface PendingAdvancementSnapshot {
  readonly rollId: string;
  readonly usedSkillId: string;
  readonly usedSkillName: string;
  readonly usedSkillLevel: number;
  readonly rawDice: readonly DieValue[];
  readonly checkOutcome: CheckOutcome;
  readonly actionDescription?: string;
}

export interface CharacterSnapshot {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly portrait?: string;
  readonly xp: number;
  readonly skills: readonly SkillSnapshot[];
  readonly statuses: readonly StatusSnapshot[];
  readonly purchasedSlots: Readonly<Record<number, number>>;
  readonly pendingAdvancement: PendingAdvancementSnapshot | null;
}

/** @internal */
export interface CharacterInstanceProps {
  readonly id: string;
  readonly name: string;
  readonly portrait?: string;
  readonly xp: number;
  readonly skills: readonly Skill[];
  readonly statuses: readonly Status[];
  readonly purchasedSlots: Readonly<Record<number, number>>;
  readonly pendingAdvancement: PendingAdvancement | null;
}

let instantiateCharacter!: (props: CharacterInstanceProps) => Character;

/** @internal */
export function bindCharacterFactory(factory: (props: CharacterInstanceProps) => Character): void {
  instantiateCharacter = factory;
}

const VALID_OUTCOMES: ReadonlySet<unknown> = new Set<CheckOutcome>(['success', 'tie', 'failure']);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCheckOutcome = (v: unknown): v is CheckOutcome => VALID_OUTCOMES.has(v);

const readNonBlankString = (v: unknown, label: string): string => {
  if (typeof v !== 'string') throw new Error(`${label} must be a string`);
  return requireNonBlank(v, label);
};

const readOptionalString = (v: unknown, label: string): string | undefined => {
  if (v !== undefined && typeof v !== 'string') throw new Error(`${label} must be a string`);
  return v;
};

const readInt = (v: unknown, min: number, label: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) throw new Error(`${label} must be an integer >= ${min}`);
  return v;
};

export function toCharacterSnapshot(c: Character): CharacterSnapshot {
  const pa = c.pendingAdvancement;
  return {
    schemaVersion: 1,
    id: c.id,
    name: c.name,
    portrait: c.portrait,
    xp: c.xp,
    skills: c.skills.map((s) => ({ id: s.id, name: s.name, level: s.level, parentSkillId: s.parentSkillId })),
    statuses: c.statuses.map((s) => ({ id: s.id, name: s.name, rating: s.rating, note: s.note })),
    purchasedSlots: { ...c.purchasedSlots },
    pendingAdvancement: pa && {
      rollId: pa.rollId,
      usedSkillId: pa.usedSkillId,
      usedSkillName: pa.usedSkillName,
      usedSkillLevel: pa.usedSkillLevel,
      rawDice: [...pa.rawDice],
      checkOutcome: pa.checkOutcome,
      actionDescription: pa.actionDescription,
    },
  };
}

export function serializeCharacter(c: Character): string {
  return JSON.stringify(toCharacterSnapshot(c));
}

function parsePendingAdvancement(raw: unknown): PendingAdvancement | null {
  if (raw === null) return null;
  if (!isRecord(raw)) throw new Error('Invalid pendingAdvancement');
  if (!Array.isArray(raw.rawDice) || raw.rawDice.length === 0 || !raw.rawDice.every(isDieValue)) {
    throw new Error('Invalid pendingAdvancement rawDice');
  }
  if (!isCheckOutcome(raw.checkOutcome)) throw new Error('Invalid pendingAdvancement checkOutcome');
  return new PendingAdvancement({
    rollId: readNonBlankString(raw.rollId, 'rollId'),
    usedSkillId: readNonBlankString(raw.usedSkillId, 'usedSkillId'),
    usedSkillName: readNonBlankString(raw.usedSkillName, 'usedSkillName'),
    usedSkillLevel: readInt(raw.usedSkillLevel, 1, 'usedSkillLevel'),
    rawDice: raw.rawDice,
    checkOutcome: raw.checkOutcome,
    actionDescription: readOptionalString(raw.actionDescription, 'actionDescription'),
  });
}

export function fromCharacterSnapshot(raw: unknown): Character {
  if (!isRecord(raw)) throw new Error('Character payload must be a JSON object');
  if (raw.schemaVersion !== 1) throw new Error(`Unsupported schemaVersion: ${String(raw.schemaVersion)}`);
  const id = readNonBlankString(raw.id, 'Character id');
  const name = readNonBlankString(raw.name, 'Character name');
  const portrait = raw.portrait === undefined ? undefined : readNonBlankString(raw.portrait, 'Character portrait');
  const xp = readInt(raw.xp, 0, 'Character xp');
  if (!Array.isArray(raw.skills) || raw.skills.length === 0) throw new Error('Character skills must be a non-empty array');
  const seenNames = new Set<string>();
  const skills = raw.skills.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid skill entry');
    const skill = new Skill({
      id: readNonBlankString(item.id, 'Skill id'),
      name: readNonBlankString(item.name, 'Skill name'),
      level: readInt(item.level, 1, 'Skill level'),
      parentSkillId: readOptionalString(item.parentSkillId, 'parentSkillId'),
    });
    const key = skill.name.toLowerCase();
    if (seenNames.has(key)) throw new Error(`Duplicate skill name: ${skill.name}`);
    seenNames.add(key);
    return skill;
  });
  if (!Array.isArray(raw.statuses)) throw new Error('Character statuses must be an array');
  const statuses = raw.statuses.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid status entry');
    return Status.create(readNonBlankString(item.name, 'Status name'), item.rating as number, {
      id: readNonBlankString(item.id, 'Status id'),
      note: readOptionalString(item.note, 'Status note'),
    });
  });
  if (!isRecord(raw.purchasedSlots)) throw new Error('Character purchasedSlots must be an object');
  const purchasedSlots: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw.purchasedSlots)) {
    purchasedSlots[readInt(Number(k), 2, 'purchasedSlots level')] = readInt(v, 0, 'purchasedSlots count');
  }
  return instantiateCharacter({ id, name, portrait, xp, skills, statuses, purchasedSlots, pendingAdvancement: parsePendingAdvancement(raw.pendingAdvancement) });
}

export function deserializeCharacter(serialized: string): Character {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    throw new Error('Invalid character JSON');
  }
  return fromCharacterSnapshot(raw);
}
