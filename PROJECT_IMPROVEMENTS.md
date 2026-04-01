# Улучшения Backend-проекта

## Назначение документа

Этот документ описывает текущее состояние backend: какие возможности уже реализованы, какие инженерные проблемы были закрыты и за счёт каких решений backend стал удобнее для frontend, эксплуатации и развития.

Основные документы проекта:

- [README.md](./README.md)
- [API_CONTRACT.md](./API_CONTRACT.md)
- [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)

## Что изменилось по сравнению с исходной заготовкой

### 1. Backend стал стабильным frontend-facing API

Backend больше не отдаёт наружу неоднородные формы данных и не заставляет frontend угадывать поведение endpoint'ов.

Что есть сейчас:

- `GET /items` всегда возвращает `{ items, total }`.
- `GET /items/:id` возвращает один объект объявления без лишней обёртки.
- `PATCH /items/:id` работает как полная замена объявления, а не как частичный patch.
- read-side DTO нормализован перед отправкой клиенту и пригоден для runtime-валидации.
- список поддерживает server-side поиск, фильтрацию, сортировку и пагинацию.

Пример стабильного ответа списка:

```json
{
  "items": [
    {
      "id": 1,
      "category": "auto",
      "title": "Почти новая Mitsubishi Lancer",
      "description": "",
      "price": 300000,
      "createdAt": "2026-02-12T00:00:00.000Z",
      "updatedAt": "2026-02-12T00:00:00.000Z",
      "params": {
        "brand": "Mitsubishi",
        "model": "Lancer"
      },
      "needsRevision": true
    }
  ],
  "total": 1
}
```

Подтверждающие файлы:

- [API_CONTRACT.md](./API_CONTRACT.md)
- [src/modules/items/routes/items.routes.ts](./src/modules/items/routes/items.routes.ts)
- [src/modules/items/contracts/item-read.contract.ts](./src/modules/items/contracts/item-read.contract.ts)
- [src/modules/items/contracts/item-update.contract.ts](./src/modules/items/contracts/item-update.contract.ts)
- [src/modules/items/mapper/item.mapper.ts](./src/modules/items/mapper/item.mapper.ts)

### 2. Ошибки и валидация приведены к одному публичному контракту

Раньше подобные проекты часто отдают разные тела ошибок из разных route handler'ов. Здесь это поведение сведено к одному контракту.

Что есть сейчас:

- любая публичная ошибка возвращается в формате `{ success: false, code, message, details? }`;
- ошибки валидации и доменные ошибки приводятся к стабильному виду;
- входные payload'ы режутся на уровне схем до выполнения бизнес-логики;
- наружу не уходят stack trace, provider debug payload'ы и чувствительные внутренние детали.

Пример ошибки:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": {
    "properties": {
      "limit": {
        "errors": ["Invalid input: expected number, received NaN"]
      }
    }
  }
}
```

Подтверждающие файлы:

- [src/shared/contracts/api-error.contract.ts](./src/shared/contracts/api-error.contract.ts)
- [src/shared/errors/app-error.ts](./src/shared/errors/app-error.ts)
- [src/shared/errors/api-error.mapper.ts](./src/shared/errors/api-error.mapper.ts)
- [src/shared/constants/input-limits.ts](./src/shared/constants/input-limits.ts)

### 3. AI-интеграция изолирована внутри backend

Frontend не работает с AI-провайдером напрямую. Все вызовы, prompt-building и нормализация ответов происходят на стороне backend.

Что есть сейчас:

- `GET /api/ai/status` позволяет заранее понять, включены ли AI-функции;
- `POST /api/ai/description` возвращает `{ suggestion, model?, usage? }`;
- `POST /api/ai/price` возвращает `{ suggestedPrice, reasoning, currency: 'RUB', model?, usage? }`;
- `POST /api/ai/chat` поддерживает JSON-режим и streaming через SSE;
- провайдерский transport скрыт внутри AI-модуля;
- backend не отдаёт наружу raw payload, `choices`, `delta` и другие внутренние поля провайдера.

Пример нормализованного AI-ответа:

```json
{
  "suggestedPrice": 512345,
  "reasoning": "Цена выглядит реалистичной для категории, состояния и набора характеристик.",
  "currency": "RUB",
  "model": "openrouter/test-model",
  "usage": {
    "inputTokens": 87,
    "outputTokens": 22,
    "totalTokens": 109
  }
}
```

Подтверждающие файлы:

- [src/modules/ai/routes/ai.routes.ts](./src/modules/ai/routes/ai.routes.ts)
- [src/modules/ai/contracts/ai-response.contract.ts](./src/modules/ai/contracts/ai-response.contract.ts)
- [src/modules/ai/contracts/ai-stream.contract.ts](./src/modules/ai/contracts/ai-stream.contract.ts)
- [src/modules/ai/prompts/base.prompt.ts](./src/modules/ai/prompts/base.prompt.ts)
- [src/modules/ai/providers/openrouter/openrouter.client.ts](./src/modules/ai/providers/openrouter/openrouter.client.ts)

### 4. Конфигурация, CORS и логирование стали безопаснее

Backend готов к браузерному использованию и более предсказуем в эксплуатации.

Что есть сейчас:

- конфигурация собрана в один типизированный слой;
- приложение стартует даже без `OPENROUTER_API_KEY`;
- в disabled-режиме AI-контракты остаются предсказуемыми;
- CORS и preflight вынесены в централизованный plugin;
- логирование очищено от секретов, query string и лишнего пользовательского текста.

Подтверждающие файлы:

- [src/shared/config/app-config.ts](./src/shared/config/app-config.ts)
- [src/shared/config/env.ts](./src/shared/config/env.ts)
- [src/app/plugins/cors.plugin.ts](./src/app/plugins/cors.plugin.ts)
- [src/shared/logging/logger.ts](./src/shared/logging/logger.ts)

### 5. Архитектура стала модульной и предсказуемой

Кодовая база больше не держится на одном перегруженном entrypoint-файле.

Что есть сейчас:

- `server.ts` выполняет роль тонкой точки входа;
- `src/app` отвечает за bootstrap и composition root;
- `src/shared` содержит общие cross-cutting части;
- item- и AI-логика разнесены по отдельным модулям;
- тесты вынесены в `tests/` и не смешиваются с production-кодом.

Пример фактической структуры:

```text
src/
  app/
  modules/
    ai/
    items/
  shared/
tests/
  modules/
    ai/
```

Подтверждающие файлы:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [server.ts](./server.ts)
- [src/app/bootstrap.ts](./src/app/bootstrap.ts)
- [src/app/build-app.ts](./src/app/build-app.ts)

### 6. Документация, тесты и деплой стали практичнее

Проект теперь удобнее использовать без знания внутренней истории разработки.

Что есть сейчас:

- публичный API описан в [API_CONTRACT.md](./API_CONTRACT.md);
- для frontend есть отдельный [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md);
- доступен Swagger UI по пути `/documentation`;
- есть smoke/e2e-проверки основных сценариев;
- production-режим поднимается через Docker Compose и `nginx`.

Подтверждающие файлы:

- [src/app/plugins/swagger.plugin.ts](./src/app/plugins/swagger.plugin.ts)
- [tests/server.test.ts](./tests/server.test.ts)
- [tests/server.smoke.test.ts](./tests/server.smoke.test.ts)
- [Dockerfile](./Dockerfile)
- [docker-compose.prod.yml](./docker-compose.prod.yml)
- [nginx/default.conf.template](./nginx/default.conf.template)

## Практический эффект для команды

Текущее состояние backend даёт команде:

- стабильный API для списка, карточки, сохранения и AI-сценариев;
- единый и пригодный для frontend runtime validation error DTO;
- backend-owned AI prompts, AI transport и SSE-контракт без provider-specific логики на клиенте;
- безопасную работу с конфигом, логами и режимом отключённого AI;
- модульную архитектуру, которую проще сопровождать и расширять;
- набор документации, smoke/e2e-проверок и production Docker deployment.

## Рекомендуемый порядок чтения

Для нового участника проекта удобный порядок такой:

1. [README.md](./README.md)
2. [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)
3. [API_CONTRACT.md](./API_CONTRACT.md)
4. [ARCHITECTURE.md](./ARCHITECTURE.md)
5. [PROJECT_IMPROVEMENTS.md](./PROJECT_IMPROVEMENTS.md)
