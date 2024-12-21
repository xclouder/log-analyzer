const path = require('path');
const { spawn } = require('child_process');

module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class TikistarLogAbstractPlugin extends Plugin {
        constructor(api) {
            super(api);
        }

        async onActivate(context) {
            console.log(`TikistarLogAbstractPlugin onActivate`);
            
            this.api.registerCommand(context, 'tikistar.logAbstract', () => {
                console.log(`exec tikistar.logAbstract!`);
            });
        }
    }

    return TikistarLogAbstractPlugin;
};