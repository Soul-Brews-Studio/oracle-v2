/**
 * One-shot script: re-export schedule.md from DB
 * Usage: bun run scripts/reexport-schedule.ts
 */
import { db } from "../src/db/index.ts";
import { schedule } from "../src/db/schema.ts";
import { eq, asc } from "drizzle-orm";
import fs from "fs";
import os from "os";
import path from "path";

function fmt(d: Date) { return d.toISOString().slice(0, 10); }

const events = db.select().from(schedule).where(eq(schedule.status, "pending")).orderBy(asc(schedule.date), asc(schedule.time)).all();

const byMonth: Record<string, typeof events> = {};
for (const ev of events) {
  const month = ev.date.slice(0, 7);
  if (!byMonth[month]) byMonth[month] = [];
  byMonth[month].push(ev);
}

let md = `# Schedule\n\n**Updated**: ${fmt(new Date())}\n**Source**: oracle.db (auto-generated)\n`;

for (const [month, monthEvents] of Object.entries(byMonth).sort()) {
  const d = new Date(month + "-01");
  const monthName = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  md += `\n## ${monthName}\n\n`;
  md += `| Date | Time | Event | Notes |\n`;
  md += `|------|------|-------|-------|\n`;
  for (const ev of monthEvents) {
    const dateDisplay = ev.dateRaw || ev.date;
    const recur = ev.recurring ? ` (${ev.recurring})` : "";
    md += `| ${dateDisplay} | ${ev.time || "TBD"} | ${ev.event}${recur} | ${ev.notes || ""} |\n`;
  }
}

md += `\n---\n\nManaged by Oracle. Add events via \`oracle_schedule_add\` or the web UI.\n`;

const schedulePath = path.join(os.homedir(), ".oracle", "ψ/inbox/schedule.md");
fs.mkdirSync(path.dirname(schedulePath), { recursive: true });
fs.writeFileSync(schedulePath, md, "utf-8");
console.log("Exported", events.length, "events to", schedulePath);
