import { describe, expect, it } from 'vitest';
import { StubDiceRoller } from '../dice';
import { CheckResult, RolledOpposition, RolledPool, StaticOpposition } from '../checks';
import { AdvancementOutcome, Character, CharacterCheckOutcome, DEFAULT_STARTING_SKILL_NAME, OpposedCharacterCheckOutcome } from '../character';
import { BASIC_CAMPAIGN_RULES, Campaign, CampaignCharacterScope, type CampaignRollLogEntry, type CampaignRulesConfig, LocalStorageAdapter, MemoryStorageAdapter, ScopedAdvancementBuilder, ScopedCheckBuilder, type StorageAdapter, Workspace, WorkspaceCampaignScope } from './index';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('campaign module — Campaign entity & roster management', () => {
  it('CMP-BASIC-01: creates immutable Campaign with defaults/options and updates metadata & rules immutably', () => {
    const base = Campaign.create('Tavern Brawl');
    expect(BASIC_CAMPAIGN_RULES satisfies CampaignRulesConfig).toEqual({ tiesMode: 'fail', statusesEnabled: false, allowCustomStartingSkills: false, skillSlots: null });
    expect([base instanceof Campaign, base.id.length > 0, base.name, base.description, base.rules, base.characters, base.rollLog satisfies readonly CampaignRollLogEntry[]])
      .toEqual([true, true, 'Tavern Brawl', undefined, BASIC_CAMPAIGN_RULES, [], []]);
    expect([ISO_RE.test(base.createdAt), ISO_RE.test(base.updatedAt), Object.isFrozen(BASIC_CAMPAIGN_RULES), Object.isFrozen(base), Object.isFrozen(base.characters), Object.isFrozen(base.rollLog), Object.isFrozen(base.rules)])
      .toEqual([true, true, true, true, true, true, true]);
    const custom = Campaign.create('  Cyberpunk  ', { id: 'cmp-1', description: '  Neon heist  ', rules: { tiesMode: 'twist', statusesEnabled: true } });
    expect([custom.id, custom.name, custom.description, custom.rules, Campaign.create('Minimal', { description: '   ' }).description])
      .toEqual(['cmp-1', 'Cyberpunk', 'Neon heist', { tiesMode: 'twist', statusesEnabled: true, allowCustomStartingSkills: false, skillSlots: null }, undefined]);
    const renamed = base.rename('  Starship Crew  ');
    expect(renamed).not.toBe(base);
    expect([base.name, renamed.id, renamed.name, renamed.createdAt, ISO_RE.test(renamed.updatedAt)]).toEqual(['Tavern Brawl', base.id, 'Starship Crew', base.createdAt, true]);
    const described = base.withDescription('  Weekly one-shot  ');
    const cleared = described.withDescription('   ');
    expect(described).not.toBe(base);
    expect(cleared).not.toBe(described);
    expect([base.description, described.description, cleared.description, described.createdAt, cleared.createdAt]).toEqual([undefined, 'Weekly one-shot', undefined, base.createdAt, base.createdAt]);
    const r1 = base.withRules({ tiesMode: 'twist', allowCustomStartingSkills: true });
    const r2 = r1.withRules({ statusesEnabled: true });
    expect(r1).not.toBe(base);
    expect(r2).not.toBe(r1);
    expect([Object.isFrozen(r1.rules), Object.isFrozen(r2.rules), base.rules, r1.rules, r2.rules, r1.createdAt, r2.createdAt]).toEqual([
      true, true, BASIC_CAMPAIGN_RULES, { tiesMode: 'twist', statusesEnabled: false, allowCustomStartingSkills: true, skillSlots: null },
      { tiesMode: 'twist', statusesEnabled: true, allowCustomStartingSkills: true, skillSlots: null }, base.createdAt, base.createdAt,
    ]);
    for (const bad of ['', '   ']) {
      expect(() => Campaign.create(bad)).toThrow();
      expect(() => Campaign.create('Valid', { id: bad })).toThrow();
      expect(() => base.rename(bad)).toThrow();
    }
    expect(base.name).toBe('Tavern Brawl');
  });

  it('CMP-BASIC-02: manages character roster immutably and rejects duplicate or missing characters', () => {
    const empty = Campaign.create('Heist');
    const c1 = empty.addCharacter('Alice');
    expect(c1).not.toBe(empty);
    const alice = c1.characters[0]!;
    expect([empty.characters, c1.characters.length, Object.isFrozen(c1.characters), c1.createdAt, alice instanceof Character, alice.name, alice.xp, alice.skills[0]?.name])
      .toEqual([[], 1, true, empty.createdAt, true, 'Alice', 0, DEFAULT_STARTING_SKILL_NAME]);
    const bob = Character.create('Bob', { id: 'char-bob' });
    const c2 = c1.addCharacter(bob);
    expect(c2).not.toBe(c1);
    expect([c1.characters, c2.characters]).toEqual([[alice], [alice, bob]]);
    expect([c2.findCharacter(alice.id), c2.findCharacter('  alice  '), c2.findCharacter('char-bob'), c2.findCharacter('  BOB '), c2.findCharacter('Charlie'), c2.findCharacter('   ')])
      .toEqual([alice, alice, bob, bob, undefined, undefined]);
    for (const dupOrBad of ['   ', 'alice', '  BOB  ', Character.create('  ALICE '), Character.create('Bobby', { id: 'char-bob' })]) {
      expect(() => c2.addCharacter(dupOrBad)).toThrow();
    }
    const aliceLeveled = alice.addSkill('Lockpicking', 2);
    const c3 = c2.replaceCharacter(aliceLeveled);
    expect(c3).not.toBe(c2);
    expect([c2.characters, c3.characters, c3.findCharacter(alice.id), c3.createdAt]).toEqual([[alice, bob], [aliceLeveled, bob], aliceLeveled, empty.createdAt]);
    expect(() => c3.replaceCharacter(Character.create('Ghost', { id: 'missing-id' }))).toThrow();
    const withoutBob = c3.removeCharacter('char-bob');
    const withoutAlice = c3.removeCharacter('  ALICE  ');
    expect(withoutBob).not.toBe(c3);
    expect(withoutAlice).not.toBe(c3);
    expect([c3.characters, withoutBob.characters, withoutAlice.characters, withoutBob.createdAt]).toEqual([[aliceLeveled, bob], [aliceLeveled], [bob], empty.createdAt]);
    for (const missing of ['Charlie', '   ', 'char-missing']) expect(() => c3.removeCharacter(missing)).toThrow();
    expect(() => withoutBob.removeCharacter('Bob')).toThrow();
    expect(c3.characters).toEqual([aliceLeveled, bob]);
  });
});

describe('campaign module — Campaign.character() fluent scopes & rollLog', () => {
  it('CMP-BASIC-03: resolves vs-opposition checks via character scope, prepends rollLog newest-first, and preserves immutability', () => {
    const base = Campaign.create('Heist').addCharacter('Alice').addCharacter('Bob');
    const [alice, bob] = [base.findCharacter('Alice')!, base.findCharacter('Bob')!];
    const scope: CampaignCharacterScope<{ readonly campaign: Campaign }> = base.character('  alice  ');
    const b1: ScopedCheckBuilder<{ readonly campaign: Campaign }> = scope.makeCheck('Do Anything');
    const b2 = b1.withAction('Pick vault');
    expect(b2).not.toBe(b1);
    const res1 = b2.against(new StaticOpposition(5)).roll(new StubDiceRoller([2]));
    expect(res1.campaign).not.toBe(base);
    const [alice1, e1] = [res1.campaign.findCharacter('Alice')!, res1.campaign.rollLog[0]!];
    expect([scope instanceof CampaignCharacterScope, scope.character, b1 instanceof ScopedCheckBuilder, base.rollLog, base.characters, res1.outcome instanceof CharacterCheckOutcome, res1.outcome.xpEarned, res1.campaign.findCharacter('Bob')])
      .toEqual([true, alice, true, [], [alice, bob], true, 1, bob]);
    expect([alice1, alice1.xp, alice1.pendingAdvancement?.actionDescription, res1.campaign.rollLog.length, Object.isFrozen(res1.campaign.rollLog), Object.isFrozen(e1), e1.id.length > 0, ISO_RE.test(e1.timestamp), e1.kind, e1.actorId, e1.actorName, e1.actorSkillName, e1.actionDescription, e1.checkResult, e1.actorXpEarned, e1.defenderId, e1.defenderName, e1.defenderSkillName, e1.defenderXpEarned])
      .toEqual([res1.outcome.character, 1, 'Pick vault', 1, true, true, true, true, 'vs_opposition', alice.id, 'Alice', 'Do Anything', 'Pick vault', res1.outcome.checkResult, 1, undefined, undefined, undefined, undefined]);
    const res2 = res1.campaign.character(alice.id).makeCheck('Do Anything').against(new RolledOpposition(1)).roll(new StubDiceRoller([6, 3]));
    expect(res2.campaign).not.toBe(res1.campaign);
    const e2 = res2.campaign.rollLog[0]!;
    expect([res1.campaign.rollLog, res2.campaign.rollLog.length, res2.campaign.rollLog[1], e2.id !== e1.id, e2.kind, e2.actionDescription, e2.actorXpEarned])
      .toEqual([[e1], 2, e1, true, 'vs_opposition', undefined, 0]);
    expect(b1.against(new StaticOpposition(5)).roll(new StubDiceRoller([2])).campaign.rollLog[0]?.actionDescription).toBeUndefined();
    for (const bad of ['Charlie', '   ']) expect(() => base.character(bad)).toThrow();
    expect(() => base.character('Alice').makeCheck('Nonexistent').against(new StaticOpposition(4)).roll(new StubDiceRoller([3]))).toThrow();
  });

  it('CMP-BASIC-04: resolves character-vs-character opposed checks, logs defender metadata, and rejects self/unknown opposition', () => {
    const base = Campaign.create('Tavern').addCharacter('Alice').addCharacter('Bob').addCharacter('Cara');
    const [alice, bob, cara] = [base.findCharacter('Alice')!, base.findCharacter('Bob')!, base.findCharacter('Cara')!];
    const res = base.character('Alice').makeCheck('Do Anything').withAction('Arm wrestle').againstCharacter('  bob  ', 'do anything').roll(new StubDiceRoller([6, 3]));
    expect(res.campaign).not.toBe(base);
    const [nextAlice, nextBob, entry] = [res.campaign.findCharacter('Alice')!, res.campaign.findCharacter('Bob')!, res.campaign.rollLog[0]!];
    expect([base.rollLog, base.characters, res.outcome instanceof OpposedCharacterCheckOutcome, res.outcome.actorXpEarned, res.outcome.defenderXpEarned, res.campaign.characters, nextAlice.xp, nextAlice.pendingAdvancement?.naturalAllSixes, nextBob.xp, nextBob.pendingAdvancement?.xpCostToAdvance])
      .toEqual([[], [alice, bob, cara], true, 0, 1, [res.outcome.actor, res.outcome.defender, cara], 0, true, 1, 1]);
    expect([res.campaign.rollLog.length, Object.isFrozen(entry), entry.id.length > 0, ISO_RE.test(entry.timestamp), entry.kind, entry.actorId, entry.actorName, entry.actorSkillName, entry.defenderId, entry.defenderName, entry.defenderSkillName, entry.actionDescription, entry.checkResult, entry.actorXpEarned, entry.defenderXpEarned])
      .toEqual([1, true, true, true, 'character_opposed', alice.id, 'Alice', 'Do Anything', bob.id, 'Bob', 'Do Anything', 'Arm wrestle', res.outcome.checkResult, 0, 1]);
    const res2 = res.campaign.character('Alice').makeCheck('Do Anything').againstCharacter(bob.id, 'Do Anything').roll(new StubDiceRoller([2, 5]));
    expect(res2.campaign).not.toBe(res.campaign);
    expect([res2.campaign.rollLog.length, res2.campaign.rollLog[1], res2.campaign.rollLog[0]?.actorXpEarned, res2.campaign.rollLog[0]?.defenderXpEarned, res2.campaign.rollLog[0]?.actionDescription, res2.campaign.findCharacter('Alice')?.xp, res2.campaign.findCharacter('Bob')?.xp])
      .toEqual([2, entry, 1, 0, undefined, 1, 1]);
    for (const [def, sk] of [['Alice', 'Do Anything'], ['  ALICE ', 'Do Anything'], [alice.id, 'Do Anything'], ['Unknown', 'Do Anything'], ['Bob', 'Flying']] as const) {
      expect(() => base.character('Alice').makeCheck('Do Anything').againstCharacter(def, sk).roll(new StubDiceRoller([3, 3]))).toThrow();
    }
    expect([base.rollLog, base.characters]).toEqual([[], [alice, bob, cara]]);
  });

  it('CMP-BASIC-05: advances, dismisses advancement, and applies arbitrary character transforms immutably', () => {
    const base = Campaign.create('Heist').addCharacter('Alice').addCharacter('Bob');
    const bob = base.findCharacter('Bob')!;
    const rolled = base.character('Alice').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).campaign;
    const rolledAlice = rolled.findCharacter('Alice')!;
    const advBuilder: ScopedAdvancementBuilder<{ readonly campaign: Campaign }> = rolled.character('Alice').advance('Lockpicking');
    expect(advBuilder).toBeInstanceOf(ScopedAdvancementBuilder);
    const claimed = advBuilder.claim();
    expect(claimed.campaign).not.toBe(rolled);
    expect([rolled.findCharacter('Alice'), claimed.advancement instanceof AdvancementOutcome, claimed.advancement.createdSkill.name, claimed.advancement.createdSkill.level, claimed.campaign.findCharacter('Alice'), claimed.campaign.findCharacter('Alice')?.pendingAdvancement, claimed.campaign.findCharacter('Bob'), claimed.campaign.rollLog])
      .toEqual([rolledAlice, true, 'Lockpicking', 2, claimed.advancement.character, null, bob, rolled.rollLog]);
    for (const [c, who] of [[claimed.campaign, 'Alice'], [base, 'Bob']] as const) expect(() => c.character(who).advance('Sneaking').claim()).toThrow(/no pending advancement/i);
    const dismissed = rolled.character('Alice').dismissAdvancement();
    expect(dismissed.campaign).not.toBe(rolled);
    const updated = claimed.campaign.character('Alice').update((c) => c.addSkill('Parkour', 3));
    expect(updated.campaign).not.toBe(claimed.campaign);
    expect([rolled.findCharacter('Alice')?.pendingAdvancement !== null, dismissed.campaign.findCharacter('Alice')?.pendingAdvancement, dismissed.campaign.findCharacter('Alice')?.skills.length, dismissed.campaign.findCharacter('Bob'), claimed.campaign.findCharacter('Alice')?.skills.length, updated.campaign.findCharacter('Alice')?.skill('Parkour').level, updated.campaign.findCharacter('Bob')])
      .toEqual([true, null, 1, bob, 2, 3, bob]);
  });
});

describe('campaign module — Workspace & WorkspaceCampaignScope', () => {
  it('CMP-BASIC-06: manages immutable Workspace campaigns, active selection, replacement, and deletion fallback', () => {
    const empty = Workspace.empty();
    expect(() => empty.activeCampaign).toThrow();
    const ws1 = empty.createCampaign('Heist');
    const heist = ws1.campaigns[0]!;
    expect([empty instanceof Workspace, empty.schemaVersion, empty.activeCampaignId, empty.campaigns, Object.isFrozen(empty), Object.isFrozen(empty.campaigns), empty.tryGetActiveCampaign(), Object.isFrozen(ws1.campaigns), heist.name, heist.description, heist.rules, ws1.activeCampaignId, ws1.tryGetActiveCampaign(), ws1.activeCampaign instanceof WorkspaceCampaignScope, ws1.activeCampaign.campaign])
      .toEqual([true, 1, null, [], true, true, null, true, 'Heist', undefined, BASIC_CAMPAIGN_RULES, heist.id, heist, true, heist]);
    const ws2 = ws1.createCampaign('Sci-Fi', { description: 'Space opera', rules: { tiesMode: 'twist' } });
    const scifi = ws2.campaigns[1]!;
    const sel1 = ws2.selectCampaign('  heist  ');
    const sel2 = sel1.selectCampaign(scifi.id);
    const heistRenamed = heist.rename('Grand Heist');
    const rep = sel2.replaceCampaign(heistRenamed);
    const ws3 = ws2.createCampaign('Fantasy');
    const fantasy = ws3.campaigns[2]!;
    const delNonActive = ws3.deleteCampaign('  sci-fi  ');
    const delActive = delNonActive.deleteCampaign(fantasy.id);
    const delLast = delActive.deleteCampaign('Heist');
    for (const [prev, next] of [[empty, ws1], [ws1, ws2], [ws2, sel1], [sel1, sel2], [sel2, rep], [ws2, ws3], [ws3, delNonActive], [delNonActive, delActive], [delActive, delLast]] as const) expect(next).not.toBe(prev);
    expect([ws1.campaigns, ws1.activeCampaignId, ws2.campaigns, scifi.description, scifi.rules.tiesMode, ws2.activeCampaignId, sel1.activeCampaignId, sel1.tryGetActiveCampaign(), sel2.activeCampaignId, sel2.campaigns, rep.campaigns, rep.activeCampaignId])
      .toEqual([[heist], heist.id, [heist, scifi], 'Space opera', 'twist', scifi.id, heist.id, heist, scifi.id, [heist, scifi], [heistRenamed, scifi], scifi.id]);
    expect([ws3.campaigns.length, delNonActive.campaigns, delNonActive.activeCampaignId, delActive.campaigns, delActive.activeCampaignId, delLast.campaigns, delLast.activeCampaignId, delLast.tryGetActiveCampaign()])
      .toEqual([3, [heist, fantasy], fantasy.id, [heist], heist.id, [], null, null]);
    expect(() => delLast.activeCampaign).toThrow();
    expect(() => empty.createCampaign('   ')).toThrow();
    expect(() => rep.replaceCampaign(Campaign.create('Ghost', { id: 'cmp-missing' }))).toThrow();
    for (const bad of ['Unknown', '   ']) {
      for (const fn of [() => ws2.selectCampaign(bad), () => ws2.deleteCampaign(bad), () => ws2.campaign(bad)]) expect(fn).toThrow();
    }
  });

  it('CMP-BASIC-07: traverses WorkspaceCampaignScope and activeCampaign.character() checks & advancement with campaign isolation', () => {
    const base = Workspace.empty().createCampaign('Heist').createCampaign('Sci-Fi').selectCampaign('Heist');
    const origScifi = base.campaign('Sci-Fi').campaign;
    const w1 = base.activeCampaign.withDescription('Vault job');
    const w2 = w1.activeCampaign.withRules({ statusesEnabled: true });
    const w3 = w2.activeCampaign.addCharacter('Alice');
    const w4 = w3.activeCampaign.addCharacter(Character.create('Temp'));
    const w5 = w4.activeCampaign.removeCharacter('Temp');
    const w6 = w5.campaign('  sci-fi  ').addCharacter('Zoe');
    const w7 = w6.campaign('Sci-Fi').rename('Star Trek');
    const wRenamed = w7.activeCampaign.rename('Ocean Eleven');
    for (const [prev, next] of [[base, w1], [w1, w2], [w2, w3], [w3, w4], [w4, w5], [w5, w6], [w6, w7], [w7, wRenamed]] as const) expect(next).not.toBe(prev);
    const starTrek = w7.campaign('Star Trek').campaign;
    expect([base.activeCampaign.campaign.characters, w5.activeCampaign.campaign.description, w5.activeCampaign.campaign.rules.statusesEnabled, w5.activeCampaign.campaign.characters.map((c) => c.name), w5.campaign('Sci-Fi').campaign, w7.activeCampaign.campaign.name, wRenamed.activeCampaign.campaign.name, wRenamed.activeCampaignId, starTrek.findCharacter('Zoe')?.name])
      .toEqual([[], 'Vault job', true, ['Alice'], origScifi, 'Heist', 'Ocean Eleven', w7.activeCampaignId, 'Zoe']);
    const checkRes = w7.activeCampaign.character('Alice').makeCheck('Do Anything').withAction('Sneak past guard').against(new StaticOpposition(6)).roll(new StubDiceRoller([2]));
    expect(checkRes.workspace).not.toBe(w7);
    const advRes = checkRes.workspace.activeCampaign.character('Alice').advance('Sneaking').claim();
    expect(advRes.workspace).not.toBe(checkRes.workspace);
    const zoeRes = advRes.workspace.campaign('Star Trek').character('Zoe').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([5]));
    expect(zoeRes.workspace).not.toBe(advRes.workspace);
    expect([w7.activeCampaign.campaign.findCharacter('Alice')?.xp, checkRes.campaign, checkRes.outcome instanceof CharacterCheckOutcome, checkRes.campaign.findCharacter('Alice')?.xp, checkRes.campaign.rollLog.length, checkRes.workspace.campaign('Star Trek').campaign, advRes.campaign, advRes.advancement instanceof AdvancementOutcome, advRes.campaign.findCharacter('Alice')?.xp, advRes.campaign.findCharacter('Alice')?.skill('Sneaking').level, advRes.workspace.campaign('Star Trek').campaign, zoeRes.workspace.activeCampaignId, zoeRes.campaign, zoeRes.outcome.checkResult.outcome, zoeRes.workspace.activeCampaign.campaign])
      .toEqual([0, checkRes.workspace.activeCampaign.campaign, true, 1, 1, starTrek, advRes.workspace.activeCampaign.campaign, true, 0, 2, starTrek, advRes.workspace.activeCampaignId, zoeRes.workspace.campaign('Star Trek').campaign, 'success', advRes.workspace.activeCampaign.campaign]);
  });
});

describe('campaign module — persistence, StorageAdapter & JSON import/export', () => {
  const seedWorkspace = (): Workspace => {
    const ws = Workspace.empty().createCampaign('Heist', { description: 'Vault job', rules: { tiesMode: 'twist', statusesEnabled: true } }).createCampaign('Sci-Fi').selectCampaign('Heist').activeCampaign.addCharacter('Alice').activeCampaign.addCharacter('Bob');
    const r1 = ws.activeCampaign.character('Alice').makeCheck('Do Anything').withAction('Crack safe').againstCharacter('Bob', 'Do Anything').roll(new StubDiceRoller([6, 3])).workspace.activeCampaign.character('Alice').advance('Lockpicking').claim().workspace;
    return r1.activeCampaign.character('Bob').makeCheck('Do Anything').withAction('Pry bar').against(new StaticOpposition(5, 'Door')).roll(new StubDiceRoller([2])).workspace;
  };
  it('CMP-BASIC-08: saves, loads, and clears multi-campaign Workspace via MemoryStorageAdapter preserving domain instances', async () => {
    const [ws, mem] = [seedWorkspace(), new MemoryStorageAdapter() satisfies StorageAdapter];
    expect([await mem.load(), (await Workspace.load(mem)).campaigns]).toEqual([null, []]);
    await ws.save(mem);
    const restored = await Workspace.load(new MemoryStorageAdapter(await mem.load()));
    expect(restored).not.toBe(ws);
    const [origHeist, restHeist] = [ws.activeCampaign.campaign, restored.activeCampaign.campaign];
    const [e0, e1, claimed, emptyRound] = [restHeist.rollLog[0]!, restHeist.rollLog[1]!, restored.activeCampaign.character('Bob').advance('Bashing').claim(), Workspace.deserialize(Workspace.empty().serialize())];
    expect(claimed.workspace).not.toBe(restored);
    await mem.clear();
    expect([restored instanceof Workspace, restHeist instanceof Campaign, restored.activeCampaignId, restored.campaigns.length, restHeist.description, restHeist.rules, restHeist.findCharacter('Alice') instanceof Character, restHeist.findCharacter('Alice')?.skill('Lockpicking').level, restHeist.findCharacter('Bob')?.xp, restHeist.findCharacter('Bob')?.pendingAdvancement?.xpCostToAdvance, e0.kind, e0.checkResult instanceof CheckResult, e0.checkResult.actor instanceof RolledPool, e0.checkResult.outcome, e0.checkResult.margin, e0.checkResult.opposition.label, e1.kind, e1.checkResult.opposition.pool instanceof RolledPool, e1.checkResult.opposition.pool?.rawTotal, e1.defenderName, e1.defenderXpEarned, claimed.advancement.createdSkill.level, claimed.campaign.findCharacter('Bob')?.xp, emptyRound.activeCampaignId, emptyRound.campaigns, await mem.load(), (await Workspace.load(mem)).campaigns])
      .toEqual([true, true, origHeist.id, 2, 'Vault job', origHeist.rules, true, 2, 2, 1, 'vs_opposition', true, true, 'failure', -3, 'Door', 'character_opposed', true, 3, 'Bob', 1, 2, 1, null, [], null, []]);
  });
  it('CMP-BASIC-09: persists and clears Workspace via LocalStorageAdapter with default localStorage and custom key/Storage', async () => {
    const [ws, local, custom] = [seedWorkspace(), new LocalStorageAdapter(), new LocalStorageAdapter({ key: 'custom.rfs.v1', storage: globalThis.sessionStorage })];
    await Promise.all([local.clear(), custom.clear()]);
    expect((await Workspace.load(local)).campaigns).toEqual([]);
    await Promise.all([ws.save(local), ws.save(custom)]);
    const [loaded, loadedCustom] = [await Workspace.load(new LocalStorageAdapter()), await Workspace.load(new LocalStorageAdapter({ key: 'custom.rfs.v1', storage: globalThis.sessionStorage }))];
    expect(loaded).not.toBe(ws);
    expect([globalThis.localStorage.getItem('roll_for_shoes.workspace.v1'), globalThis.sessionStorage.getItem('custom.rfs.v1'), loaded.activeCampaignId, loaded.activeCampaign.campaign.findCharacter('Bob')?.xp, loadedCustom.activeCampaign.campaign.name, loadedCustom.campaigns.length])
      .toEqual([ws.serialize(), ws.serialize(), ws.activeCampaignId, 2, 'Heist', 2]);
    await Promise.all([local.clear(), custom.clear()]);
    expect([globalThis.localStorage.getItem('roll_for_shoes.workspace.v1'), globalThis.sessionStorage.getItem('custom.rfs.v1'), (await Workspace.load(local)).campaigns, await custom.load()]).toEqual([null, null, [], null]);
  });
  it('CMP-BASIC-10: exports/imports Campaign JSON with duplicate-ID collision remapping and rejects invalid payloads', () => {
    const [ws, empty] = [seedWorkspace(), Workspace.empty()];
    const heist = ws.activeCampaign.campaign;
    const json = heist.exportJson();
    const [parsed, imp1] = [Campaign.fromJson(json), empty.importCampaign(json)];
    const imp2 = imp1.importCampaign(json);
    for (const [prev, next] of [[heist, parsed], [empty, imp1], [imp1, imp2]] as const) expect(next).not.toBe(prev);
    const [c0, c1] = [imp2.campaigns[0]!, imp2.campaigns[1]!];
    expect([parsed instanceof Campaign, parsed.id, parsed.description, parsed.rules, parsed.rollLog[0]?.checkResult instanceof CheckResult, empty.campaigns, imp1.campaigns.length, imp1.activeCampaignId, imp2.campaigns.length, c0.id, c1.id !== heist.id, imp2.activeCampaignId, c1.name, c1.characters.length, c1.rollLog.length])
      .toEqual([true, heist.id, 'Vault job', heist.rules, true, [], 1, heist.id, 2, heist.id, true, c1.id, 'Heist', 2, 2]);
    const [wsObj, cmpObj] = [JSON.parse(ws.serialize()) as Record<string, unknown>, JSON.parse(json) as Record<string, unknown>];
    for (const raw of ['{bad', 'null', '[]', '42', '{"schemaVersion":99}', JSON.stringify({ ...wsObj, activeCampaignId: 'dangling' }), JSON.stringify({ ...wsObj, activeCampaignId: 123 }), JSON.stringify({ ...wsObj, campaigns: 'bad' }), JSON.stringify({ ...wsObj, campaigns: [null] })]) expect(() => Workspace.deserialize(raw)).toThrow();
    for (const raw of ['{bad', 'null', '[]', '{"schemaVersion":99}', JSON.stringify({ ...cmpObj, id: '  ' }), JSON.stringify({ ...cmpObj, name: '' }), JSON.stringify({ ...cmpObj, rules: { ...(cmpObj.rules as object), tiesMode: 'bogus' } }), JSON.stringify({ ...cmpObj, characters: 'bad' }), JSON.stringify({ ...cmpObj, rollLog: [{ kind: 'bogus' }] })]) {
      for (const fn of [() => Campaign.fromJson(raw), () => empty.importCampaign(raw)]) expect(fn).toThrow();
    }
  });
});

describe('campaign module — Incremental Advanced Rules (Ties)', () => {
  it('CMP-TIE-01: forwards campaign.rules.tiesMode ("twist" vs "fail") on single and opposed checks and round-trips rollLog', () => {
    const ws = Workspace.empty().createCampaign('Heist', { rules: { tiesMode: 'twist' } }).activeCampaign.addCharacter('Alice').activeCampaign.addCharacter('Bob');
    const r1 = ws.activeCampaign.character('Alice').makeCheck('Do Anything').withAction('Leap').against(new StaticOpposition(4)).roll(new StubDiceRoller([4]));
    const r2 = r1.workspace.activeCampaign.character('Alice').makeCheck('Do Anything').againstCharacter('Bob', 'Do Anything').roll(new StubDiceRoller([4, 4]));
    const wsFail = r2.workspace.activeCampaign.withRules({ tiesMode: 'fail' });
    const r3 = wsFail.activeCampaign.character('Alice').makeCheck('Do Anything').against(new StaticOpposition(4)).roll(new StubDiceRoller([4]));
    const r4 = r3.campaign.character('Alice').makeCheck('Do Anything').againstCharacter('Bob', 'Do Anything').roll(new StubDiceRoller([4, 4]));
    const [restWs, restCmp] = [Workspace.deserialize(r2.workspace.serialize()), Campaign.fromJson(r2.campaign.exportJson())];
    for (const [prev, next] of [[ws, r1.workspace], [r1.workspace, r2.workspace], [r2.workspace, wsFail], [wsFail, r3.workspace], [r3.campaign, r4.campaign], [r2.workspace, restWs], [r2.campaign, restCmp]] as const) expect(next).not.toBe(prev);
    const [eOpposed, eStatic] = [r2.campaign.rollLog[0]!, r2.campaign.rollLog[1]!];
    expect([r1.outcome.checkResult.tiesMode, r1.outcome.checkResult.outcome, r1.outcome.xpEarned, r2.outcome.checkResult.tiesMode, r2.outcome.checkResult.outcome, r2.outcome.actorXpEarned, r2.outcome.defenderXpEarned, r2.campaign.findCharacter('Alice')?.xp, r2.campaign.findCharacter('Bob')?.xp])
      .toEqual(['twist', 'tie', 0, 'twist', 'tie', 0, 0, 0, 0]);
    expect([eOpposed.checkResult.tiesMode, eOpposed.checkResult.outcome, eOpposed.actorXpEarned, eOpposed.defenderXpEarned, eStatic.checkResult.tiesMode, eStatic.checkResult.outcome, eStatic.actorXpEarned])
      .toEqual(['twist', 'tie', 0, 0, 'twist', 'tie', 0]);
    expect([r3.outcome.checkResult.tiesMode, r3.outcome.checkResult.outcome, r3.outcome.xpEarned, r4.outcome.checkResult.tiesMode, r4.outcome.checkResult.outcome, r4.outcome.actorXpEarned, r4.outcome.defenderXpEarned, r4.campaign.findCharacter('Alice')?.xp, r4.campaign.findCharacter('Bob')?.xp])
      .toEqual(['fail', 'failure', 1, 'fail', 'failure', 1, 0, 2, 0]);
    expect([restWs.activeCampaign.campaign.rollLog[0]?.checkResult.tiesMode, restWs.activeCampaign.campaign.rollLog[0]?.checkResult.outcome, restCmp.rollLog[1]?.checkResult.tiesMode, restCmp.rollLog[1]?.checkResult.outcome])
      .toEqual(['twist', 'tie', 'twist', 'tie']);
  });
});
