import type { Item } from './item.model.ts';

export type ItemSortColumn = Extract<keyof Item, 'title' | 'createdAt' | 'price'>;

export type SortDirection = 'asc' | 'desc';
