const path = require('path');

module.exports = function (pluginBasePath) {
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
        async onPreOpenFile(filePath) {
            // Add your path processing logic here

            console.log('[OpenLogFromUrl] Processing file:', filePath);
            if (this.isCompressedFile(filePath)) {
                const fs = require('fs');
                const cacheDir = require('path').join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));

                // 使用智能解压方法
                fs.mkdirSync(cacheDir, { recursive: true });
                
                try {
                    await this.extractZipWithFallback(filePath, cacheDir);
                } catch (error) {
                    console.error(`Extraction failed: ${error.message}`);
                    await this.api.showErrorMessage(`Failed to extract ZIP file`, { modal: true, detail: error.message });
                    return filePath;
                }

                // 获取解压后的文件列表
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
                        await this.api.pluginOpenFile(filePath);
                        console.log(`File opened successfully: ${filePath}`);
                        // await this.api.showInformationMessage(`File opened: ${selectedFile}`, { modal: true });
                    } catch (error) {
                        console.error(`Failed to open file: ${error.message}`);
                        await this.api.showErrorMessage(`Failed to open file: ${selectedFile}`, { modal: true, detail: error.message });
                    }
                } else {
                    console.log(`User cancelled file selection.`);
                }

                return filePath;
            }

            return filePath;
        }

        isCompressedFile(filePath) {
            const ext = path.extname(filePath).toLowerCase();
            return ['.zip', '.tar', '.gz', '.tar.gz', '.7z', '.zip'].includes(ext);
        }

        /**
         * 智能解压 ZIP 文件，自动选择最佳方法
         * 优先使用 adm-zip（快速），如果失败则自动切换到流式解压
         * @param {string} zipFilePath - ZIP 文件路径
         * @param {string} targetDir - 目标解压目录
         */
        async extractZipWithFallback(zipFilePath, targetDir) {
            const fs = require('fs');
            const stats = fs.statSync(zipFilePath);
            const fileSizeInMB = stats.size / (1024 * 1024);
            console.log(`ZIP file size: ${fileSizeInMB.toFixed(2)} MB`);
            
            try {
                // 优先尝试使用 adm-zip（性能更好）
                console.log(`Attempting fast extraction with adm-zip...`);
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(zipFilePath);
                zip.extractAllTo(targetDir, true);
                console.log(`Fast extraction successful`);
            } catch (error) {
                // 如果 adm-zip 失败（通常是因为文件太大），自动切换到流式解压
                if (error.message.includes('Buffer') || error.message.includes('memory')) {
                    console.log(`Fast extraction failed (${error.message}), switching to streaming extraction...`);
                    await this.extractLargeZip(zipFilePath, targetDir);
                } else {
                    // 其他错误直接抛出
                    throw error;
                }
            }
        }

        /**
         * 使用流式方法解压大型 ZIP 文件
         * @param {string} zipFilePath - ZIP 文件路径
         * @param {string} targetDir - 目标解压目录
         */
        async extractLargeZip(zipFilePath, targetDir) {
            const fs = require('fs');
            const path = require('path');
            const { promisify } = require('util');
            const stream = require('stream');
            const pipeline = promisify(stream.pipeline);
            
            return new Promise((resolve, reject) => {
                const yauzl = require('yauzl');
                
                yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    let extractedCount = 0;
                    let totalEntries = 0;
                    
                    zipfile.on('entry', async (entry) => {
                        totalEntries++;
                        const fullPath = path.join(targetDir, entry.fileName);
                        
                        // 如果是目录
                        if (/\/$/.test(entry.fileName)) {
                            fs.mkdirSync(fullPath, { recursive: true });
                            zipfile.readEntry();
                            return;
                        }
                        
                        // 确保父目录存在
                        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                        
                        // 解压文件
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            const writeStream = fs.createWriteStream(fullPath);
                            
                            readStream.on('end', () => {
                                extractedCount++;
                                if (extractedCount % 10 === 0) {
                                    console.log(`Extracted ${extractedCount} files...`);
                                }
                                zipfile.readEntry();
                            });
                            
                            readStream.on('error', (err) => {
                                reject(err);
                            });
                            
                            writeStream.on('error', (err) => {
                                reject(err);
                            });
                            
                            readStream.pipe(writeStream);
                        });
                    });
                    
                    zipfile.on('end', () => {
                        console.log(`Extraction complete. Extracted ${extractedCount} files.`);
                        resolve();
                    });
                    
                    zipfile.on('error', (err) => {
                        reject(err);
                    });
                    
                    zipfile.readEntry();
                });
            });
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
                const fs = require('fs');
                
                // 计算 URL 的 MD5 哈希
                const md5Hash = require('crypto').createHash('md5').update(url).digest('hex');
                console.log(`Calculated MD5 hash: ${md5Hash}`);

                // 检查缓存目录
                const cacheDir = require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'log-analyzer', 'cache', 'downloadFiles', md5Hash);
                console.log(`Cache directory: ${cacheDir}`);

                // 检查缓存是否存在且未过期（1天内）
                let shouldDownload = true;
                try {
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
                    const fileBuffer = fs.readFileSync(zipFilePath);
                    if (!fileBuffer.slice(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
                        console.error(`Downloaded file is not a ZIP archive.`);
                        await this.api.showErrorMessage(`Downloaded file is not a ZIP archive`, { modal: true, detail: `File from ${url} is not a valid ZIP file.` });
                        return;
                    }
                    console.log(`Downloaded file is a valid ZIP archive.`);

                    // 解压文件到 MD5 目录
                    console.log(`Extracting ZIP to ${cacheDir}...`);
                    
                    try {
                        // 确保缓存目录存在
                        fs.mkdirSync(cacheDir, { recursive: true });
                        
                        // 尝试使用 adm-zip 解压，如果失败则自动切换到流式解压
                        await this.extractZipWithFallback(zipFilePath, cacheDir);
                        
                        console.log(`Extraction successful to ${cacheDir}`);
                    } catch (error) {
                        console.error(`Extraction failed: ${error.message}`);
                        await this.api.showErrorMessage(`Failed to extract ZIP file`, { modal: true, detail: error.message });
                        return;
                    }
                }

                // 获取解压后的文件列表
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
                        await this.api.pluginOpenFile(filePath);
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
