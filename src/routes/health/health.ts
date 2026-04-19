import { Elysia } from 'elysia';
import { PORT } from '../../config.ts';
import { MCP_SERVER_NAME } from '../../const.ts';

export const healthEndpoint = new Elysia().get('/health', () => ({
  status: 'ok',
  server: MCP_SERVER_NAME,
  port: PORT,
  oracle: 'connected',
}), {
  detail: {
    tags: ['health', 'nav:hidden'],
    summary: 'Server liveness check',
  },
});
