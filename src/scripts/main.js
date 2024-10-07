import { AssetFilepaths } from "../apps/asset-filepaths.js";
import { getAllAssets } from "./asset-aggregation.js";

Hooks.once('init', function () {
    game.settings.register("asset_auditor", "runOnStartup", {
        name: game.i18n.localize("asset_auditor.settings.run-on-startup"),
        hint: game.i18n.localize("asset_auditor.settings.run-on-startup-hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
});

Hooks.once('ready', async function () {
    if (game.settings.get("asset_auditor", "runOnStartup")) {
        const invalidAssets = await getAllAssets(true, '', '');
        if (invalidAssets.length > 0) {
            const errorMessage = game.i18n.format("asset_auditor.invalid-assets-found", { count: invalidAssets.length });
            ui.notifications.error(errorMessage);
        }
    }
});

Hooks.on("renderSidebarTab", async (app, html) => {
    if (app instanceof Settings) {
        let button_text = game.i18n.localize("asset_auditor.asset-filepaths");
        let button = $(`<button class='asset-list'><i class='fas fa-file-edit'></i> ${button_text}</button>`)

        button.click(function () {
            new AssetFilepaths().render(true);
        });

        let settings_sidebar = html.find("div#settings-game");
        if (settings_sidebar.length == 0) {
            ui.notifications.error(game.i18n.localize("asset_auditor.sidebar-not-found"));
            return;
        }
        settings_sidebar.append(button);
    }
})
