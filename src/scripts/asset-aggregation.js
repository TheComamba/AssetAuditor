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

function showAssetTypeError(asset, typename = null) {
    if (!typename) {
        typename = asset.constructor.name;
    }
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

function getIcon(type, isValid) {
    if (!isValid) {
        return "fas fa-file-circle-exclamation";
    } else if (type === "PlaylistSound") {
        return "fas fa-file-audio";
    } else {
        showAssetTypeError(asset, type);
        return "fas fa-times"
    }
}

async function isValidPath(path) {
    try {
        const fileResult = await FilePicker.browse("data", path);
        return fileResult.files.includes(path);
    } catch {
        return false;
    }
}

async function getAllAssets() {
    const pointers = getAllAssetPointers();
    let assets = await Promise.all(pointers.map(async (asset) => {
        const path = getAssetPath(asset);
        const type = asset.constructor.name;
        const isValid = await isValidPath(path);
        return {
            name: getAssetName(asset),
            path: path,
            type: type,
            id: getAssetId(asset),
            isValid: isValid,
            icon: getIcon(type, isValid)
        };
    }));

    assets.sort((a, b) => a.path.localeCompare(b.path));

    return assets;
}

export { getAllAssets };