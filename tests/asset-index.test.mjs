import {test, beforeEach} from "node:test";
import assert from "node:assert/strict";

class Document {
    constructor(data, parent = null) { Object.assign(this, data); this.parent = parent; }
    get id() { return this._id; }
    get uuid() { return `${this.parent ? this.parent.uuid + "." : ""}${this.constructor.name}.${this.id}`; }
    async update(patch) {
        for (const [key, value] of Object.entries(patch)) {
            const parts = key.split('.'); const last = parts.pop();
            let target = this; for (const part of parts) target = target[part];
            target[last] = value;
        }
        return this;
    }
}
for (const name of ["Actor", "Item", "JournalEntryPage", "PlaylistSound", "Scene", "AmbientSoundDocument", "TileDocument", "TokenDocument", "User"]) {
    globalThis[name] = class extends Document {};
    Object.defineProperty(globalThis[name], "name", {value: name});
}
class PrototypeToken { constructor(data) { Object.assign(this, data); } }
globalThis.foundry = {data: {PrototypeToken}};
globalThis.navigator ??= {};
globalThis.Application = class {async getData() {return {};} activateListeners() {}};
let calls, files;
globalThis.FilePicker = {async browse(source, target) {
    calls.push({source, target});
    if (target === 'images') return {files: [...files]};
    throw new Error('Unavailable directory');
}};
const {AssetIndex} = await import('../src/scripts/asset-index.js');
const {AssetFilepaths} = await import('../src/apps/asset-filepaths.js');
beforeEach(() => {
    const collections = new Map(["Actor", "JournalEntry", "Playlist", "Scene", "User"].map(name => [name, []]));
    globalThis.game = {collections, actors: collections.get('Actor'), i18n: {localize: key => key}};
    calls = []; files = ['images/valid.webp'];
});
function actor(id, img = 'images/old.webp') {
    const subject = new Actor({_id: id, name: id, img, items: []});
    subject.prototypeToken = new PrototypeToken({name: id, texture: {src: img}});
    game.actors.push(subject); return subject;
}
const entries = groups => groups.flatMap(group => group.assets);
const actors = index => index.query(false, '', 'Actor').then(entries);

test('search and type/validity filters reuse the complete snapshot without more file queries', async () => {
    actor('one'); actor('two', 'images/valid.webp'); const index = new AssetIndex();
    await index.query(true, 'one', 'Actor'); const count = calls.length;
    assert.equal((await actors(index)).length, 2);
    assert.equal(entries(await index.query(true, '', 'Actor')).length, 1);
    assert.equal(entries(await index.query(false, 'two', 'Actor')).length, 1);
    assert(entries(await index.query(false, '', 'PrototypeToken')).length > 0);
    assert.equal(calls.length, count);
});
test('filtering by parent name uses the indexed context', async () => {
    const owner = actor('owner'); owner.items.push(new Item({_id: 'item', name: 'Sword', img: 'images/valid.webp'}, owner));
    const index = new AssetIndex(); await index.query(); const count = calls.length;
    assert.equal(entries(await index.query(false, 'owner', 'Item')).length, 1); assert.equal(calls.length, count);
});
test('a manual rebuild discovers new documents and externally changed paths', async () => {
    const subject = actor('one'); const index = new AssetIndex(); await index.query();
    actor('new'); subject.img = 'images/valid.webp'; assert.equal((await actors(index)).length, 1);
    assert.equal((await actors(index))[0].path, 'images/old.webp');
    await index.rebuild(); assert.equal((await actors(index)).length, 2);
    assert.equal((await actors(index)).find(e => e.name === 'one').path, 'images/valid.webp');
});
test('saving revalidates only the edited usage and retains it outside invalid-only results', async () => {
    actor('one'); actor('other', 'elsewhere/old.webp'); const index = new AssetIndex();
    const entry = (await actors(index)).find(e => e.name === 'one'); calls = [];
    await index.save(entry, 'images/valid.webp'); assert.equal(entry.path, 'images/valid.webp'); assert.equal(entry.isValid, true);
    assert.deepEqual(calls.map(c => c.target), ['images', 'images']);
    assert(!entries(await index.query(true, '', 'Actor')).includes(entry)); assert((await actors(index)).includes(entry));
});
test('failed writes keep cached metadata unchanged', async () => {
    const subject = actor('one'); const index = new AssetIndex(); const [entry] = await actors(index);
    subject.update = async () => {throw new Error('write failed');};
    await assert.rejects(index.save(entry, 'images/valid.webp'), /write failed/); assert.equal(entry.path, 'images/old.webp');
});
test('failed rebuild retains the previous successful snapshot', async () => {
    actor('one'); const index = new AssetIndex(); await index.query(); const groups = index._groups;
    const get = game.collections.get.bind(game.collections); game.collections.get = () => {throw new Error('scan failed');};
    await assert.rejects(index.rebuild(), /scan failed/); game.collections.get = get;
    assert.equal(index._groups, groups); assert.equal((await actors(index)).length, 1);
});
test('simultaneous initial queries share one scan', async () => {
    actor('one'); const index = new AssetIndex(); await Promise.all([actors(index), actors(index), index.query(true)]);
    assert.equal(calls.filter(c => c.target === 'images' && c.source === 'data').length, 3);
    // One initial listing, then one invalid-parent hint each for actor and prototype.
});
test('rebuilding waits for a pending save and publishes its persisted result', async () => {
    const subject = actor('one'); const index = new AssetIndex(); const [entry] = await actors(index);
    let release; const update = subject.update.bind(subject);
    subject.update = async patch => {await new Promise(resolve => {release = resolve;}); return update(patch);};
    const save = index.save(entry, 'images/valid.webp'); let rebuilt = false;
    const rebuild = index.rebuild().then(() => {rebuilt = true;});
    await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(rebuilt, false);
    release(); await Promise.all([save, rebuild]); assert.equal((await actors(index))[0].path, 'images/valid.webp');
});
test('prototype saves retain the refreshed model for subsequent cached edits', async () => {
    const owner = actor('one'); const index = new AssetIndex();
    const entry = entries(await index.query(false, '', 'PrototypeToken'))[0];
    owner.update = async patch => {owner.prototypeToken = new PrototypeToken({name: 'one', texture: {src: patch['prototypeToken.texture.src']}}); return owner;};
    await index.save(entry, 'images/valid.webp'); assert.equal(entry.asset, owner.prototypeToken);
    await index.save(entry, 'images/old.webp'); assert.equal(entry.asset, owner.prototypeToken); assert.equal(entry.path, 'images/old.webp');
});
test('two audit windows share the index through the application context', async () => {
    actor('one'); const one = new AssetFilepaths(), two = new AssetFilepaths();
    const context = await one.getData(); const count = calls.length; await two.getData();
    assert.equal(one._index, two._index); assert(entries(context.assets).length > 0); assert.equal(calls.length, count);
});
