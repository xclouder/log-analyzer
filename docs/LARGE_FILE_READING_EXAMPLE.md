# 大文件日志读取功能使用示例

## 功能概述

大文件日志读取功能允许你高效地处理GB级别的日志文件，通过时间戳定位和分块读取，避免一次性加载整个文件导致的内存问题。

## 使用场景

### 场景1：分析特定时间段的错误日志

假设你有一个10GB的生产环境日志文件，需要查看2024年1月15日上午10点到11点之间的错误信息。

**操作步骤：**

1. 打开文件（拖放或通过菜单）
2. 系统检测到文件大于200MB，提示使用高级读取模式
3. 在对话框中输入：
   - 时间戳：`2024-01-15 10:00:00`
   - 读取大小：`100` MB
4. 点击"读取"
5. 系统会从该时间戳位置开始读取100MB的内容
6. 使用过滤器功能筛选ERROR关键字

### 场景2：查看日志文件的最新内容

如果你想查看一个持续增长的日志文件的最新内容：

**操作步骤：**

1. 打开大文件
2. 选择高级读取模式
3. 不输入时间戳（留空）
4. 设置读取大小为你需要的大小
5. 系统会从文件开头读取指定大小的内容

**提示：** 如果想读取文件末尾的内容，可以使用最近的时间戳。

### 场景3：逐步浏览超大日志文件

对于需要浏览整个大文件的情况：

**方法：**

1. 第一次读取：时间戳留空，读取前100MB
2. 记录最后一行的时间戳
3. 第二次读取：使用记录的时间戳，再读取100MB
4. 重复此过程，逐步浏览整个文件

## API使用示例

### 在渲染进程中使用

```javascript
// 读取大文件的特定时间段
async function readLargeLogFile() {
    try {
        const filePath = 'C:/logs/production.log';
        const timestamp = '2024-01-15 10:00:00';
        const sizeMB = 100;
        
        const result = await window.electronAPI.readFileByTimestamp(
            filePath,
            timestamp,
            sizeMB
        );
        
        if (result && result.content) {
            // 显示读取的内容
            editor.setValue(result.content);
            
            // 显示读取信息
            console.log(`文件大小: ${(result.fileSize / 1024 / 1024).toFixed(2)}MB`);
            console.log(`读取大小: ${(result.readSize / 1024 / 1024).toFixed(2)}MB`);
            console.log(`起始行号: ${result.startLine}`);
            console.log(`总行数: ${result.totalLines}`);
            console.log(`找到时间戳: ${result.foundTimestamp ? '是' : '否'}`);
            
            if (result.foundTimestamp) {
                console.log(`读取位置: ${result.readPosition} 字节`);
            }
        }
    } catch (error) {
        console.error('读取文件失败:', error);
        alert('读取文件失败: ' + error.message);
    }
}
```

### 在插件中使用

虽然插件API目前没有直接暴露大文件读取功能，但你可以通过以下方式实现：

```javascript
// 在插件中
class LogAnalyzerPlugin {
    constructor(api) {
        this.api = api;
    }

    async activate(context) {
        this.api.registerCommand(context, 'logAnalyzer.readLargeFile', async () => {
            await this.readLargeFile();
        });
    }

    async readLargeFile() {
        try {
            // 获取文件路径
            const filePath = await this.api.showInputBox({
                prompt: '请输入日志文件路径',
                placeHolder: 'C:/logs/production.log'
            });

            if (!filePath) return;

            // 获取时间戳
            const timestamp = await this.api.showInputBox({
                prompt: '请输入时间戳（可选，留空则从头读取）',
                placeHolder: '2024-01-15 10:00:00'
            });

            // 获取读取大小
            const sizeInput = await this.api.showInputBox({
                prompt: '请输入读取大小（MB）',
                placeHolder: '100'
            });

            const sizeMB = parseInt(sizeInput) || 100;

            // 通知主窗口读取文件
            // 注意：这需要通过IPC通信实现
            await this.api.showInformationMessage(
                `准备读取文件:\n路径: ${filePath}\n时间戳: ${timestamp || '无'}\n大小: ${sizeMB}MB`
            );

            // 实际读取需要通过主进程
            // 可以使用 pluginOpenFile 方法
            await this.api.pluginOpenFile(filePath);

        } catch (error) {
            await this.api.showErrorMessage(
                `读取失败: ${error.message}`
            );
        }
    }

    deactivate() {
        console.log('Log Analyzer Plugin deactivated');
    }
}

module.exports = LogAnalyzerPlugin;
```

## 支持的时间戳格式

系统支持多种常见的日志时间戳格式：

### 1. UE (Unreal Engine) 格式 ⭐ 推荐
```
日志格式: [2025.11.04-19.19.39:123]
用户输入: 11.04-19.19.39  （完整格式）
用户输入: 11.04-19.19     （省略秒，默认为00秒）

说明：
- 格式：MM.DD-HH.mm.ss
- 年份会自动使用当前年份
- 秒可以省略，默认为00
```

### 2. ISO 8601 格式
```
2024-01-15T10:30:45.123Z
2024-01-15T10:30:45+08:00
2024-01-15T10:30:45
```

### 3. 标准格式
```
2024-01-15 10:30:45
2024-01-15 10:30:45.123
```

### 4. 斜杠分隔
```
2024/01/15 10:30:45
```

### 5. 方括号包围
```
[2024-01-15 10:30:45]
```

## 性能优化建议

### 1. 选择合适的读取大小

- **小文件（<500MB）**：可以直接打开整个文件
- **中等文件（500MB-2GB）**：建议读取100-200MB
- **大文件（2GB-10GB）**：建议读取50-100MB
- **超大文件（>10GB）**：建议读取20-50MB

### 2. 使用时间戳精确定位

如果你知道要查看的时间段，使用时间戳可以：
- 快速跳转到目标位置
- 避免读取不需要的内容
- 节省内存和时间

### 3. 分段读取策略

对于需要浏览整个大文件的情况：

```javascript
// 伪代码示例
async function readFileInChunks(filePath, chunkSizeMB) {
    let currentTimestamp = null;
    let hasMore = true;
    
    while (hasMore) {
        const result = await window.electronAPI.readFileByTimestamp(
            filePath,
            currentTimestamp,
            chunkSizeMB
        );
        
        // 处理当前块的内容
        processContent(result.content);
        
        // 提取最后一行的时间戳作为下一次读取的起点
        currentTimestamp = extractLastTimestamp(result.content);
        
        // 检查是否还有更多内容
        hasMore = result.readPosition + result.readSize < result.fileSize;
    }
}
```

## 返回结果说明

```javascript
{
    content: string,        // 读取的文本内容
    startLine: number,      // 起始行号（在原文件中的位置）
    totalLines: number,     // 读取的总行数
    fileSize: number,       // 文件总大小（字节）
    readSize: number,       // 实际读取的大小（字节）
    foundTimestamp: boolean,// 是否找到指定的时间戳
    readPosition: number    // 读取的起始位置（字节偏移）
}
```

### 字段说明

- **content**: 读取的文本内容，可以直接显示在编辑器中
- **startLine**: 这段内容在原文件中的起始行号，用于定位
- **totalLines**: 读取的内容包含多少行
- **fileSize**: 原文件的总大小，用于计算读取进度
- **readSize**: 实际读取的字节数，可能小于请求的大小（文件末尾）
- **foundTimestamp**: 如果为true，表示成功定位到时间戳；false表示从文件开头读取
- **readPosition**: 读取的起始字节位置，用于后续读取

## 常见问题

### Q1: 为什么找不到时间戳？

**可能原因：**
1. 时间戳格式与日志文件中的格式不匹配
2. 指定的时间戳在文件中不存在
3. 日志文件没有时间戳

**解决方法：**
- 检查日志文件中的时间戳格式
- 使用正确的格式输入时间戳
- 如果找不到，系统会从文件开头读取

### Q2: 读取的内容不完整？

**可能原因：**
1. 读取大小设置太小
2. 从文件中间开始读取，第一行可能不完整

**解决方法：**
- 增加读取大小
- 系统会自动跳过第一个不完整的行

### Q3: 如何读取文件末尾的内容？

**方法：**
1. 使用最近的时间戳
2. 或者先读取一小部分，获取最后的时间戳，然后用该时间戳读取

### Q4: 内存占用过高？

**解决方法：**
- 减小读取大小
- 读取后及时清理不需要的内容
- 避免同时打开多个大文件

## 最佳实践

1. **先检查文件大小**：对于未知大小的文件，先查看文件信息
2. **使用合适的读取大小**：根据文件大小和需求选择
3. **善用时间戳**：如果知道目标时间，直接使用时间戳定位
4. **结合过滤器**：读取后使用过滤器功能筛选关键信息
5. **保存配置**：常用的过滤条件可以保存为配置文件

## 示例：分析生产环境错误日志

```javascript
// 1. 打开大文件
// 文件: production.log (5GB)

// 2. 使用高级读取模式
// 时间戳: 2024-01-15 14:30:00 (错误发生的时间)
// 读取大小: 100MB

// 3. 读取完成后，使用过滤器
// 添加过滤条件:
// - 类型: 文本匹配
// - 模式: ERROR
// - 高亮: 红色

// 4. 应用过滤器，查看错误信息

// 5. 如果需要更多上下文，可以：
// - 增加读取大小
// - 或使用稍早的时间戳重新读取
```

## 总结

大文件日志读取功能通过以下技术实现高效处理：

1. **二分查找**：快速定位时间戳位置
2. **分块读取**：只读取需要的部分
3. **智能检测**：自动识别大文件并提示
4. **多格式支持**：兼容各种时间戳格式
5. **详细反馈**：提供完整的读取信息

这使得处理GB级别的日志文件变得简单高效！
