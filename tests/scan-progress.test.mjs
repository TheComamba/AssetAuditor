import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset, actor, listing, env, AssetFilepaths, waitFor, waitForAudit, renderAudit} from './helpers/foundry.mjs';
const {getAllAssets} = await import('../src/scripts/asset-aggregation.js');
beforeEach(reset);
function appForActors() {const app = new AssetFilepaths();app.singularType = 'Actor';return app;}
const status = app => app.element.querySelector('.asset-scan-status');
const message = app => status(app).querySelector('.asset-scan-message').textContent;
function delayDirectory() {
    let release;
    env.listings.set('data|images|directory', () => new Promise(resolve => {release = resolve;}));
    return async () => {await waitFor(() => release);return release;};
}

test('aggregation reports ordered stages with monotonic completed work', async () => {
    actor('valid', 'images/valid.webp');actor('missing', 'portraits/missing.webp');
    listing('data', 'images', ['images/valid.webp']);
    const progress = [];await getAllAssets(false, '', 'Actor', step => progress.push(step));
    assert.deepEqual([...new Set(progress.map(step => step.phase))], ['directories', 'documents', 'hints']);
    for (const phase of ['directories', 'documents', 'hints']) {
        const steps = progress.filter(step => step.phase === phase);
        assert.equal(steps[0].completed, 0);assert.equal(steps.at(-1).completed, steps.at(-1).total);
        steps.forEach((step, i) => {assert(step.completed <= step.total);if (i) assert(step.completed >= steps[i - 1].completed);});
    }
});
test('an empty collection completes every zero-work stage', async () => {
    const progress = [];await getAllAssets(false, '', 'Actor', step => progress.push(step));
    assert.deepEqual(progress, ['directories', 'documents', 'hints'].map(phase => ({phase, completed: 0, total: 0})));
});
test('a shell is visible during directory loading and content controls freeze while the frame stays usable', async () => {
    actor();const getRelease = delayDirectory();const app = appForActors();
    const activate = app.activateListeners.bind(app);
    app.activateListeners = html => {app.element.insertAdjacentHTML('afterbegin', '<button class="frame-close">Close</button>');activate(html);};
    await app.render();const release = await getRelease();
    assert.equal(app.element.isConnected, true);assert.equal(app._scanState.phase, 'directories');
    assert.equal(status(app).getAttribute('aria-busy'), 'true');
    assert.equal(status(app).querySelector('progress').hidden, false);
    assert.equal(app.element.querySelector('.recheck-assets-button').disabled, true);
    assert.equal(app.element.querySelector('.frame-close').disabled, false);
    listing('data', 'images', []);release({files: []});await waitForAudit(app);
    assert.equal(status(app).dataset.state, 'complete');assert.match(message(app), /1 entries.*1 invalid/);
    assert.equal(status(app).querySelector('progress').hidden, true);
    assert.equal(app.element.querySelector('.recheck-assets-button').disabled, false);
});
test('document validation remains busy while a wildcard expansion is pending', async () => {
    actor('pattern', 'tokens/*.webp');let release;
    env.listings.set('data|tokens/*.webp|wildcard', () => new Promise(resolve => {release = resolve;}));
    const app = appForActors();await app.render();await waitFor(() => release);
    assert.equal(app._scanState.phase, 'documents');assert.match(message(app), /Checking asset references/);
    release({files: ['tokens/a.webp']});await waitForAudit(app);
    assert.equal(app._scanState.phase, 'complete');
});
test('completion waits for valid-parent-directory hints', async () => {
    actor();let calls = 0;let release;
    env.listings.set('data|images|directory', () => ++calls === 1 ? {files: []} : new Promise(resolve => {release = resolve;}));
    const app = appForActors();await app.render();await waitFor(() => release);
    assert.equal(app._scanState.phase, 'hints');assert.equal(app._scanBusy, true);
    listing('data', 'images', []);release({files: []});await waitForAudit(app);
    assert.equal(app._scanState.phase, 'complete');
});
test('filtered empty results have an explicit completion and empty state', async () => {
    actor();listing('data', 'images', ['images/old.webp']);const app = appForActors();app.showInvalidOnly = true;
    await renderAudit(app);assert.match(message(app), /0 entries.*0 invalid/);
    assert.equal(app.element.querySelector('.asset-auditor-scan-empty').hidden, false);
});
test('a failed recheck retains the prior result set and enables retry', async t => {
    actor();const app = await renderAudit(appForActors());const previous = app._assets;
    t.mock.method(console, 'error', () => {});
    const fault = t.mock.method(game.collections, 'get', () => {throw Error('Index unavailable');});
    await app.refresh($(app.element));await waitForAudit(app);
    assert.equal(app._assets, previous);assert.equal(status(app).dataset.state, 'error');
    assert.equal(app.element.querySelectorAll('.asset-row, .path-input').length > 0, true);
    assert.equal(app.element.querySelector('.recheck-assets-button').disabled, false);
    fault.mock.restore();await app.refresh($(app.element));await waitForAudit(app);
    assert.equal(status(app).dataset.state, 'complete');
});
test('a first-scan failure is distinct from an empty successful result', async t => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(game.collections, 'get', () => {throw Error('Index unavailable');});
    const app = await renderAudit(appForActors());
    assert.equal(status(app).dataset.state, 'error');assert.match(message(app), /Scan failed/);
    assert.equal(app.element.querySelector('.asset-auditor-scan-empty').hidden, true);
});
test('closing during a scan prevents result rendering from reopening the window', async () => {
    actor();const getRelease = delayDirectory();const app = appForActors();await app.render();
    const release = await getRelease();const pending = app._scanPromise;await app.close();
    listing('data', 'images', []);release({files: []});await pending;
    assert.equal(app.rendered, false);assert.equal(app.element.isConnected, false);
    assert.equal(app._scanRequested, true);
});
test('an old scan cannot overwrite a newer scan after close and reopen', async () => {
    actor();const getRelease = delayDirectory();const app = appForActors();await app.render();
    const release = await getRelease();const old = app._scanPromise;await app.close();
    listing('data', 'images', ['images/old.webp']);await renderAudit(app);
    assert.equal(app._assets[0].assets[0].isValid, true);const newest = app._assets;
    release({files: []});await old;
    assert.equal(app._assets, newest);assert.match(message(app), /0 invalid/);
});
test('late validation callbacks cannot replace a failure state', async t => {
    t.mock.method(console, 'error', () => {});actor('malformed', 'http://[');actor('pending', 'tokens/*.webp');
    let release;env.listings.set('data|tokens/*.webp|wildcard', () => new Promise(resolve => {release = resolve;}));
    const app = appForActors();await app.render();await waitFor(() => release);await waitForAudit(app);
    assert.equal(status(app).dataset.state, 'error');release({files: ['tokens/a.webp']});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(status(app).dataset.state, 'error');assert.match(message(app), /Scan failed/);
});
test('a queued filter refresh uses the latest query after the active scan finishes', async () => {
    actor('Scout');actor('Mage');const getRelease = delayDirectory();const app = appForActors();await app.render();
    const release = await getRelease();app.searchText = 'Scout';app.currentSearchInput = 'Scout';app.refresh($(app.element));
    listing('data', 'images', []);release({files: []});await waitForAudit(app);
    assert.equal(app.context.assets[0].assets.length, 1);assert.equal(app.context.assets[0].assets[0].name, 'Scout');
    assert.equal(status(app).dataset.state, 'complete');
});
test('Recheck starts another scan and refreshes its completion counts', async () => {
    actor();const app = await renderAudit(appForActors());assert.match(message(app), /1 invalid/);
    listing('data', 'images', ['images/old.webp']);const previous = app._scanSequence;
    app.element.querySelector('.recheck-assets-button').click();await waitFor(() => app._scanSequence > previous);await waitForAudit(app);
    assert.match(message(app), /0 invalid/);
});
test('successful row-update events refresh completion and empty-result feedback in place', async () => {
    actor();const app = appForActors();app.showInvalidOnly = true;await renderAudit(app);
    app.context.assets[0].assets = [];app.element.querySelector('.path-input').parentElement.remove();
    $(app.element).trigger('asset-auditor:path-saved');
    assert.match(message(app), /0 entries.*0 invalid/);
    assert.equal(app.element.querySelector('.asset-auditor-scan-empty').hidden, false);
});
test('a deferred refresh after closing remains queued for the next opening', async () => {
    actor();const app = await renderAudit(appForActors());await app.close();
    app.refresh($(app.element));assert.equal(app.rendered, false);assert.equal(app.element.isConnected, false);
    assert.equal(app._scanRequested, true);
});
