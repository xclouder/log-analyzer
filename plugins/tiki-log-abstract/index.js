const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;

module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class TikistarLogAbstractPlugin extends Plugin {
        constructor(api) {
            super(api);
            this.api = api;
            this.config = null;
            this.patterns = [];
        }

        async loadPatterns() {
            try {
                const configPath = path.join(__dirname, 'config.json');
                const configContent = await fs.readFile(configPath, 'utf8');
                this.config = JSON.parse(configContent);
                console.log('Config loaded successfully');
            } catch (err) {
                console.error('Error loading patterns:', err);
                // Fallback to default config if loading fails
                this.config = {
                    'ds-keyword': '[DSInitSystem],DSInitSystem enter',
                    'common-patterns': [
                        {
                            regex: 'LogLoad:\\s*LoadMap:\\s*([^?\\n]+)',
                            key: 'LoadMap'
                        }
                    ],
                    'cli-patterns': [
                        {
                            regex: '\\[MVVMLoginViewComponent\\],(AppVer:,\\d+\\.\\d+\\.\\d+\\.\\d+, resVer:,\\d+\\.\\d+\\.\\d+\\.\\d+, dsVer:,\\d+\\.\\d+\\.\\d+\\.\\d+)',
                            key: 'Version'
                        }
                    ],
                    'ds-patterns': []
                };
            }
        }

        getPatterns(content) {
            // Check if the content contains ds-keyword to determine if it's a server log
            const isServerLog = content && content.includes(this.config['ds-keyword']);
            console.log('Is server log:', isServerLog);
            
            // Combine patterns based on log type
            const patterns = [
                ...this.config['common-patterns'],
                ...(isServerLog ? this.config['ds-patterns'] : this.config['cli-patterns'])
            ];

            // Convert string patterns to RegExp objects and add type information
            return {
                type: isServerLog ? 'ds' : 'client',
                patterns: patterns.map(pattern => ({
                    regex: new RegExp(pattern.regex),
                    key: pattern.key
                }))
            };
        }

        async onActivate(context) {
            console.log(`TikistarLogAbstractPlugin onActivate`);
            
            await this.loadPatterns();
            
            this.api.registerCommand(context, 'tikistar.logAbstract', () => {
                this.doWork();
            });

            // this.api.registerCommand(context, 'tikistar.testLogPattern', () => {
            //     this.testPattern();
            // });
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
                
                // Get patterns based on file content
                const { type, patterns } = this.getPatterns(content);
                
                const lines = content.split('\n');
                
                // Create a buffer to store results
                let results = [];
                
                // Add log type as the first line
                results.push(`LogType：${type === 'ds' ? 'DS Log' : 'Client Log'}`);
                results.push(''); // Add an empty line for better readability
                
                // Process each line to extract key information
                lines.forEach((line, index) => {
                    // Try each pattern against the line
                    patterns.forEach(pattern => {
                        const match = line.match(pattern.regex);
                        if (match && match[1]) {
                            results.push(`Line ${index + 1}: ${pattern.key} = ${match[1]}`);
                        }
                    });
                });

                // Create editor window with results
                const resultText = results.join('\n');
                this.api.createEditorWindow({
                    title: 'Log Analysis Results',
                    textContent: resultText,
                    width: 800,
                    height: 600
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