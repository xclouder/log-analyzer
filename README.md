# LogAnalyzer

一个高性能的日志文件分析工具，基于Electron和Monaco Editor（VSCode的编辑器）构建。支持大文件处理、多种过滤方式和自定义高亮规则。

## ✨ 主要特性

- 🚀 **高性能处理**：优化的性能设计，轻松处理大型日志文件
- 🔍 **强大的过滤功能**：
  - 文本匹配过滤
  - 正则表达式过滤
  - 行号范围过滤
- 💡 **智能高亮**：自定义高亮规则，重要信息一目了然
- 📱 **便携无忧**：单文件exe，无需安装，随时随地使用
- 💾 **配置导入导出**：保存和加载过滤器配置
- ⚡ **双击导航**：在过滤结果和原始日志间快速定位
- 🖥️ **全屏模式**：支持编辑器全屏显示

## 🚀 快速开始

### 下载使用

1. 从[发布页面](https://github.com/yourusername/LogAnalyzer/releases)下载最新的`LogAnalyzer-Portable.exe`
2. 直接运行exe文件，无需安装
3. 开始分析您的日志文件！

### 基本使用

1. 打开日志文件：
   - 点击"打开文件"按钮
   - 或者直接拖拽文件到窗口

2. 添加过滤条件：
   - 点击"添加过滤器"按钮
   - 选择过滤类型：文本/正则/行号
   - 输入过滤条件
   - 可选择是否高亮显示

3. 查看过滤结果：
   - 过滤后的内容会显示在右侧编辑器中
   - 双击过滤结果中的任意行可跳转到原始日志中的对应位置

4. 保存/加载过滤器配置：
   - 点击"保存配置"将当前过滤器设置保存为JSON文件
   - 点击"加载配置"使用之前保存的过滤器设置

## 🔧 开发指南

### 环境要求

- Node.js 14+
- npm 6+
- Windows 7/8/10/11

### 本地开发

1. 克隆仓库：
```bash
git clone https://github.com/yourusername/LogAnalyzer.git
cd LogAnalyzer
```

2. 安装依赖：
```bash
npm install
```

3. 启动应用：
```bash
npm start
```

4. 打包应用：
```bash
npm run build-portable
```

### 项目结构

```
LogAnalyzer/
├── main.js              # Electron主进程
├── preload.js          # 预加载脚本
├── index.html          # 主界面
├── package.json        # 项目配置
└── web/               # 产品展示网站
    ├── index.html     # 网站主页
    ├── css/          # 样式文件
    └── videos/       # 演示视频
```

## 📝 使用技巧

1. **大文件处理**：
   - 禁用了自动换行功能以提升性能
   - 使用行号过滤可以快速定位特定区域

2. **过滤器组合**：
   - 可以添加多个过滤条件
   - 支持包含和排除规则
   - 使用正则表达式实现复杂匹配

3. **快捷键**：
   - `F11`: 切换全屏模式
   - `Ctrl+F`: 在当前编辑器中搜索
   - `Esc`: 退出全屏模式

## 🤝 贡献

欢迎提交问题和改进建议！具体步骤：

1. Fork 项目
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 📄 许可证

本项目采用 ISC 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 鸣谢

- [Electron](https://www.electronjs.org/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Node.js](https://nodejs.org/)
