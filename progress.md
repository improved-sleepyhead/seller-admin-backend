2026-03-23 - TASK-001 done
- Added centralized environment config in src/config.ts for PORT, AI_ENABLED, OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_BASE_URL, AI_TIMEOUT_MS with safe defaults.
- Switched server port wiring in server.ts from direct env access to config.port.
- Test steps passed:
1. Started with PORT=9090 and without OPENROUTER_API_KEY.
2. Verified server listens on 9090 and starts without crash.
3. Verified config.ai resolves to disabled state (enabled=false, provider=null) without exceptions.

2026-03-24 - TASK-002 re-run validated on branch cors
- Re-ran TASK-002 preflight checks end-to-end after instruction update.
- Verified OPTIONS /items/1 with Origin and Access-Control-Request-Method: PUT returns 204 with Access-Control-Allow-Origin/Methods/Headers.
- Verified OPTIONS /api/ai/description returns browser-compatible preflight headers and 204.
- Additionally verified allowlist mode via CORS_ALLOWED_ORIGINS: allowed origin gets CORS headers, blocked origin does not.

2026-03-24 - TASK-003 done
- Added shared ApiErrorResponse/AppError utilities and a global Fastify error handler for normalized public failures.
- Updated item endpoints to return stable VALIDATION_ERROR, NOT_FOUND, and INTERNAL_ERROR DTOs instead of heterogeneous error bodies.
- Test steps passed:
1. GET /items/abc -> 400 VALIDATION_ERROR.
2. GET /items/999999 -> 404 NOT_FOUND.
3. Simulated handler exception through a temporary inject-only route -> 500 INTERNAL_ERROR without stack trace in response body.

2026-03-24 - TASK-004 done
- Expanded `GET /items` list DTO to return the full frontend-facing item shape instead of a truncated subset.
- Preserved the stable `{ items, total }` response contract and kept `needsRevision` as an optional convenience field alongside source fields.
- Test steps passed:
1. GET /items returned 200 without query params.
2. Verified the first item contains `id`, `description`, `params`, `createdAt`, and `updatedAt`.
3. Verified `total` matches the filtered dataset size rather than the current page length.

2026-03-24 - TASK-011 done
- Added `GET /api/ai/status` with a stable frontend-facing contract derived from centralized AI config.
- The endpoint returns `enabled`, `provider`, `model`, and feature flags for `description`, `price`, and `chat` without exposing provider internals or secrets.
- Test steps passed:
1. Started the server without `OPENROUTER_API_KEY` and called `GET /api/ai/status`.
2. Verified `enabled=false`, `provider=null`, `model=null`, and all feature flags disabled.
3. Started the server with `OPENROUTER_API_KEY=dummy-key` and `OPENROUTER_MODEL=test-model`, then verified `enabled=true`, `provider='openrouter'`, and `model='test-model'`.

2026-03-24 - TASK-005 done
- Added `price` to the allowed `sortColumn` query values for `GET /items`.
- Extended the list sorting logic to support ascending and descending ordering by item price while preserving the stable `{ items, total }` contract.
- Test steps passed:
1. Called `GET /items?sortColumn=price&sortDirection=asc`.
2. Verified prices in the response do not decrease.
3. Called `GET /items?sortColumn=price&sortDirection=desc` and verified the reverse order.

2026-03-24 - TASK-006 done
- Tightened `GET /items` query parsing so `limit`, `skip`, `needsRevision`, and `categories` behave predictably with frontend URL-state.
- Preserved combined server-side search, filtering, sorting, and pagination while rejecting malformed query values with the unified validation error DTO.
- Test steps passed:
1. Called `GET /items?q=mit&categories=auto&limit=1&skip=0` and verified the response contains one item with `total=1`.
2. Confirmed pagination is applied after filtering by checking the response contains no more than one item while keeping the filtered total.
3. Called requests with invalid `limit` and invalid `categories` values and verified both return `400 VALIDATION_ERROR`.

2026-03-24 - TASK-007 done
- Stabilized `GET /items/:id` behind an explicit details DTO mapper instead of returning the raw data object directly.
- Preserved the frontend-facing single-object contract with `id`, `category`, `title`, `description`, `price`, `createdAt`, `updatedAt`, `params`, and optional `needsRevision`.
- Test steps passed:
1. Called `GET /items/1` and verified the full item details structure.
2. Verified category-specific `params` on `auto`, `real_estate`, and `electronics` examples.
3. Called `GET /items/abc` and `GET /items/999999` and verified `400 VALIDATION_ERROR` / `404 NOT_FOUND`.

2026-03-24 - TASK-008 done
- Tightened `PUT /items/:id` validation to require the full `ItemUpdateIn` payload, including complete category-specific `params`.
- Removed server-side category injection so the request body itself is validated against the public contract, while preserving `id` and `createdAt` and refreshing `updatedAt` on success.
- Test steps passed:
1. Sent a valid full `PUT /items/1` payload and verified `{ success: true }`.
2. Read the same item back via `GET /items/1` and verified `updatedAt` changed while `id` and `createdAt` stayed unchanged.
3. Sent a partial `params` payload and verified `400 VALIDATION_ERROR`.

2026-03-24 - TASK-009 done
- Centralized payload size limits in `src/constants.ts` and reused them across item update and AI request schemas.
- Added request validation for `/api/ai/description`, `/api/ai/price`, and `/api/ai/chat` before any AI availability handling so empty and oversized payloads fail with the unified public error DTO.
- Test steps passed:
1. Sent an empty body to `PUT /items/1` and verified `400 VALIDATION_ERROR`.
2. Sent an oversized `description` to `PUT /items/1` and `/api/ai/description`, and an oversized `userMessage` to `/api/ai/chat`; each returned `400`.
3. Verified both item and AI validation failures use the stable `{ success: false, code: 'VALIDATION_ERROR', message, details? }` format.

2026-03-24 - TASK-010 done
- Added a centralized `src/ai/openrouter-client.ts` with shared base URL, timeout, headers, safe response parsing, and normalized usage extraction for OpenRouter chat completions.
- Wired AI server status and availability checks through the same client config path, while keeping public AI DTOs unchanged until the endpoint tasks are implemented.
- Test steps passed:
1. Started the app with `PORT=9090`, `OPENROUTER_API_KEY=test-openrouter-key`, `OPENROUTER_MODEL=test-model`, and verified `GET /api/ai/status` returned `enabled=true` and `model=test-model`.
2. Exercised the client against a local mock provider and verified upstream `500` maps to controlled `502 AI_PROVIDER_ERROR`, while a delayed response maps to controlled `504 AI_PROVIDER_ERROR`.
3. Captured client logs during those scenarios and verified they only include safe metadata (`endpoint`, `model`, `durationMs`, `status`) and do not contain the full API key.

2026-03-24 - TASK-010 re-run validated on branch feat/openrouter-client
- Refactored the OpenRouter client to match the documented request and response shape more closely: request-level `provider` preferences, `plugins`, extra headers, broader message schema, preserved response `id`, and stricter documented choice parsing for error/tool-call cases.
- Fixed the fallback abort wiring so caller-side aborts still reach `fetch` when `AbortSignal.any` is unavailable, while keeping timeout handling and public backend AI contracts unchanged.
- Test steps re-run passed:
1. Started the app with `PORT=9090`, `OPENROUTER_API_KEY=test-openrouter-key`, and `OPENROUTER_MODEL=test-model`, then verified `GET /api/ai/status` returned `enabled=true` and `model=test-model`.
2. Re-ran a local mock-provider script and verified upstream `500` maps to controlled `502 AI_PROVIDER_ERROR`, while a delayed response maps to controlled `504 AI_PROVIDER_ERROR`.
3. Verified captured client logs contain only safe metadata and do not include the full API key.

2026-03-24 - TASK-012 done
- Added shared AI prompt builders with one stable base system prompt and separate endpoint instructions for `description`, `price`, and `chat`.
- Centralized item-context prompt assembly so future AI routes can reuse the same backend-owned prompt construction without asking frontend for system instructions.
- Test steps passed:
1. Built prompts for `description`, `price`, and `chat` against the same item through `src/ai/ai-prompts.test.ts`.
2. Verified all prompt variants include item context plus endpoint-specific task wording.
3. Verified builders inject the shared system prompt themselves, so frontend does not need to send system instructions.

2026-03-24 - TASK-013 done
- Implemented `POST /api/ai/description` via the shared OpenRouter client and prompt builders with server-side response normalization to the stable `{ suggestion, model?, usage? }` contract.
- Added schema-guided response formatting preference and normalization that accepts structured JSON output but still safely falls back to plain text when the provider returns a clean description string.
- Test steps passed:
1. Sent a valid `/api/ai/description` request with an empty `description` and verified a `200` response with string `suggestion`.
2. Verified the returned `suggestion` is suitable for direct textarea insertion and the response includes normalized `model` and `usage` metadata.
3. Sent an invalid payload and verified `400 VALIDATION_ERROR`.
