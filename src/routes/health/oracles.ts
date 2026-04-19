import { Elysia } from 'elysia';
import { sqlite } from '../../db/index.ts';
import { OraclesQuery } from './model.ts';

let oracleCache: { data: unknown; ts: number } | null = null;

export const oraclesEndpoint = new Elysia().get('/oracles', ({ query }) => {
  const parsed = parseInt(query.hours ?? '168');
  const hours = Number.isFinite(parsed) ? parsed : 168;
  const now = Date.now();
  if (oracleCache && (now - oracleCache.ts) < 60_000) return oracleCache.data;

  const cutoff = now - hours * 3600_000;
  const identities = sqlite.prepare(`
    SELECT oracle_name, source, max(last_seen) as last_seen, sum(actions) as actions
    FROM (
      SELECT author as oracle_name, 'forum' as source, max(created_at) as last_seen, count(*) as actions
        FROM forum_messages WHERE author IS NOT NULL AND created_at > ?
        GROUP BY author
      UNION ALL
      SELECT COALESCE(session_id, 'unknown') as oracle_name, 'trace' as source, max(created_at) as last_seen, count(*) as actions
        FROM trace_log WHERE created_at > ?
        GROUP BY session_id
      UNION ALL
      SELECT COALESCE(source, project, 'unknown') as oracle_name, 'learn' as source, max(created_at) as last_seen, count(*) as actions
        FROM learn_log WHERE created_at > ?
        GROUP BY COALESCE(source, project)
    )
    WHERE oracle_name IS NOT NULL AND oracle_name != 'unknown'
    GROUP BY oracle_name
    ORDER BY last_seen DESC
  `).all(cutoff, cutoff, cutoff);

  const projects = sqlite.prepare(`
    SELECT project, count(*) as docs,
           count(DISTINCT type) as types,
           max(created_at) as last_indexed
    FROM oracle_documents
    WHERE project IS NOT NULL
    GROUP BY project
    ORDER BY last_indexed DESC
  `).all();

  const result = {
    identities,
    projects,
    total_projects: projects.length,
    total_identities: identities.length,
    window_hours: hours,
    cached_at: new Date().toISOString(),
  };
  oracleCache = { data: result, ts: now };
  return result;
}, {
  query: OraclesQuery,
  detail: {
    tags: ['health', 'nav:hidden'],
    summary: 'Oracle identities + project activity',
  },
});
