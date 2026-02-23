/**
 * Unit tests for vault handler — pure functions only.
 *
 * Tests parseGitStatus (the extracted git status parser).
 * Skips initVault/syncVault/vaultStatus since they require
 * real ghq, git repos, and database access.
 */

import { describe, it, expect } from 'bun:test';
import { parseGitStatus } from '../handler.js';

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
