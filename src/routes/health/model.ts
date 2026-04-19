import { t } from 'elysia';

export const OraclesQuery = t.Object({
  hours: t.Optional(t.String()),
});
