// ==========================================================================
// MODE CUISINE : plein écran, une étape à la fois en gros caractères, écran qui reste allumé,
// durées repérées dans le texte (« 10 minutes », « 1 h 30 ») cliquables pour lancer un minuteur.
// ==========================================================================
const Cooking = (() => {
    const $ = (id) => document.getElementById(id);
    let LG = null;
    let recipe = null, portions = 1, kicker = "", index = 0;
    let wakeLock = null;
    let timers = [];          // { id, label, end, total, done }
    let tick = null, audio = null, timerSeq = 0;

    // ---------- repérage des durées dans une phrase ----------
    // Renvoie [{ start, end, seconds, label }] ; gère « 1 h 30 », « 10 à 12 minutes », « 45 secondes ».
    function findDurations(text) {
        const found = [];
        const num = "(\\d+(?:[.,]\\d+)?)";
        const patterns = [
            { re: new RegExp(`${num}\\s*(?:h|heures?)\\s*(?:et\\s*)?(\\d+)?\\s*(?:min(?:utes?)?|mn)?(?![a-zà-ÿ])`, "gi"), toSec: (m) => parseFloat(m[1].replace(",", ".")) * 3600 + (m[2] ? parseInt(m[2], 10) * 60 : 0) },
            { re: new RegExp(`${num}(?:\\s*(?:à|a|-|–|ou)\\s*${num})?\\s*(?:min(?:utes?)?|mn)(?![a-zà-ÿ])`, "gi"), toSec: (m) => parseFloat((m[2] || m[1]).replace(",", ".")) * 60 },
            { re: new RegExp(`${num}(?:\\s*(?:à|a|-|–|ou)\\s*${num})?\\s*(?:secondes?|sec)(?![a-zà-ÿ])`, "gi"), toSec: (m) => parseFloat((m[2] || m[1]).replace(",", ".")) }
        ];
        patterns.forEach(({ re, toSec }) => {
            let m;
            while ((m = re.exec(text))) {
                const start = m.index, end = start + m[0].length;
                if (found.some(f => start < f.end && end > f.start)) continue;   // chevauchement avec une durée déjà prise
                const seconds = Math.round(toSec(m));
                if (seconds >= 5 && seconds <= 12 * 3600) found.push({ start, end, seconds, label: m[0].trim() });
            }
        });
        return found.sort((a, b) => a.start - b.start);
    }

    // Nom court de l'action autour d'une durée : « Mijotage », « Frigo », « Cuisson »… (le plus précis d'abord)
    const ACTIONS = [
        [/cong[ée]lateur/i, "Congélateur"], [/r[ée]frig[ée]rateur|frigo|au frais|bac à légumes/i, "Frigo"],
        [/mariner|marinade|faire mariner/i, "Marinade"], [/reposer|repos|laisser reposer|reposez/i, "Repos"],
        [/lever|pousse|doubler de volume/i, "Pousse"], [/infus/i, "Infusion"], [/tremper|trempage|faire gonfler|gonfler/i, "Trempage"],
        [/mijot/i, "Mijotage"], [/bouill|ébullition|ebullition|eau frémissante|pocher/i, "Ébullition"],
        [/faire revenir|revenir|saisir|dorer|colorer/i, "Revenir"], [/griller|grill|barbecue/i, "Grillade"],
        [/four|enfourn|cuire|cuisson|rôtir|rotir|gratiner|vapeur/i, "Cuisson"], [/fouett|battre|mélanger|melanger|pétrir|petrir/i, "Mélange"],
        [/refroidir|tiédir|tiedir/i, "Refroidissement"]
    ];
    function actionLabel(text, start, end) {
        const near = text.slice(Math.max(0, start - 80), end + 30);
        const before = text.slice(0, start);
        // on préfère ce qui est le plus proche avant la durée ; sinon on cherche dans la phrase élargie
        let best = null;
        ACTIONS.forEach(([re, name]) => {
            const g = new RegExp(re.source, "gi");
            let m, last = -1;
            while ((m = g.exec(near))) last = m.index;
            if (last >= 0) {
                const dist = Math.abs((start - Math.max(0, start - 80)) - last);
                if (!best || dist < best.dist) best = { name, dist };
            }
        });
        return best ? best.name : (before.trim() ? "Minuteur" : "Minuteur");
    }

    const fmt = (s) => {
        s = Math.max(0, Math.ceil(s));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
        const two = (n) => String(n).padStart(2, "0");
        return h ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
    };

    // ---------- écran qui reste allumé ----------
    async function lockScreen() {
        try {
            if ("wakeLock" in navigator) {
                wakeLock = await navigator.wakeLock.request("screen");
                wakeLock.addEventListener?.("release", () => { $("cook-awake")?.classList.add("hidden-mode"); });
                $("cook-awake")?.classList.remove("hidden-mode");
            }
        } catch (e) { wakeLock = null; }
    }
    function unlockScreen() { try { wakeLock?.release(); } catch (e) {} wakeLock = null; $("cook-awake")?.classList.add("hidden-mode"); }
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && isOpen()) lockScreen(); });

    const isOpen = () => !$("cook-overlay")?.classList.contains("hidden-mode");

    // ---------- minuteurs ----------
    function beep() {
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.35, 0.7].forEach(delay => {
                const o = audio.createOscillator(), g = audio.createGain();
                o.type = "sine"; o.frequency.value = 880;
                g.gain.setValueAtTime(0.0001, audio.currentTime + delay);
                g.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + delay + 0.03);
                g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.3);
                o.connect(g); g.connect(audio.destination);
                o.start(audio.currentTime + delay); o.stop(audio.currentTime + delay + 0.32);
            });
        } catch (e) {}
        try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch (e) {}
    }

    function startTimer(seconds, durationLabel, action) {
        // le son doit être « débloqué » par un geste : on crée le contexte audio au clic
        try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch (e) {}
        const label = `${action} · ${durationLabel}`;
        timers.push({ id: ++timerSeq, step: index, label, end: Date.now() + seconds * 1000, total: seconds, done: false });
        if (!tick) tick = setInterval(update, 500);
        update();
    }

    function update() {
        const now = Date.now();
        timers.forEach(t => {
            if (!t.done && now >= t.end) { t.done = true; beep(); }
        });
        renderTimers();
        if (!timers.length) { clearInterval(tick); tick = null; }
    }

    function renderTimers() {
        const box = $("cook-timers");
        if (!box) return;
        const existing = new Map(Array.from(box.children).map(el => [Number(el.dataset.id), el]));
        timers.forEach(t => {
            let el = existing.get(t.id);
            if (!el) {
                el = document.createElement("div");
                el.dataset.id = String(t.id);
                el.className = "cook-timer";
                const name = document.createElement("span"); name.className = "cook-timer-name"; name.textContent = t.label;
                const time = document.createElement("span"); time.className = "cook-timer-time";
                const stop = document.createElement("button"); stop.type = "button"; stop.className = "cook-timer-stop";
                stop.textContent = "✕"; stop.setAttribute("aria-label", `Arrêter le minuteur : ${t.label}`);
                stop.addEventListener("click", (e) => { e.stopPropagation(); timers = timers.filter(x => x.id !== t.id); renderTimers(); });
                {
                    el.classList.add("is-link"); el.tabIndex = 0; el.setAttribute("role", "button");
                    el.title = `Revenir à l'étape ${t.step + 1}`;
                    const jump = () => { index = t.step; renderStep(); };
                    el.addEventListener("click", jump);
                    el.addEventListener("keydown", (e) => { if (e.key === "Enter") jump(); });
                }
                el.append(name, time, stop);
                box.appendChild(el);
            }
            existing.delete(t.id);
            el.classList.toggle("is-done", t.done);
            el.querySelector(".cook-timer-time").textContent = t.done ? "Terminé !" : fmt((t.end - Date.now()) / 1000);
        });
        existing.forEach(el => el.remove());
    }

    // ---------- affichage d'une étape ----------
    function renderStep() {
        const steps = recipe.steps;
        const text = String(steps[index] || "");
        $("cook-step-count").textContent = `Étape ${index + 1} sur ${steps.length}`;
        $("cook-progress-fill").style.width = `${((index + 1) / steps.length) * 100}%`;
        const target = $("cook-step-text");
        target.textContent = "";
        let last = 0;
        findDurations(text).forEach(d => {
            target.appendChild(document.createTextNode(text.slice(last, d.start)));
            const b = document.createElement("button");
            b.type = "button"; b.className = "cook-timer-link";
            b.textContent = `⏱ ${d.label}`;
            b.title = "Lancer un minuteur";
            const action = actionLabel(text, d.start, d.end);
            b.addEventListener("click", () => startTimer(d.seconds, d.label, action));
            target.appendChild(b);
            last = d.end;
        });
        target.appendChild(document.createTextNode(text.slice(last)));
        $("cook-prev-btn").disabled = index === 0;
        const isLast = index === steps.length - 1;
        $("cook-next-btn").textContent = isLast ? "Terminé ✓" : "Suivant →";
        target.scrollTop = 0;
    }

    function renderIngredients() {
        const ul = $("cook-ing-list");
        ul.innerHTML = "";
        (recipe.ingredients || []).forEach(ing => {
            const qty = parseFloat(ing.qty) * portions;
            const li = document.createElement("li");
            const strong = document.createElement("strong");
            strong.textContent = `${Number.isFinite(qty) ? String(Math.round(qty * 10) / 10).replace(".", ",") : ""} ${ing.unit || ""}`.trim();
            li.append(strong, document.createTextNode(" " + (ing.name || "")));
            li.addEventListener("click", () => li.classList.toggle("is-checked"));
            ul.appendChild(li);
        });
    }

    function go(delta) {
        const n = index + delta;
        if (n < 0) return;
        if (n >= recipe.steps.length) { close(); return; }
        index = n;
        renderStep();
    }

    function open({ recipe: r, portions: p, kicker: k }) {
        if (!r || !Array.isArray(r.steps) || !r.steps.length) return;
        recipe = r; portions = p || 1; kicker = k || ""; index = 0;
        $("cook-title").textContent = r.title || "";
        $("cook-kicker").textContent = kicker;
        renderIngredients();
        $("cook-ing-panel").classList.add("hidden-mode");
        $("cook-ing-btn").setAttribute("aria-expanded", "false");
        renderStep();
        $("cook-overlay").classList.remove("hidden-mode");
        document.body.classList.add("no-scroll");
        lockScreen();
        $("cook-next-btn").focus();
    }

    function close() {
        $("cook-overlay").classList.add("hidden-mode");
        document.body.classList.remove("no-scroll");
        unlockScreen();
        // les minuteurs continuent de tourner en arrière-plan ; on les arrête seulement s'ils sont terminés
        timers = timers.filter(t => !t.done);
        renderTimers();
        if (!timers.length) { clearInterval(tick); tick = null; }
    }

    function init(bridge) {
        LG = bridge;
        $("btn-cook-mode")?.addEventListener("click", () => {
            const cur = LG.current();
            if (cur) open(cur);
        });
        $("cook-close-btn")?.addEventListener("click", close);
        $("cook-prev-btn")?.addEventListener("click", () => go(-1));
        $("cook-next-btn")?.addEventListener("click", () => go(1));
        $("cook-ing-btn")?.addEventListener("click", (e) => {
            const panel = $("cook-ing-panel");
            const show = panel.classList.toggle("hidden-mode") === false;
            e.currentTarget.setAttribute("aria-expanded", String(show));
        });
        document.addEventListener("keydown", (e) => {
            if (!isOpen()) return;
            if (e.key === "ArrowRight" || e.key === " " && document.activeElement?.tagName !== "BUTTON") { e.preventDefault(); go(1); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
            else if (e.key === "Escape") { e.preventDefault(); close(); }
        });
        // balayage tactile : gauche = suivant, droite = précédent
        let x0 = null;
        const stage = document.querySelector(".cook-stage");
        stage?.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
        stage?.addEventListener("touchend", (e) => {
            if (x0 === null) return;
            const dx = e.changedTouches[0].clientX - x0; x0 = null;
            if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }, { passive: true });
    }

    return { init, open, close, findDurations, actionLabel, isOpen };
})();
