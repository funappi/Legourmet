// Application installable : service worker, bandeau « hors ligne » et bouton d'installation.
const PWA = (() => {
    let deferredPrompt = null;

    function setOffline(isOffline) {
        document.body.classList.toggle("is-offline", isOffline);
        const bar = document.getElementById("offline-bar");
        if (bar) bar.hidden = !isOffline;
    }

    function init() {
        setOffline(!navigator.onLine);
        window.addEventListener("online", () => setOffline(false));
        window.addEventListener("offline", () => setOffline(true));

        if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
            navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker indisponible :", e));
        }

        const btn = document.getElementById("install-app-btn");
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (btn) btn.hidden = false;
        });
        btn?.addEventListener("click", async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice.catch(() => {});
            deferredPrompt = null;
            btn.hidden = true;
        });
        window.addEventListener("appinstalled", () => { if (btn) btn.hidden = true; });
    }

    document.addEventListener("DOMContentLoaded", init);
    return { isOffline: () => !navigator.onLine };
})();
