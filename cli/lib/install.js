const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const AdmZip = require('adm-zip');

/**
 * Returns the user-local plugins directory, creating it if necessary.
 * Uses os.homedir() for cross-platform compatibility (Linux, macOS, Windows).
 */
async function getPluginsDir() {
    const pluginsDir = path.join(os.homedir(), '.log-analyzer', 'plugins');
    await fs.ensureDir(pluginsDir);
    return pluginsDir;
}

async function install({ pluginPath }) {
    try {
        if (!pluginPath) {
            throw new Error('Plugin path is required');
        }

        if (!fs.existsSync(pluginPath)) {
            throw new Error(`Plugin file not found: ${pluginPath}`);
        }

        const zip = new AdmZip(pluginPath);
        const zipEntries = zip.getEntries();

        // Validate plugin structure
        const hasPackageJson = zipEntries.some(entry => entry.entryName === 'package.json');
        const hasIndexJs = zipEntries.some(entry => entry.entryName === 'index.js');

        if (!hasPackageJson || !hasIndexJs) {
            throw new Error('Invalid plugin structure: missing package.json or index.js');
        }

        // Read plugin metadata
        const packageJsonEntry = zipEntries.find(entry => entry.entryName === 'package.json');
        const packageJson = JSON.parse(packageJsonEntry.getData().toString('utf8'));
        const pluginName = packageJson.name;

        if (!pluginName) {
            throw new Error('Invalid plugin: package.json must contain a name field');
        }

        // Resolve the install directory using the cross-platform home dir
        const pluginsDir = await getPluginsDir();
        const pluginDir = path.join(pluginsDir, pluginName);

        // If plugin already exists, remove it first (upgrade)
        if (fs.existsSync(pluginDir)) {
            await fs.remove(pluginDir);
        }

        // Extract plugin
        console.log(chalk.blue(`Installing plugin: ${pluginName}`));
        zip.extractAllTo(pluginDir, true);

        console.log(chalk.green(`Plugin installed successfully: ${pluginName}`));
        console.log(chalk.blue(`Location: ${pluginDir}`));
    } catch (error) {
        console.error(chalk.red('Error installing plugin:'), error.message);
        process.exit(1);
    }
}

module.exports = { install };
