# Улучшения Backend-проекта

## Назначение документа

Этот документ описывает, что было улучшено в backend-части проекта, какие возможности были добавлены и как текущее состояние backend было приведено к целевым требованиям из [Backend_PRD_detailed.md](./Backend_PRD_detailed.md).

Основные документы проекта:

- [Backend_PRD_detailed.md](./Backend_PRD_detailed.md)
- [tasks.json](./tasks.json)
- [progress.md](./progress.md)
- [API_CONTRACT.md](./API_CONTRACT.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)

На дату `2026-03-25` в [tasks.json](./tasks.json) все задачи от `TASK-001` до `TASK-026` имеют статус `done`.

## Что было улучшено

### 1. Backend стал стабильным frontend-facing API

Изначальная цель проекта заключалась в том, чтобы backend стал предсказуемым внешним API для frontend, а не просто тонким слоем над данными. Эта часть была закрыта в первую очередь.

Что сделано:

- `GET /items` теперь возвращает стабильную форму `{ items, total }`.
- Список объявлений поддерживает backend-driven поиск, фильтрацию, сортировку и пагинацию.
- Добавлена сортировка по `price`, совместимая с frontend URL-state.
- `GET /items/:id` возвращает один нормализованный объект объявления.
- `PUT /items/:id` работает как полное обновление объявления и требует полный category-specific payload.
- Публичные item DTO нормализуются перед отдачей наружу и пригодны для runtime-валидации на frontend.
- Добавлена поддержка опциональных `previewImage` и `images`, не ломающая старые записи.

Подтверждающие файлы:

- [API_CONTRACT.md](./API_CONTRACT.md)
- [src/modules/items/routes/items.routes.ts](./src/modules/items/routes/items.routes.ts)
- [src/modules/items/contracts/item-read.contract.ts](./src/modules/items/contracts/item-read.contract.ts)
- [src/modules/items/contracts/item-update.contract.ts](./src/modules/items/contracts/item-update.contract.ts)
- [src/modules/items/mapper/item.mapper.ts](./src/modules/items/mapper/item.mapper.ts)

Связанные задачи:

- `TASK-004`, `TASK-005`, `TASK-006`, `TASK-007`, `TASK-008`, `TASK-023`, `TASK-025`

### 2. Введён единый публичный формат ошибок и строгая валидация

Одной из ключевых проблем исходного backend было отсутствие единого error contract. Это было исправлено.

Что сделано:

- Все публичные ошибки приведены к формату `{ success: false, code, message, details? }`.
- Ошибки валидации, `NOT_FOUND`, `AI_UNAVAILABLE`, `AI_PROVIDER_ERROR` и `INTERNAL_ERROR` теперь обрабатываются единообразно.
- Слишком большие, пустые и некорректные payload'ы режутся на уровне валидации до бизнес-логики.
- Публичные ответы больше не отдают stack trace, сырые provider payload'ы и чувствительные внутренние детали.

Подтверждающие файлы:

- [src/shared/contracts/api-error.contract.ts](./src/shared/contracts/api-error.contract.ts)
- [src/shared/errors/app-error.ts](./src/shared/errors/app-error.ts)
- [src/shared/errors/api-error.mapper.ts](./src/shared/errors/api-error.mapper.ts)
- [src/shared/constants/input-limits.ts](./src/shared/constants/input-limits.ts)
- [API_CONTRACT.md](./API_CONTRACT.md)

Связанные задачи:

- `TASK-003`, `TASK-009`, `TASK-015`, `TASK-023`

### 3. AI-интеграция перенесена в безопасный backend-owned слой

Backend теперь выполняет роль безопасного прокси между frontend и OpenRouter, как и требовал PRD.

Что сделано:

- Добавлен `GET /api/ai/status`, чтобы frontend мог явно понять, доступны ли AI-функции.
- Добавлен `POST /api/ai/description` с нормализованным ответом `{ suggestion, model?, usage? }`.
- Добавлен `POST /api/ai/price` с нормализованным ответом `{ suggestedPrice, reasoning, currency: 'RUB', model?, usage? }`.
- Добавлен `POST /api/ai/chat` с обычным JSON-режимом и streaming через SSE.
- Prompt-building вынесен на backend и разбит на базовый prompt и endpoint-specific инструкции.
- Логика OpenRouter изолирована внутри provider-модуля и не протекает в публичный API.
- Добавлены timeout, обработка client disconnect и нормализованное маппирование provider errors.
- Backend не отдаёт наружу сырой формат OpenRouter.

Подтверждающие файлы:

- [src/modules/ai/routes/ai.routes.ts](./src/modules/ai/routes/ai.routes.ts)
- [src/modules/ai/contracts/ai-response.contract.ts](./src/modules/ai/contracts/ai-response.contract.ts)
- [src/modules/ai/contracts/ai-stream.contract.ts](./src/modules/ai/contracts/ai-stream.contract.ts)
- [src/modules/ai/prompts/base.prompt.ts](./src/modules/ai/prompts/base.prompt.ts)
- [src/modules/ai/prompts/description.prompt.ts](./src/modules/ai/prompts/description.prompt.ts)
- [src/modules/ai/prompts/price.prompt.ts](./src/modules/ai/prompts/price.prompt.ts)
- [src/modules/ai/prompts/chat.prompt.ts](./src/modules/ai/prompts/chat.prompt.ts)
- [src/modules/ai/providers/openrouter/openrouter.client.ts](./src/modules/ai/providers/openrouter/openrouter.client.ts)
- [API_CONTRACT.md](./API_CONTRACT.md)

Связанные задачи:

- `TASK-010`, `TASK-011`, `TASK-012`, `TASK-013`, `TASK-014`, `TASK-016`, `TASK-017`, `TASK-018`, `TASK-019`, `TASK-020`

### 4. Усилены конфигурирование, CORS и безопасная эксплуатация

Backend был подготовлен к реальному браузерному использованию и более предсказуемому деплою.

Что сделано:

- Конфигурация вынесена в единый типизированный config layer.
- Приложение стартует даже без `OPENROUTER_API_KEY`; в таком режиме AI корректно помечается как disabled.
- CORS и preflight вынесены в централизованный plugin и поддерживают allowlist.
- Логирование очищено от query string, секретов и полного пользовательского текста.

Подтверждающие файлы:

- [src/shared/config/app-config.ts](./src/shared/config/app-config.ts)
- [src/shared/config/env.ts](./src/shared/config/env.ts)
- [src/app/plugins/cors.plugin.ts](./src/app/plugins/cors.plugin.ts)
- [src/shared/logging/logger.ts](./src/shared/logging/logger.ts)

Связанные задачи:

- `TASK-001`, `TASK-002`, `TASK-020`, `TASK-021`

### 5. Архитектура backend переведена на модульную схему

Кодовая база больше не держится на одном перегруженном entrypoint-файле и плоской структуре.

Что сделано:

- `server.ts` оставлен тонкой точкой входа.
- Bootstrap и composition root вынесены в `src/app`.
- Общие cross-cutting части выделены в `src/shared`.
- Item- и AI-логика разнесены в отдельные модули с `routes`, `service`, `contracts`, `mapper`, `repository` и `providers`.
- Тесты вынесены в `tests/`, отдельно от production-кода.

Подтверждающие файлы:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [server.ts](./server.ts)
- [src/app/bootstrap.ts](./src/app/bootstrap.ts)
- [src/app/build-app.ts](./src/app/build-app.ts)

Связанные задачи:

- `TASK-026`

### 6. Улучшены документация, тестирование и готовность к деплою

Проект стал заметно удобнее для онбординга, ручной проверки и эксплуатации.

Что сделано:

- Подготовлен frontend-facing контракт в [API_CONTRACT.md](./API_CONTRACT.md).
- Подготовлено описание архитектуры в [ARCHITECTURE.md](./ARCHITECTURE.md).
- Добавлены Swagger/OpenAPI-описание и Swagger UI по пути `/documentation`.
- Добавлены smoke/e2e-проверки основных backend-сценариев.
- Добавлена production-сборка через Docker и запуск через Docker Compose с `nginx` перед API.

Подтверждающие файлы:

- [src/app/plugins/swagger.plugin.ts](./src/app/plugins/swagger.plugin.ts)
- [tests/server.test.ts](./tests/server.test.ts)
- [tests/server.smoke.test.ts](./tests/server.smoke.test.ts)
- [Dockerfile](./Dockerfile)
- [docker-compose.prod.yml](./docker-compose.prod.yml)
- [nginx/default.conf.template](./nginx/default.conf.template)

Связанные задачи:

- `TASK-022`, `TASK-024`

## Итог по проекту

Если сравнивать текущее состояние с целями из [Backend_PRD_detailed.md](./Backend_PRD_detailed.md), то backend теперь даёт:

- стабильный публичный API для списка, карточки, сохранения и AI-сценариев;
- единый и пригодный для frontend error DTO;
- backend-owned AI prompts, AI transport и SSE-контракт без provider-specific логики на клиенте;
- безопасную работу с конфигом, логами и режимом отключённого AI;
- модульную архитектуру, которую проще сопровождать и расширять;
- набор документации, Swagger UI, smoke/e2e-проверок и production Docker deployment.

## Рекомендуемый порядок чтения

Для нового участника проекта разумный порядок такой:

1. [README.md](./README.md)
2. [PROJECT_IMPROVEMENTS.md](./PROJECT_IMPROVEMENTS.md)
3. [API_CONTRACT.md](./API_CONTRACT.md)
4. [ARCHITECTURE.md](./ARCHITECTURE.md)
5. [Backend_PRD_detailed.md](./Backend_PRD_detailed.md)
6. [progress.md](./progress.md)
