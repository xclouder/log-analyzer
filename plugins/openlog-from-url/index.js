const path = require('path');

module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class OpenlogFromUrlPlugin extends Plugin {
        constructor(api) {
            super(api);
            this.api = api;
        }

        /**
         * Process file path
         * @param {string} filePath - The path of the file
         * @returns {Promise<string>} - The processed file path
         */
        async processPath(filePath) {
            // Add your path processing logic here
            return filePath;
        }

        async onActivate(context) {
            console.log(`OpenLogFromUrl onActivate`);

            this.api.registerCommand(context, 'loganalyzer.openLogFromUrl', () => {
                this.doWork();
            });
        }  
        
        async doWork() {
            console.log(`OpenlogFromUrlPlugin doWork`);

            // 获取用户输入的 URL
            const url = await this.api.showInputBox({ title: "Input log url:" });
            
            if (!url) {
                console.log(`User cancelled URL input`);
                return;
            }
            console.log(`Input url: ${url}`);

            try {
                // 计算 URL 的 MD5 哈希
                const md5Hash = require('crypto').createHash('md5').update(url).digest('hex');
                console.log(`Calculated MD5 hash: ${md5Hash}`);

                // 检查缓存目录
                const cacheDir = require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'log-analyzer', 'cache', 'downloadFiles', md5Hash);
                console.log(`Cache directory: ${cacheDir}`);

                // 检查缓存是否存在且未过期（1天内）
                let shouldDownload = true;
                try {
                    const fs = require('fs');
                    const stats = fs.statSync(cacheDir);
                    const lastModified = new Date(stats.mtime);
                    const now = new Date();
                    const ageInDays = (now - lastModified) / (1000 * 60 * 60 * 24);
                    if (ageInDays < 1) {
                        shouldDownload = false;
                        console.log(`Cache found and is less than 1 day old (${ageInDays.toFixed(2)} days). Using cached files.`);
                    } else {
                        console.log(`Cache found but is older than 1 day (${ageInDays.toFixed(2)} days). Will re-download.`);
                    }
                } catch (e) {
                    console.log(`Cache not found or error checking cache: ${e.message}. Will download.`);
                }

                let zipFilePath;
                if (shouldDownload) {
                    // 下载文件
                    console.log(`Downloading file from ${url}...`);
                    const downloadPath = `openLogFromUrl/${md5Hash}.zip`;
                    try {
                        zipFilePath = await this.api.downloadFile(url, downloadPath);
                        console.log(`Download successful. Saved to ${zipFilePath}`);
                    } catch (error) {
                        console.error(`Download failed: ${error.message}`);
                        await this.api.showErrorMessage(`Failed to download file from ${url}`, { modal: true, detail: error.message });
                        return;
                    }

                    // 检查文件是否为 ZIP
                    const fs = require('fs');
                    const fileBuffer = fs.readFileSync(zipFilePath);
                    if (!fileBuffer.slice(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
                        console.error(`Downloaded file is not a ZIP archive.`);
                        await this.api.showErrorMessage(`Downloaded file is not a ZIP archive`, { modal: true, detail: `File from ${url} is not a valid ZIP file.` });
                        return;
                    }
                    console.log(`Downloaded file is a valid ZIP archive.`);

                    // 解压文件到 MD5 目录
                    console.log(`Extracting ZIP to ${cacheDir}...`);
                    const AdmZip = require('adm-zip');
                    const zip = new AdmZip(zipFilePath);
                    try {
                        // 确保缓存目录存在
                        fs.mkdirSync(cacheDir, { recursive: true });
                        zip.extractAllTo(cacheDir, true);
                        console.log(`Extraction successful to ${cacheDir}`);
                    } catch (error) {
                        console.error(`Extraction failed: ${error.message}`);
                        await this.api.showErrorMessage(`Failed to extract ZIP file`, { modal: true, detail: error.message });
                        return;
                    }
                }

                // 获取解压后的文件列表
                const fs = require('fs');
                const filesArray = [];
                const walkDir = (dir) => {
                    const files = fs.readdirSync(dir);
                    files.forEach(file => {
                        const fullPath = require('path').join(dir, file);
                        if (fs.statSync(fullPath).isFile()) {
                            filesArray.push(fullPath.replace(cacheDir + require('path').sep, ''));
                        } else {
                            walkDir(fullPath);
                        }
                    });
                };
                walkDir(cacheDir);
                console.log(`Files in cache directory: ${filesArray.length} files found.`);
                console.log(filesArray);

                // 如果没有文件，显示错误信息
                if (filesArray.length === 0) {
                    console.error(`No files found in extracted directory.`);
                    await this.api.showErrorMessage(`No files found after extraction`, { modal: true, detail: `No files were extracted from the downloaded ZIP.` });
                    return;
                }

                // 让用户选择要打开的文件
                const selectedFile = await this.api.showQuickPick(filesArray, { title: "Select a file to open:" });
                if (selectedFile) {
                    console.log(`User selected file: ${selectedFile}`);
                    const filePath = require('path').join(cacheDir, selectedFile);
                    try {
                        await this.api.openFile(filePath);
                        console.log(`File opened successfully: ${filePath}`);
                        // await this.api.showInformationMessage(`File opened: ${selectedFile}`, { modal: true });
                    } catch (error) {
                        console.error(`Failed to open file: ${error.message}`);
                        await this.api.showErrorMessage(`Failed to open file: ${selectedFile}`, { modal: true, detail: error.message });
                    }
                } else {
                    console.log(`User cancelled file selection.`);
                }
            } catch (error) {
                console.error(`Unexpected error in doWork: ${error.message}`);
                await this.api.showErrorMessage(`Unexpected error`, { modal: true, detail: error.message });
            }
        }
    }

    return OpenlogFromUrlPlugin;
};
