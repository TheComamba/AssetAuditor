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
        type: "JournalEntryPage",
        collection: getAssets("JournalEntry", journal => journal.pages)
    });
    assets.push({
        type: "PlaylistSound",
        collection: getAssets("Playlist", playlist => playlist.sounds)
    });
    assets.push({
        type: "Scene",
        collection: getAssets("Scene", scene => [scene])
    });
    assets.push({
        type: "Token",
        collection: getAssets("Actor", actor => [actor]).map(actor => actor.prototypeToken)
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

function getAssetPath(asset) {
    if (asset instanceof Actor) {
        return asset.img;
    }
    if (asset instanceof Item) {
        return asset.img;
    }
    if (asset instanceof JournalEntryPage) {
        return asset.src;
    }
    if (asset instanceof PlaylistSound) {
        return asset.path;
    }
    if (asset instanceof Scene) {
        return asset.background.src;
    }
    if (asset instanceof foundry.data.PrototypeToken) {
        return asset.texture.src;
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
    if (asset instanceof JournalEntryPage) {
        return "fas fa-file";
    }
    if (asset instanceof PlaylistSound) {
        return "fas fa-file-audio";
    }
    if (asset instanceof Scene) {
        return "fas fa-file-image";
    }
    if (asset instanceof foundry.data.PrototypeToken) {
        return "fas fa-file-image";
    }
    if (asset instanceof User) {
        return "fas fa-file-image";
    }
    showAssetTypeError(type);
    return "fas fa-times"
}

function collectAssetDirectories(pointerGroups) {
    const assetDirs = new Set();
    pointerGroups.forEach(group => {
        group.collection.forEach(pointer => {
            const path = getAssetPath(pointer);
            if (path === null) {
                return;
            }
            const dir = path.substring(0, path.lastIndexOf('/'));
            assetDirs.add(dir);
        });
    });
    return Array.from(assetDirs);
}

let fileCache = {};

async function initializeFileCache(assetDirs) {
    fileCache = {};
    for (const dir of assetDirs) {
        if (!fileCache.hasOwnProperty(dir)) {
            try {
                const fileResult = await FilePicker.browse("data", dir);
                fileCache[dir] = fileResult.files;
            } catch (error) {
                fileCache[dir] = [];
            }
        }
    }
}

function isValidPath(path) {
    const dirIndex = path.lastIndexOf('/');
    const dir = dirIndex !== -1 ? path.substring(0, dirIndex) : '';
    const files = fileCache[dir];
    return files.includes(path);
}

async function getAllAssets(invalidOnly = false) {
    console.time('getAllAssets');

    const pointerGroups = getAllAssetPointers();
    const assetDirs = collectAssetDirectories(pointerGroups);
    await initializeFileCache(assetDirs);
    let assets = pointerGroups.map(group => {
        let mappedAssets = group.collection.map(asset => {
            return assetPointerToObject(asset);
        });

        mappedAssets = mappedAssets.filter(item => item !== null);

        if (invalidOnly) {
            mappedAssets = mappedAssets.filter(asset => !asset.isValid);
        }

        mappedAssets.sort((a, b) => a.path.localeCompare(b.path));

        return {
            type: group.type,
            assets: mappedAssets
        };
    });

    assets.sort((a, b) => a.type.localeCompare(b.type));

    console.timeEnd('getAllAssets');

    return assets;
}

function assetPointerToObject(asset) {
    if (!asset) {
        return null;
    }
    const id = asset._id;
    if (id === null) {
        return null;
    }
    const name = asset.name;
    if (name === null) {
        return null;
    }
    const path = getAssetPath(asset);
    if (path === null || path.startsWith("icons/")) {
        return null;
    }
    const type = asset.constructor.name;
    if (type === null) {
        return null;
    }
    const isValid = isValidPath(path);
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
