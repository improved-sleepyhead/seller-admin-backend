# Frontend Trainee Assignment Backend

Backend для личного кабинета продавца и AI-функций улучшения объявлений. Проект работает как frontend-facing API: отдаёт стабильные DTO, валидирует входящие запросы и изолирует интеграцию с AI-провайдером внутри backend.

Проект предоставляет:

- endpoint'ы списка, карточки и полного обновления объявления;
- endpoint'ы AI status, генерации описания, оценки цены и чата;
- стабильные публичные DTO для frontend runtime validation;
- единый формат публичных ошибок;
- Swagger UI и production-запуск через Docker Compose.

## Документация

- [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) — подробная интеграция для frontend
- [API_CONTRACT.md](./API_CONTRACT.md) — публичный request/response контракт
- [ARCHITECTURE.md](./ARCHITECTURE.md) — структура модулей и правила зависимостей
- [PROJECT_IMPROVEMENTS.md](./PROJECT_IMPROVEMENTS.md) — обзор текущих возможностей и изменений проекта

## Технологии

- Node.js
- TypeScript
- Fastify
- Zod
- OpenRouter
- Docker Compose
- Nginx

## Основные возможности

- `GET /items` с backend-driven search, filtering, sorting и pagination
- `GET /items/:id` с полным нормализованным item DTO
- `PUT /items/:id` с полной валидацией payload'а
- `GET /api/ai/status` для явной проверки доступности AI
- `POST /api/ai/description` для генерации или улучшения описания
- `POST /api/ai/price` для нормализованной оценки цены
- `POST /api/ai/chat` с JSON-ответом и SSE streaming mode
- Swagger UI по пути `/documentation`

## Быстрый старт локально

1. Создайте `.env` из шаблона:

```bash
cp .env.example .env
```

2. Установите зависимости:

```bash
npm install
```

3. При необходимости включите AI-функции, заполнив `OPENROUTER_API_KEY` в `.env`. Если ключ не задан, backend всё равно стартует, а `GET /api/ai/status` покажет `enabled: false`.

4. Запустите сервер:

```bash
npm start
```

По умолчанию backend доступен на `http://localhost:8080`.

## Быстрые проверки API

Проверить, что backend поднялся:

```bash
curl http://localhost:8080/api/ai/status
```

Запросить список объявлений:

```bash
curl "http://localhost:8080/items?limit=5&sortColumn=createdAt&sortDirection=desc"
```

Обновить объявление полным payload'ом:

```bash
curl -X PUT http://localhost:8080/items/1 \
  -H "Content-Type: application/json" \
  -d '{
    "category": "auto",
    "title": "Mitsubishi Lancer",
    "description": "Обслуженный автомобиль, на ходу каждый день.",
    "price": 350000,
    "params": {
      "brand": "Mitsubishi",
      "model": "Lancer",
      "yearOfManufacture": 2008,
      "transmission": "automatic",
      "mileage": 180000,
      "enginePower": 98
    }
  }'
```

## Запуск в Docker (необходим для корректной работы frontend, так как запросы идут на http://localhost/api/)

1. Создайте `.env` из шаблона:

```bash
cp .env.example .env
```

2. Запустите production-стек:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

3. После запуска доступны:

- API: `http://localhost`
- Swagger UI: `http://localhost/documentation`
- AI status: `http://localhost/api/ai/status`

## Основные переменные окружения

Полный шаблон находится в [.env.example](./.env.example).

- `PORT` — порт backend внутри процесса, по умолчанию `8080`
- `HOST` — host backend, по умолчанию `0.0.0.0`
- `CORS_ALLOWED_ORIGINS` — CSV allowlist для CORS
- `AI_ENABLED` — feature flag для AI
- `OPENROUTER_API_KEY` — ключ OpenRouter
- `OPENROUTER_BASE_URL` — base URL OpenRouter
- `OPENROUTER_MODEL` — модель для AI-запросов
- `AI_TIMEOUT_MS` — timeout для AI-запросов
- `NGINX_PORT` — внешний порт `nginx`

## Полезные команды

```bash
./scripts/test-all.sh
npm run build
npm run test:smoke
npm start
npm start:prod
```

## Что используется в деплое

- [Dockerfile](./Dockerfile) собирает production image в multi-stage режиме
- [docker-compose.prod.yml](./docker-compose.prod.yml) поднимает `api` и `nginx`
- [nginx/default.conf.template](./nginx/default.conf.template) проксирует обычные HTTP-запросы и сохраняет корректную работу SSE-чата
