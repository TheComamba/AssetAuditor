import { getAllAssets, getAssetPath, setAssetPath } from "../scripts/asset-aggregation.js";

class AssetFilepaths extends Application {
    constructor() {
        super();
        this.context = {};
        this.showInvalidOnly = false;
        this.searchText = '';
    }

    get template() {
        return `modules/asset_auditor/apps/asset-filepaths.hbs`;
    }

    async getData(options = {}) {
        this.context = await super.getData(options);
        this.context.title = game.i18n.localize("asset_auditor.asset-filepaths");
        this.context.showInvalidOnly = this.showInvalidOnly
        this.context.searchText = this.searchText;
        this.context.assets = await getAllAssets(this.showInvalidOnly, this.searchText);
        return this.context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('#toggle-invalid').change(async (event) => {
            this.showInvalidOnly = event.target.checked;
            this.render();
        });

        html.find('.search-button').click((event) => {
            const button = $(event.currentTarget);
            const input = button.siblings('.search-input');
            this.searchText = input.val();
            this.render();
        });

        html.find('.replace-button').click(async (event) => {
            const button = $(event.currentTarget);
            const input = button.siblings('.search-input');
            const searchText = input.val();
            const replaceText = input.siblings('.replace-input').val();
            const assets = this.context.assets.flatMap(assetMap => assetMap.assets.map(asset => asset.asset));
            for (const asset of assets) {
                const currentPath = getAssetPath(asset);
                if (currentPath.includes(searchText)) {
                    const newPath = currentPath.replace(searchText, replaceText);
                    await setAssetPath(asset, newPath);
                }
            }
            this.searchText = '';
            this.render();
        });

        html.find('.update-button').click((event) => {
            const button = $(event.currentTarget);
            const input = button.siblings('.path-input');
            const inputValue = input.val();
            const assetId = button.data('asset-id');
            this.updateAssetPath(assetId, inputValue);
            input.data('original-value', inputValue);
            button.css('opacity', 0);
        });

        html.find('.browse-button').click((event) => {
            const button = $(event.currentTarget);
            const input = button.siblings('.path-input');
            const assetId = button.data('asset-id');
            const asset = this.findAsset(assetId);
            if (!asset) {
                ui.notifications.error(game.i18n.format("asset_auditor.asset-filepaths-app.asset-not-found", { id: assetId }));
                return;
            }
            const currentPath = getAssetPath(asset);
            new FilePicker({
                type: 'any',
                current: currentPath,
                callback: (path) => {
                    input.val(path);
                    this.updateAssetPath(assetId, path);
                    input.data('original-value', path);
                    button.siblings('.update-button').css('opacity', 0);
                },
                top: this.position.top + 40,
                left: this.position.left + 10
            }).browse(asset.path);
        });

        html.find('.path-input').on('input', (event) => {
            const input = $(event.currentTarget);
            const originalValue = input.data('original-value');
            const currentValue = input.val();
            const updateButton = input.siblings('.update-button');
            if (currentValue !== originalValue) {
                updateButton.css('opacity', 1);
            } else {
                updateButton.css('opacity', 0);
            }
        });

        html.find('.search-input').on('input', (event) => {
            const input = $(event.currentTarget);
            const replaceButton = html.find('.replace-button');
            if (input.val().trim() !== '') {
                replaceButton.prop('disabled', false);
            } else {
                replaceButton.prop('disabled', true);
            }
        });

        const initialSearchText = html.find('.search-input').val();
        html.find('.replace-button').prop('disabled', initialSearchText.trim() === '');
    }

    findAsset(assetId) {
        for (const assetMap of this.context.assets) {
            const assetObject = assetMap.assets.find(asset => asset.id === assetId);
            if (assetObject) {
                return assetObject.asset;
            }
        }
        return null;
    }

    async updateAssetPath(assetId, inputValue) {
        const asset = this.findAsset(assetId);
        if (!asset) {
            ui.notifications.error(game.i18n.format("asset_auditor.asset-filepaths-app.asset-not-found", { id: assetId }));
            return;
        }
        await setAssetPath(asset, inputValue);
        this.render();
    };
}

export { AssetFilepaths };
