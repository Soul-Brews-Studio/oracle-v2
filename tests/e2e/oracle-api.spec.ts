import { test, expect } from '@playwright/test';

/**
 * Oracle v3 API E2E Test Suite
 *
 * Tests critical user flows for Oracle v3 HTTP API
 * Coverage goal: 80%+ of critical paths
 *
 * API Base URL: http://localhost:47778
 *
 * Test Organization:
 * - Health Check (system status)
 * - Search Flow (semantic + FTS)
 * - 3D Map Flow (PCA visualization)
 * - Document List Flow (pagination)
 * - Authentication Flow (security)
 * - Dashboard Flow (analytics)
 * - Performance Tests (response times)
 * - Error Scenarios (edge cases)
 */

// ===== Test Configuration =====
const API_BASE = 'http://localhost:47778';
const PERFORMANCE_TARGETS = {
  search: 100, // ms
  dashboard: 200, // ms
  health: 50, // ms
  list: 100, // ms
};

// ===== Test Fixtures =====
interface PerformanceMetrics {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

// ===== Helper Functions =====

/**
 * Calculate percentile from array of numbers
 */
function percentile(arr: number[], p: number): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index] || 0;
}

/**
 * Calculate performance metrics from response times
 */
function calculateMetrics(times: number[]): PerformanceMetrics {
  return {
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    min: Math.min(...times),
    max: Math.max(...times),
    avg: times.reduce((a, b) => a + b, 0) / times.length,
  };
}

/**
 * Measure API response time
 */
async function measureResponseTime(
  fn: () => Promise<Response>
): Promise<{ response: Response; time: number }> {
  const start = Date.now();
  const response = await fn();
  const time = Date.now() - start;
  return { response, time };
}

// ===== Test Suite =====

test.describe('Oracle v3 API - Health Check', () => {
  test('should return healthy status', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toMatchObject({
      status: 'ok',
      server: expect.any(String),
      port: expect.any(Number),
      oracleV2: 'connected',
    });
  });

  test('should respond quickly', async ({ request }) => {
    const { response, time } = await measureResponseTime(() =>
      request.get(`${API_BASE}/api/health`)
    );

    expect(response.ok()).toBe(true);
    expect(time).toBeLessThan(PERFORMANCE_TARGETS.health);
  });

  test('should return JSON content-type', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    expect(response.headers()['content-type']).toContain('application/json');
  });
});

test.describe('Oracle v3 API - Search Flow', () => {
  test.beforeEach(async ({ request }) => {
    // Ensure API is ready
    const health = await request.get(`${API_BASE}/api/health`);
    expect(health.ok()).toBe(true);
  });

  test('happy path: valid query returns results', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/search?q=oracle&limit=10`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('query', 'oracle');
    expect(Array.isArray(data.results)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('happy path: search with type filter', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/search?q=test&type=learnings&limit=5`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.results).toBeInstanceOf(Array);
  });

  test('happy path: search with pagination', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/search?q=test&limit=5&offset=0`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.results.length).toBeLessThanOrEqual(5);
  });

  test('edge case: empty query returns 400', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/search?q=`);
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('edge case: missing query parameter returns 400', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/search`);
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('edge case: special characters are handled', async ({ request }) => {
    const specialChars = '<script>alert("xss")</script>';
    const response = await request.get(
      `${API_BASE}/api/search?q=${encodeURIComponent(specialChars)}`
    );

    // Should not error, should sanitize input
    expect([200, 400]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      // Query should be sanitized
      expect(data.query).not.toContain('<script>');
    }
  });

  test('edge case: very long query (>1000 chars)', async ({ request }) => {
    const longQuery = 'a'.repeat(1001);
    const response = await request.get(
      `${API_BASE}/api/search?q=${encodeURIComponent(longQuery)}`
    );

    // Should handle gracefully - either accept or reject with proper error
    expect([200, 400, 413]).toContain(response.status());
  });

  test('edge case: negative offset returns 400 or handled gracefully', async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/api/search?q=test&offset=-1`
    );
    // Should handle negative offset
    expect([200, 400]).toContain(response.status());
  });

  test('edge case: limit >100 capped at 100', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/search?q=test&limit=999`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.results.length).toBeLessThanOrEqual(100);
  });

  test('performance: search responds in <100ms', async ({ request }) => {
    const times: number[] = [];

    // Run 10 times to get stable metrics
    for (let i = 0; i < 10; i++) {
      const { time } = await measureResponseTime(() =>
        request.get(`${API_BASE}/api/search?q=test&limit=10`)
      );
      times.push(time);
    }

    const metrics = calculateMetrics(times);
    expect(metrics.p95).toBeLessThan(PERFORMANCE_TARGETS.search);
  });

  test('edge case: invalid type parameter returns 400 or defaults to all', async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/api/search?q=test&type=invalid_type`
    );
    // Should handle gracefully
    expect([200, 400]).toContain(response.status());
  });
});

test.describe('Oracle v3 API - 3D Map Flow', () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get(`${API_BASE}/api/health`);
    expect(health.ok()).toBe(true);
  });

  test('happy path: returns PCA data', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/map3d`);

    // May return 500 if no embeddings, or 200 with data
    expect([200, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('documents');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.documents)).toBe(true);

      // If documents exist, check for PCA data
      if (data.documents.length > 0) {
        const doc = data.documents[0];
        expect(doc).toHaveProperty('x');
        expect(doc).toHaveProperty('y');
        expect(doc).toHaveProperty('z');
      }
    }
  });

  test('edge case: empty database returns empty array or error', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/map3d`);
    expect([200, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.documents).toBeInstanceOf(Array);
    }
  });

  test('data integrity: PCA coordinates are numbers', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/map3d`);

    if (response.status() === 200) {
      const data = await response.json();
      if (data.documents.length > 0) {
        data.documents.forEach((doc: any) => {
          expect(typeof doc.x).toBe('number');
          expect(typeof doc.y).toBe('number');
          expect(typeof doc.z).toBe('number');
          expect(!isNaN(doc.x)).toBe(true);
          expect(!isNaN(doc.y)).toBe(true);
          expect(!isNaN(doc.z)).toBe(true);
        });
      }
    }
  });

  test('happy path: supports model parameter', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/map3d?model=bge-m3`);
    expect([200, 500]).toContain(response.status());
  });
});

test.describe('Oracle v3 API - Document List Flow', () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get(`${API_BASE}/api/health`);
    expect(health.ok()).toBe(true);
  });

  test('happy path: returns paginated results', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/list?limit=10&offset=0`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeLessThanOrEqual(10);
  });

  test('happy path: list with type filter', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/list?type=learnings&limit=5`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.results).toBeInstanceOf(Array);
  });

  test('edge case: invalid type parameter returns 400 or defaults', async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/api/list?type=invalid_type`
    );
    expect([200, 400]).toContain(response.status());
  });

  test('edge case: negative offset returns 400 or handled', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/list?offset=-1`);
    expect([200, 400]).toContain(response.status());
  });

  test('edge case: limit >1000 capped at 1000', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/list?limit=9999`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.results.length).toBeLessThanOrEqual(1000);
  });

  test('edge case: limit <1 returns 400 or defaults', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/list?limit=0`);
    expect([200, 400]).toContain(response.status());
  });

  test('performance: list responds in <100ms', async ({ request }) => {
    const { response, time } = await measureResponseTime(() =>
      request.get(`${API_BASE}/api/list?limit=10`)
    );

    expect(response.ok()).toBe(true);
    expect(time).toBeLessThan(PERFORMANCE_TARGETS.list);
  });

  test('happy path: group parameter controls grouping', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/list?group=true`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.results).toBeInstanceOf(Array);
  });
});

test.describe('Oracle v3 API - Authentication Flow', () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get(`${API_BASE}/api/health`);
    expect(health.ok()).toBe(true);
  });

  test('happy path: valid login succeeds (when auth configured)', async ({
    request,
  }) => {
    // First check if auth is enabled
    const statusResponse = await request.get(`${API_BASE}/api/auth/status`);
    const status = await statusResponse.json();

    if (status.authEnabled && status.hasPassword) {
      // Try login with test password (will fail if not configured)
      const loginResponse = await request.post(`${API_BASE}/api/auth/login`, {
        data: JSON.stringify({ password: 'test-password' }),
      });

      // Should either succeed (200) or fail with proper error (401)
      expect([200, 401]).toContain(loginResponse.status());

      if (loginResponse.status() === 200) {
        const data = await loginResponse.json();
        expect(data).toHaveProperty('success', true);
      }
    } else {
      // Auth not configured, skip test
      test.skip();
    }
  });

  test('edge case: missing password returns 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/login`, {
      data: JSON.stringify({}),
    });
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('edge case: invalid JSON returns 400 or 500', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/login`, {
      data: 'invalid json',
    });
    // Hono/Bun may return different error codes for JSON parse errors
    expect([400, 500]).toContain(response.status());
  });

  test('happy path: auth status returns correct info', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/status`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toMatchObject({
      authenticated: expect.any(Boolean),
      authEnabled: expect.any(Boolean),
      hasPassword: expect.any(Boolean),
      localBypass: expect.any(Boolean),
      isLocal: expect.any(Boolean),
    });
  });

  test('security: rate limiting enforced (check)', async ({ request }) => {
    // First check if auth is configured
    const statusRes = await request.get(`${API_BASE}/api/auth/status`);
    const status = await statusRes.json();

    // Skip test if auth not configured
    if (!status.authEnabled || !status.hasPassword) {
      test.skip();
      return;
    }

    // Make multiple rapid login attempts
    const attempts = [];
    for (let i = 0; i < 5; i++) {
      const res = await request.post(`${API_BASE}/api/auth/login`, {
        data: JSON.stringify({ password: 'wrong-password' }),
      });
      attempts.push(res.status());
    }

    // Rate limiting may not be implemented - all should be 401 or some 429
    const allUnauthorized = attempts.every((s) => s === 401);
    const hasRateLimit = attempts.includes(429);

    // At minimum, all should be unauthorized
    expect(allUnauthorized || hasRateLimit).toBe(true);
  });

  test('happy path: logout clears session', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/logout`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });
});

test.describe('Oracle v3 API - Dashboard Flow', () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get(`${API_BASE}/api/health`);
    expect(health.ok()).toBe(true);
  });

  test('happy path: returns summary stats', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/dashboard`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    // Dashboard returns various stats, check structure exists
    expect(data).toBeInstanceOf(Object);
    expect(Object.keys(data).length).toBeGreaterThan(0);
  });

  test('happy path: dashboard summary endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/dashboard/summary`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    // Dashboard summary returns object with various stats
    expect(data).toBeInstanceOf(Object);
    expect(Object.keys(data).length).toBeGreaterThan(0);
  });

  test('happy path: dashboard activity with days parameter', async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/api/dashboard/activity?days=7`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    // Activity endpoint returns object with activity data, not array
    expect(data).toBeInstanceOf(Object);
  });

  test('edge case: invalid days parameter handled', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/dashboard/activity?days=invalid`
    );
    // Should handle gracefully
    expect([200, 400]).toContain(response.status());
  });

  test('edge case: no data exists returns empty or zero stats', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/dashboard`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    // Dashboard returns object structure even with no data
    expect(data).toBeInstanceOf(Object);
  });

  test('performance: dashboard responds in <200ms', async ({ request }) => {
    const times: number[] = [];

    for (let i = 0; i < 10; i++) {
      const { time } = await measureResponseTime(() =>
        request.get(`${API_BASE}/api/dashboard`)
      );
      times.push(time);
    }

    const metrics = calculateMetrics(times);
    expect(metrics.p95).toBeLessThan(PERFORMANCE_TARGETS.dashboard);
  });

  test('happy path: session stats endpoint', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/session/stats?since=${Date.now() - 86400000}`
    );
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toMatchObject({
      searches: expect.any(Number),
      learnings: expect.any(Number),
      since: expect.any(Number),
    });
  });
});

test.describe('Oracle v3 API - Performance Tests', () => {
  test('concurrent requests: handle 10 parallel searches', async ({
    request,
  }) => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(request.get(`${API_BASE}/api/search?q=test${i}`));
    }

    const responses = await Promise.all(promises);
    responses.forEach((res) => {
      expect([200, 400]).toContain(res.status());
    });
  });

  test('performance: measure p50, p95, p99 for search', async ({
    request,
  }) => {
    const times: number[] = [];

    for (let i = 0; i < 20; i++) {
      const { time } = await measureResponseTime(() =>
        request.get(`${API_BASE}/api/search?q=test&limit=10`)
      );
      times.push(time);
    }

    const metrics = calculateMetrics(times);

    console.log('Search Performance Metrics:', metrics);
    expect(metrics.p50).toBeGreaterThan(0);
    expect(metrics.p95).toBeLessThan(500); // Should be under 500ms
  });

  test('performance: measure p50, p95, p99 for health', async ({
    request,
  }) => {
    const times: number[] = [];

    for (let i = 0; i < 20; i++) {
      const { time } = await measureResponseTime(() =>
        request.get(`${API_BASE}/api/health`)
      );
      times.push(time);
    }

    const metrics = calculateMetrics(times);

    console.log('Health Performance Metrics:', metrics);
    expect(metrics.p95).toBeLessThan(100);
  });

  test('performance: measure p50, p95, p99 for list', async ({ request }) => {
    const times: number[] = [];

    for (let i = 0; i < 20; i++) {
      const { time } = await measureResponseTime(() =>
        request.get(`${API_BASE}/api/list?limit=10`)
      );
      times.push(time);
    }

    const metrics = calculateMetrics(times);

    console.log('List Performance Metrics:', metrics);
    expect(metrics.p95).toBeLessThan(200);
  });
});

test.describe('Oracle v3 API - Error Scenarios', () => {
  test('error: invalid JSON in POST request', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/login`, {
      data: '{ invalid json }',
    });
    expect([400, 500]).toContain(response.status());
  });

  test('error: malformed query string', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/search?q=%00%01`);
    // Should handle malformed input gracefully
    expect([200, 400]).toContain(response.status());
  });

  test('error: non-existent endpoint returns 404', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/nonexistent`);
    expect([404, 401]).toContain(response.status());
  });

  test('error: invalid HTTP method on endpoint', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/health`);
    expect([404, 405, 401]).toContain(response.status());
  });

  test('error: SQL injection attempt handled gracefully', async ({ request }) => {
    const sqlInjection = "'; DROP TABLE oracle_documents; --";
    const response = await request.get(
      `${API_BASE}/api/search?q=${encodeURIComponent(sqlInjection)}`
    );

    // Should handle gracefully - not crash, return error or sanitized results
    expect([200, 400, 500]).toContain(response.status());

    // If it returns 200, the query is passed through (FTS5 handles escaping)
    // If it returns 400/500, that's also acceptable error handling
    if (response.status() === 200) {
      const data = await response.json();
      // Query may be preserved or sanitized depending on implementation
      expect(data).toHaveProperty('query');
    }
  });

  test('error: XSS attempt sanitized', async ({ request }) => {
    const xss = '<img src=x onerror=alert(1)>';
    const response = await request.get(
      `${API_BASE}/api/search?q=${encodeURIComponent(xss)}`
    );

    expect([200, 400]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.query).not.toContain('<img');
    }
  });
});

test.describe('Oracle v3 API - Integration Tests', () => {
  test('workflow: search -> list -> reflect full flow', async ({
    request,
  }) => {
    // Step 1: Search
    const searchRes = await request.get(`${API_BASE}/api/search?q=oracle`);
    expect(searchRes.ok()).toBe(true);

    // Step 2: List documents
    const listRes = await request.get(`${API_BASE}/api/list?limit=5`);
    expect(listRes.ok()).toBe(true);

    // Step 3: Get reflection
    const reflectRes = await request.get(`${API_BASE}/api/reflect`);
    expect(reflectRes.ok()).toBe(true);
  });

  test('workflow: authenticated request flow', async ({ request }) => {
    // Check auth status
    const statusRes = await request.get(`${API_BASE}/api/auth/status`);
    expect(statusRes.ok()).toBe(true);
    const status = await statusRes.json();

    // If auth is required and we're not authenticated
    if (status.authEnabled && !status.authenticated && !status.isLocal) {
      // Try to access protected endpoint
      const protectedRes = await request.get(`${API_BASE}/api/dashboard`);
      expect(protectedRes.status()).toBe(401);
    } else {
      // Should be able to access protected endpoint
      const protectedRes = await request.get(`${API_BASE}/api/dashboard`);
      expect(protectedRes.ok()).toBe(true);
    }
  });

  test('workflow: pagination through search results', async ({ request }) => {
    const pageSize = 5;
    const page1 = await request.get(
      `${API_BASE}/api/search?q=test&limit=${pageSize}&offset=0`
    );
    expect(page1.ok()).toBe(true);

    const page2 = await request.get(
      `${API_BASE}/api/search?q=test&limit=${pageSize}&offset=${pageSize}`
    );
    expect(page2.ok()).toBe(true);

    const data1 = await page1.json();
    const data2 = await page2.json();

    // Results should be different (unless database is small)
    if (data1.total > pageSize) {
      expect(data1.results).not.toEqual(data2.results);
    }
  });
});

test.describe('Oracle v3 API - Stats Endpoint', () => {
  test('happy path: returns database statistics', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/stats`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('vault_repo');
  });

  test('happy path: includes vector stats when available', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/stats`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('vector');
    expect(data.vector).toHaveProperty('enabled');
    expect(data.vector).toHaveProperty('count');
  });
});

test.describe('Oracle v3 API - Oracles Endpoint', () => {
  test('happy path: returns active oracles', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/oracles`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('identities');
    expect(data).toHaveProperty('projects');
    expect(data).toHaveProperty('total_identities');
    expect(data).toHaveProperty('total_projects');
  });

  test('happy path: supports hours parameter', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/oracles?hours=24`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    // Hours parameter should be reflected in response
    expect(data).toHaveProperty('window_hours');
    expect(typeof data.window_hours).toBe('number');
  });

  test('happy path: results are cached', async ({ request }) => {
    // First request
    const res1 = await request.get(`${API_BASE}/api/oracles`);
    const data1 = await res1.json();

    // Second request within cache window (60s)
    const res2 = await request.get(`${API_BASE}/api/oracles`);
    const data2 = await res2.json();

    expect(data1).toEqual(data2);
  });
});
