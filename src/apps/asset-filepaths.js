import { getAllAssets } from "../scripts/asset-aggregation.js";

class AssetFilepaths extends Application {
    constructor() {
        super();
        this.context = {};
    }

    get template() {
        return `modules/asset_auditor/apps/asset-filepaths.hbs`;
    }

    async getData(options = {}) {
        this.context = await super.getData(options);
        this.context.title = game.i18n.localize("asset_auditor.asset-filepaths");
        this.context.assets = await getAllAssets();
        return this.context;
    }
}

export { AssetFilepaths };
