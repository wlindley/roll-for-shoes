import type { TiesMode } from '../checks';
import { type Character, DEFAULT_STARTING_SKILL_NAME, type SkillSlotConfig } from '../character';

export interface CampaignRulesConfig {
  readonly tiesMode: TiesMode;
  readonly statusesEnabled: boolean;
  readonly allowCustomStartingSkills: boolean;
  readonly skillSlots: SkillSlotConfig | null;
}

export const BASIC_CAMPAIGN_RULES: CampaignRulesConfig = Object.freeze({
  tiesMode: 'fail',
  statusesEnabled: false,
  allowCustomStartingSkills: false,
  skillSlots: null,
});

export function assertAllowedStartingSkills(rules: CampaignRulesConfig, character: Character): void {
  if (!rules.allowCustomStartingSkills && character.skills.some((s) => s.name !== DEFAULT_STARTING_SKILL_NAME)) {
    throw new Error('Custom starting skills are disabled in this campaign');
  }
}

export function assertStatusesEnabled(rules: CampaignRulesConfig): void {
  if (!rules.statusesEnabled) {
    throw new Error('Statuses are disabled in this campaign');
  }
}
