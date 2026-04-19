import { t } from 'elysia';

export const ActivityQuery = t.Object({
  days: t.Optional(t.String()),
});

export const GrowthQuery = t.Object({
  period: t.Optional(t.String()),
});

export const SessionStatsQuery = t.Object({
  since: t.Optional(t.String()),
});
