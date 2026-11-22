# TheAppleBook 3.0 — запуск

Это стартовый проект социальной сети: регистрация/вход, профили, статусы, поиск пользователей, заявки в друзья, лента публикаций и панель управления ролями.

## 1. Создай проект Supabase
1. Открой https://supabase.com/dashboard и создай проект.
2. В SQL Editor вставь весь файл `supabase/schema.sql` и нажми Run.
3. Открой Project Settings → API.
4. Скопируй Project URL и Publishable key (или legacy anon key, если Publishable key ещё не показывается).

**Не используй Secret key или service_role key в браузере.**

## 2. Подключи ключи
Открой `app.js` и замени:
- `PASTE_YOUR_SUPABASE_PROJECT_URL`
- `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY`

на значения из своего проекта.

## 3. Зарегистрируй OWNER
1. Открой опубликованный сайт и зарегистрируй аккаунт с именем `Viktor Serbin`.
2. Подтверди email, если Supabase попросит.
3. Войди в этот аккаунт.
4. В Supabase открой SQL Editor и выполни запрос ниже, подставив UUID своего аккаунта:

```sql
select id, email from auth.users;
```

Найди строку с email своего аккаунта и скопируй `id`. Затем выполни:

```sql
update public.profiles
set role = 'owner', username = 'Viktor Serbin'
where id = 'ВСТАВЬ-СЮДА-UUID';
```

Это единственная первоначальная операция выдачи OWNER. Не делай OWNER через форму сайта.

## 4. Опубликуй на GitHub Pages
Загрузи в корень GitHub-репозитория:
- `index.html`
- `style.css`
- `app.js`
- папку `supabase` можно оставить в репозитории для SQL-документации.

В GitHub → Settings → Pages:
- Source: Deploy from a branch
- Branch: main
- Folder: /(root)
- Save

В Supabase → Authentication → URL Configuration добавь адрес GitHub Pages в Site URL и Redirect URLs, например:
`https://ТВОЙ-НИК.github.io/theapplebook/`

## 5. Что работает в этой версии
- Гости видят страницу входа/регистрации; контент приложения доступен после входа.
- Регистрация по email и паролю.
- Профиль: имя, «О себе», статус «Интересуюсь» / «Свободен/свободна» / «В отношениях» / «Не указано».
- Поиск зарегистрированных пользователей.
- Заявки в друзья: отправка, принятие, отклонение.
- Лента публикаций.
- Роли OWNER, CEO, DEPUTY CEO, ADMIN, MODERATOR, MEMBER.
- Панель управления ролями с серверной проверкой через PostgreSQL RPC и RLS.
- OWNER нельзя назначить через обычную панель или изменить через RPC.

## Важные ограничения и безопасность
- Это первая рабочая основа, а не законченная крупная соцсеть. Здесь пока нет личных сообщений, загрузки аватаров/фотографий, лайков, восстановления пароля и полноценной модерации контента.
- GitHub Pages хранит только фронтенд. Реальные аккаунты и данные находятся в Supabase.
- Владелец репозитория GitHub управляет публикацией кода. Не давай другим роль Owner/Admin в GitHub, если не хочешь, чтобы они могли менять сам сайт.
- Publishable key допустим в клиентском коде только вместе с корректными RLS-политиками. Secret/service_role key нельзя публиковать.
- Настрой подтверждение email и сильный пароль. Не используй личный email/пароль как демонстрационные данные.
- Перед реальным запуском проверь RLS-политики и настройки проекта; не храни в профилях личные данные, которые не хочешь показывать всем зарегистрированным пользователям.

## Документация
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
