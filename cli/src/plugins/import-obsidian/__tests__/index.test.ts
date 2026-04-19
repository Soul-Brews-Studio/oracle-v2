import { describe, expect, test } from 'bun:test';
import { parseArgs } from '../index.ts';

describe('parseArgs', () => {
  test('requires --in', () => {
    expect(() => parseArgs([])).toThrow(/--in/);
  });

  test('defaults', () => {
    const o = parseArgs(['--in', '/tmp/v']);
    expect(o.in).toBe('/tmp/v');
    expect(o.dryRun).toBe(false);
    expect(o.onlyChanged).toBe(true);
    expect(o.createNew).toBe(false);
    expect(o.deleteMissing).toBe(false);
    expect(o.verbose).toBe(false);
    expect(o.types).toBeNull();
  });

  test('flags parse', () => {
    const o = parseArgs([
      '--in', '/tmp/v',
      '--dry-run',
      '--all',
      '--create-new',
      '--delete-missing',
      '--verbose',
      '--types', 'principle,learning',
    ]);
    expect(o.dryRun).toBe(true);
    expect(o.onlyChanged).toBe(false);
    expect(o.createNew).toBe(true);
    expect(o.deleteMissing).toBe(true);
    expect(o.verbose).toBe(true);
    expect(o.types).toEqual(['principle', 'learning']);
  });
});
