import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://tzkxujrjrhyqxgzytaex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const list = document.getElementById("achievementsList");
const count = document.getElementById("achievementCount");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function loadAchievements() {
  if (!list || !count) return;

  list.innerHTML = `<p class="muted">Загружаем достижения...</p>`;

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    list.innerHTML = `<p class="muted">Войди в аккаунт, чтобы увидеть достижения.</p>`;
    return;
  }

  const { error: syncError } = await supabase.rpc("sync_my_achievements");

  if (syncError) {
    list.innerHTML = `<p class="muted">Ошибка проверки достижений: ${escapeHTML(syncError.message)}</p>`;
    return;
  }

  const { data, error } = await supabase
    .from("user_achievements")
    .select(`
      id,
      achievement_code,
      earned_at,
      is_featured,
      achievement_definitions (
        title,
        description,
        icon
      )
    `)
    .eq("user_id", user.id)
    .order("earned_at", { ascending: false });

  if (error) {
    list.innerHTML = `<p class="muted">Ошибка загрузки: ${escapeHTML(error.message)}</p>`;
    return;
  }

  const achievements = data || [];

  count.textContent = `${achievements.length} получено`;

  if (!achievements.length) {
    list.innerHTML = `
      <div class="achievement-empty">
        <span>🎯</span>
        <h3>Пока нет достижений</h3>
        <p class="muted">Продолжай пользоваться TheAppleBook!</p>
      </div>
    `;
    return;
  }

  list.innerHTML = achievements.map(item => {
    const achievement = item.achievement_definitions;

    if (!achievement) return "";

    return `
      <article class="achievement-card">
        <div class="achievement-icon">${escapeHTML(achievement.icon)}</div>

        <div class="achievement-info">
          <h3>${escapeHTML(achievement.title)}</h3>
          <p>${escapeHTML(achievement.description)}</p>
          <small>
            Получено: ${new Date(item.earned_at).toLocaleDateString("ru-RU")}
          </small>
        </div>

        <button
          class="achievement-feature ${item.is_featured ? "selected" : ""}"
          data-achievement-id="${item.id}"
          aria-label="Переключить отображение достижения"
          title="Показать в профиле"
        >${item.is_featured ? "★" : "☆"}</button>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-achievement-id]").forEach(button => {
    button.addEventListener("click", async () => {
      const item = achievements.find(
        achievement => achievement.id === button.dataset.achievementId
      );

      if (!item) return;

      button.disabled = true;

      const { error } = await supabase
        .from("user_achievements")
        .update({ is_featured: !item.is_featured })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (error) {
        alert("Не удалось изменить отображение: " + error.message);
        button.disabled = false;
        return;
      }

      await loadAchievements();
    });
  });
}

document.querySelectorAll('.nav-btn[data-page="profile"]').forEach(button => {
  button.addEventListener("click", () => {
    setTimeout(loadAchievements, 100);
  });
});

document.querySelectorAll('[data-go="profile"]').forEach(button => {
  button.addEventListener("click", () => {
    setTimeout(loadAchievements, 100);
  });
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    if (list) list.innerHTML = "";
    if (count) count.textContent = "0 достижений";
  }
});
