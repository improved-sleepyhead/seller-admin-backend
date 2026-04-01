# Архитектура Backend

## Цель

Этот backend построен как frontend-facing Fastify API со стабильными публичными DTO, единым нормализованным форматом ошибок и изолированной интеграцией с AI-провайдером.

Структура кода организована так, чтобы:

- bootstrap приложения был отделён от бизнес-логики;
- общие cross-cutting части были отделены от feature-кода;
- логика `items` и `ai` жила в независимых модулях;
- provider-specific детали OpenRouter не выходили за пределы AI-модуля;
- тесты находились отдельно от production-кода в `tests/`.

## Общая структура проекта

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
│   │       ├── error-handler.plugin.ts
│   │       └── swagger.plugin.ts
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

## Точки входа

### `server.ts`

Тонкая runtime-точка входа.

- не содержит бизнес-логики;
- импортирует startup helper'ы из `src/app/bootstrap.ts`;
- запускает сервер только если исполняется как главный модуль.

### `src/app/bootstrap.ts`

Runtime bootstrap приложения.

- определяет, запущен ли файл как основной модуль;
- вызывает `buildApp()`;
- стартует Fastify на `config.port`.

### `src/app/build-app.ts`

Composition root приложения.

- создаёт экземпляр Fastify;
- регистрирует middleware и plugin'ы;
- создаёт инфраструктурные объекты;
- связывает между собой feature-модули;
- регистрирует routes для `items` и `ai`.

Это единственное место, где собираются зависимости модулей.

Смысл этого файла можно свести к такой схеме:

```ts
const app = Fastify();

await app.register(errorHandlerPlugin);
await app.register(corsPlugin);
await app.register(swaggerPlugin);

const itemsRepository = createInMemoryItemsRepository();
const itemsService = createItemsService(itemsRepository);
const aiClient = createOpenRouterClient(config.ai, app.log);

registerItemsRoutes(app, itemsService);
registerAiRoutes(app, { aiClient });
```

## Слой `shared`

`src/shared` содержит переиспользуемый cross-cutting код, который не принадлежит одной фиче.

### `shared/config`

- `env.ts` читает и парсит raw environment variables.
- `app-config.ts` строит типизированный runtime config, которым пользуется всё приложение.

Правила:

- только этот слой должен читать `process.env`;
- feature-модули должны зависеть от `config`, а не от сырых env-переменных.

### `shared/constants`

Централизованные статические константы:

- лимиты входных данных;
- категории объявлений.

Правила:

- лимиты не должны дублироваться по модулям;
- общие enum-like значения и константы живут здесь, если используются в нескольких слоях.

### `shared/contracts`

Общие публичные DTO-контракты.

- `api-error.contract.ts` определяет нормализованный error response schema.

Правила:

- сюда попадают только действительно общие контракты;
- feature-specific request/response схемы живут внутри соответствующего модуля.

### `shared/errors`

Базовые типы ошибок и их трансляция:

- `app-error.ts` определяет `AppError` и стабильные error constructor'ы;
- `api-error.mapper.ts` переводит выброшенные ошибки в публичный error DTO.

Правила:

- routes и service-слой выбрасывают typed app errors;
- только error mapper решает, как неизвестные исключения превращаются в публичные ответы.

### `shared/logging`

Безопасные logging helper'ы:

- убирают query string из имён endpoint'ов в логах;
- логируют только безопасные метаданные запросов и ошибок.

Правила:

- не логировать секреты, raw provider payload'ы и полный пользовательский текст;
- сохранять стабильные имена публичных endpoint'ов в логах.

## Слой `app`

`src/app` содержит HTTP/runtime concerns, а не бизнес-логику.

### `app/plugins`

- `error-handler.plugin.ts` подключает глобальный Fastify error handler;
- `cors.plugin.ts` настраивает CORS и preflight;
- `dev-delay.plugin.ts` добавляет искусственную задержку для UI loading-state тестов;
- `swagger.plugin.ts` публикует OpenAPI и Swagger UI.

Правила:

- route-independent HTTP-поведение живёт здесь;
- plugin-код не должен знать бизнес-правила `items` или `ai`.

### `app/http`

- `sse.ts` содержит SSE helper'ы и content-type utility;
- `abort-on-disconnect.ts` отменяет upstream-работу, если клиент оборвал соединение.

Правила:

- жизненный цикл соединения и SSE transport detail живут здесь;
- feature-модули могут использовать эти helper'ы, но не должны дублировать их реализацию.

## Модуль `items`

`src/modules/items` владеет доменом объявлений и HTTP API для работы с ними.

### `items/domain`

- `item.model.ts` определяет базовую форму объявления;
- `item.types.ts` содержит типы, связанные с сортировкой;
- `item-revision.ts` содержит производную доменную логику вроде `doesItemNeedRevision`.

Правила:

- доменные файлы описывают core business shapes и derived rules;
- Fastify-specific кода здесь быть не должно.

### `items/contracts`

Схемы request/response:

- `items-query.contract.ts`
- `item-update.contract.ts`
- `item-read.contract.ts`
- `item-response.contract.ts`

Правила:

- вся item request validation и response DTO схема живут здесь;
- публичные item contract'ы должны оставаться стабильными для frontend.

### `items/repository`

Граница хранения данных:

- `items.repository.ts` определяет repository interface;
- `in-memory-items.repository.ts` даёт текущую in-memory реализацию на основе локального dataset.

Правила:

- service зависит от repository interface, а не от конкретного способа хранения;
- замена storage происходит здесь, а не в routes или service.

### `items/service`

Оркестрация бизнес-логики:

- парсит и валидирует `id` на границе service-слоя;
- выполняет list filtering, sorting, pagination, read и update;
- выбрасывает доменные и прикладные ошибки при необходимости.

Правила:

- service содержит бизнес-поведение;
- service не знает о Fastify request/reply объектах.

### `items/mapper`

Преобразует доменные сущности в публичные DTO.

- `item.mapper.ts` нормализует item output перед тем, как он покинет backend.

Правила:

- нормализация frontend-safe item output живёт здесь;
- routes должны возвращать mapped DTO, а не raw repository records.

### `items/routes`

HTTP adapter'ы для endpoint'ов `/items`.

- валидируют входящий request через contracts;
- вызывают service;
- сериализуют результат через response contracts и mapper'ы.

Правила:

- routes должны быть тонкими;
- бизнес-логика не должна дублироваться из service-слоя.

## Модуль `ai`

`src/modules/ai` владеет всеми frontend-facing AI endpoint'ами и скрывает provider internals.

### `ai/contracts`

AI request/response/SSE контракты:

- `ai-request.contract.ts`
- `ai-response.contract.ts`
- `ai-stream.contract.ts`

Правила:

- это публичные frontend-facing AI-контракты;
- provider-specific response shape не должен протекать за эту границу.

### `ai/prompts`

Prompt building разбит на небольшие focused-файлы:

- `base.prompt.ts` для общего system prompt;
- `item-context.prompt.ts` для сериализации контекста объявления;
- endpoint-specific prompt-файлы для description, price и chat.

Правила:

- prompt building принадлежит backend;
- routes и service не должны собирать ad-hoc prompt strings прямо внутри handler'ов.

### `ai/mapper`

- `ai-response.mapper.ts` содержит shared helper'ы для разбора ответов, например JSON/code-fence parsing.

Правила:

- shared normalization helper'ы для AI-ответов живут здесь;
- provider transport code не должен смешиваться с response mapper'ами.

### `ai/service`

Оркестрация AI use case'ов:

- `ai-status.service.ts`
- `ai-description.service.ts`
- `ai-price.service.ts`
- `ai-chat.service.ts`

Ответственность:

- строить prompt messages;
- вызывать provider client;
- нормализовать provider text в стабильные backend-owned DTO;
- применять AI-specific output rules.

Правила:

- service знает поведение AI use case'ов;
- service не должен зависеть от Fastify transport detail'ов, кроме явных входов вроде `AbortSignal`.

### `ai/providers/openrouter`

Provider-specific transport implementation:

- `openrouter.client.ts` — публичная фабрика provider client'а, которую использует приложение;
- `openrouter.types.ts` — provider/client типы;
- `openrouter.request.ts` — сборка request body и abort wiring;
- `openrouter.response.ts` — парсинг и валидация обычных ответов;
- `openrouter.stream.ts` — разбор SSE frame'ов от провайдера.

Правила:

- raw OpenRouter детали остаются внутри этой папки;
- остальная часть приложения должна зависеть от `OpenRouterClient`, а не от raw payload detail'ов;
- публичный API-контракт не должен напрямую переиспользовать provider response DTO.

### `ai/routes`

HTTP adapter'ы для:

- `GET /api/ai/status`
- `POST /api/ai/description`
- `POST /api/ai/price`
- `POST /api/ai/chat`

Ответственность:

- валидировать request через contracts;
- использовать connection-abort helper'ы;
- переключать JSON chat response и SSE streaming response;
- переводить ошибки в стабильные публичные error DTO и SSE events.

Правила:

- routes должны оставаться transport adapter'ами;
- wiring для streaming и abort должен жить здесь вместе с shared HTTP helper'ами.

## Поток запроса

### Item endpoint'ы

`HTTP request -> items routes -> item contracts -> items service -> items repository -> item mapper -> public DTO`

### AI endpoint'ы

`HTTP request -> ai routes -> ai contracts -> ai service -> prompt builders -> OpenRouter client -> ai normalization -> public DTO/SSE event`

## Направление зависимостей

Предпочтительное направление зависимостей:

`app -> modules -> shared`

Точнее:

- `server.ts` зависит от `app`;
- `app` собирает `modules` и `shared`;
- `routes` зависят от `service`, `contracts`, `mapper`'ов и shared HTTP helper'ов;
- `service` зависит от `repository`, доменной логики, prompt builder'ов, provider client interface'ов и shared errors/constants;
- `repository` зависит от domain types;
- `shared` не должен зависеть от feature-модулей.

Правила:

- нельзя импортировать `app` в `shared`;
- нельзя делать `items` зависимым от `ai` или `ai` зависимым от `items/routes`;
- если код feature-specific, его нужно держать внутри feature-модуля.

## Правила публичного контракта

Внутренняя структура может меняться, но внешнее поведение должно оставаться стабильным:

- `GET /items` возвращает `{ items, total }`;
- `GET /items/:id` возвращает один объект;
- `PATCH /items/:id` возвращает `{ success: true }` при успехе;
- все ошибки возвращают `{ success: false, code, message, details? }`;
- AI endpoint'ы возвращают backend-normalized ответы, а не raw OpenRouter payload'ы;
- streaming chat отдаёт backend-owned SSE events, а не provider frame'ы.

## Структура тестов

Тесты изолированы в `tests/`:

- `tests/server.test.ts` содержит основные runtime contract/integration проверки;
- `tests/server.smoke.test.ts` содержит live HTTP smoke/e2e проверки;
- `tests/modules/ai/...` содержит более точечные AI module tests.

Правила:

- test-файлы не должны жить внутри production `src`;
- module-level tests удобно строить по той же структуре, что и production-код;
- runtime и smoke тесты должны проверять публичную поверхность API.

## Практические соглашения

- Новый shared-код добавляется в `src/shared` только если он реально используется в нескольких фичах.
- Новый item-related код добавляется в `src/modules/items`.
- Новый AI-related код добавляется в `src/modules/ai`.
- Новый transport/runtime helper добавляется в `src/app`.
- Routes должны оставаться тонкими, а ветвления и бизнес-правила нужно выносить в services или provider helper'ы.
- Схемы нужно держать близко к границе модуля, который они валидируют.
- Provider-specific parsing должен быть изолирован от нормализации публичных DTO.
