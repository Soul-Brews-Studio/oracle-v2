// Filename slugifier for the Obsidian vault.
// Owned by: weaver (issue #933, part 1).
//
// Rules:
//   - lowercase
//   - strip diacritics (NFKD decompose, drop combining marks)
//   - replace non-[a-z0-9] runs with single dash
//   - collapse multi-dashes, trim leading/trailing dashes
//   - cap length (default 80)
//   - preserve leading date prefixes (YYYY-MM-DD_ or YYYY-MM-DD_HH-MM_)

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2}(?:_\d{2}-\d{2})?)_+(.*)$/;

export function slugify(str: string, maxLen = 80): string {
  if (!str) return "untitled";

  const dateMatch = DATE_PREFIX_RE.exec(str);
  const prefix = dateMatch ? `${dateMatch[1]}_` : "";
  const rest = dateMatch ? dateMatch[2] : str;

  const slug = rest
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const body = slug || "untitled";
  const combined = `${prefix}${body}`;
  if (combined.length <= maxLen) return combined;

  // Truncate the body, keep the prefix intact.
  const budget = Math.max(1, maxLen - prefix.length);
  return `${prefix}${body.slice(0, budget).replace(/-+$/, "")}`;
}

/** Map (type, id, title) → "<folder>/<slug>.md". */
export function slugifyPath(type: string, id: string, title: string): string {
  const folder = folderForType(type);
  const slug = slugify(title || id);
  return `${folder}/${slug}.md`;
}

function folderForType(type: string): string {
  const t = type.toLowerCase();
  if (t === "principle") return "principles";
  if (t === "pattern") return "patterns";
  if (t === "learning") return "learnings";
  if (t === "retro" || t === "retrospective") return "retros";
  if (t === "reflection") return "reflections";
  if (t === "trace") return "traces";
  return `${t}s`;
}
