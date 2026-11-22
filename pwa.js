let deferredInstallPrompt = null;

const installButton = document.getElementById("installAppButton");
const installMessage = document.getElementById("installAppMessage");

function showInstallMessage(message) {
  if (installMessage) {
    installMessage.textContent = message;
  }
}

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

if (isAppInstalled()) {
  if (installButton) {
    installButton.textContent = "Приложение установлено";
    installButton.disabled = true;
  }

  showInstallMessage("🍎 TheAppleBook уже установлен!");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js", {
        scope: "./"
      });

      console.log("TheAppleBook: Service Worker registered.");
    } catch (error) {
      console.error("Service Worker:", error);
      showInstallMessage("Не удалось включить офлайн-режим.");
    }
  });
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;

  if (installButton) {
    installButton.disabled = false;
    installButton.textContent = "📲 Установить приложение";
  }

  showInstallMessage("TheAppleBook готов к установке!");
});

installButton?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    showInstallMessage(
      "Открой меню браузера и выбери «Установить приложение» или «Добавить на главный экран»."
    );
    return;
  }

  deferredInstallPrompt.prompt();

  const result = await deferredInstallPrompt.userChoice;

  if (result.outcome === "accepted") {
    showInstallMessage("Установка TheAppleBook запущена!");
  } else {
    showInstallMessage("Установка отменена.");
  }

  deferredInstallPrompt = null;
});

window.addEventListener("appinstalled", () => {
  showInstallMessage("🍎 TheAppleBook успешно установлен!");

  if (installButton) {
    installButton.textContent = "Приложение установлено";
    installButton.disabled = true;
  }
});
