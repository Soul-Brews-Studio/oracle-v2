const STUDIO_TAG = /^studio:(.+)$/;

export function parseStudioTag(tags: readonly string[] | undefined | null): string | null {
  if (!tags) return null;
  for (const tag of tags) {
    const m = STUDIO_TAG.exec(tag);
    if (m) return m[1].trim() || null;
  }
  return null;
}
