import type React from 'react';
import { useId, useState } from 'react';
import type { Workspace } from '../../campaign';
import type { CharacterCheckOutcome, OpposedCharacterCheckOutcome, OpposedParticipantBuilder, Status } from '../../character';
import { type CheckOutcome, DifficultyOpposition, DifficultyTier, RolledOpposition, StaticOpposition } from '../../checks';
import type { DiceRoller, DieValue } from '../../dice';
import { normalizePhysicalDice, PhysicalDiceInput } from './PhysicalDiceInput';

export interface CheckRollerPanelProps {
  readonly workspace: Workspace;
  readonly diceRoller: DiceRoller;
  readonly selectedActorId: string | null;
  readonly onSelectActor: (characterId: string) => void;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

type OppositionMode = 'static' | 'rolled' | 'difficulty' | 'character';
type DifficultyMode = 'static' | 'dynamic';
type LatestRoll =
  | { readonly campaignId: string; readonly kind: 'vs_opposition'; readonly outcome: CharacterCheckOutcome }
  | { readonly campaignId: string; readonly kind: 'character_opposed'; readonly outcome: OpposedCharacterCheckOutcome };

const DIFFICULTY_OPTIONS: readonly { readonly tier: DifficultyTier; readonly label: string }[] = [
  { tier: DifficultyTier.Easy, label: 'Easy (1d6 / 3)' },
  { tier: DifficultyTier.Moderate, label: 'Moderate (2d6 / 6)' },
  { tier: DifficultyTier.Hard, label: 'Hard (3d6 / 9)' },
  { tier: DifficultyTier.VeryHard, label: 'Very Hard (4d6 / 12)' },
];

export function outcomeBadgeClass(outcome: CheckOutcome): string {
  if (outcome === 'success') return 'badge badge-success';
  if (outcome === 'tie') return 'badge badge-tie';
  return 'badge badge-failure';
}

export function outcomeLabel(outcome: CheckOutcome): string {
  return outcome === 'tie' ? 'TIE — Twist' : outcome.toUpperCase();
}

export function DiceRow({ dice }: { readonly dice: readonly DieValue[] }): React.JSX.Element {
  return <span className="row">{dice.map((d, i) => <span key={i} className={d === 6 ? 'die die-six' : 'die'}>{d}</span>)}</span>;
}

export function CheckRollerPanel(props: CheckRollerPanelProps): React.JSX.Element {
  const { workspace, diceRoller, selectedActorId, onSelectActor, onChange, onError } = props;
  const campaign = workspace.activeCampaign.campaign;
  const characters = campaign.characters;

  const [actorSkillId, setActorSkillId] = useState('');
  const [action, setAction] = useState('');
  const [actorPhysicalEnabled, setActorPhysicalEnabled] = useState(false);
  const [actorPhysicalDice, setActorPhysicalDice] = useState<readonly DieValue[]>([]);
  const [mode, setMode] = useState<OppositionMode>('static');
  const [staticTarget, setStaticTarget] = useState('6');
  const [gmDiceCount, setGmDiceCount] = useState('2');
  const [difficultyTier, setDifficultyTier] = useState<DifficultyTier>(DifficultyTier.Moderate);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>('static');
  const [defenderId, setDefenderId] = useState('');
  const [defenderSkillId, setDefenderSkillId] = useState('');
  const [oppPhysicalEnabled, setOppPhysicalEnabled] = useState(false);
  const [oppPhysicalDice, setOppPhysicalDice] = useState<readonly DieValue[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<readonly string[]>([]);
  const [modLabel, setModLabel] = useState('');
  const [modValue, setModValue] = useState('');
  const [latestRoll, setLatestRoll] = useState<LatestRoll | null>(null);
  const baseId = useId();
  const toggleStatus = (id: string) => setSelectedStatusIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

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
  const actorSkill = actor.skills.find((s) => s.id === actorSkillId) ?? actor.skills[0]!;
  const otherCharacters = characters.filter((c) => c.id !== actor.id);
  const defender = otherCharacters.find((c) => c.id === defenderId) ?? otherCharacters[0] ?? null;
  const defenderSkill = defender ? (defender.skills.find((s) => s.id === defenderSkillId) ?? defender.skills[0] ?? null) : null;
  const canRoll = mode !== 'character' || (defender !== null && defenderSkill !== null);
  const parsedGmDice = Number(gmDiceCount);
  const oppPoolSize =
    mode === 'rolled'
      ? (Number.isInteger(parsedGmDice) && parsedGmDice >= 1 ? Math.min(parsedGmDice, 20) : 1)
      : mode === 'difficulty' && difficultyMode === 'dynamic'
        ? difficultyTier
        : mode === 'character' && defenderSkill
          ? defenderSkill.level
          : null;

  const handleRoll = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const trimmedAction = action.trim();
      let builder = workspace.activeCampaign.character(actor.id).makeCheck(actorSkill.id);
      if (trimmedAction) builder = builder.withAction(trimmedAction);
      if (actorPhysicalEnabled) builder = builder.withDiceValues(normalizePhysicalDice(actorPhysicalDice, actorSkill.level));
      if (campaign.rules.statusesEnabled) {
        for (const s of actor.statuses) if (selectedStatusIds.includes(s.id)) builder = builder.withStatus(s.id);
      }
      const modNum = Number(modValue);
      if (modValue.trim() !== '' && Number.isInteger(modNum) && modNum !== 0) {
        builder = builder.withModifier(modLabel.trim() || 'Situational', modNum);
      }

      if (mode === 'character') {
        if (!defender || !defenderSkill) return;
        const defStatuses = campaign.rules.statusesEnabled ? defender.statuses.filter((s) => selectedStatusIds.includes(s.id)) : [];
        const configureDef = (defStatuses.length > 0 || oppPhysicalEnabled)
          ? (b: OpposedParticipantBuilder) => {
              const withSts = defStatuses.reduce((acc, s) => acc.withStatus(s.id), b);
              return oppPhysicalEnabled ? withSts.withDiceValues(normalizePhysicalDice(oppPhysicalDice, defenderSkill.level)) : withSts;
            }
          : undefined;
        const res = builder.againstCharacter(defender.id, defenderSkill.id, configureDef).roll(diceRoller);
        onChange(res.workspace);
        setLatestRoll({ campaignId: campaign.id, kind: 'character_opposed', outcome: res.outcome });
      } else {
        const count = Number(gmDiceCount);
        const opp =
          mode === 'static'
            ? new StaticOpposition(Number(staticTarget))
            : mode === 'rolled'
              ? (oppPhysicalEnabled ? new RolledOpposition(count).withDiceValues(normalizePhysicalDice(oppPhysicalDice, count)) : new RolledOpposition(count))
              : (difficultyMode === 'dynamic' && oppPhysicalEnabled
                  ? new DifficultyOpposition(difficultyTier, difficultyMode).withDiceValues(normalizePhysicalDice(oppPhysicalDice, difficultyTier))
                  : new DifficultyOpposition(difficultyTier, difficultyMode));
        const res = builder.against(opp).roll(diceRoller);
        onChange(res.workspace);
        setLatestRoll({ campaignId: campaign.id, kind: 'vs_opposition', outcome: res.outcome });
      }
      setAction('');
      setModLabel('');
      setModValue('');
      setActorPhysicalDice([]);
      setOppPhysicalDice([]);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to resolve check.');
    }
  };

  const activeRoll = latestRoll?.campaignId === campaign.id ? latestRoll : null;
  const checkResult = activeRoll?.outcome.checkResult;
  const renderStatusToggles = (label: string, statuses: readonly Status[]) =>
    campaign.rules.statusesEnabled && statuses.length > 0 ? (
      <div className="row" role="group" aria-label={label}>
        <span className="muted">{label}:</span>
        {statuses.map((s) => (
          <label key={s.id} className="field-inline">
            <input type="checkbox" checked={selectedStatusIds.includes(s.id)} onChange={() => toggleStatus(s.id)} />
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
          <div className="field-inline"><label htmlFor={`${baseId}-actor`}>Actor</label><select id={`${baseId}-actor`} value={actor.id} onChange={(e) => onSelectActor(e.target.value)}>{characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field-inline"><label htmlFor={`${baseId}-skill`}>Skill</label><select id={`${baseId}-skill`} value={actorSkill.id} onChange={(e) => setActorSkillId(e.target.value)}>{actor.skills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.level}d6)</option>)}</select></div>
          <div className="field-inline field-grow"><label htmlFor={`${baseId}-action`}>Action</label><input id={`${baseId}-action`} type="text" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Say what you do…" /></div>
        </div>
        <PhysicalDiceInput
          label="Enter actor physical dice"
          diceCount={actorSkill.level}
          enabled={actorPhysicalEnabled}
          values={actorPhysicalDice}
          onToggle={setActorPhysicalEnabled}
          onChange={setActorPhysicalDice}
        />
        {renderStatusToggles(`${actor.name} statuses`, actor.statuses)}
        <div className="row">
          <div className="field-inline"><label htmlFor={`${baseId}-modval`}>Modifier</label><input id={`${baseId}-modval`} type="number" step={1} value={modValue} onChange={(e) => setModValue(e.target.value)} placeholder="+2 / -4" /></div>
          <input aria-label="Modifier label" type="text" value={modLabel} onChange={(e) => setModLabel(e.target.value)} placeholder="Modifier label (optional)" />
        </div>
        <fieldset className="stack">
          <legend>Opposition</legend>
          <div className="row">
            <div className="field-inline">
              <label htmlFor={`${baseId}-mode`}>Mode</label>
              <select id={`${baseId}-mode`} value={mode} onChange={(e) => setMode(e.target.value as OppositionMode)}>
                <option value="static">Static Target</option><option value="rolled">GM Dynamic Dice</option>
                <option value="difficulty">Difficulty Preset</option><option value="character">Character Opposed</option>
              </select>
            </div>
            {mode === 'static' && <div className="field-inline"><label htmlFor={`${baseId}-target`}>Target</label><input id={`${baseId}-target`} type="number" step={1} value={staticTarget} onChange={(e) => setStaticTarget(e.target.value)} required /></div>}
            {mode === 'rolled' && <div className="field-inline"><label htmlFor={`${baseId}-gmdice`}>GM Dice (d6)</label><input id={`${baseId}-gmdice`} type="number" min={1} max={20} step={1} value={gmDiceCount} onChange={(e) => setGmDiceCount(e.target.value)} required /></div>}
            {mode === 'difficulty' && (
              <>
                <div className="field-inline"><label htmlFor={`${baseId}-tier`}>Difficulty</label><select id={`${baseId}-tier`} value={difficultyTier} onChange={(e) => setDifficultyTier(Number(e.target.value) as DifficultyTier)}>{DIFFICULTY_OPTIONS.map((opt) => <option key={opt.tier} value={opt.tier}>{opt.label}</option>)}</select></div>
                <div className="field-inline"><label htmlFor={`${baseId}-diffmode`}>Resolution</label><select id={`${baseId}-diffmode`} value={difficultyMode} onChange={(e) => setDifficultyMode(e.target.value as DifficultyMode)}><option value="static">Static Target</option><option value="dynamic">Dynamic Roll</option></select></div>
              </>
            )}
            {mode === 'character' && (!defender || !defenderSkill ? (
              <span className="muted">Add another character to roll opposed checks.</span>
            ) : (
              <>
                <div className="field-inline"><label htmlFor={`${baseId}-def`}>Defender</label><select id={`${baseId}-def`} value={defender.id} onChange={(e) => setDefenderId(e.target.value)}>{otherCharacters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="field-inline"><label htmlFor={`${baseId}-defskill`}>Defender Skill</label><select id={`${baseId}-defskill`} value={defenderSkill.id} onChange={(e) => setDefenderSkillId(e.target.value)}>{defender.skills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.level}d6)</option>)}</select></div>
              </>
            ))}
          </div>
          {oppPoolSize !== null && (
            <PhysicalDiceInput
              label="Enter opposition physical dice"
              diceCount={oppPoolSize}
              enabled={oppPhysicalEnabled}
              values={oppPhysicalDice}
              onToggle={setOppPhysicalEnabled}
              onChange={setOppPhysicalDice}
            />
          )}
          {mode === 'character' && defender && renderStatusToggles(`${defender.name} statuses`, defender.statuses)}
        </fieldset>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!canRoll}>
            {actorPhysicalEnabled ? `Resolve Check (${actorSkill.level}d6)` : `Roll ${actorSkill.level}d6`}
          </button>
        </div>
      </form>
      {activeRoll && checkResult && (
        <output className="stack" aria-live="polite">
          <div className="row-between">
            <strong className="roll-title">
              {activeRoll.kind === 'vs_opposition'
                ? `${activeRoll.outcome.character.name} — ${activeRoll.outcome.skillUsed.name}`
                : `${activeRoll.outcome.actor.name} (${activeRoll.outcome.actorSkill.name}) vs ${activeRoll.outcome.defender.name} (${activeRoll.outcome.defenderSkill.name})`}
            </strong>
            <span className={outcomeBadgeClass(checkResult.outcome)}>
              {outcomeLabel(checkResult.outcome)} (margin {checkResult.margin > 0 ? `+${checkResult.margin}` : checkResult.margin})
            </span>
          </div>
          {checkResult.outcome === 'tie' && (
            <p className="twist-banner">
              TIE — Partial Success with Twist (0 XP): Accomplish your goal barely, with an unexpected twist or minor consequence.
            </p>
          )}
          <div className="row">
            <span>Actor:</span>
            <DiceRow dice={checkResult.actor.rawDice} />
            <span className="badge">Total {checkResult.actor.finalTotal} (raw {checkResult.actor.rawTotal})</span>
            <span>vs</span>
            {checkResult.opposition.pool && <DiceRow dice={checkResult.opposition.pool.rawDice} />}
            <span className="badge">{checkResult.opposition.pool ? 'Opposition' : 'Target'} {checkResult.opposition.total}</span>
          </div>
          <p className="muted">
            {activeRoll.kind === 'vs_opposition' ? `XP earned: +${activeRoll.outcome.xpEarned} XP` : `XP earned: ${activeRoll.outcome.actor.name} +${activeRoll.outcome.actorXpEarned} XP, ${activeRoll.outcome.defender.name} +${activeRoll.outcome.defenderXpEarned} XP`}
          </p>
        </output>
      )}
    </section>
  );
}
