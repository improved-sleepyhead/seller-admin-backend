export const ITEM_CATEGORIES = {
  AUTO: 'auto',
  REAL_ESTATE: 'real_estate',
  ELECTRONICS: 'electronics',
} as const;

export const INPUT_LIMITS = {
  item: {
    titleMaxLength: 160,
    descriptionMaxLength: 5000,
  },
  ai: {
    priceReasoningMaxLength: 500,
    userMessageMaxLength: 2000,
    historyMessageMaxLength: 2000,
    historyMaxItems: 20,
  },
} as const;
