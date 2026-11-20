// Group rendered usages by their persisted path, retaining the original row nodes.
export function groupAssetRows(root, format, getSavedPath) {
    if (!root?.querySelectorAll) return;
    const Observer = root.ownerDocument.defaultView.MutationObserver;
    const options = {childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"]};
    const observer = new Observer(records => {
        if (records.some(record => record.target.closest?.('.asset-type-group'))) reconcile();
    });

    function reconcile() {
        observer.disconnect();
        try {
            for (const container of root.querySelectorAll('.asset-type-group')) {
                const paths = new Map();
                for (const row of container.querySelectorAll('.asset-row')) {
                    const path = String(getSavedPath(row.querySelector('.path-input')) ?? '');
                    if (!paths.has(path)) paths.set(path, []);
                    paths.get(path).push(row);
                }
                const existing = new Map([...container.querySelectorAll(':scope > .asset-path-group')]
                    .map(group => [group.dataset.path, group]));
                const countKey = container.dataset.assetType === "TokenDocument"
                    ? "asset-auditor.app.token-usages" : "asset-auditor.app.asset-usages";
                for (const [path, rows] of paths) {
                    let group = existing.get(path);
                    if (!group) {
                        group = root.ownerDocument.createElement('details');
                        group.className = 'asset-path-group';
                        group.dataset.path = path;
                        group.style.marginBottom = '8px';
                        group.open = rows.length === 1;
                        const summary = root.ownerDocument.createElement('summary');
                        summary.style.cssText = 'cursor: pointer; overflow-wrap: anywhere; padding: 6px 0;';
                        const count = root.ownerDocument.createElement('strong');
                        count.className = 'asset-group-count';
                        const label = root.ownerDocument.createElement('span');
                        label.textContent = ' \u2014 ' + path;
                        summary.append(count, label);
                        group.append(summary);
                        container.append(group);
                    }
                    if (rows.length === 1) group.open = true;
                    group.querySelector('.asset-group-count').textContent = format(countKey, {count: rows.length});
                    for (const row of rows) {
                        if (row.parentElement === group) continue;
                        const hint = row.nextElementSibling?.matches('.asset-invalid-hint') ? row.nextElementSibling : null;
                        group.append(row);
                        if (hint) group.append(hint);
                    }
                }
                for (const [path, group] of existing) {
                    if (!paths.has(path)) group.remove();
                }
                container.hidden = paths.size === 0;
            }
        } finally {
            observer.observe(root, options);
        }
    }

    reconcile();
    // In-place saves update persisted input data and restore disabled controls;
    // row removals also change counts. Observe those lifecycle changes together.
    return observer;
}
