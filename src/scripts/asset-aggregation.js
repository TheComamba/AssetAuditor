import { getPrototypeActor } from "./asset-identity.js";

const domainCache = {};
function getAssets(collectionName, extractAssets) {
  const assets = [];
  const identities = new Set();
  for (const item of game.collections.get(collectionName) ?? []) {
    for (const asset of extractAssets(item) ?? []) {
      if (!asset) continue;
      // Embedded IDs are unique within their parent, not across the world.
      const identity = asset.uuid ?? asset;
      if (!identities.has(identity)) {
        identities.add(identity);
        assets.push(asset);
      }
    }
  }
  return assets;
}

const assetTypes = [
  { type: Actor, startAsset: "Actor", closure: (actor) => [actor] },
  { type: Item, startAsset: "Actor", closure: (actor) => actor.items },
  {
    type: JournalEntryPage,
    startAsset: "JournalEntry",
    closure: (journal) => journal.pages,
  },
  {
    type: PlaylistSound,
    startAsset: "Playlist",
    closure: (playlist) => playlist.sounds,
  },
  {
    type: foundry.data.PrototypeToken,
    startAsset: "Actor",
    closure: (actor) => [actor.prototypeToken],
  },
  { type: Scene, startAsset: "Scene", closure: (scene) => [scene] },
  {
    type: AmbientSoundDocument,
    startAsset: "Scene",
    closure: (scene) => scene.sounds,
  },
  { type: TileDocument, startAsset: "Scene", closure: (scene) => scene.tiles },
  {
    type: TokenDocument,
    startAsset: "Scene",
    closure: (scene) => scene.tokens,
  },
  { type: User, startAsset: "User", closure: (user) => [user] },
];

function getAllAssetTypes() {
  const types = assetTypes.map((assetType) => assetType.type.name);
  types.sort((a, b) => a.localeCompare(b));
  return types;
}

function getAllAssetPointers(singularType) {
  let assets = assetTypes.map((assetType) => {
    if (singularType && assetType.type.name !== singularType) {
      return null;
    }
    return {
      type: assetType.type.name,
      collection: getAssets(assetType.startAsset, assetType.closure),
    };
  });
  assets = assets.filter((asset) => asset !== null);
  assets.sort((a, b) => a.type.localeCompare(b.type));
  return assets;
}

const postedErrorMessages = new Set();

function showAssetTypeError(typename) {
  const message = game.i18n.format(
    "asset-auditor.asset-aggregation.type-error",
    { type: typename },
  );
  if (!postedErrorMessages.has(message)) {
    ui.notifications.error(message);
    postedErrorMessages.add(message);
  }
}

const assetPathMap = new Map([
  [Actor, "img"],
  [AmbientSoundDocument, "path"],
  [Item, "img"],
  [JournalEntryPage, "src"],
  [PlaylistSound, "path"],
  [foundry.data.PrototypeToken, "texture.src"],
  [Scene, "background.src"],
  [TileDocument, "texture.src"],
  [TokenDocument, "texture.src"],
  [User, "avatar"],
]);

function getAssetPath(asset) {
  for (const [assetType, propertyPath] of assetPathMap.entries()) {
    if (asset instanceof assetType) {
      return propertyPath.split(".").reduce((obj, prop) => obj[prop], asset);
    }
  }
  showAssetTypeError(asset.constructor.name);
  return null;
}

async function setAssetPath(asset, path) {
  for (const [assetType, propertyPath] of assetPathMap.entries()) {
    if (asset instanceof assetType) {
      if (asset instanceof foundry.data.PrototypeToken) {
        const actor = getPrototypeActor(asset);
        if (!actor)
          throw new Error(
            "The prototype token's actor is no longer available.",
          );
        await actor.update({ [`prototypeToken.${propertyPath}`]: path });
        return actor.prototypeToken;
      }
      return (await asset.update({ [propertyPath]: path })) ?? asset;
    }
  }
  throw new Error(`Unsupported asset type: ${asset.constructor.name}`);
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
  showAssetTypeError(asset.constructor.name);
  return "fas fa-times";
}

function collectAssetDirectories(pointerGroups) {
  const assetDirs = new Set();
  pointerGroups.forEach((group) => {
    group.collection.forEach((pointer) => {
      const path = getAssetPath(pointer);
      if (path === null) {
        return;
      }
      const pathWithoutQuery = stripQueryString(path);
      const dir = pathWithoutQuery.substring(
        0,
        pathWithoutQuery.lastIndexOf("/"),
      );
      assetDirs.add(dir);
    });
  });
  return Array.from(assetDirs);
}

// Asset URLs can resolve to either User Data or Foundry's built-in Core Data.
async function browseAssetSources(target, options = {}) {
  const results = await Promise.allSettled(
    ["data", "public"].map((source) =>
      FilePicker.browse(source, target, options),
    ),
  );
  return results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
}

async function initializeFileCache(assetDirs, onProgress) {
  const fileCache = {};
  const directories = assetDirs.filter((dir) => !isUrl(dir));
  let completed = 0;
  onProgress?.({ phase: "directories", completed, total: directories.length });
  for (const dir of directories) {
    if (!Object.hasOwn(fileCache, dir)) {
      try {
        const listings = await browseAssetSources(dir);
        const fileResult = {
          files: listings.flatMap((listing) => listing.files),
        };
        fileCache[dir] = fileResult.files;
      } catch {
        fileCache[dir] = [];
      }
    }
    onProgress?.({
      phase: "directories",
      completed: ++completed,
      total: directories.length,
    });
  }
  return fileCache;
}

function normalizeLocalPath(path) {
  const localPath = stripQueryString(path).replace(/^\/+/, "");
  // Decode each filename component once. Keep component boundaries so an
  // encoded slash cannot be mistaken for a real directory separator.
  return JSON.stringify(
    localPath.split("/").map((component) => {
      try {
        return decodeURIComponent(component);
      } catch {
        return component;
      }
    }),
  );
}

function isFileContained(file, files = []) {
  const normalized = normalizeLocalPath(file);
  return files.some(
    (candidate) => normalizeLocalPath(candidate) === normalized,
  );
}

function isUrl(path) {
  return path.startsWith("http://") || path.startsWith("https://");
}

function stripQueryString(path) {
  const queryIndex = path.indexOf("?");
  return queryIndex !== -1 ? path.substring(0, queryIndex) : path;
}

async function isValidPath(path, fileCache) {
  if (isUrl(path)) {
    return await isValidHttpDomain(path);
  } else {
    return await isValidLocalPath(path, fileCache);
  }
}

async function isValidLocalPath(path, fileCache) {
  const pathWithoutQuery = stripQueryString(path);

  if (containsWildcard(pathWithoutQuery)) {
    return await wildcardExpandsToAtLeastOne(pathWithoutQuery);
  }

  const dirIndex = pathWithoutQuery.lastIndexOf("/");
  const dir = dirIndex !== -1 ? pathWithoutQuery.substring(0, dirIndex) : "";
  const files = fileCache[dir];
  return isFileContained(pathWithoutQuery, files);
}

function containsWildcard(path) {
  return path.includes("*") || (path.includes("{") && path.includes("}"));
}

function isWildcardPath(path) {
  return !isUrl(path) && containsWildcard(stripQueryString(path));
}

async function wildcardMatchCount(path) {
  const results = await Promise.allSettled(
    ["data", "public"].map((source) =>
      FilePicker.browse(source, stripQueryString(path), { wildcard: true }),
    ),
  );
  const files = results.flatMap((result) =>
    result.status === "fulfilled" ? (result.value?.files ?? []) : [],
  );
  return new Set(files).size;
}

async function wildcardExpandsToAtLeastOne(path) {
  return (await wildcardMatchCount(path)) > 0;
}

// Checking the full path is not possible due to CORS issues,
// so checking if the domain is valid will need to suffice.
async function isValidHttpDomain(path) {
  const url = new URL(path);
  const domain = url.origin;
  if (domainCache[domain] !== undefined) {
    return domainCache[domain];
  }
  let isValid;
  try {
    await fetch(path, { method: "HEAD", mode: "no-cors" });
    isValid = true;
  } catch {
    isValid = false;
  }
  domainCache[domain] = isValid;
  return isValid;
}

async function dirExists(dir) {
  return (await browseAssetSources(dir)).length > 0;
}

async function getLastValidPath(inputPath) {
  const pathWithoutQuery = stripQueryString(inputPath);
  const pathComponents = pathWithoutQuery.split("/");
  let lastValidPath = "";
  let currentPath = "";

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

async function addLastValidPathsToInvalidAssets(assets, onProgress) {
  const total = assets.reduce(
    (count, group) =>
      count + group.assets.filter((asset) => !asset.isValid).length,
    0,
  );
  let completed = 0;
  onProgress?.({ phase: "hints", completed, total });
  for (const assetTypes of assets) {
    for (const asset of assetTypes.assets) {
      if (!asset.isValid) {
        asset.lastValidPath = await getLastValidPath(asset.path);
        onProgress?.({ phase: "hints", completed: ++completed, total });
      }
    }
  }
}

async function getAllAssets(invalidOnly, searchText, singularType, onProgress) {
  const pointerGroups = getAllAssetPointers(singularType);
  const assetDirs = collectAssetDirectories(pointerGroups);
  const fileCache = await initializeFileCache(assetDirs, onProgress);
  const total = pointerGroups.reduce(
    (count, group) => count + group.collection.length,
    0,
  );
  let completed = 0;
  onProgress?.({ phase: "documents", completed, total });
  const assetPromises = pointerGroups.map(async (group) => {
    const mappedAssetPromises = group.collection.map(async (asset) => {
      const result = await assetPointerToObject(asset, fileCache);
      onProgress?.({ phase: "documents", completed: ++completed, total });
      return result;
    });

    let mappedAssets = await Promise.all(mappedAssetPromises);

    mappedAssets = mappedAssets.filter((item) => item !== null);

    if (invalidOnly) {
      mappedAssets = mappedAssets.filter((asset) => !asset.isValid);
    }

    if (searchText) {
      const search = searchText;
      mappedAssets = mappedAssets.filter(
        (asset) =>
          asset.name.includes(search) ||
          asset.path.includes(search) ||
          (asset.asset.parent?.name ?? "").includes(search),
      );
    }

    mappedAssets.sort((a, b) => a.name.localeCompare(b.name));

    return {
      type: group.type,
      assets: mappedAssets,
    };
  });

  const assets = await Promise.all(assetPromises);

  await addLastValidPathsToInvalidAssets(assets, onProgress);

  assets.sort((a, b) => a.type.localeCompare(b.type));

  return assets;
}

async function assetPointerToObject(asset, fileCache) {
  if (!asset) {
    return null;
  }
  const owner =
    asset instanceof foundry.data.PrototypeToken
      ? getPrototypeActor(asset)
      : null;
  const id =
    asset.uuid ??
    (owner ? `${owner.uuid}.prototypeToken` : (asset.id ?? asset._id));
  if (!id) return null;
  const name = asset.name ?? "";
  if (!name) {
    return null;
  }
  const path = getAssetPath(asset);
  if (!path) {
    return null;
  }
  const type = asset.constructor.name;
  if (!type) {
    return null;
  }
  const isWildcard = isWildcardPath(path);
  const wildcardCount = isWildcard ? await wildcardMatchCount(path) : null;
  const isValid = isWildcard
    ? wildcardCount > 0
    : await isValidPath(path, fileCache);
  if (isValid === null) {
    return null;
  }
  const icon = getIcon(asset, isValid);
  if (!icon) {
    return null;
  }
  return {
    asset: asset,
    parentName: asset.parent?.name ?? "",
    parentType: asset.parent?.documentName ?? "",
    icon: icon,
    id: id,
    isValid: isValid,
    isWildcard,
    wildcardCount,
    name: name,
    path: path,
    type: type,
  };
}

// Revalidate saved paths against a fresh listing rather than the scan's cache.
async function checkAssetPath(path) {
  if (!path) return false;
  const cleanPath = stripQueryString(path);
  const directory = cleanPath.substring(0, cleanPath.lastIndexOf("/"));
  return await isValidPath(path, await initializeFileCache([directory]));
}

export {
  getAllAssets,
  getAllAssetTypes,
  getAssetPath,
  getLastValidPath,
  setAssetPath,
  checkAssetPath,
  getIcon,
  isWildcardPath,
  wildcardMatchCount,
};
