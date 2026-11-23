import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(
  "https://tzkxujrjrhyqxgzytaex.supabase.co",
  "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV"
);

const $ = id => document.getElementById(id);

let user = null;
let profile = null;

const roles = {
  owner: "OWNER",
  ceo: "CEO",
  deputy_ceo: "DEPUTY CEO",
  admin: "ADMIN",
  moderator: "MODERATOR",
  member: "MEMBER"
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function message(text) {
  const element = $("globalMessage");
  if (element) element.textContent = text;
}

async function loadAccount() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    user = null;
    profile = null;
    return;
  }

  user = session.user;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return;

  profile = data;

  mountPrivacySettings();
  mountAdminPanel();
  showMySanctions();
}

function mountPrivacySettings() {
  if (!profile || !$("page-settings")) return;

  $("privacySettings")?.remove();

  const panel = document.createElement("div");
  panel.id = "privacySettings";
  panel.className = "panel pad";

  panel.innerHTML = `
    <h2>🔐 Данные и конфиденциальность</h2>

    <p class="muted">
      Управляй тем, какую информацию о твоём профиле видят другие.
    </p>

    <label class="privacy-option">
      <input
        type="checkbox"
        id="profileViewsToggle"
        ${profile.profile_views_enabled !== false ? "checked" : ""}
      >
      Показывать историю просмотров моего профиля
    </label>

    <button id="savePrivacySettings" class="primary">
      Сохранить настройки приватности
    </button>

    <p id="privacyMessage" class="notice"></p>
  `;

  $("page-settings").appendChild(panel);

  $("savePrivacySettings").addEventListener("click", async () => {
    const enabled = $("profileViewsToggle").checked;

    const { error } = await supabase
      .from("profiles")
      .update({ profile_views_enabled: enabled })
      .eq("id", user.id);

    if (error) {
      $("privacyMessage").textContent = error.message;
      return;
    }

    profile.profile_views_enabled = enabled;

    $("privacyMessage").textContent =
      "Настройки приватности сохранены.";
  });
}

function mountAdminPanel() {
  if (!profile || !$("adminContent")) return;

  if (!["owner", "ceo", "deputy_ceo", "admin", "moderator"].includes(profile.role)) {
    return;
  }

  $("sanctionsPanel")?.remove();

  const panel = document.createElement("div");
  panel.id = "sanctionsPanel";
  panel.className = "panel pad";

  panel.innerHTML = `
    <hr>

    <h2>🛡️ Центр модерации</h2>
    <p class="muted">
      Управление временными и постоянными санкциями.
    </p>

    <label>Пользователь</label>
    <select id="sanctionTarget">
      <option value="">Загрузка пользователей...</option>
    </select>

    <label>Причина</label>
    <textarea
      id="sanctionReason"
      maxlength="1000"
      rows="3"
      placeholder="Укажи причину санкции..."
    ></textarea>

    <label>Продолжительность</label>
    <select id="sanctionDuration">
      <option value="1">1 час</option>
      <option value="24">24 часа</option>
      <option value="72">3 дня</option>
      <option value="168">7 дней</option>
      <option value="720">30 дней</option>
      <option value="2160">90 дней</option>
      <option value="8760">365 дней</option>
      <option value="permanent">Навсегда</option>
    </select>

    <button id="issueSanction" class="primary">
      Выдать санкцию
    </button>

    <p id="sanctionMessage" class="notice"></p>

    <hr>

    <h3>История санкций</h3>
    <div id="sanctionsHistory">
      <p class="muted">Загрузка...</p>
    </div>
  `;

  $("adminContent").appendChild(panel);

  loadSanctionTargets();
  loadSanctionsHistory();

  $("issueSanction").addEventListener("click", issueSanction);
}

async function loadSanctionTargets() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,role")
    .order("username");

  if (error) {
    $("sanctionTarget").innerHTML =
      `<option value="">Ошибка загрузки</option>`;
    return;
  }

  $("sanctionTarget").innerHTML = `
    <option value="">Выбери пользователя</option>
    ${(data || [])
      .filter(person => person.id !== user.id)
      .map(person => `
        <option value="${escapeHTML(person.id)}">
          ${escapeHTML(person.username)}
          (${escapeHTML(roles[person.role] || "MEMBER")})
        </option>
      `).join("")}
  `;
}

async function issueSanction() {
  const target = $("sanctionTarget").value;
  const reason = $("sanctionReason").value.trim();
  const duration = $("sanctionDuration").value;

  if (!target) {
    $("sanctionMessage").textContent =
      "Выбери пользователя.";
    return;
  }

  if (reason.length < 3) {
    $("sanctionMessage").textContent =
      "Укажи причину минимум из 3 символов.";
    return;
  }

  const hours = duration === "permanent"
    ? null
    : Number(duration);

  const { error } = await supabase.rpc("admin_issue_sanction", {
    target_user_id: target,
    sanction_reason: reason,
    duration_hours: hours
  });

  if (error) {
    $("sanctionMessage").textContent = error.message;
    return;
  }

  $("sanctionMessage").textContent =
    "Санкция успешно выдана.";

  $("sanctionReason").value = "";

  await loadSanctionsHistory();
}

async function loadSanctionsHistory() {
  const container = $("sanctionsHistory");
  if (!container) return;

  const { data, error } = await supabase
    .from("account_sanctions")
    .select(`
      id,
      user_id,
      moderator_id,
      reason,
      sanction_type,
      created_at,
      expires_at,
      revoked_at
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    container.textContent = error.message;
    return;
  }

  if (!data?.length) {
    container.innerHTML =
      `<p class="muted">Санкций пока нет.</p>`;
    return;
  }

  const ids = [...new Set(data.flatMap(item => [
    item.user_id,
    item.moderator_id
  ]))];

  const { data: people } = await supabase
    .from("profiles")
    .select("id,username")
    .in("id", ids);

  const names = Object.fromEntries(
    (people || []).map(person => [
      person.id,
      person.username
    ])
  );

  container.innerHTML = data.map(item => {
    const active = !item.revoked_at &&
      (
        item.sanction_type === "permanent" ||
        new Date(item.expires_at) > new Date()
      );

    return `
      <div class="sanction-item">
        <strong>
          ${escapeHTML(names[item.user_id] || "Пользователь")}
        </strong>

        <p>${escapeHTML(item.reason)}</p>

        <small class="muted">
          Выдал: ${escapeHTML(names[item.moderator_id] || "Неизвестно")}
        </small>

        <p>
          ${item.sanction_type === "permanent"
            ? "Постоянная санкция"
            : "До " + new Date(item.expires_at).toLocaleString("ru-RU")}
        </p>

        <span class="pill">
          ${active ? "Активна" : "Завершена"}
        </span>

        ${active ? `
          <button
            class="secondary"
            data-revoke-sanction="${escapeHTML(item.id)}"
          >
            Снять санкцию
          </button>
        ` : ""}
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-revoke-sanction]")
    .forEach(button => {
      button.addEventListener("click", async () => {
        const reason = prompt("Причина снятия санкции:");

        if (!reason || reason.trim().length < 3) return;

        const { error } = await supabase.rpc(
          "admin_revoke_sanction",
          {
            target_sanction_id: button.dataset.revokeSanction,
            reason: reason.trim()
          }
        );

        if (error) {
          message(error.message);
          return;
        }

        message("Санкция снята.");
        await loadSanctionsHistory();
      });
    });
}

async function showMySanctions() {
  if (!user) return;

  const { data, error } = await supabase
    .from("account_sanctions")
    .select("reason,sanction_type,expires_at,created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return;

  const active = data.find(item =>
    item.sanction_type === "permanent" ||
    new Date(item.expires_at) > new Date()
  );

  if (!active) return;

  $("sanctionNotice")?.remove();

  const notice = document.createElement("div");
  notice.id = "sanctionNotice";
  notice.className = "panel pad sanction-notice";

  notice.innerHTML = `
    <h3>⚠️ На аккаунте действует санкция</h3>

    <p>
      <strong>Причина:</strong>
      ${escapeHTML(active.reason)}
    </p>

    <p>
      <strong>Тип:</strong>
      ${active.sanction_type === "permanent"
        ? "Постоянная"
        : "Временная"}
    </p>

    ${active.expires_at ? `
      <p>
        <strong>Истекает:</strong>
        ${new Date(active.expires_at).toLocaleString("ru-RU")}
      </p>
    ` : ""}

    <p class="muted">
      Создание публикаций, отправка сообщений и новые заявки
      в друзья ограничены.
    </p>
  `;

  $("appView")?.prepend(notice);
}

supabase.auth.onAuthStateChange(() => {
  setTimeout(loadAccount, 0);
});

loadAccount();

const observer = new MutationObserver(() => {
  if (!profile) return;

  if ($("page-settings") && !$("privacySettings")) {
    mountPrivacySettings();
  }

  if ($("adminContent") && !$("sanctionsPanel")) {
    mountAdminPanel();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
