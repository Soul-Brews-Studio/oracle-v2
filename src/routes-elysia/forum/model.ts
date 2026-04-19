import { t } from 'elysia';

export const threadIdParam = t.Object({ id: t.String() });

export const threadsQuery = t.Object({
  status: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  offset: t.Optional(t.String()),
});

export const threadCreateBody = t.Unknown();

export const threadStatusBody = t.Unknown();
