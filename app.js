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
  await Promise.all((profiles || []).map(async person => {
    const { data } = await supabase.rpc("visible_presence", { target_user: person.id });
    const target = container?.querySelector(`[data-presence-for="${CSS.escape(person.id)}"]`);
    if (target) target.textContent = presenceLabel(data);
  }));
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

async function loadFeed() {
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
  searchTimer = setTimeout(searchPeople, 250);
});

async function searchPeople() {
  if (!currentUser || !$("peopleResults")) return;

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

  const { data, error } = await query;

  if (error) return say(error.message);

  const { data: outgoing } = await supabase
    .from("friendships")
    .select("recipient_id,status")
    .eq("requester_id", currentUser.id);

  const { data: incoming } = await supabase
    .from("friendships")
    .select("requester_id,status")
    .eq("recipient_id", currentUser.id);

  const relations = new Map();

  (outgoing || []).forEach(item => {
    relations.set(item.recipient_id, item.status);
  });

  (incoming || []).forEach(item => {
    relations.set(item.requester_id, item.status);
  });    relations.set(item.recipient_id, item.status);
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

  const { data: sent, error: sentError } = await supabase
    .from("friendships")
    .select(`recipient_id,profiles!friendships_recipient_id_fkey(${fields})`)
    .eq("requester_id", currentUser.id)
    .eq("status", "accepted");

  if (sentError) {
    say(sentError.message);
    return [];
  }

  const { data: received, error: receivedError } = await supabase
    .from("friendships")
    .select(`requester_id,profiles!friendships_requester_id_fkey(${fields})`)
    .eq("recipient_id", currentUser.id)
    .eq("status", "accepted");

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
      openChat(button.dataset.openChat, button.dataset.openName);
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
      openChat(button.dataset.chatId, button.dataset.chatName);
    });
  });
}

async function openChat(friendId, friendName) {
  if (!currentUser) return;

  activeChatUser = {
    id: friendId,
    username: friendName
  };

  $("chatHeader").innerHTML = `<p class="muted">Загрузка профиля...</p>`;
  $("chatHistory").innerHTML = `<p class="muted">Загрузка переписки...</p>`;
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

  const { data: chatPresence } = await supabase.rpc(
    "visible_presence",
    { target_user: friend.id }
  );

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

  if (!activeChatUser || activeChatUser.id !== selectedFriendId) return;

  $("chatHistory").innerHTML = (data || []).map(message => {
    const mine = message.sender_id === currentUser.id;

    return `
      <div class="chat-message ${mine ? "mine" : "theirs"}">
        ${esc(message.content)}
        <span class="chat-time">${formatTime(message.created_at)}</span>
      </div>
    `;
  }).join("") || `
    <p class="muted">
      Сообщений пока нет. Напиши первым!
    </p>
  `;

  $("chatHistory").scrollTop = $("chatHistory").scrollHeight;
}

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

        if (activeChatUser && activeChatUser.id === newMessage.sender_id) {
          await loadChatMessages();
        } else {
          say("У тебя новое сообщение! Открой раздел «Сообщения».");
          document.title = "Новое сообщение · TheAppleBook";

          if (
            document.hidden &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Новое сообщение", {
              body: "Открой TheAppleBook, чтобы прочитать его."
            });
          }
        }
      }
    )
    .subscribe(status => {
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
