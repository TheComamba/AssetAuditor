import {test, beforeEach} from "node:test";
import assert from "node:assert/strict";

class Document {
    constructor(id, parent = null) { this._id = id; this.name = "Same name"; this.parent = parent; }
    get id() { return this._id; }
    get documentName() { return this.constructor.name.replace(/Document$/, ""); }
    async update() { throw Error("Navigation must not update documents"); }
}
for (const name of ["Actor", "Item", "JournalEntryPage", "PlaylistSound", "Scene", "AmbientSoundDocument", "TileDocument", "TokenDocument", "User"]) {
    globalThis[name] = class extends Document {};
    Object.defineProperty(globalThis[name], "name", {value: name});
}
class PrototypeToken {}
let opened, notifications;
class Config {
    constructor(options) { this.options = options; }
    async render(options) { opened.push({config: this.constructor.name, options: this.options, render: options}); }
}
class PrototypeTokenConfig extends Config {}
class PlaylistSoundConfig extends Config {}
class ApplicationV2Stub { async _prepareContext() { return {}; } _onRender() {} }
globalThis.foundry = {data: {PrototypeToken}, applications: {
    sheets: {PrototypeTokenConfig, PlaylistSoundConfig},
    api: {ApplicationV2: ApplicationV2Stub, HandlebarsApplicationMixin: Base => class extends Base {}}
}};
globalThis.Application = class { async getData() { return {}; } activateListeners() {} };
globalThis.FilePicker = {async browse() { return {files: []}; }};
globalThis.navigator ??= {};
const {openAssetOriginal} = await import("../src/apps/asset-original.js");
const {AssetFilepaths} = await import("../src/apps/asset-filepaths.js");
beforeEach(() => {
    opened = [];notifications = [];
    const actors = [];
    globalThis.game = {actors, collections: new Map([["Actor", actors]]), i18n: {localize: key => key, format: key => key}};
    globalThis.ui = {notifications: {error: message => notifications.push(message)}};
});
// Explicit globals are required by Foundry's browser modules.
globalThis.game = {};
globalThis.ui = {};
function sheet(document) { return {async render(...args) { opened.push({document, args}); }}; }
function bind(app) {
    const bindings = new Map();
    const html = {on() { return this; }, off() { return this; }, find(selector) { return {
        click(callback) { bindings.set(selector, callback); return this; },
        change() { return this; }, on() { return this; }, prop() { return this; }, css() { return this; }
    }; }};
    app.activateListeners(html);
    return bindings.get('.open-original-button');
}

test("document sheets open even when their asset file is missing", async () => {
    for (const Type of [Actor, Item, Scene, TokenDocument, TileDocument, AmbientSoundDocument, User]) {
        const document = new Type('document');
        document.img = 'missing.webp';document.sheet = sheet(document);
        await openAssetOriginal(document);
        assert.deepEqual(opened.at(-1), {document, args: [true]});
    }
});
test("prototype navigation uses its owning actor's configuration", async () => {
    const actor = new Actor('owner');actor.prototypeToken = new PrototypeToken();game.actors.push(actor);
    await openAssetOriginal(actor.prototypeToken);
    assert.deepEqual(opened[0], {config: 'PrototypeTokenConfig', options: {actor}, render: {force: true}});
});
test("playlist sounds use their native configuration even without a sheet", async () => {
    const document = new PlaylistSound('dice');
    await openAssetOriginal(document);
    assert.deepEqual(opened[0], {config: 'PlaylistSoundConfig', options: {document}, render: {force: true}});
});
test("journal navigation opens the affected page", async () => {
    const parent = {sheet: sheet('journal')};
    await openAssetOriginal(new JournalEntryPage('affected-page', parent));
    assert.deepEqual(opened[0], {document: 'journal', args: [true, {pageId: 'affected-page'}]});
});
test("opening a placeable leaves the active scene unchanged", async () => {
    const parent = {activate() { throw Error('Scene activation is forbidden'); }, view() { throw Error('Scene viewing is forbidden'); }};
    const token = new TokenDocument('token', parent);token.sheet = sheet(token);
    await openAssetOriginal(token);
    assert.equal(opened[0].document, token);
});
test("missing originals and orphaned prototypes produce useful failures", async () => {
    await assert.rejects(openAssetOriginal(null), /no longer available/);
    await assert.rejects(openAssetOriginal(new PrototypeToken()), /actor is no longer available/);
    await assert.rejects(openAssetOriginal(new Item('deleted')), /No configuration sheet/);
});
test("navigation selects the right document when names match", async () => {
    const actors = [new Actor('one'), new Actor('two')];
    for (const actor of actors) { actor.img = 'images/missing.webp';actor.sheet = sheet(actor);game.actors.push(actor); }
    const app = new AssetFilepaths();app.singularType = 'Actor';
    await (app._prepareContext ? app._prepareContext() : app.getData());
    if (app.scanAssets) {
        await app.scanAssets();
        await (app._prepareContext ? app._prepareContext() : app.getData());
    }
    const click = bind(app);
    const button = {dataset: {assetId: 'two', assetType: 'Actor'}, disabled: false};
    await click({currentTarget: button});
    assert.equal(opened[0].document, actors[1]);
    assert.equal(button.disabled, false);
});
test("navigation distinguishes the same ID in different document types", async () => {
    const actor = new Actor('shared');const item = new Item('shared');
    actor.sheet = sheet(actor);item.sheet = sheet(item);
    const app = new AssetFilepaths();
    app.context.assets = [
        {type: 'Actor', assets: [{id: 'shared', asset: actor}]},
        {type: 'Item', assets: [{id: 'shared', asset: item}]}
    ];
    const button = {dataset: {assetId: 'shared', assetType: 'Item'}, disabled: false};
    await bind(app)({currentTarget: button});
    assert.equal(opened[0].document, item);
});
test("navigation errors notify the user and restore the button", async t => {
    t.mock.method(console, 'error', () => {});
    const app = new AssetFilepaths();app.context.assets = [];
    const button = {dataset: {assetId: 'outdated', assetType: 'Actor'}, disabled: false};
    await bind(app)({currentTarget: button});
    assert.equal(notifications[0], 'asset-auditor.app.open-original-error');
    assert.equal(button.disabled, false);
});
