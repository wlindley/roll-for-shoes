import { describe, expect, it } from 'vitest';
import { StubDiceRoller } from '../dice';
import { CheckResult, RolledPool, StaticOpposition } from '../checks';
import { Character, SkillSlotConfig, Status } from '../character';
import { Campaign, LocalStorageAdapter, MemoryStorageAdapter, type StorageAdapter, Workspace } from './index';

const VALID_CAMPAIGN_DTO = JSON.parse(Campaign.create('Heist', { id: 'cmp-valid' }).exportJson()) as Record<string, unknown>;

describe('StorageAdapter implementations & Workspace/Campaign JSON persistence', () => {
  it('saves, loads, initializes, and clears serialized state in MemoryStorageAdapter', async () => {
    const emptyAdapter: StorageAdapter = new MemoryStorageAdapter();
    expect(await emptyAdapter.load()).toBeNull();
    expect((await Workspace.load(emptyAdapter)).campaigns).toEqual([]);

    const ws = Workspace.empty().createCampaign('Heist');
    await ws.save(emptyAdapter);
    const preloaded = new MemoryStorageAdapter(await emptyAdapter.load());
    expect((await Workspace.load(preloaded)).activeCampaign.campaign.name).toBe('Heist');

    await emptyAdapter.clear();
    expect(await emptyAdapter.load()).toBeNull();
  });

  it('persists and clears Workspace in default globalThis.localStorage via LocalStorageAdapter', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.clear();
    try {
      expect((await Workspace.load(adapter)).campaigns).toEqual([]);
      const ws = Workspace.empty().createCampaign('Tavern Brawl');
      await ws.save(adapter);
      expect(globalThis.localStorage.getItem('roll_for_shoes.workspace.v1')).toBe(ws.serialize());

      const loaded = await Workspace.load(new LocalStorageAdapter());
      expect(loaded).not.toBe(ws);
      expect(loaded.activeCampaign.campaign.name).toBe('Tavern Brawl');
    } finally {
      await adapter.clear();
    }
    expect(globalThis.localStorage.getItem('roll_for_shoes.workspace.v1')).toBeNull();
  });

  it('persists and clears Workspace using a custom key and Storage in LocalStorageAdapter', async () => {
    const custom = new LocalStorageAdapter({ key: 'custom.rfs.v1', storage: globalThis.sessionStorage });
    await custom.clear();
    try {
      const ws = Workspace.empty().createCampaign('Neon Heist');
      await ws.save(custom);
      expect(globalThis.sessionStorage.getItem('custom.rfs.v1')).toBe(ws.serialize());
      const loaded = await Workspace.load(new LocalStorageAdapter({ key: 'custom.rfs.v1', storage: globalThis.sessionStorage }));
      expect(loaded.activeCampaign.campaign.name).toBe('Neon Heist');
    } finally {
      await custom.clear();
    }
    expect(await custom.load()).toBeNull();
  });

  it('rejects LocalStorageAdapter operations when default localStorage is unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
    try {
      const adapter = new LocalStorageAdapter();
      await expect(adapter.load()).rejects.toThrow();
      await expect(adapter.save('{}')).rejects.toThrow();
      await expect(adapter.clear()).rejects.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });

  it('round-trips multi-campaign Workspace state and rehydrates CheckResult, RolledPool, and Status instances', () => {
    expect(Workspace.deserialize(Workspace.empty().serialize()).activeCampaignId).toBeNull();

    const ws = Workspace.empty()
      .createCampaign('Heist', { description: 'Vault job', rules: { tiesMode: 'twist', statusesEnabled: true } })
      .createCampaign('Side Quest').selectCampaign('Heist')
      .activeCampaign.addCharacter(Character.create('Alice').addStatus(Status.create('Clean Shoe', 2)))
      .activeCampaign.addCharacter('Bob')
      .activeCampaign.character('Alice').makeCheck('Do Anything').withStatus('Clean Shoe').againstCharacter('Bob', 'Do Anything').roll(new StubDiceRoller([4, 3])).workspace
      .activeCampaign.character('Bob').makeCheck('Do Anything').against(new StaticOpposition(5, 'Door')).roll(new StubDiceRoller([2])).workspace;

    const restored = Workspace.deserialize(ws.serialize());
    const heist = restored.activeCampaign.campaign;
    const [vsStatic, vsChar] = heist.rollLog;

    expect(restored.campaigns).toHaveLength(2);
    expect(restored.campaign('Side Quest').campaign.description).toBeUndefined();
    expect(heist.description).toBe('Vault job');
    expect(heist.findCharacter('Alice')?.statuses[0]).toBeInstanceOf(Status);
    expect(vsStatic?.checkResult).toBeInstanceOf(CheckResult);
    expect(vsStatic?.checkResult.actor).toBeInstanceOf(RolledPool);
    expect(vsStatic?.checkResult.opposition).toEqual({ total: 5, label: 'Door', pool: undefined });
    expect(vsStatic?.checkResult.margin).toBe(-3);
    expect(vsChar?.checkResult.opposition.pool).toBeInstanceOf(RolledPool);
    expect(vsChar?.checkResult.actor.modifiers).toEqual([{ label: 'Clean Shoe', value: 2 }]);
  });

  it('exports/imports Campaign JSON and assigns a fresh ID when importing a duplicate campaign ID', () => {
    const source = Campaign.create('Heist', { description: 'Crew backup' }).addCharacter('Alice');
    const json = source.exportJson();
    const parsed = Campaign.fromJson(json);
    expect(parsed).not.toBe(source);
    expect(parsed.id).toBe(source.id);
    expect(parsed.description).toBe('Crew backup');

    const importedOnce = Workspace.empty().importCampaign(json);
    const importedTwice = importedOnce.importCampaign(json);
    const [first, second] = importedTwice.campaigns;

    expect(importedOnce.activeCampaignId).toBe(source.id);
    expect(importedTwice.campaigns).toHaveLength(2);
    expect(first!.id).toBe(source.id);
    expect(second!.id).not.toBe(source.id);
    expect(importedTwice.activeCampaignId).toBe(second!.id);
    expect(second!.characters.map((c) => c.name)).toEqual(['Alice']);
  });

  it('round-trips character portraits and SkillSlotConfig across Workspace and Campaign JSON serialization', async () => {
    const ws = Workspace.empty()
      .createCampaign('Gallery', { rules: { skillSlots: SkillSlotConfig.triangle({ allowSlotPurchase: true }) } })
      .activeCampaign.addCharacter(Character.create('Alice', { portrait: '/alice.png' }))
      .activeCampaign.addCharacter(Character.create('Bob', { portrait: '/old.png' }).withPortrait(null));

    const mem = new MemoryStorageAdapter();
    await ws.save(mem);
    const loadedCampaign = (await Workspace.load(mem)).activeCampaign.campaign;
    const exportedCampaign = Campaign.fromJson(ws.activeCampaign.campaign.exportJson());

    expect(loadedCampaign.rules.skillSlots).toBeInstanceOf(SkillSlotConfig);
    expect(loadedCampaign.rules.skillSlots?.allowSlotPurchase).toBe(true);
    expect(loadedCampaign.rules.skillSlots?.baseLimitForLevel(2)).toBe(4);
    expect(loadedCampaign.findCharacter('Alice')?.portrait).toBe('/alice.png');
    expect(loadedCampaign.findCharacter('Bob')?.portrait).toBeUndefined();
    expect(exportedCampaign.rules.skillSlots).toBeInstanceOf(SkillSlotConfig);
    expect(exportedCampaign.findCharacter('Alice')?.portrait).toBe('/alice.png');
    expect(exportedCampaign.findCharacter('Bob')?.portrait).toBeUndefined();
  });

  it.each([
    ['malformed JSON', '{bad'],
    ['null payload', 'null'],
    ['array payload', '[]'],
    ['primitive payload', '42'],
    ['unsupported schemaVersion', '{"schemaVersion":99}'],
    ['non-array campaigns', '{"schemaVersion":1,"activeCampaignId":null,"campaigns":"bad"}'],
    ['non-string activeCampaignId', '{"schemaVersion":1,"activeCampaignId":123,"campaigns":[]}'],
    ['dangling activeCampaignId', '{"schemaVersion":1,"activeCampaignId":"missing","campaigns":[]}'],
  ])('rejects invalid Workspace JSON (%s)', (_label, raw) => {
    expect(() => Workspace.deserialize(raw)).toThrow();
  });

  it.each([
    ['malformed JSON', '{bad'],
    ['null payload', 'null'],
    ['array payload', '[]'],
    ['unsupported schemaVersion', '{"schemaVersion":99}'],
    ['blank id', JSON.stringify({ ...VALID_CAMPAIGN_DTO, id: '   ' })],
    ['blank name', JSON.stringify({ ...VALID_CAMPAIGN_DTO, name: '' })],
    ['invalid tiesMode', JSON.stringify({ ...VALID_CAMPAIGN_DTO, rules: { ...(VALID_CAMPAIGN_DTO.rules as object), tiesMode: 'bogus' } })],
    ['non-object skillSlots', JSON.stringify({ ...VALID_CAMPAIGN_DTO, rules: { ...(VALID_CAMPAIGN_DTO.rules as object), skillSlots: 'bad' } })],
    ['invalid skillSlots.limitsByLevel', JSON.stringify({ ...VALID_CAMPAIGN_DTO, rules: { ...(VALID_CAMPAIGN_DTO.rules as object), skillSlots: { limitsByLevel: 'bad' } } })],
    ['non-array characters', JSON.stringify({ ...VALID_CAMPAIGN_DTO, characters: 'bad' })],
    ['invalid rollLog entry kind', JSON.stringify({ ...VALID_CAMPAIGN_DTO, rollLog: [{ kind: 'bogus' }] })],
  ])('rejects invalid Campaign JSON (%s) on fromJson and importCampaign', (_label, raw) => {
    expect(() => Campaign.fromJson(raw)).toThrow();
    expect(() => Workspace.empty().importCampaign(raw)).toThrow();
  });
});
