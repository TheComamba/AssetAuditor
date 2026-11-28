import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  reset,
  actor,
  listing,
  env,
  waitFor,
  waitForAudit,
  renderAudit,
  AssetFilepaths,
} from "./helpers/foundry.mjs";
import { auditIndex } from "../src/scripts/asset-index.js";
beforeEach(reset);
const entries = (app) => app._assets.flatMap((group) => group.assets);
const rowFor = (app, subject) =>
  [...app.element.querySelectorAll(".asset-row")].find(
    (row) =>
      row.querySelector(".update-button").dataset.assetId === subject.uuid,
  );
async function open() {
  const app = new AssetFilepaths();
  app.singularType = "Actor";
  return renderAudit(app);
}
async function view(app, options) {
  await app.refresh($(app.element), options);
  await waitForAudit(app);
}

test("search and type/validity filters reuse the complete scan with no file queries", async (t) => {
  actor("one");
  actor("two", "images/valid.webp");
  listing("data", "images", ["images/valid.webp"]);
  const browse = t.mock.method(FilePicker, "browse");
  const app = await open();
  const reads = browse.mock.calls.length;
  const sequence = app._scanSequence;
  app.searchText = "two";
  await view(app);
  assert.equal(entries(app).length, 1);
  app.searchText = "";
  app.showInvalidOnly = true;
  await view(app);
  assert.equal(entries(app).length, 1);
  app.showInvalidOnly = false;
  app.singularType = "PrototypeToken";
  await view(app);
  assert.equal(entries(app).length, 2);
  assert.equal(browse.mock.calls.length, reads);
  assert.equal(app._scanSequence, sequence);
});
test("a repaired entry remains in the snapshot when removed from invalid-only results", async (t) => {
  const subject = actor("one");
  const app = await open();
  app.showInvalidOnly = true;
  await view(app);
  listing("data", "images", ["images/valid.webp"]);
  const browse = t.mock.method(FilePicker, "browse");
  const sequence = app._scanSequence;
  const row = rowFor(app, subject);
  row.querySelector(".path-input").value = "images/valid.webp";
  await app.saveAssetRow(
    $(row.querySelector(".update-button")),
    $(app.element),
  );
  assert.equal(entries(app).length, 0);
  assert.equal(browse.mock.calls.length, 2);
  const reads = browse.mock.calls.length;
  app.showInvalidOnly = false;
  await view(app);
  assert.equal(entries(app)[0].path, "images/valid.webp");
  assert.equal(browse.mock.calls.length, reads);
  assert.equal(app._scanSequence, sequence);
});
test("external document and filesystem changes appear only after Refresh index", async () => {
  const subject = actor("one");
  const app = await open();
  actor("new");
  subject.img = "images/valid.webp";
  listing("data", "images", ["images/valid.webp"]);
  await view(app);
  assert.equal(entries(app).length, 1);
  assert.equal(entries(app)[0].path, "images/old.webp");
  await view(app, { rebuild: true });
  assert.equal(entries(app).length, 2);
  assert.equal(
    entries(app).find((entry) => entry.name === "one").isValid,
    true,
  );
});
test("closing and reopening retains the snapshot without another scan", async (t) => {
  actor("one");
  const app = await open();
  const browse = t.mock.method(FilePicker, "browse");
  await app.close();
  await renderAudit(app);
  assert.equal(entries(app).length, 1);
  assert.equal(browse.mock.calls.length, 0);
  const other = new AssetFilepaths();
  other.singularType = "Actor";
  await renderAudit(other);
  assert.equal(entries(other).length, 1);
  assert.equal(browse.mock.calls.length, 0);
});
test("failed explicit rebuild keeps the prior snapshot and offers a working retry", async (t) => {
  actor("one");
  const app = await open();
  const previous = auditIndex.groups;
  t.mock.method(console, "error", () => {});
  const get = game.collections.get.bind(game.collections);
  game.collections.get = () => {
    throw new Error("unavailable");
  };
  await view(app, { rebuild: true });
  assert.equal(auditIndex.groups, previous);
  assert.equal(app._scanState.phase, "error");
  game.collections.get = get;
  await view(app, { rebuild: true });
  assert.equal(app._scanState.phase, "complete");
});
test("bulk replacement updates cached metadata without rebuilding other usages", async (t) => {
  const first = actor("one");
  actor("other", "elsewhere/portrait.webp");
  const app = await open();
  app.currentSearchInput = "old";
  app.searchText = "old";
  app.replaceText = "valid";
  await view(app);
  listing("data", "images", ["images/valid.webp"]);
  const browse = t.mock.method(FilePicker, "browse");
  const sequence = app._scanSequence;
  await app.performReplacement($(app.element));
  await waitFor(() => !app._loading);
  await view(app);
  assert.equal(first.img, "images/valid.webp");
  assert.equal(entries(app).length, 0);
  app.searchText = "";
  await view(app);
  const entry = entries(app).find((entry) => entry.name === "one");
  assert.equal(entry.isValid, true);
  assert.equal(entry.path, "images/valid.webp");
  assert.equal(browse.mock.calls.length, 2);
  assert.equal(app._scanSequence, sequence);
});
test("Refresh index waits for pending writes using the existing save lifecycle", async () => {
  const subject = actor("one");
  const app = await open();
  listing("data", "images", ["images/valid.webp"]);
  let release;
  const original = subject.update.bind(subject);
  subject.update = async (patch) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return original(patch);
  };
  const row = rowFor(app, subject);
  row.querySelector(".path-input").value = "images/valid.webp";
  const save = app.saveAssetRow(
    $(row.querySelector(".update-button")),
    $(app.element),
  );
  const sequence = app._scanSequence;
  app.refresh($(app.element), { rebuild: true });
  assert.equal(app._scanSequence, sequence);
  release();
  await save;
  await waitForAudit(app);
  assert(app._scanSequence > sequence);
  assert.equal(entries(app)[0].path, "images/valid.webp");
});
test("search changes during initial scan use the latest filter without a second scan", async () => {
  actor("one");
  actor("two");
  let release;
  env.listings.set(
    "data|images|directory",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const app = new AssetFilepaths();
  app.singularType = "Actor";
  await app.render();
  await waitFor(() => release);
  const sequence = app._scanSequence;
  app.searchText = "two";
  app.refresh($(app.element));
  listing("data", "images", []);
  release({ files: [] });
  await waitForAudit(app);
  assert.equal(app._scanSequence, sequence);
  assert.equal(entries(app).length, 1);
  assert.equal(entries(app)[0].name, "two");
});
