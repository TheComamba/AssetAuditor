# Testing Asset Auditor

## Automated checks

Use Node.js 24 LTS (24.15 or later):

```sh
npm ci --ignore-scripts
npm test
npm run check
```

The Node test runner discovers `tests/*.test.mjs`. Tests exercise aggregation,
path comparison, document targeting, row saves, navigation, grouped usages,
wildcards and scan lifecycle behavior. The snapshot tests cover cached filtering,
explicit rebuilding, edited entries and coordination with active scans and saves. The DOM fixture compiles the real
Handlebars template and simulates Foundry documents, file storage and application
rendering. Metadata tests verify registered language keys and interpolation
parameters, matching versions, and referenced module files.

`npm run check` walks `src/`, validates UTF-8 text in JavaScript, JSON, CSS and
Handlebars files, and runs Node's syntax checker on each JavaScript module. It
includes newly added source files automatically.

The Module tests workflow runs these commands on Linux and Windows for pushes
and pull requests. The existing consistency workflow initializes the
`foundry_scripts` submodule and checks release metadata and localization usage.
To run those helper checks locally, initialize the submodule and use a POSIX
shell with `jq` available:

```sh
git submodule update --init --recursive
./foundry_scripts/check_version_consistency.sh
./foundry_scripts/check_localizations_consistency.sh
```

Development dependencies and check scripts support repository validation. The
installable Foundry module is the `src/` directory.

## Audited references

The audit starts from the world's Actor, JournalEntry, Playlist, Scene and User
collections. The field mapping is defined in `src/scripts/asset-aggregation.js`.

| Reference | Field |
| --- | --- |
| Actor portrait | `img` |
| Actor-owned Item image | `img` |
| JournalEntryPage media | `src` |
| PlaylistSound audio | `path` |
| Actor prototype token image | `prototypeToken.texture.src` |
| Scene background | `background.src` |
| Scene ambient sound | `path` |
| Scene tile image or video | `texture.src` |
| Placed token image | `texture.src` |
| User avatar | `avatar` |

Local checks use User Data and Core Data directory listings. Path comparisons
preserve the returned case, normalize URI representations, and retain the stored
reference. Wildcards use distinct returned file URLs for their match count.
HTTP(S) checks provide a best-effort reachability result cached by origin.

Progress reports completed work within each named stage. Completion follows
reference validation and the preparation of valid-parent-directory hints.

## In-Foundry verification

Use a disposable test world and record the Foundry version, game system/version,
browser and operating system, server operating system, and enabled modules.
The manifest declares Foundry 13 as its minimum and 14 as verified; run the
native window checks on both generations when preparing a release.

Back up the test world before exercising saves or bulk replacement. Record the
outcome and reproduction details for each check.

### Window and scan lifecycle

- [ ] Open Asset Filepaths from the Settings sidebar. Verify the native window,
  resize behavior, light/dark theme, labels and keyboard navigation.
- [ ] Resize from approximately 1100px to 680px. Check long names and paths,
  responsive row layout, fixed tools and a visible scrollbar for the results.
- [ ] Click the launcher twice during an initial render. Verify one audit window.
- [ ] Observe a visible window while a slow scan is running, counters for each
  stage and a completion summary with entry and invalid-reference counts.
- [ ] Search for an unmatched name or enable invalid-only results with all valid
  references. Verify the explicit empty-result message.
- [ ] Close during a slow scan. Verify the window stays closed. Reopen with a new
  query and verify that older results preserve the newer query's result set.
- [ ] Exercise an unavailable index, then restore access and use Refresh index. Verify
  the failure state, retained results and successful retry.

### Snapshot and explicit refresh

- [ ] Finish a scan, then change search text, document type and invalid-only
  filters. Results should change without starting another filesystem scan.
- [ ] Repair a path in invalid-only results. Clear that filter and verify the
  repaired usage reappears with its saved path and validity.
- [ ] Change a reference through its native sheet, add a document or add/remove a
  file outside the audit. The snapshot should retain its previous result until
  **Refresh index** completes, then include the changes.
- [ ] Close and reopen the audit after completion. Verify the snapshot is reused.
  Reload the browser and verify that a new initial scan runs.
- [ ] Request Refresh index during a delayed save. Verify that it waits for the
  write and that the new snapshot contains the persisted result.
- [ ] Make an explicit rebuild fail, then retry. Verify that the last successful
  snapshot remains visible until a new complete scan replaces it.

### Paths, documents and editing

- [ ] Select `sounds/dice.wav` from Core Data for a playlist sound and play it.
  Select an existing Core Data icon, then test a nonexistent icon filename.
- [ ] On a case-sensitive server, compare the listed filename with a reference
  whose filename case differs, from both Windows and Linux browser profiles.
- [ ] Check filenames containing spaces, apostrophes, ampersands, plus signs and Unicode characters using its URI-encoded
  reference and a cache-busting query. Verify the saved reference is retained.
- [ ] Choose a file for an invalid Actor and PlaylistSound. Verify autosaving,
  fresh validation, immediate removal from invalid-only results and preservation
  of another row's draft.
- [ ] Type a path manually, then use Save and Reset. Check that each action
  affects its chosen usage and the appropriate control states.
- [ ] Repair a prototype-token path, reopen the actor and verify persistence and
  its random-image and ring settings.
- [ ] Check wildcard patterns with zero, one and several matches. Verify counts,
  the picker reminder and feedback after saving a pattern or selecting one file.
- [ ] Place copies of the same actor on different scenes. Verify individual
  usages, scene labels, grouped counts and navigation to the correct token.
- [ ] Open a JournalEntryPage, actor-owned Item and PlaylistSound from the audit.
  Open a placeable from another scene while retaining the current canvas.
- [ ] Open a picker, change filters, then select a file. Verify that the obsolete
  picker leaves the current rows and documents unchanged.
- [ ] Request Refresh index during a delayed write. Verify that the scan waits for the
  write. Also close during the write and check that its completion keeps the
  window closed.
- [ ] Exercise a rejected write. Verify its error feedback and retryable row.
- [ ] Search by name, path and parent name. Verify Enter and Escape behavior and
  replacement within the displayed result set.
- [ ] Enable the startup audit and reload as a GM or Assistant GM. Verify an
  invalid-reference notification when the test world contains missing assets.

### Module integration and release record

With Tokenizer enabled, repair a prototype path and inspect the persisted path
and token appearance after reopening the actor. Include the Tokenizer version
and token configuration in the run record. Repeat relevant checks for other
modules that update actor or token images through document hooks.

Record native rendering, timing, audio and integration outcomes separately from
automated test results. Restore the test-world backup after mutation checks.
