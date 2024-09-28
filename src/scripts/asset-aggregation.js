function getActors() {
    const assets = [];
    const assetIds = new Set();
    const actors = game.collections.get("Actor");

    actors.forEach(actor => {
        if (!assetIds.has(actor._id)) {
            assets.push(actor);
            assetIds.add(actor._id);
        }
    });

    return assets;
}

function getPlaylistSounds() {
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

function getAllAssetPointers() {
    const assets = [];
    assets.push({
        type: "PlaylistSound",
        collection: getPlaylistSounds()
    });
    assets.push({
        type: "Actor",
        collection: getActors()
    });
    return assets;
}

const postedErrorMessages = new Set();

function showAssetTypeError(typename) {
    const message = game.i18n.format("asset_auditor.asset-aggregation.type-error", { type: typename });
    if (!postedErrorMessages.has(message)) {
        ui.notifications.error(message);
        postedErrorMessages.add(message);
    }
}

function getAssetName(asset) {
    if (asset instanceof Actor) {
        return asset.name;
    }
    if (asset instanceof PlaylistSound) {
        return asset.name;
    }
    showAssetTypeError(asset.constructor.name);
    return null;
}

function getAssetPath(asset) {
    if (asset instanceof Actor) {
        return asset.img;
    }
    if (asset instanceof PlaylistSound) {
        return asset.path;
    }
    showAssetTypeError(asset.constructor.name);
    return null;
}

function getAssetId(asset) {
    if (asset instanceof Actor) {
        return asset._id;
    }
    if (asset instanceof PlaylistSound) {
        return asset._id;
    }
    showAssetTypeError(asset.constructor.name);
    return null;
}

function getIcon(asset, isValid) {
    if (!isValid) {
        return "fas fa-file-circle-exclamation";
    }
    if (asset instanceof Actor) {
        return "fas fa-file-image";
    }
    if (asset instanceof PlaylistSound) {
        return "fas fa-file-audio";
    }
    showAssetTypeError(type);
    return "fas fa-times"
}

async function isValidPath(path) {
    try {
        const fileResult = await FilePicker.browse("data", path);
        const files = fileResult.files;
        return files.includes(path);
    } catch (error) {
        return false;
    }
}

async function getAllAssets(invalidOnly = false) {
    const pointerGroups = getAllAssetPointers();
    let assets = await Promise.all(
        pointerGroups.map(async group => {
            let mappedAssets = await Promise.all(
                group.collection.map(async (asset) => {
                    return await assetPointerToObject(asset);
                })
            );

            mappedAssets = mappedAssets.filter(item => item !== null);

            if (invalidOnly) {
                mappedAssets = mappedAssets.filter(asset => !asset.isValid);
            }

            mappedAssets.sort((a, b) => a.path.localeCompare(b.path));

            return {
                type: group.type,
                assets: mappedAssets
            };
        })
    );

    assets.sort((a, b) => a.type.localeCompare(b.type));

    return assets;
}

async function assetPointerToObject(asset) {
    if (!asset) {
        return null;
    }
    const id = getAssetId(asset);
    if (id === null) {
        return null;
    }
    const name = getAssetName(asset);
    if (name === null) {
        return null;
    }
    const path = getAssetPath(asset);
    if (path === null) {
        return null;
    }
    const type = asset.constructor.name;
    if (type === null) {
        return null;
    }
    const isValid = await isValidPath(path);
    if (isValid === null) {
        return null;
    }
    const icon = getIcon(asset, isValid);
    if (icon === null) {
        return null;
    }
    return {
        icon: icon,
        id: id,
        isValid: isValid,
        name: name,
        path: path,
        type: type,
    };
}

export { getAllAssets };