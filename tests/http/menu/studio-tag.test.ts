import { describe, test, expect } from 'bun:test';
import { parseStudioTag } from '../../../src/routes/menu/studio-tag.ts';
import { studioHref } from '../../../src/routes/menu/studio-href.ts';

describe('studio:<domain> tag', () => {
  test('extracts domain from tag list', () => {
    const tags = ['foo', 'nav:main', 'studio:plugins.example.com'];
    expect(parseStudioTag(tags)).toBe('plugins.example.com');
  });

  test('returns null when no studio tag present', () => {
    expect(parseStudioTag(['nav:main', 'foo'])).toBeNull();
  });

  test('returns null for empty/missing tags', () => {
    expect(parseStudioTag([])).toBeNull();
    expect(parseStudioTag(undefined)).toBeNull();
    expect(parseStudioTag(null)).toBeNull();
  });

  test('first studio: tag wins when multiple', () => {
    expect(parseStudioTag(['studio:a.example.com', 'studio:b.example.com'])).toBe(
      'a.example.com',
    );
  });

  test('menu aggregator pattern: tags → MenuItem.studio', () => {
    const tags = ['foo', 'nav:main', 'studio:plugins.example.com'];
    const item = {
      path: '/plugins',
      label: 'Plugins',
      group: 'main' as const,
      order: 10,
      source: 'api' as const,
      studio: parseStudioTag(tags),
    };
    expect(item.studio).toBe('plugins.example.com');
  });
});

describe('studioHref', () => {
  test('builds external URL with ?host= query when studio present', () => {
    const href = studioHref(
      { path: '/plugins', studio: 'plugins.example.com' },
      'http://localhost:47778',
    );
    expect(href).toBe(
      'https://plugins.example.com/plugins?host=http%3A%2F%2Flocalhost%3A47778',
    );
  });

  test('returns raw path when studio absent', () => {
    expect(studioHref({ path: '/canvas', studio: undefined }, 'http://localhost:47778'))
      .toBe('/canvas');
    expect(studioHref({ path: '/canvas', studio: null }, 'http://localhost:47778'))
      .toBe('/canvas');
  });

  test('encodes hosts with special characters', () => {
    const href = studioHref(
      { path: '/foo', studio: 'a.example.com' },
      'https://oracle.local:8443',
    );
    expect(href).toBe('https://a.example.com/foo?host=https%3A%2F%2Foracle.local%3A8443');
  });
});
