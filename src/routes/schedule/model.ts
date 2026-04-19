import { t } from 'elysia';

export const scheduleIdParam = t.Object({ id: t.String() });

export const listQuery = t.Object({
  date: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  filter: t.Optional(t.String()),
  status: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

export const createBody = t.Unknown();
export const updateBody = t.Unknown();
