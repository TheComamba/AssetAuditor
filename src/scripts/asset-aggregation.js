function getAllAssetPointers() {
    const assets = [];
    const assetIds = new Set();
    const playlists = game.collections.get("Playlist");

    playlists.forEach(collection => {
        const sounds = collection.sounds;
        sounds.forEach(sound => {
            if (!assetIds.has(sound._id)) {
                assets.push(sound);
                assetIds.add(sound._id);
            }
        });
    });

    return assets;
}

function showAssetTypeError(asset) {
    const typename = asset.constructor.name;
    const message = game.i18n.format("asset_auditor.asset-aggregation.type-error", { type: typename });
    ui.notifications.error(message);
}

function getAssetName(asset) {
    if (asset instanceof PlaylistSound) {
        return asset.name;
    }
    showAssetTypeError(asset);
}

function getAssetPath(asset) {
    if (asset instanceof PlaylistSound) {
        return asset.path;
    }
    showAssetTypeError(asset);
}

function getAssetId(asset) {
    if (asset instanceof PlaylistSound) {
        return asset._id;
    }
    showAssetTypeError(asset);
}

function getAllAssets() {
    const pointers = getAllAssetPointers();
    let assets = pointers.map(asset => ({
        name: getAssetName(asset),
        path: getAssetPath(asset),
        type: asset.constructor.name,
        id: getAssetId(asset)
    }));

    assets.sort((a, b) => a.path.localeCompare(b.path));

    return assets;
}

export { getAllAssets };
