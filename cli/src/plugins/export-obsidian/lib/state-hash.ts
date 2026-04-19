// Deterministic content hash used by both export (writing state) and import
// (diffing against state). Kept standalone so the shape can't drift between
// the two plugins. Must match import-obsidian/lib/parse-body.ts:hashPayload.
//
// We normalise content the same way parse-body does: strip leading H1 so the
// export's rendered "# Title" + input content round-trip cleanly.

export function stripLeadingH1(body: string): string {
  return body.replace(/^\s*#\s+.+?\s*(?:\r?\n|$)/, "");
}

export function hashPayload(title: string, content: string, concepts: string[]): string {
  const body = stripLeadingH1(content).trim();
  const payload = `${title}\n---\n${body}\n---\n${concepts.slice().sort().join(",")}`;
  return Bun.hash(payload).toString(16);
}
