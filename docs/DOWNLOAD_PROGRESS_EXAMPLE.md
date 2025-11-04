# 下载进度功能使用示例

## 插件中使用下载进度

### 基本用法

```javascript
// 在插件的 activate 方法中
async activate(context) {
    this.api.registerCommand(context, 'myPlugin.downloadFile', async () => {
        try {
            const url = await this.api.showInputBox({
                prompt: '请输入下载URL',
                placeHolder: 'https://example.com/file.zip'
            });
            
            if (!url) return;
            
            // 下载文件，进度会自动显示在UI上
            const downloadPath = await this.api.downloadFile(
                url,
                'my-plugin/downloaded-file.zip'
            );
            
            await this.api.showInformationMessage(
                `文件下载成功！\n保存位置: ${downloadPath}`
            );
            
        } catch (error) {
            await this.api.showErrorMessage(
                `下载失败: ${error.message}`
            );
        }
    });
}
```

### 带进度回调的用法

```javascript
async activate(context) {
    this.api.registerCommand(context, 'myPlugin.downloadWithCallback', async () => {
        try {
            const url = 'https://example.com/large-file.zip';
            
            // 使用进度回调
            const downloadPath = await this.api.downloadFile(
                url,
                'my-plugin/large-file.zip',
                {
                    onProgress: (info) => {
                        // 自定义进度处理
                        console.log(`下载进度: ${info.progress}%`);
                        console.log(`已下载: ${(info.downloadedSize / 1024 / 1024).toFixed(2)}MB`);
                        console.log(`总大小: ${(info.totalSize / 1024 / 1024).toFixed(2)}MB`);
                        
                        // 可以在这里更新自定义UI或执行其他操作
                    }
                }
            );
            
            console.log('下载完成:', downloadPath);
            
        } catch (error) {
            console.error('下载失败:', error);
        }
    });
}
```

## 渲染进程中监听下载事件

如果你需要在渲染进程中监听下载事件，可以使用以下方法：

```javascript
// 在 index.html 或其他渲染进程脚本中

// 监听下载进度
window.electronAPI.onDownloadProgress((event, info) => {
    console.log('下载进度更新:', info);
    // info 包含:
    // - url: 下载URL
    // - downloadedSize: 已下载大小（字节）
    // - totalSize: 总大小（字节）
    // - progress: 进度百分比（0-100）
    // - downloadPath: 下载路径
});

// 监听下载完成
window.electronAPI.onDownloadComplete((event, info) => {
    console.log('下载完成:', info);
    // info 包含:
    // - url: 下载URL
    // - downloadPath: 下载路径
    // - totalSize: 总大小（字节）
});

// 监听下载错误
window.electronAPI.onDownloadError((event, info) => {
    console.error('下载失败:', info);
    // info 包含:
    // - url: 下载URL
    // - error: 错误信息
});
```

## 进度条UI说明

下载进度条会自动显示在窗口右下角，包含以下信息：

1. **标题**：显示"下载中..."、"下载完成"或"下载失败"
2. **进度条**：可视化显示下载进度
3. **百分比**：显示当前下载百分比（如：45%）
4. **大小信息**：显示已下载/总大小（如：45.2MB / 100.5MB）
5. **URL信息**：显示正在下载的URL
6. **关闭按钮**：可以手动关闭进度条

### 自动行为

- 下载完成后，进度条会在3秒后自动隐藏
- 下载失败后，进度条会在5秒后自动隐藏
- 用户可以随时点击关闭按钮手动隐藏

## 完整插件示例

```javascript
// package.json
{
    "name": "download-demo",
    "version": "1.0.0",
    "title": "下载演示插件",
    "description": "演示如何使用下载进度功能",
    "main": "index.js",
    "contributes": {
        "commands": [
            {
                "command": "downloadDemo.downloadFile",
                "title": "下载文件",
                "category": "下载演示"
            }
        ]
    }
}

// index.js
class DownloadDemoPlugin {
    constructor(api) {
        this.api = api;
    }

    async activate(context) {
        // 注册下载命令
        this.api.registerCommand(context, 'downloadDemo.downloadFile', async () => {
            await this.downloadFile();
        });
    }

    async downloadFile() {
        try {
            // 获取下载URL
            const url = await this.api.showInputBox({
                prompt: '请输入要下载的文件URL',
                placeHolder: 'https://example.com/file.zip',
                value: 'https://github.com/electron/electron/releases/download/v25.3.1/electron-v25.3.1-win32-x64.zip'
            });

            if (!url) {
                return;
            }

            // 提取文件名
            const fileName = url.split('/').pop() || 'downloaded-file';
            
            // 显示开始下载的消息
            await this.api.showInformationMessage(
                `开始下载文件...\n${url}`
            );

            // 下载文件（进度会自动显示）
            const downloadPath = await this.api.downloadFile(
                url,
                `download-demo/${fileName}`,
                {
                    onProgress: (info) => {
                        // 可选：在控制台输出进度
                        if (info.progress % 10 === 0) {
                            console.log(`下载进度: ${info.progress}%`);
                        }
                    }
                }
            );

            // 下载完成
            await this.api.showInformationMessage(
                `文件下载成功！\n保存位置: ${downloadPath}`
            );

        } catch (error) {
            await this.api.showErrorMessage(
                `下载失败: ${error.message}`
            );
        }
    }

    deactivate() {
        console.log('Download Demo Plugin deactivated');
    }
}

module.exports = DownloadDemoPlugin;
```

## 注意事项

1. **网络连接**：确保有稳定的网络连接
2. **磁盘空间**：确保有足够的磁盘空间存储下载的文件
3. **文件大小**：对于超大文件，下载可能需要较长时间
4. **错误处理**：建议使用 try-catch 捕获下载错误
5. **重定向**：下载功能会自动处理HTTP重定向（301、302）

## 测试建议

1. 测试小文件下载（几MB）
2. 测试大文件下载（几百MB）
3. 测试网络中断情况
4. 测试无效URL
5. 测试重定向URL
