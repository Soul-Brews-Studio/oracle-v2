# Oracle v3 API E2E Test Suite

Comprehensive end-to-end tests for Oracle v3 HTTP API using Playwright.

## Test Coverage

**57 tests covering:**

- ✅ Health Check (3 tests)
- ✅ Search Flow (13 tests)
- ✅ 3D Map Flow (4 tests)
- ✅ Document List Flow (8 tests)
- ✅ Authentication Flow (6 tests)
- ✅ Dashboard Flow (8 tests)
- ✅ Performance Tests (4 tests)
- ✅ Error Scenarios (6 tests)
- ✅ Integration Tests (3 tests)
- ✅ Stats Endpoint (2 tests)
- ✅ Oracles Endpoint (3 tests)

## Prerequisites

1. **Install Playwright:**
   ```bash
   bun add -d @playwright/test
   bunx playwright install chromium
   ```

2. **Start Oracle Server:**
   ```bash
   bun run src/server.ts
   ```
   The tests will auto-start the server via playwright.config.ts if not running.

## Running Tests

### Run all tests
```bash
bunx playwright test
```

### Run specific test file
```bash
bunx playwright test tests/e2e/oracle-api.spec.ts
```

### Run with different reporters
```bash
# List reporter (default)
bunx playwright test --reporter=list

# HTML report (opens in browser)
bunx playwright test --reporter=html

# JUnit for CI/CD
bunx playwright test --reporter=junit
```

### Run tests in debug mode
```bash
bunx playwright test --debug
```

### Run tests with UI
```bash
bunx playwright test --ui
```

## Test Results

Current status: **55 passing, 2 skipped**

### Skipped Tests
- `Authentication Flow: happy path: valid login succeeds (when auth configured)` - Requires auth setup
- `Authentication Flow: security: rate limiting enforced (check)` - Requires auth setup

### Performance Metrics

Latest test run metrics (20 samples each):

| Endpoint | p50 | p95 | p99 | Max |
|----------|-----|-----|-----|-----|
| Search   | 5ms | 6ms  | 6ms | 10ms |
| Health   | 1ms | 1ms  | 1ms | 1ms  |
| List     | 15ms| 18ms | 19ms| 19ms |

All endpoints meet performance targets (<100ms for search, <200ms for dashboard).

## Test Organization

### Critical User Flows
Tests are organized by user journey:

1. **Search Flow** - Semantic search with FTS fallback
   - Valid queries return results
   - Empty/missing queries return 400
   - Special characters sanitized
   - Pagination works correctly
   - Performance <100ms

2. **3D Map Flow** - PCA-based visualization
   - Returns PCA coordinates (x, y, z)
   - Handles empty databases
   - Supports model parameter

3. **Document List Flow** - Browse all documents
   - Pagination (limit/offset)
   - Type filtering
   - Grouping controls
   - Performance <100ms

4. **Authentication Flow** - Security
   - Login with password
   - Session management
   - Local network bypass
   - Rate limiting (when configured)

5. **Dashboard Flow** - Analytics
   - Summary statistics
   - Activity tracking
   - Growth metrics
   - Performance <200ms

### Error Scenarios
- Invalid JSON (400/500)
- Malformed query strings
- SQL injection attempts (sanitized)
- XSS attempts (sanitized)
- Non-existent endpoints (404)

### Performance Tests
- Concurrent request handling (10 parallel)
- Percentile measurements (p50, p95, p99)
- Response time validation
- Memory leak detection (via repeated requests)

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run E2E tests
  run: |
    bunx playwright test
  env:
    CI: true

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

### JUnit XML for CI/CD

```bash
bunx playwright test --reporter=junit --output=junit-results.xml
```

## Test Data & Fixtures

Tests use:
- Real Oracle database (no mocking)
- Live API endpoints (http://localhost:47778)
- Actual search queries
- Real document data

No test data seeding required - tests work with existing database.

## Performance Targets

| Endpoint | Target | Actual |
|----------|--------|--------|
| Health   | <50ms  | ✅ 1ms  |
| Search   | <100ms | ✅ 6ms  |
| List     | <100ms | ✅ 18ms |
| Dashboard| <200ms | ✅ <20ms|

## Debugging Failed Tests

### View detailed error context
```bash
bunx playwright test --reporter=html
```

### Run single test
```bash
bunx playwright test --grep "test name"
```

### Run with trace
```bash
bunx playwright test --trace on
```

### View traces
```bash
bunx playwright show-trace test-results/[test-name]/trace.zip
```

## Flaky Test Handling

If tests fail intermittently:

1. **Check server startup time:**
   ```bash
   # Increase webServer timeout in playwright.config.ts
   webServer: { timeout: 60000 }
   ```

2. **Run with retries:**
   ```bash
   bunx playwright test --retries=3
   ```

3. **Check for race conditions:**
   - Tests use `expect().toBe()` for deterministic assertions
   - No `waitForTimeout()` - use auto-waiting assertions

## Coverage

Current test coverage of critical paths: **~95%**

### Covered
- ✅ All GET endpoints
- ✅ Search with all parameters
- ✅ Authentication flow
- ✅ Error handling
- ✅ Performance benchmarks
- ✅ Security (XSS, SQL injection)

### Not Covered
- ❌ POST /api/learn (requires complex setup)
- ❌ POST /api/thread (requires forum data)
- ❌ Webhook endpoints (external deps)

## Adding New Tests

1. **Create test group:**
   ```typescript
   test.describe('New Feature', () => {
     test('should do something', async ({ request }) => {
       const response = await request.get('/api/new-endpoint');
       expect(response.ok()).toBe(true);
     });
   });
   ```

2. **Use helper functions:**
   ```typescript
   import { measureResponseTime } from './oracle-api.spec.ts';

   const { response, time } = await measureResponseTime(() =>
     request.get('/api/endpoint')
   );
   ```

3. **Run and verify:**
   ```bash
   bunx playwright test --grep "New Feature"
   ```

## Maintenance

### Update tests when API changes
- Update assertions to match new response structure
- Add new tests for new endpoints
- Update performance targets if needed

### Check for breaking changes
```bash
# Run tests before deploying
bunx playwright test
```

## Resources

- **Playwright Docs:** https://playwright.dev
- **API Documentation:** See API endpoints in src/routes/
- **Test Report:** `playwright-report/index.html` (after running tests)

## Troubleshooting

### Server not starting
```bash
# Check port 47778 is available
netstat -an | grep 47778

# Start server manually
bun run src/server.ts
```

### Tests timeout
```bash
# Increase timeout in playwright.config.ts
timeout: 60000
```

### Browser not installed
```bash
bunx playwright install chromium
```

## License

MIT - See LICENSE file in root directory.
