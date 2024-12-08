const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const chalk = require('chalk');

async function build({ output }) {
    try {
        const pluginDir = process.cwd();
        const pluginName = path.basename(pluginDir);
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

        // Append files from plugin directory
        archive.directory(pluginDir, false);

        await archive.finalize();
    } catch (err) {
        console.error(chalk.red('Error building plugin:'), err);
        process.exit(1);
    }
}

module.exports = { build };
