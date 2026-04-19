import type { MenuItem } from './types.ts';

const items: MenuItem[] = [
  { path: '/canvas', label: 'Canvas', group: 'tools', order: 80, source: 'frontend' },
  { path: '/playground', label: 'Playground', group: 'tools', order: 81, source: 'frontend' },
  { path: '/compare', label: 'Compare', group: 'tools', order: 82, source: 'frontend' },
  { path: '/evolution', label: 'Evolution', group: 'tools', order: 83, source: 'frontend' },
  { path: '/settings', label: 'Settings', group: 'hidden', order: 99, source: 'frontend' },
];

export default items;
