import {test, beforeEach} from "node:test";
import assert from "node:assert/strict";

class Document {
    constructor(id, name, parent = null) { this._id = id; this.name = name; this.parent = parent; }
    get id() { return this._id; }
    get documentName() { return this.constructor.name.replace(/Document$/, ''); }
    get uuid() { return `${this.parent?.uuid ?? 'World'}.${this.documentName}.${this.id}`; }
    async update() { throw Error('Searching must not write documents'); }
}
for (const name of ['Actor', 'Item', 'JournalEntryPage', 'PlaylistSound', 'Scene', 'AmbientSoundDocument', 'TileDocument', 'TokenDocument', 'User']) {
    globalThis[name] = class extends Document {};
    Object.defineProperty(globalThis[name], 'name', {value: name});
}
globalThis.foundry = {data: {PrototypeToken: class {}}};
globalThis.FilePicker = {async browse() { return {files: ['assets/image.webp']}; }};
globalThis.navigator ??= {};
const {getAllAssets} = await import('../src/scripts/asset-aggregation.js');
beforeEach(() => {
    const collections = new Map(['Actor', 'JournalEntry', 'Playlist', 'Scene', 'User'].map(name => [name, []]));
    globalThis.game = {collections, actors: collections.get('Actor')};
});
function addUsage(collection, field, Type, id, parentName) {
    const parent = {_id: `parent-${id}`, name: parentName, [field]: []};
    Object.setPrototypeOf(parent, {get documentName() { return collection; }});
    const document = new Type(id, 'Shared name', parent);
    if (Type === Item) document.img = 'assets/image.webp';
    else if (Type === JournalEntryPage) document.src = 'assets/image.webp';
    else if (Type === PlaylistSound) document.path = 'assets/image.webp';
    else document.texture = {src: 'assets/image.webp'};
    parent[field].push(document);game.collections.get(collection).push(parent);
    return document;
}
async function search(type, text, invalidOnly = false) {
    return (await getAllAssets(invalidOnly, text, type))[0].assets;
}
for (const [description, collection, field, Type] of [
    ['scene', 'Scene', 'tokens', TokenDocument],
    ['actor', 'Actor', 'items', Item],
    ['playlist', 'Playlist', 'sounds', PlaylistSound],
    ['journal', 'JournalEntry', 'pages', JournalEntryPage]
]) {
    test(`searching by ${description} finds the owning document's usages`, async () => {
        const target = addUsage(collection, field, Type, 'target', 'Requested parent');
        addUsage(collection, field, Type, 'other', 'Other parent');
        const results = await search(Type.name, 'Requested');
        assert.equal(results.length, 1);
        assert.equal(results[0].asset, target);
        assert.equal(results[0].parentName, 'Requested parent');
        assert.equal(results[0].parentType, collection);
    });
}
test('name and path searches retain their existing behavior', async () => {
    addUsage('Actor', 'items', Item, 'sword', 'Inventory');
    assert.equal((await search('Item', 'Shared name')).length, 1);
    assert.equal((await search('Item', 'assets/')).length, 1);
    assert.equal((await search('Item', 'unrelated')).length, 0);
});
test('top-level documents are searchable without a parent', async () => {
    const actor = new Actor('actor', 'Scout');actor.img = 'assets/image.webp';game.actors.push(actor);
    assert.equal((await search('Actor', 'Scout')).length, 1);
    assert.equal((await search('Actor', 'parent')).length, 0);
});
test('the invalid-only filter still applies to parent-name matches', async () => {
    const target = addUsage('Actor', 'items', Item, 'sword', 'Inventory');
    assert.equal((await search('Item', 'Inventory', true)).length, 0);
    target.img = 'assets/missing.webp';
    assert.equal((await search('Item', 'Inventory', true)).length, 1);
});
