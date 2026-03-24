# Frontend API Contract

Актуально для backend-состояния на 2026-03-25.

Этот документ фиксирует фактический публичный контракт backend для frontend-команды. Он описывает только внешние request/response формы и не раскрывает внутренний формат OpenRouter.

## Base Rules

- `GET /items` возвращает объект `{ items, total }`.
- `GET /items/:id` возвращает один объект объявления.
- `PUT /items/:id` возвращает `{ success: true }` при успехе.
- Любая публичная ошибка возвращается в едином формате:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": {}
}
```

## Shared Read DTO

Список и детальная карточка используют один и тот же read-side shape:

```ts
type ItemReadDto = {
  id: number;
  category: 'auto' | 'real_estate' | 'electronics';
  title: string;
  description?: string;
  price: number | null;
  createdAt: string;
  updatedAt: string;
  params: Record<string, unknown>;
  needsRevision?: boolean;
};
```

Примечания:

- `needsRevision` приходит как convenience field, но frontend не должен полагаться только на него и может вычислять своё состояние по исходным полям.
- `params` зависит от `category`. В текущем dataset read-side `params` может быть неполным у старых записей. Для записи через `PUT /items/:id` backend, наоборот, требует полный category-specific payload.

## `GET /items`

Возвращает список объявлений после server-side фильтрации, сортировки и пагинации.

### Query params

| Param | Type | Notes |
| --- | --- | --- |
| `q` | `string` | Поиск по `title`, default `''`. |
| `categories` | `string` | CSV-список: `auto,real_estate,electronics`. |
| `needsRevision` | `string` | Используйте `true` или `1`, чтобы включить фильтр. |
| `limit` | `number as string` | Default `10`. Должен быть целым положительным числом. |
| `skip` | `number as string` | Default `0`. Должен быть целым числом `>= 0`. |
| `sortColumn` | `'title' | 'createdAt' | 'price'` | Поддерживается сортировка по цене. |
| `sortDirection` | `'asc' | 'desc'` | Имеет смысл передавать вместе с `sortColumn`. |

### Response

```ts
{
  items: ItemReadDto[];
  total: number;
}
```

- `total` соответствует числу элементов после фильтрации и до пагинации.

### Example request

```http
GET /items?categories=auto,electronics&needsRevision=true&sortColumn=price&sortDirection=asc&limit=2&skip=1
```

### Example response

```json
{
  "items": [
    {
      "id": 3,
      "category": "electronics",
      "title": "Новенький айфон 17 Про Макс",
      "description": "",
      "price": 200000,
      "createdAt": "2026-03-10T00:00:00.000Z",
      "updatedAt": "2026-03-10T00:00:00.000Z",
      "params": {
        "type": "phone",
        "brand": "Apple",
        "model": "iPhone 17 Pro Max",
        "condition": "new",
        "color": "Чёрный"
      },
      "needsRevision": true
    },
    {
      "id": 5,
      "category": "electronics",
      "title": "Наушники JBL Tour one m2",
      "description": "",
      "price": 25000,
      "createdAt": "2026-03-02T00:00:00.000Z",
      "updatedAt": "2026-03-02T00:00:00.000Z",
      "params": {
        "type": "misc",
        "condition": "new",
        "color": "Белый"
      },
      "needsRevision": true
    }
  ],
  "total": 21
}
```

### Validation error example

```http
GET /items?limit=abc
```

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

## `GET /items/:id`

Возвращает один объект объявления без дополнительной обёртки.

### Example request

```http
GET /items/1
```

### Example response

```json
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
```

### Not found example

```http
GET /items/999999
```

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Item with requested id doesn't exist."
}
```

## `PUT /items/:id`

Полное обновление объявления. Частичные payload'ы не поддерживаются.

### Request body

```ts
type ItemUpdateIn =
  | {
      category: 'auto';
      title: string;
      description?: string;
      price: number | null;
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
      price: number | null;
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
      price: number | null;
      params: {
        type: 'phone' | 'laptop' | 'misc';
        brand: string;
        model: string;
        condition: 'new' | 'used';
        color: string;
      };
    };
```

### Success response

```json
{
  "success": true
}
```

## `GET /api/ai/status`

Используется frontend для определения, можно ли показывать AI-функции без пробного вызова генерации.

### Response

```ts
{
  enabled: boolean;
  provider: 'openrouter' | null;
  model: string | null;
  features: {
    description: boolean;
    price: boolean;
    chat: boolean;
  };
}
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
  "model": "test-model",
  "features": {
    "description": true,
    "price": true,
    "chat": true
  }
}
```

## AI Request Item

Все AI endpoint'ы принимают `item` в том же shape, что и полный `PUT` payload по объявлению.

## `POST /api/ai/description`

Генерирует новое описание или улучшает существующее.

### Request body

```json
{
  "item": {
    "category": "auto",
    "title": "Lada Vesta",
    "description": "",
    "price": 500000,
    "params": {
      "brand": "Lada",
      "model": "Vesta",
      "yearOfManufacture": 2020,
      "transmission": "manual",
      "mileage": 10000,
      "enginePower": 106
    }
  }
}
```

### Success response

```json
{
  "suggestion": "Подробное описание объявления.",
  "model": "test-model",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 20,
    "totalTokens": 120,
    "cost": 0.0012
  }
}
```

## `POST /api/ai/price`

Возвращает нормализованную рекомендацию цены.

### Success response

```json
{
  "suggestedPrice": 543210,
  "reasoning": "Цена основана на состоянии и категории.",
  "currency": "RUB",
  "model": "test-model",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 20,
    "totalTokens": 120,
    "cost": 0.0012
  }
}
```

## `POST /api/ai/chat`

Поддерживает два публичных режима.

### Non-streaming JSON

Запрос:

```json
{
  "item": {
    "category": "auto",
    "title": "Lada Vesta",
    "description": "",
    "price": 500000,
    "params": {
      "brand": "Lada",
      "model": "Vesta",
      "yearOfManufacture": 2020,
      "transmission": "manual",
      "mileage": 10000,
      "enginePower": 106
    }
  },
  "messages": [
    {
      "role": "user",
      "content": "Есть ли торг?"
    }
  ],
  "userMessage": "Что выделить в объявлении?"
}
```

Успешный ответ:

```json
{
  "message": {
    "role": "assistant",
    "content": "Спрос на эту модель высокий."
  },
  "model": "test-model",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 20,
    "totalTokens": 120,
    "cost": 0.0012
  }
}
```

### Streaming SSE

Если клиент отправляет `Accept: text/event-stream`, backend переходит на project-owned SSE-контракт.

Поддерживаемые события:

- `meta`
- `chunk`
- `done`
- `error`

Пример потока:

```text
event: meta
data: {"model":"test-model"}

event: chunk
data: {"content":"Привет"}

event: chunk
data: {"content":" мир"}

event: done
data: {"model":"test-model","usage":{"inputTokens":10,"outputTokens":2,"totalTokens":12,"cost":0.0001}}
```

Provider-specific поля вроде `choices`, `delta` и raw provider `id` не являются частью публичного SSE-контракта.

## AI Error Examples

### Disabled AI

Когда AI не настроен, `/api/ai/status` возвращает `enabled=false`, а AI mutation endpoint'ы отвечают `503`.

```json
{
  "success": false,
  "code": "AI_UNAVAILABLE",
  "message": "AI features are currently unavailable."
}
```

### Provider failure

Если upstream не ответил корректно или ответ нельзя безопасно нормализовать, backend отвечает `502`:

```json
{
  "success": false,
  "code": "AI_PROVIDER_ERROR",
  "message": "Failed to receive a valid response from AI provider."
}
```

## Notes For Frontend

- Для AI availability сначала вызывайте `GET /api/ai/status`.
- Для streaming-чата frontend должен собирать итоговый текст только из `chunk`-событий.
- Для runtime validation можно считать error DTO единым для всех endpoint'ов.
