# Narrata — AI-дашборды с нарративом

🔗 **Живой сервис:** https://narrata-твой-ник.vercel.app  
📦 **Исходники:** https://github.com/ТВОЙ_НИК/narrata

Загрузите CSV / Excel / сырой текст → получите AI-историю, авто-подобранные графики и чат по данным.

## Стек
- **Next.js 14** (App Router) — UI + serverless API
- **TypeScript**, **Tailwind CSS**, **Framer Motion** — «вайб 2026»
- **Recharts** — чистые минималистичные графики
- **PapaParse** + **SheetJS (xlsx)** — парсинг CSV/Excel
- **GigaChat API** (Сбер) — российская LLM, оплата в рублях, соответствие 152-ФЗ

## Запуск локально

```bash
npm install
cp .env.example .env.local
# заполните GIGACHAT_AUTH_KEY (см. ниже)
npm run dev
```

Откройте http://localhost:3000

Без `GIGACHAT_AUTH_KEY` приложение стартует в **демо-режиме** — покажет структуру, но без живого ИИ.

## GigaChat API

1. Зайдите в личный кабинет GigaChat Studio
2. Создайте проект → получите **Authorization key** (Client ID + Secret в Base64)
3. В `.env.local`:
   ```
   GIGACHAT_AUTH_KEY=ваш_ключ
   GIGACHAT_SCOPE=GIGACHAT_API_PERS
   GIGACHAT_MODEL=GigaChat
   ```

## Как это работает

1. **Ingest** (`lib/parse.ts`) — CSV/Excel → `{ rows, columns }`; текст → `{ rawText }`.
2. **Auth** (`lib/gigachat.ts`) — OAuth2 к `ngw.devices.sberbank.ru`, токен кэшируется в памяти до `expires_at`.
3. **Analyze** (`/api/analyze`) — один вызов GigaChat возвращает строгий JSON: `{ headline, narrative, insights[3], charts[2-3] }`. Модель обязана ссылаться на реальные колонки — валидируется в `sanitize()`.
4. **Render** (`lib/chart.ts` + `ChartCard`) — числа считаются на клиенте из реальных строк по «спеке» от LLM (xKey, yKey, aggregation). Никаких галлюцинаций в цифрах.
5. **Ask** (`/api/chat`) — тот же дайджест как системный контекст; модель обязана честно отказаться, если данных нет.

### Обход TLS
GigaChat-эндпоинт подписан российским CA (Минцифры). Node его не знает, поэтому в `lib/gigachat.ts` выставляем `rejectUnauthorized: false`. Для прод-нагрузки — положить CA-файл и `NODE_EXTRA_CA_CERTS`.

## Деплой

### Vercel
Import Git Repository → Environment Variables:
- `GIGACHAT_AUTH_KEY`
- `GIGACHAT_SCOPE=GIGACHAT_API_PERS`
- `GIGACHAT_MODEL=GigaChat`

Deploy.

> ⚠️ Сбер иногда блокирует зарубежные IP. Если Vercel-деплой отдаёт 403 — используйте **Timeweb Cloud** (Frontend / Next.js): https://timeweb.cloud

## Env
```
GIGACHAT_AUTH_KEY=...          # обязателен для реального AI
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat        # опционально
```

## Структура
```
app/            страницы и роуты
app/api/        serverless: analyze + chat
components/     Dropzone, NarrativeHero, ChartCard, ChatPanel, Skeletons, ui
lib/            типы, парсинг, GigaChat-клиент, промпты, агрегация, демо
```