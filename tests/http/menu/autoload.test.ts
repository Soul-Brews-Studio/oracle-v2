import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMenuItemsFromDir } from '../../../src/menu/index.ts';
import type { MenuItem } from '../../../src/routes/menu/model.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'menu-autoload-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeTs(name: string, items: MenuItem[]) {
  writeFileSync(
    join(dir, name),
    `export default ${JSON.stringify(items, null, 2)};\n`,
  );
}

function writeJson(name: string, items: MenuItem[]) {
  writeFileSync(join(dir, name), JSON.stringify(items, null, 2));
}

describe('loadMenuItemsFromDir', () => {
  test('concatenates default exports from multiple .ts files + one .json in sorted order', async () => {
    writeTs('10-pages.ts', [
      { path: '/canvas', label: 'Canvas', group: 'tools', order: 80, source: 'page' },
      { path: '/map', label: 'Map', group: 'tools', order: 82, source: 'page' },
    ]);
    writeTs('20-extras.ts', [
      { path: '/planets', label: 'Planets', group: 'tools', order: 81, source: 'page' },
    ]);
    writeJson('30-json.json', [
      { path: '/settings', label: 'Settings', group: 'hidden', order: 99, source: 'page' },
    ]);

    const items = await loadMenuItemsFromDir(dir);

    expect(items.map((i) => i.path)).toEqual([
      '/canvas',
      '/map',
      '/planets',
      '/settings',
    ]);
  });

  test('later file wins when the same path appears in multiple files (.json overrides .ts)', async () => {
    writeTs('10-a.ts', [
      { path: '/canvas', label: 'FromTs', group: 'tools', order: 1, source: 'page' },
    ]);
    writeJson('20-b.json', [
      { path: '/canvas', label: 'FromJson', group: 'main', order: 99, source: 'page' },
    ]);

    const items = await loadMenuItemsFromDir(dir);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      path: '/canvas',
      label: 'FromJson',
      group: 'main',
      order: 99,
    });
  });

  test('falls back to bundled defaults when directory is missing', async () => {
    const missing = join(dir, 'does-not-exist');
    const items = await loadMenuItemsFromDir(missing);

    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.path === '/canvas')).toBe(true);
  });

  test('ignores non-.ts / non-.json files', async () => {
    writeTs('10-ok.ts', [
      { path: '/canvas', label: 'Canvas', group: 'tools', order: 80, source: 'page' },
    ]);
    writeFileSync(join(dir, 'README.md'), '# not a menu file');
    writeFileSync(join(dir, 'notes.txt'), 'ignore me');
    mkdirSync(join(dir, 'subdir'));

    const items = await loadMenuItemsFromDir(dir);

    expect(items).toHaveLength(1);
    expect(items[0].path).toBe('/canvas');
  });

  test('skips files whose export is not an array', async () => {
    writeFileSync(
      join(dir, '10-bad.ts'),
      `export default { not: 'an array' };\n`,
    );
    writeTs('20-good.ts', [
      { path: '/canvas', label: 'Canvas', group: 'tools', order: 80, source: 'page' },
    ]);

    const items = await loadMenuItemsFromDir(dir);

    expect(items).toHaveLength(1);
    expect(items[0].path).toBe('/canvas');
  });
});
