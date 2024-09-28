const loadedModules = {}

async function loadExternalModule(name) {
    if (loadedModules[name]) {
        return loadedModules[name];
    }
    try {
        loadedModules[name] = await import('https://cdn.jsdelivr.net/npm/' + name);
        return loadedModules[name];
    } catch (error) {
        const errorMessage = game.i18n.format("asset_auditor.moduleLoadFailed", { name: name, error: error });
        ui.notifications.error(errorMessage);
        return;
    }
}

export { loadExternalModule };