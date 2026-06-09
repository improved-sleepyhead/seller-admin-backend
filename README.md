# Frontend Trainee Assignment Backend

Backend для учебного проекта личного кабинета продавца объявлений. Он хранит тестовый список объявлений, отдаёт данные для экранов списка и карточки, принимает изменения объявления и проксирует AI-функции через сервер, чтобы frontend не работал напрямую с внешним AI-провайдером и секретными ключами.

Проект рассчитан на связку с React/TypeScript frontend, но API можно запускать и проверять отдельно. Авторизации, базы данных и интеграции с реальным маркетплейсом здесь нет: данные берутся из локального JSON-файла и живут в памяти процесса.

## Что умеет проект

- отдаёт список объявлений с поиском, фильтрами, сортировкой и пагинацией;
- отдаёт полную карточку объявления по `id`;
- обновляет объявление через `PATCH /items/:id`;
- считает признак `needsRevision` для неполных объявлений;
- валидирует входящие query/body payload'ы через Zod;
- возвращает публичные ошибки в едином JSON-формате;
- показывает Swagger UI на `/documentation`;
- проверяет доступность AI-функций;
- генерирует или улучшает описание объявления через AI;
- предлагает цену и объяснение рекомендации через AI;
- стримит AI-чат в формате Vercel AI SDK UI message stream;
- изолирует OpenRouter API key на backend.

## Стек

- Node.js 22
- TypeScript
- Fastify
- Zod
- Vercel AI SDK
- OpenRouter
- Docker Compose
- Nginx

## Данные

Объявления лежат в `data/items.json`. При старте backend загружает их в in-memory repository. Это значит:

- отдельная база данных не нужна;
- изменения через `PATCH /items/:id` доступны в рамках текущего процесса;
- после перезапуска сервера данные снова берутся из `data/items.json`;
- проект удобен для локальной разработки, демо и тестов.

Поддерживаемые категории:

- `auto` - автомобили;
- `real_estate` - недвижимость;
- `electronics` - электроника.

## Быстрый старт

Скопируйте env-шаблон:

```bash
cp .env.example .env
```

Установите зависимости:

```bash
npm install
```

Запустите backend:

```bash
npm start
```

По умолчанию API доступен на `http://localhost:8080`, Swagger UI - на `http://localhost:8080/documentation`.

Проверить, что сервер отвечает:

```bash
curl http://localhost:8080/api/ai/status
```

Если `OPENROUTER_API_KEY` не задан, сервер всё равно стартует. В этом режиме `GET /api/ai/status` вернёт `enabled: false`, а AI mutation endpoint'ы будут отвечать контролируемой ошибкой `AI_UNAVAILABLE`.

## Запуск в Docker

Скопируйте env-шаблон, если ещё не сделали этого:

```bash
cp .env.example .env
```

Запустите production-стек:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

После запуска:

- API доступен на `http://localhost`;
- Swagger UI доступен на `http://localhost/documentation`;
- health/status check доступен на `http://localhost/api/ai/status`.

Остановить стек:

```bash
docker compose -f docker-compose.prod.yml down
```

## Основные endpoint'ы

### `GET /items`

Возвращает список объявлений:

```ts
{
  items: ItemReadDto[];
  total: number;
}
```

Query-параметры:

| Параметр | Значение |
| --- | --- |
| `q` | поиск по названию |
| `categories` | CSV-список категорий: `auto,real_estate,electronics` |
| `needsRevision` | `true` или `1`, чтобы показать объявления, которым нужна доработка |
| `limit` | размер страницы, по умолчанию `10` |
| `skip` | сколько элементов пропустить, по умолчанию `0` |
| `sortColumn` | `title`, `createdAt` или `price` |
| `sortDirection` | `asc` или `desc` |

Пример:

```bash
curl "http://localhost:8080/items?categories=auto,electronics&limit=5&skip=0&sortColumn=price&sortDirection=asc"
```

### `GET /items/:id`

Возвращает одну полную карточку объявления без обёртки:

```ts
{
  id: number;
  category: 'auto' | 'real_estate' | 'electronics';
  title: string;
  description?: string;
  price: number;
  createdAt: string;
  updatedAt: string;
  previewImage?: string;
  images?: string[];
  params: Record<string, unknown>;
  needsRevision?: boolean;
}
```

Пример:

```bash
curl http://localhost:8080/items/1
```

### `PATCH /items/:id`

Частично обновляет объявление и возвращает:

```json
{
  "success": true
}
```

Можно передавать только изменившиеся поля. Если меняется `category`, нужно передать полный `params` для новой категории.

Пример:

```bash
curl -X PATCH http://localhost:8080/items/1 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mitsubishi Lancer после обслуживания",
    "price": 350000,
    "params": {
      "mileage": 180000
    }
  }'
```

### `GET /api/ai/status`

Показывает, доступны ли AI-функции в текущем окружении:

```json
{
  "enabled": true,
  "provider": "openrouter",
  "model": "qwen/qwen3-next-80b-a3b-instruct",
  "features": {
    "description": true,
    "price": true,
    "chat": true
  }
}
```

### `POST /api/ai/description`

Принимает объявление и возвращает текст для поля описания:

```json
{
  "suggestion": "Подробное описание объявления.",
  "model": "qwen/qwen3-next-80b-a3b-instruct",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 30,
    "totalTokens": 130
  }
}
```

### `POST /api/ai/price`

Принимает объявление и возвращает рекомендованную цену:

```json
{
  "suggestedPrice": 543210,
  "reasoning": "Цена основана на категории, состоянии и характеристиках объявления.",
  "currency": "RUB",
  "model": "qwen/qwen3-next-80b-a3b-instruct"
}
```

### `POST /api/ai/chat`

Принимает объявление и массив UI messages. Успешный ответ стримится как `text/event-stream` с заголовком `x-vercel-ai-ui-message-stream: v1`, совместимым с Vercel AI SDK `useChat` / `DefaultChatTransport`.

## Формат AI-запроса

Для `description`, `price` и `chat` поле `item` передаётся в полном формате объявления:

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

## Формат ошибок

Все публичные ошибки возвращаются в одном формате:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": {}
}
```

Типичные коды:

- `VALIDATION_ERROR` - невалидный `id`, query-параметры или body;
- `NOT_FOUND` - объявление не найдено;
- `AI_UNAVAILABLE` - AI выключен или не настроен;
- `AI_PROVIDER_ERROR` - внешний AI-провайдер не ответил корректно;
- `INTERNAL_ERROR` - непредвиденная ошибка без утечки stack trace.

## Переменные окружения

Шаблон находится в `.env.example`.

| Переменная | Назначение |
| --- | --- |
| `PORT` | порт backend-процесса, по умолчанию `8080` |
| `HOST` | host backend-процесса, по умолчанию `0.0.0.0` |
| `CORS_ALLOWED_ORIGINS` | CSV allowlist origin'ов или `*` |
| `AI_ENABLED` | включает или выключает AI-функции |
| `OPENROUTER_API_KEY` | секретный ключ OpenRouter, хранится только на backend |
| `OPENROUTER_BASE_URL` | base URL OpenRouter API |
| `OPENROUTER_MODEL` | модель для AI-запросов |
| `AI_TIMEOUT_MS` | timeout AI-запросов |
| `NGINX_PORT` | внешний порт nginx в Docker Compose |

## Полезные команды

```bash
npm start
npm run build
npm run test:smoke
./scripts/test-all.sh
npm start:prod
```

`npm run build` собирает `dist/server.js`. `npm start:prod` запускает уже собранный production bundle.
