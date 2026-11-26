import {readFileSync} from "node:fs";
import Handlebars from "handlebars";
import {JSDOM} from "jsdom";
import jquery from "jquery";

export const env = {listings: new Map(), pickers: [], notifications: [], updates: [], instances: [], renders: [], fronts: []};
const english = JSON.parse(readFileSync(new URL("../../src/lang/en.json", import.meta.url)));
const translate = (key, values = {}) => (english[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
Handlebars.registerHelper("localize", (key, options) => translate(key, options.hash));
Handlebars.registerHelper("eq", (a, b) => a === b);
const template = Handlebars.compile(readFileSync(new URL("../../src/apps/asset-filepaths.hbs", import.meta.url), "utf8"));

function setProperty(object, key, value) {
    const parts = key.split(".");
    const last = parts.pop();
    for (const part of parts) object = object[part] ??= {};
    object[last] = value;
}
class Document {
    constructor(data = {}, parent = null) { Object.assign(this, data); this.parent = parent; }
    get id() { return this._id; }
    get documentName() { return this.constructor.name.replace(/Document$/, ""); }
    get uuid() { return `${this.parent ? this.parent.uuid + "." : ""}${this.documentName}.${this.id}`; }
    async update(patch) { env.updates.push({document: this, patch}); for (const [key, value] of Object.entries(patch)) setProperty(this, key, value); return this; }
}
const types = {};
for (const name of ["Actor", "Item", "JournalEntryPage", "PlaylistSound", "Scene", "AmbientSoundDocument", "TileDocument", "TokenDocument", "User"]) {
    types[name] = class extends Document {};
    Object.defineProperty(types[name], "name", {value: name});
}
export class PrototypeToken { constructor(data) { Object.assign(this, data); } }
class Application {
    async close() { this.rendered = false;this.element?.remove();return this; }
    constructor() { this.rendered = false; this.element = null; this.position = {top: 0, left: 0}; }
    async getData() { return {}; }
    activateListeners() {}
    async render() {
        const context = await this.getData();
        if (!this.element?.isConnected) this.element = document.body.appendChild(document.createElement("div"));
        this.element.innerHTML = template(context);
        this.rendered = true;
        this.activateListeners($(this.element));
        return this;
    }
}
class ApplicationV2 {
    constructor(options = {}) {
        const defaults = this.constructor.DEFAULT_OPTIONS ?? {};
        this.options = {...defaults, ...options, position: {...defaults.position, ...options.position}};
        this.position = {top: 0, left: 0, ...this.options.position};
        this.rendered = false;this.element = null;env.instances.push(this);
    }
    async _prepareContext() { return {}; }
    _onRender() {}
    async render(options = {}) {
        env.renders.push({app: this, options});
        const context = await this._prepareContext(options);
        if (!this.element?.isConnected) this.element = document.body.appendChild(document.createElement(this.options.tag ?? 'div'));
        this.element.id = this.options.id;
        this.element.className = ['application', ...(this.options.classes ?? [])].join(' ');
        this.element.innerHTML = '<section class="window-content">' + template(context) + '</section>';
        this.rendered = true;this._onRender(context, options);
        return this;
    }
    async close() { this.rendered = false;this.element?.remove();return this; }
    bringToFront() { env.fronts.push(this); }
}
class FilePicker {
    constructor(options) { this.options = options; env.pickers.push(this); }
    async browse() {}
    static async browse(source, target, options = {}) {
        const key = `${source}|${target}|${options.wildcard ? "wildcard" : "directory"}`;
        if (!env.listings.has(key)) throw new Error("Directory unavailable");
        const value = env.listings.get(key);
        if (typeof value === "function") return await value();
        return {files: [...value]};
    }
}
export function listing(source, target, files, wildcard = false) {
    env.listings.set(`${source}|${target}|${wildcard ? "wildcard" : "directory"}`, files);
}
export function reset() {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.$ = jquery(dom.window);
    Object.assign(globalThis, types, {FilePicker});
    globalThis.Application = Application;
    globalThis.foundry = {data: {PrototypeToken}, applications: {api: {ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {}}}};
    const collections = new Map(["Actor", "JournalEntry", "Playlist", "Scene", "User"].map(name => [name, []]));
    globalThis.game = {collections, actors: collections.get("Actor"), i18n: {localize: translate, format: translate}};
    globalThis.ui = {notifications: Object.fromEntries(["error", "warn"].map(type => [type, message => env.notifications.push({type, message})]))};
    for (const key of ["pickers", "notifications", "updates", "instances", "renders", "fronts"]) env[key] = [];
    env.listings.clear();
}
export function actor(id = "actor", image = "images/old.webp") {
    const result = new types.Actor({_id: id, name: id, img: image, items: []});
    result.prototypeToken = new PrototypeToken({name: id, texture: {src: image}, randomImg: false});
    game.actors.push(result);
    return result;
}
export async function waitFor(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error("Timed out waiting for the expected UI state");
}
reset();

export const {AssetFilepaths} = await import("../../src/apps/asset-filepaths.js");

export async function waitForAudit(app) {
    let previous;
    while (app._scanPromise && app._scanPromise !== previous) {
        previous = app._scanPromise;
        await previous;
    }
    return app;
}
export async function renderAudit(app, options) {
    await app.render(options);
    return waitForAudit(app);
}
