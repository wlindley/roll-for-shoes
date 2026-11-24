import type { Character } from '../character';
import { Campaign, type CampaignRulesConfig } from './campaign';
import { CampaignCharacterScope } from './scopes';
import { bindWorkspaceFactory, deserializeWorkspace, serializeWorkspace } from './serialize';
import type { StorageAdapter } from './storage';

export class WorkspaceCampaignScope {
  constructor(private readonly workspace: Workspace, readonly campaign: Campaign) {
    Object.freeze(this);
  }

  rename(name: string): Workspace { return this.workspace.replaceCampaign(this.campaign.rename(name)); }
  withDescription(description: string): Workspace { return this.workspace.replaceCampaign(this.campaign.withDescription(description)); }
  withRules(rulesPatch: Partial<CampaignRulesConfig>): Workspace { return this.workspace.replaceCampaign(this.campaign.withRules(rulesPatch)); }
  addCharacter(characterOrName: Character | string): Workspace { return this.workspace.replaceCampaign(this.campaign.addCharacter(characterOrName)); }
  removeCharacter(idOrName: string): Workspace { return this.workspace.replaceCampaign(this.campaign.removeCharacter(idOrName)); }

  character(idOrName: string): CampaignCharacterScope<{ readonly workspace: Workspace; readonly campaign: Campaign }> {
    return new CampaignCharacterScope(
      this.campaign,
      this.campaign.requireCharacter(idOrName),
      (campaign) => Object.freeze({ workspace: this.workspace.replaceCampaign(campaign), campaign }),
    );
  }
}

export class Workspace {
  readonly schemaVersion: 1 = 1;
  readonly campaigns: readonly Campaign[];

  private constructor(readonly activeCampaignId: string | null, campaigns: readonly Campaign[]) {
    if (activeCampaignId !== null && !campaigns.some((c) => c.id === activeCampaignId)) {
      throw new Error(`Active campaign not found: ${activeCampaignId}`);
    }
    this.campaigns = Object.freeze([...campaigns]);
    Object.freeze(this);
  }

  static {
    bindWorkspaceFactory((activeCampaignId, campaigns) => new Workspace(activeCampaignId, campaigns));
  }

  static empty(): Workspace {
    return new Workspace(null, []);
  }

  static deserialize(serialized: string): Workspace { return deserializeWorkspace(serialized); }
  static async load(adapter: StorageAdapter): Promise<Workspace> {
    const raw = await adapter.load();
    return raw === null ? Workspace.empty() : Workspace.deserialize(raw);
  }

  createCampaign(name: string, options?: { readonly description?: string; readonly rules?: Partial<CampaignRulesConfig> }): Workspace {
    const created = Campaign.create(name, options);
    return new Workspace(created.id, [...this.campaigns, created]);
  }

  importCampaign(campaignJson: string): Workspace {
    const parsed = Campaign.fromJson(campaignJson);
    const campaign = this.campaigns.some((c) => c.id === parsed.id) ? parsed.withFreshId() : parsed;
    return new Workspace(campaign.id, [...this.campaigns, campaign]);
  }

  selectCampaign(idOrName: string): Workspace {
    return new Workspace(this.requireCampaign(idOrName).id, this.campaigns);
  }

  deleteCampaign(idOrName: string): Workspace {
    const target = this.requireCampaign(idOrName);
    const remaining = this.campaigns.filter((c) => c.id !== target.id);
    const nextActiveId = this.activeCampaignId === target.id ? (remaining[0]?.id ?? null) : this.activeCampaignId;
    return new Workspace(nextActiveId, remaining);
  }

  replaceCampaign(campaign: Campaign): Workspace {
    const index = this.campaigns.findIndex((c) => c.id === campaign.id);
    if (index === -1) throw new Error(`Campaign not found: ${campaign.id}`);
    const next = [...this.campaigns];
    next[index] = campaign;
    return new Workspace(this.activeCampaignId, next);
  }

  tryGetActiveCampaign(): Campaign | null {
    return this.campaigns.find((c) => c.id === this.activeCampaignId) ?? null;
  }

  get activeCampaign(): WorkspaceCampaignScope {
    const active = this.tryGetActiveCampaign();
    if (!active) throw new Error('No active campaign in workspace');
    return new WorkspaceCampaignScope(this, active);
  }

  campaign(idOrName: string): WorkspaceCampaignScope {
    return new WorkspaceCampaignScope(this, this.requireCampaign(idOrName));
  }

  serialize(): string { return serializeWorkspace(this); }
  async save(adapter: StorageAdapter): Promise<void> { await adapter.save(this.serialize()); }

  private requireCampaign(idOrName: string): Campaign {
    const normalized = idOrName.trim().toLowerCase();
    const target = this.campaigns.find((c) => c.id === idOrName || c.name.toLowerCase() === normalized);
    if (!target) throw new Error(`Campaign not found: ${idOrName}`);
    return target;
  }
}
