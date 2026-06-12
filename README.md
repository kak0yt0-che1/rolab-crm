# ROLAB — система учёта занятий

CRM для учёта занятий педагогов в школах и детских садах: расписание, проведение занятий, посещаемость детей, замены, расчёт выплат педагогам и счетов клиентам.

**Стек:** Node.js + Express, MongoDB Atlas (Mongoose), JWT-авторизация, vanilla JS фронтенд (отдаётся из `public/`).

## Запуск

```bash
npm install
cp .env.example .env   # заполнить JWT_SECRET и MONGODB_URI
npm run dev            # разработка (node --watch)
npm start              # production
```

При старте сервер сам инициализирует базу (создаёт пользователей admin1, admin2, dev, если их нет).

## Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `JWT_SECRET` | да | Секрет подписи JWT. Сервер не стартует с пустым или дефолтным значением |
| `MONGODB_URI` | да | Строка подключения MongoDB Atlas |
| `PORT` | нет | Порт HTTP (по умолчанию 3000) |
| `NODE_ENV` | нет | `production` отключает `/api/dev` и скрывает тексты внутренних ошибок |
| `CORS_ORIGIN` | нет | Разрешённые origin через запятую; не задан — CORS открыт (фронт same-origin) |

## Роли

- **admin** — полный CRUD: компании, педагоги, расписание, дети, ставки, отчёты, экспорт счетов.
- **teacher** — видит и редактирует только своё: слоты расписания для своих компаний, проведение/отмена своих занятий, отметка детей, назначение замены. Видит только свои выплаты.
- **dev** — служебный доступ через `/api/dev/*` (выключен в production).

## API (кратко)

Все эндпоинты, кроме `POST /api/auth/login`, требуют заголовок `Authorization: Bearer <token>`.

| Метод и путь | Доступ | Назначение |
|---|---|---|
| `POST /api/auth/login` | все | Вход (rate-limit: 20 попыток / 15 мин) |
| `GET /api/auth/me` | все | Текущий пользователь |
| `PUT /api/auth/change-password` | все | Смена пароля (мин. 6 символов) |
| `GET/POST/PUT/DELETE /api/companies` | чтение — все, запись — admin | Компании (школы/садики), `client_rate` — ставка клиента |
| `GET/POST/PUT/DELETE /api/teachers` | admin | Педагоги + ставки (`/:id/rates`) |
| `GET /api/teachers/list-names` | все | Список педагогов для выбора замены |
| `GET /api/teachers/me/companies` | teacher | Компании текущего педагога |
| `GET/POST/PUT/DELETE /api/schedule` | admin / teacher (своё) | Слоты расписания |
| `POST /api/schedule/generate` | admin (все) / teacher (свои) | Генерация занятий из расписания за период |
| `GET /api/lessons` | admin / teacher (свои) | Занятия с фильтрами (дата, статус, педагог, компания) |
| `PUT /api/lessons/:id/complete` | admin / teacher (своё) | Провести занятие |
| `PUT /api/lessons/:id/cancel` | admin / teacher (своё) | Отменить занятие |
| `POST /api/lessons/:id/substitute` | admin / teacher (своё) | Назначить замену |
| `GET/POST/PUT/DELETE /api/children` | чтение — все, запись — admin | Дети садиков, `/import` — импорт из Excel |
| `GET/PUT /api/attendance/:lessonId` | admin / teacher (своё) | Отметки посещаемости занятия |
| `POST /api/attendance/:lessonId/child` | admin / teacher (своё) | Создать ребёнка прямо из окна отметки |
| `GET /api/payments/calculate` | все (teacher — только своё) | Расчёт выплат: grand_client / grand_teacher / grand_profit |
| `GET /api/reports/summary` | все (teacher — только своё) | Сводка занятий за период |
| `GET /api/reports/attendance` | все (teacher — только своё) | Таблица дети×даты по садику |
| `GET /api/reports/export-data` | admin | Данные для счёта клиенту (без ставок педагогов) |

## Бизнес-логика оплаты

Две независимые ставки, обе задаёт админ:

- **Ставка клиента** (`Company.client_rate`) — сколько организация платит центру. Садик: × количество детей; школа: фикс за занятие. `null` → формула по умолчанию.
- **Ставка педагога** (`TeacherRate.rate`) — сколько центр платит педагогу, фикс за занятие. `null` → формула: садик `5000 + 1000·(дети−5)`, максимум 10000; школа 3500.
- `lesson.price` (ручная цена) перекрывает ставку педагога (мастер-классы).
- Прибыль центра = клиент − педагог. Расчёты — в `utils/payment.js`.

## Структура

```
server.js          — bootstrap: middleware безопасности, маршруты, обработчик ошибок
middleware/auth.js — JWT-проверка, adminOnly / devOnly
routes/            — HTTP-эндпоинты
models/            — Mongoose-схемы (с индексами)
utils/payment.js   — бизнес-правила расчёта оплаты
utils/http.js      — badId / escapeRegex / serverError (общие хелперы роутов)
database/          — подключение, инициализация, скрипты импорта
public/            — фронтенд (login / admin / teacher / dev)
```

## Деплой (Render)

- Хранилище Render эфемерно — поэтому используется MongoDB Atlas, а не SQLite.
- Задать env-переменные `JWT_SECRET`, `MONGODB_URI`, `NODE_ENV=production` в настройках сервиса.
- IP-адреса Render должны быть в whitelist Atlas (или `0.0.0.0/0` + сильный пароль БД).
- `app.set('trust proxy', 1)` уже включён — rate-limit корректно видит IP за прокси.

## Известные ограничения

- `User.plain_password` хранит пароли педагогов открытым текстом — осознанное бизнес-решение (админ выдаёт пароли педагогам). При компрометации БД пароли раскрыты; рассмотреть переход на одноразовые ссылки сброса.
- Пакет `xlsx` (используется только локальными скриптами импорта в `database/`) имеет известные уязвимости без исправления; на сервер в рантайме он не загружается.
- Список-эндпоинты не пагинированы — при текущих объёмах (сотни записей) приемлемо.
