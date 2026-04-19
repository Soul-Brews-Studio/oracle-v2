import { describe, expect, test } from "bun:test";
import { slugify, slugifyPath } from "../lib/slugify.ts";

describe("slugify", () => {
  test("lowercases ASCII", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("strips diacritics", () => {
    expect(slugify("Café résumé — ñoño")).toBe("cafe-resume-nono");
  });

  test("collapses non-alphanumeric runs", () => {
    expect(slugify("foo!!!bar   baz___qux")).toBe("foo-bar-baz-qux");
  });

  test("trims leading/trailing dashes", () => {
    expect(slugify("  ---hello--- ")).toBe("hello");
  });

  test("caps length at maxLen (default 80)", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  test("respects custom maxLen", () => {
    expect(slugify("hello world foo bar baz qux", 10)).toBe("hello-worl");
  });

  test("returns 'untitled' for empty or purely-punctuation input", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("!!!@@@###")).toBe("untitled");
  });

  test("preserves YYYY-MM-DD_ date prefix", () => {
    expect(slugify("2026-04-19_Menu as First Class")).toBe(
      "2026-04-19_menu-as-first-class",
    );
  });

  test("preserves YYYY-MM-DD_HH-MM_ full timestamp prefix", () => {
    expect(slugify("2026-04-19_12-48_Menu UI Full Vertical")).toBe(
      "2026-04-19_12-48_menu-ui-full-vertical",
    );
  });

  test("keeps prefix intact when truncating", () => {
    const result = slugify(
      "2026-04-19_" + "reallyLongTitle".repeat(20),
      30,
    );
    expect(result.startsWith("2026-04-19_")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe("slugifyPath", () => {
  test("maps principle → principles/<slug>.md", () => {
    expect(slugifyPath("principle", "id1", "Nothing Deleted")).toBe(
      "principles/nothing-deleted.md",
    );
  });

  test("maps learning → learnings/<slug>.md", () => {
    expect(
      slugifyPath("learning", "id2", "2026-04-19_Menu as First Class Data"),
    ).toBe("learnings/2026-04-19_menu-as-first-class-data.md");
  });

  test("maps retro and retrospective to retros/", () => {
    expect(slugifyPath("retro", "id", "Foo")).toBe("retros/foo.md");
    expect(slugifyPath("retrospective", "id", "Foo")).toBe("retros/foo.md");
  });

  test("falls back to <type>s/ for unknown types", () => {
    expect(slugifyPath("spark", "id", "Bright Idea")).toBe(
      "sparks/bright-idea.md",
    );
  });

  test("falls back to id when title empty", () => {
    expect(slugifyPath("learning", "0197abc-def", "")).toBe(
      "learnings/0197abc-def.md",
    );
  });
});
