const path = require('path');
const { spawn } = require('child_process');

class TikistarLogDecoderPlugin {
    constructor(api) {
        this.id = 'tikistar-log-decoder';
        this.api = api;
    }

    async onPreOpenFile(filePath) {
        console.log('[TikistarLogDecoder] Processing file:', filePath);
        
        // 检查文件是否是加密的日志文件
        if (this.isEncryptedLogFile(filePath)) {
            console.log('[TikistarLogDecoder] File is encrypted log file');
            // 获取解密后的文件路径
            const decodedPath = this.getDecodedFilePath(filePath);
            console.log('[TikistarLogDecoder] Decoded path will be:', decodedPath);
            
            // 删除已存在的解密文件
            try {
                await this.api.fs.unlink(decodedPath);
                console.log('[TikistarLogDecoder] Removed existing decoded file');
            } catch (e) {
                // 如果文件不存在，忽略错误
                console.log('[TikistarLogDecoder] No existing file to remove');
            }
            
            // 使用 LogDecoder.exe 解密文件
            try {
                console.log('[TikistarLogDecoder] Starting decoding process');
                await this.decodeFile(filePath, decodedPath);
                console.log('[TikistarLogDecoder] File decoded successfully');
                return decodedPath;
            } catch (error) {
                console.error('[TikistarLogDecoder] Failed to decode log file:', error);
                return filePath; // 如果解密失败，返回原始文件路径
            }
        } else {
            console.log('[TikistarLogDecoder] Not an encrypted log file');
        }
        
        return filePath;
    }

    isEncryptedLogFile(filePath) {
        const isEncrypted = filePath.toLowerCase().includes('tkencoded_');
        console.log('[TikistarLogDecoder] isEncryptedLogFile check:', filePath, isEncrypted);
        return isEncrypted;
    }

    getDecodedFilePath(filePath) {
        const dir = path.dirname(filePath);
        const basename = path.basename(filePath).replace('tkencoded_', '');
        return path.join(dir, `${basename}`);
    }

    decodeFile(sourcePath, destPath) {
        return new Promise((resolve, reject) => {
            // 获取 LogDecoder.exe 的路径（假设它在插件目录中）
            const decoderPath = path.join(__dirname, 'assets', 'LogDecoder.exe');
            console.log('[TikistarLogDecoder] Using decoder at:', decoderPath);

            const decoder = spawn(decoderPath, [sourcePath, destPath]);
            
            decoder.stdout.on('data', (data) => {
                console.log(`[LogDecoder] ${data}`);
            });
            
            decoder.stderr.on('data', (data) => {
                console.error(`[LogDecoder Error] ${data}`);
            });
            
            decoder.on('close', (code) => {
                if (code === 0) {
                    console.log('[TikistarLogDecoder] Decoding completed successfully');
                    resolve();
                } else {
                    reject(new Error(`Decoder process exited with code ${code}`));
                }
            });
            
            decoder.on('error', (err) => {
                reject(err);
            });
        });
    }
}

module.exports = TikistarLogDecoderPlugin;
