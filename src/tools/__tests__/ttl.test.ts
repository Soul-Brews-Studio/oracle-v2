/**
 * Unit tests for TTL helpers (pure functions).
 */

import { describe, it, expect } from 'bun:test';
import { parseTtl, defaultTtlDays } from '../learn.ts';

// ============================================================================
// parseTtl
// ============================================================================

describe('parseTtl', () => {
  it('should parse valid day strings', () => {
    expect(parseTtl('7d')).toBe(7);
    expect(parseTtl('14d')).toBe(14);
    expect(parseTtl('30d')).toBe(30);
    expect(parseTtl('365d')).toBe(365);
  });

  it('should return null for zero days', () => {
    expect(parseTtl('0d')).toBeNull();
  });

  it('should return null for invalid input', () => {
    expect(parseTtl('abc')).toBeNull();
    expect(parseTtl('')).toBeNull();
    expect(parseTtl(undefined)).toBeNull();
    expect(parseTtl('7')).toBeNull();
    expect(parseTtl('d')).toBeNull();
    expect(parseTtl('-5d')).toBeNull();
  });
});

// ============================================================================
// defaultTtlDays
// ============================================================================

describe('defaultTtlDays', () => {
  it('should return 7 for score-output prefix', () => {
    expect(defaultTtlDays('[score-output] infra-health: disk 64%, all green')).toBe(7);
  });

  it('should return 7 for infra-health prefix', () => {
    expect(defaultTtlDays('[infra-health] disk usage at 79%')).toBe(7);
  });

  it('should return 14 for remediation-audit prefix', () => {
    expect(defaultTtlDays('[remediation-audit] stale reports cleaned')).toBe(14);
  });

  it('should return 7 for daily-goal prefix', () => {
    expect(defaultTtlDays('[daily-goal] P2: Add vector alerting')).toBe(7);
  });

  it('should return 7 for goal-carryover prefix', () => {
    expect(defaultTtlDays('[goal-carryover] P0: Fix ChromaDB vector search')).toBe(7);
  });

  it('should return 30 for retro prefix', () => {
    expect(defaultTtlDays('[retro] session 2026-04-07 retrospective')).toBe(30);
  });

  it('should return null for patterns without TTL prefix', () => {
    expect(defaultTtlDays('Oracle v3 ChromaDB connectivity issue')).toBeNull();
    expect(defaultTtlDays('Some regular learning')).toBeNull();
  });

  it('should be case insensitive', () => {
    expect(defaultTtlDays('[SCORE-OUTPUT] test')).toBe(7);
    expect(defaultTtlDays('[Score-Output] test')).toBe(7);
    expect(defaultTtlDays('[INFRA-HEALTH] test')).toBe(7);
  });
});
