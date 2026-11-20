import {isWildcardPath, wildcardMatchCount} from "../scripts/asset-aggregation.js";

const pendingFeedback = new WeakMap();

// Refresh the saved-path annotation without replacing the row or its draft input.
export async function updateWildcardFeedback(entry, row) {
    if (!row?.isConnected) return;
    const request = {};
    pendingFeedback.set(row, request);
    const path = entry.path;
    const isWildcard = isWildcardPath(path);
    const wildcardCount = isWildcard ? await wildcardMatchCount(path) : null;
    if (!row.isConnected || entry.path !== path || pendingFeedback.get(row) !== request) return;
    Object.assign(entry, {isWildcard, wildcardCount});
    let info = row.querySelector('.asset-wildcard-info');
    if (!isWildcard) { info?.remove();return; }
    if (!info) {
        info = row.ownerDocument.createElement('small');
        info.className = 'asset-wildcard-info';
        info.style.cssText = 'display: block; margin-top: 3px;';
        row.querySelector('.asset-identity').append(info);
    }
    info.textContent = game.i18n.format("asset-auditor.app.wildcard-count", {count: wildcardCount});
    info.title = game.i18n.localize("asset-auditor.app.wildcard-picker-warning");
}
