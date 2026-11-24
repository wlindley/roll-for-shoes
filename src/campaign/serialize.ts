import { assertPositiveInt, validateDiceValues, type DieValue } from '../dice';
import { type CheckModifier, CheckResult, type OppositionResult, RolledPool, type TiesMode } from '../checks';
import { type Character, fromCharacterSnapshot, SkillSlotConfig, toCharacterSnapshot } from '../character';
import { type Campaign, type CampaignRollLogEntry, requireNonBlank } from './campaign';
import type { CampaignRulesConfig } from './rules';
import type { Workspace } from './workspace';

export interface CampaignInstanceProps {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rules: CampaignRulesConfig;
  readonly characters: readonly Character[];
  readonly rollLog: readonly CampaignRollLogEntry[];
}

let instantiateCampaign!: (props: CampaignInstanceProps) => Campaign;
let instantiateWorkspace!: (activeCampaignId: string | null, campaigns: readonly Campaign[]) => Workspace;

/** @internal */
export function bindCampaignFactory(factory: (props: CampaignInstanceProps) => Campaign): void {
  instantiateCampaign = factory;
}

/** @internal */
export function bindWorkspaceFactory(factory: (activeCampaignId: string | null, campaigns: readonly Campaign[]) => Workspace): void {
  instantiateWorkspace = factory;
}

const VALID_TIES_MODES: ReadonlySet<unknown> = new Set<TiesMode>(['fail', 'twist']);
const VALID_KINDS: ReadonlySet<unknown> = new Set(['vs_opposition', 'character_opposed']);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(serialized: string): unknown {
  try { return JSON.parse(serialized); } catch { throw new Error('Invalid JSON'); }
}

interface PoolDto { readonly rawDice: readonly DieValue[]; readonly modifiers?: readonly CheckModifier[] }
const toPoolDto = (pool: RolledPool): PoolDto => ({ rawDice: pool.rawDice, modifiers: pool.modifiers });
const fromPoolDto = (raw: PoolDto): RolledPool => {
  assertPositiveInt(raw.rawDice.length, 'Pool dice count');
  return new RolledPool(validateDiceValues(raw.rawDice, raw.rawDice.length), raw.modifiers);
};

const toRollEntryDto = (e: CampaignRollLogEntry) => {
  const opp = e.checkResult.opposition;
  return {
    ...e,
    checkResult: {
      actor: toPoolDto(e.checkResult.actor),
      opposition: opp.kind === 'rolled'
        ? { kind: 'rolled' as const, total: opp.total, label: opp.label, pool: toPoolDto(opp.pool) }
        : { kind: 'static' as const, total: opp.total, label: opp.label },
      tiesMode: e.checkResult.tiesMode,
    },
  };
};

function fromRollEntryDto(raw: Record<string, unknown>): CampaignRollLogEntry {
  if (!VALID_KINDS.has(raw.kind)) throw new Error(`Invalid rollLog entry kind: ${String(raw.kind)}`);
  const cr = raw.checkResult as { actor: PoolDto; opposition: { total: number; label?: string; pool?: PoolDto }; tiesMode: TiesMode };
  const actor = fromPoolDto(cr.actor);
  const opp: OppositionResult = cr.opposition.pool
    ? Object.freeze({ kind: 'rolled', total: cr.opposition.total, label: cr.opposition.label, pool: fromPoolDto(cr.opposition.pool) })
    : Object.freeze({ kind: 'static', total: cr.opposition.total, label: cr.opposition.label });
  const base = {
    id: requireNonBlank(raw.id as string, 'Roll entry ID'),
    timestamp: requireNonBlank(raw.timestamp as string, 'Roll timestamp'),
    actorId: requireNonBlank(raw.actorId as string, 'Actor ID'),
    actorName: requireNonBlank(raw.actorName as string, 'Actor name'),
    actorSkillName: requireNonBlank(raw.actorSkillName as string, 'Actor skill'),
    actionDescription: raw.actionDescription as string | undefined,
    actorXpEarned: Number(raw.actorXpEarned),
  };
  return Object.freeze(
    raw.kind === 'character_opposed'
      ? {
          ...base,
          kind: 'character_opposed' as const,
          defenderId: requireNonBlank(raw.defenderId as string, 'Defender ID'),
          defenderName: requireNonBlank(raw.defenderName as string, 'Defender name'),
          defenderSkillName: requireNonBlank(raw.defenderSkillName as string, 'Defender skill'),
          defenderXpEarned: Number(raw.defenderXpEarned),
          checkResult: new CheckResult(
            actor,
            Object.freeze({ kind: 'rolled', total: cr.opposition.total, label: cr.opposition.label, pool: fromPoolDto(cr.opposition.pool!) }),
            cr.tiesMode,
          ),
        }
      : { ...base, kind: 'vs_opposition' as const, checkResult: new CheckResult(actor, opp, cr.tiesMode) },
  );
}

const toCampaignDto = (c: Campaign) => ({
  schemaVersion: 1 as const, id: c.id, name: c.name, description: c.description, createdAt: c.createdAt, updatedAt: c.updatedAt,
  rules: c.rules, characters: c.characters.map(toCharacterSnapshot), rollLog: c.rollLog.map(toRollEntryDto),
});

function parseSkillSlots(raw: unknown): SkillSlotConfig | null {
  if (raw === null) return null;
  if (!isRecord(raw) || !isRecord(raw.limitsByLevel)) throw new Error('Invalid skillSlots config');
  return new SkillSlotConfig({
    limitsByLevel: raw.limitsByLevel as Record<number, number>,
    allowSlotPurchase: Boolean(raw.allowSlotPurchase),
    defaultSlotsAboveMax: raw.defaultSlotsAboveMax as number | undefined,
  });
}

function fromCampaignDto(raw: unknown): Campaign {
  if (!isRecord(raw) || raw.schemaVersion !== 1) throw new Error('Invalid campaign payload');
  const [id, name, rules] = [requireNonBlank(raw.id as string, 'Campaign ID'), requireNonBlank(raw.name as string, 'Campaign name'), raw.rules as Record<string, unknown>];
  if (!VALID_TIES_MODES.has(rules.tiesMode)) throw new Error('Invalid campaign rules');
  if (!Array.isArray(raw.characters)) throw new Error('Campaign characters must be an array');
  const characters = raw.characters.map(fromCharacterSnapshot);
  const rollLog = (raw.rollLog as Record<string, unknown>[]).map(fromRollEntryDto);
  return instantiateCampaign({
    id,
    name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    createdAt: requireNonBlank(raw.createdAt as string, 'Campaign createdAt'),
    updatedAt: requireNonBlank(raw.updatedAt as string, 'Campaign updatedAt'),
    rules: {
      tiesMode: rules.tiesMode as TiesMode,
      statusesEnabled: Boolean(rules.statusesEnabled),
      allowCustomStartingSkills: Boolean(rules.allowCustomStartingSkills),
      skillSlots: parseSkillSlots(rules.skillSlots),
    },
    characters,
    rollLog,
  });
}

export const serializeCampaign = (campaign: Campaign): string => JSON.stringify(toCampaignDto(campaign));
export const deserializeCampaign = (campaignJson: string): Campaign => fromCampaignDto(parseJson(campaignJson));
export const serializeWorkspace = (ws: Workspace): string =>
  JSON.stringify({ schemaVersion: 1, activeCampaignId: ws.activeCampaignId, campaigns: ws.campaigns.map(toCampaignDto) });

export function deserializeWorkspace(serialized: string): Workspace {
  const raw = parseJson(serialized);
  if (!isRecord(raw) || raw.schemaVersion !== 1) throw new Error('Invalid workspace payload');
  if (!Array.isArray(raw.campaigns)) throw new Error('Workspace campaigns must be an array');
  const campaigns = raw.campaigns.map(fromCampaignDto);
  const activeId = raw.activeCampaignId;
  if (activeId !== null && typeof activeId !== 'string') throw new Error('Invalid activeCampaignId');
  return instantiateWorkspace(activeId, campaigns);
}
