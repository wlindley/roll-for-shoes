import type { DieValue } from '../dice';
import type { CheckOutcome } from '../checks';
import { AdvancementOutcome, CharacterAdvancementBuilder, CharacterCheckBuilder, PendingAdvancement } from './builders';
import { deserializeCharacter, serializeCharacter } from './serialize';
import { DEFAULT_STARTING_SKILL_NAME, requireNonBlank, resolveId, Skill } from './skill';
import type { Status } from './status';

export class CharacterBuilder {
  constructor(
    private readonly factory: (id: string | undefined, name: string) => Character,
    private readonly name: string,
    private readonly id?: string,
  ) {}

  withId(id: string): CharacterBuilder {
    return new CharacterBuilder(this.factory, this.name, id);
  }

  build(): Character {
    return this.factory(this.id, this.name);
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

export class Character {
  readonly skills: readonly Skill[];
  readonly statuses: readonly Status[];
  readonly purchasedSlots: Readonly<Record<number, number>> = Object.freeze({});

  private constructor(
    readonly id: string,
    readonly name: string,
    readonly xp: number,
    skills: readonly Skill[],
    readonly pendingAdvancement: PendingAdvancement | null = null,
    statuses: readonly Status[] = [],
  ) {
    this.skills = Object.freeze([...skills]);
    this.statuses = Object.freeze([...statuses]);
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
  static rehydrate(id: string, name: string, xp: number, skills: readonly Skill[], pendingAdvancement: PendingAdvancement | null, statuses: readonly Status[]): Character {
    return new Character(id, name, xp, skills, pendingAdvancement, statuses);
  }

  skill(idOrName: string): Skill { return findByIdOrName(this.skills, idOrName, 'Skill'); }

  /** @internal */
  status(idOrName: string): Status { return findByIdOrName(this.statuses, idOrName, 'Status'); }

  private createUniqueSkill(name: string, level: number, parentSkillId?: string): Skill {
    const created = new Skill({ name, level, parentSkillId });
    if (this.skills.some((s) => s.name.toLowerCase() === created.name.toLowerCase())) {
      throw new Error(`Duplicate skill name: ${created.name}`);
    }
    return created;
  }

  addSkill(name: string, level: number, options?: { readonly parentSkillId?: string }): Character {
    const created = this.createUniqueSkill(name, level, options?.parentSkillId);
    return new Character(this.id, this.name, this.xp, [...this.skills, created], this.pendingAdvancement, this.statuses);
  }

  addStatus(status: Status): Character {
    return new Character(this.id, this.name, this.xp, this.skills, this.pendingAdvancement, [...this.statuses, status]);
  }

  removeStatus(statusIdOrName: string): Character {
    const target = this.status(statusIdOrName);
    return new Character(this.id, this.name, this.xp, this.skills, this.pendingAdvancement, this.statuses.filter((s) => s.id !== target.id));
  }

  makeCheck(skillIdOrName: string): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this, this.skill(skillIdOrName));
  }

  advance(newSkillName: string): CharacterAdvancementBuilder {
    return new CharacterAdvancementBuilder(this, newSkillName);
  }

  dismissAdvancement(): Character {
    return new Character(this.id, this.name, this.xp, this.skills, null, this.statuses);
  }

  serialize(): string {
    return serializeCharacter(this);
  }

  /** @internal */
  claimAdvancement(newSkillName: string): AdvancementOutcome {
    const pending = this.pendingAdvancement;
    if (!pending) throw new Error('No pending advancement to claim');
    const created = this.createUniqueSkill(newSkillName, pending.targetLevel, pending.usedSkillId);
    const next = new Character(this.id, this.name, this.xp - pending.xpCostToAdvance, [...this.skills, created], null, this.statuses);
    return new AdvancementOutcome(next, created, pending.xpCostToAdvance, 0);
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
    return new Character(this.id, this.name, nextXp, this.skills, nextXp >= candidate.xpCostToAdvance ? candidate : null, this.statuses);
  }
}
