function getAssets(collectionName, extractAssets) {
    const assets = [];
    const assetIds = new Set();
    const collection = game.collections.get(collectionName);

    collection.forEach(item => {
        const items = extractAssets(item);
        items.forEach(asset => {
            if (!assetIds.has(asset._id)) {
                assets.push(asset);
                assetIds.add(asset._id);
            }
        });
    });

    return assets;
}

function getAllAssetPointers() {
    const assets = [];
    assets.push({
        type: "Actor",
        collection: getAssets("Actor", actor => [actor])
    });
    assets.push({
        type: "Item",
        collection: getAssets("Item", item => [item])
    });
    assets.push({
        type: "PlaylistSound",
        collection: getAssets("Playlist", playlist => playlist.sounds)
    });
    assets.push({
        type: "User",
        collection: getAssets("User", user => [user])
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
    if (asset instanceof Item) {
        return asset.name;
    }
    if (asset instanceof PlaylistSound) {
        return asset.name;
    }
    if (asset instanceof User) {
        return asset.name;
    }
    showAssetTypeError(asset.constructor.name);
    return null;
}

function getAssetPath(asset) {
    if (asset instanceof Actor) {
        return asset.img;
    }
    if (asset instanceof Item) {
        return asset.img;
    }
    if (asset instanceof PlaylistSound) {
        return asset.path;
    }
    if (asset instanceof User) {
        return asset.avatar;
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
    if (asset instanceof Item) {
        return "fas fa-file-image";
    }
    if (asset instanceof PlaylistSound) {
        return "fas fa-file-audio";
    }
    if (asset instanceof User) {
        return "fas fa-file-image";
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
    const id = asset._id;
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
