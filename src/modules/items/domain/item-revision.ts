import type { Item } from './item.model.ts';
import {
  AutoItemParamsSchema,
  ElectronicsEstateItemParamsSchema,
  RealEstateItemParamsSchema,
} from '../contracts/item-update.contract.ts';

export const doesItemNeedRevision = (item: Item): boolean =>
  !Boolean(item.description) ||
  !(() => {
    if (item.category === 'auto')
      return AutoItemParamsSchema.safeParse(item.params).success;
    if (item.category === 'real_estate')
      return RealEstateItemParamsSchema.safeParse(item.params).success;

    return ElectronicsEstateItemParamsSchema.safeParse(item.params).success;
  })();
