# Frontend Integration Guide

Актуально для backend-состояния на `2026-04-01`.

Этот документ предназначен для frontend-команды. Он описывает, как backend работает с точки зрения клиента: какие endpoint'ы доступны, какие payload'ы нужно отправлять, какие DTO приходят в ответ, как устроены ошибки и как правильно интегрировать AI-сценарии.

Сопутствующие документы:

- [README.md](./README.md) — запуск и обзор проекта
- [API_CONTRACT.md](./API_CONTRACT.md) — краткий публичный контракт
- [ARCHITECTURE.md](./ARCHITECTURE.md) — внутренняя структура backend

## 1. Что делает backend для frontend

Backend в этом проекте выполняет четыре основные задачи:

1. Отдаёт список объявлений с server-side search, filtering, sorting и pagination.
2. Отдаёт полную карточку объявления по `id`.
3. Принимает полное обновление объявления через `PATCH`.
4. Проксирует AI-функции через backend-owned слой, не раскрывая frontend'у `OPENROUTER_API_KEY`, prompt'ы и provider-specific response shape.

Ключевое правило интеграции: frontend работает только с backend contract. Никакой логики OpenRouter, raw provider payload и provider-specific SSE-формата на клиенте быть не должно.

## 2. Общие правила интеграции

### Base URL

Все endpoint'ы описаны относительно корня backend:

```text
/
```

Если backend поднят локально, обычно он доступен как:

```text
http://localhost:8080
```

Если backend поднят через `docker compose`, обычно он доступен как:

```text
http://localhost
```

### Content-Type

- Для `PATCH` и `POST` отправляйте `Content-Type: application/json`.
- Для SSE-чата отправляйте `Accept: text/event-stream`.

### CORS

Backend поддерживает browser-compatible CORS и preflight. Frontend не должен делать специальную обработку `OPTIONS`; это уже закрыто на стороне backend.

### Общий принцип DTO

- success-ответы у одного endpoint'а имеют одну стабильную форму;
- error-ответы для всех endpoint'ов имеют один общий DTO;
- AI endpoint'ы никогда не отдают наружу raw OpenRouter shape.

## 3. Общие DTO

### 3.1 Error DTO

Любая публичная ошибка backend возвращается в этом формате:

```ts
type ApiErrorResponse = {
  success: false;
  code:
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'AI_UNAVAILABLE'
    | 'AI_PROVIDER_ERROR'
    | 'INTERNAL_ERROR';
  message: string;
  details?: unknown;
};
```

Пример:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": {
    "errors": [],
    "properties": {
      "limit": {
        "errors": ["Invalid input: expected number, received NaN"]
      }
    }
  }
}
```

Практическое правило для frontend:

- `code` используйте для UX-ветвления;
- `message` можно показывать пользователю или логировать;
- `details` используйте только как диагностическое поле, не завязывайте критичную клиентскую логику на его внутреннюю структуру.

### 3.2 Read DTO объявления

Список и детальная карточка используют один и тот же read-side DTO:

```ts
type ItemReadDto =
  | {
      id: number;
      category: 'auto';
      title: string;
      description?: string;
      price: number;
      createdAt: string;
      updatedAt: string;
      previewImage?: string;
      images?: string[];
      params: {
        brand?: string;
        model?: string;
        yearOfManufacture?: number;
        transmission?: 'automatic' | 'manual';
        mileage?: number;
        enginePower?: number;
      };
      needsRevision?: boolean;
    }
  | {
      id: number;
      category: 'real_estate';
      title: string;
      description?: string;
      price: number;
      createdAt: string;
      updatedAt: string;
      previewImage?: string;
      images?: string[];
      params: {
        type?: 'flat' | 'house' | 'room';
        address?: string;
        area?: number;
        floor?: number;
      };
      needsRevision?: boolean;
    }
  | {
      id: number;
      category: 'electronics';
      title: string;
      description?: string;
      price: number;
      createdAt: string;
      updatedAt: string;
      previewImage?: string;
      images?: string[];
      params: {
        type?: 'phone' | 'laptop' | 'misc';
        brand?: string;
        model?: string;
        condition?: 'new' | 'used';
        color?: string;
      };
      needsRevision?: boolean;
    };
```

Важные замечания:

- `needsRevision` — convenience field, но frontend может считать своё состояние и по исходным полям.
- В read-side `params` может быть неполным у старых записей.
- `previewImage` и `images` опциональны.
- `createdAt` и `updatedAt` приходят строками в ISO-формате.

### 3.3 DTO полного обновления объявления

Для `PATCH /items/:id` и всех AI endpoint'ов используется полный write-side shape:

```ts
type ItemUpdateIn =
  | {
      category: 'auto';
      title: string;
      description?: string;
      price: number;
      params: {
        brand: string;
        model: string;
        yearOfManufacture: number;
        transmission: 'automatic' | 'manual';
        mileage: number;
        enginePower: number;
      };
    }
  | {
      category: 'real_estate';
      title: string;
      description?: string;
      price: number;
      params: {
        type: 'flat' | 'house' | 'room';
        address: string;
        area: number;
        floor: number;
      };
    }
  | {
      category: 'electronics';
      title: string;
      description?: string;
      price: number;
      params: {
        type: 'phone' | 'laptop' | 'misc';
        brand: string;
        model: string;
        condition: 'new' | 'used';
        color: string;
      };
    };
```

Ключевое правило:

- `PATCH /items/:id` не поддерживает partial update;
- frontend должен отправлять полный валидный объект для выбранной категории;
- backend не дополняет отсутствующие category-specific поля.

### 3.4 AI usage metadata

AI success-ответы могут включать usage-метаданные:

```ts
type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
```

Это поле опционально. Frontend не должен считать его обязательным.

## 4. Ограничения и лимиты

Текущие лимиты входных данных:

- `title`: до `160` символов
- `description`: до `5000` символов
- `userMessage`: до `2000` символов
- одно сообщение в `messages`: до `2000` символов
- максимум элементов в `messages`: `20`

Если лимиты нарушены, backend вернёт `400 VALIDATION_ERROR`.

## 5. Endpoint'ы

## 5.1 `GET /items`

Возвращает список объявлений после server-side фильтрации, сортировки и пагинации.

### Query params

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | `string` | `''` | Поиск по `title` |
| `categories` | `string` | none | CSV-список: `auto,real_estate,electronics` |
| `needsRevision` | `string` | `false` | Поддерживаются `true` и `1` |
| `limit` | `string` | `10` | Положительное целое |
| `skip` | `string` | `0` | Целое `>= 0` |
| `sortColumn` | `'title' | 'createdAt' | 'price'` | none | Колонка сортировки |
| `sortDirection` | `'asc' | 'desc'` | none | Направление сортировки |

### Success response

```ts
type ItemsResponse = {
  items: ItemReadDto[];
  total: number;
};
```

### Пример запроса

```http
GET /items?q=митсубиси&categories=auto&needsRevision=true&sortColumn=price&sortDirection=asc&limit=10&skip=0
```

### Пример ответа

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
        "model": "Lancer",
        "yearOfManufacture": 2005,
        "transmission": "automatic",
        "mileage": 200000,
        "enginePower": 98
      },
      "needsRevision": true
    }
  ],
  "total": 1
}
```

### Пример вызова через `fetch`

```ts
const params = new URLSearchParams({
  q: 'митсубиси',
  categories: 'auto',
  needsRevision: 'true',
  sortColumn: 'price',
  sortDirection: 'asc',
  limit: '10',
  skip: '0',
});

const response = await fetch(`/items?${params.toString()}`);
const data: { items: ItemReadDto[]; total: number } = await response.json();
```

### Возможные ошибки

- `400 VALIDATION_ERROR` — невалидные query params
- `500 INTERNAL_ERROR` — непредвиденная внутренняя ошибка

### Что важно для frontend

- `total` — это число элементов после фильтрации и до пагинации.
- Пагинация применяется после фильтрации и сортировки.
- Для табличного UI frontend должен считать page state по `limit`, `skip`, `total`.

## 5.2 `GET /items/:id`

Возвращает полную карточку объявления.

### Path params

- `id: number`

### Success response

```ts
type GetItemResponse = ItemReadDto;
```

### Пример ответа

```json
{
  "id": 2,
  "category": "real_estate",
  "title": "Студия рядом с метро",
  "description": "Светлая квартира после ремонта.",
  "price": 6200000,
  "createdAt": "2026-02-01T00:00:00.000Z",
  "updatedAt": "2026-03-01T00:00:00.000Z",
  "previewImage": "https://example.com/preview.jpg",
  "images": [
    "https://example.com/1.jpg",
    "https://example.com/2.jpg"
  ],
  "params": {
    "type": "flat",
    "address": "Москва, ул. Пример, 10",
    "area": 28,
    "floor": 7
  }
}
```

### Возможные ошибки

- `400 VALIDATION_ERROR` — `id` невалиден
- `404 NOT_FOUND` — объявление не найдено
- `500 INTERNAL_ERROR` — непредвиденная внутренняя ошибка

## 5.3 `PATCH /items/:id`

Полностью заменяет объявление.

### Path params

- `id: number`

### Request body

```ts
type PatchItemRequest = ItemUpdateIn;
```

### Success response

```json
{
  "success": true
}
```

### Пример вызова через `fetch`

```ts
async function saveItem(id: number, item: ItemUpdateIn) {
  const response = await fetch(`/items/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    throw (await response.json()) as ApiErrorResponse;
  }

  return (await response.json()) as { success: true };
}
```

### Возможные ошибки

- `400 VALIDATION_ERROR` — невалидный `id` или body
- `404 NOT_FOUND` — объявление не найдено
- `500 INTERNAL_ERROR` — непредвиденная внутренняя ошибка

### Что важно для frontend

- Это `PATCH` по HTTP-методу, но не partial update по семантике.
- Нельзя отправлять только изменённые поля.
- Нужно отправлять весь объект объявления в write-side форме.
- После успешного `PATCH` стоит перечитать объявление через `GET /items/:id`, если UI зависит от нового `updatedAt`.

## 5.4 `GET /api/ai/status`

Проверяет, доступны ли AI-функции в текущем окружении.

### Success response

```ts
type AiStatusResponse = {
  enabled: boolean;
  provider: 'openrouter' | null;
  model: string | null;
  features: {
    description: boolean;
    price: boolean;
    chat: boolean;
  };
};
```

### Disabled example

```json
{
  "enabled": false,
  "provider": null,
  "model": null,
  "features": {
    "description": false,
    "price": false,
    "chat": false
  }
}
```

### Enabled example

```json
{
  "enabled": true,
  "provider": "openrouter",
  "model": "openrouter/test-model",
  "features": {
    "description": true,
    "price": true,
    "chat": true
  }
}
```

### Пример вызова через `fetch`

```ts
const status = (await fetch('/api/ai/status').then((res) => res.json())) as AiStatusResponse;

if (!status.enabled) {
  disableAiButtons();
}
```

### Что важно для frontend

- Сначала вызывайте этот endpoint.
- Если `enabled=false`, можно отключить AI-кнопки ещё до попытки мутации.
- Если часть `features` выключена, UI можно отключать по-функционально.

## 5.5 `POST /api/ai/description`

Генерирует новое описание или улучшает текущее.

### Request body

```ts
type AiDescriptionRequest = {
  item: ItemUpdateIn;
};
```

### Success response

```ts
type AiDescriptionResponse = {
  suggestion: string;
  model?: string;
  usage?: AiUsage;
};
```

### Пример запроса

```json
{
  "item": {
    "category": "electronics",
    "title": "Ноутбук Lenovo ThinkPad",
    "description": "",
    "price": 45000,
    "params": {
      "type": "laptop",
      "brand": "Lenovo",
      "model": "ThinkPad T480",
      "condition": "used",
      "color": "Черный"
    }
  }
}
```

### Пример ответа

```json
{
  "suggestion": "Надёжный ноутбук Lenovo ThinkPad T480 в хорошем состоянии. Подойдёт для работы, учёбы и повседневных задач. Аккуратное использование, всё работает стабильно.",
  "model": "openrouter/test-model",
  "usage": {
    "inputTokens": 92,
    "outputTokens": 48,
    "totalTokens": 140
  }
}
```

### Возможные ошибки

- `400 VALIDATION_ERROR` — body не прошёл валидацию
- `503 AI_UNAVAILABLE` — AI отключён или не настроен
- `502 AI_PROVIDER_ERROR` — provider ответил некорректно
- `504 AI_PROVIDER_ERROR` — запрос к provider завершился по timeout
- `500 INTERNAL_ERROR` — непредвиденная внутренняя ошибка

### Что важно для frontend

- `suggestion` уже нормализован и подходит для прямой подстановки в textarea.
- Frontend не должен передавать system prompt.
- Для этого endpoint'а достаточно полного `item`, без `messages`.

## 5.6 `POST /api/ai/price`

Возвращает рекомендацию цены.

### Request body

```ts
type AiPriceRequest = {
  item: ItemUpdateIn;
};
```

### Success response

```ts
type AiPriceResponse = {
  suggestedPrice: number;
  reasoning: string;
  currency: 'RUB';
  model?: string;
  usage?: AiUsage;
};
```

### Пример ответа

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

### Возможные ошибки

- `400 VALIDATION_ERROR`
- `503 AI_UNAVAILABLE`
- `502 AI_PROVIDER_ERROR`
- `504 AI_PROVIDER_ERROR`
- `500 INTERNAL_ERROR`

### Что важно для frontend

- `suggestedPrice` всегда приходит числом.
- `currency` сейчас фиксирован как `RUB`.
- Если backend не смог безопасно извлечь цену, он вернёт ошибку вместо частично сломанного ответа.

## 5.7 `POST /api/ai/chat`

Поддерживает два режима: обычный JSON и streaming через SSE.

### Request body

```ts
type AiChatRequest = {
  item: ItemUpdateIn;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  userMessage: string;
};
```

### Режим 1. JSON response

Если `Accept` не содержит `text/event-stream`, backend возвращает обычный JSON.

#### Success response

```ts
type AiChatResponse = {
  message: {
    role: 'assistant';
    content: string;
  };
  model?: string;
  usage?: AiUsage;
};
```

#### Пример ответа

```json
{
  "message": {
    "role": "assistant",
    "content": "Можно подчеркнуть аккуратное состояние, прозрачную историю использования и готовность показать устройство при встрече."
  },
  "model": "openrouter/test-model",
  "usage": {
    "inputTokens": 101,
    "outputTokens": 37,
    "totalTokens": 138
  }
}
```

### Режим 2. SSE streaming

Если клиент отправляет:

```http
Accept: text/event-stream
```

backend отвечает project-owned SSE-контрактом.

#### Поддерживаемые события

```ts
type AiChatStreamEvent =
  | {
      event: 'meta';
      data: {
        model: string;
      };
    }
  | {
      event: 'chunk';
      data: {
        content: string;
      };
    }
  | {
      event: 'done';
      data: {
        model?: string;
        usage?: AiUsage;
      };
    }
  | {
      event: 'error';
      data: ApiErrorResponse;
    };
```

#### Пример SSE-потока

```text
event: meta
data: {"model":"openrouter/test-model"}

event: chunk
data: {"content":"Можно "}

event: chunk
data: {"content":"подчеркнуть аккуратное состояние."}

event: done
data: {"model":"openrouter/test-model","usage":{"inputTokens":101,"outputTokens":37,"totalTokens":138}}
```

#### Пример чтения потока через `fetch`

```ts
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  },
  body: JSON.stringify({
    item,
    messages,
    userMessage,
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();
let raw = '';

while (reader) {
  const { value, done } = await reader.read();
  if (done) break;

  raw += decoder.decode(value, { stream: true });
  // дальше поток разбирается по event/data блокам SSE
}
```

#### Как собирать итоговый ответ на frontend

- создайте пустую строку;
- на каждое событие `chunk` дописывайте `data.content`;
- `meta` используйте для отображения модели, если нужно;
- `done` считайте признаком успешного завершения;
- `error` считайте нормализованной backend-ошибкой и завершайте поток с ошибкой.

#### Что backend не делает

- не отдаёт `choices`, `delta`, `provider id` и другие OpenRouter-specific поля;
- не требует от frontend разбирать provider transport layer.

### Возможные ошибки

Для JSON-режима:

- `400 VALIDATION_ERROR`
- `503 AI_UNAVAILABLE`
- `502 AI_PROVIDER_ERROR`
- `504 AI_PROVIDER_ERROR`
- `500 INTERNAL_ERROR`

Для SSE-режима:

- при успешном открытии потока ошибка приходит событием `event: error`;
- `data` этого события соответствует `ApiErrorResponse`.

## 6. Как frontend должен обрабатывать ошибки

Рекомендуемая стратегия:

### Для item endpoint'ов

- `VALIDATION_ERROR` — показывать ошибку формы или логировать как bug в клиентском state
- `NOT_FOUND` — переводить пользователя на empty/not-found screen
- `INTERNAL_ERROR` — показывать generic retry state

### Для AI endpoint'ов

- `AI_UNAVAILABLE` — отключить AI UI и показать понятное сообщение, что AI временно недоступен
- `AI_PROVIDER_ERROR` — показать retry/could-not-generate state
- `VALIDATION_ERROR` — считать ошибкой формирования frontend payload
- `INTERNAL_ERROR` — generic fallback error state

### Пример общего type guard для `fetch`

```ts
type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'AI_UNAVAILABLE'
  | 'AI_PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

type ApiErrorResponse = {
  success: false;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    (value as { success?: unknown }).success === false &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'string' &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
```

## 7. Рекомендуемый frontend flow

### Экран списка объявлений

1. Хранить search/filter/sort/pagination в URL-state.
2. На каждое изменение URL-state вызывать `GET /items`.
3. Отрисовывать список из `items`, пагинацию из `total`.

### Экран карточки объявления

1. Загружать `GET /items/:id`.
2. Использовать read-side DTO для initial form values.
3. Перед сохранением собирать полный `ItemUpdateIn`.
4. Отправлять `PATCH /items/:id`.
5. После успеха при необходимости перечитывать `GET /items/:id`.

### AI-интеграция

1. При инициализации страницы или AI-панели вызвать `GET /api/ai/status`.
2. Если `enabled=false`, не запускать AI mutation endpoint'ы.
3. Для description/price отправлять полный `item`.
4. Для chat:
   - либо использовать JSON-режим для простого UX;
   - либо `Accept: text/event-stream` для streaming UX.

## 8. Как backend работает в целом

С точки зрения frontend backend работает так:

1. принимает HTTP-запрос;
2. валидирует query/body/path через Zod-схемы;
3. выполняет бизнес-логику items или AI-модуля;
4. нормализует success DTO до стабильной формы;
5. при ошибке переводит её в единый `ApiErrorResponse`.

Для AI-сценариев добавляется ещё один слой:

1. frontend отправляет backend-normalized request;
2. backend сам строит prompt;
3. backend вызывает OpenRouter;
4. backend нормализует ответ модели;
5. frontend получает только backend-owned DTO или backend-owned SSE events.

## 9. Практические замечания

- Не рассчитывайте на raw provider error body, его не будет.
- Не рассчитывайте на partial update в `PATCH /items/:id`.
- Не считайте `usage` обязательным.
- Не стройте критичную логику на структуре `details` у `VALIDATION_ERROR`.
- Для SSE чата собирайте итог только из `chunk`.
- Для AI перед мутациями всегда полезно знать состояние `GET /api/ai/status`.
