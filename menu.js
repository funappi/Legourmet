// ==========================================================================
// MENU COMPLET : Entrée / Plat / Dessert cochés ensemble. Un seul plat est généré à la fois (quota du plan gratuit) :
// le premier s'affiche, puis « Plat suivant » génère le suivant. Les services sont en onglets.
// ==========================================================================
const Menu = (() => {
    const ORDER = ["Entrée", "Plat", "Dessert"];
    const ICON = { "Entrée": "🥗", "Plat": "🍽️", "Dessert": "🍰" };
    const $ = (id) => document.getElementById(id);
    let LG = null;
    let active = null;    // { items:[{course, pack|null, context, historyId}], index, inspiration }

    const titleOf = (it) => it.pack?.original?.title || "";

    async function generateItem(i, { replace = false } = {}) {
        const item = active.items[i];
        const others = active.items.filter((x, j) => j !== i && x.pack);
        const avoid = replace && item.pack ? [titleOf(item)] : [];
        const result = await LG.generateMeal({
            course: item.course,
            slot: "",
            origin: "menu",
            avoid,
            menuTitles: others.map(titleOf),
            vary: false,
            inspiration: active.inspiration,
            title: `Le chef prépare ${item.course === "Entrée" ? "l'entrée" : item.course === "Plat" ? "le plat" : "le dessert"}…`
        });
        LG.Loader.hide();
        if (!result) return false;
        item.pack = result.pack; item.context = result.context;
        item.historyId = LG.RecipeHistory.add({ pack: item.pack, context: item.context });
        return true;
    }

    async function start(courses) {
        if (LG.busy()) return;
        LG.setBusy(true);
        try {
            const sorted = ORDER.filter(c => courses.includes(c));
            const raw = document.getElementById("simple-prompt-input")?.value.trim() || "";
            active = { items: sorted.map(course => ({ course, pack: null, context: null, historyId: null })), index: 0, inspiration: raw };
            if (!(await generateItem(0))) { active = null; renderTabs(); return; }
            LG.closeSidebar();
            show(0);
        } finally { LG.setBusy(false); }
    }

    function show(i) {
        active.index = i;
        const it = active.items[i];
        LG.openRecipePack({ pack: it.pack, context: it.context, historyId: it.historyId, keepMenu: true });
        renderTabs();
    }

    async function goTo(i) {
        if (!active || LG.busy()) return;
        const item = active.items[i];
        if (!item.pack) {
            LG.setBusy(true);
            try { if (!(await generateItem(i))) { renderTabs(); return; } } finally { LG.setBusy(false); }
        }
        show(i);
    }

    async function replaceCurrent() {
        if (!active || LG.busy()) return;
        LG.setBusy(true);
        try { if (!(await generateItem(active.index, { replace: true }))) return; } finally { LG.setBusy(false); }
        show(active.index);
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
            b.className = "course-tab" + (i === active.index ? " is-active" : "") + (it.pack ? "" : " is-todo");
            b.setAttribute("aria-pressed", String(i === active.index));
            const small = document.createElement("span"); small.className = "course-tab-name"; small.textContent = `${ICON[it.course]} ${it.course}`;
            const title = document.createElement("span"); title.className = "course-tab-title"; title.textContent = titleOf(it) || "À générer";
            b.append(small, title);
            b.addEventListener("click", () => goTo(i));
            tabs.appendChild(b);
        });
        const next = active.items[active.index + 1];
        const nextBtn = $("menu-next-btn");
        nextBtn.classList.toggle("hidden-mode", !next);
        if (next) nextBtn.textContent = `${next.pack ? "Voir" : "Générer"} : ${next.course.toLowerCase()} →`;
        $("menu-shopping-btn").textContent = `🛒 Courses (${active.items.filter(x => x.pack).length}/${active.items.length})`;
    }

    function hideTabs() { active = null; renderTabs(); }

    function shoppingRecipes() {
        if (!active) return null;
        return active.items.filter(it => it.pack).map(it => ({ title: titleOf(it), recipe: it.pack.original, persons: LG.portions() }));
    }

    function init(bridge) {
        LG = bridge;
        $("menu-next-btn")?.addEventListener("click", () => goTo(active.index + 1));
        $("menu-replace-btn")?.addEventListener("click", replaceCurrent);
        $("menu-shopping-btn")?.addEventListener("click", () => {
            const recipes = shoppingRecipes();
            if (recipes?.length) Shopping.open({ title: "Courses du menu", subtitle: `${recipes.length} plat${recipes.length > 1 ? "s" : ""} · ${LG.portions()} personne${LG.portions() > 1 ? "s" : ""}`, recipes });
        });
    }

    return { init, start, hideTabs, isActive: () => !!active };
})();
