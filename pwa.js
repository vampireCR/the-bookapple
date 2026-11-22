let deferredInstallPrompt = null;

const installButton = document.getElementById("installAppButton");
const installMessage = document.getElementById("installAppMessage");

function showInstallMessage(message) {
  if (installMessage) {
    installMessage.textContent = message;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
      console.log("TheAppleBook: Service Worker registered.");
    } catch (error) {
      console.error("Service Worker:", error);
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

if (installButton) {
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      showInstallMessage(
        "Если установка недоступна, открой меню браузера и выбери «Установить приложение» или «Добавить на главный экран»."
      );
      return;
    }

    deferredInstallPrompt.prompt();

    const result = await deferredInstallPrompt.userChoice;

    if (result.outcome === "accepted") {
      showInstallMessage("Установка TheAppleBook запущена!");
    } else {
      showInstallMessage("Установка пока не выполнена.");
    }

    deferredInstallPrompt = null;
  });
}

window.addEventListener("appinstalled", () => {
  showInstallMessage("🍎 TheAppleBook успешно установлен!");
  if (installButton) {
    installButton.textContent = "Приложение установлено";
    installButton.disabled = true;
  }
});
