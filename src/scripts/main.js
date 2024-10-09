import { AssetFilepaths } from "../apps/asset-filepaths.js";
import { getAllAssets } from "./asset-aggregation.js";

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

Hooks.on("renderSidebarTab", async (app, html) => {
    if (!isUserPermitted()) {
        return;
    }
    if (app instanceof Settings) {
        let button_text = game.i18n.localize("asset-auditor.asset-filepaths");
        let button = $(`<button class='asset-list'><i class='fas fa-file-edit'></i> ${button_text}</button>`)

        button.click(function () {
            new AssetFilepaths().render(true);
        });

        let settings_sidebar = html.find("div#settings-game");
        if (settings_sidebar.length == 0) {
            ui.notifications.error(game.i18n.localize("asset-auditor.sidebar-not-found"));
            return;
        }
        settings_sidebar.append(button);
    }
})
