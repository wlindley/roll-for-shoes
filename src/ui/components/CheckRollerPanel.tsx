import type React from 'react';
import { useId, useState } from 'react';
import type { Workspace } from '../../campaign';
import type { CharacterCheckOutcome, OpposedCharacterCheckOutcome } from '../../character';
import { RolledOpposition, StaticOpposition } from '../../checks';
import type { DiceRoller, DieValue } from '../../dice';

export interface CheckRollerPanelProps {
  readonly workspace: Workspace;
  readonly diceRoller: DiceRoller;
  readonly selectedActorId: string | null;
  readonly onSelectActor: (characterId: string) => void;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

type OppositionMode = 'static' | 'rolled' | 'character';
type LatestRoll =
  | { readonly campaignId: string; readonly kind: 'vs_opposition'; readonly outcome: CharacterCheckOutcome }
  | { readonly campaignId: string; readonly kind: 'character_opposed'; readonly outcome: OpposedCharacterCheckOutcome };

export function DiceRow({ dice }: { readonly dice: readonly DieValue[] }): React.JSX.Element {
  return <span className="row">{dice.map((d, i) => <span key={i} className={d === 6 ? 'die die-six' : 'die'}>{d}</span>)}</span>;
}

export function CheckRollerPanel(props: CheckRollerPanelProps): React.JSX.Element {
  const { workspace, diceRoller, selectedActorId, onSelectActor, onChange, onError } = props;
  const campaign = workspace.activeCampaign.campaign;
  const characters = campaign.characters;

  const [actorSkillId, setActorSkillId] = useState('');
  const [action, setAction] = useState('');
  const [mode, setMode] = useState<OppositionMode>('static');
  const [staticTarget, setStaticTarget] = useState('6');
  const [gmDiceCount, setGmDiceCount] = useState('2');
  const [defenderId, setDefenderId] = useState('');
  const [defenderSkillId, setDefenderSkillId] = useState('');
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
  const actorSkill = actor.skills.find((s) => s.id === actorSkillId) ?? actor.skills[0]!;
  const otherCharacters = characters.filter((c) => c.id !== actor.id);
  const defender = otherCharacters.find((c) => c.id === defenderId) ?? otherCharacters[0] ?? null;
  const defenderSkill = defender ? (defender.skills.find((s) => s.id === defenderSkillId) ?? defender.skills[0] ?? null) : null;
  const canRoll = mode !== 'character' || (defender !== null && defenderSkill !== null);

  const handleRoll = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const trimmedAction = action.trim();
      let builder = workspace.activeCampaign.character(actor.id).makeCheck(actorSkill.id);
      if (trimmedAction) builder = builder.withAction(trimmedAction);

      if (mode === 'character') {
        if (!defender || !defenderSkill) return;
        const res = builder.againstCharacter(defender.id, defenderSkill.id).roll(diceRoller);
        onChange(res.workspace);
        setLatestRoll({ campaignId: campaign.id, kind: 'character_opposed', outcome: res.outcome });
      } else {
        const opp = mode === 'static' ? new StaticOpposition(Number(staticTarget)) : new RolledOpposition(Number(gmDiceCount));
        const res = builder.against(opp).roll(diceRoller);
        onChange(res.workspace);
        setLatestRoll({ campaignId: campaign.id, kind: 'vs_opposition', outcome: res.outcome });
      }
      setAction('');
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to resolve check.');
    }
  };

  const activeRoll = latestRoll?.campaignId === campaign.id ? latestRoll : null;
  const checkResult = activeRoll?.outcome.checkResult;

  return (
    <section className="panel stack" aria-label="Check roller">
      <h2>Roll a Check</h2>
      <form className="stack" onSubmit={handleRoll}>
        <div className="row">
          <label htmlFor={`${baseId}-actor`}>Actor</label>
          <select id={`${baseId}-actor`} value={actor.id} onChange={(e) => onSelectActor(e.target.value)}>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label htmlFor={`${baseId}-skill`}>Skill</label>
          <select id={`${baseId}-skill`} value={actorSkill.id} onChange={(e) => setActorSkillId(e.target.value)}>
            {actor.skills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.level}d6)</option>)}
          </select>
          <label htmlFor={`${baseId}-action`}>Action</label>
          <input id={`${baseId}-action`} type="text" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Say what you do…" />
        </div>
        <fieldset className="stack">
          <legend>Opposition</legend>
          <div className="row">
            <label htmlFor={`${baseId}-mode`}>Mode</label>
            <select id={`${baseId}-mode`} value={mode} onChange={(e) => setMode(e.target.value as OppositionMode)}>
              <option value="static">Static Target</option>
              <option value="rolled">GM Dynamic Dice</option>
              <option value="character">Character Opposed</option>
            </select>
            {mode === 'static' && (
              <>
                <label htmlFor={`${baseId}-target`}>Target</label>
                <input id={`${baseId}-target`} type="number" step={1} value={staticTarget} onChange={(e) => setStaticTarget(e.target.value)} required />
              </>
            )}
            {mode === 'rolled' && (
              <>
                <label htmlFor={`${baseId}-gmdice`}>GM Dice (d6)</label>
                <input id={`${baseId}-gmdice`} type="number" min={1} step={1} value={gmDiceCount} onChange={(e) => setGmDiceCount(e.target.value)} required />
              </>
            )}
            {mode === 'character' && (!defender || !defenderSkill ? (
              <span className="muted">Add another character to roll opposed checks.</span>
            ) : (
              <>
                <label htmlFor={`${baseId}-def`}>Defender</label>
                <select id={`${baseId}-def`} value={defender.id} onChange={(e) => setDefenderId(e.target.value)}>
                  {otherCharacters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <label htmlFor={`${baseId}-defskill`}>Defender Skill</label>
                <select id={`${baseId}-defskill`} value={defenderSkill.id} onChange={(e) => setDefenderSkillId(e.target.value)}>
                  {defender.skills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.level}d6)</option>)}
                </select>
              </>
            ))}
          </div>
        </fieldset>
        <div><button type="submit" className="btn btn-primary" disabled={!canRoll}>Roll {actorSkill.level}d6</button></div>
      </form>
      {activeRoll && checkResult && (
        <output className="stack" aria-live="polite">
          <div className="row-between">
            <strong>
              {activeRoll.kind === 'vs_opposition'
                ? `${activeRoll.outcome.character.name} — ${activeRoll.outcome.skillUsed.name}`
                : `${activeRoll.outcome.actor.name} (${activeRoll.outcome.actorSkill.name}) vs ${activeRoll.outcome.defender.name} (${activeRoll.outcome.defenderSkill.name})`}
            </strong>
            <span className="badge">{checkResult.outcome.toUpperCase()} (margin {checkResult.margin > 0 ? `+${checkResult.margin}` : checkResult.margin})</span>
          </div>
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
