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

        html.find('.update-button').click((event) => {
            const button = $(event.currentTarget);
            const inputValue = button.siblings('.path-input').val();
            const assetId = button.data('asset-id');
            this.updateAssetPath(assetId, inputValue);
        });
    }

    updateAssetPath(assetId, inputValue) {
        console.log("Button clicked with input:", inputValue, "Asset ID:", assetId);
        // TODO: Logic.
    };
}

export { AssetFilepaths };
