import { getAllAssets, getAllAssetTypes, getAssetPath, getLastValidPath, setAssetPath } from "../scripts/asset-aggregation.js";

const scanLabels = {
    idle: "asset-auditor.app.scan-idle",
    starting: "asset-auditor.app.scan-starting",
    directories: "asset-auditor.app.scan-directories",
    documents: "asset-auditor.app.scan-documents",
    hints: "asset-auditor.app.scan-hints",
    error: "asset-auditor.app.scan-error"
};

class AssetFilepaths extends Application {
    constructor() {
        super();
        this.context = {};
        this._assets = [];
        this._scanRequested = true;
        this._scanBusy = false;
        this._loading = false;
        this._scanSequence = 0;
        this._scanState = {phase: "idle", completed: 0, total: 0};
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
        this.context.assets = this._assets;
        this.context.scanMessage = this.scanMessage();
        this.context.scanEmpty = this._scanState.phase === "complete" && !this._assets.some(group => group.assets.length);
        return this.context;
    }

    scanMessage() {
        const {phase, completed, total} = this._scanState;
        if (phase === "complete") {
            const entries = this._assets.flatMap(group => group.assets);
            return game.i18n.format("asset-auditor.app.scan-complete", {
                count: entries.length, invalid: entries.filter(entry => !entry.isValid).length
            });
        }
        if (["directories", "documents", "hints"].includes(phase)) {
            return game.i18n.format(scanLabels[phase], {completed, total});
        }
        return game.i18n.localize(scanLabels[phase] ?? scanLabels.idle);
    }

    updateScanUI() {
        const root = this.element?.[0] ?? this.element;
        const status = root?.querySelector?.('.asset-scan-status');
        if (!status) return;
        const wasBusy = status.getAttribute('aria-busy') === 'true';
        const {phase, completed, total} = this._scanState;
        status.dataset.state = phase;
        status.setAttribute('aria-busy', String(this._scanBusy));
        status.querySelector('.asset-scan-message').textContent = this.scanMessage();
        const progress = status.querySelector('progress');
        progress.hidden = !this._scanBusy;
        if (total > 0) { progress.max = total;progress.value = completed; }
        else progress.removeAttribute('value');
        status.querySelector('i').className = this._scanBusy ? 'fas fa-spinner fa-spin'
            : phase === 'error' ? 'fas fa-triangle-exclamation' : 'fas fa-circle-check';
        const empty = root.querySelector('.asset-auditor-scan-empty');
        if (empty) empty.hidden = phase !== 'complete' || this._assets.some(group => group.assets.length);
        // Freeze controls once per scan, leaving the window frame usable.
        // The final render restores each control's individual enabled state.
        if (this._scanBusy && !wasBusy) {
            const content = root.querySelector('.asset-auditor-body, form') ?? root;
            content.querySelectorAll('button, input, select').forEach(control => {control.disabled = true;});
        }
    }

    async scanAssets() {
        if (this._scanBusy || this._savingAssets?.size) return;
        const sequence = ++this._scanSequence;
        const {showInvalidOnly, searchText, singularType} = this;
        this._scanRequested = false;
        this._scanBusy = true;
        this._loading = true;
        this._scanState = {phase: "starting", completed: 0, total: 0};
        this.updateScanUI();
        try {
            const assets = await getAllAssets(showInvalidOnly, searchText, singularType, progress => {
                if (sequence !== this._scanSequence || !this._scanBusy) return;
                this._scanState = progress;
                this.updateScanUI();
            });
            if (sequence !== this._scanSequence) return;
            this._assets = assets;
            this._scanState = {phase: "complete", completed: 0, total: 0};
        } catch (error) {
            if (sequence !== this._scanSequence) return;
            console.error("Asset Auditor | Asset scan failed", error);
            this._scanState = {phase: "error", completed: 0, total: 0};
        } finally {
            if (sequence === this._scanSequence) {
                this._scanBusy = false;
                this._loading = false;
                this.updateScanUI();
                if (this.rendered) await this.render();
            }
        }
    }

    activateListeners(html) {

        html.find('.recheck-assets-button').click(() => this.refresh(html));
        html.off('asset-auditor:path-saved.scan').on('asset-auditor:path-saved.scan', () => this.updateScanUI());
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
            const updateButton = $(event.currentTarget);
            const resetButton = updateButton.siblings('.reset-button');
            const input = updateButton.siblings('.path-input');
            const inputValue = input.val();
            const assetId = updateButton.data('asset-id');
            await this.updateAssetPath(assetId, inputValue);
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
                ui.notifications.error(game.i18n.format("asset-auditor.app.asset-not-found", { id: assetId }));
                return;
            }
            const lastValidPath = asset.lastValidPath;
            const filePicker = new FilePicker({
                type: 'any',
                current: lastValidPath,
                callback: async (path) => {
                    input.val(path);
                    await this.updateAssetPath(assetId, path);
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
        this.updateScanUI();
        if (this._scanRequested && !this._scanBusy && !this._savingAssets?.size) {
            this._scanPromise = this.scanAssets();
            void this._scanPromise.catch(error => console.error("Asset Auditor | Could not render scan results", error));
        }
    }

    async close(options = {}) {
        this._scanSequence++;
        this._scanBusy = false;
        this._loading = false;
        this._scanRequested = true;
        this._scanState = {phase: "idle", completed: 0, total: 0};
        return super.close(options);
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
        this._scanRequested = true;
        if (this._scanBusy || this._savingAssets?.size || !this.rendered) return;
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
        await setAssetPath(asset.asset, inputValue);
    };
}

export { AssetFilepaths };
