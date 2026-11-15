import {test} from "node:test";
import assert from "node:assert/strict";

for (const name of ["Actor", "Item", "JournalEntryPage", "PlaylistSound", "Scene", "AmbientSoundDocument", "TileDocument", "TokenDocument", "User"]) {
    globalThis[name] = class {};
    Object.defineProperty(globalThis[name], "name", {value: name});
}
globalThis.foundry = {data: {PrototypeToken: class {}}};
globalThis.navigator ??= {};
const aggregation = await import("../src/scripts/asset-aggregation.js");
let listings;
globalThis.FilePicker = {async browse(storage, path, options = {}) {
    const key = `${storage}:${path}:${Boolean(options.wildcard)}`;
    if (!listings.has(key)) throw new Error("Directory unavailable");
    return {files: listings.get(key)};
}};
function setup(path, entries) {
    listings = new Map(entries);
    const sound = Object.assign(new PlaylistSound(), {_id: "sound", name: "Dice", path});
    const collections = new Map(["Actor", "JournalEntry", "Playlist", "Scene", "User"].map(name => [name, []]));
    collections.get("Playlist").push({sounds: [sound]});
    globalThis.game = {collections};
}
async function scan() {
    const groups = await aggregation.getAllAssets(false, "", "PlaylistSound");
    return groups[0].assets[0];
}
test("Core Data sound is valid when User Data browsing fails", async () => {
    setup("sounds/dice.wav", [["public:sounds:false", ["sounds/dice.wav"]]]);
    assert.equal((await scan()).isValid, true);
});
test("User Data sound remains valid when Core Data browsing fails", async () => {
    setup("sounds/custom.wav", [["data:sounds:false", ["sounds/custom.wav"]]]);
    assert.equal((await scan()).isValid, true);
});
test("missing sound stays invalid and reports its Core Data parent", async () => {
    setup("sounds/missing.wav", [["public:sounds:false", ["sounds/dice.wav"]]]);
    const result = await scan();
    assert.equal(result.isValid, false);
    assert.equal(result.lastValidPath, "sounds");
});
test("wildcards resolve in Core Data and stay invalid without matches", async () => {
    setup("sounds/*.wav", [["public:sounds/*.wav:true", ["sounds/dice.wav"]]]);
    assert.equal((await scan()).isValid, true);
    listings.clear();
    assert.equal((await scan()).isValid, false);
});

test("built-in icons are audited through Core Data and missing icons remain visible", async () => {
    setup("sounds/dice.wav", [["public:icons:false", ["icons/existing.svg"]]]);
    const existing = Object.assign(new Actor(), {_id: "existing", name: "Existing", img: "icons/existing.svg"});
    const missing = Object.assign(new Actor(), {_id: "missing", name: "Missing", img: "icons/missing.svg"});
    game.collections.get("Actor").push(existing, missing);
    const groups = await aggregation.getAllAssets(false, "", "Actor");
    assert.equal(groups[0].assets.length, 2);
    assert.equal(groups[0].assets.find(entry => entry.asset === existing).isValid, true);
    const invalid = (await aggregation.getAllAssets(true, "", "Actor"))[0].assets;
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].asset, missing);
    assert.equal(invalid[0].lastValidPath, "icons");
    assert.equal(existing.img, "icons/existing.svg");
    assert.equal(missing.img, "icons/missing.svg");
});
