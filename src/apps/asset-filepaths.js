import { getAllAssets } from "../scripts/asset-aggregation.js";

class AssetFilepaths extends Application {
    constructor() {
        super();
        this.context = {};
        this.showInvalidOnly = false;
    }

    get template() {
        return `modules/asset_auditor/apps/asset-filepaths.hbs`;
    }

    async getData(options = {}) {
        this.context = await super.getData(options);
        this.context.title = game.i18n.localize("asset_auditor.asset-filepaths");
        this.context.showInvalidOnly = this.showInvalidOnly
        this.context.assets = await getAllAssets(this.showInvalidOnly);
        return this.context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('#toggle-invalid').change(async (event) => {
            this.showInvalidOnly = event.target.checked;
            this.render();
        });
    }
}

export { AssetFilepaths };
