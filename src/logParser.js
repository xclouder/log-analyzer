class LogLine {
    constructor(rawText) {
        this.raw = rawText;
        this.timestamp = null;
        this.content = '';
        this.level = null;
        this.parse();
    }

    parse() {
        console.log('Parsing line:', this.raw);
        
        // 尝试匹配常见的日志格式
        const patterns = [
            // 2023-07-20 10:30:45 [INFO] Message
            /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*\[([^\]]+)\]\s*(.*)$/,
            // 2023-07-20 10:30:45.123 INFO Message
            /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(\w+)\s+(.*)$/,
            // [2023-07-20T10:30:45] INFO Message
            /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s*(\w+)\s+(.*)$/,
            // INFO 2023-07-20 10:30:45: Message
            /^(\w+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?):\s*(.*)$/,
            // 简单格式：INFO: Message
            /^(INFO|ERROR|WARN|DEBUG):\s*(.*)$/i,
            // 简单格式：[INFO] Message
            /^\[(INFO|ERROR|WARN|DEBUG)\]\s*(.*)$/i
        ];

        for (const pattern of patterns) {
            const match = this.raw.match(pattern);
            if (match) {
                console.log('Pattern matched:', pattern);
                console.log('Match groups:', match);
                
                // 处理简单格式
                if (pattern.toString().includes('(INFO|ERROR|WARN|DEBUG)')) {
                    this.level = match[1].toUpperCase();
                    this.content = match[2];
                    console.log('Parsed simple format - level:', this.level, 'content:', this.content);
                    return;
                }
                
                // 处理带时间戳的格式
                if (match[1].toUpperCase() === 'INFO' || match[1].toUpperCase() === 'ERROR' || 
                    match[1].toUpperCase() === 'WARN' || match[1].toUpperCase() === 'DEBUG') {
                    this.timestamp = new Date(match[2]);
                    this.level = match[1].toUpperCase();
                    this.content = match[3];
                } else {
                    this.timestamp = new Date(match[1]);
                    this.level = match[2].toUpperCase();
                    this.content = match[3];
                }
                
                console.log('Parsed result - timestamp:', this.timestamp, 'level:', this.level, 'content:', this.content);
                return;
            }
        }

        // 如果没有匹配到任何模式，将整行内容作为content
        this.content = this.raw;
        console.log('No pattern matched, using raw content');
        
        // 尝试识别日志级别
        const levelPatterns = /\b(INFO|ERROR|WARN|DEBUG)\b/i;
        const levelMatch = this.content.match(levelPatterns);
        if (levelMatch) {
            this.level = levelMatch[1].toUpperCase();
            console.log('Found log level in content:', this.level);
        }
    }

    toString() {
        return this.raw;
    }
}

class FilterConfig {
    constructor() {
        this.startTime = null;
        this.endTime = null;
        this.levels = new Set(); // ['INFO', 'ERROR', 'WARN', 'DEBUG', 'TRACE']
        this.contentPattern = null; // RegExp or string
        this.excludePattern = null; // RegExp or string
    }

    matches(logLine) {
        // 检查时间范围
        if (this.startTime && logLine.timestamp && logLine.timestamp < this.startTime) {
            return false;
        }
        if (this.endTime && logLine.timestamp && logLine.timestamp > this.endTime) {
            return false;
        }

        // 检查日志级别
        if (this.levels.size > 0 && (!logLine.level || !this.levels.has(logLine.level))) {
            return false;
        }

        // 检查内容匹配
        if (this.contentPattern) {
            if (this.contentPattern instanceof RegExp) {
                if (!this.contentPattern.test(logLine.raw)) {
                    return false;
                }
            } else if (!logLine.raw.includes(this.contentPattern)) {
                return false;
            }
        }

        // 检查内容排除
        if (this.excludePattern) {
            if (this.excludePattern instanceof RegExp) {
                if (this.excludePattern.test(logLine.raw)) {
                    return false;
                }
            } else if (logLine.raw.includes(this.excludePattern)) {
                return false;
            }
        }

        return true;
    }
}

function filterLogs(logContent, filterConfig) {
    const lines = logContent.split('\n');
    const logLines = lines.map(line => new LogLine(line));
    return logLines.filter(line => filterConfig.matches(line));
}

module.exports = {
    LogLine,
    FilterConfig,
    filterLogs
};
