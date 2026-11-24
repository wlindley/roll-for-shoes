import type React from 'react';
import { useId, useState } from 'react';
import type { Campaign, ScopedDefenderBuilder } from '../../campaign';
import type { CharacterCheckOutcome, OpposedCharacterCheckOutcome, Status } from '../../character';
import { type CheckOpposition, DifficultyOpposition, DifficultyTier, RolledOpposition, StaticOpposition } from '../../checks';
import type { DiceRoller, DieValue } from '../../dice';
import { formatError } from '../error';
import { normalizePhysicalDice, PhysicalDiceInput } from './PhysicalDiceInput';
import { RollSummary } from './RollSummary';

export interface CheckRollerPanelProps {
  readonly campaign: Campaign;
  readonly diceRoller: DiceRoller;
  readonly selectedActorId: string | null;
  readonly onSelectActor: (characterId: string) => void;
  readonly onCampaignChange: (next: Campaign) => void;
  readonly onError: (message: string) => void;
}

interface ActorCheckState {
  readonly actorSkillId: string;
  readonly actionDescription: string;
  readonly actorStatusIds: readonly string[];
  readonly actorModLabel: string;
  readonly actorModValue: string;
  readonly actorPhysicalDice: readonly DieValue[] | null;
}

type DifficultyFormState =
  | { readonly kind: 'difficulty'; readonly tier: DifficultyTier; readonly mode: 'static' }
  | { readonly kind: 'difficulty'; readonly tier: DifficultyTier; readonly mode: 'dynamic'; readonly physicalDice: readonly DieValue[] | null };

type OppositionFormState =
  | { readonly kind: 'static'; readonly target: string }
  | { readonly kind: 'rolled'; readonly diceCount: string; readonly physicalDice: readonly DieValue[] | null }
  | DifficultyFormState
  | {
      readonly kind: 'character';
      readonly defenderId: string;
      readonly defenderSkillId: string;
      readonly defenderStatusIds: readonly string[];
      readonly physicalDice: readonly DieValue[] | null;
    };

type LatestRoll =
  | { readonly campaignId: string; readonly kind: 'vs_opposition'; readonly outcome: CharacterCheckOutcome }
  | { readonly campaignId: string; readonly kind: 'character_opposed'; readonly outcome: OpposedCharacterCheckOutcome };

const INITIAL_ACTOR_STATE: ActorCheckState = {
  actorSkillId: '',
  actionDescription: '',
  actorStatusIds: [],
  actorModLabel: '',
  actorModValue: '',
  actorPhysicalDice: null,
};

const DIFFICULTY_OPTIONS: readonly { readonly tier: DifficultyTier; readonly label: string }[] = [
  { tier: DifficultyTier.Easy, label: 'Easy (1d6 / 3)' },
  { tier: DifficultyTier.Moderate, label: 'Moderate (2d6 / 6)' },
  { tier: DifficultyTier.Hard, label: 'Hard (3d6 / 9)' },
  { tier: DifficultyTier.VeryHard, label: 'Very Hard (4d6 / 12)' },
];

const toggleId = (ids: readonly string[], id: string): readonly string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

const isOppositionKind = (v: string): v is OppositionFormState['kind'] =>
  v === 'static' || v === 'rolled' || v === 'difficulty' || v === 'character';

const parseTier = (v: string): DifficultyTier => {
  const n = Number(v);
  return n === DifficultyTier.Easy || n === DifficultyTier.Hard || n === DifficultyTier.VeryHard ? n : DifficultyTier.Moderate;
};

function defaultOpposition(kind: OppositionFormState['kind']): OppositionFormState {
  switch (kind) {
    case 'static': return { kind: 'static', target: '6' };
    case 'rolled': return { kind: 'rolled', diceCount: '2', physicalDice: null };
    case 'difficulty': return { kind: 'difficulty', tier: DifficultyTier.Moderate, mode: 'static' };
    case 'character': return { kind: 'character', defenderId: '', defenderSkillId: '', defenderStatusIds: [], physicalDice: null };
  }
}

function buildVsOpposition(opp: Exclude<OppositionFormState, { readonly kind: 'character' }>): CheckOpposition {
  switch (opp.kind) {
    case 'static':
      return new StaticOpposition(Number(opp.target));
    case 'rolled': {
      const count = Number(opp.diceCount);
      const base = RolledOpposition.withDice(count);
      return opp.physicalDice !== null ? base.withDiceValues(normalizePhysicalDice(opp.physicalDice, count)) : base;
    }
    case 'difficulty': {
      if (opp.mode === 'static') return DifficultyOpposition.static(opp.tier);
      const base = DifficultyOpposition.dynamic(opp.tier);
      return opp.physicalDice !== null ? base.withDiceValues(normalizePhysicalDice(opp.physicalDice, opp.tier)) : base;
    }
  }
}

function resetOppositionDice(opp: OppositionFormState): OppositionFormState {
  if (opp.kind === 'static' || (opp.kind === 'difficulty' && opp.mode === 'static')) return opp;
  return opp.physicalDice === null ? opp : { ...opp, physicalDice: [] };
}

export function CheckRollerPanel(props: CheckRollerPanelProps): React.JSX.Element {
  const { campaign, diceRoller, selectedActorId, onSelectActor, onCampaignChange, onError } = props;
  const characters = campaign.characters;

  const [actorState, setActorState] = useState<ActorCheckState>(INITIAL_ACTOR_STATE);
  const [opposition, setOpposition] = useState<OppositionFormState>({ kind: 'static', target: '6' });
  const [latestRoll, setLatestRoll] = useState<LatestRoll | null>(null);
  const baseId = useId();

  const firstCharacter = characters[0];
  if (!firstCharacter) {
    return (
      <section className="panel stack" aria-label="Check roller">
        <h2>Roll a Check</h2>
        <p className="muted">Create a character above to begin rolling checks.</p>
      </section>
    );
  }

  const actor = characters.find((c) => c.id === selectedActorId) ?? firstCharacter;
  const actorSkill = actor.skills.find((s) => s.id === actorState.actorSkillId) ?? actor.skills[0]!;
  const otherCharacters = characters.filter((c) => c.id !== actor.id);
  const defender = opposition.kind === 'character'
    ? (otherCharacters.find((c) => c.id === opposition.defenderId) ?? otherCharacters[0] ?? null)
    : null;
  const defenderSkill = defender && opposition.kind === 'character'
    ? (defender.skills.find((s) => s.id === opposition.defenderSkillId) ?? defender.skills[0] ?? null)
    : null;
  const canRoll = opposition.kind !== 'character' || (defender !== null && defenderSkill !== null);
  const oppPoolSize =
    opposition.kind === 'rolled'
      ? (Number.isInteger(Number(opposition.diceCount)) && Number(opposition.diceCount) >= 1 ? Math.min(Number(opposition.diceCount), 20) : 1)
      : opposition.kind === 'difficulty' && opposition.mode === 'dynamic'
        ? opposition.tier
        : opposition.kind === 'character' && defenderSkill
          ? defenderSkill.level
          : null;

  const handleRoll = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const trimmedAction = actorState.actionDescription.trim();
      let builder = campaign.character(actor.id).makeCheck(actorSkill.id);
      if (trimmedAction) builder = builder.withAction(trimmedAction);
      if (actorState.actorPhysicalDice !== null) {
        builder = builder.withDiceValues(normalizePhysicalDice(actorState.actorPhysicalDice, actorSkill.level));
      }
      if (campaign.rules.statusesEnabled) {
        for (const s of actor.statuses) if (actorState.actorStatusIds.includes(s.id)) builder = builder.withStatus(s.id);
      }
      const modNum = Number(actorState.actorModValue);
      if (actorState.actorModValue.trim() !== '' && Number.isInteger(modNum) && modNum !== 0) {
        builder = builder.withModifier(actorState.actorModLabel.trim() || 'Situational', modNum);
      }

      if (opposition.kind === 'character') {
        if (!defender || !defenderSkill) return;
        const defStatuses = campaign.rules.statusesEnabled ? defender.statuses.filter((s) => opposition.defenderStatusIds.includes(s.id)) : [];
        const configureDef = (defStatuses.length > 0 || opposition.physicalDice !== null)
          ? (b: ScopedDefenderBuilder) => {
              const withSts = defStatuses.reduce((acc, s) => acc.withStatus(s.id), b);
              return opposition.physicalDice !== null ? withSts.withDiceValues(normalizePhysicalDice(opposition.physicalDice, defenderSkill.level)) : withSts;
            }
          : undefined;
        const res = builder.againstCharacter(defender.id, defenderSkill.id, configureDef).roll(diceRoller);
        onCampaignChange(res.campaign);
        setLatestRoll({ campaignId: campaign.id, kind: 'character_opposed', outcome: res.outcome });
      } else {
        const res = builder.against(buildVsOpposition(opposition)).roll(diceRoller);
        onCampaignChange(res.campaign);
        setLatestRoll({ campaignId: campaign.id, kind: 'vs_opposition', outcome: res.outcome });
      }
      setActorState((prev) => ({
        ...prev,
        actionDescription: '',
        actorModLabel: '',
        actorModValue: '',
        actorPhysicalDice: prev.actorPhysicalDice === null ? null : [],
      }));
      setOpposition(resetOppositionDice);
    } catch (err: unknown) {
      onError(formatError(err, 'Unable to resolve check.'));
    }
  };

  const activeRoll = latestRoll?.campaignId === campaign.id ? latestRoll : null;
  const renderStatusToggles = (label: string, statuses: readonly Status[], selectedIds: readonly string[], onToggle: (id: string) => void) =>
    campaign.rules.statusesEnabled && statuses.length > 0 ? (
      <div className="row" role="group" aria-label={label}>
        <span className="muted">{label}:</span>
        {statuses.map((s) => (
          <label key={s.id} className="field-inline">
            <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => onToggle(s.id)} />
            {s.rating > 0 ? `+${s.rating}` : s.rating} {s.name}
          </label>
        ))}
      </div>
    ) : null;

  return (
    <section className="panel stack" aria-label="Check roller">
      <h2>Roll a Check</h2>
      <form className="stack" onSubmit={handleRoll}>
        <div className="row">
          <div className="field-inline"><label htmlFor={`${baseId}-actor`}>Actor</label><select id={`${baseId}-actor`} value={actor.id} onChange={(e) => { onSelectActor(e.target.value); setActorState((s) => ({ ...s, actorSkillId: '', actorStatusIds: [] })); }}>{characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field-inline"><label htmlFor={`${baseId}-skill`}>Skill</label><select id={`${baseId}-skill`} value={actorSkill.id} onChange={(e) => setActorState((s) => ({ ...s, actorSkillId: e.target.value }))}>{actor.skills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.level}d6)</option>)}</select></div>
          <div className="field-inline field-grow"><label htmlFor={`${baseId}-action`}>Action</label><input id={`${baseId}-action`} type="text" value={actorState.actionDescription} onChange={(e) => setActorState((s) => ({ ...s, actionDescription: e.target.value }))} placeholder="Say what you do…" /></div>
        </div>
        <PhysicalDiceInput
          label="Enter actor physical dice"
          diceCount={actorSkill.level}
          value={actorState.actorPhysicalDice}
          onChange={(actorPhysicalDice) => setActorState((s) => ({ ...s, actorPhysicalDice }))}
        />
        {renderStatusToggles(`${actor.name} statuses`, actor.statuses, actorState.actorStatusIds, (id) => setActorState((s) => ({ ...s, actorStatusIds: toggleId(s.actorStatusIds, id) })))}
        <div className="row">
          <div className="field-inline"><label htmlFor={`${baseId}-modval`}>Modifier</label><input id={`${baseId}-modval`} type="number" step={1} value={actorState.actorModValue} onChange={(e) => setActorState((s) => ({ ...s, actorModValue: e.target.value }))} placeholder="+2 / -4" /></div>
          <input aria-label="Modifier label" type="text" value={actorState.actorModLabel} onChange={(e) => setActorState((s) => ({ ...s, actorModLabel: e.target.value }))} placeholder="Modifier label (optional)" />
        </div>
        <fieldset className="stack">
          <legend>Opposition</legend>
          <div className="row">
            <div className="field-inline">
              <label htmlFor={`${baseId}-mode`}>Mode</label>
              <select id={`${baseId}-mode`} value={opposition.kind} onChange={(e) => { if (isOppositionKind(e.target.value)) setOpposition(defaultOpposition(e.target.value)); }}>
                <option value="static">Static Target</option><option value="rolled">GM Dynamic Dice</option>
                <option value="difficulty">Difficulty Preset</option><option value="character">Character Opposed</option>
              </select>
            </div>
            {opposition.kind === 'static' && <div className="field-inline"><label htmlFor={`${baseId}-target`}>Target</label><input id={`${baseId}-target`} type="number" step={1} value={opposition.target} onChange={(e) => setOpposition({ kind: 'static', target: e.target.value })} required /></div>}
            {opposition.kind === 'rolled' && <div className="field-inline"><label htmlFor={`${baseId}-gmdice`}>GM Dice (d6)</label><input id={`${baseId}-gmdice`} type="number" min={1} max={20} step={1} value={opposition.diceCount} onChange={(e) => setOpposition({ ...opposition, diceCount: e.target.value })} required /></div>}
            {opposition.kind === 'difficulty' && (
              <>
                <div className="field-inline"><label htmlFor={`${baseId}-tier`}>Difficulty</label><select id={`${baseId}-tier`} value={opposition.tier} onChange={(e) => setOpposition({ ...opposition, tier: parseTier(e.target.value) })}>{DIFFICULTY_OPTIONS.map((opt) => <option key={opt.tier} value={opt.tier}>{opt.label}</option>)}</select></div>
                <div className="field-inline"><label htmlFor={`${baseId}-diffmode`}>Resolution</label><select id={`${baseId}-diffmode`} value={opposition.mode} onChange={(e) => setOpposition(e.target.value === 'dynamic' ? { kind: 'difficulty', tier: opposition.tier, mode: 'dynamic', physicalDice: null } : { kind: 'difficulty', tier: opposition.tier, mode: 'static' })}><option value="static">Static Target</option><option value="dynamic">Dynamic Roll</option></select></div>
              </>
            )}
            {opposition.kind === 'character' && (!defender || !defenderSkill ? (
              <span className="muted">Add another character to roll opposed checks.</span>
            ) : (
              <>
                <div className="field-inline"><label htmlFor={`${baseId}-def`}>Defender</label><select id={`${baseId}-def`} value={defender.id} onChange={(e) => setOpposition({ ...opposition, defenderId: e.target.value, defenderSkillId: '', defenderStatusIds: [] })}>{otherCharacters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="field-inline"><label htmlFor={`${baseId}-defskill`}>Defender Skill</label><select id={`${baseId}-defskill`} value={defenderSkill.id} onChange={(e) => setOpposition({ ...opposition, defenderSkillId: e.target.value })}>{defender.skills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.level}d6)</option>)}</select></div>
              </>
            ))}
          </div>
          {oppPoolSize !== null && opposition.kind !== 'static' && !(opposition.kind === 'difficulty' && opposition.mode === 'static') && (
            <PhysicalDiceInput
              label="Enter opposition physical dice"
              diceCount={oppPoolSize}
              value={opposition.physicalDice}
              onChange={(physicalDice) => setOpposition({ ...opposition, physicalDice })}
            />
          )}
          {opposition.kind === 'character' && defender && renderStatusToggles(`${defender.name} statuses`, defender.statuses, opposition.defenderStatusIds, (id) => setOpposition({ ...opposition, defenderStatusIds: toggleId(opposition.defenderStatusIds, id) }))}
        </fieldset>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!canRoll}>
            {actorState.actorPhysicalDice !== null ? `Resolve Check (${actorSkill.level}d6)` : `Roll ${actorSkill.level}d6`}
          </button>
        </div>
      </form>
      {activeRoll && (
        <output className="stack" aria-live="polite">
          <RollSummary
            title={
              activeRoll.kind === 'vs_opposition'
                ? `${activeRoll.outcome.character.name} — ${activeRoll.outcome.skillUsed.name}`
                : `${activeRoll.outcome.actor.name} (${activeRoll.outcome.actorSkill.name}) vs ${activeRoll.outcome.defender.name} (${activeRoll.outcome.defenderSkill.name})`
            }
            checkResult={activeRoll.outcome.checkResult}
            xpText={
              activeRoll.kind === 'vs_opposition'
                ? `XP earned: +${activeRoll.outcome.xpEarned} XP`
                : `XP earned: ${activeRoll.outcome.actor.name} +${activeRoll.outcome.actorXpEarned} XP, ${activeRoll.outcome.defender.name} +${activeRoll.outcome.defenderXpEarned} XP`
            }
            showTwistBanner
          />
        </output>
      )}
    </section>
  );
}
