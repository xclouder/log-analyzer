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

// ── TypeScript plugin template ────────────────────────────────────────────

function generateTsPlugin(answers) {
    const className = `${answers.className || answers.name}Plugin`;

    let pluginCode = `import { PluginBase } from 'loganalyzer-plugin-sdk';
import type { PluginContext } from 'loganalyzer-plugin-sdk';

export default class ${className} extends PluginBase {
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

    pluginCode += `}
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

    // Create plugin directory and assets directory
    await fs.ensureDir(pluginDir);
    await fs.ensureDir(path.join(pluginDir, 'assets'));
    await fs.ensureDir(path.join(pluginDir, 'src'));

    // main always points to compiled JS in dist/
    const mainField = 'dist/index.js';

    // Create package.json
    const packageJson = {
        name: answers.name,
        version: answers.version,
        description: answers.description,
        title: answers.title || answers.name,
        author: answers.author,
        license: "MIT",
        main: mainField,
        scripts: {
            build: "tsc"
        },
        dependencies: {
            "loganalyzer-plugin-sdk": "^1.0.0"
        },
        devDependencies: {
            "typescript": "^5.4.0"
        },
        engines: {
            loganalyzer: "^1.0.0"
        },
        contributes: {
            fileTypes: answers.fileTypes || []
        }
    };

    await fs.writeJson(path.join(pluginDir, 'package.json'), packageJson, { spaces: 2 });

    // TypeScript source
    const pluginCode = generateTsPlugin(answers);
    await fs.writeFile(path.join(pluginDir, 'src', 'index.ts'), pluginCode);
    await fs.writeFile(path.join(pluginDir, 'tsconfig.json'), generateTsConfig());

    // Create README.md
    const readme = `# ${answers.name}

${answers.description}

## Development

\`\`\`bash
# Install dependencies
npm install

# Compile TypeScript → JavaScript
npm run build

# Package for distribution
npx log-analyzer-plugin build
\`\`\`

## Features

${answers.features.map(feature => `- ${feature}`).join('\n')}

## Supported File Types

${(answers.fileTypes || []).map(type => `- ${type}`).join('\n')}

## Installation

1. Download the plugin zip file
2. Open Log Analyzer
3. Go to Plugin Manager
4. Install the plugin

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

        console.log(chalk.green('\nPlugin created successfully! \u2705'));
        console.log(chalk.yellow('\nNext steps:'));
        console.log(`1. cd ${answers.name}`);
        console.log('2. npm install');
        console.log('3. Edit your plugin logic in src/index.ts');
        console.log('4. npm run build (compile TypeScript)');
        console.log('5. npx log-analyzer-plugin build (package for distribution)');

    } catch (err) {
        console.error(chalk.red('Error creating plugin:'), err);
        process.exit(1);
    }
}

module.exports = { init };
