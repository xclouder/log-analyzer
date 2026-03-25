/**
 * example-ts-plugin — TypeScript 插件开发示例
 *
 * 这是一个用 TypeScript 编写的 LogAnalyzer 插件，展示了：
 * - 使用 loganalyzer-plugin-sdk 获得类型安全
 * - 命令注册
 * - 文件内容处理
 * - UI 对话框交互
 *
 * 开发流程：
 *   1. npm install
 *   2. 编辑 src/index.ts
 *   3. npm run build （编译 TS → JS 到 dist/）
 *   4. npx log-analyzer-plugin build （打包为 .zip）
 */

import * as path from 'path';
import * as fs from 'fs';
import type { PluginAPI, PluginContext } from 'loganalyzer-plugin-sdk';

// ── 辅助类型 ────────────────────────────────────────────────────────────────

interface LineStats {
  totalLines: number;
  emptyLines: number;
  longestLine: number;
  avgLength: number;
}

// ── 工厂函数 ────────────────────────────────────────────────────────────────

module.exports = function(pluginBasePath: string) {
  const Plugin = require(pluginBasePath);

  class ExampleTsPlugin extends Plugin {
    constructor(api: PluginAPI) {
      super(api);
    }

    // ── 生命周期 ──────────────────────────────────────────────────────────

    async onActivate(context: PluginContext): Promise<void> {
      // 注册命令：统计行信息
      this.api.registerCommand(
        context,
        'loganalyzer.tsExample.lineStats',
        () => this.showLineStats(),
      );

      // 注册命令：按关键词过滤
      this.api.registerCommand(
        context,
        'loganalyzer.tsExample.filterByKeyword',
        () => this.filterByKeyword(),
      );
    }

    // ── 命令实现 ──────────────────────────────────────────────────────────

    /**
     * 统计当前文件的行信息并显示给用户。
     */
    private async showLineStats(): Promise<void> {
      const filePath = this.api.getCurrentFilePath();
      if (!filePath) {
        await this.api.showErrorMessage('没有打开的文件');
        return;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const stats = this.calculateLineStats(content);

        await this.api.showInfoMessage(
          [
            `📊 文件: ${path.basename(filePath)}`,
            `总行数: ${stats.totalLines}`,
            `空行数: ${stats.emptyLines}`,
            `最长行: ${stats.longestLine} 字符`,
            `平均长度: ${stats.avgLength} 字符`,
          ].join('\n'),
        );
      } catch (err: any) {
        await this.api.showErrorMessage(`读取文件失败: ${err.message}`);
      }
    }

    /**
     * 让用户输入关键词，提取匹配的行并在新窗口中显示。
     */
    private async filterByKeyword(): Promise<void> {
      const filePath = this.api.getCurrentFilePath();
      if (!filePath) {
        await this.api.showErrorMessage('没有打开的文件');
        return;
      }

      const keyword = await this.api.showInputBox({
        title: '输入过滤关键词',
        placeholder: '例如: ERROR, WARN, Exception...',
      });

      if (!keyword) return;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const filteredLines = this.filterLines(content, keyword);

        if (filteredLines.length === 0) {
          await this.api.showInfoMessage(`未找到包含 "${keyword}" 的行`);
          return;
        }

        // 在新编辑器窗口中显示过滤结果
        const resultContent = [
          `// 过滤结果: "${keyword}" (共 ${filteredLines.length} 行)`,
          `// 源文件: ${filePath}`,
          '',
          ...filteredLines,
        ].join('\n');

        this.api.createEditorWindow({
          title: `过滤: ${keyword} — ${path.basename(filePath)}`,
          textContent: resultContent,
          width: 1000,
          height: 600,
        });
      } catch (err: any) {
        await this.api.showErrorMessage(`处理失败: ${err.message}`);
      }
    }

    // ── 工具方法（类型安全） ──────────────────────────────────────────────

    private calculateLineStats(content: string): LineStats {
      const lines = content.split('\n');
      const totalLines = lines.length;
      const emptyLines = lines.filter((line) => line.trim() === '').length;
      const longestLine = Math.max(...lines.map((line) => line.length));
      const totalLength = lines.reduce((sum, line) => sum + line.length, 0);
      const avgLength = totalLines > 0 ? Math.round(totalLength / totalLines) : 0;

      return { totalLines, emptyLines, longestLine, avgLength };
    }

    private filterLines(content: string, keyword: string): string[] {
      const lines = content.split('\n');
      const lowerKeyword = keyword.toLowerCase();

      return lines.filter((line) => line.toLowerCase().includes(lowerKeyword));
    }
  }

  return ExampleTsPlugin;
};
