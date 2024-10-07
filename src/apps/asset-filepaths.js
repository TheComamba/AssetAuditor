import { getAllAssets, getAllAssetTypes, getAssetPath, getLastValidPath, setAssetPath } from "../scripts/asset-aggregation.js";

class AssetFilepaths extends Application {
    constructor() {
        super();
        this.context = {};
        this.showInvalidOnly = false;
        this.currentSearchInput = '';
        this.searchText = '';
        this.replaceText = '';
        this.singularType = '';
    }

    get template() {
        return `modules/asset_auditor/apps/asset-filepaths.hbs`;
    }

    async getData(options = {}) {
        this.context = await super.getData(options);
        this.context.title = game.i18n.localize("asset_auditor.asset-filepaths");
        this.context.showInvalidOnly = this.showInvalidOnly
        this.context.currentSearchInput = this.currentSearchInput;
        this.context.searchText = this.searchText;
        this.context.replaceText = this.replaceText;
        this.context.assetTypes = getAllAssetTypes();
        this.context.singularType = this.singularType;
        this.context.assets = await getAllAssets(this.showInvalidOnly, this.searchText, this.singularType);
        return this.context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('#toggle-invalid').change(async (event) => {
            this.showInvalidOnly = event.target.checked;
            this.refresh(html);
        });

        html.find('#asset-type-dropdown').change((event) => {
            this.singularType = event.target.value;
            this.refresh(html);
        });

        html.find('.delete-search-button').click((event) => {
            this.performDeleteSearch(event, html);
        });

        html.find('.delete-replace-button').click((event) => {
            this.performDeleteReplace(event, html);
        });

        html.find('.search-button').click((_event) => {
            this.performSearch(html);
        });

        html.find('.replace-button').click(async (_event) => {
            await this.performReplacement(html);
        });

        html.find('.update-button').click((event) => {
            const updateButton = $(event.currentTarget);
            const resetButton = updateButton.siblings('.reset-button');
            const input = updateButton.siblings('.path-input');
            const inputValue = input.val();
            const assetId = updateButton.data('asset-id');
            this.updateAssetPath(assetId, inputValue);
            input.data('original-value', inputValue);
            resetButton.css('opacity', 0);
            resetButton.prop('disabled', true);
            updateButton.css('opacity', 0);
            updateButton.prop('disabled', true);
            this.refresh(html);
        });

        html.find('.reset-button').click((event) => {
            const resetButton = $(event.currentTarget);
            const updateButton = resetButton.siblings('.update-button');
            const input = resetButton.siblings('.path-input');
            const originalValue = input.data('original-value');
            input.val(originalValue);
            resetButton.css('opacity', 0);
            resetButton.prop('disabled', true);
            updateButton.css('opacity', 0);
            updateButton.prop('disabled', true);
            this.refresh(html);
        });

        html.find('.browse-button').click(async (event) => {
            const browseButton = $(event.currentTarget);
            const input = browseButton.siblings('.path-input');
            const assetId = browseButton.data('asset-id');
            const asset = this.findAsset(assetId);
            if (!asset) {
                ui.notifications.error(game.i18n.format("asset_auditor.app.asset-not-found", { id: assetId }));
                return;
            }
            const lastValidPath = asset.lastValidPath;
            const filePicker = new FilePicker({
                type: 'any',
                current: lastValidPath,
                callback: (path) => {
                    input.val(path);
                    this.updateAssetPath(assetId, path);
                    input.data('original-value', path);
                    const resetButton = browseButton.siblings('.reset-button');
                    const updateBurron = browseButton.siblings('.update-button');
                    resetButton.css('opacity', 0);
                    resetButton.prop('disabled', true);
                    updateBurron.css('opacity', 0);
                    updateBurron.prop('disabled', true);
                },
                top: this.position.top + 40,
                left: this.position.left + 10
            });
            await filePicker.browse(lastValidPath);
            this.refresh(html);
        });

        html.find('.path-input').on('input', (event) => {
            const input = $(event.currentTarget);
            const originalValue = input.data('original-value');
            const currentValue = input.val();
            const resetButton = input.siblings('.reset-button');
            const updateButton = input.siblings('.update-button');
            if (currentValue !== originalValue) {
                resetButton.css('opacity', 1);
                resetButton.prop('disabled', false);
                updateButton.css('opacity', 1);
                updateButton.prop('disabled', false);
            } else {
                resetButton.css('opacity', 0);
                resetButton.prop('disabled', true);
                updateButton.css('opacity', 0);
                updateButton.prop('disabled', true);
            }
        });

        html.find('.search-input')
            .on('input', (event) => {
                const input = $(event.currentTarget);
                this.currentSearchInput = input.val();
                this.updateOperability(html);
            })
            .on('keydown', (event) => {
                if (event.key === 'Enter') {
                    this.performSearch(html);
                } else if (event.key === 'Escape') {
                    this.performDeleteSearch(event, html);
                }
            });

        html.find('.replace-input')
            .on('input', (event) => {
                const input = $(event.currentTarget);
                this.replaceText = input.val();
                this.updateOperability(html);
            })
            .on('keydown', async (event) => {
                if (event.key === 'Enter') {
                    await this.performReplacement(html);
                } else if (event.key === 'Escape') {
                    this.performDeleteReplace(event, html);
                }
            });

        this.updateOperability(html);
    }

    performDeleteReplace(event, html) {
        const button = $(event.currentTarget);
        const input = button.siblings('.replace-input');
        input.val('');
        this.replaceText = '';
        this.refresh(html);
    }

    performDeleteSearch(event, html) {
        const button = $(event.currentTarget);
        const input = button.siblings('.search-input');
        input.val('');
        this.currentSearchInput = '';
        this.searchText = '';
        this.refresh(html);
    }

    async performReplacement(html) {
        this.searchText = this.currentSearchInput;
        const assets = this.context.assets.flatMap(assetMap => assetMap.assets.map(asset => asset.asset));
        for (const asset of assets) {
            const currentPath = getAssetPath(asset);
            if (currentPath.includes(this.searchText)) {
                const newPath = currentPath.replace(this.searchText, this.replaceText);
                await setAssetPath(asset, newPath);
            }
        }
        this.refresh(html);
    }

    performSearch(html) {
        this.searchText = this.currentSearchInput;
        this.refresh(html);
    }

    refresh(html) {
        this.render();
        this.updateOperability(html);
    }

    updateOperability(html) {
        const deleteSearchButton = html.find('.delete-search-button');
        const searchButton = html.find('.search-button');
        const replaceButton = html.find('.replace-button');
        if (this.currentSearchInput.trim() !== '') {
            deleteSearchButton.prop('disabled', false);
            deleteSearchButton.css('opacity', 1);
            searchButton.prop('disabled', false);
            replaceButton.prop('disabled', false);
        } else {
            deleteSearchButton.prop('disabled', true);
            deleteSearchButton.css('opacity', 0);
            searchButton.prop('disabled', true);
            replaceButton.prop('disabled', true);
        }
        const deleteReplaceButton = html.find('.delete-replace-button');
        if (this.replaceText.trim() !== '') {
            deleteReplaceButton.prop('disabled', false);
            deleteReplaceButton.css('opacity', 1);
        } else {
            deleteReplaceButton.prop('disabled', true);
            deleteReplaceButton.css('opacity', 0);
        }
    }

    findAsset(assetId) {
        for (const assetMap of this.context.assets) {
            const assetObject = assetMap.assets.find(asset => asset.id === assetId);
            if (assetObject) {
                return assetObject;
            }
        }
        return null;
    }

    async updateAssetPath(assetId, inputValue) {
        const asset = this.findAsset(assetId);
        if (!asset) {
            ui.notifications.error(game.i18n.format("asset_auditor.app.asset-not-found", { id: assetId }));
            return;
        }
        await setAssetPath(asset.asset, inputValue);
        this.render();
    };
}

export { AssetFilepaths };
