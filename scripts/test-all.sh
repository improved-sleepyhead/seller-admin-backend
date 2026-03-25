#!/bin/zsh

set -euo pipefail

cd "$(dirname "$0")/.."

node --test --import tsx tests/server.test.ts
node --test --import tsx tests/server.smoke.test.ts
node --test --import tsx tests/modules/ai/prompts/ai-prompts.test.ts
node --test --import tsx tests/modules/ai/providers/openrouter/openrouter.client.test.ts
