# Architecture

## Goal

This backend is a frontend-facing Fastify API with stable public DTOs, a single normalized error format, and isolated AI-provider integration.

The codebase is organized to keep:

- application bootstrap separate from business logic;
- shared cross-cutting concerns separate from feature code;
- `items` and `ai` logic isolated in independent modules;
- provider-specific OpenRouter details hidden inside the AI module;
- tests outside production code under `tests/`.

## High-Level Structure

```text
.
├── server.ts
├── src/
│   ├── app/
│   │   ├── bootstrap.ts
│   │   ├── build-app.ts
│   │   ├── http/
│   │   │   ├── abort-on-disconnect.ts
│   │   │   └── sse.ts
│   │   └── plugins/
│   │       ├── cors.plugin.ts
│   │       ├── dev-delay.plugin.ts
│   │       └── error-handler.plugin.ts
│   ├── modules/
│   │   ├── ai/
│   │   │   ├── contracts/
│   │   │   ├── mapper/
│   │   │   ├── prompts/
│   │   │   ├── providers/
│   │   │   │   └── openrouter/
│   │   │   ├── routes/
│   │   │   └── service/
│   │   └── items/
│   │       ├── contracts/
│   │       ├── domain/
│   │       ├── mapper/
│   │       ├── repository/
│   │       ├── routes/
│   │       └── service/
│   └── shared/
│       ├── config/
│       ├── constants/
│       ├── contracts/
│       ├── errors/
│       └── logging/
└── tests/
    ├── server.test.ts
    ├── server.smoke.test.ts
    └── modules/ai/
```

## Entry Points

### `server.ts`

Thin runtime entrypoint only.

- does not contain business logic;
- imports startup helpers from `src/app/bootstrap.ts`;
- starts the server only when executed as the main module.

### `src/app/bootstrap.ts`

Runtime bootstrap.

- determines whether the file is the main module;
- calls `buildApp()`;
- starts Fastify on `config.port`.

### `src/app/build-app.ts`

Composition root for the application.

- creates Fastify;
- registers middleware/plugins;
- instantiates infrastructure objects;
- wires modules together:
  - `items` gets `createInMemoryItemsRepository()` and `createItemsService()`;
  - `ai` gets `createOpenRouterClient(config.ai, fastify.log)`;
- registers routes for both feature modules.

This file is the only place where module dependencies are composed together.

## Shared Layer

`src/shared` contains reusable cross-cutting code that is not owned by a single feature.

### `shared/config`

- `env.ts` reads and parses raw environment variables.
- `app-config.ts` builds the typed runtime config object used across the app.

Rules:

- only this layer should read `process.env`;
- feature modules should depend on `config`, not on raw env values.

### `shared/constants`

Centralized static constants:

- input limits;
- item categories.

Rules:

- limits must not be duplicated across feature modules;
- shared enums/constants live here if used by multiple layers.

### `shared/contracts`

Public shared DTO contracts.

- `api-error.contract.ts` defines the normalized error response schema.

Rules:

- only contracts that are truly shared across modules belong here;
- feature-specific request/response schemas live inside the feature module.

### `shared/errors`

Error primitives and translation:

- `app-error.ts` defines `AppError` and stable application error constructors;
- `api-error.mapper.ts` converts thrown errors into the public error DTO.

Rules:

- routes/services throw typed app errors;
- only the error mapper decides how unknown errors become public responses.

### `shared/logging`

Safe logging helpers:

- strips query strings from logged endpoints;
- logs only safe metadata for API failures and requests.

Rules:

- do not log secrets, raw provider payloads, or full user text;
- keep public endpoint names stable in logs.

## App Infrastructure Layer

`src/app` contains HTTP/runtime concerns, not business logic.

### `app/plugins`

- `error-handler.plugin.ts` installs the global Fastify error handler;
- `cors.plugin.ts` applies CORS/preflight behavior;
- `dev-delay.plugin.ts` applies artificial delay for UI loading-state testing.

Rules:

- route-independent HTTP behavior belongs here;
- plugin code should not know business rules of `items` or `ai`.

### `app/http`

- `sse.ts` contains SSE helpers and content-type utilities;
- `abort-on-disconnect.ts` aborts upstream work when the client disconnects.

Rules:

- connection lifecycle and SSE transport details live here;
- feature modules can reuse these helpers but should not reimplement them.

## Items Module

`src/modules/items` owns the item domain and item HTTP API.

### `items/domain`

- `item.model.ts` defines the core item shape;
- `item.types.ts` defines sort-related types;
- `item-revision.ts` contains derived domain logic like `doesItemNeedRevision`.

Rules:

- domain files define core business shapes and derived rules;
- no Fastify-specific code here.

### `items/contracts`

Feature request/response schemas:

- `items-query.contract.ts`
- `item-update.contract.ts`
- `item-read.contract.ts`
- `item-response.contract.ts`

Rules:

- all item request validation and response DTO schemas live here;
- public item contracts must remain frontend-stable.

### `items/repository`

Persistence boundary:

- `items.repository.ts` defines the repository interface;
- `in-memory-items.repository.ts` provides the current JSON-backed in-memory implementation.

Rules:

- services depend on repository interfaces, not storage details;
- storage replacement should happen here, not in routes/services.

### `items/service`

Business orchestration:

- parses and validates item ids at service boundary;
- performs list filtering, sorting, pagination, read, and update behavior;
- throws domain/application errors when needed.

Rules:

- service contains business behavior;
- service does not know Fastify request/reply objects.

### `items/mapper`

Maps domain entities into public DTOs.

- `item.mapper.ts` normalizes item output before it leaves the backend.

Rules:

- normalization for frontend-safe item output belongs here;
- routes should return mapped DTOs, not raw repository records.

### `items/routes`

HTTP adapters for `/items` endpoints.

- parse inbound request payloads with contracts;
- call the service;
- serialize results through response contracts/mappers.

Rules:

- routes are thin;
- no business logic duplication from the service layer.

## AI Module

`src/modules/ai` owns all frontend-facing AI endpoints and hides provider internals.

### `ai/contracts`

AI request/response/SSE contracts:

- `ai-request.contract.ts`
- `ai-response.contract.ts`
- `ai-stream.contract.ts`

Rules:

- these are the public frontend-facing AI contracts;
- provider-specific response shape must never leak past this boundary.

### `ai/prompts`

Prompt building is split into small focused files:

- `base.prompt.ts` for shared system prompt;
- `item-context.prompt.ts` for ad context serialization;
- endpoint-specific prompt files for description, price, and chat.

Rules:

- prompt building is backend-owned;
- routes/services do not build ad-hoc prompt strings inline.

### `ai/mapper`

- `ai-response.mapper.ts` contains shared response parsing helpers like JSON/code-fence parsing.

Rules:

- normalization helpers shared across AI services belong here;
- do not mix provider transport code into response mappers.

### `ai/service`

AI use-case orchestration:

- `ai-status.service.ts`
- `ai-description.service.ts`
- `ai-price.service.ts`
- `ai-chat.service.ts`

Responsibilities:

- build prompt messages;
- call the provider client;
- normalize provider text into stable backend-owned DTOs;
- enforce AI-specific output rules.

Rules:

- services know AI use-case behavior;
- services do not know Fastify transport details except through explicit inputs like `AbortSignal`.

### `ai/providers/openrouter`

Provider-specific transport implementation:

- `openrouter.client.ts` is the public provider client factory used by the app;
- `openrouter.types.ts` contains provider/client types;
- `openrouter.request.ts` builds request bodies and abort wiring;
- `openrouter.response.ts` parses and validates standard responses;
- `openrouter.stream.ts` parses SSE frames from the provider.

Rules:

- raw OpenRouter details stay inside this folder;
- the rest of the app should depend on `OpenRouterClient`, not on raw payload details;
- no public API contract should directly reuse provider response DTOs.

### `ai/routes`

HTTP adapters for:

- `GET /api/ai/status`
- `POST /api/ai/description`
- `POST /api/ai/price`
- `POST /api/ai/chat`

Responsibilities:

- parse requests with module contracts;
- use connection-abort helpers;
- switch between JSON chat response and SSE streaming response;
- map thrown errors into stable public error/SSE events.

Rules:

- routes should remain transport adapters;
- streaming and abort wiring belongs here together with shared HTTP helpers.

## Request Flow

### Items endpoints

`HTTP request -> items routes -> item contracts -> items service -> items repository -> item mapper -> public DTO`

### AI endpoints

`HTTP request -> ai routes -> ai contracts -> ai service -> prompt builders -> OpenRouter client -> ai normalization -> public DTO/SSE event`

## Dependency Direction

Preferred dependency direction:

`app -> modules -> shared`

More precisely:

- `server.ts` depends on `app`;
- `app` composes `modules` and `shared`;
- `routes` depend on `service`, `contracts`, `mappers`, and shared HTTP helpers;
- `service` depends on `repository`, domain code, prompt builders, provider client interfaces, and shared errors/constants;
- `repository` depends on domain types;
- `shared` must not depend on feature modules.

Rules:

- do not import from `app` into `shared`;
- do not make `items` depend on `ai` or `ai` depend on `items/routes`;
- if code is feature-specific, keep it inside the feature module.

## Public Contract Rules

The structure changed, but the public behavior must stay stable:

- `GET /items` returns `{ items, total }`;
- `GET /items/:id` returns a single object;
- `PUT /items/:id` returns `{ success: true }` on success;
- all errors return `{ success: false, code, message, details? }`;
- AI endpoints return backend-normalized responses, never raw OpenRouter payloads;
- streaming chat emits backend-owned SSE events, not provider frames.

## Testing Layout

Tests are isolated under `tests/`:

- `tests/server.test.ts` contains the main runtime contract/integration checks;
- `tests/server.smoke.test.ts` contains live HTTP smoke/e2e checks;
- `tests/modules/ai/...` contains focused module-level AI tests.

Rules:

- no test files live under production `src` anymore;
- module-level tests should mirror the production folder structure when useful;
- runtime and smoke tests should continue validating the public API surface.

## Practical Conventions

- New shared code goes to `src/shared` only if it is reused across features.
- New item-related code goes to `src/modules/items`.
- New AI-related code goes to `src/modules/ai`.
- New transport/runtime helpers go to `src/app`.
- Keep routes thin and move branching/logic into services or provider helpers.
- Keep schemas close to the module boundary they validate.
- Keep provider-specific parsing isolated from public DTO normalization.
