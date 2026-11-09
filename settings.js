// ==========================================================================
// PARAMÈTRES (allergies, ingrédients détestés, préférences)
// Tout est enregistré dans le localStorage de CET appareil : rien n'est envoyé ailleurs
// que dans les requêtes de génération (pour que l'IA les respecte).
// ==========================================================================
const SETTINGS_KEY = "lg_settings";

// Les 14 allergènes à déclaration obligatoire (UE).
// « keywords » : mots repérés dans le nom des ingrédients (sans accents, en minuscules, pluriels gérés).
// « safe » : expressions qui ressemblent à l'allergène mais n'en sont pas (ex. lait de coco), ignorées au contrôle.
const ALLERGEN_CATALOG = [
    { id: "gluten", label: "Gluten", icon: "🌾", safe: [],
      keywords: ["ble", "farine", "pate", "pates", "pain", "semoule", "couscous", "orge", "seigle", "boulgour", "chapelure", "panure", "seitan", "epeautre", "kamut", "nouille", "spaghetti", "penne", "tagliatelle", "lasagne", "macaroni", "gnocchi", "brioche", "biscuit", "pita", "naan", "wrap", "tortilla", "pizza", "tempura", "biere", "avoine", "croûton", "crouton"] },
    { id: "crustaces", label: "Crustacés", icon: "🦐", safe: [],
      keywords: ["crustace", "crevette", "gambas", "crabe", "homard", "langoustine", "langouste", "ecrevisse", "tourteau"] },
    { id: "oeufs", label: "Œufs", icon: "🥚", safe: [],
      keywords: ["oeuf", "jaune d oeuf", "blanc d oeuf", "mayonnaise", "meringue", "omelette", "albumine"] },
    { id: "poisson", label: "Poisson", icon: "🐟", safe: [],
      keywords: ["poisson", "saumon", "thon", "cabillaud", "morue", "sardine", "anchois", "truite", "maquereau", "merlu", "colin", "dorade", "sole", "haddock", "surimi", "nuoc mam", "worcestershire", "lieu noir", "bar", "daurade", "hareng"] },
    { id: "arachides", label: "Arachides", icon: "🥜", safe: [],
      keywords: ["arachide", "cacahuete", "beurre de cacahuete"] },
    { id: "soja", label: "Soja", icon: "🫘", safe: [],
      keywords: ["soja", "tofu", "tempeh", "edamame", "miso", "tamari", "shoyu", "natto"] },
    { id: "lait", label: "Lait (lactose)", icon: "🥛", safe: ["lait de coco", "lait d amande", "lait de soja", "lait d avoine", "lait de riz", "lait vegetal", "creme de coco", "beurre de cacahuete", "beurre d amande", "beurre de cacao", "beurre de karite", "beurre de noix"],
      keywords: ["lait", "creme", "beurre", "fromage", "yaourt", "yogourt", "yoghourt", "mozzarella", "parmesan", "gruyere", "emmental", "chevre", "feta", "mascarpone", "ricotta", "skyr", "whey", "cheddar", "camembert", "brie", "roquefort", "comte", "raclette", "reblochon", "lactose", "caseine", "petit suisse", "kefir", "halloumi", "paneer", "burrata", "gorgonzola", "fromage blanc", "cream cheese", "ghee"] },
    { id: "fruits-a-coque", label: "Fruits à coque", icon: "🌰", safe: ["noix de coco", "noix de muscade", "noix de saint jacques", "noix de veau", "noix de jambon", "noix de boeuf", "noix de porc"],
      keywords: ["noix", "noisette", "amande", "pistache", "cajou", "pecan", "macadamia", "praline", "pralin", "frangipane", "gianduja", "massepain"] },
    { id: "celeri", label: "Céleri", icon: "🥬", safe: [], keywords: ["celeri"] },
    { id: "moutarde", label: "Moutarde", icon: "🟡", safe: [], keywords: ["moutarde"] },
    { id: "sesame", label: "Sésame", icon: "⚪", safe: [], keywords: ["sesame", "tahini", "tahin", "gomasio"] },
    { id: "sulfites", label: "Sulfites", icon: "🍷", safe: [], keywords: ["vin", "vinaigre", "abricot sec", "raisin sec", "fruits secs"] },
    { id: "lupin", label: "Lupin", icon: "🌼", safe: [], keywords: ["lupin"] },
    { id: "mollusques", label: "Mollusques", icon: "🦪", safe: [],
      keywords: ["mollusque", "moule", "huitre", "calamar", "poulpe", "seiche", "escargot", "saint jacques", "palourde", "coque", "encornet", "bulot", "coquillage"] }
];

const SPICE_LEVELS = [
    { id: "doux", label: "🌿 Peu épicé", sentence: "peu épicé (doux, adapté aux palais sensibles)" },
    { id: "moyen", label: "🌶️ Moyen", sentence: "moyennement épicé" },
    { id: "fort", label: "🔥 Bien relevé", sentence: "bien relevé, généreux en épices et en piment" }
];

// Minuscules, sans accents, sans ponctuation : sert à comparer des noms d'ingrédients.
const normalizeText = (value) => String(value ?? "")
    .toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`´\-]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const _termRegexCache = new Map();
function termRegex(term) {
    if (!_termRegexCache.has(term)) {
        const body = normalizeText(term).split(" ").filter(Boolean)
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9]+");
        _termRegexCache.set(term, body ? new RegExp(`(^|[^a-z0-9])${body}(s|x)?($|[^a-z0-9])`) : null);
    }
    return _termRegexCache.get(term);
}

const Settings = (() => {
    const DEFAULTS = () => ({
        version: 2,
        likesText: "",      // texte libre : ce que j'aime (lu tel quel par l'IA)
        avoidText: "",      // texte libre : ce que je n'aime pas + allergies (lu tel quel par l'IA)
        prefs: { portions: 1, spice: "", cuisines: [], units: { system: "metric", temp: "c" } },
        panel: null,        // réglages par défaut du panneau de contrôle (état de ses boutons), ou null
        panelEnabled: true  // false : le panneau démarre vide, même si des réglages sont enregistrés
    });
    const TEXT_MAX = 600;
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    let data = DEFAULTS();
    let lastFocus = null;

    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
            if (!raw || typeof raw !== "object") return;
            const d = DEFAULTS();
            const p = raw.prefs || {};
            if (typeof raw.likesText === "string" || typeof raw.avoidText === "string") {
                d.likesText = String(raw.likesText || "").slice(0, TEXT_MAX);
                d.avoidText = String(raw.avoidText || "").slice(0, TEXT_MAX);
            } else {
                // Ancien format (étiquettes + cases d'allergènes) : on le convertit en texte, sans rien perdre.
                const labels = (Array.isArray(raw.allergies) ? raw.allergies : []).map(id => ALLERGEN_CATALOG.find(a => a.id === id)).filter(Boolean).map(a => a.label);
                const words = (list) => (Array.isArray(list) ? list : []).filter(x => typeof x === "string" && x.trim()).map(x => x.trim());
                d.avoidText = [...labels, ...words(raw.dislikes)].join(", ").slice(0, TEXT_MAX);
                d.likesText = words(raw.likes).join(", ").slice(0, TEXT_MAX);
            }
            d.prefs.portions = clamp(parseInt(p.portions, 10) || 1, 1, 12);
            d.prefs.spice = SPICE_LEVELS.some(s => s.id === p.spice) ? p.spice : "";
            const u = p.units || {};
            d.prefs.units = { system: u.system === "us" ? "us" : "metric", temp: ["f", "th"].includes(u.temp) ? u.temp : "c" };
            d.prefs.cuisines = Array.isArray(p.cuisines) ? p.cuisines.filter(s => typeof s === "string") : [];
            d.panel = sanitizePanel(raw.panel);
            d.panelEnabled = raw.panelEnabled !== false;
            // Équipement/régime enregistrés avant l'arrivée des réglages du panneau : on les reprend dans ceux-ci.
            if (!d.panel && ((Array.isArray(p.equipment) && p.equipment.length) || p.diet)) {
                d.panel = sanitizePanel({ equip: p.equipment, diet: p.diet });
            }
            data = d;
        } catch (e) { data = DEFAULTS(); }
    }

    function persist() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); }
        catch (e) { flashStatus("⚠️ Impossible d'enregistrer (stockage plein ou bloqué)"); return; }
        flashStatus("Enregistré ✓");
    }

    let statusTimer = null;
    function flashStatus(text) {
        const el = document.getElementById("settings-saved");
        if (!el) return;
        el.textContent = text;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { el.textContent = ""; }, 2200);
    }

    // ----- Lecture du texte libre -----
    const FILLERS = [
        /^(?:je\s+(?:ne\s+)?suis\s+)?(?:allergique|intol[eé]rant(?:e)?)s?(?=\s|$)\s*/i,
        /^allergies?(?=\s|$)\s*/i,
        /^(?:je\s+)?n['’ ]?\s*aime\s+pas(?=\s|$)\s*/i,
        /^(?:je\s+)?(?:d[eé]teste|hais|[eé]vite)(?=\s|$)\s*/i,
        /^(?:pas|sans|aucun|aucune)(?=\s|$)\s*/i,
        /^(?:(?:à la|a la|de la|aux|au|à|a|du|des|de|la|le|les|un|une)(?=\s)|(?:à l|a l|de l|l|d)['’])\s*/i
    ];
    function stripFillers(text) {
        let t = text;
        for (let i = 0; i < 6; i++) {
            const before = t;
            for (const re of FILLERS) t = t.replace(re, "").trim();
            if (t === before) break;
        }
        return t;
    }

    // « allergique aux arachides et au gluten, je déteste la coriandre » → ["arachides", "gluten", "coriandre"]
    function parseTerms(text) {
        const out = [];
        String(text || "").split(/[\n,;.]+|\s+(?:et|ou)\s+/i).forEach(chunk => {
            const t = stripFillers(chunk.replace(/\s+/g, " ").trim());
            if (t.length >= 2 && t.length <= 40 && !out.some(x => normalizeText(x) === normalizeText(t))) out.push(t);
        });
        return out.slice(0, 40);
    }

    // Quand un mot désigne un allergène du catalogue (gluten, lait, arachides…), on applique toute sa liste de dérivés.
    const ALLERGEN_ALIASES = {
        "lait": "lait", "lactose": "lait", "laitage": "lait", "produit laitier": "lait", "produits laitiers": "lait", "laitiers": "lait",
        "gluten": "gluten", "ble": "gluten",
        "oeuf": "oeufs", "oeufs": "oeufs",
        "arachide": "arachides", "arachides": "arachides", "cacahuete": "arachides", "cacahuetes": "arachides",
        "soja": "soja", "poisson": "poisson", "poissons": "poisson",
        "crustace": "crustaces", "crustaces": "crustaces", "fruits de mer": "crustaces",
        "mollusque": "mollusques", "mollusques": "mollusques",
        "noix": "fruits-a-coque", "fruits a coque": "fruits-a-coque", "fruit a coque": "fruits-a-coque", "fruits secs": "fruits-a-coque",
        "celeri": "celeri", "moutarde": "moutarde", "sesame": "sesame", "sulfite": "sulfites", "sulfites": "sulfites", "lupin": "lupin"
    };
    const allergenById = (id) => ALLERGEN_CATALOG.find(a => a.id === id);

    // Les termes ne changent que si le texte change : on évite de tout re-analyser à chaque affichage de recette.
    let _termsFor = null, _termsCache = [];
    function exclusionTerms() {
        if (_termsFor === data.avoidText) return _termsCache;
        const terms = [];
        const seenAllergens = new Set();
        parseTerms(data.avoidText).forEach(term => {
            const id = ALLERGEN_ALIASES[normalizeText(term)];
            const allergen = id && allergenById(id);
            if (allergen) {
                if (seenAllergens.has(allergen.id)) return;
                seenAllergens.add(allergen.id);
                terms.push({ label: allergen.label, kws: allergen.keywords, safe: (allergen.safe || []).map(normalizeText), allergen: true });
            } else {
                terms.push({ label: term, kws: [term], safe: [], allergen: false });
            }
        });
        _termsFor = data.avoidText; _termsCache = terms;
        return terms;
    }

    const cleanLine = (text) => String(text || "").replace(/\s+/g, " ").trim();

    function exclusionsPayload() {
        const terms = exclusionTerms();
        return {
            avoid_text: cleanLine(data.avoidText),
            likes_text: cleanLine(data.likesText),
            // Lecture automatique du texte : le serveur s'en sert pour vérifier la réponse du LLM et redemander si besoin.
            allergies: terms.filter(t => t.allergen).map(t => t.label),
            dislikes: terms.filter(t => !t.allergen).map(t => t.label),
            allergy_rules: terms.filter(t => t.allergen).map(t => ({ label: t.label, keywords: t.kws, safe: t.safe }))
        };
    }

    function exclusionCount() { return exclusionTerms().length; }

    // Phrase mise EN TÊTE de la directive du chef (le serveur tronque la fin si elle est trop longue).
    function directivePrefix() {
        const parts = [];
        const avoid = cleanLine(data.avoidText), likes = cleanLine(data.likesText);
        if (avoid) parts.push(`À ÉVITER ABSOLUMENT : allergies et aversions écrites par l'utilisateur (aucun de ces éléments ni leurs dérivés, même en petite quantité, ni dans les ingrédients, ni dans les étapes) : « ${avoid} ».`);
        if (likes) parts.push(`PRÉFÉRENCES DE L'UTILISATEUR (à privilégier quand c'est cohérent avec le plat, sans forcer) : « ${likes} ».`);
        return parts.length ? parts.join(" ") + "\n" : "";
    }

    // Préférences « douces » : épices et cuisines appréciées (les cuisines seulement si aucune fusion n'est demandée).
    function softPrefsLine(fusionIsFree) {
        const parts = [];
        const spice = SPICE_LEVELS.find(s => s.id === data.prefs.spice);
        if (spice) parts.push(`Niveau d'épices souhaité : ${spice.sentence}.`);
        if (fusionIsFree && data.prefs.cuisines.length) {
            parts.push(`Cuisines appréciées de l'utilisateur (à privilégier si pertinent) : ${data.prefs.cuisines.map(c => c.split(" (")[0]).join(", ")}.`);
        }
        return parts.length ? parts.join(" ") + "\n" : "";
    }

    // Contrôle d'une variante de recette : renvoie les ingrédients qui semblent contenir un élément exclu.
    // C'est une vérification par mots-clés : elle réduit le risque, elle ne le supprime pas.
    function check(variant) {
        const terms = exclusionTerms();
        const byLabel = new Map();
        const badIndexes = new Set();
        if (!terms.length || !Array.isArray(variant?.ingredients)) return { violations: [], badIndexes };
        variant.ingredients.forEach((ing, index) => {
            const original = normalizeText(ing?.name);
            if (!original) return;
            terms.forEach(term => {
                let text = original;
                term.safe.forEach(s => { text = text.split(s).join(" "); });
                if (term.kws.some(k => { const re = termRegex(k); return re && re.test(text); })) {
                    if (!byLabel.has(term.label)) byLabel.set(term.label, []);
                    byLabel.get(term.label).push(String(ing.name));
                    badIndexes.add(index);
                }
            });
        });
        return { violations: Array.from(byLabel, ([label, ingredients]) => ({ label, ingredients })), badIndexes };
    }

    const defaultPortions = () => data.prefs.portions;

    // ----- Réglages par défaut du panneau de contrôle -----
    const PANEL_TOGGLES = ["ing", "fusion", "equip", "sliders", "diet"];
    const strList = (v) => (Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, 8) : []);
    function sanitizePanel(raw) {
        if (!raw || typeof raw !== "object") return null;
        const toggles = {};
        PANEL_TOGGLES.forEach(id => { toggles[id] = raw.toggles && typeof raw.toggles[id] === "boolean" ? raw.toggles[id] : true; });
        return {
            toggles,
            equip: strList(raw.equip), course: strList(raw.course),
            type: typeof raw.type === "string" ? raw.type : "",
            diet: typeof raw.diet === "string" ? raw.diet : "",
            style: typeof raw.style === "string" ? raw.style : "",
            risk: clamp(parseInt(raw.risk, 10) || 2, 1, 3),
            time: clamp(parseInt(raw.time, 10) || 2, 1, 3),
            fusion: strList(raw.fusion).slice(0, 4)
        };
    }

    const activeValues = (selector, attr) => Array.from(document.querySelectorAll(`${selector}.active`)).map(el => el.dataset[attr]);

    // État actuel des boutons du panneau d'accueil (les ingrédients saisis ne sont pas gardés : ils changent à chaque recette).
    function capturePanel() {
        const toggles = {};
        PANEL_TOGGLES.forEach(id => { toggles[id] = !!document.getElementById(`t-${id}`)?.checked; });
        return sanitizePanel({
            toggles,
            equip: activeValues(".equip-card", "equip"),
            course: activeValues(".course-card", "course"),
            type: activeValues(".type-card", "type")[0] || "",
            diet: activeValues(".diet-card", "diet")[0] || "",
            style: activeValues(".style-card", "style")[0] || "",
            risk: document.getElementById("slider-risk")?.value,
            time: document.getElementById("slider-time")?.value,
            fusion: Array.from(document.querySelectorAll(".fusion-select")).map(sel => sel.value).filter(Boolean)
        });
    }

    // Bouton « Enregistrer ces réglages par défaut » du panneau : ce que tu vois devient ton pré-remplissage.
    function saveCurrentPanel(btn) {
        data.panel = capturePanel();
        data.panelEnabled = true;
        persist();
        prefillOn = true;
        renderPrefillButton();
        if (btn) {
            const old = btn.dataset.label || btn.textContent;
            btn.dataset.label = old; btn.textContent = "✓ Enregistré par défaut";
            setTimeout(() => { btn.textContent = old; }, 2000);
        }
    }

    const BLANK_PANEL = () => sanitizePanel({ type: "Salé" });   // l'état du panneau tel que livré

    // Met le panneau d'accueil EXACTEMENT dans l'état demandé (utilisé au démarrage et par le bouton cassette).
    function applyPanel(p) {
        PANEL_TOGGLES.forEach(id => {
            const box = document.getElementById(`t-${id}`);
            if (box && box.checked !== p.toggles[id]) { box.checked = p.toggles[id]; box.dispatchEvent(new Event("change", { bubbles: true })); }
        });
        const setActive = (selector, attr, wanted) => document.querySelectorAll(selector).forEach(c => c.classList.toggle("active", wanted.includes(c.dataset[attr])));
        setActive(".equip-card", "equip", p.equip);
        setActive(".course-card", "course", p.course);
        setActive(".type-card", "type", p.type ? [p.type] : []);
        setActive(".diet-card", "diet", p.diet ? [p.diet] : []);
        setActive(".style-card", "style", p.style ? [p.style] : []);
        [["risk", p.risk], ["time", p.time]].forEach(([key, value]) => {
            const slider = document.getElementById(`slider-${key}`);
            if (slider) { slider.value = String(value); slider.dispatchEvent(new Event("input", { bubbles: true })); }
        });
        // Cuisines fusion : autant de lignes que nécessaire (le bouton « + » en crée au plus 4), les autres sont retirées.
        const list = document.getElementById("fusion-list");
        const addBtn = document.getElementById("add-fusion-btn");
        const wanted = Math.max(1, p.fusion.length);
        while (list && list.children.length > wanted) list.lastElementChild.remove();
        while (list && list.children.length < wanted) { const n = list.children.length; addBtn?.click(); if (list.children.length === n) break; }
        document.querySelectorAll(".fusion-select").forEach((sel, i) => { sel.value = p.fusion[i] || ""; });
        if (window.LG_syncCourses) window.LG_syncCourses();
    }

    // Bouton cassette : l'état « pré-rempli » ne vaut que pour cette visite, rien n'est modifié en mémoire.
    let prefillOn = false;
    function renderPrefillButton() {
        const btn = document.getElementById("btn-prefill");
        if (!btn) return;
        const label = document.getElementById("prefill-label");
        const hint = document.getElementById("prefill-hint");
        btn.classList.toggle("is-on", prefillOn);
        btn.setAttribute("aria-pressed", String(prefillOn));
        if (!data.panel) {
            label.textContent = "Aucun réglage pré-rempli";
            hint.textContent = "Définis tes réglages par défaut dans Préférences.";
        } else if (prefillOn) {
            label.textContent = "Réglages pré-remplis";
            hint.textContent = "Modifie-les librement : ça ne change que cette recette.";
        } else {
            label.textContent = "Réglages pré-remplis : désactivés";
            hint.textContent = "Le panneau est vide. Clique pour remettre tes réglages.";
        }
    }
    function setPrefill(on) {
        if (on && !data.panel) { open({ section: "panel" }); return; }
        prefillOn = on;
        applyPanel(on ? data.panel : BLANK_PANEL());
        renderPrefillButton();
    }
    // À appeler une fois que main.js a branché ses écouteurs : applique les réglages enregistrés au démarrage.
    function applyPanelDefaults() {
        prefillOn = !!(data.panel && data.panelEnabled);
        if (prefillOn) applyPanel(data.panel);
        renderPrefillButton();
    }

    // Après un changement dans Préférences : le panneau d'accueil reprend les réglages (ou se vide si pré-remplissage désactivé).
    function syncPanelToMemory() {
        prefillOn = !!(data.panel && data.panelEnabled);
        applyPanel(prefillOn ? data.panel : BLANK_PANEL());
        renderPrefillButton();
    }

    // ----- Éditeur du panneau par défaut (dans Préférences) : une copie du panneau d'accueil -----
    let panelDirty = false;
    const RISK_LABELS = ["Classique", "Original", "Aventure"];
    const TIME_LABELS = ["Fast Food", "Amateur", "Guide Michelin"];

    function editPanel(fn) {
        if (!data.panel) data.panel = BLANK_PANEL();
        fn(data.panel);
        panelDirty = true;
        persist();
        refreshPanelEditor();
    }

    function buildPanelEditor() {
        const box = document.getElementById("panel-editor");
        if (!box) return;
        box.innerHTML = "";
        const mk = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
        const live = (sel, attr) => Array.from(document.querySelectorAll(sel)).map(c => ({ value: c.dataset[attr], label: c.textContent.trim() }));

        const section = (title, key) => {
            const sec = mk("div", "pd-section");
            const head = mk("div", "group-header");
            head.appendChild(mk("h2", "", title));
            const sw = mk("label", "switch");
            const input = mk("input"); input.type = "checkbox"; input.dataset.pdToggle = key; input.setAttribute("aria-label", `Activer : ${title}`);
            input.addEventListener("change", () => editPanel(p => { p.toggles[key] = input.checked; }));
            sw.append(input, mk("span", "slider"));
            head.appendChild(sw);
            const content = mk("div", "group-content"); content.dataset.pdContent = key;
            sec.append(head, content);
            box.appendChild(sec);
            return content;
        };

        const cardGroup = (parent, wrapperClass, items, group) => {
            const grid = mk("div", wrapperClass);
            items.forEach(({ value, label }) => {
                const b = mk("button", "pd-card", label); b.type = "button"; b.dataset.group = group; b.dataset.value = value;
                b.addEventListener("click", () => editPanel(p => {
                    if (group === "equip") { p.equip = p.equip.includes(value) ? p.equip.filter(x => x !== value) : [...p.equip, value]; return; }
                    if (group === "course") {   // 1, 2 ou 3 moments du repas ; plusieurs => type automatique
                        p.course = p.course.includes(value) ? p.course.filter(c => c !== value) : [...p.course, value];
                        if (p.course.length >= 2) p.type = "";
                        else if (p.course.length === 1) p.type = p.course[0] === "Dessert" ? "Sucré" : (p.type === "Sucré" ? "Salé" : p.type);
                    } else {
                        p[group] = p[group] === value ? "" : value;
                        if (group === "type" && p.type === "Salé") p.course = p.course.filter(c => c !== "Dessert");
                        if (group === "type" && p.course.length >= 2) p.type = "";
                    }
                }));
                grid.appendChild(b);
            });
            parent.appendChild(grid);
        };

        // Cuisine fusion
        const fusion = section("🌍 Cuisine Fusion", "fusion");
        fusion.id = "pd-fusion";
        // Équipement
        cardGroup(section("⚙️ Équipement disponible", "equip"), "equipment-grid", live(".equip-card", "equip"), "equip");
        // Profil & configuration
        const diet = section("👤 Profil & Configuration", "diet");
        const sub = (title) => { diet.appendChild(mk("label", "slider-label pd-sublabel", title)); };
        sub("Moment du repas"); cardGroup(diet, "course-grid", live(".course-card", "course"), "course");
        sub("Type de plat"); cardGroup(diet, "equipment-grid", live(".type-card", "type"), "type");
        sub("Régime alimentaire"); cardGroup(diet, "equipment-grid", live(".diet-card", "diet"), "diet");
        sub("Mode de cuisson cible"); cardGroup(diet, "equipment-grid", live(".style-card", "style"), "style");
        // Curseurs
        const sliders = section("🎛️ Paramètres de création", "sliders");
        [["risk", "Audace culinaire", RISK_LABELS, ["Classique", "Original", "Aventure"]], ["time", "Temps & complexité", TIME_LABELS, ["Fast Food", "Amateur", "Michelin"]]].forEach(([key, title, names, ticks]) => {
            const wrap = mk("div", "slider-container");
            const lab = mk("div", "slider-label"); lab.append(mk("span", "", title), Object.assign(mk("span", "badge-val"), { id: `pd-${key}-val` }));
            const range = mk("input"); range.type = "range"; range.min = "1"; range.max = "3"; range.step = "1"; range.id = `pd-${key}`; range.setAttribute("aria-label", title);
            range.addEventListener("input", () => { document.getElementById(`pd-${key}-val`).textContent = names[range.value - 1]; });
            range.addEventListener("change", () => editPanel(p => { p[key] = parseInt(range.value, 10); }));
            const tk = mk("div", "ticks"); ticks.forEach(t => tk.appendChild(mk("span", "", t)));
            wrap.append(lab, range, tk);
            sliders.appendChild(wrap);
        });
        fusionRows = null;
        refreshPanelEditor(true);
    }

    let fusionRows = null;   // lignes de la liste fusion (peut contenir des « » vides)
    function renderFusionRows() {
        const host = document.getElementById("pd-fusion");
        if (!host) return;
        host.innerHTML = "";
        const options = Array.from(document.querySelector(".fusion-select")?.options || []).map(o => ({ value: o.value, label: o.textContent.trim() }));
        const sync = () => { editPanel(p => { p.fusion = fusionRows.filter(Boolean).slice(0, 4); }); renderFusionRows(); };
        fusionRows.forEach((value, i) => {
            const row = document.createElement("div"); row.className = "pd-fusion-row";
            const sel = document.createElement("select"); sel.className = "pd-fusion-select"; sel.setAttribute("aria-label", `Cuisine fusion ${i + 1}`);
            options.forEach(o => { const opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); });
            sel.value = value;
            sel.addEventListener("change", () => { fusionRows[i] = sel.value; sync(); });
            row.appendChild(sel);
            if (fusionRows.length > 1) {
                const del = document.createElement("button"); del.type = "button"; del.className = "remove-fusion-btn"; del.textContent = "✕"; del.title = "Supprimer"; del.setAttribute("aria-label", "Supprimer cette ligne");
                del.addEventListener("click", () => { fusionRows.splice(i, 1); sync(); });
                row.appendChild(del);
            }
            host.appendChild(row);
        });
        if (fusionRows.length < 4) {
            const add = document.createElement("button"); add.type = "button"; add.className = "add-circular-btn"; add.textContent = "+"; add.title = "Croiser avec une autre origine"; add.setAttribute("aria-label", "Ajouter une cuisine fusion");
            add.addEventListener("click", () => { fusionRows.push(""); renderFusionRows(); });
            host.appendChild(add);
        }
    }

    // Reflète data.panel dans l'éditeur (cartes, interrupteurs, curseurs, fusion).
    function refreshPanelEditor(rebuildFusion = false) {
        const box = document.getElementById("panel-editor");
        if (!box) return;
        const p = data.panel || BLANK_PANEL();
        box.querySelectorAll(".pd-card").forEach(b => {
            const g = b.dataset.group, v = b.dataset.value;
            const on = g === "equip" ? p.equip.includes(v) : g === "course" ? p.course.includes(v) : p[g] === v;
            b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on));
        });
        box.querySelectorAll("[data-pd-toggle]").forEach(input => {
            const on = p.toggles[input.dataset.pdToggle];
            input.checked = on;
            box.querySelector(`[data-pd-content="${input.dataset.pdToggle}"]`)?.classList.toggle("disabled", !on);
        });
        [["risk", RISK_LABELS], ["time", TIME_LABELS]].forEach(([key, names]) => {
            const range = document.getElementById(`pd-${key}`);
            if (range) { range.value = String(p[key]); document.getElementById(`pd-${key}-val`).textContent = names[p[key] - 1]; }
        });
        if (rebuildFusion || !fusionRows) { fusionRows = p.fusion.length ? p.fusion.slice() : [""]; renderFusionRows(); }
        const on = document.getElementById("panel-prefill-switch");
        if (on) on.checked = data.panelEnabled;
        document.getElementById("panel-editor-wrap")?.classList.toggle("is-off", !data.panelEnabled);
        const clear = document.getElementById("clear-panel-defaults-btn");
        if (clear) clear.hidden = !data.panel;
    }

    // ----- Interface (page Préférences) -----
    function makeChip({ value, label, pressed, onToggle }) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip" + (pressed ? " active" : "");
        btn.dataset.value = value;
        btn.setAttribute("aria-pressed", String(!!pressed));
        btn.textContent = label;
        btn.addEventListener("click", () => {
            const next = !btn.classList.contains("active");
            btn.classList.toggle("active", next);
            btn.setAttribute("aria-pressed", String(next));
            onToggle(next, btn);
        });
        return btn;
    }

    function updateCountBadge() {
        const badge = document.getElementById("settings-count");
        if (!badge) return;
        const n = exclusionCount();
        badge.textContent = String(n);
        badge.classList.toggle("hidden-mode", n === 0);
    }

    function renderAll() {
        const likes = document.getElementById("pref-likes-text");
        const avoid = document.getElementById("pref-avoid-text");
        if (likes) likes.value = data.likesText;
        if (avoid) avoid.value = data.avoidText;
        updateReadback();

        document.getElementById("pref-portions-display").textContent = String(data.prefs.portions);

        // Régime et épices (choix unique, désélectionnable)
        const singleChoice = (containerId, items, key, after) => {
            const box = document.getElementById(containerId);
            box.innerHTML = "";
            items.forEach(({ value, label }) => box.appendChild(makeChip({
                value, label, pressed: data.prefs[key] === value,
                onToggle: (on) => {
                    data.prefs[key] = on ? value : "";
                    box.querySelectorAll(".chip").forEach(c => {
                        const active = c.dataset.value === data.prefs[key];
                        c.classList.toggle("active", active); c.setAttribute("aria-pressed", String(active));
                    });
                    persist(); if (after) after();
                }
            })));
        };
        // Unités : un choix obligatoire par rangée (pas de désélection)
        const unitChoice = (containerId, items, key) => {
            const box = document.getElementById(containerId);
            if (!box) return;
            box.innerHTML = "";
            items.forEach(({ value, label }) => box.appendChild(makeChip({
                value, label, pressed: data.prefs.units[key] === value,
                onToggle: () => {
                    data.prefs.units[key] = value;
                    box.querySelectorAll(".chip").forEach(c => {
                        const active = c.dataset.value === value;
                        c.classList.toggle("active", active); c.setAttribute("aria-pressed", String(active));
                    });
                    persist();
                    window.dispatchEvent(new Event("lg:units-changed"));
                }
            })));
        };
        unitChoice("pref-unit-system", [{ value: "metric", label: "Métrique (g, ml)" }, { value: "us", label: "Américain (oz, cups)" }], "system");
        unitChoice("pref-unit-temp", [{ value: "c", label: "°C" }, { value: "f", label: "°F" }, { value: "th", label: "Thermostat" }], "temp");

        singleChoice("pref-spice", SPICE_LEVELS.map(s => ({ value: s.id, label: s.label })), "spice");

        // Cuisines préférées (multiple), reprises de la liste « Cuisine Fusion »
        const cuisineGrid = document.getElementById("pref-cuisines");
        cuisineGrid.innerHTML = "";
        const fusionSelect = document.querySelector(".fusion-select");
        if (fusionSelect) Array.from(fusionSelect.options).filter(o => o.value).forEach(o => cuisineGrid.appendChild(makeChip({
            value: o.value, label: o.textContent.trim(), pressed: data.prefs.cuisines.includes(o.value),
            onToggle: (on) => {
                data.prefs.cuisines = on ? [...new Set([...data.prefs.cuisines, o.value])] : data.prefs.cuisines.filter(x => x !== o.value);
                persist();
            }
        })));

        buildPanelEditor();
        updateCountBadge();
    }

    // Sous le champ « n'aime pas / allergies » : ce que l'appli a compris (elle s'en sert pour contrôler les recettes).
    function updateReadback() {
        const el = document.getElementById("avoid-readback");
        if (!el) return;
        const terms = exclusionTerms();
        el.textContent = terms.length ? `Compris : ${terms.map(t => t.label).join(", ")}` : "";
    }

    function isOpen() {
        const overlay = document.getElementById("settings-modal-overlay");
        return !!overlay && !overlay.classList.contains("hidden-mode");
    }
    function open(opts = {}) {
        lastFocus = document.activeElement;
        renderAll();
        panelDirty = false;
        document.getElementById("settings-modal-overlay").classList.remove("hidden-mode");
        document.getElementById("pref-api-key")?.dispatchEvent(new Event("input"));
        if (opts.section === "apikey") {
            const sec = document.getElementById("api-key-section");
            sec?.scrollIntoView({ block: "center" });
            sec?.classList.add("needs-attention");
            setTimeout(() => sec?.classList.remove("needs-attention"), 3500);
            document.getElementById("pref-api-key")?.focus();
        } else if (opts.section === "panel") document.getElementById("panel-editor-wrap")?.scrollIntoView({ block: "start" });
        else document.getElementById("pref-likes-text")?.focus();
    }
    function close() {
        document.getElementById("settings-modal-overlay").classList.add("hidden-mode");
        // Si les réglages par défaut ont changé, le panneau d'accueil les reprend tout de suite.
        if (panelDirty) { panelDirty = false; syncPanelToMemory(); }
        if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) {} }
    }

    function init() {
        load();
        updateCountBadge();

        document.getElementById("open-settings-btn")?.addEventListener("click", () => open());
        document.getElementById("close-settings-btn")?.addEventListener("click", close);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) { e.preventDefault(); close(); } });

        let saveTimer = null;
        [["pref-likes-text", "likesText"], ["pref-avoid-text", "avoidText"]].forEach(([id, key]) => {
            const box = document.getElementById(id);
            box?.addEventListener("input", () => {
                data[key] = box.value.slice(0, TEXT_MAX);
                updateCountBadge(); updateReadback();
                clearTimeout(saveTimer);
                saveTimer = setTimeout(persist, 400);   // on enregistre quand la frappe s'arrête
            });
            box?.addEventListener("blur", () => { clearTimeout(saveTimer); persist(); });
        });

        const step = (delta) => {
            data.prefs.portions = clamp(data.prefs.portions + delta, 1, 12);
            document.getElementById("pref-portions-display").textContent = String(data.prefs.portions);
            persist();
        };
        document.getElementById("pref-portions-minus")?.addEventListener("click", () => step(-1));
        document.getElementById("pref-portions-plus")?.addEventListener("click", () => step(1));

        document.getElementById("btn-prefill")?.addEventListener("click", () => setPrefill(!prefillOn));
        document.getElementById("btn-save-panel")?.addEventListener("click", (e) => saveCurrentPanel(e.currentTarget));
        document.getElementById("btn-edit-defaults")?.addEventListener("click", () => open({ section: "panel" }));
        document.getElementById("panel-prefill-switch")?.addEventListener("change", (e) => {
            data.panelEnabled = e.target.checked; panelDirty = true; persist(); refreshPanelEditor();
        });
        document.getElementById("clear-panel-defaults-btn")?.addEventListener("click", () => {
            data.panel = null; panelDirty = true; persist(); fusionRows = null; refreshPanelEditor(true);
        });

        document.getElementById("reset-settings-btn")?.addEventListener("click", () => {
            if (!confirm("Effacer toutes tes préférences, aversions et allergies enregistrées sur cet appareil ?")) return;
            data = DEFAULTS();
            persist(); renderAll();
        });
    }

    const API_KEY_STORE = "lg_apikey";
    const apiKey = () => { try { return (localStorage.getItem(API_KEY_STORE) || "").trim(); } catch (e) { return ""; } };
    function initApiKey() {
        const input = document.getElementById("pref-api-key");
        const status = document.getElementById("api-key-status");
        if (!input) return;
        const mask = (k) => `${k.slice(0, 4)}…${k.slice(-4)}`;
        const say = (text, kind = "") => { if (status) { status.textContent = text; status.dataset.kind = kind; } };
        const refresh = () => {
            const saved = apiKey(), typed = input.value.trim();
            if (typed && typed !== saved) say("Pas encore enregistrée : clique sur Enregistrer.", "warn");
            else if (saved) say(`✅ Clé enregistrée sur cet appareil (${mask(saved)}).`, "ok");
            else say("Aucune clé enregistrée : la génération est désactivée.", "warn");
        };
        const save = () => {
            const k = input.value.trim();
            try { k ? localStorage.setItem(API_KEY_STORE, k) : localStorage.removeItem(API_KEY_STORE); }
            catch (e) { say("⚠️ Ton navigateur refuse l'enregistrement (navigation privée ?).", "error"); return false; }
            refresh();
            return true;
        };
        input.value = apiKey();
        refresh();
        input.addEventListener("input", refresh);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
        document.getElementById("api-key-save")?.addEventListener("click", save);
        document.getElementById("api-key-toggle")?.addEventListener("click", () => { input.type = input.type === "password" ? "text" : "password"; });
        document.getElementById("api-key-clear")?.addEventListener("click", () => { input.value = ""; save(); });
        document.getElementById("api-key-test")?.addEventListener("click", async () => {
            const key = input.value.trim();
            if (!key) { say("Colle d'abord ta clé.", "warn"); return; }
            if (!save()) return;
            say("Test en cours…");
            try {
                const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
                if (res.ok) say(`✅ Clé valide et enregistrée (${mask(key)}).`, "ok");
                else if (res.status === 401) say("❌ Groq refuse cette clé : vérifie qu'elle est complète (elle commence par gsk_).", "error");
                else say(`Groq répond ${res.status}. Réessaie dans un instant.`, "warn");
            } catch (e) { say("Test impossible (connexion). La clé est quand même enregistrée.", "warn"); }
        });
    }

    const units = () => data.prefs.units;

    return { apiKey, initApiKey, units, init, open, close, isOpen, exclusionsPayload, exclusionCount, directivePrefix, softPrefsLine, check, defaultPortions, applyPanelDefaults, parseTerms };
})();
