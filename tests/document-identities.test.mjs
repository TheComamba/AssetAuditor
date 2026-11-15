import {test, beforeEach} from "node:test";
import assert from "node:assert/strict";

class Document {
    constructor(data, parent = null) { Object.assign(this, data); this.parent = parent; }
    get id() { return this._id; }
    get uuid() { return `${this.parent ? this.parent.uuid + "." : ""}${this.constructor.name}.${this.id}`; }
    async update(patch) { this.updates = [...(this.updates ?? []), patch]; return this; }
}
for (const name of ["Actor", "Item", "JournalEntryPage", "PlaylistSound", "Scene", "AmbientSoundDocument", "TileDocument", "TokenDocument", "User"]) {
    globalThis[name] = class extends Document {};
    Object.defineProperty(globalThis[name], "name", {value: name});
}
class PrototypeToken { constructor(data) { Object.assign(this, data); } }
globalThis.foundry = {data: {PrototypeToken}};
globalThis.navigator ??= {};
globalThis.FilePicker = {async browse() { return {files: ["images/portrait.webp"]}; }};
const {getAllAssets, setAssetPath} = await import("../src/scripts/asset-aggregation.js");

beforeEach(() => {
    const collections = new Map(["Actor", "JournalEntry", "Playlist", "Scene", "User"].map(name => [name, []]));
    globalThis.game = {collections, actors: collections.get("Actor")};
});
function actor(id) {
    const owner = new Actor({_id: id, name: id, items: [], img: "images/portrait.webp"});
    owner.prototypeToken = Object.seal(new PrototypeToken({name: id, randomImg: true, texture: {src: "images/portrait.webp"}}));
    game.actors.push(owner);
    return owner;
}
async function entries(type) { return (await getAllAssets(false, "", type))[0].assets; }

test("same embedded ID in two scenes produces independently editable entries", async () => {
    for (const id of ["camp", "road"]) {
        const scene = new Scene({_id: id, name: id, tokens: []});
        scene.tokens.push(new TokenDocument({_id: "shared", name: "Scout", texture: {src: "images/portrait.webp"}}, scene));
        game.collections.get("Scene").push(scene);
    }
    const results = await entries("TokenDocument");
    assert.equal(results.length, 2);
    assert.notEqual(results[0].id, results[1].id);
    await setAssetPath(results[1].asset, "images/repaired.webp");
    assert.equal(results[0].asset.updates, undefined);
    assert.deepEqual(results[1].asset.updates, [{"texture.src": "images/repaired.webp"}]);
});
test("same embedded Item ID on two actors is retained", async () => {
    for (const id of ["one", "two"]) {
        const owner = actor(id);
        owner.items.push(new Item({_id: "shared", name: "Sword", img: "images/portrait.webp"}, owner));
    }
    assert.equal((await entries("Item")).length, 2);
});
test("scanning sealed prototypes neither adds IDs nor writes to actors", async () => {
    const owners = [actor("one"), actor("two")];
    const results = await entries("PrototypeToken");
    assert.equal(results.length, 2);
    assert.notEqual(results[0].id, results[1].id);
    assert.deepEqual((await entries("PrototypeToken")).map(entry => entry.id), results.map(entry => entry.id));
    for (const owner of owners) {
        assert.equal(Object.hasOwn(owner.prototypeToken, "_id"), false);
        assert.equal(owner.updates, undefined);
    }
});
test("prototype saves target the actor and return its refreshed prototype", async () => {
    const owner = actor("scout");
    const original = owner.prototypeToken;
    owner.update = async patch => {
        owner.updates = [patch];
        owner.prototypeToken = new PrototypeToken({...original, texture: {src: patch["prototypeToken.texture.src"]}});
        return owner;
    };
    const result = await setAssetPath(original, "tokens/scout-*.webp");
    assert.deepEqual(owner.updates, [{"prototypeToken.texture.src": "tokens/scout-*.webp"}]);
    assert.equal(result, owner.prototypeToken);
    assert.equal(result.randomImg, true);
    assert.equal(result.texture.src, "tokens/scout-*.webp");
});
test("an orphaned prototype fails instead of updating another actor", async () => {
    const owner = actor("scout");
    const prototype = owner.prototypeToken;
    game.actors.splice(0);
    await assert.rejects(setAssetPath(prototype, "images/repaired.webp"), /actor is no longer available/);
    assert.equal(owner.updates, undefined);
});
