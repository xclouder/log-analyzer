const path = require('path');
const fs = require('fs');
const { PluginBase } = require('loganalyzer-plugin-sdk');

// ── Log Analyze Skill (system prompt for the LLM) ────────────────────────────

const LOG_ANALYZE_SKILL = `你是一个资深的引擎开发工程师和日志分析专家。你的任务是分析用户提供的日志片段，找出异常原因并给出修复建议。

## 分析流程

1. **识别异常类型**：首先判断日志中的异常属于哪种类型：
   - Crash（崩溃）：段错误、空指针、断言失败
   - Error（错误）：逻辑错误、资源加载失败、网络异常
   - Warning（警告）：潜在问题、性能问题、弃用警告
   - Exception（异常）：未捕获异常、堆栈溢出

2. **提取关键信息**：
   - 错误消息和错误码
   - 调用栈（Call Stack）中的关键帧
   - 涉及的类名、函数名、文件名和行号
   - 时间戳和线程信息
   - 相关的上下文日志（前后文）

3. **结合源码分析**（如果提供了源码信息）：
   - 根据调用栈中的文件路径和行号定位源码
   - 分析该位置的代码逻辑
   - 检查是否存在常见的 Bug 模式（空指针、数组越界、资源泄漏等）
   - 追溯调用链，找出根因

4. **给出诊断报告**：
   - **异常摘要**：一句话描述问题
   - **根因分析**：详细的原因分析
   - **涉及的源码位置**：列出相关文件和行号
   - **修复建议**：具体的修复方案和代码示例
   - **预防措施**：如何避免类似问题

## 输出格式

请使用 Markdown 格式输出，结构清晰，重要信息加粗。代码示例使用代码块。

## 注意事项

- 如果是 Unreal Engine 相关日志，请结合 UE 的架构特点分析
- 如果涉及多线程问题，注意分析线程安全性
- 如果是资源加载问题，检查资源路径和依赖关系
- 对于性能相关的日志，给出优化建议`;

class AnalyzeLogExceptionPlugin extends PluginBase {
    constructor(api) {
        super(api);
    }

    async onActivate(context) {
        // Register command for command palette
        this.api.registerCommand(context, 'loganalyzer.analyzeLogException', () => this.analyzeSelectedLog());

        // Register editor right-click context menu
        this.api.registerEditorContextMenu(
            context,
            'analyzeLogException',
            '🔍 AI 分析日志异常',
            (selectedText) => this.analyzeLogText(selectedText),
        );
    }

    /**
     * Entry point from command palette — gets selected text from editor.
     */
    async analyzeSelectedLog() {
        const selectedText = await this.api.getSelectedText();
        if (!selectedText || !selectedText.trim()) {
            await this.api.showErrorMessage('请先在编辑器中选中要分析的日志片段', { modal: false });
            return;
        }
        await this.analyzeLogText(selectedText);
    }

    /**
     * Core analysis: build prompt with source context, call LLM, show result.
     */
    async analyzeLogText(logText) {
        if (!logText || !logText.trim()) {
            await this.api.showErrorMessage('选中的日志内容为空', { modal: false });
            return;
        }

        const config = this.api.getConfiguration('analyzeLogException');
        const apiKey = config.get('apiKey', '');
        const apiBaseUrl = config.get('apiBaseUrl', 'http://v2.open.venus.oa.com/llmproxy');
        const model = config.get('model', 'qwen-14b-chat');

        if (!apiKey) {
            await this.api.showErrorMessage(
                'LLM API Key 未配置。请在 Settings (Ctrl+,) → 日志异常分析 中配置 API Key。',
                { modal: true },
            );
            return;
        }

        // Gather source code context if configured
        const sourceContext = await this.gatherSourceContext(logText, config);

        // Build the user message
        const userMessage = this.buildUserMessage(logText, sourceContext);

        // Show a "thinking" editor window
        const resultWindow = this.api.createEditorWindow({
            title: '🔍 日志异常分析结果',
            width: 1000,
            height: 700,
            textContent: '⏳ 正在分析日志异常，请稍候...\n\n（正在调用 LLM 进行智能分析）',
        });

        try {
            const result = await this.callLLM(apiBaseUrl, apiKey, model, userMessage, config);

            // Update the editor window with the result
            if (!resultWindow.isDestroyed()) {
                resultWindow.webContents.send('set-content', result);
                resultWindow.setTitle('✅ 日志异常分析结果');
            }
        } catch (error) {
            const errorMsg = `❌ LLM 调用失败\n\n错误: ${error.message}\n\n请检查:\n1. API Key 是否正确\n2. API Base URL 是否可访问: ${apiBaseUrl}\n3. 模型名称是否正确: ${model}`;
            if (!resultWindow.isDestroyed()) {
                resultWindow.webContents.send('set-content', errorMsg);
                resultWindow.setTitle('❌ 分析失败');
            }
        }
    }

    /**
     * Gather relevant source code snippets based on file paths and line numbers
     * found in the log text.
     */
    async gatherSourceContext(logText, config) {
        const sourceProjectDir = config.get('sourceProjectDir', '');
        const engineDir = config.get('engineDir', '');

        if (!sourceProjectDir && !engineDir) {
            return '';
        }

        // Extract file references from the log (common patterns)
        const fileRefs = this.extractFileReferences(logText);
        if (fileRefs.length === 0) {
            return '';
        }

        const contextLines = config.get('contextLines', 50);
        const snippets = [];

        for (const ref of fileRefs) {
            const content = this.tryReadSourceFile(ref.file, ref.line, contextLines, sourceProjectDir, engineDir);
            if (content) {
                snippets.push(content);
            }
            // Limit to avoid exceeding token limits
            if (snippets.length >= 5) break;
        }

        if (snippets.length === 0) {
            return '';
        }

        return '\n\n## 相关源码片段\n\n' + snippets.join('\n\n---\n\n');
    }

    /**
     * Extract file path + line number references from log text.
     * Supports common patterns like:
     *   - File.cpp:123
     *   - File.cpp(123)
     *   - at File.cpp line 123
     *   - [File: D:/Project/Source/File.cpp] [Line: 123]
     */
    extractFileReferences(logText) {
        const refs = [];
        const patterns = [
            // UE style: [File:xxx.cpp] [Line:123] or File.cpp(123)
            /\[File:\s*([^\]]+\.(?:cpp|h|c|cs|hpp|cc|cxx))\]\s*\[Line:\s*(\d+)\]/gi,
            // Standard: File.cpp:123
            /([A-Za-z0-9_./\\-]+\.(?:cpp|h|c|cs|hpp|cc|cxx)):(\d+)/gi,
            // Parentheses: File.cpp(123)
            /([A-Za-z0-9_./\\-]+\.(?:cpp|h|c|cs|hpp|cc|cxx))\((\d+)\)/gi,
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(logText)) !== null) {
                const file = match[1].trim();
                const line = parseInt(match[2], 10);
                // Avoid duplicates
                if (!refs.some(r => r.file === file && r.line === line)) {
                    refs.push({ file, line });
                }
            }
        }

        return refs;
    }

    /**
     * Try to read a source file snippet from project or engine directory.
     */
    tryReadSourceFile(fileName, lineNumber, contextLines, sourceProjectDir, engineDir) {
        // Try to find the file
        const candidates = [];

        if (sourceProjectDir) {
            candidates.push(...this.findFiles(sourceProjectDir, path.basename(fileName)));
        }
        if (engineDir) {
            candidates.push(...this.findFiles(engineDir, path.basename(fileName)));
        }

        // Also try the path as-is if it looks absolute
        if (path.isAbsolute(fileName) && fs.existsSync(fileName)) {
            candidates.unshift(fileName);
        }

        for (const filePath of candidates) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const startLine = Math.max(0, lineNumber - Math.floor(contextLines / 2));
                const endLine = Math.min(lines.length, lineNumber + Math.floor(contextLines / 2));
                const snippet = lines.slice(startLine, endLine)
                    .map((line, i) => {
                        const ln = startLine + i + 1;
                        const marker = ln === lineNumber ? ' >>>' : '    ';
                        return `${marker} ${ln}: ${line}`;
                    })
                    .join('\n');

                return `### 📄 ${filePath}\n(第 ${lineNumber} 行)\n\`\`\`cpp\n${snippet}\n\`\`\``;
            } catch {
                // File not readable, try next
            }
        }

        return null;
    }

    /**
     * Recursively search for a filename in a directory (limited depth).
     */
    findFiles(baseDir, targetName, maxDepth = 5) {
        const results = [];
        if (!baseDir || !fs.existsSync(baseDir)) return results;

        const search = (dir, depth) => {
            if (depth > maxDepth || results.length >= 3) return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (results.length >= 3) return;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isFile() && entry.name === targetName) {
                        results.push(fullPath);
                    } else if (entry.isDirectory() && !entry.name.startsWith('.') &&
                               entry.name !== 'node_modules' && entry.name !== 'Intermediate' &&
                               entry.name !== 'Binaries' && entry.name !== 'Saved') {
                        search(fullPath, depth + 1);
                    }
                }
            } catch {
                // Permission denied or other error
            }
        };

        search(baseDir, 0);
        return results;
    }

    /**
     * Build the user message for the LLM.
     */
    buildUserMessage(logText, sourceContext) {
        let message = `请分析以下日志中的异常/错误，给出详细的诊断报告：\n\n## 日志内容\n\n\`\`\`\n${logText}\n\`\`\``;

        if (sourceContext) {
            message += sourceContext;
        }

        const currentFile = this.api.getCurrentFilePath();
        if (currentFile) {
            message += `\n\n## 附加信息\n\n- 当前打开的日志文件: \`${currentFile}\``;
        }

        return message;
    }

    /**
     * Call the LLM API (OpenAI-compatible interface).
     */
    async callLLM(baseUrl, apiKey, model, userMessage, config) {
        const maxTokens = config.get('maxTokens', 4096);
        const temperature = config.get('temperature', 0.3);

        const url = baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';

        const requestBody = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: LOG_ANALYZE_SKILL },
                { role: 'user', content: userMessage },
            ],
            max_tokens: maxTokens,
            temperature,
            stream: false,
        });

        return new Promise((resolve, reject) => {
            const urlObj = new (require('url').URL)(url);
            const isHttps = urlObj.protocol === 'https:';
            const httpModule = isHttps ? require('https') : require('http');

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(requestBody),
                },
                timeout: 120000, // 2 minutes
            };

            const req = httpModule.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            return;
                        }
                        const json = JSON.parse(data);
                        if (json.error) {
                            reject(new Error(json.error.message || JSON.stringify(json.error)));
                            return;
                        }
                        const content = json.choices?.[0]?.message?.content;
                        if (!content) {
                            reject(new Error('LLM 返回内容为空'));
                            return;
                        }
                        resolve(content);
                    } catch (e) {
                        reject(new Error(`解析 LLM 响应失败: ${e.message}`));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`请求失败: ${err.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('LLM 请求超时 (120s)'));
            });

            req.write(requestBody);
            req.end();
        });
    }
}

module.exports = AnalyzeLogExceptionPlugin;
module.exports.default = AnalyzeLogExceptionPlugin;
