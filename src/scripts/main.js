import { AssetFilepaths } from "../apps/asset-filepaths.js";
import { getAllAssets } from "./asset-aggregation.js";

let assetWindow;
let windowRender;

function isUserPermitted() {
    return game.user.role >= CONST.USER_ROLES.ASSISTANT;
}

Hooks.once('init', function () {
    game.settings.register("asset-auditor", "runOnStartup", {
        name: game.i18n.localize("asset-auditor.settings.run-on-startup"),
        hint: game.i18n.localize("asset-auditor.settings.run-on-startup-hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
});

Hooks.once('ready', async function () {
    if (!isUserPermitted()) {
        return;
    }
    if (game.settings.get("asset-auditor", "runOnStartup")) {
        const invalidAssetTypes = await getAllAssets(true, '', '');
        const invalidAssets = invalidAssetTypes.flatMap(assetType => assetType.assets);
        if (invalidAssets.length > 0) {
            const errorMessage = game.i18n.format("asset-auditor.invalid-assets-found", { count: invalidAssets.length });
            ui.notifications.error(errorMessage);
        }
    }
});

Hooks.on("renderSidebar", async (app, html) => {
    if (!isUserPermitted()) {
        return;
    }
    
    let button_text = game.i18n.localize("asset-auditor.asset-filepaths");
    let $button = $(`<button class='asset-list'><i class='fas fa-file-edit'></i> ${button_text}</button>`)

    $button.click(async function () {
        assetWindow ??= new AssetFilepaths();
        windowRender ??= assetWindow.render({force: true});
        try {
            await windowRender;
            assetWindow.bringToFront();
        } finally {
            windowRender = null;
        }
    });

    let settings_sidebar = document.querySelector('#settings .settings');
    if (!settings_sidebar) {
        ui.notifications.error(game.i18n.localize("asset-auditor.sidebar-not-found"));
        return;
    }
    settings_sidebar.appendChild($button[0]);
});
