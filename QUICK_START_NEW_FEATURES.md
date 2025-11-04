# 新功能快速开始指南

## 🎯 快速体验新功能

### 功能1：下载进度条 📊

#### 最简单的使用方式

如果你是**插件开发者**，只需在插件中调用下载方法：

```javascript
// 在你的插件中
const downloadPath = await this.api.downloadFile(
    'https://example.com/file.zip',
    'my-plugin/file.zip'
);
```

**就这么简单！** 进度条会自动显示在窗口右下角。

#### 效果预览

```
┌─────────────────────────────────┐
│ 下载中...                    × │
├─────────────────────────────────┤
│ ████████████░░░░░░░░░░░░░░░░░░ │
│ 45%              45.2MB / 100MB │
│ https://example.com/file.zip    │
└─────────────────────────────────┘
```

---

### 功能2：大文件日志读取 📁

#### 场景：打开一个5GB的日志文件

**传统方式：** ❌ 程序卡死或崩溃

**新方式：** ✅ 3步轻松搞定

**步骤1：** 拖放文件到编辑器
```
系统检测到文件大小: 5120.00MB
是否使用高级读取模式？
[确定] [取消]
```

**步骤2：** 点击"确定"，填写信息
```
┌─────────────────────────────────┐
│ 读取大文件                       │
├─────────────────────────────────┤
│ 时间戳（可选）                   │
│ [11.04-19.19.39]                │
│ UE格式: MM.DD-HH.mm.ss          │
│ 或 MM.DD-HH.mm（可省略秒）      │
│                                  │
│ 读取大小（MB）                   │
│ [100]                           │
│ 默认100MB，最大1000MB           │
│                                  │
│         [取消]  [读取]          │
└─────────────────────────────────┘
```

**步骤3：** 点击"读取"，完成！
```
已读取 100.00MB / 5120.00MB
起始行: 12345, 总行数: 50000
✓ 找到时间戳位置
```

---

## 🚀 5分钟上手教程

### 教程1：下载并分析远程日志

**目标：** 从服务器下载日志文件并分析

**步骤：**

1. **创建一个简单的插件**（或使用现有插件）

```javascript
// 在插件的 activate 方法中
this.api.registerCommand(context, 'myPlugin.downloadLog', async () => {
    // 1. 获取下载URL
    const url = await this.api.showInputBox({
        prompt: '请输入日志文件URL',
        placeHolder: 'https://server.com/logs/app.log'
    });
    
    if (!url) return;
    
    // 2. 下载文件（进度条自动显示）
    const downloadPath = await this.api.downloadFile(
        url,
        'logs/downloaded.log'
    );
    
    // 3. 打开下载的文件
    await this.api.pluginOpenFile(downloadPath);
    
    // 4. 提示用户
    await this.api.showInformationMessage('日志文件已下载并打开！');
});
```

2. **运行命令**
   - 按 `Ctrl+Shift+P` 打开命令面板
   - 输入你的命令名称
   - 回车执行

3. **观察进度**
   - 右下角会显示下载进度
   - 下载完成后自动打开文件

---

### 教程2：分析生产环境错误日志

**场景：** 生产环境出现错误，需要查看特定时间段的日志

**步骤：**

1. **准备信息**
   - 日志文件路径：`C:/logs/production.log`
   - 错误发生时间：`11.04-14.30.00`（UE格式）
   - 需要查看的范围：前后50MB

2. **打开文件**
   - 拖放文件到编辑器
   - 或通过菜单：文件 → 打开文件

3. **使用高级读取**
   - 系统检测到大文件，提示使用高级模式
   - 点击"确定"

4. **填写参数**
   ```
   时间戳：11.04-14.30（可省略秒）
   读取大小：100
   ```

5. **应用过滤器**
   - 点击"添加过滤条件"
   - 选择"文本匹配"
   - 输入：`ERROR`
   - 选择高亮颜色：红色
   - 点击"应用过滤器"

6. **查看结果**
   - 左侧显示原始日志（100MB）
   - 右侧显示过滤后的错误日志
   - 错误行高亮显示

---

## 💡 实用技巧

### 技巧1：逐步浏览超大文件

如果需要浏览整个10GB的日志文件：

```
第1次读取：
- 时间戳：留空
- 大小：100MB
- 记录最后一行时间：[2025.11.04-10.15.30...]

第2次读取：
- 时间戳：11.04-10.15.30
- 大小：100MB
- 记录最后一行时间：[2025.11.04-10.30.45...]

第3次读取：
- 时间戳：11.04-10.30.45
- 大小：100MB
- ...继续
```

### 技巧2：快速定位关键时间点

如果知道错误发生的大致时间：

```
1. 使用错误发生前5分钟的时间戳
2. 读取100-200MB
3. 使用过滤器筛选ERROR
4. 快速找到问题根源
```

### 技巧3：下载进度监控

在插件中监控下载进度：

```javascript
const downloadPath = await this.api.downloadFile(
    url,
    'path/to/file.zip',
    {
        onProgress: (info) => {
            // 每5%会调用一次
            console.log(`进度: ${info.progress}%`);
            
            // 可以在这里做其他事情
            // 比如更新自定义UI
        }
    }
);
```

---

## 📋 常见问题速查

### Q: 下载进度条不显示？
**A:** 检查是否使用了 `api.downloadFile` 方法，进度条会自动显示。

### Q: 找不到时间戳？
**A:** 
1. 检查时间戳格式是否正确
2. 尝试使用日志文件中的实际格式
3. 如果找不到，系统会从文件开头读取

### Q: 读取的内容太少？
**A:** 增加读取大小，最大可设置为1000MB。

### Q: 内存占用太高？
**A:** 减小读取大小，建议：
- 2-5GB文件：读取50-100MB
- 5-10GB文件：读取20-50MB
- >10GB文件：读取10-20MB

### Q: 如何读取文件末尾？
**A:** 使用最近的时间戳，或者先读取一小部分获取最后的时间戳。

---

## 🎓 进阶使用

### 场景：自动化日志分析

创建一个自动化分析插件：

```javascript
class AutoAnalyzerPlugin {
    async activate(context) {
        this.api.registerCommand(context, 'autoAnalyzer.analyze', async () => {
            // 1. 下载最新日志
            const logUrl = 'https://server.com/logs/latest.log';
            const logPath = await this.api.downloadFile(
                logUrl,
                'auto-analyzer/latest.log'
            );
            
            // 2. 打开日志文件
            await this.api.pluginOpenFile(logPath);
            
            // 3. 自动应用预设的过滤器
            // （这部分需要通过IPC通信实现）
            
            // 4. 生成分析报告
            await this.generateReport();
        });
    }
    
    async generateReport() {
        // 分析逻辑
        await this.api.showInformationMessage('分析完成！');
    }
}
```

---

## 📚 更多资源

- [新功能详细说明](docs/NEW_FEATURES.md)
- [下载进度使用示例](docs/DOWNLOAD_PROGRESS_EXAMPLE.md)
- [大文件读取使用示例](docs/LARGE_FILE_READING_EXAMPLE.md)
- [更新总结](UPDATE_SUMMARY.md)

---

## 🎉 开始使用

现在你已经了解了新功能的基本用法，开始体验吧！

**记住：**
- 下载文件时，进度条会自动显示 ✨
- 打开大文件时，系统会智能提示 🚀
- 遇到问题，查看文档或提Issue 💬

祝你使用愉快！
