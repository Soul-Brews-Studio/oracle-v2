import { Elysia } from 'elysia';
import { statusRoute } from './status.ts';
import { loginRoute } from './login.ts';
import { logoutRoute } from './logout.ts';

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(statusRoute)
  .use(loginRoute)
  .use(logoutRoute);

export * from './session.ts';
export * from './model.ts';
