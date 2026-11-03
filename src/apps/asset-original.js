import { getPrototypeActor } from "../scripts/asset-identity.js";

// Navigation: navigate to an existing document without changing its data or scene.

export async function openAssetOriginal(asset) {
    if (!asset) throw new Error("Asset is no longer available.");

    if (asset instanceof foundry.data.PrototypeToken) {
        const actor = getPrototypeActor(asset);
        if (!actor) throw new Error("The prototype token's actor is no longer available.");
        const Config = foundry.applications.sheets.PrototypeTokenConfig;
        return await new Config({actor}).render({force: true});
    }

    // Open the journal at the affected page rather than its default first page.
    if (asset.documentName === "JournalEntryPage" && asset.parent?.sheet) {
        return await asset.parent.sheet.render(true, {pageId: asset.id});
    }

    if (asset.documentName === "PlaylistSound") {
        return await new foundry.applications.sheets.PlaylistSoundConfig({document: asset}).render({force: true});
    }

    // Embedded Items and scene placeables retain their own sheets.
    // Do not activate or view their parent Scene: that would change the GM's canvas.
    if (asset.sheet) return await asset.sheet.render(true);
    throw new Error(`No configuration sheet is available for ${asset.documentName ?? asset.constructor.name}.`);
}
