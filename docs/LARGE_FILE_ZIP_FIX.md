# 大文件 ZIP 解压修复

## 问题描述

在使用 "从 URL 打开日志" 功能下载大型 ZIP 文件（超过 1.8GB）时，会出现以下错误：

```
Failed to extract ZIP file
Cannot create a Buffer larger than 1820364335 bytes
```

## 原因分析

`adm-zip` 库在解压 ZIP 文件时会将整个文件加载到内存中的 Buffer。Node.js 的 Buffer 有大小限制（约 1.8GB），因此无法处理超过此大小的文件。

## 解决方案

### 1. 智能 Fallback 机制

插件采用**智能自动切换**策略，而不是简单的文件大小判断：

1. **优先尝试快速解压**：使用 `adm-zip`（性能最佳）
2. **自动检测失败**：捕获 Buffer 相关错误
3. **自动切换方法**：失败时自动使用 `yauzl` 流式解压

**优势：**
- ✅ 小文件享受最佳性能
- ✅ 大文件自动降级，确保成功
- ✅ 无需人工干预或配置
- ✅ 对用户完全透明

### 2. 流式解压（Fallback）

当 `adm-zip` 因内存限制失败时，自动使用 `yauzl` 库：
- 不会将整个文件加载到内存
- 逐个文件解压，内存占用低
- 支持任意大小的 ZIP 文件

## 技术实现

### 新增依赖

```json
{
  "dependencies": {
    "yauzl": "^2.10.0"
  }
}
```

### 核心代码

```javascript
async extractZipWithFallback(zipFilePath, targetDir) {
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
            console.log(`Fast extraction failed, switching to streaming extraction...`);
            await this.extractLargeZip(zipFilePath, targetDir);
        } else {
            throw error;
        }
    }
}
```

### extractLargeZip 方法

使用 `yauzl` 的 `lazyEntries` 模式：
- 逐个读取 ZIP 条目
- 使用流式读写，避免大内存占用
- 自动创建目录结构
- 显示解压进度

## 使用说明

### 用户无需任何操作

修复后，用户使用 "从 URL 打开日志" 功能时：
1. 输入 ZIP 文件的 URL
2. 系统自动下载并显示进度
3. **自动选择合适的解压方法**
4. 解压完成后选择要打开的文件

### 支持的文件大小

- ✅ 小文件（< 1GB）：快速解压
- ✅ 大文件（1GB - 10GB+）：流式解压
- ✅ 超大文件：理论上无限制（取决于磁盘空间）

## 性能对比

| 文件大小 | 旧方案 (adm-zip) | 新方案 (智能 Fallback) |
|---------|-----------------|---------------------|
| 100MB   | ✅ 快速          | ✅ 快速 (adm-zip)    |
| 500MB   | ✅ 正常          | ✅ 正常 (adm-zip)    |
| 1GB     | ⚠️ 慢/可能失败   | ✅ 正常 (adm-zip)    |
| 2GB     | ❌ 失败          | ✅ 正常 (自动切换 yauzl) |
| 5GB+    | ❌ 失败          | ✅ 正常 (自动切换 yauzl) |

**智能 Fallback 的优势：**
- 小文件始终使用最快的方法
- 大文件自动降级，确保成功
- 无需预先判断文件大小
- 用户体验最佳

## 注意事项

1. **磁盘空间**：确保有足够的磁盘空间存储解压后的文件
2. **解压时间**：大文件解压可能需要较长时间，请耐心等待
3. **缓存机制**：已下载的文件会缓存 1 天，避免重复下载

## 相关文件

- `plugins/openlog-from-url/index.js` - 插件主文件
- `package.json` - 添加了 yauzl 依赖
- `docs/DOWNLOAD_PROGRESS_EXAMPLE.md` - 下载进度功能文档

## 版本信息

- 修复版本：1.1.17+
- 修复日期：2025-11-04
