import type React from 'react';
import { useId, useState } from 'react';
import type { CampaignRulesConfig } from '../../campaign';
import { SkillSlotConfig } from '../../character';
import type { TiesMode } from '../../checks';
import { formatError } from '../error';
import { ModalDialog } from './ModalDialog';

type SlotMode = 'unlimited' | 'triangle';

export interface CampaignSettingsDialogProps {
  readonly open: boolean;
  readonly campaignName: string;
  readonly rules: CampaignRulesConfig;
  readonly onSaveRules: (patch: Partial<CampaignRulesConfig>) => void;
  readonly onClose: () => void;
}

function CampaignSettingsForm({ rules, onSaveRules, onClose }: Omit<CampaignSettingsDialogProps, 'open' | 'campaignName'>): React.JSX.Element {
  const [tiesMode, setTiesMode] = useState<TiesMode>(rules.tiesMode);
  const [statusesEnabled, setStatusesEnabled] = useState(rules.statusesEnabled);
  const [allowCustomStartingSkills, setAllowCustomStartingSkills] = useState(rules.allowCustomStartingSkills);
  const [slotMode, setSlotMode] = useState<SlotMode>(rules.skillSlots ? 'triangle' : 'unlimited');
  const [allowSlotPurchase, setAllowSlotPurchase] = useState(rules.skillSlots?.allowSlotPurchase ?? false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const baseId = useId();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const skillSlots = slotMode === 'triangle' ? SkillSlotConfig.triangle({ allowSlotPurchase }) : null;
      onSaveRules({ tiesMode, statusesEnabled, allowCustomStartingSkills, skillSlots });
      onClose();
    } catch (err: unknown) {
      setDialogError(formatError(err, 'Unable to update campaign rules.'));
    }
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {dialogError && <div className="error-banner" role="alert">{dialogError}</div>}
      <label htmlFor={`${baseId}-ties`}>Tie resolution</label>
      <select id={`${baseId}-ties`} value={tiesMode} onChange={(e) => setTiesMode(e.target.value as TiesMode)}>
        <option value="fail">Basic Rules — Ties Fail (+1 XP)</option>
        <option value="twist">Advanced Rules — Partial Success with Twist (0 XP)</option>
      </select>
      <label htmlFor={`${baseId}-slots`}>Skill slots</label>
      <select id={`${baseId}-slots`} value={slotMode} onChange={(e) => setSlotMode(e.target.value as SlotMode)}>
        <option value="unlimited">Unlimited</option>
        <option value="triangle">Skill Triangle (4 / 3 / 2)</option>
      </select>
      {slotMode === 'triangle' && (
        <label className="row">
          <input type="checkbox" checked={allowSlotPurchase} onChange={(e) => setAllowSlotPurchase(e.target.checked)} />
          Allow Purchasing Extra Slots with XP
        </label>
      )}
      <label className="row">
        <input type="checkbox" checked={statusesEnabled} onChange={(e) => setStatusesEnabled(e.target.checked)} />
        Enable Statuses (persistent bonuses &amp; penalties)
      </label>
      <label className="row">
        <input type="checkbox" checked={allowCustomStartingSkills} onChange={(e) => setAllowCustomStartingSkills(e.target.checked)} />
        Allow Custom Starting Skills
      </label>
      <div className="row">
        <button type="submit" className="btn btn-primary">Save Rules</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export function CampaignSettingsDialog({ open, campaignName, rules, onSaveRules, onClose }: CampaignSettingsDialogProps): React.JSX.Element {
  return (
    <ModalDialog open={open} title={`Campaign Rules — ${campaignName}`} onClose={onClose}>
      {open && <CampaignSettingsForm rules={rules} onSaveRules={onSaveRules} onClose={onClose} />}
    </ModalDialog>
  );
}
