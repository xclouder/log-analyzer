const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;

module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class TikistarLogAbstractPlugin extends Plugin {
        constructor(api) {
            super(api);
            this.api = api;
            this.patterns = [];
        }

        async loadPatterns() {
            try {
                const configPath = path.join(__dirname, 'config.json');
                const configContent = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configContent);
                
                // Convert string patterns to RegExp objects
                this.patterns = config.patterns.map(pattern => ({
                    regex: new RegExp(pattern.regex),
                    key: pattern.key
                }));
                
                console.log('Loaded patterns:', this.patterns);
            } catch (err) {
                console.error('Error loading patterns:', err);
                // Fallback to default patterns if config loading fails
                this.patterns = [
                    {
                        regex: /LogLoad:\s*LoadMap:\s*([^?\n]+)/,
                        key: 'LoadMap'
                    },
                    {
                        regex: /LogNet:\s*Login request: (?:URL=)?([^\s,]+)/,
                        key: 'Login'
                    },
                    {
                        regex: /\[MVVMLoginViewComponent\],(AppVer:,\d+\.\d+\.\d+\.\d+, resVer:,\d+\.\d+\.\d+\.\d+, dsVer:,\d+\.\d+\.\d+\.\d+)/,
                        key: 'Version'
                    }
                ];
            }
        }

        async onActivate(context) {
            console.log(`TikistarLogAbstractPlugin onActivate`);
            
            await this.loadPatterns();
            
            this.api.registerCommand(context, 'tikistar.logAbstract', () => {
                this.doWork();
            });

            this.api.registerCommand(context, 'tikistar.testLogPattern', () => {
                this.testPattern();
            });
        }

        testPattern() {
            
        }

        async doWork() {
            console.log(`TikistarLogAbstractPlugin doWork`);

            const filePath = this.api.getCurrentFilePath();
            if (!filePath) {
                console.log('No file is currently open');
                return;
            }

            try {
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.split('\n');
                
                // Process each line to extract key information
                lines.forEach((line, index) => {
                    const info = this.extractKeyInfo(line);
                    if (info) {
                        console.log(`Line ${index + 1}: ${info.key} = ${info.value}`);
                    }
                });
            } catch (err) {
                console.error('Error processing file:', err);
            }
        }

        extractKeyInfo(line) {
            // Try each pattern from loaded config
            for (const pattern of this.patterns) {
                const match = line.match(pattern.regex);
                if (match) {
                    return {
                        key: pattern.key,
                        value: match[1].trim()
                    };
                }
            }

            return null;
        }
    }

    return TikistarLogAbstractPlugin;
};