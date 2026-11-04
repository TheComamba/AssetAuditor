import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset, actor, env, AssetFilepaths, waitFor} from './helpers/foundry.mjs';
beforeEach(reset);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
async function open(type = 'Actor') {
    const app = new AssetFilepaths();app.singularType = type;await app.render();await app._scanPromise;
    return app;
}
const groups = app => [...app.element.querySelectorAll('.asset-path-group')];
const groupAt = (app, path) => groups(app).find(group => group.dataset.path === path);

test('identical paths collapse into one group while individual rows stay editable', async () => {
    actor('one');actor('two');actor('three', 'other/portrait.webp');
    const app = await open();
    const shared = groupAt(app, 'images/old.webp');
    const unique = groupAt(app, 'other/portrait.webp');
    assert.equal(groups(app).length, 2);
    assert.equal(shared.open, false);
    assert.equal(shared.querySelectorAll('.asset-row').length, 2);
    assert.match(shared.querySelector('summary').textContent, /2 usages/);
    assert(shared.querySelector('summary').textContent.includes(String.fromCodePoint(0x2014)));
    assert.equal(unique.open, true);
    assert.equal(app.element.querySelectorAll('.path-input').length, 3);
    assert.equal(env.updates.length, 0);
});
test('grouping preserves document-type boundaries and token-specific counts', async () => {
    const owner = actor('owner');
    owner.items.push(new Item({_id: 'item', name: 'Item', img: owner.img}, owner));
    const scene = new Scene({_id: 'scene', name: 'Camp', background: {src: 'images/old.webp'}, sounds: [], tiles: [], tokens: []});
    scene.tokens.push(new TokenDocument({_id: 'token', name: 'Token', texture: {src: owner.img}}, scene));
    game.collections.get('Scene').push(scene);
    const app = await open('');
    for (const type of ['Actor', 'Item', 'TokenDocument']) {
        const container = app.element.querySelector(`.asset-type-group[data-asset-type="${type}"]`);
        assert.equal(container.querySelectorAll('.asset-path-group').length, 1);
    }
    assert.match(app.element.querySelector('[data-asset-type="TokenDocument"] summary').textContent, /1 affected tokens/);
});
test('typing a draft does not move a usage into a different saved-path group', async () => {
    actor('one');actor('two');const app = await open();
    const row = app.element.querySelector('.asset-row');
    const parent = row.parentElement;
    const input = row.querySelector('.path-input');
    input.value = 'draft/path.webp';input.dispatchEvent(new window.Event('input'));
    await flush();
    assert.equal(row.parentElement, parent);
    assert.equal(groups(app).length, 1);
    assert.equal(input.value, 'draft/path.webp');
});
test('removing a repaired row updates counts and preserves another draft', async () => {
    actor('one');actor('two');actor('other', 'other/portrait.webp');const app = await open();
    const shared = groupAt(app, 'images/old.webp');
    const other = groupAt(app, 'other/portrait.webp');
    other.querySelector('.path-input').value = 'unsaved.webp';
    const row = shared.querySelector('.asset-row');row.nextElementSibling.remove();row.remove();
    await waitFor(() => shared.querySelector('.asset-group-count').textContent.includes('1 usages'));
    assert.equal(shared.open, true);
    assert.equal(other.querySelector('.path-input').value, 'unsaved.webp');
    const last = shared.querySelector('.asset-row');last.nextElementSibling.remove();last.remove();
    await waitFor(() => !shared.isConnected);
    assert.equal(groups(app).length, 1);
});
test('a saved path moves its original row, directory hint, and bound buttons into an existing group', async () => {
    actor('one');actor('two');actor('other', 'other/portrait.webp');const app = await open();
    const source = groupAt(app, 'images/old.webp');
    const destination = groupAt(app, 'other/portrait.webp');
    const row = source.querySelector('.asset-row');
    const hint = row.nextElementSibling;
    const input = row.querySelector('.path-input');
    $(input).val('other/portrait.webp').data('original-value', 'other/portrait.webp');
    input.disabled = true;input.disabled = false;
    await waitFor(() => row.parentElement === destination);
    assert.equal(row.nextElementSibling, hint);
    assert.equal(destination.querySelectorAll('.asset-row').length, 2);
    assert.match(source.querySelector('summary').textContent, /1 usages/);
    assert.match(destination.querySelector('summary').textContent, /2 usages/);
    row.querySelector('.browse-button').click();
    assert.equal(env.pickers.length, 1);
    await flush();
});
test('a saved path can create a new group and empty groups are removed', async () => {
    actor();const app = await open();const row = app.element.querySelector('.asset-row');
    const input = row.querySelector('.path-input');
    $(input).data('original-value', 'new/portrait.webp');input.disabled = true;input.disabled = false;
    await waitFor(() => Boolean(groupAt(app, 'new/portrait.webp')));
    assert.equal(groups(app).length, 1);
    assert.equal(row.parentElement, groupAt(app, 'new/portrait.webp'));
    row.nextElementSibling.remove();row.remove();
    await waitFor(() => groups(app).length === 0);
    assert.equal(app.element.querySelector('.asset-type-group').hidden, true);
});
test('paths containing markup are displayed as plain text', async () => {
    const path = 'images/<b>portrait & token</b>.webp';actor('one', path);
    const app = await open();const summary = groupAt(app, path).querySelector('summary');
    assert.equal(summary.querySelector('b'), null);
    assert(summary.textContent.includes(path));
});
test('repeated control-state changes do not nest or duplicate groups', async () => {
    actor('one');actor('two');const app = await open();
    const input = app.element.querySelector('.path-input');
    for (let i = 0; i < 3; i++) { input.disabled = true;await flush();input.disabled = false;await flush(); }
    assert.equal(groups(app).length, 1);
    assert.equal(app.element.querySelectorAll('.asset-path-group .asset-path-group').length, 0);
    assert.equal(app.element.querySelectorAll('.asset-row').length, 2);
});
test('a new render disconnects the previous grouping observer', async t => {
    actor();const app = await open();
    const previous = app._pathGroupObserver;
    const spy = t.mock.method(previous, 'disconnect');
    await app.render();
    assert(spy.mock.calls.length > 0);
    assert.notEqual(app._pathGroupObserver, previous);
    assert.equal(groups(app).length, 1);
});
test('closing the window disconnects the grouping observer', async t => {
    actor();const app = await open();
    const spy = t.mock.method(app._pathGroupObserver, 'disconnect');
    Application.prototype.close = async function () { this.element.remove();return this; };
    try { await app.close(); } finally { delete Application.prototype.close; }
    assert.equal(spy.mock.calls.length, 1);
    assert.equal(app.element.isConnected, false);
});

test('unrelated toolbar updates preserve a group that the user collapsed', async () => {
    actor();const app = await open();const group = groups(app)[0];group.open = false;
    const search = app.element.querySelector('.search-input');search.value = 'draft search';search.dispatchEvent(new window.Event('input'));
    await flush();assert.equal(group.open, false);
});
