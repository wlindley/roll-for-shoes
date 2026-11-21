import { DEFAULT_STARTING_SKILL_NAME, requireNonBlank, resolveId, Skill } from './skill';

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

export class Character {
  readonly skills: readonly Skill[];
  readonly statuses: readonly never[] = Object.freeze([]);
  readonly purchasedSlots: Readonly<Record<number, number>> = Object.freeze({});
  readonly pendingAdvancement: null = null;

  private constructor(
    readonly id: string,
    readonly name: string,
    readonly xp: number,
    skills: readonly Skill[],
  ) {
    this.skills = Object.freeze([...skills]);
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

  skill(idOrName: string): Skill {
    const normalized = idOrName.trim().toLowerCase();
    const found = this.skills.find((s) => s.id === idOrName || s.name.toLowerCase() === normalized);
    if (!found) throw new Error(`Skill not found: ${idOrName}`);
    return found;
  }

  addSkill(name: string, level: number, options?: { readonly parentSkillId?: string }): Character {
    const created = new Skill({ name, level, parentSkillId: options?.parentSkillId });
    if (this.skills.some((s) => s.name.toLowerCase() === created.name.toLowerCase())) {
      throw new Error(`Duplicate skill name: ${created.name}`);
    }
    return new Character(this.id, this.name, this.xp, [...this.skills, created]);
  }
}
