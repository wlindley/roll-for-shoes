import type { DieValue } from '../dice';
import { type CheckModifier, CheckResult, RolledPool, type TiesMode } from '../checks';
import { Character, SkillSlotConfig } from '../character';
import { Campaign, type CampaignRollLogEntry, requireNonBlank } from './campaign';
import { Workspace } from './workspace';

const VALID_TIES_MODES: ReadonlySet<unknown> = new Set<TiesMode>(['fail', 'twist']);
const VALID_KINDS: ReadonlySet<unknown> = new Set(['vs_opposition', 'character_opposed']);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(serialized: string): unknown {
  try { return JSON.parse(serialized); } catch { throw new Error('Invalid JSON'); }
}

interface PoolDto { readonly rawDice: readonly DieValue[]; readonly modifiers?: readonly CheckModifier[] }
const toPoolDto = (pool: RolledPool): PoolDto => ({ rawDice: pool.rawDice, modifiers: pool.modifiers });
const fromPoolDto = (raw: PoolDto): RolledPool => new RolledPool(raw.rawDice, raw.modifiers);

const toRollEntryDto = (e: CampaignRollLogEntry) => ({
  ...e,
  checkResult: {
    actor: toPoolDto(e.checkResult.actor),
    opposition: { total: e.checkResult.opposition.total, label: e.checkResult.opposition.label, pool: e.checkResult.opposition.pool && toPoolDto(e.checkResult.opposition.pool) },
    tiesMode: e.checkResult.tiesMode,
  },
});

function fromRollEntryDto(raw: Record<string, unknown>): CampaignRollLogEntry {
  if (!VALID_KINDS.has(raw.kind)) throw new Error(`Invalid rollLog entry kind: ${String(raw.kind)}`);
  const cr = raw.checkResult as { actor: PoolDto; opposition: { total: number; label?: string; pool?: PoolDto }; tiesMode: TiesMode };
  const opp = Object.freeze({ total: cr.opposition.total, label: cr.opposition.label, pool: cr.opposition.pool ? fromPoolDto(cr.opposition.pool) : undefined });
  return Object.freeze({ ...(raw as Omit<CampaignRollLogEntry, 'checkResult'>), checkResult: new CheckResult(fromPoolDto(cr.actor), opp, cr.tiesMode) });
}

const toCampaignDto = (c: Campaign) => ({
  schemaVersion: 1 as const, id: c.id, name: c.name, description: c.description, createdAt: c.createdAt, updatedAt: c.updatedAt,
  rules: c.rules, characters: c.characters.map((ch) => JSON.parse(ch.serialize()) as unknown), rollLog: c.rollLog.map(toRollEntryDto),
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
  const [id, name, rules] = [requireNonBlank(String(raw.id), 'Campaign ID'), requireNonBlank(String(raw.name), 'Campaign name'), raw.rules as Record<string, unknown>];
  if (!VALID_TIES_MODES.has(rules.tiesMode)) throw new Error('Invalid campaign rules');
  if (!Array.isArray(raw.characters)) throw new Error('Campaign characters must be an array');
  const characters = raw.characters.map((ch) => Character.deserialize(JSON.stringify(ch)));
  const rollLog = (raw.rollLog as Record<string, unknown>[]).map(fromRollEntryDto);
  return Campaign.rehydrate(
    id, name, typeof raw.description === 'string' ? raw.description : undefined, String(raw.createdAt), String(raw.updatedAt),
    { tiesMode: rules.tiesMode as TiesMode, statusesEnabled: Boolean(rules.statusesEnabled), allowCustomStartingSkills: Boolean(rules.allowCustomStartingSkills), skillSlots: parseSkillSlots(rules.skillSlots) },
    characters, rollLog,
  );
}

export const exportCampaignJson = (campaign: Campaign): string => JSON.stringify(toCampaignDto(campaign));
export const deserializeCampaign = (campaignJson: string): Campaign => fromCampaignDto(parseJson(campaignJson));
export const serializeWorkspace = (ws: Workspace): string =>
  JSON.stringify({ schemaVersion: 1, activeCampaignId: ws.activeCampaignId, campaigns: ws.campaigns.map(toCampaignDto) });

export function deserializeWorkspace(serialized: string): Workspace {
  const raw = parseJson(serialized);
  if (!isRecord(raw) || raw.schemaVersion !== 1) throw new Error('Invalid workspace payload');
  if (!Array.isArray(raw.campaigns)) throw new Error('Workspace campaigns must be an array');
  const campaigns = raw.campaigns.map(fromCampaignDto);
  const activeId = raw.activeCampaignId;
  if (activeId !== null && (typeof activeId !== 'string' || !campaigns.some((c) => c.id === activeId))) throw new Error('Invalid activeCampaignId');
  return Workspace.rehydrate(activeId, campaigns);
}
