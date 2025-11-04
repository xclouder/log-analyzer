# 拖放文件功能测试指南

## 问题描述
拖放大文件时出现错误：
```
Error: The "path" argument must be of type string or an instance of Buffer or URL. Received null
```

## 修复内容

### 1. `index.html` - 拖放事件处理
- ✅ 添加文件路径验证（第 673-698 行）
- ✅ 在调用 `checkAndOpenFile` 前检查 `file.path` 是否存在
- ✅ 如果路径为空，显示友好的错误提示

### 2. `index.html` - `checkAndOpenFile` 函数
- ✅ 添加文件路径参数验证（第 1626-1632 行）
- ✅ 如果路径为空，抛出明确的错误

### 3. `index.html` - `confirmReadLargeFile` 函数
- ✅ 添加 `pendingLargeFilePath` 空值检查（第 1596-1602 行）
- ✅ 添加调试日志输出
- ✅ 在关闭对话框前保存文件路径到局部变量

### 4. `index.html` - `showLargeFileDialog` 函数
- ✅ 添加文件路径验证和调试日志（第 1573-1583 行）
- ✅ 如果路径无效，提前返回并提示用户

### 5. `main.js` - IPC 处理器
- ✅ `file:stats` 添加路径验证（第 182-189 行）
- ✅ `file:read-by-timestamp` 添加路径验证（第 191-198 行）

## 测试步骤

### 测试 1：拖放小文件（< 200MB）
1. 启动应用
2. 拖放一个小于 200MB 的日志文件到编辑器区域
3. **预期结果**：文件正常打开，内容显示在编辑器中

### 测试 2：拖放大文件（> 200MB）
1. 启动应用
2. 拖放一个大于 200MB 的日志文件到编辑器区域
3. **预期结果**：
   - 显示确认对话框询问是否使用高级读取模式
   - 点击"确定"后显示大文件读取对话框
   - 对话框中可以输入时间戳和读取大小
   - 点击"读取"按钮后正常读取文件

### 测试 3：使用时间戳读取
1. 拖放大文件并选择高级读取模式
2. 在时间戳输入框中输入：`11.04-16.22`（UE 格式）
3. 设置读取大小：100MB
4. 点击"读取"
5. **预期结果**：
   - 控制台输出：`Reading file: <文件路径>`
   - 成功读取从指定时间戳开始的 100MB 内容
   - 显示读取信息（起始行、总行数等）

### 测试 4：错误处理
1. 尝试拖放一个无效的文件（如果可能）
2. **预期结果**：显示友好的错误提示

## 调试方法

### 查看控制台日志
按 `F12` 或 `Ctrl+Shift+I` 打开开发者工具，查看：

```javascript
// 拖放文件时
Dropped file: File { name: "xxx.log", path: "E:\\...", ... }

// 打开大文件对话框时
showLargeFileDialog called with: E:\code\DevLogs\...
Large file dialog opened for: E:\code\DevLogs\...

// 确认读取时
Reading file: E:\code\DevLogs\...
正在读取文件 (从时间戳: 11.04-16.22)...
```

### 检查主进程日志
位置：`%APPDATA%\LogAnalyzer\logs\main.log`

查找相关错误：
```
Error reading file by timestamp: ...
```

## 已知问题和解决方案

### 问题：file.path 为 null
**原因**：在某些情况下，浏览器安全限制可能导致 `File.path` 属性不可用

**解决方案**：
- 已添加路径验证
- 如果路径为空，提示用户使用"打开文件"菜单

### 问题：pendingLargeFilePath 丢失
**原因**：在对话框关闭时被设置为 null

**解决方案**：
- 在 `confirmReadLargeFile` 中，先保存到局部变量再关闭对话框
- 添加空值检查和友好的错误提示

## 构建和测试

```bash
# 开发模式测试
npm start

# 构建并测试
npm run build
.\debug.bat

# 或使用 F12 调试
# 在构建后的应用中按 F12 打开开发者工具
```

## 回归测试清单

- [ ] 拖放小文件正常打开
- [ ] 拖放大文件显示高级读取对话框
- [ ] 使用时间戳读取功能正常
- [ ] 不输入时间戳，直接读取文件开头
- [ ] 错误提示友好且准确
- [ ] 控制台日志输出正确
- [ ] 取消对话框不会导致错误
