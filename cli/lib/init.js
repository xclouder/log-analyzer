const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const questions = [
    {
        type: 'input',
        name: 'name',
        message: 'Plugin name (kebab-case):',
        validate: input => {
            if (/^[a-z0-9-]+$/.test(input)) return true;
            return 'Plugin name must be in kebab-case (lowercase letters, numbers, and hyphens only)';
        }
    },
    {
        type: 'input',
        name: 'title',
        message: 'Plugin display title:',
    },
    {
        type: 'input',
        name: 'className',
        message: 'Plugin class name (PascalCase):',
        default: answers => answers.name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(''),
        validate: input => {
            if (/^[A-Z][a-zA-Z0-9]*$/.test(input)) return true;
            return 'Class name must be in PascalCase';
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
        type: 'list',
        name: 'language',
        message: 'Plugin language:',
        choices: [
            { name: 'JavaScript', value: 'js' },
            { name: 'TypeScript', value: 'ts' }
        ],
        default: 'js'
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
    },
    {
        type: 'input',
        name: 'fileTypes',
        message: 'Supported file types (comma-separated, e.g., .log,.txt):',
        filter: input => input.split(',').map(type => type.trim()).filter(type => type)
    }
];

// ── JavaScript plugin template ────────────────────────────────────────────

function generateJsPlugin(answers) {
    let pluginCode = `const path = require('path');

module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class ${answers.className || answers.name}Plugin extends Plugin {
        constructor(api) {
            super(api);
            this.api = api;
        }
`;

    if (answers.features.includes('fileContent')) {
        pluginCode += `
        /**
         * Process file content before display
         * @param {string} content - The content of the file
         * @returns {Promise<string>} - The processed content
         */
        async processContent(content) {
            // Add your content processing logic here
            return content;
        }

        /**
         * Called before opening a file
         * @param {string} filePath - Path to the file being opened
         * @returns {Promise<string>} - The path to the file that should be opened
         */
        async onPreOpenFile(filePath) {
            // Add your pre-open file logic here
            return filePath;
        }
`;
    }

    if (answers.features.includes('filePath')) {
        pluginCode += `
        /**
         * Process file path
         * @param {string} filePath - The path of the file
         * @returns {Promise<string>} - The processed file path
         */
        async processPath(filePath) {
            // Add your path processing logic here
            return filePath;
        }
`;
    }

    if (answers.features.includes('window')) {
        pluginCode += `
        /**
         * Create custom window
         * @returns {Promise<void>}
         */
        async createWindow() {
            const window = await this.api.createWindow({
                width: 800,
                height: 600,
                title: '${answers.title || answers.name}'
            });

            // Add your window initialization logic here
        }
`;
    }

    pluginCode += `    }

    return ${answers.className || answers.name}Plugin;
};
`;

    return pluginCode;
}

// ── TypeScript plugin template ────────────────────────────────────────────

function generateTsPlugin(answers) {
    let pluginCode = `import type { PluginAPI, PluginContext } from 'loganalyzer-plugin-sdk';

module.exports = function(pluginBasePath: string) {
    const Plugin = require(pluginBasePath);

    class ${answers.className || answers.name}Plugin extends Plugin {
        constructor(api: PluginAPI) {
            super(api);
        }

        async onActivate(context: PluginContext): Promise<void> {
            // Register commands and set up state here
        }

        async onDeactivate(): Promise<void> {
            // Clean up resources here
        }
`;

    if (answers.features.includes('fileContent')) {
        pluginCode += `
        /**
         * Process file content before display.
         * Return the transformed content string.
         */
        async processFile(filePath: string, content: string): Promise<string> {
            // Add your content processing logic here
            return content;
        }

        /**
         * Called before opening a file.
         * Return the original path to proceed normally, or '' to cancel.
         */
        async onPreOpenFile(filePath: string): Promise<string> {
            // Add your pre-open file logic here
            return filePath;
        }
`;
    }

    if (answers.features.includes('filePath')) {
        pluginCode += `
        /**
         * Process file path.
         * Return the transformed file path.
         */
        async processPath(filePath: string): Promise<string> {
            // Add your path processing logic here
            return filePath;
        }
`;
    }

    if (answers.features.includes('window')) {
        pluginCode += `
        /**
         * Create custom window.
         */
        async createCustomWindow(): Promise<void> {
            const win = this.api.createWindow('${answers.name}', {
                width: 800,
                height: 600,
                title: '${answers.title || answers.name}'
            });

            // Add your window initialization logic here
        }
`;
    }

    pluginCode += `    }

    return ${answers.className || answers.name}Plugin;
};
`;

    return pluginCode;
}

// ── TypeScript config template ────────────────────────────────────────────

function generateTsConfig() {
    return JSON.stringify({
        compilerOptions: {
            target: "ES2020",
            module: "commonjs",
            lib: ["ES2020"],
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: false,
            sourceMap: false,
            outDir: "./dist",
            rootDir: "./src"
        },
        include: ["src/**/*.ts"],
        exclude: ["node_modules", "dist"]
    }, null, 2);
}

// ── Create plugin structure ───────────────────────────────────────────────

async function createPluginStructure(answers) {
    const pluginDir = path.join(process.cwd(), answers.name);
    const isTypeScript = answers.language === 'ts';

    // Create plugin directory and assets directory
    await fs.ensureDir(pluginDir);
    await fs.ensureDir(path.join(pluginDir, 'assets'));

    // For TS plugins: main points to compiled JS in dist/
    // For JS plugins: main points to root index.js
    const mainField = isTypeScript ? 'dist/index.js' : 'index.js';

    // Create package.json
    const packageJson = {
        name: answers.name,
        version: answers.version,
        description: answers.description,
        title: answers.title || answers.name,
        author: answers.author,
        license: "MIT",
        main: mainField,
        engines: {
            loganalyzer: "^1.0.0"
        },
        contributes: {
            fileTypes: answers.fileTypes || []
        }
    };

    if (isTypeScript) {
        packageJson.scripts = {
            build: "tsc"
        };
        packageJson.devDependencies = {
            "loganalyzer-plugin-sdk": "^1.0.0",
            "typescript": "^5.4.0"
        };
    }

    await fs.writeJson(path.join(pluginDir, 'package.json'), packageJson, { spaces: 2 });

    if (isTypeScript) {
        // TypeScript plugin: src/index.ts + tsconfig.json
        await fs.ensureDir(path.join(pluginDir, 'src'));
        const pluginCode = generateTsPlugin(answers);
        await fs.writeFile(path.join(pluginDir, 'src', 'index.ts'), pluginCode);
        await fs.writeFile(path.join(pluginDir, 'tsconfig.json'), generateTsConfig());
    } else {
        // JavaScript plugin: index.js at root
        const pluginCode = generateJsPlugin(answers);
        await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
    }

    // Create README.md
    const readme = `# ${answers.name}

${answers.description}

## Language

${isTypeScript ? 'TypeScript' : 'JavaScript'}

## Features

${answers.features.map(feature => `- ${feature}`).join('\n')}

## Supported File Types

${(answers.fileTypes || []).map(type => `- ${type}`).join('\n')}

## Installation

1. Download the plugin zip file
2. Open Log Analyzer
3. Go to Plugin Manager
4. Install the plugin
${isTypeScript ? `
## Development (TypeScript)

\`\`\`bash
# Install dependencies
npm install

# Compile TypeScript → JavaScript
npm run build

# Package for distribution
npx log-analyzer-plugin build
\`\`\`
` : ''}
## Usage

[Add usage instructions here]

## Author

${answers.author}

## License

MIT
`;

    await fs.writeFile(path.join(pluginDir, 'README.md'), readme);
}

async function init() {
    try {
        console.log(chalk.blue('Creating a new Log Analyzer plugin...'));

        const answers = await inquirer.prompt(questions);

        await createPluginStructure(answers);

        const isTypeScript = answers.language === 'ts';
        console.log(chalk.green('\nPlugin created successfully! \u2705'));
        console.log(chalk.yellow('\nNext steps:'));
        console.log(`1. cd ${answers.name}`);
        if (isTypeScript) {
            console.log('2. npm install');
            console.log('3. Edit your plugin logic in src/index.ts');
            console.log('4. npm run build (compile TypeScript)');
            console.log('5. npx log-analyzer-plugin build (package for distribution)');
        } else {
            console.log('2. Implement your plugin logic in index.js');
            console.log('3. Run log-analyzer-plugin build to create the plugin package');
        }

    } catch (err) {
        console.error(chalk.red('Error creating plugin:'), err);
        process.exit(1);
    }
}

module.exports = { init };
