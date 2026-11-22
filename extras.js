import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
  "https://tzkxujrjrhyqxgzytaex.supabase.co",
  "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV"
);

const $ = id => document.getElementById(id);

const languages = [
  ["ru", "Русский"],
  ["uk", "Українська"],
  ["en", "English (US)"],
  ["it", "Italiano"],
  ["ja", "日本語"],
  ["be", "Беларуская"],
  ["tr", "Türkçe"],
  ["ar", "العربية"],
  ["fr", "Français"]
];

const themes = [
  ["burgundy", "🍷 Бордовая классика"],
  ["dark", "🌑 Тёмная"],
  ["midnight", "🌌 Полуночная"],
  ["forest", "🌲 Лесная"],
  ["lavender", "💜 Лавандовая"],
  ["graphite", "⚙️ Графитовая"]
];

const translations = {
  uk: {
    "Лента": "Стрічка",
    "Поиск людей": "Пошук людей",
    "Друзья": "Друзі",
    "Сообщения": "Повідомлення",
    "Мой профиль": "Мій профіль",
    "Управление": "Керування",
    "Настройки": "Налаштування",
    "Выйти": "Вийти",
    "Добро пожаловать": "Ласкаво просимо",
    "Войти": "Увійти",
    "Регистрация": "Реєстрація",
    "Имя пользователя": "Ім'я користувача",
    "Создать аккаунт": "Створити акаунт",
    "Сохранить профиль": "Зберегти профіль",
    "Внешний вид": "Зовнішній вигляд",
    "Тема": "Тема",
    "Статус": "Статус",
    "О себе": "Про себе",
    "Интересуюсь": "Цікавлюся",
    "Мои достижения": "Мої досягнення"
  },

  en: {
    "Лента": "Feed",
    "Поиск людей": "Find people",
    "Друзья": "Friends",
    "Сообщения": "Messages",
    "Мой профиль": "My profile",
    "Управление": "Administration",
    "Настройки": "Settings",
    "Выйти": "Log out",
    "Добро пожаловать": "Welcome",
    "Войти": "Sign in",
    "Регистрация": "Sign up",
    "Имя пользователя": "Username",
    "Создать аккаунт": "Create account",
    "Сохранить профиль": "Save profile",
    "Внешний вид": "Appearance",
    "Тема": "Theme",
    "Статус": "Status",
    "О себе": "About me",
    "Интересуюсь": "Interested",
    "Мои достижения": "My achievements"
  },

  it: {
    "Лента": "Bacheca",
    "Поиск людей": "Cerca persone",
    "Друзья": "Amici",
    "Сообщения": "Messaggi",
    "Мой профиль": "Il mio profilo",
    "Управление": "Amministrazione",
    "Настройки": "Impostazioni",
    "Выйти": "Esci",
    "Добро пожаловать": "Benvenuto",
    "Войти": "Accedi",
    "Регистрация": "Registrazione",
    "Создать аккаунт": "Crea account",
    "Сохранить профиль": "Salva profilo",
    "Внешний вид": "Aspetto",
    "Тема": "Tema"
  },

  ja: {
    "Лента": "フィード",
    "Поиск людей": "ユーザー検索",
    "Друзья": "友達",
    "Сообщения": "メッセージ",
    "Мой профиль": "プロフィール",
    "Управление": "管理",
    "Настройки": "設定",
    "Выйти": "ログアウト",
    "Добро пожаловать": "ようこそ",
    "Войти": "ログイン",
    "Регистрация": "登録",
    "Создать аккаунт": "アカウントを作成",
    "Сохранить профиль": "プロフィールを保存",
    "Внешний вид": "外観",
    "Тема": "テーマ"
  },

  be: {
    "Лента": "Стужка",
    "Поиск людей": "Пошук людзей",
    "Друзья": "Сябры",
    "Сообщения": "Паведамленні",
    "Мой профиль": "Мой профіль",
    "Управление": "Кіраванне",
    "Настройки": "Налады",
    "Выйти": "Выйсці",
    "Добро пожаловать": "Сардэчна запрашаем",
    "Войти": "Увайсці",
    "Регистрация": "Рэгістрацыя",
    "Создать аккаунт": "Стварыць уліковы запіс",
    "Сохранить профиль": "Захаваць профіль",
    "Внешний вид": "Знешні выгляд",
    "Тема": "Тэма"
  },

  tr: {
    "Лента": "Akış",
    "Поиск людей": "Kişileri bul",
    "Друзья": "Arkadaşlar",
    "Сообщения": "Mesajlar",
    "Мой профиль": "Profilim",
    "Управление": "Yönetim",
    "Настройки": "Ayarlar",
    "Выйти": "Çıkış yap",
    "Добро пожаловать": "Hoş geldiniz",
    "Войти": "Giriş yap",
    "Регистрация": "Kayıt ol",
    "Создать аккаунт": "Hesap oluştur",
    "Сохранить профиль": "Profili kaydet",
    "Внешний вид": "Görünüm",
    "Тема": "Tema"
  },

  ar: {
    "Лента": "المنشورات",
    "Поиск людей": "البحث عن أشخاص",
    "Друзья": "الأصدقاء",
    "Сообщения": "الرسائل",
    "Мой профиль": "ملفي الشخصي",
    "Управление": "الإدارة",
    "Настройки": "الإعدادات",
    "Выйти": "تسجيل الخروج",
    "Добро пожаловать": "مرحباً بك",
    "Войти": "تسجيل الدخول",
    "Регистрация": "التسجيل",
    "Создать аккаунт": "إنشاء حساب",
    "Сохранить профиль": "حفظ الملف الشخصي",
    "Внешний вид": "المظهر",
    "Тема": "السمة"
  },

  fr: {
    "Лента": "Fil d'actualité",
    "Поиск людей": "Rechercher des personnes",
    "Друзья": "Amis",
    "Сообщения": "Messages",
    "Мой профиль": "Mon profil",
    "Управление": "Administration",
    "Настройки": "Paramètres",
    "Выйти": "Déconnexion",
    "Добро пожаловать": "Bienvenue",
    "Войти": "Connexion",
    "Регистрация": "Inscription",
    "Создать аккаунт": "Créer un compte",
    "Сохранить профиль": "Enregistrer le profil",
    "Внешний вид": "Apparence",
    "Тема": "Thème"
  }
};

let currentUser = null;
let currentProfile = null;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// ------------------------------
// ТЕМЫ
// ------------------------------

function applyTheme(theme) {
  const allowed = themes.some(item => item[0] === theme)
    ? theme
    : "burgundy";

  document.body.dataset.theme = allowed;
  localStorage.setItem("apple-theme", allowed);
}

function createThemeStyles() {
  const style = document.createElement("style");

  style.textContent = `
    body[data-theme="midnight"] {
      --wine: #263d78;
      --wine2: #14264f;
      --pale: #e4ebff;
      --bg: #e6eaf4;
      --paper: #ffffff;
      --ink: #202a42;
      --line: #cbd4e8;
      --muted: #71809e;
    }

    body[data-theme="forest"] {
      --wine: #286344;
      --wine2: #163e2b;
      --pale: #e1f0e6;
      --bg: #e5eee7;
      --paper: #ffffff;
      --ink: #20382b;
      --line: #c6d9cc;
      --muted: #718579;
    }

    body[data-theme="lavender"] {
      --wine: #7954a6;
      --wine2: #50336f;
      --pale: #eee5f8;
      --bg: #eee9f4;
      --paper: #ffffff;
      --ink: #30253d;
      --line: #d8cce7;
      --muted: #897b98;
    }

    body[data-theme="graphite"] {
      --wine: #41464e;
      --wine2: #252a31;
      --pale: #e3e5e8;
      --bg: #dfe1e4;
      --paper: #f9fafb;
      --ink: #24272c;
      --line: #c6c9ce;
      --muted: #747a83;
    }

    body[data-theme="dark"] {
      --wine: #73354b;
      --wine2: #45202e;
      --pale: #382a30;
      --bg: #191518;
      --paper: #292226;
      --ink: #f5edf0;
      --line: #4b3940;
      --muted: #b9aab0;
    }

    body[data-theme="dark"] .nav-btn:hover,
    body[data-theme="dark"] .nav-btn.active {
      color: #fff;
    }

    .extra-settings {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid var(--line);
    }

    .extra-avatar {
      display: flex;
      align-items: center;
      gap: 15px;
      flex-wrap: wrap;
      margin: 15px 0;
    }

    .extra-avatar-preview {
      width: 74px;
      height: 74px;
      border-radius: 50%;
      object-fit: cover;
      display: grid;
      place-items: center;
      background: var(--pale);
      font-size: 35px;
      overflow: hidden;
      border: 3px solid var(--line);
    }

    .owner-achievement-box {
      margin-top: 18px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--pale);
    }

    .owner-achievement-box select {
      background: var(--paper);
      color: var(--ink);
    }

    [dir="rtl"] {
      text-align: right;
    }
  `;

  document.head.appendChild(style);
}

// ------------------------------
// ЯЗЫКИ
// ------------------------------

function applyLanguage(language) {
  const allowed = languages.some(item => item[0] === language)
    ? language
    : "ru";

  document.documentElement.lang = allowed;
  document.documentElement.dir = allowed === "ar" ? "rtl" : "ltr";

  localStorage.setItem("apple-language", allowed);

  const dictionary = translations[allowed] || {};

  document.querySelectorAll("button, h1, h2, h3, label, p, span").forEach(element => {
    if (!element.dataset.originalText) {
      element.dataset.originalText = element.textContent;
    }

    const original = element.dataset.originalText.trim();

    if (dictionary[original]) {
      element.textContent = dictionary[original];
    }
  });

  if ($("languageSelect")) {
    $("languageSelect").value = allowed;
  }
}

// ------------------------------
// ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ
// ------------------------------

function addSettings() {
  const settings = document.querySelector("#page-settings .panel");

  if (!settings || $("extraSettings")) return;

  const box = document.createElement("div");
  box.id = "extraSettings";
  box.className = "extra-settings";

  box.innerHTML = `
    <h3>🌍 Язык интерфейса</h3>
    <label>
      Выбери язык
      <select id="languageSelect">
        ${languages.map(([code, name]) =>
          `<option value="${code}">${name}</option>`
        ).join("")}
      </select>
    </label>

    <hr>

    <h3>🎨 Темы оформления</h3>
    <label>
      Выбери оформление
      <select id="extraThemeSelect">
        ${themes.map(([code, name]) =>
          `<option value="${code}">${name}</option>`
        ).join("")}
      </select>
    </label>
    <button id="extraSaveTheme" class="secondary">
      Применить тему
    </button>

    <hr>

    <h3>🖼️ Аватар профиля</h3>
    <div class="extra-avatar">
      <div id="extraAvatarPreview" class="extra-avatar-preview">🍎</div>
      <div>
        <label>
          Загрузить фотографию
          <input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp">
        </label>
      </div>
    </div>

    <label>
      Или выбери эмодзи
      <select id="avatarEmoji">
        ${["🍎","😀","😎","🦇","🐺","👑","⚡","🌙","🔥","🎭","🖤","💎","🦅","🐉","🌹"]
          .map(emoji => `<option value="${emoji}">${emoji}</option>`)
          .join("")}
      </select>
    </label>
    <button id="saveAvatar" class="secondary">Сохранить аватар</button>

    <p class="tiny muted">
      Фотография будет загружена в хранилище аватаров.
    </p>
  `;

  settings.appendChild(box);

  $("languageSelect").value =
    localStorage.getItem("apple-language") ||
    currentProfile?.language ||
    "ru";

  $("extraThemeSelect").value =
    localStorage.getItem("apple-theme") || "burgundy";

  $("languageSelect").addEventListener("change", event => {
    applyLanguage(event.target.value);
  });

  $("extraSaveTheme").addEventListener("click", () => {
    applyTheme($("extraThemeSelect").value);
    notify("Тема оформления изменена.");
  });

  $("saveAvatar").addEventListener("click", saveEmojiAvatar);

  $("avatarFile").addEventListener("change", showAvatarPreview);

  refreshAvatarPreview();
}

function notify(message) {
  const target = $("globalMessage");
  if (target) target.textContent = message;
}

// ------------------------------
// АВАТАРЫ
// ------------------------------

function refreshAvatarPreview() {
  const preview = $("extraAvatarPreview");
  if (!preview || !currentProfile) return;

  if (currentProfile.avatar_url) {
    preview.innerHTML =
      `<img src="${escapeHTML(currentProfile.avatar_url)}" alt="Avatar"
      style="width:100%;height:100%;object-fit:cover">`;
  } else {
    preview.textContent = currentProfile.avatar_emoji || "🍎";
  }
}

function showAvatarPreview(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    notify("Выбери изображение JPG, PNG или WEBP.");
    event.target.value = "";
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    notify("Размер фотографии не должен превышать 3 МБ.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    $("extraAvatarPreview").innerHTML =
      `<img src="${reader.result}" alt="Avatar preview"
      style="width:100%;height:100%;object-fit:cover">`;
  };

  reader.readAsDataURL(file);
}

async function saveEmojiAvatar() {
  if (!currentUser) return;

  const emoji = $("avatarEmoji").value;

  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: null,
      avatar_emoji: emoji
    })
    .eq("id", currentUser.id);

  if (error) {
    notify("Ошибка сохранения: " + error.message);
    return;
  }

  currentProfile.avatar_url = null;
  currentProfile.avatar_emoji = emoji;

  updateVisibleAvatar();
  refreshAvatarPreview();

  notify("Аватар сохранён.");
}

async function uploadAvatar() {
  if (!currentUser) return;

  const file = $("avatarFile").files?.[0];
  if (!file) return;

  const extension = file.type === "image/png"
    ? "png"
    : file.type === "image/webp"
      ? "webp"
      : "jpg";

  const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

  notify("Загружаем фотографию...");

  const { error: uploadError } = await supabase
    .storage
    .from("avatars")
    .upload(path, file, {
      upsert: false,
      contentType: file.type
    });

  if (uploadError) {
    notify("Ошибка загрузки: " + uploadError.message);
    return;
  }

  const { data } = supabase
    .storage
    .from("avatars")
    .getPublicUrl(path);

  const imageUrl = data.publicUrl;

  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: imageUrl,
      avatar_emoji: null
    })
    .eq("id", currentUser.id);

  if (error) {
    notify("Фотография загружена, но профиль не обновлён: " + error.message);
    return;
  }

  currentProfile.avatar_url = imageUrl;
  currentProfile.avatar_emoji = null;

  updateVisibleAvatar();
  refreshAvatarPreview();

  notify("Фотография профиля обновлена.");
}

function updateVisibleAvatar() {
  const avatar = $("myAvatar");
  if (!avatar || !currentProfile) return;

  if (currentProfile.avatar_url) {
    avatar.innerHTML = `<img src="${escapeHTML(currentProfile.avatar_url)}"
      style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    avatar.textContent = currentProfile.avatar_emoji ||
      currentProfile.username?.slice(0, 1).toUpperCase() ||
      "🍎";
  }
}

// ------------------------------
// OWNER — ВЫДАЧА ДОСТИЖЕНИЙ
// ------------------------------

async function addOwnerAchievementPanel() {
  if (!currentProfile || currentProfile.role !== "owner") return;

  const profilePage = $("page-profile");
  if (!profilePage || $("ownerAchievementPanel")) return;

  const panel = document.createElement("div");
  panel.id = "ownerAchievementPanel";
  panel.className = "panel pad owner-achievement-box";

  panel.innerHTML = `
    <h2>👑 OWNER CONTROL</h2>
    <p class="muted">
      Панель владельца для управления собственными достижениями.
    </p>
    <label>
      Выбери достижение
      <select id="ownerAchievementSelect">
        <option value="">Загрузка списка...</option>
      </select>
    </label>
    <button id="ownerGiveAchievement" class="primary">
      Выдать достижение себе
    </button>
    <p id="ownerAchievementMessage" class="notice"></p>
  `;

  profilePage.appendChild(panel);

  const { data, error } = await supabase
    .from("achievement_definitions")
    .select("code,title,description,icon")
    .order("title");

  const select = $("ownerAchievementSelect");

  if (error) {
    select.innerHTML = `<option value="">Ошибка загрузки</option>`;
    $("ownerAchievementMessage").textContent = error.message;
    return;
  }

  select.innerHTML = (data || []).map(item => `
    <option value="${escapeHTML(item.code)}">
      ${escapeHTML(item.icon || "🏆")} ${escapeHTML(item.title)}
    </option>
  `).join("") || `<option value="">Каталог пуст</option>`;

  $("ownerGiveAchievement").addEventListener("click", async () => {
    const code = select.value;
    if (!code) return;

    const button = $("ownerGiveAchievement");
    const message = $("ownerAchievementMessage");

    button.disabled = true;
    message.textContent = "Выдаём достижение...";

    const { error } = await supabase.rpc(
      "owner_grant_my_achievement",
      { p_achievement_code: code }
    );

    button.disabled = false;

    if (error) {
      message.textContent = "Ошибка: " + error.message;
      return;
    }

    message.textContent = "Достижение добавлено в твой аккаунт.";

    window.dispatchEvent(new Event("apple-achievements-refresh"));
  });
}

// ------------------------------
// ИНИЦИАЛИЗАЦИЯ
// ------------------------------

async function initializeExtras() {
  createThemeStyles();

  applyTheme(localStorage.getItem("apple-theme") || "burgundy");

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  currentUser = user;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) return;

  currentProfile = profile;

  applyLanguage(
    localStorage.getItem("apple-language") ||
    profile.language ||
    "ru"
  );

  updateVisibleAvatar();

  addSettings();
  addOwnerAchievementPanel();
}

document.addEventListener("click", event => {
  if (event.target?.id === "saveAvatar") {
    // Обработчик сохранения эмодзи уже установлен.
  }
});

document.addEventListener("change", event => {
  if (event.target?.id === "avatarFile") {
    uploadAvatar();
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
  }

  if (event === "SIGNED_IN" && session) {
    setTimeout(initializeExtras, 300);
  }
});

initializeExtras();

// Повторно добавляем настройки при открытии раздела настроек.
document.addEventListener("click", event => {
  const button = event.target.closest('[data-page="settings"]');

  if (button) {
    setTimeout(addSettings, 250);
  }

  const profileButton = event.target.closest('[data-page="profile"]');

  if (profileButton) {
    setTimeout(addOwnerAchievementPanel, 250);
  }
});
