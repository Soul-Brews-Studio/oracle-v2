/**
 * Oracle Dashboard E2E Tests
 *
 * Run with: cd ~/.claude/skills/dev-browser && npx tsx /path/to/run-e2e.ts
 * Requires: dev-browser server running (./skills/dev-browser/server.sh)
 */

import { connect, waitForPageLoad } from "@/client.js";

interface TestResult {
  test: string;
  status: "PASS" | "FAIL";
  details?: any;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<any>): Promise<void> {
  try {
    const details = await fn();
    results.push({ test: name, status: "PASS", details });
    console.log(`✅ ${name}`);
  } catch (e: any) {
    results.push({ test: name, status: "FAIL", error: e.message });
    console.log(`❌ ${name}: ${e.message}`);
  }
}

async function main() {
  console.log("\n========================================");
  console.log("Oracle Dashboard E2E Tests");
  console.log("========================================\n");

  const client = await connect();
  const page = await client.page("oracle-e2e");
  await page.setViewportSize({ width: 1280, height: 800 });

  // Test 1: Homepage loads
  await runTest("Homepage loads", async () => {
    await page.goto("http://localhost:3000");
    await waitForPageLoad(page);
    const hasHeader = await page.locator('header').isVisible();
    if (!hasHeader) throw new Error("Header not visible");
    return { hasHeader };
  });

  // Test 2: Header has navigation
  await runTest("Header navigation", async () => {
    const links = await page.locator('header nav a').count();
    if (links < 5) throw new Error(`Only ${links} nav links found`);
    return { linkCount: links };
  });

  // Test 3: QuickLearn FAB visible
  await runTest("QuickLearn FAB visible", async () => {
    const fab = await page.locator('button:has-text("+")').isVisible();
    if (!fab) throw new Error("FAB not visible");
    return { fabVisible: true };
  });

  // Test 4: Navigate to Feed
  await runTest("Navigate to Feed", async () => {
    await page.click('text=Feed');
    await waitForPageLoad(page);
    const url = page.url();
    if (!url.includes('/feed')) throw new Error(`Wrong URL: ${url}`);
    return { url };
  });

  // Test 5: Feed shows documents
  await runTest("Feed shows documents", async () => {
    await page.waitForSelector('[class*="item"], [class*="card"]', { timeout: 10000 });
    const count = await page.locator('[class*="item"], [class*="card"]').count();
    if (count === 0) throw new Error("No documents found");
    return { documentCount: count };
  });

  // Test 6: Navigate to Search
  await runTest("Navigate to Search", async () => {
    await page.click('text=Search');
    await waitForPageLoad(page);
    const hasInput = await page.locator('input').isVisible();
    if (!hasInput) throw new Error("Search input not found");
    return { hasInput };
  });

  // Test 7: Search functionality
  await runTest("Search works", async () => {
    await page.fill('input', 'nothing deleted');
    await page.press('input', 'Enter');
    await page.waitForTimeout(2000);
    const hasResults = await page.locator('text=/\\d+ result/i').isVisible();
    if (!hasResults) throw new Error("No results displayed");
    return { hasResults };
  });

  // Test 8: Navigate to Activity
  await runTest("Navigate to Activity", async () => {
    await page.click('text=Activity');
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
    const url = page.url();
    if (!url.includes('/activity')) throw new Error(`Wrong URL: ${url}`);
    return { url };
  });

  // Test 9: Activity has tabs
  await runTest("Activity has tabs", async () => {
    const hasTabs = await page.locator('button:has-text("Search"), button:has-text("Consult")').first().isVisible();
    if (!hasTabs) throw new Error("Activity tabs not found");
    return { hasTabs };
  });

  // Test 10: Navigate to Graph
  await runTest("Navigate to Graph", async () => {
    await page.click('text=Graph');
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);
    const hasCanvas = await page.locator('canvas').isVisible();
    if (!hasCanvas) throw new Error("Graph canvas not found");
    return { hasCanvas };
  });

  // Test 11: Navigate to Consult
  await runTest("Navigate to Consult", async () => {
    await page.click('text=Consult');
    await waitForPageLoad(page);
    const hasInput = await page.locator('input, textarea').first().isVisible();
    if (!hasInput) throw new Error("Consult input not found");
    return { hasInput };
  });

  // Test 12: QuickLearn modal opens
  await runTest("QuickLearn modal opens", async () => {
    await page.goto("http://localhost:3000");
    await waitForPageLoad(page);
    await page.click('button:has-text("+")');
    await page.waitForTimeout(500);
    const hasModal = await page.locator('text=/add learning/i').isVisible();
    if (!hasModal) throw new Error("Modal not visible");
    return { hasModal };
  });

  // Test 13: QuickLearn has form fields
  await runTest("QuickLearn has form", async () => {
    const hasTextarea = await page.locator('textarea').isVisible();
    const hasInput = await page.locator('input[type="text"]').isVisible();
    if (!hasTextarea || !hasInput) throw new Error("Form fields missing");
    return { hasTextarea, hasInput };
  });

  // Test 14: Modal closes on close button
  await runTest("Modal closes on X button", async () => {
    await page.click('button:has-text("×")');
    await page.waitForTimeout(300);
    const modalHidden = !(await page.locator('text=/add learning/i').isVisible());
    if (!modalHidden) throw new Error("Modal still visible");
    return { modalClosed: true };
  });

  // Summary
  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");

  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;

  console.log(`\nTotal: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`  - ${r.test}: ${r.error}`);
    });
  }

  // Take final screenshot
  await page.screenshot({ path: "tmp/e2e-complete.png" });
  console.log("\nScreenshot saved to tmp/e2e-complete.png");

  await client.disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
