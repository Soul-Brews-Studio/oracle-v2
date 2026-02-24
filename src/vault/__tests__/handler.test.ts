/**
 * Unit tests for vault handler — pure functions only.
 *
 * Tests parseGitStatus, mapToVaultPath, mapFromVaultPath,
 * and ensureFrontmatterProject.
 */

import { describe, it, expect } from 'bun:test';
import {
  parseGitStatus,
  mapToVaultPath,
  mapFromVaultPath,
  ensureFrontmatterProject,
} from '../handler.ts';

// ============================================================================
// parseGitStatus
// ============================================================================

describe('parseGitStatus', () => {
  it('returns zeros for empty output', () => {
    expect(parseGitStatus('')).toEqual({ added: 0, modified: 0, deleted: 0 });
    expect(parseGitStatus('  \n  ')).toEqual({ added: 0, modified: 0, deleted: 0 });
  });

  it('counts untracked files as added', () => {
    const status = '?? ψ/memory/new-file.md\n?? ψ/memory/another.md';
    expect(parseGitStatus(status)).toEqual({ added: 2, modified: 0, deleted: 0 });
  });

  it('counts staged additions as added', () => {
    const status = 'A  ψ/memory/new-file.md';
    expect(parseGitStatus(status)).toEqual({ added: 1, modified: 0, deleted: 0 });
  });

  it('counts deletions', () => {
    const status = ' D ψ/memory/old-file.md\n D ψ/memory/gone.md';
    expect(parseGitStatus(status)).toEqual({ added: 0, modified: 0, deleted: 2 });
  });

  it('counts modifications', () => {
    const status = ' M ψ/memory/changed.md\nM  ψ/memory/also-changed.md';
    expect(parseGitStatus(status)).toEqual({ added: 0, modified: 2, deleted: 0 });
  });

  it('counts renames as modified', () => {
    const status = 'R  ψ/old-name.md -> ψ/new-name.md';
    expect(parseGitStatus(status)).toEqual({ added: 0, modified: 1, deleted: 0 });
  });

  it('handles mixed status output', () => {
    const status = [
      '?? ψ/memory/new.md',
      'A  ψ/memory/staged-new.md',
      ' M ψ/memory/changed.md',
      ' D ψ/memory/removed.md',
      'R  ψ/old.md -> ψ/renamed.md',
    ].join('\n');

    expect(parseGitStatus(status)).toEqual({ added: 2, modified: 2, deleted: 1 });
  });

  it('handles staged deletions (D in index column)', () => {
    const status = 'D  ψ/memory/deleted.md';
    expect(parseGitStatus(status)).toEqual({ added: 0, modified: 0, deleted: 1 });
  });
});

// ============================================================================
// mapToVaultPath
// ============================================================================

describe('mapToVaultPath', () => {
  const project = 'github.com/soul-brews-studio/oracle-v2';

  it('nests learnings under project', () => {
    expect(mapToVaultPath('ψ/memory/learnings/file.md', project))
      .toBe('ψ/memory/learnings/github.com/soul-brews-studio/oracle-v2/file.md');
  });

  it('nests retrospectives under project', () => {
    expect(mapToVaultPath('ψ/memory/retrospectives/2026-01/15/session.md', project))
      .toBe('ψ/memory/retrospectives/github.com/soul-brews-studio/oracle-v2/2026-01/15/session.md');
  });

  it('nests inbox/handoff under project', () => {
    expect(mapToVaultPath('ψ/inbox/handoff/context.md', project))
      .toBe('ψ/inbox/handoff/github.com/soul-brews-studio/oracle-v2/context.md');
  });

  it('keeps resonance universal (no project prefix)', () => {
    expect(mapToVaultPath('ψ/memory/resonance/philosophy.md', project))
      .toBe('ψ/memory/resonance/philosophy.md');
  });

  it('returns path unchanged when project is null', () => {
    expect(mapToVaultPath('ψ/memory/learnings/file.md', null))
      .toBe('ψ/memory/learnings/file.md');
  });

  it('handles nested learning files', () => {
    expect(mapToVaultPath('ψ/memory/learnings/deep/nested/file.md', project))
      .toBe('ψ/memory/learnings/github.com/soul-brews-studio/oracle-v2/deep/nested/file.md');
  });
});

// ============================================================================
// mapFromVaultPath
// ============================================================================

describe('mapFromVaultPath', () => {
  const project = 'github.com/soul-brews-studio/oracle-v2';

  it('strips project from learnings path', () => {
    expect(mapFromVaultPath(
      'ψ/memory/learnings/github.com/soul-brews-studio/oracle-v2/file.md',
      project
    )).toBe('ψ/memory/learnings/file.md');
  });

  it('strips project from retrospectives path', () => {
    expect(mapFromVaultPath(
      'ψ/memory/retrospectives/github.com/soul-brews-studio/oracle-v2/2026-01/15/session.md',
      project
    )).toBe('ψ/memory/retrospectives/2026-01/15/session.md');
  });

  it('keeps resonance path as-is', () => {
    expect(mapFromVaultPath('ψ/memory/resonance/philosophy.md', project))
      .toBe('ψ/memory/resonance/philosophy.md');
  });

  it('returns null for unrecognized paths', () => {
    expect(mapFromVaultPath('some/random/path.md', project)).toBeNull();
  });

  it('returns null for different project paths', () => {
    expect(mapFromVaultPath(
      'ψ/memory/learnings/github.com/other-org/other-repo/file.md',
      project
    )).toBeNull();
  });
});

// ============================================================================
// ensureFrontmatterProject
// ============================================================================

describe('ensureFrontmatterProject', () => {
  const project = 'github.com/soul-brews-studio/oracle-v2';

  it('adds frontmatter when none exists', () => {
    const content = '# My Learning\n\nSome content here.';
    const result = ensureFrontmatterProject(content, project);
    expect(result).toBe(
      `---\nproject: ${project}\n---\n\n# My Learning\n\nSome content here.`
    );
  });

  it('injects project into existing frontmatter', () => {
    const content = '---\ntags: [git, safety]\nsource: Oracle Learn\n---\n\n# Content';
    const result = ensureFrontmatterProject(content, project);
    expect(result).toContain(`project: ${project}`);
    expect(result).toContain('tags: [git, safety]');
    expect(result).toContain('source: Oracle Learn');
  });

  it('does not modify if project already exists', () => {
    const content = `---\nproject: ${project}\ntags: [test]\n---\n\n# Content`;
    const result = ensureFrontmatterProject(content, project);
    expect(result).toBe(content);
  });

  it('preserves existing project field even if different', () => {
    const content = '---\nproject: github.com/other/repo\n---\n\n# Content';
    const result = ensureFrontmatterProject(content, project);
    // Should NOT modify — project field already exists
    expect(result).toBe(content);
  });
});
