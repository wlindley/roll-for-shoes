import { assertPositiveInt } from '../dice';

function requireInt(value: number, min: number, label: string): number {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`${label} must be an integer >= ${min}`);
  return value;
}

export class SkillSlotConfig {
  readonly limitsByLevel: Readonly<Record<number, number>>;
  readonly allowSlotPurchase: boolean;
  readonly defaultSlotsAboveMax: number;

  constructor(options: { readonly limitsByLevel: Readonly<Record<number, number>>; readonly allowSlotPurchase?: boolean; readonly defaultSlotsAboveMax?: number }) {
    const limits: Record<number, number> = {};
    for (const [k, v] of Object.entries(options.limitsByLevel)) {
      limits[requireInt(Number(k), 2, 'Skill slot level')] = requireInt(v, 0, 'Skill slot limit');
    }
    this.limitsByLevel = Object.freeze(limits);
    this.allowSlotPurchase = options.allowSlotPurchase ?? false;
    this.defaultSlotsAboveMax = requireInt(options.defaultSlotsAboveMax ?? (this.allowSlotPurchase ? 0 : 1), 0, 'defaultSlotsAboveMax');
    Object.freeze(this);
  }

  static triangle(options?: { readonly allowSlotPurchase?: boolean }): SkillSlotConfig {
    return new SkillSlotConfig({ limitsByLevel: { 2: 4, 3: 3, 4: 2 }, allowSlotPurchase: options?.allowSlotPurchase });
  }

  static slotCostForLevel(level: number): number {
    assertPositiveInt(level, 'Skill level');
    return 2 * level;
  }

  baseLimitForLevel(level: number): number | null {
    assertPositiveInt(level, 'Skill level');
    return level === 1 ? null : (this.limitsByLevel[level] ?? this.defaultSlotsAboveMax);
  }
}

export class UnrestrictedSkillSlotSummary {
  readonly kind = 'unrestricted' as const;
  constructor(readonly level: number, readonly usedSlots: number) {
    Object.freeze(this);
  }
}

export class CappedSkillSlotSummary {
  readonly kind = 'capped' as const;
  constructor(
    readonly level: number,
    readonly maxSlots: number,
    readonly usedSlots: number,
    readonly effectivePurchasedSlots: number,
    readonly nextSlotXpCost: number | null,
  ) {
    Object.freeze(this);
  }

  get availableSlots(): number {
    return Math.max(0, this.maxSlots - this.usedSlots);
  }
}

export type SkillSlotSummary = UnrestrictedSkillSlotSummary | CappedSkillSlotSummary;
