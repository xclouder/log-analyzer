const path = require('path');

module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class OpenlogFromUrlPlugin extends Plugin {
        constructor(api) {
            super(api);
            this.api = api;
        }

        /**
         * Process file path
         * @param {string} filePath - The path of the file
         * @returns {Promise<string>} - The processed file path
         */
        async processPath(filePath) {
            // Add your path processing logic here
            return filePath;
        }

        async onActivate(context) {
            console.log(`OpenLogFromUrl onActivate`);

            this.api.registerCommand(context, 'loganalyzer.openLogFromUrl', () => {
                this.doWork();
            });
        }  
        
        async doWork() {
            console.log(`OpenlogFromUrlPlugin doWork`);

            const result = await this.api.showInputBox({title: "Input log url:"});
            
            if (result) {
                console.log(`Input url: ${result}`);
            }

            const items = ['a', 'b', 'c'];
            const selected = await this.api.showQuickPick(items, {title: "Select an item:"});
            
            if (selected) {
                console.log(`Selected: ${selected}`);

                this.api.showInformationMessage('This is an information message', {modal: true, detail: `Selected:${selected}`});
            }

            
        }
    }

    return OpenlogFromUrlPlugin;
};
