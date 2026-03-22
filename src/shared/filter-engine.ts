import type { FilterPattern } from './types';

export interface FilterResult {
  filteredLines: string[];
  lineMapping: number[]; // maps filtered line index (0-based) → source line index (0-based)
}

/**
 * Apply filter patterns to source lines.
 * Returns the matched/filtered lines and the line index mapping.
 */
export function applyFilters(sourceLines: string[], patterns: FilterPattern[]): FilterResult {
  const activeFilters = patterns.filter((f) => f.enabled);
  const includeFilters = activeFilters.filter((f) => f.type !== 'exclude-text');
  const excludeFilters = activeFilters.filter((f) => f.type === 'exclude-text');

  // No active filters: return all lines
  if (activeFilters.length === 0) {
    return {
      filteredLines: [...sourceLines],
      lineMapping: sourceLines.map((_, i) => i),
    };
  }

  const matchedIndices = new Set<number>();

  // Apply include-type filters
  if (includeFilters.length > 0) {
    includeFilters.forEach((filter) => {
      if (!filter.pattern) return;
      try {
        if (filter.type === 'text') {
          const lp = filter.pattern.toLowerCase();
          sourceLines.forEach((line, i) => {
            if (line.toLowerCase().includes(lp)) matchedIndices.add(i);
          });
        } else if (filter.type === 'regex') {
          const re = new RegExp(filter.pattern, 'i');
          sourceLines.forEach((line, i) => {
            if (re.test(line)) matchedIndices.add(i);
          });
        } else if (filter.type === 'line') {
          parseLineNumbers(filter.pattern).forEach((n) => {
            if (n > 0 && n <= sourceLines.length) matchedIndices.add(n - 1);
          });
        }
      } catch {
        // invalid regex - skip this filter
      }
    });
  } else {
    // Only exclude filters active: start with all lines
    sourceLines.forEach((_, i) => matchedIndices.add(i));
  }

  // Apply exclude filters
  excludeFilters.forEach((filter) => {
    if (!filter.pattern) return;
    const lp = filter.pattern.toLowerCase();
    Array.from(matchedIndices).forEach((i) => {
      if (sourceLines[i].toLowerCase().includes(lp)) matchedIndices.delete(i);
    });
  });

  const sortedIndices = Array.from(matchedIndices).sort((a, b) => a - b);
  return {
    filteredLines: sortedIndices.map((i) => sourceLines[i]),
    lineMapping: sortedIndices,
  };
}

export function parseLineNumbers(input: string): number[] {
  if (!input.trim()) return [];
  const nums = new Set<number>();
  input
    .split(',')
    .map((p) => p.trim())
    .forEach((part) => {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) {
        const start = parseInt(range[1]);
        const end = parseInt(range[2]);
        if (start <= end) for (let i = start; i <= end; i++) nums.add(i);
      } else if (/^\d+$/.test(part)) {
        nums.add(parseInt(part));
      }
    });
  return Array.from(nums).sort((a, b) => a - b);
}
