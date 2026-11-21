export const DEFAULT_STARTING_SKILL_NAME = 'Do Anything';

export function requireNonBlank(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${label} cannot be blank`);
  return trimmed;
}

export function resolveId(id?: string): string {
  return id !== undefined ? requireNonBlank(id, 'ID') : globalThis.crypto.randomUUID();
}

export class Skill {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly parentSkillId?: string;

  constructor(props: {
    readonly id?: string;
    readonly name: string;
    readonly level: number;
    readonly parentSkillId?: string;
  }) {
    if (!Number.isInteger(props.level) || props.level < 1) {
      throw new RangeError(`Skill level must be a positive integer, received ${props.level}`);
    }
    this.id = resolveId(props.id);
    this.name = requireNonBlank(props.name, 'Skill name');
    this.level = props.level;
    this.parentSkillId = props.parentSkillId;
    Object.freeze(this);
  }
}
