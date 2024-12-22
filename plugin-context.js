class PluginContext {
    constructor(instance, api) {
        this.instance = instance;
        this.api = api;
        this.disposables = [];
    }
}

module.exports = {PluginContext};