import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://tzkxujrjrhyqxgzytaex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV";

const configured =
  !SUPABASE_URL.startsWith("PASTE_") &&
  !SUPABASE_PUBLISHABLE_KEY.startsWith("PASTE_");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let activeChatFriend = null;
let messagesChannel = null;
let searchTimer = null;

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
  })[c]);
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

// ==============================
// АВТОРИЗАЦИЯ
// ==============================

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!supabase) {
    return say("Не настроено подключение Supabase.", "authMessage");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value
  });

  if (error) return say(error.message, "authMessage");

  await boot();
});

$("signupForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!supabase) {
    return say("Не настроено подключение Supabase.", "authMessage");
  }

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

  if (error) return say(error.message, "authMessage");

  if (!data.session) {
    return say(
      "Аккаунт создан. Проверь почту и подтверди email, затем войди.",
      "authMessage"
    );
  }

  await boot();
});

$("logoutBtn").addEventListener("click", async () => {
  if (messagesChannel) {
    await supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }

  await supabase.auth.signOut();

  currentUser = null;
  currentProfile = null;
  activeChatFriend = null;

  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
  $("topUser").textContent = "";
});

// ==============================
// НАВИГАЦИЯ
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
  if (!supabase) {
    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");

    say("Добавь ключи Supabase в app.js.", "authMessage");
    return;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    if (messagesChannel) {
      await supabase.removeChannel(messagesChannel);
      messagesChannel = null;
    }

    currentUser = null;
    currentProfile = null;
    activeChatFriend = null;

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

  subscribeToMessages();
  showPage("feed");
}

supabase?.auth.onAuthStateChange(() => {
  setTimeout(() => boot(), 0);
});

// ==============================
// ПУБЛИКАЦИИ
// ==============================

$("postForm").addEventListener("submit", async e => {
  e.preventDefault();

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
        <span class="pill">
          ${esc(roleLabel(post.profiles?.role))}
        </span>
        <span class="post-date">
          ${new Date(post.created_at).toLocaleString()}
        </span>
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

  const { data: mine } = await supabase
    .from("friendships")
    .select("recipient_id,status")
    .eq("requester_id", currentUser.id);

  const sent = new Map(
    (mine || []).map(item => [item.recipient_id, item.status])
  );

  $("peopleResults").innerHTML = (data || []).map(person => {
    const state = sent.get(person.id);

    const action =
      state === "pending"
        ? "Заявка отправлена"
        : state === "accepted"
          ? "Уже друзья"
          : `<button class="primary" data-add="${person.id}">
               Добавить в друзья
             </button>`;

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
  searchPeople();
}

// ==============================
// ДРУЗЬЯ
// ==============================

async function loadFriends() {
  if (!currentUser) return;

  const { data: incoming, error: incomingError } = await supabase
    .from("friendships")
    .select("id,requester_id,profiles!friendships_requester_id_fkey(username)")
    .eq("recipient_id", currentUser.id)
    .eq("status", "pending");

  if (incomingError) say(incomingError.message);

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

  const { data: sent, error: sentError } = await supabase
    .from("friendships")
    .select("recipient_id,profiles!friendships_recipient_id_fkey(id,username,status)")
    .eq("requester_id", currentUser.id)
    .eq("status", "accepted");

  const { data: received, error: receivedError } = await supabase
    .from("friendships")
    .select("requester_id,profiles!friendships_requester_id_fkey(id,username,status)")
    .eq("recipient_id", currentUser.id)
    .eq("status", "accepted");

  if (sentError || receivedError) {
    return say((sentError || receivedError).message);
  }

  const friends = [
    ...(sent || []).map(item => item.profiles),
    ...(received || []).map(item => item.profiles)
  ].filter(Boolean);

  $("friendsList").innerHTML = friends.map(friend => `
    <div class="result-row">
      <strong>${esc(friend.username)}</strong>
      <span class="muted">
        ${esc(friend.status || "Статус не указан")}
      </span>
    </div>
  `).join("") || `<p class="muted">Пока нет друзей.</p>`;
}

async function answerRequest(id, status) {
  const { error } = await supabase
    .from("friendships")
    .update({ status })
    .eq("id", id);

  if (error) return say(error.message);

  await loadFriends();
}

// ==============================
// ЛИЧНЫЕ СООБЩЕНИЯ
// ==============================

async function loadMessageContacts() {
  if (!currentUser) return;

  const box = $("messageContacts");

  box.innerHTML = `<p class="muted">Загрузка друзей...</p>`;

  const { data: sent, error: sentError } = await supabase
    .from("friendships")
    .select("recipient_id,profiles!friendships_recipient_id_fkey(id,username)")
    .eq("requester_id", currentUser.id)
    .eq("status", "accepted");

  const { data: received, error: receivedError } = await supabase
    .from("friendships")
    .select("requester_id,profiles!friendships_requester_id_fkey(id,username)")
    .eq("recipient_id", currentUser.id)
    .eq("status", "accepted");

  if (sentError || receivedError) {
    box.textContent = "Не удалось загрузить друзей.";
    return say((sentError || receivedError).message);
  }

  const friends = [
    ...(sent || []).map(item => item.profiles),
    ...(received || []).map(item => item.profiles)
  ].filter(Boolean);

  const uniqueFriends = [
    ...new Map(friends.map(friend => [friend.id, friend])).values()
  ];

  if (!uniqueFriends.length) {
    box.innerHTML = `<p class="muted">У тебя пока нет друзей.</p>`;
    return;
  }

  box.innerHTML = uniqueFriends.map(friend => `
    <button
      class="chat-contact ${
        activeChatFriend?.id === friend.id ? "active" : ""
      }"
      data-chat-friend="${friend.id}"
      data-chat-name="${esc(friend.username)}"
    >
      <span class="chat-contact-avatar">
        ${esc(friend.username.slice(0, 1).toUpperCase())}
      </span>

      <strong>${esc(friend.username)}</strong>
    </button>
  `).join("");

  document.querySelectorAll("[data-chat-friend]").forEach(button => {
    button.addEventListener("click", () => {
      openChat(
        button.dataset.chatFriend,
        button.dataset.chatName
      );
    });
  });
}

async function openChat(friendId, friendName) {
  activeChatFriend = {
    id: friendId,
    username: friendName
  };

  $("chatHeader").textContent = "Переписка с " + friendName;

  $("messageInput").disabled = false;
  $("messageSend").disabled = false;

  await loadMessageContacts();
  await loadChatHistory();

  $("messageInput").focus();
}

async function loadChatHistory() {
  if (!activeChatFriend || !currentUser) return;

  const friendId = activeChatFriend.id;

  const { data, error } = await supabase
    .from("messages")
    .select("id,sender_id,receiver_id,content,created_at")
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`
    )
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    $("chatHistory").innerHTML =
      `<p class="muted">Не удалось загрузить сообщения.</p>`;

    return say(error.message);
  }

  $("chatHistory").innerHTML = (data || []).map(message => {
    const mine = message.sender_id === currentUser.id;

    return `
      <div class="chat-message ${mine ? "mine" : "theirs"}">
        ${esc(message.content)}

        <span class="chat-time">
          ${new Date(message.created_at).toLocaleString()}
        </span>
      </div>
    `;
  }).join("") || `
    <p class="muted">Сообщений пока нет. Начни разговор!</p>
  `;

  const history = $("chatHistory");
  history.scrollTop = history.scrollHeight;
}

$("messageForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!currentUser || !activeChatFriend) {
    return say("Сначала выбери друга.");
  }

  const content = $("messageInput").value.trim();

  if (!content) return;

  $("messageSend").disabled = true;

  const { error } = await supabase
    .from("messages")
    .insert({
      sender_id: currentUser.id,
      receiver_id: activeChatFriend.id,
      content
    });

  $("messageSend").disabled = false;

  if (error) {
    return say(error.message);
  }

  $("messageInput").value = "";

  await loadChatHistory();

  $("messageInput").focus();
});

function subscribeToMessages() {
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
        filter: "receiver_id=eq." + currentUser.id
      },
      async payload => {
        if (
          activeChatFriend &&
          payload.new.sender_id === activeChatFriend.id
        ) {
          await loadChatHistory();
        }
      }
    )
    .subscribe(status => {
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
      В TheAppleBook с ${new Date(profile.created_at).toLocaleDateString()}
    </p>
  `;
}

function fillSettings() {
  if (!currentProfile) return;

  $("editName").value = currentProfile.username || "";
  $("editStatus").value = currentProfile.status || "";
  $("editBio").value = currentProfile.bio || "";

  $("themeSelect").value =
    localStorage.getItem("apple-theme") || "burgundy";
}

$("profileForm").addEventListener("submit", async e => {
  e.preventDefault();

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

  say("Тема сохранена в этом браузере.");
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

    const select = person.role === "owner"
      ? `<span class="pill">OWNER — защищён</span>`
      : `
        <select data-role-select="${person.id}">
          ${options.map(role => `
            <option
              value="${role}"
              ${role === person.role ? "selected" : ""}
            >
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

        <div>${select}</div>
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
      loadAdmin();
    });
  });
}

// ==============================
// ЗАПУСК
// ==============================

boot();
