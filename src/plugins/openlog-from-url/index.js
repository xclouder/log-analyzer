const path = require('path');

module.exports = function(pluginBasePath) {
    const Plugin = require(pluginBasePath);

    class OpenlogFromUrlPlugin extends Plugin {
        constructor(api) {
            super(api);
        }

        /**
         * onPreOpenFile hook: if the file being opened is a compressed archive,
         * extract it and let the user pick a file to open instead.
         * Returns the original filePath to continue normal open, or '' to cancel
         * (since we already called pluginOpenFile for the extracted file).
         */
        async onPreOpenFile(filePath) {
            if (!this.isCompressedFile(filePath)) {
                return filePath; // Not a compressed file, proceed normally
            }

            console.log('[OpenLogFromUrl] Handling compressed file:', filePath);
            const fs = require('fs');
            const extractDir = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
            fs.mkdirSync(extractDir, { recursive: true });

            try {
                await this.extractZipWithFallback(filePath, extractDir);
            } catch (error) {
                console.error('Extraction failed:', error.message);
                await this.api.showErrorMessage(`解压失败: ${error.message}`, { modal: true });
                return filePath; // Fall back to opening original file
            }

            const files = this.walkDir(extractDir);
            if (files.length === 0) {
                await this.api.showErrorMessage('解压后没有找到文件', { modal: true });
                return filePath;
            }

            const relativeFiles = files.map(f => f.replace(extractDir + path.sep, ''));
            const selected = await this.api.showQuickPick(relativeFiles, { title: '选择要打开的文件:' });
            if (selected) {
                const selectedPath = path.join(extractDir, selected);
                // Open the selected file via pluginOpenFile, then return '' to
                // prevent the main process from also trying to read the zip file
                await this.api.pluginOpenFile(selectedPath);
                return ''; // Signal: file already handled, don't try to read the zip
            }
            return filePath; // User cancelled, fall back
        }

        isCompressedFile(filePath) {
            const lower = filePath.toLowerCase();
            if (lower.endsWith('.tar.gz')) return true;
            const ext = path.extname(lower);
            return ['.zip', '.tar', '.gz', '.7z'].includes(ext);
        }

        walkDir(dir) {
            const fs = require('fs');
            const results = [];
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const fullPath = path.join(dir, entry);
                if (fs.statSync(fullPath).isDirectory()) {
                    results.push(...this.walkDir(fullPath));
                } else {
                    results.push(fullPath);
                }
            }
            return results;
        }

        /**
         * Extract a ZIP file, trying adm-zip first (fast) then falling back
         * to yauzl streaming (for large ZIPs that would OOM with adm-zip).
         */
        async extractZipWithFallback(zipPath, targetDir) {
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(targetDir, true);
                console.log('[OpenLogFromUrl] Fast extraction successful');
            } catch (error) {
                if (error.message.includes('Buffer') || error.message.includes('memory') || error.message.includes('heap')) {
                    console.log('[OpenLogFromUrl] Fast extraction failed, switching to streaming...');
                    await this.extractLargeZip(zipPath, targetDir);
                } else {
                    throw error;
                }
            }
        }

        extractLargeZip(zipPath, targetDir) {
            const fs = require('fs');
            return new Promise((resolve, reject) => {
                const yauzl = require('yauzl');
                yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                    if (err) { reject(err); return; }

                    zipfile.on('entry', (entry) => {
                        const fullPath = path.join(targetDir, entry.fileName);
                        if (/\/$/.test(entry.fileName)) {
                            fs.mkdirSync(fullPath, { recursive: true });
                            zipfile.readEntry();
                            return;
                        }
                        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) { reject(err); return; }
                            const writeStream = fs.createWriteStream(fullPath);
                            readStream.on('end', () => zipfile.readEntry());
                            readStream.on('error', reject);
                            writeStream.on('error', reject);
                            readStream.pipe(writeStream);
                        });
                    });

                    zipfile.on('end', resolve);
                    zipfile.on('error', reject);
                    zipfile.readEntry();
                });
            });
        }

        async onActivate(context) {
            this.api.registerCommand(context, 'loganalyzer.openLogFromUrl', () => this.doWork());
        }

        async doWork() {
            const url = await this.api.showInputBox({ title: '输入日志URL:' });
            if (!url) return;

            try {
                const fs = require('fs');
                const crypto = require('crypto');
                const md5 = crypto.createHash('md5').update(url).digest('hex');

                // Use cross-platform cache dir via PluginAPI
                const cacheDir = path.join(this.api.getAppCacheDir(), 'downloadFiles', md5);

                // Check if cache is still fresh (< 1 day old)
                let shouldDownload = true;
                try {
                    const stats = fs.statSync(cacheDir);
                    const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
                    if (ageInDays < 1) {
                        shouldDownload = false;
                        console.log(`[OpenLogFromUrl] Using cached files (${ageInDays.toFixed(2)} days old)`);
                    }
                } catch {
                    // Cache doesn't exist yet
                }

                if (shouldDownload) {
                    const downloadPath = `openLogFromUrl/${md5}.zip`;
                    let zipFilePath;
                    try {
                        zipFilePath = await this.api.downloadFile(url, downloadPath);
                    } catch (error) {
                        await this.api.showErrorMessage(`下载失败: ${error.message}`, { modal: true });
                        return;
                    }

                    // Verify ZIP magic bytes
                    const buf = Buffer.alloc(4);
                    const fd = fs.openSync(zipFilePath, 'r');
                    fs.readSync(fd, buf, 0, 4, 0);
                    fs.closeSync(fd);
                    if (!buf.equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
                        await this.api.showErrorMessage('下载的文件不是有效的ZIP档案', { modal: true });
                        return;
                    }

                    fs.mkdirSync(cacheDir, { recursive: true });
                    try {
                        await this.extractZipWithFallback(zipFilePath, cacheDir);
                    } catch (error) {
                        await this.api.showErrorMessage(`解压失败: ${error.message}`, { modal: true });
                        return;
                    }
                }

                const files = this.walkDir(cacheDir);
                if (files.length === 0) {
                    await this.api.showErrorMessage('解压后没有找到文件', { modal: true });
                    return;
                }

                const relativeFiles = files.map(f => f.replace(cacheDir + path.sep, ''));
                const selected = await this.api.showQuickPick(relativeFiles, { title: '选择要打开的文件:' });
                if (selected) {
                    const filePath = path.join(cacheDir, selected);
                    try {
                        await this.api.pluginOpenFile(filePath);
                    } catch (error) {
                        await this.api.showErrorMessage(`打开文件失败: ${error.message}`, { modal: true });
                    }
                }
            } catch (error) {
                await this.api.showErrorMessage(`发生错误: ${error.message}`, { modal: true });
            }
        }
    }

    return OpenlogFromUrlPlugin;
};
