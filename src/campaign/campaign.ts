import type { CheckResult, TiesMode } from '../checks';
import { Character, DEFAULT_STARTING_SKILL_NAME, type SkillSlotConfig } from '../character';
import { CampaignCharacterScope } from './scopes';
import { deserializeCampaign, exportCampaignJson } from './serialize';

export interface CampaignRulesConfig {
  readonly tiesMode: TiesMode;
  readonly statusesEnabled: boolean;
  readonly allowCustomStartingSkills: boolean;
  readonly skillSlots: SkillSlotConfig | null;
}

export const BASIC_CAMPAIGN_RULES: CampaignRulesConfig = Object.freeze({
  tiesMode: 'fail', statusesEnabled: false, allowCustomStartingSkills: false, skillSlots: null,
});

export interface CampaignRollLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly kind: 'vs_opposition' | 'character_opposed';
  readonly actorId: string;
  readonly actorName: string;
  readonly actorSkillName: string;
  readonly defenderId?: string;
  readonly defenderName?: string;
  readonly defenderSkillName?: string;
  readonly actionDescription?: string;
  readonly checkResult: CheckResult;
  readonly actorXpEarned: number;
  readonly defenderXpEarned?: number;
}

export function requireNonBlank(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${label} cannot be blank`);
  return trimmed;
}

const normalizeDescription = (value?: string): string | undefined => value?.trim() || undefined;

export class Campaign {
  readonly description?: string;
  readonly rules: CampaignRulesConfig;
  readonly characters: readonly Character[];
  readonly rollLog: readonly CampaignRollLogEntry[];

  private constructor(
    readonly id: string, readonly name: string, description: string | undefined,
    readonly createdAt: string, readonly updatedAt: string,
    rules: CampaignRulesConfig, characters: readonly Character[], rollLog: readonly CampaignRollLogEntry[],
  ) {
    this.description = description;
    this.rules = Object.freeze({ ...rules });
    this.characters = Object.freeze([...characters]);
    this.rollLog = Object.freeze([...rollLog]);
    Object.freeze(this);
  }

  static create(
    name: string,
    options?: { readonly id?: string; readonly description?: string; readonly rules?: Partial<CampaignRulesConfig> },
  ): Campaign {
    const id = options?.id !== undefined ? requireNonBlank(options.id, 'Campaign ID') : globalThis.crypto.randomUUID();
    const now = new Date().toISOString();
    const rules = { ...BASIC_CAMPAIGN_RULES, ...options?.rules };
    return new Campaign(id, requireNonBlank(name, 'Campaign name'), normalizeDescription(options?.description), now, now, rules, [], []);
  }

  static fromJson(campaignJson: string): Campaign { return deserializeCampaign(campaignJson); }

  /** @internal */
  static rehydrate(id: string, name: string, description: string | undefined, createdAt: string, updatedAt: string, rules: CampaignRulesConfig, characters: readonly Character[], rollLog: readonly CampaignRollLogEntry[]): Campaign {
    return new Campaign(id, name, description, createdAt, updatedAt, rules, characters, rollLog);
  }

  rename(name: string): Campaign {
    return this.copy({ name: requireNonBlank(name, 'Campaign name') });
  }

  withDescription(description: string): Campaign {
    return this.copy({ description: normalizeDescription(description) });
  }

  withRules(rulesPatch: Partial<CampaignRulesConfig>): Campaign {
    return this.copy({ rules: { ...this.rules, ...rulesPatch } });
  }

  addCharacter(characterOrName: Character | string): Campaign {
    const candidate = typeof characterOrName === 'string' ? Character.create(characterOrName) : characterOrName;
    if (!this.rules.allowCustomStartingSkills && candidate.skills.some((s) => s.name !== DEFAULT_STARTING_SKILL_NAME)) {
      throw new Error('Custom starting skills are disabled in this campaign');
    }
    if (this.characters.some((c) => c.id === candidate.id || c.name.toLowerCase() === candidate.name.toLowerCase())) {
      throw new Error(`Duplicate character in campaign: ${candidate.name}`);
    }
    return this.copy({ characters: [...this.characters, candidate] });
  }

  removeCharacter(idOrName: string): Campaign {
    const target = this.requireCharacter(idOrName);
    return this.copy({ characters: this.characters.filter((c) => c.id !== target.id) });
  }

  replaceCharacter(character: Character): Campaign {
    const index = this.characters.findIndex((c) => c.id === character.id);
    if (index === -1) throw new Error(`Character not found: ${character.id}`);
    const next = [...this.characters];
    next[index] = character;
    return this.copy({ characters: next });
  }

  findCharacter(idOrName: string): Character | undefined {
    const normalized = idOrName.trim().toLowerCase();
    return this.characters.find((c) => c.id === idOrName || c.name.toLowerCase() === normalized);
  }

  character(idOrName: string): CampaignCharacterScope<{ readonly campaign: Campaign }> {
    return new CampaignCharacterScope(this, this.requireCharacter(idOrName), (campaign) => Object.freeze({ campaign }));
  }

  exportJson(): string { return exportCampaignJson(this); }

  /** @internal */
  withFreshId(): Campaign {
    return new Campaign(globalThis.crypto.randomUUID(), this.name, this.description, this.createdAt, this.updatedAt, this.rules, this.characters, this.rollLog);
  }

  /** @internal */
  requireCharacter(idOrName: string): Character {
    const target = this.findCharacter(idOrName);
    if (!target) throw new Error(`Character not found: ${idOrName}`);
    return target;
  }

  /** @internal */
  recordRoll(updated: readonly Character[], entry: Omit<CampaignRollLogEntry, 'id' | 'timestamp'>): Campaign {
    const logEntry: CampaignRollLogEntry = Object.freeze({ id: globalThis.crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry });
    const characters = this.characters.map((c) => updated.find((u) => u.id === c.id) ?? c);
    return this.copy({ characters, rollLog: [logEntry, ...this.rollLog] });
  }

  private copy(patch: {
    readonly name?: string; readonly description?: string; readonly rules?: CampaignRulesConfig;
    readonly characters?: readonly Character[]; readonly rollLog?: readonly CampaignRollLogEntry[];
  }): Campaign {
    const desc = 'description' in patch ? patch.description : this.description;
    return new Campaign(this.id, patch.name ?? this.name, desc, this.createdAt, new Date().toISOString(), patch.rules ?? this.rules, patch.characters ?? this.characters, patch.rollLog ?? this.rollLog);
  }
}
