// ==========================================================================
// MENU COMPLET : quand Entrée / Plat / Dessert sont plusieurs à être cochés, on propose des idées pour
// chaque service, l'utilisateur en choisit UNE par service, puis on écrit les recettes du menu.
// ==========================================================================
const Menu = (() => {
    const ORDER = ["Entrée", "Plat", "Dessert"];
    const ICON = { "Entrée": "🥗", "Plat": "🍽️", "Dessert": "🍰" };
    const $ = (id) => document.getElementById(id);
    let LG = null;
    let state = { courses: [], ideas: {}, picks: {}, seen: {} };
    let active = null;    // { items:[{course, pack, context, historyId}], index }

    const sortCourses = (list) => ORDER.filter(c => list.includes(c));

    async function fetchIdeas(course, progress) {
        const payload = LG.buildPayload(course);
        const seen = state.seen[course] || [];
        if (seen.length) payload.avoid_titles = seen.slice(-12);
        const data = await LG.apiRequest("generate-ideas", payload, {
            step: 0, art: true, keepLoader: true, progress,
            title: `Idées pour ${course === "Entrée" ? "l'entrée" : course === "Plat" ? "le plat" : "le dessert"}…`,
            validate: d => Array.isArray(d?.ideas) && d.ideas.length > 0
        });
        if (!data) return null;
        state.seen[course] = [...seen, ...data.ideas.map(i => i.title)];
        return data.ideas;
    }

    async function start(courses) {
        if (LG.busy()) return;
        LG.setBusy(true);
        try {
            state = { courses: sortCourses(courses), ideas: {}, picks: {}, seen: {} };
            for (let i = 0; i < state.courses.length; i++) {
                const c = state.courses[i];
                const ideas = await fetchIdeas(c, { label: `${ICON[c]} ${c} · ${i + 1} sur ${state.courses.length}`, value: i / state.courses.length });
                if (!ideas) { LG.Loader.hide(); return; }
                state.ideas[c] = ideas;
            }
            LG.Loader.hide();
            LG.closeSidebar();
            renderIdeas();
            $("menu-modal-overlay").classList.remove("hidden-mode");
        } finally {
            LG.setBusy(false);
        }
    }

    function renderIdeas() {
        const box = $("menu-courses");
        box.innerHTML = "";
        state.courses.forEach(course => {
            const sec = document.createElement("section");
            sec.className = "menu-course";
            const head = document.createElement("div");
            head.className = "menu-course-head";
            const h = document.createElement("h4");
            h.textContent = `${ICON[course]} ${course}`;
            const more = document.createElement("button");
            more.type = "button"; more.className = "control-btn"; more.textContent = "↻ Autres idées";
            more.addEventListener("click", () => refreshCourse(course));
            head.append(h, more);
            sec.appendChild(head);
            const list = document.createElement("div");
            list.className = "menu-ideas";
            (state.ideas[course] || []).forEach(idea => {
                const card = document.createElement("button");
                card.type = "button";
                card.className = "idea-card menu-idea" + (state.picks[course] === idea.title ? " is-picked" : "");
                card.setAttribute("aria-pressed", String(state.picks[course] === idea.title));
                const t = document.createElement("h4"); t.textContent = idea.title;
                const p = document.createElement("p"); p.textContent = idea.description || "";
                card.append(t, p);
                card.addEventListener("click", () => { state.picks[course] = idea.title; renderIdeas(); });
                list.appendChild(card);
            });
            sec.appendChild(list);
            box.appendChild(sec);
        });
        const done = state.courses.filter(c => state.picks[c]).length;
        const btn = $("menu-write-btn");
        btn.disabled = done < state.courses.length;
        btn.textContent = done < state.courses.length
            ? `Choisis une idée par service (${done}/${state.courses.length})`
            : `Écrire mon menu (${state.courses.length} recettes)`;
    }

    async function refreshCourse(course) {
        if (LG.busy()) return;
        LG.setBusy(true);
        try {
            const ideas = await fetchIdeas(course, null);
            LG.Loader.hide();
            if (!ideas) return;
            state.ideas[course] = ideas;
            delete state.picks[course];
            renderIdeas();
        } finally { LG.setBusy(false); }
    }

    async function writeMenu() {
        if (LG.busy()) return;
        LG.setBusy(true);
        try {
            const items = [];
            const total = state.courses.length;
            for (let i = 0; i < total; i++) {
                const course = state.courses[i];
                const payload = LG.buildPayload(course);
                payload.selected_idea = state.picks[course];
                const context = { hardware: window.currentHardware, complex: window.currentComplex, risk: window.currentRisk, course };
                const pack = await LG.apiRequest("generate-recipe", payload, {
                    step: 0, art: true, keepLoader: true,
                    progress: { label: `${ICON[course]} ${state.picks[course]} · ${i + 1} sur ${total}`, value: i / total },
                    title: "Le chef écrit votre menu…",
                    validate: d => d && typeof d === "object" && d.original && typeof d.original === "object"
                });
                if (!pack) { LG.Loader.hide(); if (items.length) finish(items); return; }
                const historyId = LG.RecipeHistory.add({ pack, context });
                items.push({ course, pack, context, historyId });
            }
            LG.Loader.hide();
            finish(items);
        } finally { LG.setBusy(false); }
    }

    function finish(items) {
        $("menu-modal-overlay").classList.add("hidden-mode");
        active = { items, index: 0 };
        renderTabs();
        openIndex(0);
    }

    function openIndex(i) {
        active.index = i;
        const it = active.items[i];
        LG.openRecipePack({ pack: it.pack, context: it.context, historyId: it.historyId, keepMenu: true });
        renderTabs();
    }

    function renderTabs() {
        const zone = $("courseTabsZone");
        if (!zone) return;
        if (!active) { zone.classList.add("hidden-mode"); return; }
        zone.classList.remove("hidden-mode");
        const tabs = $("courseTabs");
        tabs.innerHTML = "";
        active.items.forEach((it, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "course-tab" + (i === active.index ? " is-active" : "");
            b.setAttribute("aria-pressed", String(i === active.index));
            const small = document.createElement("span"); small.className = "course-tab-name"; small.textContent = `${ICON[it.course]} ${it.course}`;
            const title = document.createElement("span"); title.className = "course-tab-title"; title.textContent = it.pack.original?.title || "";
            b.append(small, title);
            b.addEventListener("click", () => openIndex(i));
            tabs.appendChild(b);
        });
    }

    function hideTabs() { active = null; renderTabs(); }

    function shoppingRecipes() {
        if (!active) return null;
        return active.items.map(it => ({ title: it.pack.original?.title, recipe: it.pack.original, persons: LG.portions() }));
    }

    function init(bridge) {
        LG = bridge;
        $("menu-write-btn")?.addEventListener("click", writeMenu);
        $("menu-close-btn")?.addEventListener("click", () => { $("menu-modal-overlay").classList.add("hidden-mode"); LG.openSidebar(); });
        $("menu-shopping-btn")?.addEventListener("click", () => {
            const recipes = shoppingRecipes();
            if (recipes) Shopping.open({ title: "Courses du menu", subtitle: `${recipes.length} recettes · ${LG.portions()} personne${LG.portions() > 1 ? "s" : ""}`, recipes });
        });
    }

    return { init, start, hideTabs, isActive: () => !!active, shoppingRecipes };
})();
