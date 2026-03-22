import * as fs from 'fs';
import * as path from 'path';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import type { LargeFileReadResult } from '../shared/types';

// ─── Timestamp patterns ───────────────────────────────────────────────────────

/** UE log format: [2025.11.04-19.19.39:123] */
const RE_UE = /\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}(?::\d{1,3})?/;
/** ISO 8601: 2024-01-15T10:30:45.123Z */
const RE_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/;
/** Standard datetime: 2024-01-15 10:30:45 */
const RE_STD = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
/** Slash-separated: 2024/01/15 10:30:45 */
const RE_SLASH = /\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/;

const TIMESTAMP_PATTERNS = [RE_UE, RE_ISO, RE_STD, RE_SLASH];

/**
 * Extract the first recognisable timestamp string from a log line.
 * Returns null if none is found.
 */
export function extractTimestamp(line: string): string | null {
  for (const re of TIMESTAMP_PATTERNS) {
    const m = line.match(re);
    if (m) return m[0];
  }
  return null;
}

// ─── Timestamp normalisation ──────────────────────────────────────────────────

/**
 * Accept a possibly-abbreviated UE-style timestamp entered by the user and
 * normalise it to a full `YYYY.MM.DD-HH.mm.ss` string.
 *
 * Supported shorthand forms:
 *   MM.DD-HH.mm        → <currentYear>.MM.DD-HH.mm.00
 *   MM.DD-HH.mm.ss     → <currentYear>.MM.DD-HH.mm.ss
 *   YYYY.MM.DD-HH.mm.ss → returned as-is
 *
 * Returns null for blank input.
 */
export function normalizeUserTimestamp(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already fully qualified: YYYY.MM.DD-HH.mm.ss (with optional :ms)
  if (/^\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}/.test(trimmed)) {
    return trimmed;
  }

  const year = new Date().getFullYear();

  // MM.DD-HH.mm.ss
  const mFull = trimmed.match(/^(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/);
  if (mFull) {
    const [, mo, dd, hh, mm, ss] = mFull;
    return `${year}.${mo}.${dd}-${hh}.${mm}.${ss}`;
  }

  // MM.DD-HH.mm
  const mShort = trimmed.match(/^(\d{2})\.(\d{2})-(\d{2})\.(\d{2})$/);
  if (mShort) {
    const [, mo, dd, hh, mm] = mShort;
    return `${year}.${mo}.${dd}-${hh}.${mm}.00`;
  }

  // Anything else: return as-is and let parseTimestamp figure it out
  return trimmed;
}

// ─── Timestamp parsing ────────────────────────────────────────────────────────

/**
 * Parse a timestamp string into a Date object.
 * Handles UE format, ISO 8601, standard datetime, and slash-separated.
 * Returns null if the string cannot be parsed.
 */
export function parseTimestamp(ts: string): Date | null {
  if (!ts) return null;

  // UE: YYYY.MM.DD-HH.mm.ss[:SSS]
  const ueMatch = ts.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})(?::(\d{1,3}))?/);
  if (ueMatch) {
    const [, y, mo, dd, hh, mm, ss, ms] = ueMatch;
    const d = new Date(
      parseInt(y),
      parseInt(mo) - 1,
      parseInt(dd),
      parseInt(hh),
      parseInt(mm),
      parseInt(ss),
      ms ? parseInt(ms) : 0,
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO 8601 / standard / slash — delegate to Date.parse
  const parsed = Date.parse(ts.replace(/\//g, '-'));
  if (!isNaN(parsed)) return new Date(parsed);

  return null;
}

// ─── Encoding detection + read ────────────────────────────────────────────────

/**
 * Read an entire file, detecting its encoding automatically.
 * Handles UTF-8, GBK, GB2312, and other encodings via chardet + iconv-lite.
 */
export async function readFile(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  // Detect encoding from raw bytes
  const detected = chardet.detect(buffer);
  const encoding = (detected ?? 'utf-8') as string;

  // Normalise encoding label so iconv-lite can handle it
  const normalised = normaliseEncoding(encoding);

  if (iconv.encodingExists(normalised)) {
    return iconv.decode(buffer, normalised);
  }

  // Fallback: UTF-8
  return buffer.toString('utf8');
}

/** Map chardet labels → iconv-lite labels where they differ. */
function normaliseEncoding(enc: string): string {
  const lower = enc.toLowerCase();
  if (lower === 'gb2312' || lower === 'gb18030') return 'gbk';
  if (lower === 'windows-1252') return 'win1252';
  return lower;
}

// ─── Large-file binary-search read ───────────────────────────────────────────

const CHUNK_ALIGN_WINDOW = 512; // bytes to scan for a newline when aligning chunk boundary

/**
 * Read a portion of a (potentially very large) file, optionally seeking to a
 * specific timestamp using binary search on byte offsets.
 *
 * @param filePath   Absolute path to the log file.
 * @param timestamp  User-supplied timestamp string (or null to read from start).
 * @param sizeMB     Maximum megabytes to return in a single call.
 */
export async function readFileByTimestamp(
  filePath: string,
  timestamp: string | null,
  sizeMB: number,
): Promise<LargeFileReadResult> {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const maxBytes = sizeMB * 1024 * 1024;

  // ── Small file: read entirely ──────────────────────────────────────────────
  if (fileSize <= maxBytes) {
    const content = await readFile(filePath);
    const lines = content.split('\n');
    return {
      content,
      startLine: 1,
      totalLines: lines.length,
      fileSize,
      readSize: fileSize,
      foundTimestamp: false,
      readPosition: 0,
    };
  }

  // ── Large file path ────────────────────────────────────────────────────────
  let readPosition = 0;
  let foundTimestamp = false;

  if (timestamp) {
    const normalised = normalizeUserTimestamp(timestamp);
    const target = normalised ? parseTimestamp(normalised) : null;
    if (target) {
      readPosition = await binarySearchTimestamp(filePath, fileSize, target);
      if (readPosition > 0) foundTimestamp = true;
    }
  }

  // Align readPosition to a raw-byte newline boundary BEFORE decoding to avoid
  // splitting multi-byte (e.g., GBK) characters mid-sequence.
  readPosition = alignToNewline(filePath, readPosition, CHUNK_ALIGN_WINDOW);

  // Read a chunk of raw bytes
  const bytesToRead = Math.min(maxBytes, fileSize - readPosition);
  const fd = fs.openSync(filePath, 'r');
  const rawChunk = Buffer.alloc(bytesToRead);
  fs.readSync(fd, rawChunk, 0, bytesToRead, readPosition);
  fs.closeSync(fd);

  // Detect encoding from the chunk (fall back to whole-file detection for tiny chunks)
  const detectedEnc = chardet.detect(rawChunk) ?? 'utf-8';
  const enc = normaliseEncoding(detectedEnc as string);
  const content = iconv.encodingExists(enc)
    ? iconv.decode(rawChunk, enc)
    : rawChunk.toString('utf8');

  const lines = content.split('\n');

  // Estimate startLine using the byte offset ratio
  const startLine = Math.max(1, Math.round((readPosition / fileSize) * estimateTotalLines(filePath)) + 1);

  return {
    content,
    startLine,
    totalLines: lines.length,
    fileSize,
    readSize: bytesToRead,
    foundTimestamp,
    readPosition,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Binary-search the file for the byte position of the first line whose
 * timestamp is >= `target`. Returns 0 if nothing is found.
 */
async function binarySearchTimestamp(
  filePath: string,
  fileSize: number,
  target: Date,
): Promise<number> {
  const fd = fs.openSync(filePath, 'r');
  const probeBuf = Buffer.alloc(512);

  let lo = 0;
  let hi = fileSize;
  let best = 0;

  try {
    for (let iter = 0; iter < 40 && lo < hi; iter++) {
      const mid = Math.floor((lo + hi) / 2);
      // Seek to mid and find the next complete line
      const lineStart = alignToNewline(filePath, mid, 512);
      fs.readSync(fd, probeBuf, 0, 512, lineStart);
      const lineSnippet = probeBuf.toString('utf8').split('\n')[0];

      const ts = extractTimestamp(lineSnippet);
      if (!ts) {
        hi = mid - 1;
        continue;
      }
      const lineDate = parseTimestamp(ts);
      if (!lineDate) {
        hi = mid - 1;
        continue;
      }

      if (lineDate < target) {
        lo = lineStart + 1;
        best = lineStart;
      } else {
        best = lineStart;
        hi = mid - 1;
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  return best;
}

/**
 * Walk backwards from `offset` to find the start of the next complete line
 * (i.e., the byte after the preceding `\n`). This prevents decoding a chunk
 * that starts in the middle of a multi-byte UTF-8 or GBK sequence.
 *
 * If `offset` is 0, returns 0.
 */
function alignToNewline(filePath: string, offset: number, windowSize: number): number {
  if (offset === 0) return 0;

  const start = Math.max(0, offset - windowSize);
  const len = offset - start;
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, len, start);
  } finally {
    fs.closeSync(fd);
  }

  // Find last \n in window
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i] === 0x0a /* \n */) {
      return start + i + 1;
    }
  }
  return offset; // No newline found, use original offset
}

/** Cheap total-line estimate by reading a small sample and extrapolating. */
function estimateTotalLines(filePath: string): number {
  const stats = fs.statSync(filePath);
  const sampleSize = Math.min(65536, stats.size);
  const buf = Buffer.alloc(sampleSize);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, sampleSize, 0);
  } finally {
    fs.closeSync(fd);
  }
  const sample = buf.toString('utf8');
  const linesInSample = (sample.match(/\n/g) || []).length;
  if (sampleSize === stats.size) return linesInSample;
  return Math.round((linesInSample / sampleSize) * stats.size);
}
