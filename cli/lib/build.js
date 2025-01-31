const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const chalk = require('chalk');

async function validatePluginStructure(pluginDir) {
    const requiredFiles = ['package.json', 'index.js'];
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

    return errors;
}

async function build({ output }) {
    try {
        const pluginDir = process.cwd();
        const pluginName = path.basename(pluginDir);
        
        // Validate plugin structure
        const validationErrors = await validatePluginStructure(pluginDir);
        if (validationErrors.length > 0) {
            console.error(chalk.red('Plugin validation failed:'));
            validationErrors.forEach(error => console.error(chalk.red(`- ${error}`)));
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

        // Add only necessary files
        const filesToInclude = ['package.json', 'index.js', 'README.md'];
        const dirsToInclude = ['src', 'dist', 'lib'];

        // Add individual files
        for (const file of filesToInclude) {
            const filePath = path.join(pluginDir, file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
            }
        }

        // Add directories if they exist
        for (const dir of dirsToInclude) {
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
