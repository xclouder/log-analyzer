const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const AdmZip = require('adm-zip');

async function getPluginsDir() {
    // 在用户主目录下创建插件目录
    const homeDir = os.homedir();
    const pluginsDir = path.join(homeDir, '.log-analyzer', 'plugins');
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

        // 验证插件结构
        const hasPackageJson = zipEntries.some(entry => entry.entryName === 'package.json');
        const hasIndexJs = zipEntries.some(entry => entry.entryName === 'index.js');

        if (!hasPackageJson || !hasIndexJs) {
            throw new Error('Invalid plugin structure: missing package.json or index.js');
        }

        // 读取插件信息
        const packageJsonEntry = zipEntries.find(entry => entry.entryName === 'package.json');
        const packageJson = JSON.parse(packageJsonEntry.getData().toString('utf8'));
        const pluginName = packageJson.name;

        if (!pluginName) {
            throw new Error('Invalid plugin: package.json must contain a name field');
        }

        // 获取插件安装目录
        const pluginsDir = await getPluginsDir();
        const pluginDir = path.join(pluginsDir, pluginName);

        // 如果插件已存在，先删除
        if (fs.existsSync(pluginDir)) {
            await fs.remove(pluginDir);
        }

        // 解压插件
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
