(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const storage = Meeow.storage = Meeow.storage || {};

    let dependencies = null;
    let saveTimer = null;

    storage.configure = (nextDependencies) => {
        dependencies = nextDependencies;
    };

    storage.loadSavedData = (storageKey, oldKeys) => {
        let savedData = localStorage.getItem(storageKey);
        if (!savedData) {
            for (const oldKey of oldKeys) {
                const oldData = localStorage.getItem(oldKey);
                if (oldData) {
                    savedData = oldData;
                    localStorage.setItem(storageKey, oldData);
                    break;
                }
            }
        }
        return savedData;
    };

    storage.buildSaveData = () => dependencies.getState();

    storage.persistSettings = () => {
        const { getState, storageKey, modelStorageKey, addLog, showToast } = dependencies;
        const state = getState();
        try {
            localStorage.setItem(storageKey, JSON.stringify(storage.buildSaveData()));
            if (String(state.settings.model || '').trim()) localStorage.setItem(modelStorageKey, String(state.settings.model).trim());
        } catch (error) {
            addLog(`SETTINGS SAVE FAILED: ${error.message}`, 'error');
            showToast('模型设置保存失败，请检查浏览器存储空间。', 'error');
        }
    };

    storage.persistSelectedModel = () => {
        const { getState, modelStorageKey, addLog, showToast } = dependencies;
        const state = getState();
        const model = String(state.settings.model || '').trim();
        if (!model) return;
        state.settings.model = model;
        try {
            localStorage.setItem(modelStorageKey, model);
            storage.scheduleSave();
        } catch (error) {
            addLog(`MODEL SAVE FAILED: ${error.message}`, 'error');
            showToast('模型选择保存失败，请检查浏览器存储空间。', 'error');
        }
    };

    storage.scheduleSave = () => {
        const { getState, storageKey, addLog } = dependencies;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            try {
                const state = getState();
                localStorage.setItem(storageKey, JSON.stringify(storage.buildSaveData()));
            } catch (error) {
                addLog(`SAVE FAILED: ${error.message}`, 'error');
            }
        }, 350);
    };
}(window));
