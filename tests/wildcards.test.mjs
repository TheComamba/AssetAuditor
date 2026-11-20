import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset, actor, listing, env, AssetFilepaths, waitFor} from './helpers/foundry.mjs';
const {getAllAssets, isWildcardPath} = await import('../src/scripts/asset-aggregation.js');
const {updateWildcardFeedback} = await import('../src/apps/asset-wildcards.js');
beforeEach(reset);
async function open(path = 'tokens/*.webp', files = ['tokens/a.webp', 'tokens/b.webp']) {
    const owner = actor('scout', path);owner.prototypeToken.randomImg = true;
    listing('data', path.split('?')[0], files, true);
    const app = new AssetFilepaths();app.singularType = 'PrototypeToken';await app.render();await app._scanPromise;
    return {app, owner, row: app.element.querySelector('.asset-row'), entry: app.context.assets[0].assets[0]};
}

test('a pattern with zero matches remains in invalid-only results', async () => {
    const owner = actor('scout', 'tokens/*.webp');owner.prototypeToken.randomImg = true;
    const groups = await getAllAssets(true, '', 'PrototypeToken');
    assert.equal(groups[0].assets[0].wildcardCount, 0);
    assert.equal(groups[0].assets[0].isValid, false);
    assert.equal(owner.prototypeToken.texture.src, 'tokens/*.webp');
    assert.equal(owner.prototypeToken.randomImg, true);
    assert.equal(env.updates.length, 0);
});
for (const count of [1, 3]) {
    test(`a pattern reports ${count} matches while retaining its query and random-image setting`, async () => {
        const path = 'tokens/*.webp?v=123';
        const {entry, owner} = await open(path, Array.from({length: count}, (_, i) => `tokens/${i}.webp`));
        assert.equal(entry.wildcardCount, count);assert.equal(entry.isValid, true);
        assert.equal(entry.path, path);assert.equal(owner.prototypeToken.texture.src, path);
        assert.equal(owner.prototypeToken.randomImg, true);assert.equal(env.updates.length, 0);
    });
}
test('counts combine Core and User Data and deduplicate identical returned URLs', async () => {
    actor('scout', 'tokens/*.webp');
    listing('data', 'tokens/*.webp', ['tokens/a.webp'], true);
    listing('public', 'tokens/*.webp', ['tokens/a.webp', 'tokens/b.webp'], true);
    const [group] = await getAllAssets(false, '', 'PrototypeToken');
    assert.equal(group.assets[0].wildcardCount, 2);
    env.listings.delete('data|tokens/*.webp|wildcard');
    assert.equal((await getAllAssets(false, '', 'PrototypeToken'))[0].assets[0].wildcardCount, 2);
});
test('brace patterns are expanded and HTTP paths and wildcard query values are classified separately', async () => {
    assert.equal(isWildcardPath('tokens/{red,blue}.webp'), true);
    assert.equal(isWildcardPath('tokens/*.webp?v=1'), true);
    assert.equal(isWildcardPath('tokens/scout.webp?v=*'), false);
    assert.equal(isWildcardPath('https://example.invalid/tokens/*.webp'), false);
    const {entry} = await open('tokens/{red,blue}.webp');assert.equal(entry.wildcardCount, 2);
});
test('the real template shows the count and opening the picker warns before any write', async () => {
    const {row} = await open();
    assert.match(row.querySelector('.asset-wildcard-info').textContent, /2 matches/);
    assert.match(row.querySelector('.asset-wildcard-info').title, /single file/);
    row.querySelector('.browse-button').click();
    assert.equal(env.notifications.at(-1).type, 'warn');
    assert.match(env.notifications.at(-1).message, /saves immediately/);
    assert.equal(env.pickers.length, 1);assert.equal(env.updates.length, 0);
    await new Promise(resolve => setTimeout(resolve, 0));
});
test('picker warnings follow the current input rather than the previous saved pattern', async () => {
    const {row} = await open();
    row.querySelector('.path-input').value = 'tokens/single.webp';
    row.querySelector('.browse-button').click();
    assert.equal(env.notifications.length, 0);
    await new Promise(resolve => setTimeout(resolve, 0));
});
test('saved single-file paths remove wildcard feedback and new patterns recreate it', async () => {
    const {row, entry} = await open();
    entry.path = 'tokens/single.webp';await updateWildcardFeedback(entry, row);
    assert.equal(row.querySelector('.asset-wildcard-info'), null);
    assert.equal(entry.isWildcard, false);assert.equal(entry.wildcardCount, null);
    entry.path = 'tokens/*.webp';await updateWildcardFeedback(entry, row);
    assert.match(row.querySelector('.asset-wildcard-info').textContent, /2 matches/);
});
test('the saved-row event refreshes feedback without replacing the row or its draft', async () => {
    const {app, row, entry} = await open();
    row.querySelector('.path-input').value = 'unsaved-draft.webp';
    entry.path = 'tokens/new-*.webp';listing('data', entry.path, ['tokens/new-a.webp'], true);
    $(app.element).trigger('asset-auditor:path-saved', [entry, row]);
    await waitFor(() => entry.wildcardCount === 1);
    assert.equal(row.isConnected, true);
    assert.equal(row.querySelector('.path-input').value, 'unsaved-draft.webp');
});
test('a delayed result cannot restore feedback for a newer single-file path', async () => {
    const {row, entry} = await open();let release;
    env.listings.set('data|tokens/*.webp|wildcard', () => new Promise(resolve => {release = resolve;}));
    const pending = updateWildcardFeedback(entry, row);await waitFor(() => release);
    entry.path = 'tokens/single.webp';await updateWildcardFeedback(entry, row);
    release({files: ['tokens/old.webp']});await pending;
    assert.equal(row.querySelector('.asset-wildcard-info'), null);assert.equal(entry.isWildcard, false);
});
test('a delayed result cannot update a detached row', async () => {
    const {row, entry} = await open();let release;
    env.listings.set('data|tokens/*.webp|wildcard', () => new Promise(resolve => {release = resolve;}));
    const pending = updateWildcardFeedback(entry, row);await waitFor(() => release);
    row.remove();release({files: ['tokens/old.webp']});await pending;
    assert.equal(entry.wildcardCount, 2);
});
test('newer feedback for the same path wins over an older request', async () => {
    const {row, entry} = await open();let release;
    env.listings.set('data|tokens/*.webp|wildcard', () => new Promise(resolve => {release = resolve;}));
    const pending = updateWildcardFeedback(entry, row);await waitFor(() => release);
    listing('data', 'tokens/*.webp', ['tokens/new-a.webp', 'tokens/new-b.webp', 'tokens/new-c.webp'], true);
    await updateWildcardFeedback(entry, row);
    release({files: ['tokens/old.webp']});await pending;
    assert.equal(entry.wildcardCount, 3);
    assert.match(row.querySelector('.asset-wildcard-info').textContent, /3 matches/);
});

test('rebinding listeners keeps one feedback request per saved-row event', async () => {
    const {app, row, entry} = await open();
    app.activateListeners($(app.element));
    entry.path = 'tokens/new-*.webp';let requests = 0;
    env.listings.set('data|tokens/new-*.webp|wildcard', () => {requests++;return {files: ['tokens/new.webp']};});
    $(app.element).trigger('asset-auditor:path-saved', [entry, row]);
    await waitFor(() => entry.wildcardCount === 1);
    assert.equal(requests, 1);
});
