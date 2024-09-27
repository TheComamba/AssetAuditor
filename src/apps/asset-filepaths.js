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
        this.context.header = game.i18n.localize("asset_auditor.asset-filepaths");
        this.context.content = "Content";
        this.context.footer = "Footer";
        return this.context;
    }
}

export { AssetFilepaths };
