import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {reset, actor, listing, env, AssetFilepaths, waitFor} from './helpers/foundry.mjs';
beforeEach(reset);
async function open(options) {
    const app = new AssetFilepaths(options);app.singularType = 'Actor';await app.render({force: true});await app._scanPromise;return app;
}
async function sidebar(name) {
    const callbacks = new Map();
    globalThis.Hooks = {once() {}, on(event, callback) {callbacks.set(event, callback);}};
    globalThis.CONST = {USER_ROLES: {ASSISTANT: 2}};game.user = {role: 4};
    await import(`../src/scripts/main.js?test=${name}`);
    await callbacks.get('renderSidebar')(null, document.body);
}

test('the ApplicationV2 frame renders labeled controls and a separate scrollable result part', async () => {
    actor();const app = await open({position: {width: 900}});
    assert(app instanceof foundry.applications.api.ApplicationV2);
    assert.equal(app.position.width, 900);assert.equal(app.position.height, 760);
    assert.equal(AssetFilepaths.DEFAULT_OPTIONS.window.resizable, true);
    assert.deepEqual(AssetFilepaths.PARTS.main.scrollable, ['.asset-results']);
    assert(app.element.classList.contains('asset-auditor'));
    const toolbar = app.element.querySelector('.asset-toolbar');
    const results = app.element.querySelector('.asset-results');
    assert.equal(toolbar.parentElement, results.parentElement);
    assert.equal(app.element.querySelector('form'), null);
    assert.equal(app.element.querySelector('label[for="asset-auditor-search"]').textContent, 'Search');
    assert.equal(app.element.querySelector('label[for="asset-auditor-replace"]').textContent, 'Replace with');
    assert.match(app.element.querySelector('.path-input').getAttribute('aria-label'), /File path/);
});
test('searching and clearing through keyboard events retain native control bindings after rendering', async () => {
    actor('Scout');actor('Mage');const app = await open();
    const input = app.element.querySelector('.search-input');input.value = 'Scout';input.dispatchEvent(new window.Event('input'));
    assert.equal(app.element.querySelector('.search-button').disabled, false);
    const enter = new window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});input.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    await waitFor(() => app.element.querySelectorAll('.asset-row').length === 1);
    assert.match(app.element.querySelector('.asset-identity').textContent, /Scout/);
    app.element.querySelector('.search-input').dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await waitFor(() => app.element.querySelectorAll('.asset-row').length === 2);
    assert.equal(app.element.querySelector('.search-input').value, '');
});
test('type and invalid-only filters survive native rerenders', async () => {
    actor('valid', 'images/valid.webp');actor('missing');listing('data', 'images', ['images/valid.webp']);
    const app = await open();app.element.querySelector('#toggle-invalid').click();
    await waitFor(() => app.element.querySelectorAll('.asset-row').length === 1);
    assert.equal(app.element.querySelector('#toggle-invalid').checked, true);
    const select = app.element.querySelector('#asset-type-dropdown');select.value = 'User';select.dispatchEvent(new window.Event('change'));
    await waitFor(() => app.element.querySelectorAll('.asset-row').length === 0);
    assert.equal(app.element.querySelector('#asset-type-dropdown').value, 'User');
});
test('manual save and reset remain usable with the V2 template and disabled-button styling', async () => {
    const subject = actor();listing('data', 'images', ['images/new.webp']);const app = await open();
    let input = app.element.querySelector('.path-input');input.value = 'images/new.webp';input.dispatchEvent(new window.Event('input'));
    const save = app.element.querySelector('.update-button');assert.equal(save.disabled, false);assert.equal(save.style.opacity, '');save.click();
    await waitFor(() => subject.img === 'images/new.webp' && app.element.querySelector('.update-button').disabled);
    input = app.element.querySelector('.path-input');input.value = 'unsaved.webp';input.dispatchEvent(new window.Event('input'));
    app.element.querySelector('.reset-button').click();
    await waitFor(() => app.element.querySelector('.path-input').value === 'images/new.webp');
    assert.equal(env.updates.length, 1);
});
test('the module manifest loads the scoped window stylesheet', () => {
    const manifest = JSON.parse(readFileSync(new URL('../src/module.json', import.meta.url)));
    assert(manifest.styles.includes('styles/asset-filepaths.css'));
    for (const path of manifest.styles) assert(existsSync(new URL('../src/' + path, import.meta.url)));
});
test('the sidebar reuses one window and waits for a pending render before bringing it forward', async () => {
    actor();document.body.innerHTML = '<section id="settings"><div class="settings"></div></section>';
    let release;env.listings.set('data|images|directory', () => new Promise(resolve => {release = resolve;}));
    await sidebar('reuse');const button = document.querySelector('.asset-list');button.click();button.click();
    await waitFor(() => release);
    assert.equal(env.instances.length, 1);assert.equal(env.renders.length, 1);
    assert.equal(env.fronts.length, env.instances[0]._scanBusy ? 2 : 0);
    listing('data', 'images', []);release({files: []});
    await waitFor(() => env.fronts.length === 2);await env.instances[0]._scanPromise;
    assert.equal(document.querySelectorAll('.application.asset-auditor').length, 1);
    await env.instances[0].close();button.click();
    await waitFor(() => env.fronts.length === 3);await env.instances[0]._scanPromise;
    assert.equal(env.instances.length, 1);assert.equal(document.querySelectorAll('.application.asset-auditor').length, 1);
});
test('an unavailable settings sidebar reports its existing localized error', async () => {
    await sidebar('missing');assert.equal(env.instances.length, 0);
    assert.equal(env.notifications.length, 1);assert.equal(env.notifications[0].type, 'error');
    assert.match(env.notifications[0].message, /sidebar/);
});
test('document names and path labels remain escaped in the V2 template', async () => {
    const subject = actor();subject.name = '<img src=x onerror=alert(1)>';
    const app = await open();assert.equal(app.element.querySelector('.asset-identity img'), null);
    assert.match(app.element.querySelector('.asset-identity').textContent, /<img/);
    assert(app.element.querySelector('.path-input').getAttribute('aria-label').includes(subject.name));
});
