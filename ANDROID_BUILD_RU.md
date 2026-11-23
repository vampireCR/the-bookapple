# TheAppleBook для Android (Capacitor)

Это Android-проект на базе существующей веб-версии TheAppleBook. Используется тот же HTML/CSS/JS и тот же Supabase backend; аккаунты и данные не переносятся и не дублируются.

## Что внутри
- `www/` — локальная веб-версия, которую загружает Android-приложение.
- `capacitor.config.json` — идентификатор `com.theapplebook.app`, название TheAppleBook и настройки запуска.
- `package.json` — зависимости Capacitor.

## Как собрать APK на Windows
Нужны Node.js LTS и Android Studio с Android SDK.

1. Распаковать архив.
2. Открыть терминал в папке `the-bookapple-main`.
3. Выполнить:
   ```powershell
   npm install
   npx cap add android
   npx cap sync android
   npx cap open android
   ```
4. В Android Studio дождаться синхронизации Gradle.
5. Для тестового APK выбрать **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
6. APK будет в `android/app/build/outputs/apk/debug/app-debug.apk`.

Для обновления веб-кода в приложении скопировать новые файлы сайта в `www/`, затем выполнить `npx cap sync android` и собрать APK заново.

## Важно
- Этот архив — исходный Capacitor-проект, а не готовый APK.
- APK нельзя корректно собрать без Android SDK/Gradle и загрузки Android-зависимостей. В среде подготовки архива Android SDK и Gradle не установлены, а загрузка npm-пакетов не завершилась, поэтому я не называю этот ZIP готовым APK.
- Для Android-приложения используется локальная копия `www/`; обновления сайта не попадут в APK автоматически — для них потребуется новая сборка и установка обновления.
- Supabase URL и publishable key остаются в клиентском приложении, как и в веб-версии. Никогда не помещать `service_role` key в приложение.
