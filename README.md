# Frontend Trainee Assignment Backend

Backend проекта для личного кабинета продавца и AI-функций улучшения объявлений. Текущая реализация соответствует роли frontend-facing API, описанной в [Backend_PRD_detailed.md](./Backend_PRD_detailed.md).

Проект предоставляет:

- endpoint'ы списка, карточки и полного обновления объявления;
- endpoint'ы AI status, генерации описания, оценки цены и чата;
- стабильные публичные DTO для frontend runtime validation;
- единый формат публичных ошибок;
- Swagger UI и production-запуск через Docker Compose.

## Документация

- [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) — подробная интеграционная документация для frontend-команды
- [PROJECT_IMPROVEMENTS.md](./PROJECT_IMPROVEMENTS.md) — подробный отчёт по выполненной работе, улучшениям и добавленным возможностям
- [API_CONTRACT.md](./API_CONTRACT.md) — актуальный публичный контракт request/response
- [ARCHITECTURE.md](./ARCHITECTURE.md) — схема модулей и границы ответственности
- [Backend_PRD_detailed.md](./Backend_PRD_detailed.md) — продуктовые и backend-требования
- [progress.md](./progress.md) — лог выполнения задач по шагам

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

## Запуск в Docker

1. Создайте `.env` из шаблона:

```bash
cp .env.example .env
```

2. При необходимости включите AI-функции, заполнив `OPENROUTER_API_KEY` в `.env`. Если ключ не задан, backend всё равно стартует, а `/api/ai/status` покажет, что AI отключён.

3. Запустите production-стек:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

4. После запуска доступны:

- API: `http://localhost`
- Swagger UI: `http://localhost/documentation`
- AI status: `http://localhost/api/ai/status`

## Основные переменные окружения

Полный шаблон находится в [.env.example](./.env.example).

- `PORT` — порт backend внутри контейнера, по умолчанию `8080`
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
npm run build
npm run test:smoke
node --env-file=.env --import tsx server.ts
```

## Что используется в деплое

- [Dockerfile](./Dockerfile) собирает production image в multi-stage режиме
- [docker-compose.prod.yml](./docker-compose.prod.yml) поднимает `api` и `nginx`
- [nginx/default.conf.template](./nginx/default.conf.template) проксирует обычные HTTP-запросы и сохраняет корректную работу SSE-чата
