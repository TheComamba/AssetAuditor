import {test, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {reset, actor, listing, env, waitFor, AssetFilepaths} from "./helpers/foundry.mjs";
beforeEach(reset);

async function openAudit({invalidOnly = true} = {}) {
    const app = new AssetFilepaths();
    app.showInvalidOnly = invalidOnly;
    app.singularType = "Actor";
    await app.render();
    await app._scanPromise;

    return app;
}

test("file picker selection autosaves and removes only the repaired invalid row", async () => {
    const subject = actor("scout");
    actor("other");
    listing("data", "images", ["images/fixed.webp"]);
    const app = await openAudit();
    const rows = [...app.element.querySelectorAll('.asset-row')];
    assert.equal(rows.length, 2);
    const row = rows.find(row => row.querySelector('span').textContent.includes('scout'));
    const unrelated = rows.find(candidate => candidate !== row);
    unrelated.querySelector('.path-input').value = 'unsaved.webp';
    row.querySelector('.browse-button').click();
    assert.equal(env.pickers.length, 1);
    assert.equal(row.isConnected, true, "opening picker must not replace the row");
    await env.pickers[0].options.callback("images/fixed.webp");
    assert.equal(subject.img, "images/fixed.webp");
    assert.equal(row.isConnected, false);
    assert.equal(unrelated.querySelector('.path-input').value, 'unsaved.webp');
    assert.equal(app.element.querySelectorAll('.asset-row').length, 1);
    assert.equal(env.updates.length, 1);
});
test("manual input needs Save; Reset preserves other draft rows", async () => {
    const subject = actor("scout");actor("other");
    const app = await openAudit();
    const rows = [...app.element.querySelectorAll('.asset-row')];
    const row = rows.find(row => row.querySelector('span').textContent.includes('scout'));
    const unrelated = rows.find(candidate => candidate !== row);
    unrelated.querySelector('.path-input').value = 'other-draft.webp';
    const input = row.querySelector('.path-input');
    input.value = 'images/new.webp';input.dispatchEvent(new window.Event('input'));
    assert.equal(env.updates.length, 0);
    assert.equal(row.querySelector('.update-button').disabled, false);
    row.querySelector('.reset-button').click();
    assert.equal(input.value, subject.img);
    assert.equal(unrelated.querySelector('.path-input').value, 'other-draft.webp');
});
test("an open picker cannot save a detached row after a new scan", async () => {
    const subject = actor();
    const app = await openAudit();
    app.element.querySelector('.browse-button').click();
    const picker = env.pickers[0];
    await app.refresh();
    await waitFor(() => !app._loading);
    await picker.options.callback('images/new.webp');
    assert.equal(subject.img, 'images/old.webp');
    assert.equal(env.updates.length, 0);
});
test("a scan requested during a save waits for the write", async () => {
    const subject = actor();listing("data", "images", ["images/fixed.webp"]);
    const app = await openAudit();
    const row = app.element.querySelector('.asset-row');
    const button = $(row.querySelector('.update-button'));
    row.querySelector('.path-input').value = 'images/fixed.webp';
    let release;
    const original = subject.update.bind(subject);
    subject.update = async patch => { await new Promise(resolve => { release = resolve; }); return original(patch); };
    const pending = app.saveAssetRow(button, $(app.element));
    await waitFor(() => release);
    await app.refresh();
    assert.equal(app._loading, false);
    assert.equal(row.querySelector('.path-input').disabled, true);
    release();await pending;
    await waitFor(() => !app._loading);
    assert.equal(subject.img, 'images/fixed.webp');
    assert.equal(app.element.querySelectorAll('.asset-row').length, 0);
});
test("empty replacement never writes; replacement is restricted to the current result set", async () => {
    const subject = actor('scout');const hidden = actor('hidden');
    const app = await openAudit();
    app.context.assets.forEach(group => { group.assets = group.assets.filter(entry => entry.asset === subject); });
    app.currentSearchInput = '';
    await app.performReplacement($(app.element));
    assert.equal(env.updates.length, 0);
    app.currentSearchInput = 'images/';app.replaceText = 'portraits/';
    await app.performReplacement($(app.element));
    await waitFor(() => !app._loading);
    assert.equal(subject.img, 'portraits/old.webp');
    assert.equal(hidden.img, 'images/old.webp');
});
test("failed saves keep a retryable row and never remove its invalid entry", async t => {
    const subject = actor();const app = await openAudit();
    subject.update = async () => { throw Error('Write rejected'); };
    t.mock.method(console, 'error', () => {});
    const row = app.element.querySelector('.asset-row');
    const input = row.querySelector('.path-input');input.value = 'images/fixed.webp';
    await app.saveAssetRow($(row.querySelector('.update-button')), $(app.element));
    assert.equal(row.isConnected, true);assert.equal(input.disabled, false);
    assert.equal(row.querySelector('.update-button').disabled, false);
    assert.equal(app._savingAssets.size, 0);assert.equal(env.notifications.at(-1).type, 'error');
});

test("a cancelled picker leaves the row and document unchanged", async () => {
    const subject = actor();
    const app = await openAudit();
    const row = app.element.querySelector('.asset-row');
    row.querySelector('.browse-button').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(row.isConnected, true);
    assert.equal(subject.img, 'images/old.webp');
    assert.equal(env.updates.length, 0);
});

test("manual Save updates the row in place and retains unrelated drafts in all-results mode", async () => {
    const subject = actor('scout');actor('other');
    listing('data', 'images', ['images/fixed.webp']);
    const app = await openAudit({invalidOnly: false});
    const rows = [...app.element.querySelectorAll('.asset-row')];
    const row = rows.find(candidate => candidate.querySelector('span').textContent.includes('scout'));
    const other = rows.find(candidate => candidate !== row);
    other.querySelector('.path-input').value = 'unsaved.webp';
    const input = row.querySelector('.path-input');
    input.value = 'images/fixed.webp';input.dispatchEvent(new window.Event('input'));
    row.querySelector('.update-button').click();
    await waitFor(() => app._savingAssets.size === 0);
    assert.equal(subject.img, 'images/fixed.webp');
    assert.equal(row.isConnected, true);
    assert.equal(row.nextElementSibling?.classList.contains('asset-invalid-hint') ?? false, false);
    assert.equal(row.querySelector('.asset-status').classList.contains('fa-file-image'), true);
    assert.equal(row.querySelector('.update-button').disabled, true);
    assert.equal(other.querySelector('.path-input').value, 'unsaved.webp');
});

test("a saved missing path stays visible with an updated directory hint", async () => {
    const subject = actor();
    listing('data', 'portraits', []);
    const app = await openAudit();
    const row = app.element.querySelector('.asset-row');
    row.querySelector('.path-input').value = 'portraits/missing.webp';
    await app.saveAssetRow($(row.querySelector('.update-button')), $(app.element));
    assert.equal(subject.img, 'portraits/missing.webp');
    assert.equal(row.isConnected, true);
    assert.match(row.nextElementSibling.textContent, /portraits/);
    assert.equal(app.context.assets[0].assets[0].isValid, false);
    assert.equal(row.querySelector('.update-button').disabled, true);
});

test("the persisted path returned by document hooks is rechecked and displayed", async () => {
    const subject = actor();
    listing('data', 'images', ['images/normalized.webp']);
    const original = subject.update.bind(subject);
    subject.update = patch => original({...patch, img: 'images/normalized.webp'});
    const app = await openAudit({invalidOnly: false});
    const row = app.element.querySelector('.asset-row');
    row.querySelector('.path-input').value = 'images/requested.webp';
    await app.saveAssetRow($(row.querySelector('.update-button')), $(app.element));
    assert.equal(row.querySelector('.path-input').value, 'images/normalized.webp');
    assert.equal(app.context.assets[0].assets[0].isValid, true);
});

test("successful saves signal the persisted entry and original row for display updates", async () => {
    const subject = actor();listing('data', 'images', ['images/fixed.webp']);
    const app = await openAudit({invalidOnly: false});
    const row = app.element.querySelector('.asset-row');
    let saved;
    $(app.element).on('asset-auditor:path-saved', (_event, entry, element) => {saved = {entry, element};});
    row.querySelector('.path-input').value = 'images/fixed.webp';
    await app.saveAssetRow($(row.querySelector('.update-button')), $(app.element));
    assert.equal(saved.entry.asset, subject);
    assert.equal(saved.entry.path, 'images/fixed.webp');
    assert.equal(saved.entry.isValid, true);
    assert.equal(saved.element, row);
});
