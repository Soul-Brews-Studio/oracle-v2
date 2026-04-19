export interface MenuItem {
  path: string;
  label: string;
  group: string;
  order: number;
  source: 'frontend' | 'api' | 'plugin';
}
