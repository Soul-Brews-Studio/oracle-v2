/**
 * GET /api/reflect — oracle's current self-reflection.
 */

import { Elysia } from 'elysia';
import { handleReflect } from '../../server/handlers.ts';

export const reflectEndpoint = new Elysia().get('/reflect', () => handleReflect());
