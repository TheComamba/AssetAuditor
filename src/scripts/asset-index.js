import {getAllAssets, refreshAssetEntry, setAssetPath} from "./asset-aggregation.js";

// Keep live document references in memory; a JSON file cannot retain their APIs.
// The singleton below lasts until the browser reloads, including window closes.
export class AssetIndex {
    _groups = null;
    _scan = null;
    _writes = new Set();
    _entryWrites = new WeakMap();

    rebuild() {
        if (this._scan) return this._scan;
        const pending = [...this._writes];
        this._scan = (async () => {
            await Promise.allSettled(pending);
            const groups = await getAllAssets(false, '', '');
            // Publish atomically: a failed rebuild retains the previous snapshot.
            this._groups = groups;
        })().finally(() => { this._scan = null; });
        return this._scan;
    }

    async query(invalidOnly = false, searchText = '', singularType = '') {
        if (this._groups === null) await this.rebuild();
        return this._groups.filter(group => !singularType || group.type === singularType)
            .map(group => ({type: group.type, assets: group.assets.filter(entry =>
                (!invalidOnly || !entry.isValid) && (!searchText ||
                    [entry.name, entry.path, entry.parentName ?? ''].some(value => value.includes(searchText))))}));
    }

    save(entry, path) {
        const scan = this._scan;
        const previous = this._entryWrites.get(entry);
        const write = (async () => {
            if (scan) await scan;
            if (previous) await previous.catch(() => {});
            const current = this._groups?.flatMap(group => group.assets)
                .find(candidate => candidate.id === entry.id && candidate.type === entry.type) ?? entry;
            const document = await setAssetPath(current.asset, path);
            // Prototype updates may replace the data model on the owning actor.
            current.asset = document;
            const updated = await refreshAssetEntry(document);
            if (!updated) throw new Error('The saved asset is no longer available.');
            Object.assign(current, updated);
            if (entry !== current) Object.assign(entry, updated);
            return current;
        })();
        this._writes.add(write);
        this._entryWrites.set(entry, write);
        write.finally(() => {
            this._writes.delete(write);
            if (this._entryWrites.get(entry) === write) this._entryWrites.delete(entry);
        }).catch(() => {});
        return write;
    }
}

export const auditIndex = new AssetIndex();
