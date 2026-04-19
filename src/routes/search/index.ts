/**
 * Search Routes (Elysia) — composes /api/{search,reflect,similar,map,map3d,list}.
 */

import { Elysia } from 'elysia';
import { searchEndpoint } from './search.ts';
import { reflectEndpoint } from './reflect.ts';
import { similarEndpoint } from './similar.ts';
import { mapEndpoint } from './map.ts';
import { map3dEndpoint } from './map3d.ts';
import { listEndpoint } from './list.ts';

export const searchRoutes = new Elysia({ prefix: '/api' })
  .use(searchEndpoint)
  .use(reflectEndpoint)
  .use(similarEndpoint)
  .use(mapEndpoint)
  .use(map3dEndpoint)
  .use(listEndpoint);
