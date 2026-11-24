import type React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { type Campaign, type StorageAdapter, Workspace } from '../campaign';
import type { DiceRoller } from '../dice';
import { ActionMenu } from './components/ActionMenu';
import { AdvancementPrompt } from './components/AdvancementPrompt';
import { AppIcon } from './components/AppIcon';
import { CampaignSettingsDialog } from './components/CampaignSettingsDialog';
import { CampaignSidebar } from './components/CampaignSidebar';
import { CharacterGrid } from './components/CharacterGrid';
import { CheckRollerPanel } from './components/CheckRollerPanel';
import { InstallAppButton } from './components/InstallAppButton';
import { RenameCampaignDialog } from './components/RenameCampaignDialog';
import { RollHistoryLog } from './components/RollHistoryLog';
import { formatError } from './error';

export interface AppProps {
  readonly diceRoller: DiceRoller;
  readonly storageAdapter: StorageAdapter;
}

type ActiveDialog = 'none' | 'rename' | 'rules';

export function App(props: AppProps): React.JSX.Element {
  const [loaded, setLoaded] = useState<{ readonly adapter: StorageAdapter; readonly workspace: Workspace } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>('none');
  const sidebarId = useId();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Workspace.load(props.storageAdapter)
      .then((ws) => { if (!cancelled) setLoaded({ adapter: props.storageAdapter, workspace: ws }); })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(formatError(err, 'Failed to load workspace.'));
          setLoaded({ adapter: props.storageAdapter, workspace: Workspace.empty() });
        }
      });
    return () => { cancelled = true; };
  }, [props.storageAdapter]);

  const commitWorkspace = useCallback((next: Workspace) => {
    setError(null);
    setLoaded({ adapter: props.storageAdapter, workspace: next });
    void next.save(props.storageAdapter).catch((err: unknown) => setError(formatError(err, 'Failed to save workspace.')));
  }, [props.storageAdapter]);

  const workspace = loaded?.adapter === props.storageAdapter ? loaded.workspace : null;
  const activeCampaign = workspace?.tryGetActiveCampaign() ?? null;
  const commitCampaign = useCallback(
    (nextCampaign: Campaign) => { if (workspace) commitWorkspace(workspace.replaceCampaign(nextCampaign)); },
    [workspace, commitWorkspace],
  );
  const showSidebar = Boolean(workspace) && (sidebarOpen || !activeCampaign);
  const effectiveActorId = activeCampaign?.characters.some((c) => c.id === selectedActorId)
    ? selectedActorId
    : (activeCampaign?.characters[0]?.id ?? null);

  return (
    <div className={showSidebar ? 'app-shell has-sidebar' : 'app-shell'}>
      <header className="app-header">
        <div className="app-brand">
          <AppIcon />
          <h1>Roll for Shoes</h1>
        </div>
        <div className="row">
          {activeCampaign && (
            <button
              type="button"
              className="btn"
              aria-expanded={showSidebar}
              aria-controls={sidebarId}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              {showSidebar ? 'Hide Campaigns' : 'Campaigns'}
            </button>
          )}
          <InstallAppButton />
        </div>
      </header>
      <CampaignSidebar
        id={sidebarId}
        hidden={!showSidebar}
        workspace={workspace}
        onClose={() => setSidebarOpen(false)}
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
                <h2 className="roll-title">{activeCampaign.name}</h2>
                <div className="menu-end">
                  <ActionMenu
                    label="Campaign Options"
                    align="right"
                    items={[
                      { label: 'Rename Campaign…', onSelect: () => setActiveDialog('rename') },
                      { label: 'Campaign Rules…', onSelect: () => setActiveDialog('rules') },
                    ]}
                  />
                </div>
              </div>
              <div className="row">
                <span className="badge">{activeCampaign.characters.length} characters</span>
                <span className="badge">{activeCampaign.rollLog.length} rolls</span>
                <span className={activeCampaign.rules.tiesMode === 'twist' ? 'badge badge-tie' : 'badge'}>
                  Ties: {activeCampaign.rules.tiesMode === 'twist' ? 'Twist' : 'Fail'}
                </span>
                {activeCampaign.rules.statusesEnabled && <span className="badge">Statuses: On</span>}
                {activeCampaign.rules.allowCustomStartingSkills && <span className="badge">Starting Skills: Custom</span>}
                {activeCampaign.rules.skillSlots && <span className="badge">Skill Slots{activeCampaign.rules.skillSlots.allowSlotPurchase ? ' (+XP)' : ''}: On</span>}
              </div>
              {activeCampaign.description && <p className="muted">{activeCampaign.description}</p>}
            </section>
            <RenameCampaignDialog
              key={`rename-${activeCampaign.id}`}
              open={activeDialog === 'rename'}
              currentName={activeCampaign.name}
              onRename={(name) => commitCampaign(activeCampaign.rename(name))}
              onClose={() => setActiveDialog('none')}
            />
            <CampaignSettingsDialog
              key={`rules-${activeCampaign.id}`}
              open={activeDialog === 'rules'}
              campaignName={activeCampaign.name}
              rules={activeCampaign.rules}
              onSaveRules={(patch) => commitCampaign(activeCampaign.withRules(patch))}
              onClose={() => setActiveDialog('none')}
            />
            <CharacterGrid
              campaign={activeCampaign}
              diceRoller={props.diceRoller}
              selectedActorId={effectiveActorId}
              onSelectActor={setSelectedActorId}
              onCampaignChange={commitCampaign}
              onError={setError}
            />
            <CheckRollerPanel
              campaign={activeCampaign}
              diceRoller={props.diceRoller}
              selectedActorId={effectiveActorId}
              onSelectActor={setSelectedActorId}
              onCampaignChange={commitCampaign}
              onError={setError}
            />
            {activeCampaign.characters.map((c) =>
              c.pendingAdvancement ? (
                <AdvancementPrompt
                  key={c.pendingAdvancement.rollId}
                  character={c}
                  pending={c.pendingAdvancement}
                  slotConfig={activeCampaign.rules.skillSlots}
                  onUpdateCharacter={(fn) => commitCampaign(activeCampaign.character(c.id).update(fn).campaign)}
                />
              ) : null,
            )}
            <RollHistoryLog entries={activeCampaign.rollLog} />
          </>
        ) : (
          <section className="panel stack">
            <h2>Welcome to Roll for Shoes</h2>
            <p className="muted">Create a campaign or use Advanced Options in the sidebar to import a JSON backup.</p>
          </section>
        )}
      </main>
    </div>
  );
}
