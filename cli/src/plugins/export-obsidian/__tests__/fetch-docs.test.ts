/**
 * Tests for fetch-docs.ts — mocks global.fetch.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { fetchAllDocs } from "../lib/fetch-docs.ts";
import type { ApiDoc } from "../lib/types.ts";

type FetchFn = typeof fetch;
const originalFetch: FetchFn = globalThis.fetch;

function mockFetch(handler: (url: string) => { status?: number; body: unknown }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status = 200, body } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as FetchFn;
}

function makeDoc(id: string, overrides: Partial<ApiDoc> = {}): ApiDoc {
  return {
    id,
    type: "learning",
    content: `content-${id}`,
    source_file: `path/${id}.md`,
    concepts: [],
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAllDocs", () => {
  it("returns an empty array when the server reports no docs", async () => {
    mockFetch(() => ({ body: { results: [], total: 0 } }));
    const docs = await fetchAllDocs();
    expect(docs).toEqual([]);
  });

  it("paginates until a short page is received", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeDoc(`a${i}`));
    const page2 = [makeDoc("last")];
    let calls = 0;
    mockFetch((url) => {
      calls++;
      if (url.includes("offset=0")) return { body: { results: page1, total: 101 } };
      if (url.includes("offset=100")) return { body: { results: page2, total: 101 } };
      throw new Error(`unexpected url: ${url}`);
    });
    const docs = await fetchAllDocs();
    expect(docs).toHaveLength(101);
    expect(calls).toBe(2);
    expect(docs[docs.length - 1]!.id).toBe("last");
  });

  it("iterates once per requested type and dedupes by id", async () => {
    const urls: string[] = [];
    mockFetch((url) => {
      urls.push(url);
      if (url.includes("type=learning")) return { body: { results: [makeDoc("x")], total: 1 } };
      if (url.includes("type=retro")) return { body: { results: [makeDoc("x"), makeDoc("y")], total: 2 } };
      return { body: { results: [] } };
    });
    const docs = await fetchAllDocs({ types: ["learning", "retro"] });
    expect(docs.map((d) => d.id).sort()).toEqual(["x", "y"]);
    expect(urls.some((u) => u.includes("type=learning"))).toBe(true);
    expect(urls.some((u) => u.includes("type=retro"))).toBe(true);
  });

  it("filters client-side by project glob", async () => {
    mockFetch(() => ({
      body: {
        results: [
          makeDoc("a", { project: "Soul-Brews-Studio/foo" }),
          makeDoc("b", { project: "other/bar" }),
          makeDoc("c", { project: "Soul-Brews-Studio/baz" }),
        ],
      },
    }));
    const docs = await fetchAllDocs({ project: "Soul-Brews-Studio/*" });
    expect(docs.map((d) => d.id).sort()).toEqual(["a", "c"]);
  });

  it("throws on non-2xx responses", async () => {
    mockFetch(() => ({ status: 500, body: { error: "boom" } }));
    await expect(fetchAllDocs()).rejects.toThrow(/HTTP 500/);
  });
});
