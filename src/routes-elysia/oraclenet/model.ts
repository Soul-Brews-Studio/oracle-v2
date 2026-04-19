import { t } from 'elysia';
import { ORACLENET_DEFAULT_URL } from '../../const.ts';

export const ORACLENET_URL = process.env.ORACLENET_URL || ORACLENET_DEFAULT_URL;

export const FeedQuery = t.Object({
  sort: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

export const OraclesQuery = t.Object({
  limit: t.Optional(t.String()),
});
