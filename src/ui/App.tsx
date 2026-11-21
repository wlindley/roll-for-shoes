import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { MemoryStorageAdapter, type StorageAdapter, Workspace } from '../campaign';
import type { DiceRoller } from '../dice';
import { AdvancementPrompt } from './components/AdvancementPrompt';
import { CampaignSettingsDialog } from './components/CampaignSettingsDialog';
import { CampaignSidebar } from './components/CampaignSidebar';
import { CharacterGrid } from './components/CharacterGrid';
import { CheckRollerPanel } from './components/CheckRollerPanel';
import { InstallAppButton } from './components/InstallAppButton';
import { RollHistoryLog } from './components/RollHistoryLog';

export type StorageMode = 'persistent' | 'memory';

export interface AppProps {
  readonly diceRoller: DiceRoller;
  readonly storageAdapter: StorageAdapter;
}

const toErrorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

export function App(props: AppProps): React.JSX.Element {
  const [storageMode, setStorageMode] = useState<StorageMode>('persistent');
  const [memoryAdapter] = useState(() => new MemoryStorageAdapter());
  const activeAdapter = storageMode === 'persistent' ? props.storageAdapter : memoryAdapter;
  const [loaded, setLoaded] = useState<{ readonly adapter: StorageAdapter; readonly workspace: Workspace } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Workspace.load(activeAdapter)
      .then((ws) => { if (!cancelled) setLoaded({ adapter: activeAdapter, workspace: ws }); })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(toErrorMessage(err, 'Failed to load workspace.'));
          setLoaded({ adapter: activeAdapter, workspace: Workspace.empty() });
        }
      });
    return () => { cancelled = true; };
  }, [activeAdapter]);

  const commitWorkspace = useCallback((next: Workspace) => {
    setError(null);
    setLoaded({ adapter: activeAdapter, workspace: next });
    void next.save(activeAdapter).catch((err: unknown) => setError(toErrorMessage(err, 'Failed to save workspace.')));
  }, [activeAdapter]);

  const workspace = loaded?.adapter === activeAdapter ? loaded.workspace : null;
  const activeCampaign = workspace?.tryGetActiveCampaign() ?? null;
  const effectiveActorId = activeCampaign?.characters.some((c) => c.id === selectedActorId)
    ? selectedActorId
    : (activeCampaign?.characters[0]?.id ?? null);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Roll for Shoes</h1>
        <div className="row">
          <InstallAppButton />
          <span className="badge">{storageMode === 'persistent' ? 'Persistent Storage' : 'In-Memory Session'}</span>
        </div>
      </header>
      <CampaignSidebar
        workspace={workspace}
        storageMode={storageMode}
        onToggleStorageMode={() => setStorageMode((m) => (m === 'persistent' ? 'memory' : 'persistent'))}
        onChange={commitWorkspace}
        onError={setError}
      />
      <main className="main-stage">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!workspace ? (
          <section className="panel"><p className="muted">Loading workspace…</p></section>
        ) : activeCampaign ? (
          <>
            <section className="panel stack">
              <div className="row-between">
                <div className="row">
                  <h2>{activeCampaign.name}</h2>
                  <span className="badge">{activeCampaign.characters.length} characters</span>
                  <span className="badge">{activeCampaign.rollLog.length} rolls</span>
                  <span className={activeCampaign.rules.tiesMode === 'twist' ? 'badge badge-tie' : 'badge'}>
                    Ties: {activeCampaign.rules.tiesMode === 'twist' ? 'Twist' : 'Fail'}
                  </span>
                  {activeCampaign.rules.statusesEnabled && <span className="badge">Statuses: On</span>}
                  {activeCampaign.rules.allowCustomStartingSkills && <span className="badge">Starting Skills: Custom</span>}
                  {activeCampaign.rules.skillSlots && <span className="badge">Skill Slots{activeCampaign.rules.skillSlots.allowSlotPurchase ? ' (+XP)' : ''}: On</span>}
                </div>
                <button type="button" className="btn" onClick={() => setRulesOpen(true)}>Campaign Rules</button>
              </div>
              {activeCampaign.description && <p className="muted">{activeCampaign.description}</p>}
            </section>
            <CampaignSettingsDialog
              key={activeCampaign.id}
              workspace={workspace}
              open={rulesOpen}
              onClose={() => setRulesOpen(false)}
              onChange={commitWorkspace}
            />
            <CharacterGrid
              workspace={workspace}
              diceRoller={props.diceRoller}
              selectedActorId={effectiveActorId}
              onSelectActor={setSelectedActorId}
              onChange={commitWorkspace}
              onError={setError}
            />
            <CheckRollerPanel
              workspace={workspace}
              diceRoller={props.diceRoller}
              selectedActorId={effectiveActorId}
              onSelectActor={setSelectedActorId}
              onChange={commitWorkspace}
              onError={setError}
            />
            {activeCampaign.characters.map((c) =>
              c.pendingAdvancement ? (
                <AdvancementPrompt
                  key={c.pendingAdvancement.rollId}
                  workspace={workspace}
                  character={c}
                  pending={c.pendingAdvancement}
                  onChange={commitWorkspace}
                />
              ) : null,
            )}
            <RollHistoryLog entries={activeCampaign.rollLog} />
          </>
        ) : (
          <section className="panel stack">
            <h2>Welcome to Roll for Shoes</h2>
            <p className="muted">Create a campaign or import a JSON backup from the sidebar to begin.</p>
          </section>
        )}
      </main>
    </div>
  );
}
