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
    completionMaxTokens: {
      description: 1200,
      price: 300,
      chat: 400,
    },
  },
} as const;
