import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
  "https://tzkxujrjrhyqxgzytaex.supabase.co",
  "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV"
);

const $ = id => document.getElementById(id);

let user = null;
let profile = null;
let selectedEmoji = "🍎";

function message(text, error = false) {
  const el = $("profileSettingsMessage");
  if (!el) return;

  el.textContent = text;
  el.style.color = error ? "#c0392b" : "";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function notifyProfileUpdated() {
  window.dispatchEvent(
    new CustomEvent("theapplebook:profile-updated")
  );
}

function setAvatar(url, emoji, username) {
  const avatar = $("myAvatar");
  const preview = $("avatarPreview");

  const content = url
    ? `<img src="${escapeHTML(url)}" alt="Аватар">`
    : escapeHTML(emoji || username?.slice(0, 1).toUpperCase() || "?");

  if (avatar) avatar.innerHTML = content;
  if (preview) preview.innerHTML = content;
}

async function loadProfile() {
  const { data: { user: authUser }, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authUser) return;

  user = authUser;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,handle,avatar_url,avatar_emoji")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    message("Не удалось загрузить профиль: " + (error?.message || ""), true);
    return;
  }

  profile = data;
  selectedEmoji = data.avatar_emoji || "🍎";

  setAvatar(data.avatar_url, data.avatar_emoji, data.username);

  const handleInput = $("handleInput");
  if (handleInput) handleInput.value = data.handle || "";

  const picker = $("emojiPicker");

  if (picker) {
    picker.querySelectorAll("[data-emoji]").forEach(button => {
      button.classList.toggle(
        "selected",
        button.dataset.emoji === selectedEmoji
      );
    });
  }
}

async function uploadAvatar() {
  if (!user || !profile) {
    message("Сначала войди в аккаунт.", true);
    return;
  }

  const input = $("avatarFile");
  const file = input?.files?.[0];

  if (!file) {
    message("Сначала выбери фотографию.", true);
    return;
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(file.type)) {
    message("Поддерживаются только JPG, PNG и WebP.", true);
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    message("Максимальный размер фотографии — 3 МБ.", true);
    return;
  }

  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[file.type];

  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

  message("Загружаем фотографию...");

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (uploadError) {
    message("Ошибка загрузки: " + uploadError.message, true);
    return;
  }

  const { data: publicData } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);

  const avatarUrl = publicData.publicUrl;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      avatar_url: avatarUrl,
      avatar_emoji: null
    })
    .eq("id", user.id);

  if (updateError) {
    message("Фотография загружена, но профиль не обновился: " + updateError.message, true);
    return;
  }

  profile.avatar_url = avatarUrl;
  profile.avatar_emoji = null;

  setAvatar(avatarUrl, null, profile.username);
  notifyProfileUpdated();

  if (input) input.value = "";

  message("Аватар успешно обновлён!");
}

async function saveEmoji() {
  if (!user || !profile) {
    message("Сначала войди в аккаунт.", true);
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_emoji: selectedEmoji,
      avatar_url: null
    })
    .eq("id", user.id);

  if (error) {
    message("Не удалось сохранить эмодзи: " + error.message, true);
    return;
  }

  profile.avatar_emoji = selectedEmoji;
  profile.avatar_url = null;

  setAvatar(null, selectedEmoji, profile.username);
  notifyProfileUpdated();

  message("Эмодзи сохранено!");
}

async function saveHandle() {
  if (!user || !profile) {
    message("Сначала войди в аккаунт.", true);
    return;
  }

  const input = $("handleInput");

  const handle = (input?.value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
    message(
      "Ник должен содержать 3–20 символов: латинские буквы, цифры и _.",
      true
    );
    return;
  }

  message("Проверяем ник...");

  const { data: existing, error: checkError } = await supabase
    .from("profiles")
    .select("id")
    .ilike("handle", handle)
    .neq("id", user.id)
    .limit(1);

  if (checkError) {
    message("Не удалось проверить ник: " + checkError.message, true);
    return;
  }

  if (existing?.length) {
    message("Этот ник уже занят. Попробуй другой.", true);
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ handle })
    .eq("id", user.id);

  if (error) {
    message("Ошибка сохранения: " + error.message, true);
    return;
  }

  profile.handle = handle;
  notifyProfileUpdated();

  message("Твой ник @" + handle + " сохранён!");
}

$("uploadAvatar")?.addEventListener("click", uploadAvatar);
$("saveEmoji")?.addEventListener("click", saveEmoji);
$("saveHandle")?.addEventListener("click", saveHandle);

$("emojiPicker")?.querySelectorAll("[data-emoji]").forEach(button => {
  button.addEventListener("click", () => {
    selectedEmoji = button.dataset.emoji;

    $("emojiPicker").querySelectorAll("button").forEach(item => {
      item.classList.toggle("selected", item === button);
    });

    const preview = $("avatarPreview");
    if (preview) preview.textContent = selectedEmoji;
  });
});

supabase.auth.onAuthStateChange(event => {
  if (event === "SIGNED_IN") {
    setTimeout(loadProfile, 100);
  }

  if (event === "SIGNED_OUT") {
    user = null;
    profile = null;
  }
});

loadProfile();
