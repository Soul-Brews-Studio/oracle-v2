import type { MenuItem } from '../routes/menu/model.ts';

const items: MenuItem[] = [
  { path: '/canvas', label: 'Canvas', group: 'tools', order: 80, source: 'page' },
  { path: '/planets', label: 'Planets', group: 'tools', order: 81, source: 'page' },
  { path: '/map', label: 'Map', group: 'tools', order: 82, source: 'page' },
  { path: '/compare', label: 'Compare', group: 'tools', order: 83, source: 'page' },
  { path: '/evolution', label: 'Evolution', group: 'tools', order: 84, source: 'page' },
  { path: '/settings', label: 'Settings', group: 'hidden', order: 99, source: 'page' },
];

export default items;
