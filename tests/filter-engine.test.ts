import { applyFilters, parseLineNumbers } from '../src/shared/filter-engine';
import type { FilterPattern } from '../src/shared/types';

const sampleLines = [
  '[2025.01.01-10.00.00] INFO Application started',
  '[2025.01.01-10.00.01] ERROR Failed to connect',
  '[2025.01.01-10.00.02] WARNING Low memory',
  '[2025.01.01-10.00.03] INFO Processing request',
  '[2025.01.01-10.00.04] ERROR Timeout occurred',
  '[2025.01.01-10.00.05] DEBUG Verbose details here',
];

function makeFilter(overrides: Partial<FilterPattern>): FilterPattern {
  return {
    enabled: true,
    type: 'text',
    pattern: '',
    highlight: false,
    highlightColor: '',
    ...overrides,
  };
}

// ─── parseLineNumbers ─────────────────────────────────────────────────────────

describe('parseLineNumbers', () => {
  it('parses single number', () => {
    expect(parseLineNumbers('3')).toEqual([3]);
  });

  it('parses range', () => {
    expect(parseLineNumbers('1-3')).toEqual([1, 2, 3]);
  });

  it('parses mixed list and ranges', () => {
    expect(parseLineNumbers('1,3-5,7')).toEqual([1, 3, 4, 5, 7]);
  });

  it('returns empty for empty input', () => {
    expect(parseLineNumbers('')).toEqual([]);
    expect(parseLineNumbers('  ')).toEqual([]);
  });

  it('ignores invalid range where start > end', () => {
    expect(parseLineNumbers('5-3')).toEqual([]);
  });

  it('deduplicates numbers', () => {
    expect(parseLineNumbers('1,1,2')).toEqual([1, 2]);
  });

  it('handles multi-digit numbers', () => {
    expect(parseLineNumbers('10-12')).toEqual([10, 11, 12]);
  });

  it('handles single item list', () => {
    expect(parseLineNumbers('42')).toEqual([42]);
  });

  it('handles range with equal start and end', () => {
    expect(parseLineNumbers('5-5')).toEqual([5]);
  });

  it('ignores non-numeric tokens', () => {
    expect(parseLineNumbers('abc,1,2')).toEqual([1, 2]);
  });
});

// ─── applyFilters — no filters ────────────────────────────────────────────────

describe('applyFilters - no filters', () => {
  it('returns all lines when filter list is empty', () => {
    const result = applyFilters(sampleLines, []);
    expect(result.filteredLines).toEqual(sampleLines);
    expect(result.lineMapping).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns all lines when all filters are disabled', () => {
    const filter = makeFilter({ enabled: false, pattern: 'ERROR' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toEqual(sampleLines);
    expect(result.lineMapping).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('lineMapping has same length as filteredLines', () => {
    const result = applyFilters(sampleLines, []);
    expect(result.lineMapping).toHaveLength(result.filteredLines.length);
  });
});

// ─── applyFilters — text match ────────────────────────────────────────────────

describe('applyFilters - text match', () => {
  it('filters by text (case-insensitive)', () => {
    const filter = makeFilter({ type: 'text', pattern: 'error' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(2);
    expect(result.filteredLines[0]).toContain('ERROR Failed');
    expect(result.filteredLines[1]).toContain('ERROR Timeout');
  });

  it('builds correct lineMapping for text filter', () => {
    const filter = makeFilter({ type: 'text', pattern: 'ERROR' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.lineMapping).toEqual([1, 4]); // 0-based indices of ERROR lines
  });

  it('returns empty result for pattern that matches nothing', () => {
    const filter = makeFilter({ type: 'text', pattern: 'NONEXISTENT_PATTERN_XYZ' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(0);
    expect(result.lineMapping).toHaveLength(0);
  });

  it('matches on entire line content', () => {
    const filter = makeFilter({ type: 'text', pattern: 'Application started' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(1);
    expect(result.filteredLines[0]).toContain('Application started');
  });

  it('matching is case-insensitive for uppercase pattern', () => {
    const filter = makeFilter({ type: 'text', pattern: 'DEBUG' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(1);
    expect(result.filteredLines[0]).toContain('DEBUG');
  });
});

// ─── applyFilters — regex match ───────────────────────────────────────────────

describe('applyFilters - regex match', () => {
  it('filters by regex', () => {
    const filter = makeFilter({ type: 'regex', pattern: '\\bERROR\\b' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(2);
  });

  it('uses regex OR operator', () => {
    const filter = makeFilter({ type: 'regex', pattern: 'ERROR|WARNING' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(3); // 2 ERRORs + 1 WARNING
  });

  it('handles invalid regex gracefully without throwing', () => {
    const filter = makeFilter({ type: 'regex', pattern: '[invalid' });
    expect(() => applyFilters(sampleLines, [filter])).not.toThrow();
  });

  it('returns empty result for invalid regex', () => {
    const filter = makeFilter({ type: 'regex', pattern: '[invalid' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(0);
  });

  it('builds correct lineMapping for regex filter', () => {
    const filter = makeFilter({ type: 'regex', pattern: 'ERROR' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.lineMapping).toEqual([1, 4]);
  });

  it('regex is case-insensitive by default', () => {
    const filter = makeFilter({ type: 'regex', pattern: 'warning' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(1);
    expect(result.filteredLines[0]).toContain('WARNING');
  });
});

// ─── applyFilters — line number range ────────────────────────────────────────

describe('applyFilters - line number range', () => {
  it('filters by single line number', () => {
    const filter = makeFilter({ type: 'line', pattern: '2' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(1);
    expect(result.filteredLines[0]).toContain('ERROR Failed');
    expect(result.lineMapping).toEqual([1]); // 0-based: line 2 → index 1
  });

  it('filters by line range', () => {
    const filter = makeFilter({ type: 'line', pattern: '1-3' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(3);
    expect(result.lineMapping).toEqual([0, 1, 2]);
  });

  it('ignores out-of-range line numbers', () => {
    const filter = makeFilter({ type: 'line', pattern: '100-200' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(0);
  });

  it('line 1 maps to index 0', () => {
    const filter = makeFilter({ type: 'line', pattern: '1' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.lineMapping).toEqual([0]);
    expect(result.filteredLines[0]).toContain('Application started');
  });

  it('last valid line returns correctly', () => {
    const filter = makeFilter({ type: 'line', pattern: `${sampleLines.length}` });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(1);
    expect(result.filteredLines[0]).toContain('DEBUG Verbose');
  });

  it('line 0 is treated as out of range', () => {
    const filter = makeFilter({ type: 'line', pattern: '0' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(0);
  });
});

// ─── applyFilters — exclude-text ─────────────────────────────────────────────

describe('applyFilters - exclude-text', () => {
  it('excludes matching lines from all lines', () => {
    const filter = makeFilter({ type: 'exclude-text', pattern: 'ERROR' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).not.toContainEqual(expect.stringContaining('ERROR'));
    expect(result.filteredLines).toHaveLength(4);
  });

  it('exclude is case-insensitive', () => {
    const filter = makeFilter({ type: 'exclude-text', pattern: 'error' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(4);
  });

  it('exclude with include: removes matching lines from include result', () => {
    const includeFilter = makeFilter({ type: 'regex', pattern: 'ERROR|WARNING' });
    const excludeFilter = makeFilter({ type: 'exclude-text', pattern: 'Timeout' });
    const result = applyFilters(sampleLines, [includeFilter, excludeFilter]);
    // Should have WARNING + "ERROR Failed" but NOT "ERROR Timeout"
    expect(result.filteredLines).not.toContainEqual(expect.stringContaining('Timeout'));
    expect(result.filteredLines).toHaveLength(2); // WARNING + ERROR Failed
  });

  it('excludes nothing when pattern does not match', () => {
    const filter = makeFilter({ type: 'exclude-text', pattern: 'IMPOSSIBLE_XYZ_ABC' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.filteredLines).toHaveLength(sampleLines.length);
  });

  it('lineMapping excludes filtered-out indices', () => {
    const filter = makeFilter({ type: 'exclude-text', pattern: 'ERROR' });
    const result = applyFilters(sampleLines, [filter]);
    expect(result.lineMapping).not.toContain(1); // index 1 = ERROR Failed
    expect(result.lineMapping).not.toContain(4); // index 4 = ERROR Timeout
  });
});

// ─── applyFilters — multiple / combined filters ───────────────────────────────

describe('applyFilters - multiple filters combined', () => {
  it('combines multiple include filters with OR logic', () => {
    const f1 = makeFilter({ type: 'text', pattern: 'ERROR' });
    const f2 = makeFilter({ type: 'text', pattern: 'WARNING' });
    const result = applyFilters(sampleLines, [f1, f2]);
    expect(result.filteredLines).toHaveLength(3); // 2 ERRORs + 1 WARNING
  });

  it('disabled filter does not contribute', () => {
    const active = makeFilter({ type: 'text', pattern: 'ERROR' });
    const inactive = makeFilter({ enabled: false, type: 'text', pattern: 'WARNING' });
    const result = applyFilters(sampleLines, [active, inactive]);
    expect(result.filteredLines).toHaveLength(2); // only ERROR lines
  });

  it('lineMapping is sorted ascending', () => {
    const f1 = makeFilter({ type: 'text', pattern: 'ERROR' });
    const f2 = makeFilter({ type: 'text', pattern: 'INFO' });
    const result = applyFilters(sampleLines, [f1, f2]);
    const mapping = result.lineMapping;
    for (let i = 1; i < mapping.length; i++) {
      expect(mapping[i]).toBeGreaterThan(mapping[i - 1]);
    }
  });

  it('filteredLines length matches lineMapping length', () => {
    const f1 = makeFilter({ type: 'text', pattern: 'ERROR' });
    const f2 = makeFilter({ type: 'exclude-text', pattern: 'Timeout' });
    const result = applyFilters(sampleLines, [f1, f2]);
    expect(result.filteredLines).toHaveLength(result.lineMapping.length);
  });

  it('include + exclude returns correct set', () => {
    const includeAll = makeFilter({ type: 'text', pattern: 'INFO' });
    const excludeSome = makeFilter({ type: 'exclude-text', pattern: 'Processing' });
    const result = applyFilters(sampleLines, [includeAll, excludeSome]);
    // INFO lines: index 0 (Application started), index 3 (Processing request)
    // After exclude "Processing": only index 0 remains
    expect(result.filteredLines).toHaveLength(1);
    expect(result.filteredLines[0]).toContain('Application started');
  });
});

// ─── applyFilters — edge cases ────────────────────────────────────────────────

describe('applyFilters - edge cases', () => {
  it('handles empty source lines', () => {
    const filter = makeFilter({ type: 'text', pattern: 'ERROR' });
    const result = applyFilters([], [filter]);
    expect(result.filteredLines).toHaveLength(0);
    expect(result.lineMapping).toHaveLength(0);
  });

  it('handles filter with empty pattern', () => {
    const filter = makeFilter({ type: 'text', pattern: '' });
    const result = applyFilters(sampleLines, [filter]);
    // Empty pattern → no lines match → empty result
    expect(result.filteredLines).toHaveLength(0);
  });

  it('each filteredLine corresponds to the correct source line via lineMapping', () => {
    const filter = makeFilter({ type: 'regex', pattern: 'ERROR|DEBUG' });
    const result = applyFilters(sampleLines, [filter]);
    result.lineMapping.forEach((srcIdx, i) => {
      expect(result.filteredLines[i]).toBe(sampleLines[srcIdx]);
    });
  });
});
