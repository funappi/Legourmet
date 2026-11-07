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

    let plan = { version: 1, config: defaultConfig(), meals: [] };   // meals: [{ key, day, slot, course, pack|null }]

    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY) || "null");
            if (raw && raw.version === 1 && raw.config && Array.isArray(raw.meals)) plan = raw;
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

    // ---------- affichage du planning ----------
    function mealsFor(day, slot) { return plan.meals.filter(m => m.day === day && m.slot === slot); }

    function renderResult() {
        const box = $("plan-result");
        box.innerHTML = "";
        const hasMeals = plan.meals.length > 0;
        $("plan-setup").classList.toggle("hidden-mode", hasMeals && !setupOpen);
        $("plan-result-wrap").classList.toggle("hidden-mode", !hasMeals);
        if (!hasMeals) return;
        const done = plan.meals.filter(m => m.pack).length;
        $("plan-summary").textContent = `${done} recette${done > 1 ? "s" : ""} · ${plan.config.persons} personne${plan.config.persons > 1 ? "s" : ""}`;
        $("plan-shopping-btn").disabled = done === 0;

        const days = [...new Set(plan.meals.map(m => m.day))].sort((a, b) => a - b);
        days.forEach(d => {
            const card = document.createElement("article");
            card.className = "plan-day-card";
            const h = document.createElement("h4"); h.textContent = DAYS[d]; card.appendChild(h);
            SLOTS.forEach(s => {
                const meals = mealsFor(d, s.id).sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course));
                if (!meals.length) return;
                const slotBox = document.createElement("div"); slotBox.className = "plan-slot";
                const lab = document.createElement("div"); lab.className = "plan-slot-label"; lab.textContent = `${s.icon} ${s.label}`;
                slotBox.appendChild(lab);
                meals.forEach(m => slotBox.appendChild(mealRow(m)));
                card.appendChild(slotBox);
            });
            box.appendChild(card);
        });
    }

    function mealRow(m) {
        const row = document.createElement("div");
        row.className = "plan-meal" + (m.pack ? "" : " is-empty");
        const open = document.createElement("button");
        open.type = "button"; open.className = "plan-meal-open";
        const course = document.createElement("span"); course.className = "plan-meal-course"; course.textContent = ICON[m.course];
        course.title = m.course;
        const title = document.createElement("span"); title.className = "plan-meal-title";
        title.textContent = m.pack ? m.pack.original.title : `${m.course} : pas encore généré`;
        open.append(course, title);
        if (m.pack) open.addEventListener("click", () => openMeal(m));
        else open.addEventListener("click", () => regenerate(m));
        const redo = document.createElement("button");
        redo.type = "button"; redo.className = "plan-meal-redo";
        redo.textContent = m.pack ? "🔄" : "✨";
        redo.title = m.pack ? "Proposer un autre plat" : "Générer";
        redo.setAttribute("aria-label", `${m.pack ? "Changer" : "Générer"} : ${m.course}, ${slotLabel(m.day, m.slot)}`);
        redo.addEventListener("click", () => regenerate(m));
        row.append(open, redo);
        return row;
    }

    // ---------- génération ----------
    function baseRequest(meal, titlesToAvoid) {
        const payload = LG.buildPayload(meal.course);
        payload.selected_idea = undefined;
        payload.course = meal.course;
        payload.slot = slotLabel(meal.day, meal.slot);
        payload.vary = !!plan.config.vary;
        payload.avoid_titles = titlesToAvoid.slice(-24);
        // Pas d'« inspiration » ni d'ingrédients imposés du panneau : le planning varie les plats. On garde matériel, niveau, régime et exclusions.
        payload.chef_instruction_directive = Settings.directivePrefix() + Settings.softPrefsLine(true);
        return payload;
    }

    const allTitles = () => plan.meals.filter(m => m.pack).map(m => m.pack.original.title);

    async function generateMeal(meal, progress) {
        const data = await LG.apiRequest("generate-meal", baseRequest(meal, allTitles()), {
            step: 0, art: true, keepLoader: true, progress,
            title: "Le chef compose votre semaine…",
            validate: d => LG.isValidVariant(d?.recipe)
        });
        if (!data) return false;
        meal.pack = { original: data.recipe };
        meal.context = { hardware: window.currentHardware, complex: window.currentComplex, risk: window.currentRisk, course: meal.course };
        save();
        return true;
    }

    async function generateAll() {
        if (LG.busy()) return;
        // Nouveau planning : on remplace la liste en gardant les repas déjà générés qui sont toujours voulus
        const wanted = wantedMeals();
        const previous = new Map(plan.meals.map(m => [mealKey(m.day, m.slot, m.course), m]));
        plan.meals = wanted.map(w => previous.get(mealKey(w.day, w.slot, w.course)) || { ...w, pack: null });
        save();
        const todo = plan.meals.filter(m => !m.pack);
        setupOpen = false;
        if (!todo.length) { renderResult(); return; }

        LG.setBusy(true);
        try {
            for (let i = 0; i < todo.length; i++) {
                const m = todo[i];
                const ok = await generateMeal(m, { label: `${ICON[m.course]} ${slotLabel(m.day, m.slot)} · ${i + 1} sur ${todo.length}`, value: i / todo.length });
                renderResult();
                if (!ok) break;
            }
        } finally {
            LG.Loader.hide();
            LG.setBusy(false);
            renderResult();
        }
    }

    async function regenerate(meal) {
        if (LG.busy()) return;
        LG.setBusy(true);
        try {
            const keep = meal.pack;
            const avoid = allTitles();
            const data = await LG.apiRequest("generate-meal", baseRequest(meal, avoid), {
                step: 0, art: false, title: "Le chef cherche une autre idée…",
                validate: d => LG.isValidVariant(d?.recipe)
            });
            if (data) {
                meal.pack = { original: data.recipe };
                meal.context = { hardware: window.currentHardware, complex: window.currentComplex, risk: window.currentRisk, course: meal.course };
                save();
            } else meal.pack = keep;
        } finally {
            LG.setBusy(false);
            renderResult();
        }
    }

    // ---------- ouvrir une recette du planning ----------
    let openedMeal = null;
    function openMeal(meal) {
        const historyId = LG.RecipeHistory.add({ pack: meal.pack, context: meal.context || null });
        openedMeal = meal;
        close();
        LG.openRecipePack({ pack: meal.pack, context: meal.context || null, historyId, fromPlan: true });
        showBack(true);
    }
    function showBack(on) { $("planBackBar")?.classList.toggle("hidden-mode", !on); if (!on) openedMeal = null; }

    function shoppingRecipes() {
        return plan.meals.filter(m => m.pack).map(m => ({ title: m.pack.original.title, recipe: m.pack.original, persons: plan.config.persons }));
    }

    // ---------- fenêtre ----------
    let setupOpen = true;
    function open() {
        load();
        setupOpen = plan.meals.length === 0;
        renderSetup();
        renderResult();
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
            // un jour ajouté démarre avec le soir (pratique) tant que rien n'est choisi pour lui
            if (plan.config.days > before && !SLOTS.some(s => (plan.config.cells[`${before}-${s.id}`] || []).length)) { plan.config.cells[`${before}-soir`] = ["Plat"]; renderSetup(); }
        });
        $("plan-persons-minus")?.addEventListener("click", () => bump("persons", -1, 1, 12));
        $("plan-persons-plus")?.addEventListener("click", () => bump("persons", 1, 1, 12));
        $("plan-vary")?.addEventListener("change", (e) => { plan.config.vary = e.target.checked; });
        $("plan-generate-btn")?.addEventListener("click", generateAll);
        $("plan-edit-btn")?.addEventListener("click", () => { setupOpen = true; renderSetup(); renderResult(); $("plan-setup").scrollIntoView({ behavior: "smooth", block: "start" }); });
        $("plan-clear-btn")?.addEventListener("click", () => {
            if (!confirm("Effacer ce planning et recommencer ?")) return;
            plan.meals = []; save(); setupOpen = true; renderSetup(); renderResult();
        });
        $("plan-shopping-btn")?.addEventListener("click", () => {
            const recipes = shoppingRecipes();
            Shopping.open({ title: "Courses de la semaine", subtitle: `${recipes.length} recettes · ${plan.config.persons} personne${plan.config.persons > 1 ? "s" : ""}`, recipes });
        });
        $("planBackBtn")?.addEventListener("click", () => { showBack(false); open(); });
        // Une version ajustée / ajoutée sur une recette du planning : on enregistre
        window.addEventListener("lg:pack-changed", () => { if (plan.meals.some(m => m.pack === LG.activePack())) save(); });
    }

    return { init, open, close, hideBack: () => showBack(false) };
})();
