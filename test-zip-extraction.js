/**
 * 测试 ZIP 解压功能
 * 用于验证大文件解压修复
 */

const fs = require('fs');
const path = require('path');

// 模拟 extractLargeZip 方法
async function extractLargeZip(zipFilePath, targetDir) {
    const yauzl = require('yauzl');
    
    return new Promise((resolve, reject) => {
        yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                reject(err);
                return;
            }
            
            let extractedCount = 0;
            
            zipfile.on('entry', (entry) => {
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
                    
                    readStream.on('error', reject);
                    writeStream.on('error', reject);
                    
                    readStream.pipe(writeStream);
                });
            });
            
            zipfile.on('end', () => {
                console.log(`✓ Extraction complete. Extracted ${extractedCount} files.`);
                resolve();
            });
            
            zipfile.on('error', reject);
            
            zipfile.readEntry();
        });
    });
}

// 测试函数
async function testExtraction(zipPath, outputDir) {
    console.log('========================================');
    console.log('ZIP 解压测试');
    console.log('========================================');
    console.log(`ZIP 文件: ${zipPath}`);
    console.log(`输出目录: ${outputDir}`);
    console.log('');
    
    if (!fs.existsSync(zipPath)) {
        console.error('❌ ZIP 文件不存在');
        return;
    }
    
    const stats = fs.statSync(zipPath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    console.log(`文件大小: ${fileSizeInMB.toFixed(2)} MB`);
    console.log('');
    
    try {
        const startTime = Date.now();
        
        if (stats.size > 1024 * 1024 * 1024) {
            console.log('使用流式解压（大文件模式）...');
            await extractLargeZip(zipPath, outputDir);
        } else {
            console.log('使用 adm-zip（小文件模式）...');
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(outputDir, true);
            console.log('✓ 解压完成');
        }
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('');
        console.log(`✓ 解压成功！耗时: ${duration} 秒`);
        console.log('========================================');
    } catch (error) {
        console.error('');
        console.error('❌ 解压失败:', error.message);
        console.error('========================================');
    }
}

// 使用示例
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('用法: node test-zip-extraction.js <zip文件路径> <输出目录>');
        console.log('');
        console.log('示例:');
        console.log('  node test-zip-extraction.js test.zip ./output');
        process.exit(1);
    }
    
    const zipPath = args[0];
    const outputDir = args[1];
    
    testExtraction(zipPath, outputDir);
}

module.exports = { extractLargeZip, testExtraction };
