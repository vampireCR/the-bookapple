let deferredInstallPrompt = null;
const installButton = document.getElementById('installAppButton');
const installMessage = document.getElementById('installAppMessage');

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.navigator.standalone === true;

const isAndroid = () => /Android/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

function showMessage(message) {
  if (installMessage) installMessage.textContent = message;
}

function setInstalledState() {
  if (!installButton) return;
  installButton.textContent = '🍎 Приложение установлено';
  installButton.disabled = true;
  showMessage('TheAppleBook уже установлен на этом устройстве. Открой его с главного экрана.');
}

if (isStandalone()) setInstalledState();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      console.info('TheAppleBook: PWA service worker registered');
    } catch (error) {
      console.error('TheAppleBook service worker:', error);
      showMessage('Не удалось подготовить приложение. Проверь подключение и обнови страницу.');
    }
  });
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installButton && !isStandalone()) {
    installButton.disabled = false;
    installButton.textContent = '📲 Установить TheAppleBook';
  }
  showMessage('Приложение готово к установке. Нажми кнопку выше.');
});

installButton?.addEventListener('click', async () => {
  if (isStandalone()) return setInstalledState();

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice.outcome === 'accepted') {
      showMessage('Установка подтверждена. После установки найди TheAppleBook на главном экране.');
    } else {
      showMessage('Установка отменена. Ты можешь попробовать ещё раз позже.');
    }
    return;
  }

  if (isAndroid()) {
    showMessage('Чтобы установить TheAppleBook: открой меню браузера ⋮ вверху справа и выбери «Установить приложение» или «Добавить на главный экран». Если такого пункта нет, открой сайт в Google Chrome и проверь, что адрес начинается с https://.');
    return;
  }

  if (isIOS()) {
    showMessage('На iPhone: открой сайт в Safari, нажми «Поделиться» и выбери «На экран Домой», затем нажми «Добавить».');
    return;
  }

  showMessage('Открой меню браузера и выбери «Установить TheAppleBook» или «Создать ярлык». Для установки сайт должен быть открыт по HTTPS.');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setInstalledState();
});
