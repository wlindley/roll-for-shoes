import type { CheckResult, RolledOppositionResult } from '../checks';
import type { Character } from '../character';
import { assertAllowedStartingSkills, BASIC_CAMPAIGN_RULES, type CampaignRulesConfig } from './rules';
import { CampaignCharacterScope } from './scopes';
import { bindCampaignFactory, deserializeCampaign, serializeCampaign } from './serialize';

export { BASIC_CAMPAIGN_RULES, type CampaignRulesConfig } from './rules';

interface BaseRollLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly actorSkillName: string;
  readonly actionDescription?: string;
  readonly actorXpEarned: number;
}

export interface VsOppositionRollLogEntry extends BaseRollLogEntry {
  readonly kind: 'vs_opposition';
  readonly checkResult: CheckResult;
}

export interface CharacterOpposedRollLogEntry extends BaseRollLogEntry {
  readonly kind: 'character_opposed';
  readonly defenderId: string;
  readonly defenderName: string;
  readonly defenderSkillName: string;
  readonly defenderXpEarned: number;
  readonly checkResult: CheckResult<RolledOppositionResult>;
}

export type CampaignRollLogEntry = VsOppositionRollLogEntry | CharacterOpposedRollLogEntry;

/** @internal */
export type NewRollLogEntry =
  | Omit<VsOppositionRollLogEntry, 'id' | 'timestamp'>
  | Omit<CharacterOpposedRollLogEntry, 'id' | 'timestamp'>;

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

  static {
    bindCampaignFactory((p) => new Campaign(p.id, p.name, p.description, p.createdAt, p.updatedAt, p.rules, p.characters, p.rollLog));
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

  static deserialize(campaignJson: string): Campaign { return deserializeCampaign(campaignJson); }

  rename(name: string): Campaign {
    return this.copy({ name: requireNonBlank(name, 'Campaign name') });
  }

  withDescription(description: string): Campaign {
    return this.copy({ description: normalizeDescription(description) });
  }

  withRules(rulesPatch: Partial<CampaignRulesConfig>): Campaign {
    return this.copy({ rules: { ...this.rules, ...rulesPatch } });
  }

  addCharacter(character: Character): Campaign {
    assertAllowedStartingSkills(this.rules, character);
    if (this.characters.some((c) => c.id === character.id) || this.findCharacterByName(character.name) !== undefined) {
      throw new Error(`Duplicate character in campaign: ${character.name}`);
    }
    return this.copy({ characters: [...this.characters, character] });
  }

  removeCharacter(characterId: string): Campaign {
    const target = this.findCharacter(characterId);
    if (!target) throw new Error(`Character not found: ${characterId}`);
    return this.copy({ characters: this.characters.filter((c) => c.id !== target.id) });
  }

  replaceCharacter(character: Character): Campaign {
    const index = this.characters.findIndex((c) => c.id === character.id);
    if (index === -1) throw new Error(`Character not found: ${character.id}`);
    const next = [...this.characters];
    next[index] = character;
    return this.copy({ characters: next });
  }

  findCharacter(characterId: string): Character | undefined {
    return this.characters.find((c) => c.id === characterId);
  }

  findCharacterByName(name: string): Character | undefined {
    const normalized = name.trim().toLowerCase();
    return this.characters.find((c) => c.name.toLowerCase() === normalized);
  }

  character(idOrName: string): CampaignCharacterScope<{ readonly campaign: Campaign }> {
    return new CampaignCharacterScope(this, this.requireCharacter(idOrName), (campaign) => Object.freeze({ campaign }));
  }

  serialize(): string { return serializeCampaign(this); }

  /** @internal */
  withFreshId(): Campaign {
    return new Campaign(globalThis.crypto.randomUUID(), this.name, this.description, this.createdAt, this.updatedAt, this.rules, this.characters, this.rollLog);
  }

  /** @internal */
  requireCharacter(idOrName: string): Character {
    const target = this.findCharacter(idOrName) ?? this.findCharacterByName(idOrName);
    if (!target) throw new Error(`Character not found: ${idOrName}`);
    return target;
  }

  /** @internal */
  recordRoll(updated: readonly Character[], entry: NewRollLogEntry): Campaign {
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
