/**
 * TypeBox schemas for knowledge routes.
 */

import { t } from 'elysia';

export const LearnBody = t.Any();
export const HandoffBody = t.Any();

export const InboxQuery = t.Object({
  limit: t.Optional(t.String()),
  offset: t.Optional(t.String()),
  type: t.Optional(t.String()),
});
