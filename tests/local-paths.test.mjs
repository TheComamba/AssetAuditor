import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

for (const name of ['Actor', 'Item', 'JournalEntryPage', 'PlaylistSound', 'Scene', 'AmbientSoundDocument', 'TileDocument', 'TokenDocument', 'User']) {
    globalThis[name] = class {
        constructor(id, img) { this._id = id;this.name = id;this.img = img; }
        async update() { throw Error('Validation must not write documents'); }
    };
    Object.defineProperty(globalThis[name], 'name', {value: name});
}
globalThis.foundry = {data: {PrototypeToken: class {}}};
let platform, listings;
Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {
    userAgentData: {async getHighEntropyValues() { return {platform}; }}
}});
globalThis.FilePicker = {async browse(source, target) {
    if (!listings.has(target)) throw Error('Directory unavailable');
    return {files: [...listings.get(target)]};
}};
const {getAllAssets} = await import('../src/scripts/asset-aggregation.js');
beforeEach(() => {
    platform = 'Windows';listings = new Map();
    const actors = [];
    globalThis.game = {actors, collections: new Map([['Actor', actors]])};
});
function add(id, path) { const actor = new Actor(id, path);game.actors.push(actor);return actor; }
async function scan(invalidOnly = false) { return (await getAllAssets(invalidOnly, '', 'Actor'))[0].assets; }

for (const browserOS of ['Windows', 'Linux']) {
    test(`server-listing case is preserved for a ${browserOS} browser`, async () => {
        platform = browserOS;
        listings.set('Portraits', ['Portraits/Scout.webp']);
        add('correct', 'Portraits/Scout.webp');add('wrong-case', 'Portraits/scout.webp');
        const results = await scan();
        assert.equal(results.find(entry => entry.name === 'correct').isValid, true);
        assert.equal(results.find(entry => entry.name === 'wrong-case').isValid, false);
    });
}
for (const listedPath of ['images/Scout Portrait.webp', 'images/Scout%20Portrait.webp']) {
    test(`encoded and decoded references match listing ${listedPath}`, async () => {
        listings.set('images', [listedPath]);
        add('encoded', 'images/Scout%20Portrait.webp');add('decoded', 'images/Scout Portrait.webp');
        assert((await scan()).every(entry => entry.isValid));
    });
}
test('percent-encoded apostrophes match literal filenames', async () => {
    listings.set('images', ["images/Scout's Portrait.webp"]);
    const path = 'images/Scout%27s%20Portrait.webp';const actor = add('scout', path);
    const [result] = await scan();
    assert.equal(result.isValid, true);assert.equal(result.path, path);assert.equal(actor.img, path);
});
test('cache-busting queries are ignored for comparison and retained in documents', async () => {
    listings.set('images', ['images/Scout.webp']);
    const path = 'images/Scout.webp?v=123';const actor = add('scout', path);
    const [result] = await scan();
    assert.equal(result.isValid, true);assert.equal(result.path, path);assert.equal(actor.img, path);
});
test('malformed percent escapes are compared literally without aborting a scan', async () => {
    listings.set('images', ['images/portrait%ZZ.webp']);
    add('literal', 'images/portrait%ZZ.webp');add('different', 'images/portrait%XY.webp');
    const results = await scan();
    assert.equal(results.find(entry => entry.name === 'literal').isValid, true);
    assert.equal(results.find(entry => entry.name === 'different').isValid, false);
});
test('encoded URL separators remain distinct from actual path separators', async () => {
    listings.set('images', ['images/scout/portrait.webp']);
    add('scout', 'images/scout%2Fportrait.webp');
    assert.equal((await scan())[0].isValid, false);
});
test('leading URL slashes normalize on both sides of the comparison', async () => {
    listings.set('/images', ['images/Scout.webp']);listings.set('images', ['/images/Scout.webp']);
    add('reference-slash', '/images/Scout.webp');add('listing-slash', 'images/Scout.webp');
    assert((await scan()).every(entry => entry.isValid));
});
test('unavailable directories yield invalid entries', async () => {
    add('scout', 'unavailable/Scout.webp');
    assert.equal((await scan())[0].isValid, false);
});
test('percent escapes are decoded once, preserving distinct encoded filenames', async () => {
    listings.set('images', ['images/file%20name.webp']);
    add('space', 'images/file%20name.webp');add('percent', 'images/file%2520name.webp');
    const results = await scan();
    assert.equal(results.find(entry => entry.name === 'space').isValid, true);
    assert.equal(results.find(entry => entry.name === 'percent').isValid, false);
});
