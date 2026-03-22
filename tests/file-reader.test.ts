import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readFile,
  readFileByTimestamp,
  extractTimestamp,
  parseTimestamp,
  normalizeUserTimestamp,
} from '../src/main/file-reader';

// ─── Helper: create temp files ────────────────────────────────────────────────

function createTempFile(content: string, encoding: BufferEncoding = 'utf8'): string {
  const tmpFile = path.join(os.tmpdir(), `log-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
  fs.writeFileSync(tmpFile, content, encoding);
  return tmpFile;
}

function createTempBuffer(buf: Buffer): string {
  const tmpFile = path.join(os.tmpdir(), `log-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
  fs.writeFileSync(tmpFile, buf);
  return tmpFile;
}

// ─── extractTimestamp ─────────────────────────────────────────────────────────

describe('extractTimestamp', () => {
  it('extracts UE format timestamp', () => {
    const line = '[2025.11.04-19.19.39:123] LogTemp: Some message';
    expect(extractTimestamp(line)).toBe('2025.11.04-19.19.39:123');
  });

  it('extracts ISO 8601 timestamp', () => {
    const line = '2024-01-15T10:30:45.123Z INFO Something happened';
    expect(extractTimestamp(line)).toBe('2024-01-15T10:30:45.123Z');
  });

  it('extracts standard timestamp', () => {
    const line = '2024-01-15 10:30:45 [INFO] Something';
    expect(extractTimestamp(line)).toBe('2024-01-15 10:30:45');
  });

  it('extracts slash-separated timestamp', () => {
    const line = '2024/01/15 10:30:45 DEBUG msg';
    expect(extractTimestamp(line)).toBe('2024/01/15 10:30:45');
  });

  it('returns null when no timestamp found', () => {
    expect(extractTimestamp('No timestamp in this line')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTimestamp('')).toBeNull();
  });

  it('extracts UE timestamp without milliseconds', () => {
    const line = '[2024.06.01-08.00.00] LogCore: Boot';
    expect(extractTimestamp(line)).toBe('2024.06.01-08.00.00');
  });
});

// ─── normalizeUserTimestamp ───────────────────────────────────────────────────

describe('normalizeUserTimestamp', () => {
  it('normalizes UE shorthand MM.DD-HH.mm', () => {
    const result = normalizeUserTimestamp('11.04-19.19');
    const year = new Date().getFullYear();
    expect(result).toBe(`${year}.11.04-19.19.00`);
  });

  it('normalizes UE shorthand MM.DD-HH.mm.ss', () => {
    const result = normalizeUserTimestamp('11.04-19.19.39');
    const year = new Date().getFullYear();
    expect(result).toBe(`${year}.11.04-19.19.39`);
  });

  it('returns full timestamp unchanged', () => {
    expect(normalizeUserTimestamp('2025.11.04-19.19.39')).toBe('2025.11.04-19.19.39');
  });

  it('returns full timestamp with milliseconds unchanged', () => {
    expect(normalizeUserTimestamp('2025.11.04-19.19.39:123')).toBe('2025.11.04-19.19.39:123');
  });

  it('returns null for empty input', () => {
    expect(normalizeUserTimestamp('')).toBeNull();
    expect(normalizeUserTimestamp('   ')).toBeNull();
  });

  it('handles leading/trailing whitespace', () => {
    const result = normalizeUserTimestamp('  11.04-19.19  ');
    const year = new Date().getFullYear();
    expect(result).toBe(`${year}.11.04-19.19.00`);
  });
});

// ─── parseTimestamp ───────────────────────────────────────────────────────────

describe('parseTimestamp', () => {
  it('parses UE format', () => {
    const d = parseTimestamp('2025.11.04-19.19.39');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(10); // 0-based: November = 10
    expect(d!.getDate()).toBe(4);
    expect(d!.getHours()).toBe(19);
    expect(d!.getMinutes()).toBe(19);
    expect(d!.getSeconds()).toBe(39);
  });

  it('parses UE format with milliseconds', () => {
    const d = parseTimestamp('2025.11.04-19.19.39:123');
    expect(d).not.toBeNull();
    expect(d!.getMilliseconds()).toBe(123);
  });

  it('parses UE format with single-digit milliseconds', () => {
    const d = parseTimestamp('2025.11.04-19.19.39:5');
    expect(d).not.toBeNull();
    expect(d!.getMilliseconds()).toBe(5);
  });

  it('parses ISO 8601', () => {
    const d = parseTimestamp('2024-01-15T10:30:45.000Z');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2024);
  });

  it('parses standard datetime', () => {
    const d = parseTimestamp('2024-01-15 10:30:45');
    expect(d).not.toBeNull();
    expect(d).not.toBeNull();
  });

  it('parses slash-separated datetime', () => {
    const d = parseTimestamp('2024/01/15 10:30:45');
    expect(d).not.toBeNull();
  });

  it('returns null for invalid timestamp', () => {
    expect(parseTimestamp('not-a-timestamp')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });

  it('returns null for a clearly garbage string', () => {
    // Strings that contain no recognisable date information should return null
    expect(parseTimestamp('YEAR.MONTH.DAY-HH.MM.SS')).toBeNull();
  });
});

// ─── readFile ─────────────────────────────────────────────────────────────────

describe('readFile', () => {
  const createdFiles: string[] = [];

  function trackFile(p: string): string {
    createdFiles.push(p);
    return p;
  }

  afterEach(() => {
    while (createdFiles.length) {
      try { fs.unlinkSync(createdFiles.pop()!); } catch { /* ignore */ }
    }
  });

  it('reads UTF-8 file correctly', async () => {
    const content = 'Hello World\nLine 2\nLine 3';
    const tmpFile = trackFile(createTempFile(content));
    const result = await readFile(tmpFile);
    expect(result).toBe(content);
  });

  it('reads file with Chinese UTF-8 content', async () => {
    const content = '这是一行中文日志\n第二行内容\n[2025.01.01-12.00.00] 日志消息';
    const tmpFile = trackFile(createTempFile(content, 'utf8'));
    const result = await readFile(tmpFile);
    expect(result).toContain('这是一行中文日志');
    expect(result).toContain('第二行内容');
  });

  it('reads GBK-encoded file correctly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const iconv = require('iconv-lite') as typeof import('iconv-lite');
    const chineseText = '这是GBK编码的中文内容\n第二行\n第三行';
    const gbkBuffer = iconv.encode(chineseText, 'gbk');
    const tmpFile = trackFile(createTempBuffer(gbkBuffer));

    const result = await readFile(tmpFile);
    // Should contain Chinese characters, not mojibake
    expect(result).toContain('这是GBK编码的中文内容');
  });

  it('reads empty file as empty string', async () => {
    const tmpFile = trackFile(createTempFile(''));
    const result = await readFile(tmpFile);
    expect(result).toBe('');
  });

  it('reads ASCII log lines correctly', async () => {
    const content = '[2025.01.01-00.00.00] INFO Boot\n[2025.01.01-00.00.01] INFO Ready\n';
    const tmpFile = trackFile(createTempFile(content));
    const result = await readFile(tmpFile);
    expect(result).toContain('INFO Boot');
    expect(result).toContain('INFO Ready');
  });
});

// ─── readFileByTimestamp ──────────────────────────────────────────────────────

describe('readFileByTimestamp', () => {
  const createdFiles: string[] = [];

  function trackFile(p: string): string {
    createdFiles.push(p);
    return p;
  }

  afterEach(() => {
    while (createdFiles.length) {
      try { fs.unlinkSync(createdFiles.pop()!); } catch { /* ignore */ }
    }
  });

  it('reads small file entirely when under size limit', async () => {
    const lines = Array.from(
      { length: 100 },
      (_, i) => `[2025.01.01-${String(i % 24).padStart(2, '0')}.00.00] Line ${i}`,
    );
    const tmpFile = trackFile(createTempFile(lines.join('\n')));

    const result = await readFileByTimestamp(tmpFile, null, 100);
    expect(result.startLine).toBe(1);
    expect(result.foundTimestamp).toBe(false);
    expect(result.content).toContain('Line 0');
  });

  it('returns correct startLine as 1 for small file', async () => {
    const content = 'line1\nline2\nline3\nline4\nline5';
    const tmpFile = trackFile(createTempFile(content));

    const result = await readFileByTimestamp(tmpFile, null, 100);
    expect(result.startLine).toBe(1);
  });

  it('returns positive totalLines', async () => {
    const content = 'line1\nline2\nline3';
    const tmpFile = trackFile(createTempFile(content));

    const result = await readFileByTimestamp(tmpFile, null, 100);
    expect(result.totalLines).toBeGreaterThan(0);
  });

  it('includes correct fileSize in result', async () => {
    const content = 'Hello World\n';
    const tmpFile = trackFile(createTempFile(content));
    const stats = fs.statSync(tmpFile);

    const result = await readFileByTimestamp(tmpFile, null, 100);
    expect(result.fileSize).toBe(stats.size);
  });

  it('returns readPosition 0 for small file', async () => {
    const content = '[2025.01.01-10.00.00] INFO start';
    const tmpFile = trackFile(createTempFile(content));

    const result = await readFileByTimestamp(tmpFile, null, 100);
    expect(result.readPosition).toBe(0);
  });

  it('sets foundTimestamp false when no timestamp provided', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `[2025.01.01-10.${String(i).padStart(2,'0')}.00] msg ${i}`);
    const tmpFile = trackFile(createTempFile(lines.join('\n')));

    const result = await readFileByTimestamp(tmpFile, null, 100);
    expect(result.foundTimestamp).toBe(false);
  });

  it('content covers full file when reading small file', async () => {
    const firstLine = '[2025.01.01-08.00.00] INFO first';
    const lastLine  = '[2025.01.01-09.00.00] INFO last';
    const content = `${firstLine}\n${lastLine}`;
    const tmpFile = trackFile(createTempFile(content));

    const result = await readFileByTimestamp(tmpFile, null, 100);
    expect(result.content).toContain('INFO first');
    expect(result.content).toContain('INFO last');
  });
});
