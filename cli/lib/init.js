const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const questions = [
    {
        type: 'input',
        name: 'name',
        message: 'Plugin name:',
        validate: input => {
            if (/^[a-zA-Z0-9-_]+$/.test(input)) return true;
            return 'Plugin name may only include letters, numbers, underscores and hashes';
        }
    },
    {
        type: 'input',
        name: 'description',
        message: 'Plugin description:'
    },
    {
        type: 'input',
        name: 'author',
        message: 'Plugin author:'
    },
    {
        type: 'input',
        name: 'version',
        message: 'Plugin version:',
        default: '1.0.0'
    },
    {
        type: 'checkbox',
        name: 'features',
        message: 'Select plugin features:',
        choices: [
            {
                name: 'File Content Processing',
                value: 'fileContent',
                checked: true
            },
            {
                name: 'File Path Processing',
                value: 'filePath',
                checked: false
            },
            {
                name: 'Custom Window',
                value: 'window',
                checked: false
            }
        ]
    }
];

async function createPluginStructure(answers) {
    const pluginDir = path.join(process.cwd(), answers.name);
    
    // Create plugin directory
    await fs.ensureDir(pluginDir);
    
    // Create package.json
    const packageJson = {
        name: answers.name,
        version: answers.version,
        description: answers.description,
        author: answers.author,
        main: 'index.js',
        logAnalyzerPlugin: {
            features: answers.features
        }
    };
    
    await fs.writeJson(path.join(pluginDir, 'package.json'), packageJson, { spaces: 2 });
    
    // Create index.js with selected features
    let pluginCode = `class ${answers.name}Plugin {
    constructor(api) {
        this.api = api;
    }
`;

    if (answers.features.includes('fileContent')) {
        pluginCode += `
    // Process file content
    async processContent(content) {
        // Add your content processing logic here
        return content;
    }
`;
    }

    if (answers.features.includes('filePath')) {
        pluginCode += `
    // Process file path
    async processPath(filePath) {
        // Add your path processing logic here
        return filePath;
    }
`;
    }

    if (answers.features.includes('window')) {
        pluginCode += `
    // Create custom window
    async createWindow() {
        const window = await this.api.createWindow({
            width: 800,
            height: 600,
            title: '${answers.name}'
        });
        
        // Add your window initialization logic here
    }
`;
    }

    pluginCode += `}

module.exports = ${answers.name}Plugin;
`;

    await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
    
    // Create README.md
    const readme = `# ${answers.name}

${answers.description}

## Features

${answers.features.map(feature => `- ${feature}`).join('\n')}

## Installation

1. Download the plugin zip file
2. Open Log Analyzer
3. Go to Plugin Manager
4. Drag and drop the zip file to install

## Usage

[Add usage instructions here]

## Author

${answers.author}
`;

    await fs.writeFile(path.join(pluginDir, 'README.md'), readme);
}

async function init() {
    try {
        console.log(chalk.blue('Creating a new Log Analyzer plugin...'));
        
        const answers = await inquirer.prompt(questions);
        
        await createPluginStructure(answers);
        
        console.log(chalk.green('\nPlugin created successfully! 🎉'));
        console.log(chalk.yellow('\nNext steps:'));
        console.log(`1. cd ${answers.name}`);
        console.log('2. Implement your plugin logic in index.js');
        console.log('3. Run log-analyzer-plugin build to create the plugin package');
        
    } catch (err) {
        console.error(chalk.red('Error creating plugin:'), err);
        process.exit(1);
    }
}

module.exports = { init };
