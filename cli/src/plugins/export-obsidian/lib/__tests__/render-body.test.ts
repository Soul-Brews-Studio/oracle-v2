import { describe, expect, test } from "bun:test";
import { renderDocMarkdown, deriveTitle } from "../render-body.ts";
import type { ApiDoc, SimilarResult } from "../types.ts";

const slugForId = (id: string) => `doc-${id}`;

const doc: ApiDoc = {
  id: "A",
  type: "learning",
  content: "# Menu as first-class data\n\nBody line 1.\n\nBody line 2.",
  source_file: "learn/2026/menu.md",
  concepts: ["menu_ui", "drizzle"],
  project: "Soul-Brews-Studio/arra-oracle-v3",
  created_at: "2026-04-19T10:00:00Z",
};

const similar: SimilarResult[] = [
  { id: "B", score: 0.89 },
  { id: "C", score: 0.82 },
  { id: "D", score: 0.5 },   // below threshold 0.75 — dropped
  { id: "A", score: 0.99 },  // self — dropped
];

describe("renderDocMarkdown", () => {
  const out = renderDocMarkdown(doc, {
    similar,
    slugForId,
    model: "bge-m3",
    threshold: 0.75,
  });

  test("starts with frontmatter block", () => {
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("arra_id: A");
  });

  test("renders H1 title from content", () => {
    expect(out).toContain("# Menu as first-class data");
  });

  test("does not duplicate the H1 in the body", () => {
    const matches = out.match(/# Menu as first-class data/g) ?? [];
    expect(matches.length).toBe(1);
  });

  test("preserves original body content", () => {
    expect(out).toContain("Body line 1.");
    expect(out).toContain("Body line 2.");
  });

  test("renders wikilinks with score, skipping self + below-threshold", () => {
    expect(out).toContain("## Related (by embedding)");
    expect(out).toContain("- [[doc-B]] (0.89)");
    expect(out).toContain("- [[doc-C]] (0.82)");
    expect(out).not.toContain("doc-D");
    expect(out).not.toContain("doc-A]]");
  });

  test("renders Concepts section with #tag format", () => {
    expect(out).toContain("## Concepts");
    expect(out).toContain("#menu_ui #drizzle");
  });

  test("omits Related section when no neighbours pass threshold", () => {
    const lonely = renderDocMarkdown(doc, {
      similar: [{ id: "X", score: 0.1 }],
      slugForId,
      model: "bge-m3",
      threshold: 0.75,
    });
    expect(lonely).not.toContain("## Related");
  });

  test("is deterministic", () => {
    const a = renderDocMarkdown(doc, { similar, slugForId, model: "bge-m3", threshold: 0.75 });
    const b = renderDocMarkdown(doc, { similar, slugForId, model: "bge-m3", threshold: 0.75 });
    expect(a).toBe(b);
  });

  test("snapshot: small fixture shape", () => {
    // A full structural check — exact contents, no timestamps.
    expect(out).toMatchSnapshot();
  });
});

describe("deriveTitle", () => {
  test("prefers H1 from content", () => {
    expect(deriveTitle(doc)).toBe("Menu as first-class data");
  });

  test("falls back to source_file basename", () => {
    expect(
      deriveTitle({ ...doc, content: "no heading here" }),
    ).toBe("menu");
  });

  test("falls back to first 80 chars when no H1 and no source_file", () => {
    const longBody = "x".repeat(100);
    expect(
      deriveTitle({ ...doc, content: longBody, source_file: undefined }),
    ).toBe("x".repeat(80));
  });
});
