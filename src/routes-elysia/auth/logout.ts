import { Elysia } from 'elysia';
import { SESSION_COOKIE_NAME } from './session.ts';

export const logoutRoute = new Elysia().post('/logout', ({ cookie }) => {
  cookie[SESSION_COOKIE_NAME].set({
    value: '',
    expires: new Date(0),
    maxAge: 0,
    path: '/',
  });
  return { success: true };
});
