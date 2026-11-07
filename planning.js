// ==========================================================================
// PLANNING : une recette (version Original) par repas choisi ; les autres versions se demandent ensuite à la carte.
// Tout est gardé dans le localStorage (lg_plan).
// ==========================================================================
const Planning = (() => {
    const KEY = "lg_plan";
    const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    const SLOTS = [{ id: "midi", label: "Midi", icon: "☀️" }, { id: "soir", label: "Soir", icon: "🌙" }];
    const COURSES = ["Entrée", "Plat", "Dessert"];
    const ICON = { "Entrée": "🥗", "Plat": "🍽️", "Dessert": "🍰" };
    const $ = (id) => document.getElementById(id);
    let LG = null;

    const defaultConfig = () => ({
        days: 5, persons: 2, vary: true,
        // cells["0-soir"] = ["Plat"] ; absent / vide = pas de repas
        cells: Object.fromEntries([0, 1, 2, 3, 4].map(d => [`${d}-soir`, ["Plat"]]))
    });

    let plan = { version: 1, config: defaultConfig(), meals: [], rejected: [] };   // meals: [{ key, day, slot, course, pack|null, context }]

    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY) || "null");
            if (raw && raw.version === 1 && raw.config && Array.isArray(raw.meals)) plan = { rejected: [], ...raw };
        } catch (e) {}
        if (!plan.config.persons) plan.config.persons = (typeof Settings !== "undefined" ? Settings.defaultPortions() : 2);
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(plan)); }
        catch (e) {   // stockage plein : on garde le planning sans les variantes déjà générées
            try { localStorage.setItem(KEY, JSON.stringify({ ...plan, meals: plan.meals.map(m => m.pack ? { ...m, pack: { original: m.pack.original } } : m) })); } catch (e2) {}
        }
    }

    const mealKey = (day, slot, course) => `${day}-${slot}-${course}`;
    const slotLabel = (day, slot) => `${DAYS[day]} ${slot === "midi" ? "midi" : "soir"}`;
    const orderCourses = (list) => COURSES.filter(c => list.includes(c));

    // Les repas voulus d'après la configuration
    function wantedMeals() {
        const out = [];
        for (let d = 0; d < plan.config.days; d++) {
            SLOTS.forEach(s => orderCourses(plan.config.cells[`${d}-${s.id}`] || []).forEach(c => out.push({ day: d, slot: s.id, course: c })));
        }
        return out;
    }

    // ---------- écran de réglage ----------
    function renderSetup() {
        const cfg = plan.config;
        $("plan-days-val").textContent = String(cfg.days);
        $("plan-persons-val").textContent = String(cfg.persons);
        $("plan-vary").checked = !!cfg.vary;

        const grid = $("plan-grid");
        grid.innerHTML = "";
        for (let d = 0; d < cfg.days; d++) {
            const row = document.createElement("div");
            row.className = "plan-row";
            const name = document.createElement("div"); name.className = "plan-day"; name.textContent = DAYS[d];
            row.appendChild(name);
            SLOTS.forEach(s => {
                const cellKey = `${d}-${s.id}`;
                const courses = cfg.cells[cellKey] || [];
                const cell = document.createElement("div");
                cell.className = "plan-cell" + (courses.length ? " is-on" : "");
                const toggle = document.createElement("button");
                toggle.type = "button"; toggle.className = "plan-slot-btn";
                toggle.setAttribute("aria-pressed", String(courses.length > 0));
                toggle.setAttribute("aria-label", `${DAYS[d]} ${s.label}`);
                toggle.innerHTML = `<span>${s.icon}</span> ${s.label}`;
                toggle.addEventListener("click", () => {
                    cfg.cells[cellKey] = courses.length ? [] : ["Plat"];
                    renderSetup();
                });
                cell.appendChild(toggle);
                if (courses.length) {
                    const chips = document.createElement("div"); chips.className = "plan-courses";
                    COURSES.forEach(c => {
                        const b = document.createElement("button");
                        b.type = "button"; b.className = "plan-course" + (courses.includes(c) ? " is-on" : "");
                        b.textContent = ICON[c]; b.title = c; b.setAttribute("aria-label", `${c} ${DAYS[d]} ${s.label}`);
                        b.setAttribute("aria-pressed", String(courses.includes(c)));
                        b.addEventListener("click", () => {
                            const next = courses.includes(c) ? courses.filter(x => x !== c) : [...courses, c];
                            cfg.cells[cellKey] = next;   // vide = repas retiré
                            renderSetup();
                        });
                        chips.appendChild(b);
                    });
                    cell.appendChild(chips);
                }
                row.appendChild(cell);
            });
            grid.appendChild(row);
        }
        const n = wantedMeals().length;
        const btn = $("plan-generate-btn");
        btn.disabled = n === 0;
        btn.textContent = n === 0 ? "Choisis au moins un repas" : `Générer le planning (${n} recette${n > 1 ? "s" : ""})`;
        $("plan-estimate").textContent = n > 10 ? `Environ ${Math.ceil(n * 7 / 60)} min d'attente : tu peux annuler à tout moment, ce qui est prêt est gardé.` : "";
    }

    // ---------- liste à droite (panneau « Mon planning ») ----------
    let currentKey = null;
    const checked = new Set();   // clés cochées « je n'aime pas »

    const titleOf = (m) => m.pack?.original?.title || "";

    function renderSide() {
        const side = $("planSide");
        if (!side) return;
        const has = plan.meals.length > 0;
        side.classList.toggle("hidden-mode", !has || !sideVisible);
        document.body.classList.toggle("has-plan-side", has && sideVisible);
        if (!has || !sideVisible) return;
        const done = plan.meals.filter(m => m.pack).length;
        $("plan-side-summary").textContent = `${done} plat${done > 1 ? "s" : ""} prêt${done > 1 ? "s" : ""} sur ${plan.meals.length} · ${plan.config.persons} pers. Clique un repas pour le générer.`;

        const list = $("plan-side-list");
        list.innerHTML = "";
        const days = [...new Set(plan.meals.map(m => m.day))].sort((a, b) => a - b);
        days.forEach(d => {
            const group = document.createElement("div"); group.className = "plan-side-day";
            const h = document.createElement("h4"); h.textContent = DAYS[d]; group.appendChild(h);
            plan.meals.filter(m => m.day === d).sort((a, b) => SLOTS.findIndex(s => s.id === a.slot) - SLOTS.findIndex(s => s.id === b.slot) || COURSES.indexOf(a.course) - COURSES.indexOf(b.course)).forEach(m => {
                const row = document.createElement("div");
                row.className = "plan-side-meal" + (m.key === currentKey ? " is-current" : "") + (m.pack ? "" : " is-todo");
                const box = document.createElement("input");
                box.type = "checkbox"; box.className = "plan-dislike";
                box.disabled = !m.pack; box.checked = checked.has(m.key);
                box.title = "Je n'aime pas ce plat : à remplacer";
                box.setAttribute("aria-label", `Je n'aime pas : ${titleOf(m) || m.course}`);
                box.addEventListener("change", () => { if (box.checked) checked.add(m.key); else checked.delete(m.key); updateReplaceBtn(); });
                const btn = document.createElement("button");
                btn.type = "button"; btn.className = "plan-side-open";
                const meta = document.createElement("span"); meta.className = "plan-side-meta";
                meta.textContent = `${SLOTS.find(s => s.id === m.slot).icon} ${ICON[m.course]}`;
                const t = document.createElement("span"); t.className = "plan-side-title";
                t.textContent = titleOf(m) || "À générer";
                btn.append(meta, t);
                btn.addEventListener("click", () => openMeal(m));
                row.append(box, btn);
                group.appendChild(row);
            });
            list.appendChild(group);
        });
        updateReplaceBtn();
        $("plan-shopping-btn").disabled = done === 0;
    }

    function updateReplaceBtn() {
        const n = checked.size;
        const btn = $("plan-replace-btn");
        if (!btn) return;
        btn.disabled = n === 0;
        btn.textContent = n ? `Remplacer la sélection (${n})` : "Coche les plats à remplacer";
    }

    let sideVisible = false;
    function showSide(on) { sideVisible = on; renderSide(); }

    // ---------- génération : UN plat à la fois ----------
    const allTitles = () => [...plan.meals.filter(m => m.pack).map(titleOf), ...(plan.rejected || [])];

    async function generateMeal(meal) {
        const result = await LG.generateMeal({
            course: meal.course,
            slot: slotLabel(meal.day, meal.slot),
            avoid: allTitles(),
            vary: !!plan.config.vary,
            title: `Le chef prépare : ${slotLabel(meal.day, meal.slot)}…`
        });
        LG.Loader.hide();
        if (!result) return false;
        meal.pack = result.pack; meal.context = result.context;
        save();
        return true;
    }

    // Ouvre un repas ; s'il n'est pas encore généré, on le génère d'abord (1 appel)
    async function openMeal(meal) {
        if (LG.busy()) return;
        if (!meal.pack) {
            LG.setBusy(true);
            try { if (!(await generateMeal(meal))) { renderSide(); return; } } finally { LG.setBusy(false); }
        }
        currentKey = meal.key;
        const historyId = LG.RecipeHistory.add({ pack: meal.pack, context: meal.context || null });
        LG.openRecipePack({ pack: meal.pack, context: meal.context || null, historyId, fromPlan: true });
        LG.setPortions(plan.config.persons);
        sideVisible = true;
        renderSide();
    }

    function startPlan() {
        const wanted = wantedMeals();
        const previous = new Map(plan.meals.map(m => [mealKey(m.day, m.slot, m.course), m]));
        plan.meals = wanted.map(w => ({ key: mealKey(w.day, w.slot, w.course), ...(previous.get(mealKey(w.day, w.slot, w.course)) || { ...w, pack: null }) }));
        checked.clear();
        save();
        close();
        const first = plan.meals.find(m => !m.pack) || plan.meals[0];
        openMeal(first);
    }

    // Les plats cochés sont vidés (leurs titres ne seront plus reproposés) ; le premier est régénéré tout de suite
    function replaceChecked() {
        const targets = plan.meals.filter(m => checked.has(m.key));
        if (!targets.length) return;
        targets.forEach(m => { if (m.pack) plan.rejected.push(titleOf(m)); m.pack = null; m.context = null; });
        plan.rejected = [...new Set(plan.rejected)].slice(-40);
        checked.clear();
        save();
        renderSide();
        openMeal(targets[0]);
    }

    function shoppingRecipes() {
        return plan.meals.filter(m => m.pack).map(m => ({ title: titleOf(m), recipe: m.pack.original, persons: plan.config.persons }));
    }

    // ---------- fenêtre de réglage ----------
    function open() {
        load();
        renderSetup();
        const has = plan.meals.length > 0;
        $("plan-resume").classList.toggle("hidden-mode", !has);
        $("planning-page").classList.remove("hidden-mode");
        document.body.classList.add("no-scroll");
        $("plan-close-btn")?.focus();
    }
    function close() {
        $("planning-page")?.classList.add("hidden-mode");
        document.body.classList.remove("no-scroll");
    }

    function init(bridge) {
        LG = bridge;
        load();
        $("open-planning-btn")?.addEventListener("click", open);
        $("plan-close-btn")?.addEventListener("click", close);
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !$("planning-page")?.classList.contains("hidden-mode") && !LG.Loader.isVisible()
                && $("shopping-modal-overlay")?.classList.contains("hidden-mode")) close();
        });
        const bump = (key, delta, min, max) => { plan.config[key] = Math.max(min, Math.min(max, plan.config[key] + delta)); renderSetup(); };
        $("plan-days-minus")?.addEventListener("click", () => bump("days", -1, 1, 7));
        $("plan-days-plus")?.addEventListener("click", () => {
            const before = plan.config.days;
            bump("days", 1, 1, 7);
            if (plan.config.days > before && !SLOTS.some(s => (plan.config.cells[`${before}-${s.id}`] || []).length)) { plan.config.cells[`${before}-soir`] = ["Plat"]; renderSetup(); }
        });
        $("plan-persons-minus")?.addEventListener("click", () => bump("persons", -1, 1, 12));
        $("plan-persons-plus")?.addEventListener("click", () => bump("persons", 1, 1, 12));
        $("plan-vary")?.addEventListener("change", (e) => { plan.config.vary = e.target.checked; });
        $("plan-generate-btn")?.addEventListener("click", () => { if (!LG.busy()) startPlan(); });
        $("plan-resume-btn")?.addEventListener("click", () => {
            close();
            const target = plan.meals.find(m => m.key === currentKey && m.pack) || plan.meals.find(m => m.pack) || plan.meals[0];
            openMeal(target);
        });
        $("plan-edit-btn")?.addEventListener("click", open);
        $("plan-clear-btn")?.addEventListener("click", () => {
            if (!confirm("Effacer ce planning et recommencer ?")) return;
            plan.meals = []; plan.rejected = []; checked.clear(); currentKey = null; save(); showSide(false);
            $("plan-resume").classList.add("hidden-mode");
        });
        $("plan-replace-btn")?.addEventListener("click", replaceChecked);
        $("plan-shopping-btn")?.addEventListener("click", () => {
            const recipes = shoppingRecipes();
            const total = plan.meals.length;
            Shopping.open({ title: "Courses de la semaine", subtitle: `${recipes.length} plat${recipes.length > 1 ? "s" : ""} détaillé${recipes.length > 1 ? "s" : ""} sur ${total} · ${plan.config.persons} personne${plan.config.persons > 1 ? "s" : ""}`, recipes });
        });
        $("plan-side-toggle")?.addEventListener("click", (e) => {
            const list = $("planSide");
            const collapsed = list.classList.toggle("is-collapsed");
            e.currentTarget.setAttribute("aria-expanded", String(!collapsed));
            e.currentTarget.textContent = collapsed ? "▸" : "▾";
        });
        window.addEventListener("lg:pack-changed", () => { if (plan.meals.some(m => m.pack === LG.activePack())) save(); });
    }

    return { init, open, close, hideSide: () => showSide(false) };
})();
