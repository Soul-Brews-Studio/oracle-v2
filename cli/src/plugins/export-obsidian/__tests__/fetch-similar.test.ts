/**
 * Tests for fetch-similar.ts — mocks global.fetch.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { fetchSimilar, fetchSimilarBatch } from "../lib/fetch-similar.ts";

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

beforeEach(() => {
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchSimilar", () => {
  it("returns empty array when server reports no neighbours", async () => {
    mockFetch(() => ({ body: { results: [], docId: "root" } }));
    const out = await fetchSimilar("root");
    expect(out).toEqual([]);
  });

  it("drops self-matches and sub-threshold rows", async () => {
    mockFetch(() => ({
      body: {
        results: [
          { id: "root", score: 0.99, type: "learning", source_file: "self.md" },
          { id: "a", score: 0.9, type: "learning", source_file: "a.md" },
          { id: "b", score: 0.5, type: "retro", source_file: "b.md" },
          { id: "c", score: 0.8, type: "learning", source_file: "c.md" },
        ],
      },
    }));
    const out = await fetchSimilar("root", { threshold: 0.75 });
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
    expect(out[0]!.score).toBe(0.9);
    expect(out[0]!.type).toBe("learning");
  });

  it("forwards model + limit as query params", async () => {
    let seen = "";
    mockFetch((url) => {
      seen = url;
      return { body: { results: [] } };
    });
    await fetchSimilar("root", { model: "bge-m3", limit: 20 });
    expect(seen).toContain("id=root");
    expect(seen).toContain("limit=20");
    expect(seen).toContain("model=bge-m3");
  });

  it("throws on HTTP error", async () => {
    mockFetch(() => ({ status: 404, body: { error: "not found" } }));
    await expect(fetchSimilar("missing")).rejects.toThrow(/HTTP 404/);
  });
});

describe("fetchSimilarBatch", () => {
  it("returns a Map keyed by input id", async () => {
    mockFetch((url) => {
      const m = url.match(/id=([^&]+)/);
      const id = m ? m[1] : "";
      return { body: { results: [{ id: `${id}-n`, score: 0.9 }] } };
    });
    const out = await fetchSimilarBatch(["a", "b"]);
    expect(out.size).toBe(2);
    expect(out.get("a")?.[0]?.id).toBe("a-n");
    expect(out.get("b")?.[0]?.id).toBe("b-n");
  });

  it("fires onProgress once per doc in order", async () => {
    mockFetch(() => ({ body: { results: [] } }));
    const progress: Array<[number, number, string]> = [];
    await fetchSimilarBatch(["x", "y", "z"], {
      onProgress: (done, total, id) => progress.push([done, total, id]),
    });
    expect(progress).toEqual([
      [1, 3, "x"],
      [2, 3, "y"],
      [3, 3, "z"],
    ]);
  });
});
