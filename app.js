import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://tzkxujrjrhyqxgzytaex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentPresenceMode = "online";
let activeChatUser = null;
let messagesChannel = null;
let searchTimer = null;
let bootRunning = false;
let sendingMessage = false;
let searchRequestId = 0;
let feedLoadPromise = null;
let giftLoadPromise = null;
const presenceCache = new Map();

// =====================================
// ОБЩИЕ ФУНКЦИИ
// =====================================

function say(message, target = "globalMessage") {
  const el = $(target);
  if (el) el.textContent = message || "";
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function roleLabel(role) {
  return ({
    owner: "OWNER",
    ceo: "CEO",
    deputy_ceo: "DEPUTY CEO",
    admin: "ADMIN",
    moderator: "MODERATOR",
    member: "MEMBER"
  })[role] || "MEMBER";
}

function isStaff(role) {
  return ["owner", "ceo", "deputy_ceo", "admin", "moderator"].includes(role);
}

function presenceLabel(mode) {
  return ({ online: "🟢 В сети", invisible: "⚫ Невидимый", sleep: "🌙 Спящий режим", hidden: "Присутствие скрыто" })[mode] || "Присутствие скрыто";
}

async function fillPresenceForProfiles(container, profiles) {
  const people = profiles || [];
  const now = Date.now();
  const missing = people.filter(person => {
    const cached = presenceCache.get(person.id);
    return !cached || cached.expiresAt <= now;
  });
  if (missing.length) {
    const { data, error } = await supabase.rpc("visible_presence_many", {
      target_users: missing.map(person => person.id)
    });
    const values = new Map((data || []).map(row => [row.user_id, row.presence_mode]));
    for (const person of missing) {
      presenceCache.set(person.id, {
        value: error ? "hidden" : (values.get(person.id) || "online"),
        expiresAt: Date.now() + 15000
      });
    }
  }
  for (const person of people) {
    const mode = presenceCache.get(person.id)?.value || "hidden";
    const target = container?.querySelector(`[data-presence-for="${CSS.escape(person.id)}"]`);
    if (target) target.textContent = presenceLabel(mode);
  }
}

function formatTime(date) {
  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function avatarContent(profile) {
  if (profile?.avatar_url) {
    return `<img src="${esc(profile.avatar_url)}" alt="Аватар" loading="lazy">`;
  }

  return esc(
    profile?.avatar_emoji ||
    profile?.username?.slice(0, 1).toUpperCase() ||
    "?"
  );
}

function renderAvatar(profile, className = "user-avatar") {
  return `
    <div class="${className}">
      ${avatarContent(profile)}
    </div>
  `;
}

function renderAvatarButton(profile, className = "user-avatar") {
  if (!profile?.id) return renderAvatar(profile, className);

  return `
    <button
      type="button"
      class="avatar-profile-button"
      data-profile-open="${esc(profile.id)}"
      aria-label="Открыть профиль ${esc(profile.username || "пользователя")}"
      title="Открыть профиль"
    >
      ${renderAvatar(profile, className)}
    </button>
  `;
}

function profileHandle(profile) {
  return profile?.handle
    ? `@${esc(profile.handle)}`
    : "";
}

function profileLink(profile) {
  if (!profile?.id) return "";

  return `
    <button
      type="button"
      class="profile-open-link"
      data-profile-open="${esc(profile.id)}"
    >
      Открыть профиль
    </button>
  `;
}

async function removeMessagesChannel() {
  if (messagesChannel) {
    await supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }
}

// =====================================
// ПЕРЕКЛЮЧЕНИЕ СТРАНИЦ
// =====================================

function showPage(name) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.add("hidden");
  });

  $("page-" + name)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === name);
  });

  if (name === "feed") loadFeed();
  if (name === "notes") loadNotes();
  if (name === "gifts") loadGiftShop();
  if (name === "people") searchPeople();
  if (name === "friends") loadFriends();
  if (name === "messages") loadMessageContacts();
  if (name === "profile") renderProfile();
  if (name === "admin") loadAdmin();
  if (name === "settings") fillSettings();
}

document.querySelectorAll(".nav-btn[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

// =====================================
// АВТОРИЗАЦИЯ
// =====================================

function switchAuth(tab) {
  $("loginForm")?.classList.toggle("hidden", tab !== "login");
  $("signupForm")?.classList.toggle("hidden", tab !== "signup");

  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  say("", "authMessage");
}

let qrPollTimer = null;
let qrPollBusy = false;
let qrPollSecret = null;
let qrImageUrl = null;

function stopQrLogin(message = "") {
  clearInterval(qrPollTimer);
  qrPollTimer = null;
  qrPollSecret = null;
  if (qrImageUrl) URL.revokeObjectURL(qrImageUrl);
  qrImageUrl = null;
  $("qrLoginImage")?.classList.add("hidden");
  $("qrLoginCode")?.classList.add("hidden");
  if ($("qrLoginStatus") && message) $("qrLoginStatus").textContent = message;
}

async function pollQrLogin(challengeId) {
  if (!qrPollSecret || qrPollBusy) return;
  qrPollBusy = true;
  try {
    const { data, error } = await supabase.functions.invoke("qr-login-poll", {
      body: { challenge_id: challengeId, poll_verifier: qrPollSecret }
    });
    if (error) throw error;
    if (data?.status === "pending") return;
    if (data?.status === "expired") {
      stopQrLogin("Время действия QR-кода истекло. Создай новый код.");
      return;
    }
    if (data?.status === "approved" && data?.token_hash) {
      stopQrLogin("Вход подтверждён. Выполняю вход…");
      const { error: authError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink"
      });
      if (authError) say("Не удалось завершить QR-вход: " + authError.message, "qrLoginStatus");
      return;
    }
    if (data?.status === "consumed") stopQrLogin("Этот QR-код уже использован. Создай новый.");
    if (data?.status === "invalid") stopQrLogin("Запрос входа недействителен. Создай новый QR-код.");
  } catch (error) {
    stopQrLogin("Не удалось проверить вход: " + (error?.message || "ошибка соединения"));
  } finally {
    qrPollBusy = false;
  }
}

$("startQrLogin")?.addEventListener("click", async () => {
  stopQrLogin();
  $("qrLoginPanel")?.classList.remove("hidden");
  $("qrLoginStatus").textContent = "Создаю одноразовый QR-код…";
  $("startQrLogin").disabled = true;
  try {
    const { data, error } = await supabase.functions.invoke("qr-login-create", { body: {} });
    if (error) throw error;
    if (!data?.challenge_id || !data?.poll_verifier || !data?.qr_svg || !data?.display_code) throw new Error("Сервер вернул неполный ответ.");
    qrPollSecret = data.poll_verifier;
    qrImageUrl = URL.createObjectURL(new Blob([data.qr_svg], { type: "image/svg+xml" }));
    $("qrLoginImage").src = qrImageUrl;
    $("qrLoginImage").classList.remove("hidden");
    $("qrLoginCode").textContent = "Код подтверждения: " + data.display_code;
    $("qrLoginCode").classList.remove("hidden");
    $("qrLoginStatus").textContent = "Ожидаю подтверждения на твоём устройстве…";
    await pollQrLogin(data.challenge_id);
    if (qrPollSecret) qrPollTimer = setInterval(() => pollQrLogin(data.challenge_id), 1800);
  } catch (error) {
    stopQrLogin("Не удалось создать QR-вход: " + (error?.message || "ошибка сервера"));
  } finally {
    $("startQrLogin").disabled = false;
  }
});

$("cancelQrLogin")?.addEventListener("click", () => {
  stopQrLogin("Вход отменён.");
  $("qrLoginPanel")?.classList.add("hidden");
});

function readQrApproval() {
  const values = new URLSearchParams(location.hash.slice(1));
  const challengeId = values.get("qr");
  const verifier = values.get("v");
  const code = values.get("c");
  return challengeId && verifier && code ? { challengeId, verifier, code } : null;
}

function clearQrApprovalHash() {
  history.replaceState(null, "", location.pathname + location.search);
}

async function approveQrLoginIfPresent() {
  const approval = readQrApproval();
  if (!approval || !currentUser) return;
  if (!confirm(`Разрешить вход на другом устройстве? Сверь код ${approval.code} с кодом на экране, где создан QR. Подтверждай только при совпадении.`)) {
    clearQrApprovalHash();
    return;
  }
  const { error } = await supabase.rpc("approve_qr_login", {
    challenge_id: approval.challengeId,
    verifier: approval.verifier
  });
  clearQrApprovalHash();
  say(error ? "QR-запрос истёк или уже использован." : "Вход подтверждён на другом устройстве.");
}

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => switchAuth(button.dataset.tab));
});

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const { error } = await supabase.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value
  });

  if (error) {
    say(error.message, "authMessage");
    return;
  }

  await boot();
});

$("signupForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const username = $("signupName").value.trim();

  if (username.length < 2) {
    return say("Имя должно содержать минимум 2 символа.", "authMessage");
  }

  const { data, error } = await supabase.auth.signUp({
    email: $("signupEmail").value.trim(),
    password: $("signupPassword").value,
    options: {
      data: { username }
    }
  });

  if (error) {
    say(error.code === "23505" ? "Это имя уже занято. Выберите другое." : error.message, "authMessage");
    return;
  }

  if (!data.session) {
    say(
      "Аккаунт создан. Проверь почту и подтверди email, затем войди.",
      "authMessage"
    );
    return;
  }

  await boot();
});

$("logoutBtn")?.addEventListener("click", async () => {
  await removeMessagesChannel();

  await supabase.auth.signOut();

  currentUser = null;
  currentProfile = null;
  activeChatUser = null;

  $("appView")?.classList.add("hidden");
  $("authView")?.classList.remove("hidden");

  if ($("topUser")) $("topUser").textContent = "";
});

// =====================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// =====================================

async function boot() {
  if (bootRunning) return;

  bootRunning = true;

  try {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session) {
      currentUser = null;
      currentProfile = null;
      activeChatUser = null;

      await removeMessagesChannel();

      $("authView")?.classList.remove("hidden");
      $("appView")?.classList.add("hidden");
      if (readQrApproval()) {
        clearQrApprovalHash();
        say("На этом устройстве сначала войди в аккаунт, затем отсканируй QR-код ещё раз.", "authMessage");
      }

      return;
    }

    currentUser = session.user;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    if (error || !profile) {
      say("Профиль ещё создаётся. Обнови страницу через несколько секунд.");
      return;
    }

    currentProfile = profile;

    $("authView")?.classList.add("hidden");
    $("appView")?.classList.remove("hidden");

    if ($("topUser")) {
      $("topUser").textContent =
        profile.username + " · " + roleLabel(profile.role);
    }

    if ($("myName")) {
      $("myName").textContent = profile.username;
    }

    if ($("myAvatar")) {
      $("myAvatar").innerHTML = avatarContent(profile);
    }

    if ($("myRole")) {
      $("myRole").innerHTML =
        `<span class="pill">${esc(roleLabel(profile.role))}</span>`;
    }

    if ($("myStatus")) {
      $("myStatus").textContent =
        presenceLabel(currentPresenceMode);
    }

    $("adminNav")?.classList.toggle(
      "hidden",
      !["owner", "ceo", "deputy_ceo", "admin"].includes(profile.role)
    );

    const theme = localStorage.getItem("apple-theme") || "burgundy";

    document.body.classList.toggle("dark", theme === "dark");
    document.body.dataset.theme = theme;

    setupMessagesRealtime();

    await approveQrLoginIfPresent();

    showPage("feed");

  } catch (error) {
    say("Ошибка запуска: " + error.message);
  } finally {
    bootRunning = false;
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
    activeChatUser = null;

    removeMessagesChannel();

    $("appView")?.classList.add("hidden");
    $("authView")?.classList.remove("hidden");

    if ($("topUser")) $("topUser").textContent = "";
  }

  if (event === "SIGNED_IN" && session) {
    setTimeout(() => boot(), 0);
  }
});

// =====================================
// ЛЕНТА
// =====================================

$("postForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const content = $("postText").value.trim();

  if (!content) return;

  const { error } = await supabase
    .from("posts")
    .insert({
      user_id: currentUser.id,
      content
    });

  if (error) return say(error.message);

  $("postText").value = "";

  say("Публикация добавлена.");

  await loadFeed();
});

async function loadFeedOnce() {
  if (!currentUser || !$("feedList")) return;

  const { data, error } = await supabase
    .from("posts")
    .select(`
      id,
      user_id,
      content,
      created_at,
      profiles (
        id,
        username,
        role,
        avatar_url,
        avatar_emoji,
        handle
      )
    `)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) return say(error.message);

  $("feedList").innerHTML = (data || []).map(post => {
    const author = post.profiles || {};

    return `
      <article class="post">

        <div class="post-head">

          ${renderAvatarButton(author, "post-avatar")}

          <div class="user-info">
            <strong>${esc(author.username || "Пользователь")}</strong>

            <span class="pill">
              ${esc(roleLabel(author.role))}
            </span>

            <small class="muted">
              ${profileHandle(author)}
            </small>
          </div>

          <span class="post-date">
            ${formatTime(post.created_at)}
          </span>

        </div>

        <div class="post-body">
          ${esc(post.content)}
        </div>

        ${post.user_id === currentUser.id ? `<div class="post-actions"><button type="button" data-post-edit="${esc(post.id)}">Изменить</button><button type="button" data-post-delete="${esc(post.id)}">Удалить</button></div>` : ""}
        <form class="comment-form" data-comment-form="${esc(post.id)}"><input maxlength="1000" required placeholder="Ответить пользователю"><button type="submit">Ответить</button></form>
        <div class="post-comments" data-comments="${esc(post.id)}"></div>

        ${profileLink(author)}

      </article>
    `;
  }).join("") || `
    <div class="panel pad muted">
      Публикаций пока нет. Будь первым!
    </div>
  `;

  await loadComments(data || []);
}

async function loadFeed() {
  if (!feedLoadPromise) {
    feedLoadPromise = loadFeedOnce().finally(() => { feedLoadPromise = null; });
  }
  return feedLoadPromise;
}

async function loadComments(posts) {
  if (!posts.length) return;
  const { data, error } = await supabase.from("post_comments").select("post_id,user_id,content,profiles(username)").in("post_id", posts.map(post => post.id)).order("created_at");
  if (error) return;
  for (const row of data || []) {
    const target = document.querySelector(`[data-comments="${CSS.escape(row.post_id)}"]`);
    if (!target) continue;
    const line = document.createElement("p");
    line.textContent = `${row.profiles?.username || "Пользователь"}: ${row.content}`;
    target.append(line);
  }
}

document.addEventListener("submit", async event => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector("input");
  const { error } = await supabase.from("post_comments").insert({ post_id: form.dataset.commentForm, user_id: currentUser.id, content: input.value.trim() });
  if (error) return say(error.message);
  await loadFeed();
});
document.addEventListener("click", async event => {
  const del = event.target.closest("[data-post-delete]");
  const edit = event.target.closest("[data-post-edit]");
  if (del) {
    const { error } = await supabase.from("posts").delete().eq("id", del.dataset.postDelete).eq("user_id", currentUser.id);
    if (error) return say(error.message);
    await loadFeed();
  }
  if (edit) {
    const body = edit.closest(".post")?.querySelector(".post-body");
    const replacement = prompt("Изменить публикацию", body?.textContent || "");
    if (replacement === null) return;
    const { error } = await supabase.from("posts").update({ content: replacement.trim() }).eq("id", edit.dataset.postEdit).eq("user_id", currentUser.id);
    if (error) return say(error.message);
    await loadFeed();
  }
});

// =====================================
// ПОИСК ПОЛЬЗОВАТЕЛЕЙ
// =====================================

$("peopleSearch")?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchPeople, 300);
});

async function searchPeople() {
  if (!currentUser || !$("peopleResults")) return;
  const requestId = ++searchRequestId;

  if ($("peopleWelcome")) $("peopleWelcome").textContent = "Welcome, " + (currentProfile?.username || "friend") + "!";

  const term = $("peopleSearch")?.value.trim() || "";

  let query = supabase
    .from("profiles")
    .select(`
      id,
      username,
      role,
      avatar_url,
      avatar_emoji,
      handle
    `)
    .neq("id", currentUser.id)
    .order("username")
    .limit(30);

  if (term) {
    const cleanTerm = term.replace(/^@/, "").replace(/[,%()]/g, "");

    query = query.or(
      `username.ilike.%${cleanTerm}%,handle.ilike.%${cleanTerm}%`
    );
  }

  const [{ data, error }, { data: outgoing }, { data: incoming }] = await Promise.all([
    query,
    supabase.from("friendships").select("recipient_id,status").eq("requester_id", currentUser.id),
    supabase.from("friendships").select("requester_id,status").eq("recipient_id", currentUser.id)
  ]);

  if (error) return say(error.message);
  if (requestId !== searchRequestId) return;

  const relations = new Map();

  (outgoing || []).forEach(item => {
    relations.set(item.recipient_id, item.status);
  });

  (incoming || []).forEach(item => {
    relations.set(item.requester_id, item.status);
  });

  $("peopleResults").innerHTML = (data || []).map(person => {
    const state = relations.get(person.id);

    let action = "";

    if (state === "accepted") {
      action = `<span class="pill">Уже друзья</span>`;
    } else if (state === "pending") {
      action = `<span class="muted">Заявка отправлена</span>`;
    } else {
      action = `
        <button class="primary" data-add="${esc(person.id)}">
          Добавить в друзья
        </button>
      `;
    }

    return `
      <div class="result-row">

        <div class="person-main">

          ${renderAvatarButton(person)}

          <div class="user-info">
            <button
              type="button"
              class="person-name-button"
              data-profile-open="${esc(person.id)}"
            >
              ${esc(person.username)}
            </button>

            <span class="pill">
              ${esc(roleLabel(person.role))}
            </span>

            <small class="muted">
              ${profileHandle(person)}
            </small>

            <small class="muted" data-presence-for="${esc(person.id)}">
              …
            </small>
          </div>

        </div>

        <div class="person-actions">
          ${action}
          ${profileLink(person)}
        </div>

      </div>
    `;
  }).join("") || `<p class="muted">Пользователи не найдены.</p>`;

  await fillPresenceForProfiles($("peopleResults"), data || []);
  document.querySelectorAll("[data-add]").forEach(button => {
    button.addEventListener("click", () => {
      sendFriendRequest(button.dataset.add);
    });
  });
}

async function sendFriendRequest(id) {
  const { error } = await supabase
    .from("friendships")
    .insert({
      requester_id: currentUser.id,
      recipient_id: id
    });

  if (error) return say(error.message);

  say("Заявка в друзья отправлена.");

  await searchPeople();
}

// =====================================
// ДРУЗЬЯ
// =====================================

async function getAcceptedFriends() {
  if (!currentUser) return [];

  const fields = `
    id,
    username,
    avatar_url,
    avatar_emoji,
    handle,
    role
  `;

  const [sentResult, receivedResult] = await Promise.all([
    supabase
      .from("friendships")
      .select(`recipient_id,profiles!friendships_recipient_id_fkey(${fields})`)
      .eq("requester_id", currentUser.id)
      .eq("status", "accepted"),
    supabase
      .from("friendships")
      .select(`requester_id,profiles!friendships_requester_id_fkey(${fields})`)
      .eq("recipient_id", currentUser.id)
      .eq("status", "accepted")
  ]);

  const { data: sent, error: sentError } = sentResult;

  if (sentError) {
    say(sentError.message);
    return [];
  }

  const { data: received, error: receivedError } = receivedResult;

  if (receivedError) {
    say(receivedError.message);
    return [];
  }

  const all = [
    ...(sent || []).map(item => item.profiles),
    ...(received || []).map(item => item.profiles)
  ].filter(Boolean);

  return [...new Map(all.map(person => [person.id, person])).values()];
}

async function loadFriends() {
  if (!currentUser) return;

  const { data: incoming, error } = await supabase
    .from("friendships")
    .select(`
      id,
      requester_id,
      profiles!friendships_requester_id_fkey(
        id,
        username,
        avatar_url,
        avatar_emoji,
        handle,
        role
      )
    `)
    .eq("recipient_id", currentUser.id)
    .eq("status", "pending");

  if (error) say(error.message);

  $("incomingRequests").innerHTML = (incoming || []).map(request => {
    const person = request.profiles || {};

    return `
      <div class="result-row">

        <div class="person-main">
          ${renderAvatarButton(person)}

          <div class="user-info">
            <button
              type="button"
              class="person-name-button"
              data-profile-open="${esc(person.id || "")}"
            >
              ${esc(person.username || "Пользователь")}
            </button>

            <small class="muted">${profileHandle(person)}</small>
          </div>
        </div>

        <span>
          <button class="primary" data-accept="${esc(request.id)}">
            Принять
          </button>

          <button class="secondary" data-reject="${esc(request.id)}">
            Отклонить
          </button>
        </span>

      </div>
    `;
  }).join("") || `<p class="muted">Новых заявок нет.</p>`;

  document.querySelectorAll("[data-accept]").forEach(button => {
    button.addEventListener("click", () => {
      answerRequest(button.dataset.accept, "accepted");
    });
  });

  document.querySelectorAll("[data-reject]").forEach(button => {
    button.addEventListener("click", () => {
      answerRequest(button.dataset.reject, "rejected");
    });
  });

  const friends = await getAcceptedFriends();

  $("friendsList").innerHTML = friends.map(person => `
    <div class="result-row">

      <div class="person-main">
        ${renderAvatarButton(person)}

        <div class="user-info">
          <button
            type="button"
            class="person-name-button"
            data-profile-open="${esc(person.id)}"
          >
            ${esc(person.username)}
          </button>

          <small class="muted">${profileHandle(person)}</small>

          <small class="muted" data-presence-for="${esc(person.id)}">
            …
          </small>
        </div>
      </div>

      <button
        class="primary"
        data-open-chat="${esc(person.id)}"
        data-open-name="${esc(person.username)}"
      >
        Написать
      </button>

    </div>
  `).join("") || `<p class="muted">Пока нет друзей.</p>`;

  await fillPresenceForProfiles($("friendsList"), friends);
  document.querySelectorAll("[data-open-chat]").forEach(button => {
    button.addEventListener("click", () => {
      showPage("messages");

      openChat(
        button.dataset.openChat,
        button.dataset.openName
      );
    });
  });
}

async function answerRequest(id, status) {
  const { error } = await supabase
    .from("friendships")
    .update({ status })
    .eq("id", id);

  if (error) return say(error.message);

  say(
    status === "accepted"
      ? "Пользователь добавлен в друзья."
      : "Заявка отклонена."
  );

  await loadFriends();
}

// =====================================
// СООБЩЕНИЯ
// =====================================

async function loadMessageContacts() {
  if (!currentUser) return;

  const friends = await getAcceptedFriends();

  $("messageContacts").innerHTML = friends.map(person => `
    <button
      class="chat-contact ${activeChatUser?.id === person.id ? "active" : ""}"
      data-chat-id="${esc(person.id)}"
      data-chat-name="${esc(person.username)}"
    >
      ${renderAvatar(person, "chat-contact-avatar")}

      <span class="chat-contact-info">
        <strong>${esc(person.username)}</strong>
        <small class="muted">${profileHandle(person)}</small>
      </span>
    </button>
  `).join("") || `
    <p class="muted">
      У тебя пока нет друзей. Добавь кого-нибудь, чтобы начать переписку.
    </p>
  `;

  document.querySelectorAll("[data-chat-id]").forEach(button => {
    button.addEventListener("click", () => {
      openChat(
        button.dataset.chatId,
        button.dataset.chatName
      );
    });
  });
}

async function openChat(friendId, friendName) {
  if (!currentUser) return;

  activeChatUser = {
    id: friendId,
    username: friendName
  };

  $("chatHeader").innerHTML = `
    <p class="muted">Загрузка профиля...</p>
  `;

  $("chatHistory").innerHTML = `
    <p class="muted">Загрузка переписки...</p>
  `;

  $("messageInput").disabled = false;
  $("messageSend").disabled = false;

  const { data: friend, error } = await supabase
    .from("profiles")
    .select(`
      id,
      username,
      role,
      handle,
      avatar_url,
      avatar_emoji,
      bio,
      created_at
    `)
    .eq("id", friendId)
    .single();

  if (error || !friend) {
    say("Не удалось загрузить профиль собеседника.");
    $("chatHeader").textContent = friendName || "Переписка";
    return;
  }

  activeChatUser = friend;
  const { data: chatPresence } = await supabase.rpc("visible_presence", { target_user: friend.id });
  friend.presence_mode = chatPresence;
  $("messageInput").placeholder = "Написать " + friend.username + "!";

  $("chatHeader").innerHTML = `
    <button
      type="button"
      class="chat-header-profile"
      data-profile-open="${esc(friend.id)}"
      title="Открыть профиль"
    >
      ${renderAvatar(friend, "chat-header-avatar")}

      <span class="chat-header-info">
        <strong>${esc(friend.username)}</strong>
        <small>${esc(presenceLabel(friend.presence_mode))}</small>
      </span>
    </button>
  `;

  await loadMessageContacts();
  await loadChatMessages();

  $("messageInput").focus();
}

async function loadChatMessages() {
  if (!currentUser || !activeChatUser) return;

  const selectedFriendId = activeChatUser.id;

  const { data, error } = await supabase
    .from("messages")
    .select("id,sender_id,receiver_id,content,created_at")
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedFriendId}),and(sender_id.eq.${selectedFriendId},receiver_id.eq.${currentUser.id})`
    )
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    $("chatHistory").innerHTML = `
      <p class="muted">
        Ошибка загрузки сообщений: ${esc(error.message)}
      </p>
    `;
    return;
  }

  if (!activeChatUser || activeChatUser.id !== selectedFriendId) {
    return;
  }

  const messageIds = (data || []).map(message => message.id);
  let attachmentsByMessage = new Map();
  if (messageIds.length) {
    const { data: attachments } = await supabase
      .from("message_attachments")
      .select("message_id,storage_path,file_name,mime_type")
      .in("message_id", messageIds);
    attachmentsByMessage = new Map();
    const signedAttachments = await Promise.all((attachments || []).map(async attachment => {
      const { data: signed } = await supabase.storage
        .from("message-files")
        .createSignedUrl(attachment.storage_path, 600);
      return signed?.signedUrl ? { ...attachment, url: signed.signedUrl } : null;
    }));
    for (const attachment of signedAttachments) {
      if (!attachment) continue;
      const items = attachmentsByMessage.get(attachment.message_id) || [];
      items.push(attachment);
      attachmentsByMessage.set(attachment.message_id, items);
    }
  }

  if (!activeChatUser || activeChatUser.id !== selectedFriendId) return;

  $("chatHistory").innerHTML = (data || []).map(message => {
    const mine = message.sender_id === currentUser.id;
    const attached = (attachmentsByMessage.get(message.id) || []).map(file => {
      const name = esc(file.file_name);
      const url = esc(file.url);
      if (file.mime_type.startsWith("image/")) return `<a class="message-attachment" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}" loading="lazy"></a>`;
      if (file.mime_type.startsWith("video/")) return `<video class="message-attachment" src="${url}" controls preload="metadata" aria-label="${name}"></video>`;
      if (file.mime_type.startsWith("audio/")) return `<audio class="message-attachment" src="${url}" controls preload="metadata" aria-label="${name}"></audio>`;
      return `<a class="message-file-link" href="${url}" target="_blank" rel="noopener" download="${name}">📎 ${name}</a>`;
    }).join("");

    return `
      <div class="chat-message ${mine ? "mine" : "theirs"}">
        <div>${esc(message.content)}</div>
        ${attached}

        <span class="chat-time">
          ${formatTime(message.created_at)}
        </span>
      </div>
    `;
  }).join("") || `
    <p class="muted">
      Сообщений пока нет. Напиши первым!
    </p>
  `;

  $("chatHistory").scrollTop = $("chatHistory").scrollHeight;
}

const MESSAGE_FILE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "audio/webm", "audio/mp4",
  "application/pdf", "text/plain"
]);

async function sendMessageAttachment(file, messageText = "") {
  if (!currentUser || !activeChatUser || sendingMessage) return;
  const mimeType = (file?.type || "").split(";")[0].trim().toLowerCase();
  if (!file || !MESSAGE_FILE_TYPES.has(mimeType)) {
    say("Этот формат файла не поддерживается.");
    return;
  }
  if (file.size < 1 || file.size > 10 * 1024 * 1024) {
    say("Файл должен быть размером не более 10 МБ.");
    return;
  }

  const recipientId = activeChatUser.id;
  const messageId = crypto.randomUUID();
  const safeName = (file.name || "voice-message").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 150);
  const storagePath = `${currentUser.id}/${messageId}/${crypto.randomUUID()}-${safeName}`;
  const content = (messageText || `Вложение: ${safeName}`).slice(0, 2000);
  sendingMessage = true;
  $("messageSend").disabled = true;
  $("attachMessageButton").disabled = true;
  $("voiceRecordButton").disabled = true;

  const { error: uploadError } = await supabase.storage
    .from("message-files")
    .upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) {
    say("Не удалось загрузить файл: " + uploadError.message);
    sendingMessage = false;
    $("messageSend").disabled = false;
    $("attachMessageButton").disabled = false;
    $("voiceRecordButton").disabled = false;
    return;
  }

  const { error: messageError } = await supabase.from("messages").insert({
    id: messageId, sender_id: currentUser.id, receiver_id: recipientId, content
  });
  if (messageError) {
    await supabase.storage.from("message-files").remove([storagePath]);
    say("Не удалось отправить сообщение: " + messageError.message);
  } else {
    const { error: metadataError } = await supabase.from("message_attachments").insert({
      message_id: messageId, sender_id: currentUser.id, storage_path: storagePath,
      file_name: safeName, mime_type: mimeType, file_size: file.size
    });
    if (metadataError) {
      await supabase.storage.from("message-files").remove([storagePath]);
      say("Файл не удалось прикрепить: " + metadataError.message);
    }
    if (activeChatUser?.id === recipientId) await loadChatMessages();
  }

  sendingMessage = false;
  $("messageSend").disabled = false;
  $("attachMessageButton").disabled = false;
  $("voiceRecordButton").disabled = false;
}

$("attachMessageButton")?.addEventListener("click", () => $("messageFileInput")?.click());
$("messageFileInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (file) await sendMessageAttachment(file);
  event.target.value = "";
});

$("emojiToggle")?.addEventListener("click", () => $("messageEmojiPicker")?.classList.toggle("hidden"));
document.querySelectorAll("[data-message-emoji]").forEach(button => {
  button.addEventListener("click", () => {
    const input = $("messageInput");
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const emoji = button.dataset.messageEmoji;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
    $("messageEmojiPicker").classList.add("hidden");
  });
});

let activeRecorder = null;
let voiceChunks = [];
let voiceBytes = 0;
let voiceStopTimer = null;
$("voiceRecordButton")?.addEventListener("click", async () => {
  const button = $("voiceRecordButton");
  if (activeRecorder?.state === "recording") {
    activeRecorder.stop();
    button.textContent = "🎙️";
    $("voiceRecordStatus").textContent = "Сохраняю запись…";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    say("Запись голоса не поддерживается этим браузером.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      stream.getTracks().forEach(track => track.stop());
      say("Этот браузер не поддерживает безопасный формат голосовой записи.");
      return;
    }
    activeRecorder = new MediaRecorder(stream, { mimeType });
    voiceChunks = [];
    voiceBytes = 0;
    activeRecorder.ondataavailable = event => {
      if (!event.data.size) return;
      voiceBytes += event.data.size;
      voiceChunks.push(event.data);
      if (voiceBytes > 10 * 1024 * 1024 && activeRecorder.state === "recording") {
        $("voiceRecordStatus").textContent = "Достигнут лимит 10 МБ…";
        activeRecorder.stop();
      }
    };
    activeRecorder.onstop = async () => {
      clearTimeout(voiceStopTimer);
      stream.getTracks().forEach(track => track.stop());
      const recordingMimeType = (activeRecorder.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(voiceChunks, { type: recordingMimeType });
      $("voiceRecordStatus").textContent = "";
      if (blob.size > 10 * 1024 * 1024) {
        say("Запись больше 10 МБ и не была отправлена.");
        return;
      }
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      await sendMessageAttachment(new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type }), "Голосовое сообщение");
    };
    activeRecorder.start(1000);
    voiceStopTimer = setTimeout(() => {
      if (activeRecorder?.state === "recording") {
        $("voiceRecordStatus").textContent = "Максимум 2 минуты…";
        activeRecorder.stop();
      }
    }, 120000);
    button.textContent = "⏹️";
    $("voiceRecordStatus").textContent = "Идёт запись · нажми ещё раз, чтобы отправить";
  } catch (error) {
    say("Не удалось получить доступ к микрофону: " + (error?.message || "проверь разрешение браузера"));
  }
});

$("messageForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !activeChatUser || sendingMessage) return;

  const content = $("messageInput").value.trim();

  if (!content) return;

  const receiverId = activeChatUser.id;

  sendingMessage = true;
  $("messageSend").disabled = true;

  const { error } = await supabase
    .from("messages")
    .insert({
      sender_id: currentUser.id,
      receiver_id: receiverId,
      content
    });

  sendingMessage = false;
  $("messageSend").disabled = false;

  if (error) {
    say("Не удалось отправить сообщение: " + error.message);
    return;
  }

  $("messageInput").value = "";

  if (activeChatUser?.id === receiverId) {
    await loadChatMessages();
  }

  $("messageInput").focus();
});

// =====================================
// REALTIME — ЖИВЫЕ СООБЩЕНИЯ
// =====================================

function setupMessagesRealtime() {
  if (!currentUser) return;

  if (messagesChannel) {
    supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }

  messagesChannel = supabase
    .channel("private-messages-" + currentUser.id)

    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${currentUser.id}`
      },
      async payload => {
        const newMessage = payload.new;

        if (
          activeChatUser &&
          activeChatUser.id === newMessage.sender_id
        ) {
          await loadChatMessages();
        } else {
          say("У тебя новое сообщение! Открой раздел «Сообщения».");
          document.title = "Новое сообщение · TheAppleBook";
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            new Notification("Новое сообщение", { body: "Открой TheAppleBook, чтобы прочитать его." });
          }
        }
      }
    )

    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        console.log("TheAppleBook: Realtime messages connected.");
      }

      if (status === "CHANNEL_ERROR") {
        say("Не удалось подключить обновление сообщений в реальном времени.");
      }
    });
}

// =====================================
// ПРОФИЛЬ
// =====================================

function renderProfile() {
  if (!currentProfile || !$("profileDetails")) return;

  const profile = currentProfile;

  $("profileDetails").innerHTML = `
    <div class="profile-public-header">

      ${renderAvatar(profile, "profile-large-avatar")}

      <div>
        <h3>
          ${esc(profile.username)}
          <span class="pill">${esc(roleLabel(profile.role))}</span>
        </h3>

        <p class="muted">${profileHandle(profile)}</p>
      </div>

    </div>

    <p>
      <strong>Статус:</strong>
      ${esc(presenceLabel(currentPresenceMode))}
    </p>

    <p>
      <strong>О себе:</strong>
      ${esc(profile.bio || "Пока ничего не написано.")}
    </p>

    <p class="muted">
      В TheAppleBook с
      ${profile.created_at
        ? new Date(profile.created_at).toLocaleDateString("ru-RU")
        : "неизвестной даты"}
    </p>
  `;
}

// =====================================
// ОТКРЫТИЕ ПУБЛИЧНОГО ПРОФИЛЯ
// =====================================

async function openPublicProfile(id) {
  if (!id || !currentUser) return;

  if (id === currentUser.id) {
    showPage("profile");
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      username,
      role,
      bio,
      created_at,
      handle,
      avatar_url,
      avatar_emoji,
      featured_achievement,
      show_achievement
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    say("Не удалось открыть профиль.");
    return;
  }

  const { data: publicPresence } = await supabase.rpc("visible_presence", { target_user: id });
  data.presence_mode = publicPresence;
  const { data: publicPrivate } = await supabase.rpc("visible_profile_private", { target_user: id });
  data.public_phone = publicPrivate?.phone || null;
  data.public_age = publicPrivate?.age ?? null;

  // Записываем просмотр профиля
  const { error: viewError } = await supabase.rpc(
    "record_profile_view",
    {
      target_profile_id: id
    }
  );

  if (viewError) {
    console.warn("Не удалось записать просмотр профиля:", viewError.message);
  }

  $("publicProfileModal")?.remove();

  const modal = document.createElement("div");

  modal.id = "publicProfileModal";
  modal.className = "profile-modal";

  modal.innerHTML = `
    <div class="profile-modal-card">

      <button
        class="profile-modal-close"
        type="button"
        aria-label="Закрыть профиль"
      >×</button>

      ${renderAvatar(data, "profile-large-avatar")}

      <h2>${esc(data.username)}</h2>

      <span class="pill">
        ${esc(roleLabel(data.role))}
      </span>

      <p class="muted">${profileHandle(data)}</p>

      <div class="public-profile-info">

        <div class="public-profile-item">
          <strong>Статус</strong>
          <span>${esc(presenceLabel(data.presence_mode))}</span>
        </div>

        <div class="public-profile-item">
          <strong>О себе</strong>
          <span>${esc(data.bio || "Пока ничего не написано.")}</span>
        </div>

        ${data.public_phone ? `<div class="public-profile-item"><strong>Телефон</strong><span>${esc(data.public_phone)}</span></div>` : ""}
        ${data.public_age !== null ? `<div class="public-profile-item"><strong>Возраст</strong><span>${esc(data.public_age)} лет</span></div>` : ""}

        <div class="public-profile-item">
          <strong>Дата регистрации</strong>
          <span>
            ${data.created_at
              ? new Date(data.created_at).toLocaleDateString("ru-RU")
              : "Неизвестно"}
          </span>
        </div>

      </div>

    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.remove();
    document.removeEventListener("keydown", handleEscape);
  };

  const handleEscape = event => {
    if (event.key === "Escape") {
      closeModal();
    }
  };

  modal.querySelector(".profile-modal-close").addEventListener("click", closeModal);

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", handleEscape);
}

// Единый обработчик для всех кнопок открытия профиля.

document.addEventListener("click", event => {
  const button = event.target.closest("[data-profile-open]");

  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const profileId = button.dataset.profileOpen;

  if (profileId) {
    openPublicProfile(profileId);
  }
});

// =====================================
// НАСТРОЙКИ
// =====================================

function fillSettings() {
  if (!currentProfile) return;

  if ($("editName")) {
    $("editName").value = currentProfile.username || "";
  }

  if ($("editStatus")) {
    $("editStatus").value = currentPresenceMode;
  }

  if ($("editBio")) {
    $("editBio").value = currentProfile.bio || "";
  }

  if ($("accountStanding")) {
    const level = currentProfile.reputation_level ?? 1;
    const labels = { 1: "+1 · Хорошая репутация", 0: "0 · Ограниченный доступ", "-1": "-1 · Сильные ограничения", "-2": "-2 · Под угрозой", "-3": "-3 · Аккаунт приостановлен" };
    $("accountStanding").textContent = (labels[level] || labels[1]) + ". Решения о доступе должны сопровождаться объяснением и возможностью апелляции.";
    $("deactivateAccount")?.classList.toggle("hidden", currentProfile.account_state !== "active");
    $("reactivateAccount")?.classList.toggle("hidden", currentProfile.account_state !== "deactivated");
  }

  if ($("phoneInput") && currentUser) {
    supabase.from("profile_private").select("phone,phone_visible,birth_date,birth_date_visible,presence_mode").eq("user_id", currentUser.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      currentPresenceMode = data.presence_mode || "online";
      if ($("editStatus")) $("editStatus").value = currentPresenceMode;
      $("phoneInput").value = data.phone || "";
      $("phoneVisible").checked = data.phone_visible;
      $("birthDateInput").value = data.birth_date || "";
      $("birthDateVisible").checked = data.birth_date_visible;
    });
  }

  if ($("themeSelect")) {
    $("themeSelect").value =
      localStorage.getItem("apple-theme") || "burgundy";
  }
}

$("savePrivateProfile")?.addEventListener("click", async () => {
  const { error } = await supabase.from("profile_private").upsert({
    user_id: currentUser.id,
    phone: $("phoneInput").value.trim() || null,
    phone_visible: $("phoneVisible").checked,
    birth_date: $("birthDateInput").value || null,
    birth_date_visible: $("birthDateVisible").checked,
    presence_mode: $("editStatus").value
  });
  $("accountSettingsMessage").textContent = error ? error.message : "Приватные данные сохранены.";
});

$("changeEmail")?.addEventListener("click", async () => {
  const email = $("newEmail").value.trim();
  if (!email) return;
  const { error } = await supabase.auth.updateUser({ email });
  $("accountSettingsMessage").textContent = error ? error.message : "Проверьте новую почту и подтвердите смену адреса.";
});
$("changePassword")?.addEventListener("click", async () => {
  const password = $("newPassword").value;
  if (password.length < 8) return say("Пароль должен содержать минимум 8 символов.", "accountSettingsMessage");
  const { error } = await supabase.auth.updateUser({ password });
  $("accountSettingsMessage").textContent = error ? error.message : "Пароль изменён.";
});
$("deactivateAccount")?.addEventListener("click", async () => {
  if (!confirm("Временно отключить аккаунт? Вы сможете войти и включить его снова.")) return;
  const { error } = await supabase.rpc("set_account_deactivated", { deactivate: true });
  if (error) return say(error.message, "accountSettingsMessage");
  await supabase.auth.signOut(); location.reload();
});
$("reactivateAccount")?.addEventListener("click", async () => {
  const { error } = await supabase.rpc("set_account_deactivated", { deactivate: false });
  if (error) return say(error.message, "accountSettingsMessage");
  location.reload();
});
$("deleteAccount")?.addEventListener("click", async () => {
  if (!confirm("Удалить аккаунт и связанные данные без возможности восстановления?")) return;
  const { error } = await supabase.functions.invoke("delete-account", { body: { confirm: true } });
  if (error) return say("Удаление не выполнено: " + error.message, "accountSettingsMessage");
  await supabase.auth.signOut(); location.reload();
});

$("profileForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const username = $("editName").value.trim();

  if (username.length < 2) {
    return say("Имя должно содержать минимум 2 символа.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      bio: $("editBio").value.trim()
    })
    .eq("id", currentUser.id);

  if (error) return say(error.code === "23505" ? "Такое имя пользователя уже занято." : error.message);

  currentPresenceMode = $("editStatus").value;
  const { error: presenceError } = await supabase.from("profile_private").upsert({ user_id: currentUser.id, presence_mode: currentPresenceMode });
  if (presenceError) return say(presenceError.message);

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (profileError) return say(profileError.message);

  currentProfile = updatedProfile;

  if ($("myName")) $("myName").textContent = currentProfile.username;

  if ($("topUser")) {
    $("topUser").textContent =
      currentProfile.username + " · " + roleLabel(currentProfile.role);
  }

  renderProfile();

  window.dispatchEvent(new CustomEvent("theapplebook:profile-updated"));

  say("Профиль сохранён.");
});

$("saveTheme")?.addEventListener("click", () => {
  const theme = $("themeSelect").value;

  localStorage.setItem("apple-theme", theme);

  document.body.classList.toggle("dark", theme === "dark");
  document.body.dataset.theme = theme;

  say("Тема сохранена.");
});

// =====================================
// ОБНОВЛЕНИЕ АВАТАРКИ ПОСЛЕ ИЗМЕНЕНИЯ
// =====================================

window.addEventListener("theapplebook:profile-updated", async () => {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error || !data) return;

  currentProfile = data;

  if ($("myAvatar")) {
    $("myAvatar").innerHTML = avatarContent(data);
  }

  if ($("myName")) {
    $("myName").textContent = data.username;
  }

  if ($("myStatus")) {
    $("myStatus").textContent = presenceLabel(currentPresenceMode);
  }

  renderProfile();

  const activePage = document.querySelector(".page:not(.hidden)");

  if (activePage?.id === "page-feed") await loadFeed();
  if (activePage?.id === "page-friends") await loadFriends();
  if (activePage?.id === "page-messages") await loadMessageContacts();
});

// =====================================
// АДМИНИСТРИРОВАНИЕ
// =====================================

async function loadAdmin() {
  if (!currentProfile || !$("adminContent")) return;

  if (!["owner", "ceo", "deputy_ceo", "admin"].includes(currentProfile.role)) {
    $("adminContent").textContent = "Недостаточно прав.";
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,role,avatar_url,avatar_emoji,handle")
    .order("username")
    .limit(100);

  if (error) return say(error.message);

  const canManageTop = currentProfile.role === "owner";

  $("adminContent").innerHTML = (data || []).map(person => {
    const options = canManageTop
      ? ["member", "moderator", "admin", "deputy_ceo", "ceo"]
      : ["member", "moderator", "admin"];

    const controls = person.role === "owner"
      ? `<span class="pill">OWNER — защищён</span>`
      : `
        <select data-role-select="${esc(person.id)}">
          ${options.map(role => `
            <option value="${role}" ${role === person.role ? "selected" : ""}>
              ${roleLabel(role)}
            </option>
          `).join("")}
        </select>

        <button class="secondary" data-role-save="${esc(person.id)}">
          Сохранить
        </button>
      `;

    return `
      <div class="result-row">

        <div class="person-main">
          ${renderAvatarButton(person)}

          <div class="user-info">
            <button
              type="button"
              class="person-name-button"
              data-profile-open="${esc(person.id)}"
            >
              ${esc(person.username)}
            </button>

            <small class="muted">${profileHandle(person)}</small>
            <small class="muted">${esc(roleLabel(person.role))}</small>
          </div>
        </div>

        <div>${controls}</div>

      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-role-save]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.roleSave;

      const select = document.querySelector(
        `[data-role-select="${id}"]`
      );

      if (!select) return;

      const role = select.value;

      const { error } = await supabase.rpc("admin_set_role", {
        target_user_id: id,
        new_role: role
      });

      if (error) return say(error.message);

      say("Роль обновлена.");

      await boot();
      await loadAdmin();
    });
  });
}

// =====================================
// ЗАПУСК
// =====================================

boot();

// Private notes: database RLS restricts every row to its owner.
async function loadNotes() {
  if (!currentUser || !$("notesList")) return;
  const { data, error } = await supabase.from("notes").select("id,body,updated_at").order("updated_at", { ascending: false });
  if (error) return say("Не удалось загрузить Notes: " + error.message);
  const list = $("notesList");
  list.replaceChildren();
  for (const note of data || []) {
    const card = document.createElement("article");
    card.className = "panel pad";
    const body = document.createElement("p"); body.textContent = note.body;
    const del = document.createElement("button"); del.type = "button"; del.textContent = "Удалить";
    del.addEventListener("click", async () => {
      const result = await supabase.from("notes").delete().eq("id", note.id);
      if (result.error) return say(result.error.message);
      await loadNotes();
    });
    card.append(body, del); list.append(card);
  }
}
$("noteForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const body = $("noteBody").value.trim();
  if (!body || !currentUser) return;
  const { error } = await supabase.from("notes").insert({ owner_id: currentUser.id, body });
  if (error) return say(error.message);
  $("noteBody").value = ""; await loadNotes();
});

async function loadGiftShopOnce() {
  const [{ data: wallet }, { data: gifts }, { data: history }] = await Promise.all([
    supabase.from("wallets").select("balance").eq("user_id", currentUser.id).maybeSingle(),
    supabase.from("gifts").select("id,name,rarity,price,emoji").order("price"),
    supabase.from("token_transactions").select("amount,kind,created_at,details").order("created_at", { ascending: false }).limit(15)
  ]);
  $("walletBalance").textContent = "💰 " + (wallet?.balance ?? 0) + " токенов";
  const catalog = $("giftCatalog"); catalog.replaceChildren();
  for (const gift of gifts || []) {
    const card = document.createElement("article"); card.className = "panel pad gift-card";
    const title = document.createElement("h3"); title.textContent = gift.emoji + " " + gift.name;
    const rarity = document.createElement("p"); rarity.textContent = gift.rarity + " · " + gift.price + " токенов";
    const send = document.createElement("button"); send.type = "button"; send.textContent = "Подарить";
    send.addEventListener("click", async () => {
      const username = $("giftRecipient").value.trim();
      if (!username) return $("giftMessage").textContent = "Введите имя получателя.";
      const normalizedUsername = username.trim().replace(/\s+/g, " ").toLowerCase();
      const { data: target, error: findError } = await supabase.from("profiles").select("id").eq("username_normalized", normalizedUsername).maybeSingle();
      if (findError || !target) return $("giftMessage").textContent = "Пользователь не найден.";
      const { error } = await supabase.rpc("send_gift", { target_user_id: target.id, selected_gift_id: gift.id });
      $("giftMessage").textContent = error ? error.message : "Подарок отправлен!";
      if (!error) await loadGiftShop();
    });
    card.append(title, rarity, send); catalog.append(card);
  }
  const log = $("tokenHistory"); log.replaceChildren();
  for (const item of history || []) {
    const row = document.createElement("p");
    row.textContent = (item.amount > 0 ? "+" : "") + item.amount + " · " + item.kind + " · " + formatTime(item.created_at);
    log.append(row);
  }
}

async function loadGiftShop() {
  if (!currentUser || !$("giftCatalog")) return;
  if (!giftLoadPromise) {
    giftLoadPromise = loadGiftShopOnce().finally(() => { giftLoadPromise = null; });
  }
  return giftLoadPromise;
}
$("claimDailyTokens")?.addEventListener("click", async () => {
  const { data, error } = await supabase.rpc("claim_daily_tokens");
  $("giftMessage").textContent = error ? error.message : "Ежедневные 250 токенов начислены.";
  if (!error) await loadGiftShop();
});
