import { getAllAssets, getAllAssetTypes, getAssetPath, getLastValidPath, setAssetPath, checkAssetPath, getIcon } from "../scripts/asset-aggregation.js";

class AssetFilepaths extends Application {
    constructor() {
        super();
        this.context = {};
        this._savingAssets = new Set();
        this._refreshRequested = false;
        this._loading = false;
        this.showInvalidOnly = false;
        this.currentSearchInput = '';
        this.searchText = '';
        this.replaceText = '';
        this.singularType = '';
    }

    get template() {
        return `modules/asset-auditor/apps/asset-filepaths.hbs`;
    }

    async getData(options = {}) {
        this.context = await super.getData(options);
        this.context.title = game.i18n.localize("asset-auditor.asset-filepaths");
        this.context.showInvalidOnly = this.showInvalidOnly
        this.context.currentSearchInput = this.currentSearchInput;
        this.context.searchText = this.searchText;
        this.context.replaceText = this.replaceText;
        this.context.assetTypes = getAllAssetTypes();
        this.context.singularType = this.singularType;
        this._loading = true;
        try {
            this.context.assets = await getAllAssets(this.showInvalidOnly, this.searchText, this.singularType);
        } finally {
            this._loading = false;
        }
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

        html.find('.update-button').click(async (event) => {
            await this.saveAssetRow($(event.currentTarget), html);
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
        });

        html.find('.browse-button').click(async (event) => {
            const browseButton = $(event.currentTarget);
            const input = browseButton.siblings('.path-input');
            const assetId = browseButton.data('asset-id');
            const asset = this.findAsset(assetId);
            if (!asset) {
                ui.notifications.error(game.i18n.format("asset-auditor.app.asset-not-found", { id: assetId }));
                return;
            }
            const lastValidPath = asset.lastValidPath;
            const filePicker = new FilePicker({
                type: 'any',
                current: lastValidPath,
                callback: async (path) => {
                    // An intervening render/filter can invalidate the captured row.
                    if (!input[0]?.isConnected || this._loading || this.findAsset(assetId) !== asset) return;
                    input.val(path).trigger('input');
                    await this.saveAssetRow(browseButton.siblings('.update-button'), html);
                },
                top: this.position.top + 40,
                left: this.position.left + 10
            });
            // browse() opens the picker; selection happens later in its callback.
            await filePicker.browse(lastValidPath);
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
        if (!this.currentSearchInput.trim() || this._loading || this._savingAssets.size) return;
        this.searchText = this.currentSearchInput;
        const assets = this.context.assets.flatMap(assetMap => assetMap.assets.map(asset => asset.asset));
        this._savingAssets.add("batch");
        html.find('button, input, select').prop('disabled', true);
        try {
            for (const asset of assets) {
                const currentPath = getAssetPath(asset);
                if (currentPath.includes(this.searchText)) {
                    await setAssetPath(asset, currentPath.replace(this.searchText, this.replaceText));
                }
            }
        } catch (error) {
            console.error("Asset Auditor | Replacement stopped", error);
            ui.notifications.error(game.i18n.localize("asset-auditor.app.save-error"));
        } finally {
            this._savingAssets.delete("batch");
            this.refresh(html);
        }
    }

    performSearch(html) {
        this.searchText = this.currentSearchInput;
        this.refresh(html);
    }

    refresh(html = $(this.element)) {
        this._refreshRequested = true;
        if (this._savingAssets.size || this._loading) return;
        this._refreshRequested = false;
        this._loading = true;
        html.find('button, input, select').prop('disabled', true);
        return this.render();
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

    async saveAssetRow(updateButton, html) {
        const assetId = updateButton.data('asset-id');
        if (this._loading || this._savingAssets.has("batch") || this._savingAssets.has(assetId)) return;
        this._savingAssets.add(assetId);
        const row = updateButton.closest('.asset-row');
        const controls = row.find('button, input');
        controls.prop('disabled', true);
        const input = updateButton.siblings('.path-input');
        try {
            const entry = this.findAsset(assetId);
            if (!entry) return;
            await this.updateAssetPath(assetId, input.val());
            const savedPath = getAssetPath(entry.asset);
            const isValid = await checkAssetPath(savedPath);
            const lastValidPath = isValid ? '' : await getLastValidPath(savedPath);
            Object.assign(entry, {path: savedPath, isValid, lastValidPath});
            input.val(savedPath).data('original-value', savedPath);
            row.next('.asset-invalid-hint').remove();
            if (this.showInvalidOnly && isValid) {
                row.remove();
                for (const group of this.context.assets) {
                    group.assets = group.assets.filter(candidate => candidate !== entry);
                }
            } else {
                // Update this usage in place so unrelated drafts stay intact.
                row.css('color', isValid ? '' : 'red');
                entry.icon = getIcon(entry.asset, isValid);
                row.find('.asset-status').attr('class', 'asset-status ' + entry.icon);
                if (!isValid) {
                    const hint = $('<div class="asset-invalid-hint" style="margin-bottom: 10px;"></div>');
                    $('<span></span>').text(game.i18n.localize("asset-auditor.app.last-valid-path") + ' ').appendTo(hint);
                    $('<span></span>').text(lastValidPath).appendTo(hint);
                    row.after(hint);
                }
            }
            html.trigger('asset-auditor:path-saved', [entry, row[0]]);
        } catch (error) {
            console.error("Asset Auditor | Could not save asset path", error);
            ui.notifications.error(game.i18n.localize("asset-auditor.app.save-error"));
        } finally {
            this._savingAssets.delete(assetId);
            controls.prop('disabled', false);
            const dirty = input.val() !== input.data('original-value');
            updateButton.add(updateButton.siblings('.reset-button'))
                .prop('disabled', !dirty).css('opacity', dirty ? 1 : 0);
            if (!this._savingAssets.size && this._refreshRequested) this.refresh(html);
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
            ui.notifications.error(game.i18n.format("asset-auditor.app.asset-not-found", { id: assetId }));
            return;
        }
        asset.asset = await setAssetPath(asset.asset, inputValue);
    };
}

export { AssetFilepaths };
