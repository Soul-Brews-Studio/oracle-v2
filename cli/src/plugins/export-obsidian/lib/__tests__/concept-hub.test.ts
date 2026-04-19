import { describe, expect, test } from "bun:test";
import { renderConceptHub } from "../concept-hub.ts";
import type { ApiDoc } from "../types.ts";

const slugForId = (id: string) => `doc-${id}`;

const docs: ApiDoc[] = [
  {
    id: "A",
    type: "learning",
    content: "# Menu UI lesson",
    source_file: "learn/menu.md",
    concepts: ["menu_ui"],
    created_at: "2026-04-19T10:00:00Z",
  },
  {
    id: "B",
    type: "retro",
    content: "body without heading",
    source_file: "retro/2026-04-18.md",
    concepts: ["menu_ui"],
    created_at: "2026-04-18T09:00:00Z",
  },
];

describe("renderConceptHub", () => {
  const out = renderConceptHub("menu_ui", docs, slugForId);

  test("has concept title", () => {
    expect(out.startsWith("# Concept: menu_ui")).toBe(true);
  });

  test("includes doc count description", () => {
    expect(out).toContain("2 docs");
  });

  test("renders a tag line", () => {
    expect(out).toContain("tags: #menu_ui");
  });

  test("sorts docs by created_at desc (newest first)", () => {
    const aIdx = out.indexOf("doc-A");
    const bIdx = out.indexOf("doc-B");
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(bIdx);
  });

  test("wikilinks include a readable label", () => {
    expect(out).toContain("[[doc-A|menu]]");
    expect(out).toContain("[[doc-B|2026-04-18]]");
  });

  test("empty docs list shows placeholder", () => {
    const empty = renderConceptHub("orphan", [], slugForId);
    expect(empty).toContain("_No docs yet._");
  });

  test("singular vs plural in description", () => {
    const one = renderConceptHub("solo", [docs[0]!], slugForId);
    expect(one).toContain("1 doc");
    expect(one).not.toContain("1 docs");
  });

  test("is deterministic", () => {
    expect(renderConceptHub("menu_ui", docs, slugForId))
      .toBe(renderConceptHub("menu_ui", docs, slugForId));
  });
});
