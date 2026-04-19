import { t } from 'elysia';

export const MAX_SUMMARY_CHARS = 4000;

export const SummaryParams = t.Object({
  id: t.String({ minLength: 1 }),
});

export const SummaryBody = t.Object({
  summary: t.String(),
  oracle: t.Optional(t.String()),
});
