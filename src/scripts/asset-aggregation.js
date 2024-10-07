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
        type: "PrototypeToken",
        collection: getAssets("Actor", actor => [actor]).map(actor => actor.prototypeToken)
    });
    assets.push({
        type: "Scene",
        collection: getAssets("Scene", scene => [scene])
    });
    assets.push({
        type: "Sound",
        collection: getAssets("Scene", scene => scene.sounds)
    });
    assets.push({
        type: "Tile",
        collection: getAssets("Scene", scene => scene.tiles)
    });
    assets.push({
        type: "Token",
        collection: getAssets("Scene", scene => scene.tokens)
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

const assetPathMap = new Map([
    [Actor, 'img'],
    [AmbientSoundDocument, 'path'],
    [Item, 'img'],
    [JournalEntryPage, 'src'],
    [PlaylistSound, 'path'],
    [foundry.data.PrototypeToken, 'texture.src'],
    [Scene, 'background.src'],
    [TileDocument, 'texture.src'],
    [TokenDocument, 'texture.src'],
    [User, 'avatar']
]);

function getAssetPath(asset) {
    for (const [assetType, propertyPath] of assetPathMap.entries()) {
        if (asset instanceof assetType) {
            return propertyPath.split('.').reduce((obj, prop) => obj[prop], asset);
        }
    }
    showAssetTypeError(asset.constructor.name);
    return null;
}

async function setAssetPath(asset, path) {
    for (const [assetType, propertyPath] of assetPathMap.entries()) {
        if (asset instanceof assetType) {
            await asset.update({ [propertyPath]: path });
            return;
        }
    }
    showAssetTypeError(asset.constructor.name);
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
    if (asset instanceof foundry.data.PrototypeToken) {
        return "fas fa-file-image";
    }
    if (asset instanceof Scene) {
        return "fas fa-file-image";
    }
    if (asset instanceof AmbientSoundDocument) {
        return "fas fa-file-audio";
    }
    if (asset instanceof TileDocument) {
        return "fas fa-file-image";
    }
    if (asset instanceof TokenDocument) {
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

async function initializeFileCache(assetDirs) {
    const fileCache = {};
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
    return fileCache;
}

function isFileContained(file, files) {
    while (file.startsWith('/')) {
        file = file.substring(1);
    }
    if (files.includes(file)) {
        return true;
    }
    const encodedFile = encodeURI(file);
    for (const f of files) {
        if (f === encodedFile) {
            return true;
        }
    }
    return false;
}

function isValidPath(path, fileCache) {
    const dirIndex = path.lastIndexOf('/');
    const dir = dirIndex !== -1 ? path.substring(0, dirIndex) : '';
    const files = fileCache[dir];
    return isFileContained(path, files);
}

async function dirExists(dir) {
    try {
        const result = await FilePicker.browse("data", dir);
        return true;
    } catch (error) {
        return false;
    }
}

async function getLastValidPath(inputPath) {
    const pathComponents = inputPath.split('/');
    let lastValidPath = '';
    let currentPath = '';

    for (const component of pathComponents) {
        currentPath = currentPath ? `${currentPath}/${component}` : component;
        if (await dirExists(currentPath)) {
            lastValidPath = currentPath;
        } else {
            break;
        }
    }

    return lastValidPath;
}

async function addLastValidPathsToInvalidAssets(assets) {
    for (const assetTypes of assets) {
        for (const asset of assetTypes.assets) {
            if (!asset.isValid) {
                asset.lastValidPath = await getLastValidPath(asset.path);
            }
        }
    }
}

async function getAllAssets(invalidOnly = false, searchText = '') {
    console.time('getAllAssets');

    const pointerGroups = getAllAssetPointers();
    const assetDirs = collectAssetDirectories(pointerGroups);
    const fileCache = await initializeFileCache(assetDirs);
    let assets = pointerGroups.map(group => {
        let mappedAssets = group.collection.map(asset => {
            return assetPointerToObject(asset, fileCache);
        });

        mappedAssets = mappedAssets.filter(item => item !== null);

        if (invalidOnly) {
            mappedAssets = mappedAssets.filter(asset => !asset.isValid);
        }

        if (searchText) {
            const search = searchText;
            mappedAssets = mappedAssets.filter(asset => asset.name.includes(search) || asset.path.includes(search));
        }

        mappedAssets.sort((a, b) => a.name.localeCompare(b.name));

        return {
            type: group.type,
            assets: mappedAssets
        };
    });

    await addLastValidPathsToInvalidAssets(assets);

    assets.sort((a, b) => a.type.localeCompare(b.type));

    console.timeEnd('getAllAssets');

    return assets;
}

function assetPointerToObject(asset, fileCache) {
    if (!asset) {
        return null;
    }
    const id = asset._id;
    if (id === null) {
        return null;
    }
    const name = asset.name ?? '';
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
    const isValid = isValidPath(path, fileCache);
    if (isValid === null) {
        return null;
    }
    const icon = getIcon(asset, isValid);
    if (icon === null) {
        return null;
    }
    return {
        asset: asset,
        icon: icon,
        id: id,
        isValid: isValid,
        name: name,
        path: path,
        type: type,
    };
}

export { getAllAssets, getAssetPath, setAssetPath };
