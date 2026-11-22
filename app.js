import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://tzkxujrjrhyqxgzytaex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;

let activeChatUser = null;
let messagesChannel = null;
let searchTimer = null;
let bootRunning = false;
let sendingMessage = false;

// ==============================
// ОБЩИЕ ФУНКЦИИ
// ==============================

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

function formatTime(date) {
  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function removeMessagesChannel() {
  if (messagesChannel) {
    await supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }
}

// ==============================
// АВТОРИЗАЦИЯ
// ==============================

function switchAuth(tab) {
  $("loginForm").classList.toggle("hidden", tab !== "login");
  $("signupForm").classList.toggle("hidden", tab !== "signup");

  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  say("", "authMessage");
}

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => switchAuth(button.dataset.tab));
});

$("loginForm").addEventListener("submit", async event => {
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

$("signupForm").addEventListener("submit", async event => {
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
    say(error.message, "authMessage");
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

$("logoutBtn").addEventListener("click", async () => {
  await removeMessagesChannel();

  await supabase.auth.signOut();

  currentUser = null;
  currentProfile = null;
  activeChatUser = null;

  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
  $("topUser").textContent = "";
});

// ==============================
// ПЕРЕКЛЮЧЕНИЕ СТРАНИЦ
// ==============================

function showPage(name) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.add("hidden");
  });

  $("page-" + name)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === name);
  });

  if (name === "feed") loadFeed();
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

// ==============================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ==============================

async function boot() {
  if (bootRunning) return;
  bootRunning = true;

  try {
    const { data: { session }, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session) {
      currentUser = null;
      currentProfile = null;
      activeChatUser = null;

      await removeMessagesChannel();

      $("authView").classList.remove("hidden");
      $("appView").classList.add("hidden");

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

    $("authView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    $("topUser").textContent =
      profile.username + " · " + roleLabel(profile.role);

    $("myName").textContent = profile.username;
    $("myAvatar").textContent =
      profile.username.slice(0, 1).toUpperCase();

    $("myRole").innerHTML =
      `<span class="pill">${esc(roleLabel(profile.role))}</span>`;

    $("myStatus").textContent =
      profile.status || "Статус не указан";

    $("adminNav").classList.toggle(
      "hidden",
      !["owner", "ceo", "deputy_ceo", "admin"].includes(profile.role)
    );

    document.body.classList.toggle(
      "dark",
      localStorage.getItem("apple-theme") === "dark"
    );

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

    $("appView").classList.add("hidden");
    $("authView").classList.remove("hidden");
    $("topUser").textContent = "";
  }

  if (event === "SIGNED_IN" && session) {
    setTimeout(() => boot(), 0);
  }
});

// ==============================
// ЛЕНТА
// ==============================

$("postForm").addEventListener("submit", async event => {
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
  if (!currentUser) return;

  const { data, error } = await supabase
    .from("posts")
    .select("id,content,created_at,profiles(username,role)")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) return say(error.message);

  $("feedList").innerHTML = (data || []).map(post => `
    <article class="post">
      <div class="post-head">
        ${esc(post.profiles?.username || "User")}
        <span class="pill">${esc(roleLabel(post.profiles?.role))}</span>
        <span class="post-date">${formatTime(post.created_at)}</span>
      </div>
      <div class="post-body">${esc(post.content)}</div>
    </article>
  `).join("") || `
    <div class="panel pad muted">
      Публикаций пока нет. Будь первым!
    </div>
  `;
}

// ==============================
// ПОИСК ПОЛЬЗОВАТЕЛЕЙ
// ==============================

$("peopleSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchPeople, 250);
});

async function searchPeople() {
  if (!currentUser) return;

  const term = $("peopleSearch").value.trim();

  let query = supabase
    .from("profiles")
    .select("id,username,status,role")
    .neq("id", currentUser.id)
    .order("username")
    .limit(30);

  if (term) {
    query = query.ilike("username", `%${term}%`);
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
        <button class="primary" data-add="${person.id}">
          Добавить в друзья
        </button>
      `;
    }

    return `
      <div class="result-row">
        <div>
          <strong>${esc(person.username)}</strong>
          <span class="pill">${esc(roleLabel(person.role))}</span>
          <br>
          <small class="muted">
            ${esc(person.status || "Статус не указан")}
          </small>
        </div>
        <div>${action}</div>
      </div>
    `;
  }).join("") || `<p class="muted">Пользователи не найдены.</p>`;

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

// ==============================
// ДРУЗЬЯ
// ==============================

async function getAcceptedFriends() {
  if (!currentUser) return [];

  const { data: sent, error: sentError } = await supabase
    .from("friendships")
    .select("recipient_id,profiles!friendships_recipient_id_fkey(id,username,status)")
    .eq("requester_id", currentUser.id)
    .eq("status", "accepted");

  if (sentError) {
    say(sentError.message);
    return [];
  }

  const { data: received, error: receivedError } = await supabase
    .from("friendships")
    .select("requester_id,profiles!friendships_requester_id_fkey(id,username,status)")
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
    .select("id,requester_id,profiles!friendships_requester_id_fkey(username)")
    .eq("recipient_id", currentUser.id)
    .eq("status", "pending");

  if (error) say(error.message);

  $("incomingRequests").innerHTML = (incoming || []).map(request => `
    <div class="result-row">
      <strong>${esc(request.profiles?.username || "Пользователь")}</strong>
      <span>
        <button class="primary" data-accept="${request.id}">
          Принять
        </button>
        <button class="secondary" data-reject="${request.id}">
          Отклонить
        </button>
      </span>
    </div>
  `).join("") || `<p class="muted">Новых заявок нет.</p>`;

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
      <div>
        <strong>${esc(person.username)}</strong>
        <br>
        <small class="muted">
          ${esc(person.status || "Статус не указан")}
        </small>
      </div>
      <button class="primary"
        data-open-chat="${person.id}"
        data-open-name="${esc(person.username)}">
        Написать
      </button>
    </div>
  `).join("") || `<p class="muted">Пока нет друзей.</p>`;

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

  say(status === "accepted" ? "Пользователь добавлен в друзья." : "Заявка отклонена.");

  await loadFriends();
}

// ==============================
// ЛИЧНЫЕ СООБЩЕНИЯ
// ==============================

async function loadMessageContacts() {
  if (!currentUser) return;

  const friends = await getAcceptedFriends();

  $("messageContacts").innerHTML = friends.map(person => `
    <button
      class="chat-contact ${activeChatUser?.id === person.id ? "active" : ""}"
      data-chat-id="${person.id}"
      data-chat-name="${esc(person.username)}"
    >
      <span class="chat-contact-avatar">
        ${esc(person.username.slice(0, 1).toUpperCase())}
      </span>
      <span>${esc(person.username)}</span>
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

// Открытие чата.
async function openChat(friendId, friendName) {
  if (!currentUser) return;

  activeChatUser = {
    id: friendId,
    username: friendName
  };

  $("chatHeader").textContent = friendName;

  $("chatHistory").innerHTML = `
    <p class="muted">Загрузка переписки...</p>
  `;

  $("messageInput").disabled = false;
  $("messageSend").disabled = false;

  await loadMessageContacts();
  await loadChatMessages();

  $("messageInput").focus();
}

// Загрузка истории сообщений.
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

  $("chatHistory").innerHTML = (data || []).map(message => {
    const mine = message.sender_id === currentUser.id;

    return `
      <div class="chat-message ${mine ? "mine" : "theirs"}">
        ${esc(message.content)}
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

// Отправка сообщения.
$("messageForm").addEventListener("submit", async event => {
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

// ==============================
// REALTIME — ЖИВЫЕ СООБЩЕНИЯ
// ==============================

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

// ==============================
// ПРОФИЛЬ
// ==============================

function renderProfile() {
  if (!currentProfile) return;

  const profile = currentProfile;

  $("profileDetails").innerHTML = `
    <h3>
      ${esc(profile.username)}
      <span class="pill">${esc(roleLabel(profile.role))}</span>
    </h3>

    <p>
      <strong>Статус:</strong>
      ${esc(profile.status || "Не указано")}
    </p>

    <p>
      <strong>О себе:</strong>
      ${esc(profile.bio || "Пока ничего не написано.")}
    </p>

    <p class="muted">
      В TheAppleBook с ${new Date(profile.created_at).toLocaleDateString("ru-RU")}
    </p>
  `;
}

// ==============================
// НАСТРОЙКИ
// ==============================

function fillSettings() {
  if (!currentProfile) return;

  $("editName").value = currentProfile.username || "";
  $("editStatus").value = currentProfile.status || "";
  $("editBio").value = currentProfile.bio || "";

  $("themeSelect").value =
    localStorage.getItem("apple-theme") || "burgundy";
}

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();

  const username = $("editName").value.trim();

  if (username.length < 2) {
    return say("Имя должно содержать минимум 2 символа.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      status: $("editStatus").value || null,
      bio: $("editBio").value.trim()
    })
    .eq("id", currentUser.id);

  if (error) return say(error.message);

  await boot();

  say("Профиль сохранён.");
});

$("saveTheme").addEventListener("click", () => {
  const theme = $("themeSelect").value;

  localStorage.setItem("apple-theme", theme);

  document.body.classList.toggle("dark", theme === "dark");

  say("Тема сохранена.");
});

// ==============================
// АДМИНИСТРИРОВАНИЕ
// ==============================

async function loadAdmin() {
  if (!currentProfile) return;

  if (!["owner", "ceo", "deputy_ceo", "admin"].includes(currentProfile.role)) {
    $("adminContent").textContent = "Недостаточно прав.";
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,role")
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
        <select data-role-select="${person.id}">
          ${options.map(role => `
            <option value="${role}" ${role === person.role ? "selected" : ""}>
              ${roleLabel(role)}
            </option>
          `).join("")}
        </select>

        <button class="secondary" data-role-save="${person.id}">
          Сохранить
        </button>
      `;

    return `
      <div class="result-row">
        <div>
          <strong>${esc(person.username)}</strong>
          <br>
          <small class="muted">${esc(roleLabel(person.role))}</small>
        </div>
        <div>${controls}</div>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-role-save]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.roleSave;

      const role = document.querySelector(
        `[data-role-select="${id}"]`
      ).value;

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

// ==============================
// ЗАПУСК
// ==============================

boot();
