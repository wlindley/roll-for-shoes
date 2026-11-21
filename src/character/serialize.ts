import { isDieValue } from '../dice';
import type { CheckOutcome } from '../checks';
import { PendingAdvancement } from './builders';
import { Character } from './character';
import { requireNonBlank, Skill } from './skill';
import { Status } from './status';

const VALID_OUTCOMES: ReadonlySet<unknown> = new Set<CheckOutcome>(['success', 'tie', 'failure']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const readNonBlankString = (v: unknown, label: string): string => {
  if (typeof v !== 'string') throw new Error(`${label} must be a string`);
  return requireNonBlank(v, label);
};

const readOptionalString = (v: unknown, label: string): string | undefined => {
  if (v !== undefined && typeof v !== 'string') throw new Error(`${label} must be a string`);
  return v;
};

const readInt = (v: unknown, min: number, label: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new Error(`${label} must be an integer >= ${min}`);
  }
  return v;
};

const isCheckOutcome = (v: unknown): v is CheckOutcome => VALID_OUTCOMES.has(v);

export function serializeCharacter(c: Character): string {
  const pa = c.pendingAdvancement;
  return JSON.stringify({
    schemaVersion: 1,
    id: c.id,
    name: c.name,
    xp: c.xp,
    skills: c.skills.map((s) => ({ id: s.id, name: s.name, level: s.level, parentSkillId: s.parentSkillId })),
    statuses: c.statuses.map((s) => ({ id: s.id, name: s.name, rating: s.rating, note: s.note })),
    pendingAdvancement: pa && {
      rollId: pa.rollId,
      usedSkillId: pa.usedSkillId,
      usedSkillName: pa.usedSkillName,
      usedSkillLevel: pa.usedSkillLevel,
      rawDice: pa.rawDice,
      checkOutcome: pa.checkOutcome,
      actionDescription: pa.actionDescription,
    },
  });
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

export function deserializeCharacter(serialized: string): Character {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    throw new Error('Invalid character JSON');
  }
  if (!isRecord(raw)) throw new Error('Character payload must be a JSON object');
  if (raw.schemaVersion !== 1) throw new Error(`Unsupported schemaVersion: ${String(raw.schemaVersion)}`);
  const id = readNonBlankString(raw.id, 'Character id');
  const name = readNonBlankString(raw.name, 'Character name');
  const xp = readInt(raw.xp, 0, 'Character xp');
  if (!Array.isArray(raw.skills) || raw.skills.length === 0) {
    throw new Error('Character skills must be a non-empty array');
  }
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
  return Character.rehydrate(id, name, xp, skills, parsePendingAdvancement(raw.pendingAdvancement), statuses);
}
