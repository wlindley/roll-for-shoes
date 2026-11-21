import type { DieValue } from '../dice';
import type { CheckOutcome } from '../checks';
import { AdvancementOutcome, CharacterAdvancementBuilder, CharacterCheckBuilder, PendingAdvancement } from './builders';
import { deserializeCharacter, serializeCharacter } from './serialize';
import { DEFAULT_STARTING_SKILL_NAME, requireNonBlank, resolveId, Skill } from './skill';
import { requireInt, type SkillSlotConfig, SkillSlotSummary } from './skill-slots';
import type { Status } from './status';

export class CharacterBuilder {
  constructor(
    private readonly factory: (id: string | undefined, name: string) => Character,
    private readonly name: string,
    private readonly id?: string,
    private readonly startingSkills: readonly (readonly [string, number])[] = [],
  ) {
    Object.freeze(this);
  }

  withId(id: string): CharacterBuilder {
    return new CharacterBuilder(this.factory, this.name, id, this.startingSkills);
  }

  withStartingSkill(name: string, level: number): CharacterBuilder {
    return new CharacterBuilder(this.factory, this.name, this.id, [...this.startingSkills, [name, level]]);
  }

  build(): Character {
    return this.startingSkills.reduce(
      (character, [name, level]) => character.addSkill(name, level),
      this.factory(this.id, this.name),
    );
  }
}

function findByIdOrName<T extends { readonly id: string; readonly name: string }>(
  items: readonly T[], idOrName: string, kind: string,
): T {
  const normalized = idOrName.trim().toLowerCase();
  const found = items.find((item) => item.id === idOrName || item.name.toLowerCase() === normalized);
  if (!found) throw new Error(`${kind} not found: ${idOrName}`);
  return found;
}

type AddSkillOptions = { readonly parentSkillId?: string; readonly slotConfig?: SkillSlotConfig | null; readonly replaceSkillIdOrName?: string };

export class Character {
  readonly skills: readonly Skill[];
  readonly statuses: readonly Status[];
  readonly purchasedSlots: Readonly<Record<number, number>>;

  private constructor(
    readonly id: string,
    readonly name: string,
    readonly xp: number,
    skills: readonly Skill[],
    readonly pendingAdvancement: PendingAdvancement | null = null,
    statuses: readonly Status[] = [],
    purchasedSlots: Readonly<Record<number, number>> = {},
  ) {
    this.skills = Object.freeze([...skills]);
    this.statuses = Object.freeze([...statuses]);
    this.purchasedSlots = Object.freeze({ ...purchasedSlots });
    Object.freeze(this);
  }

  static create(name: string, options?: { readonly id?: string }): Character {
    const builder = Character.builder(name);
    return (options?.id !== undefined ? builder.withId(options.id) : builder).build();
  }

  static builder(name: string): CharacterBuilder {
    return new CharacterBuilder(
      (id, rawName) =>
        new Character(
          resolveId(id),
          requireNonBlank(rawName, 'Character name'),
          0,
          [new Skill({ name: DEFAULT_STARTING_SKILL_NAME, level: 1 })],
        ),
      name,
    );
  }

  static deserialize(serialized: string): Character {
    return deserializeCharacter(serialized);
  }

  /** @internal */
  static rehydrate(id: string, name: string, xp: number, skills: readonly Skill[], pendingAdvancement: PendingAdvancement | null, statuses: readonly Status[], purchasedSlots?: Readonly<Record<number, number>>): Character {
    return new Character(id, name, xp, skills, pendingAdvancement, statuses, purchasedSlots);
  }

  skill(idOrName: string): Skill { return findByIdOrName(this.skills, idOrName, 'Skill'); }

  /** @internal */
  status(idOrName: string): Status { return findByIdOrName(this.statuses, idOrName, 'Status'); }

  private copy(patch: {
    readonly xp?: number; readonly skills?: readonly Skill[]; readonly pendingAdvancement?: PendingAdvancement | null; readonly statuses?: readonly Status[];
  }): Character {
    const pending = patch.pendingAdvancement !== undefined ? patch.pendingAdvancement : this.pendingAdvancement;
    return new Character(this.id, this.name, patch.xp ?? this.xp, patch.skills ?? this.skills, pending, patch.statuses ?? this.statuses, this.purchasedSlots);
  }

  private insertSkill(name: string, level: number, options?: AddSkillOptions): { readonly skills: readonly Skill[]; readonly created: Skill; readonly replaced?: Skill } {
    const created = new Skill({ name, level, parentSkillId: options?.parentSkillId });
    const replaced = options?.replaceSkillIdOrName !== undefined ? this.skill(options.replaceSkillIdOrName) : undefined;
    if (replaced) {
      if (replaced.name.toLowerCase() === DEFAULT_STARTING_SKILL_NAME.toLowerCase()) throw new Error(`Cannot replace ${DEFAULT_STARTING_SKILL_NAME}`);
      if (replaced.level !== created.level) throw new Error(`Replaced skill must be level ${created.level}`);
    }
    const remaining = replaced ? this.skills.filter((s) => s.id !== replaced.id) : this.skills;
    if (remaining.some((s) => s.name.toLowerCase() === created.name.toLowerCase())) throw new Error(`Duplicate skill name: ${created.name}`);
    const summary = this.getSkillSlotSummary(created.level, options?.slotConfig);
    if (summary.maxSlots !== null && summary.usedSlots - (replaced ? 1 : 0) >= summary.maxSlots) {
      throw new Error(`No available skill slots at level ${created.level}`);
    }
    return { skills: [...remaining, created], created, replaced };
  }

  addSkill(name: string, level: number, options?: AddSkillOptions): Character {
    return this.copy({ skills: this.insertSkill(name, level, options).skills });
  }

  addStatus(status: Status): Character {
    return this.copy({ statuses: [...this.statuses, status] });
  }

  removeStatus(statusIdOrName: string): Character {
    const target = this.status(statusIdOrName);
    return this.copy({ statuses: this.statuses.filter((s) => s.id !== target.id) });
  }

  getSkillSlotSummary(level: number, slotConfig?: SkillSlotConfig | null): SkillSlotSummary {
    requireInt(level, 1, 'Skill level');
    const usedSlots = this.skills.filter((s) => s.level === level).length;
    if (!slotConfig) return new SkillSlotSummary(level, null, usedSlots, 0);
    const base = slotConfig.baseLimitForLevel(level);
    if (base === null) return new SkillSlotSummary(level, null, usedSlots, 0);
    const effectivePurchasedSlots = slotConfig.allowSlotPurchase ? (this.purchasedSlots[level] ?? 0) : 0;
    return new SkillSlotSummary(level, base + effectivePurchasedSlots, usedSlots, effectivePurchasedSlots);
  }

  makeCheck(skillIdOrName: string): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this, this.skill(skillIdOrName));
  }

  advance(newSkillName: string): CharacterAdvancementBuilder {
    return new CharacterAdvancementBuilder(this, newSkillName);
  }

  dismissAdvancement(): Character {
    return this.copy({ pendingAdvancement: null });
  }

  serialize(): string {
    return serializeCharacter(this);
  }

  /** @internal */
  claimAdvancement(newSkillName: string, slotConfig?: SkillSlotConfig | null, replaceSkillIdOrName?: string): AdvancementOutcome {
    const pending = this.pendingAdvancement;
    if (!pending) throw new Error('No pending advancement to claim');
    const { skills, created, replaced } = this.insertSkill(newSkillName, pending.targetLevel, {
      parentSkillId: pending.usedSkillId, slotConfig, replaceSkillIdOrName,
    });
    const next = this.copy({ xp: this.xp - pending.xpCostToAdvance, skills, pendingAdvancement: null });
    return new AdvancementOutcome(next, created, pending.xpCostToAdvance, 0, replaced);
  }

  /** @internal */
  applyRoll(
    skillUsed: Skill,
    rawDice: readonly DieValue[],
    checkOutcome: CheckOutcome,
    xpEarned: number,
    actionDescription?: string,
  ): Character {
    const nextXp = this.xp + xpEarned;
    const candidate = new PendingAdvancement({
      usedSkillId: skillUsed.id,
      usedSkillName: skillUsed.name,
      usedSkillLevel: skillUsed.level,
      rawDice,
      checkOutcome,
      actionDescription,
    });
    return this.copy({ xp: nextXp, pendingAdvancement: nextXp >= candidate.xpCostToAdvance ? candidate : null });
  }
}
