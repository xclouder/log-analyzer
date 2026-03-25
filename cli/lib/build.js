const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const chalk = require('chalk');

async function validatePluginStructure(pluginDir) {
    const requiredFiles = ['package.json'];
    const errors = [];

    for (const file of requiredFiles) {
        if (!fs.existsSync(path.join(pluginDir, file))) {
            errors.push(`Missing required file: ${file}`);
        }
    }

    const packageJson = await fs.readJson(path.join(pluginDir, 'package.json'));
    if (!packageJson.name || !packageJson.version) {
        errors.push('package.json must contain name and version fields');
    }
    if (!packageJson.main) {
        errors.push('package.json must contain a main field');
    }

    // main must point to a .js file (not .ts)
    if (packageJson.main && packageJson.main.endsWith('.ts')) {
        errors.push(
            `package.json "main" must point to a .js file, got "${packageJson.main}". ` +
            'TypeScript plugins should compile to JS first (main should be e.g. "dist/index.js")'
        );
    }

    return errors;
}

/**
 * Check if the plugin uses TypeScript (has tsconfig.json).
 */
function hasTypeScript(pluginDir) {
    return fs.existsSync(path.join(pluginDir, 'tsconfig.json'));
}

/**
 * Compile TypeScript plugin using tsc.
 * Tries local typescript first, then npx.
 */
async function compileTypeScript(pluginDir) {
    const { execSync } = require('child_process');

    console.log(chalk.blue('Compiling TypeScript...'));

    const tsconfigPath = path.join(pluginDir, 'tsconfig.json');

    try {
        // Try local typescript first
        const localTsc = path.join(pluginDir, 'node_modules', '.bin', 'tsc');
        let tscCmd;

        if (fs.existsSync(localTsc) || fs.existsSync(localTsc + '.cmd')) {
            tscCmd = `"${localTsc}"`;
        } else {
            // Fall back to npx tsc
            tscCmd = 'npx tsc';
        }

        execSync(`${tscCmd} -p "${tsconfigPath}"`, {
            cwd: pluginDir,
            stdio: 'inherit',
        });

        console.log(chalk.green('TypeScript compilation successful'));
        return true;
    } catch (error) {
        console.error(chalk.red('TypeScript compilation failed.'));
        console.error(chalk.yellow('Make sure typescript is installed: npm install --save-dev typescript'));
        return false;
    }
}

async function build({ output } = {}) {
    try {
        const pluginDir = process.cwd();
        const pluginName = path.basename(pluginDir);

        const isTsProject = hasTypeScript(pluginDir);

        // Compile TypeScript first (if applicable)
        if (isTsProject) {
            const compiled = await compileTypeScript(pluginDir);
            if (!compiled) {
                process.exit(1);
            }
        }

        // Validate plugin structure (after compilation so dist/ exists)
        const validationErrors = await validatePluginStructure(pluginDir);
        if (validationErrors.length > 0) {
            console.error(chalk.red('Plugin validation failed:'));
            validationErrors.forEach(error => console.error(chalk.red(`- ${error}`)));
            process.exit(1);
        }

        // Verify the main entry file exists
        const packageJson = await fs.readJson(path.join(pluginDir, 'package.json'));
        const mainFile = packageJson.main;
        if (!fs.existsSync(path.join(pluginDir, mainFile))) {
            console.error(chalk.red(`Main entry file not found: ${mainFile}`));
            if (isTsProject) {
                console.error(chalk.yellow('Did the TypeScript compilation produce the expected output?'));
                console.error(chalk.yellow('Check that your tsconfig.json "outDir" matches the "main" field in package.json.'));
            }
            process.exit(1);
        }

        const outputPath = output || path.join(pluginDir, `${pluginName}.zip`);
        console.log(chalk.blue(`Building plugin: ${pluginName}`));

        const outputZip = fs.createWriteStream(outputPath);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        outputZip.on('close', () => {
            console.log(chalk.green(`Plugin built successfully: ${outputPath} (${archive.pointer()} total bytes)`));
        });

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(outputZip);

        // Always include package.json and README.md
        const filesToInclude = ['package.json', 'README.md'];
        for (const file of filesToInclude) {
            const filePath = path.join(pluginDir, file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
            }
        }

        // Include the main entry file and its containing directory
        // e.g., if main is "dist/index.js", include the whole dist/ directory
        // e.g., if main is "index.js", include just the file
        const mainDir = path.dirname(mainFile);
        if (mainDir !== '.' && mainDir !== '') {
            // main is in a subdirectory (e.g., dist/index.js)
            const mainDirPath = path.join(pluginDir, mainDir);
            if (fs.existsSync(mainDirPath)) {
                archive.directory(mainDirPath, mainDir);
            }
        } else {
            // main is at root (e.g., index.js)
            const mainFilePath = path.join(pluginDir, mainFile);
            if (fs.existsSync(mainFilePath)) {
                archive.file(mainFilePath, { name: mainFile });
            }
        }

        // Include additional common directories if they exist
        const optionalDirs = ['assets', 'lib'];
        for (const dir of optionalDirs) {
            // Skip if already included as mainDir
            if (dir === mainDir) continue;
            const dirPath = path.join(pluginDir, dir);
            if (fs.existsSync(dirPath)) {
                archive.directory(dirPath, dir);
            }
        }

        await archive.finalize();
    } catch (error) {
        console.error(chalk.red('Error building plugin:'), error);
        process.exit(1);
    }
}

module.exports = { build };
