import { describe, expect, it } from 'vitest';
import { Character } from '../character';
import { BASIC_CAMPAIGN_RULES, Campaign, Workspace, WorkspaceCampaignScope } from './index';

describe('Workspace & WorkspaceCampaignScope', () => {
  it('creates a frozen empty Workspace with null activeCampaignId and throws on activeCampaign', () => {
    const ws = Workspace.empty();

    expect(ws).toBeInstanceOf(Workspace);
    expect(ws.schemaVersion).toBe(1);
    expect(ws.activeCampaignId).toBeNull();
    expect(ws.campaigns).toEqual([]);
    expect(Object.isFrozen(ws)).toBe(true);
    expect(Object.isFrozen(ws.campaigns)).toBe(true);
    expect(ws.tryGetActiveCampaign()).toBeNull();
    expect(() => ws.activeCampaign).toThrow(/no active campaign/i);
  });

  it('creates campaigns immutably and activates each newly created campaign', () => {
    const ws1 = Workspace.empty().createCampaign('Heist');
    const ws2 = ws1.createCampaign('Sci-Fi', {
      description: 'Space opera',
      rules: { tiesMode: 'twist' },
    });

    expect(ws2).not.toBe(ws1);
    expect(ws1.campaigns).toHaveLength(1);
    expect(ws1.activeCampaign.campaign.name).toBe('Heist');
    expect(ws1.activeCampaign.campaign.rules).toEqual(BASIC_CAMPAIGN_RULES);
    expect(ws2.campaigns).toHaveLength(2);
    expect(ws2.activeCampaign).toBeInstanceOf(WorkspaceCampaignScope);
    expect(ws2.activeCampaignId).toBe(ws2.campaigns[1]!.id);
    expect(ws2.tryGetActiveCampaign()).toMatchObject({
      name: 'Sci-Fi',
      description: 'Space opera',
    });
    expect(ws2.activeCampaign.campaign.rules.tiesMode).toBe('twist');
  });

  it('selects an existing campaign by exact ID or trimmed case-insensitive name', () => {
    const ws = Workspace.empty().createCampaign('Heist').createCampaign('Sci-Fi');
    const [heist, scifi] = ws.campaigns;

    const selectedByName = ws.selectCampaign('  HEIST  ');
    const selectedById = selectedByName.selectCampaign(scifi!.id);

    expect(selectedByName).not.toBe(ws);
    expect(selectedByName.activeCampaignId).toBe(heist!.id);
    expect(selectedByName.tryGetActiveCampaign()).toBe(heist);
    expect(selectedById.activeCampaignId).toBe(scifi!.id);
  });

  it('preserves activeCampaignId when deleting a non-active campaign', () => {
    const ws = Workspace.empty().createCampaign('Heist').createCampaign('Sci-Fi');
    const afterDelete = ws.deleteCampaign('  heist  ');

    expect(afterDelete).not.toBe(ws);
    expect(afterDelete.campaigns.map((c) => c.name)).toEqual(['Sci-Fi']);
    expect(afterDelete.activeCampaignId).toBe(ws.activeCampaignId);
  });

  it('falls back to the first remaining campaign or null when deleting the active campaign', () => {
    const ws = Workspace.empty().createCampaign('Heist').createCampaign('Sci-Fi');
    const heistId = ws.campaigns[0]!.id;

    const afterDeletingActive = ws.deleteCampaign('Sci-Fi');
    expect(afterDeletingActive.campaigns.map((c) => c.name)).toEqual(['Heist']);
    expect(afterDeletingActive.activeCampaignId).toBe(heistId);

    const afterDeletingLast = afterDeletingActive.deleteCampaign(heistId);
    expect(afterDeletingLast.campaigns).toEqual([]);
    expect(afterDeletingLast.activeCampaignId).toBeNull();
    expect(afterDeletingLast.tryGetActiveCampaign()).toBeNull();
  });

  it('replaces an existing campaign in place and rejects unknown campaign IDs', () => {
    const ws = Workspace.empty().createCampaign('Heist').createCampaign('Sci-Fi');
    const renamedHeist = ws.campaigns[0]!.rename('Grand Heist');
    const updated = ws.replaceCampaign(renamedHeist);

    expect(updated).not.toBe(ws);
    expect(updated.campaigns[0]).toBe(renamedHeist);
    expect(updated.activeCampaignId).toBe(ws.activeCampaignId);
    expect(() => ws.replaceCampaign(Campaign.create('Ghost', { id: 'missing-id' }))).toThrow(/campaign not found/i);
  });

  it('mutates the active campaign immutably through WorkspaceCampaignScope methods', () => {
    const base = Workspace.empty().createCampaign('Heist');
    const updated = base.activeCampaign
      .rename('Grand Heist')
      .activeCampaign.withDescription('Vault job')
      .activeCampaign.withRules({ statusesEnabled: true })
      .activeCampaign.addCharacter('Alice')
      .activeCampaign.addCharacter(Character.create('Temp'))
      .activeCampaign.removeCharacter('Temp');

    expect(updated).not.toBe(base);
    expect(base.activeCampaign.campaign.characters).toEqual([]);
    expect(updated.activeCampaign.campaign).toMatchObject({
      name: 'Grand Heist',
      description: 'Vault job',
    });
    expect(updated.activeCampaign.campaign.rules.statusesEnabled).toBe(true);
    expect(updated.activeCampaign.campaign.characters.map((c) => c.name)).toEqual(['Alice']);
  });

  it('mutates a targeted campaign via workspace.campaign(idOrName) without changing activeCampaignId', () => {
    const ws = Workspace.empty().createCampaign('Heist').createCampaign('Sci-Fi');
    const heistId = ws.campaigns[0]!.id;

    const updated = ws
      .campaign(heistId)
      .addCharacter('Alice')
      .campaign('  heist  ')
      .rename('Ocean Eleven');

    expect(updated.activeCampaignId).toBe(ws.activeCampaignId);
    expect(updated.activeCampaign.campaign.name).toBe('Sci-Fi');
    expect(updated.activeCampaign.campaign.characters).toEqual([]);
    expect(updated.campaign('Ocean Eleven').campaign.characters.map((c) => c.name)).toEqual(['Alice']);
  });

  it.each(['Unknown', '   '])('rejects unknown campaign reference %j across Workspace operations', (missing) => {
    const ws = Workspace.empty().createCampaign('Heist');
    expect(() => ws.selectCampaign(missing)).toThrow(/campaign not found/i);
    expect(() => ws.deleteCampaign(missing)).toThrow(/campaign not found/i);
    expect(() => ws.campaign(missing)).toThrow(/campaign not found/i);
  });

  it('rejects blank names on Workspace.createCampaign', () => {
    expect(() => Workspace.empty().createCampaign('   ')).toThrow(/campaign name cannot be blank/i);
  });
});
