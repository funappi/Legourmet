// Tout texte venant du LLM ou d'un favori stocké doit passer par là avant d'entrer dans innerHTML.
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const AppState = {
    activeRecipePack: null,
    activeRecipeContext: null,   // { hardware, complex, risk } au moment où la recette affichée a été générée
    currentSelectedVariant: "original",
    currentPortions: 1,
    seenIdeaTitles: [],          // idées déjà proposées : évite de les redonner quand on clique « Essaie encore »
    favoris: JSON.parse(localStorage.getItem("lg_favs") || "[]")
};

// Réglages de l'écran de chargement et des appels serveur
const REQUEST_TIMEOUT_MS = 60000;   // au-delà, on considère que le serveur ne répond pas
const SLOW_NOTICE_MS = 10000;       // après ce délai, on prévient que le serveur se réveille peut-être
const QUIP_INTERVAL_MS = 3200;      // rythme des phrases rigolotes

const LOADING_QUIPS = [
    "Le chef est en train de faire mijoter l'IA… 🍲",
    "Les câbles internet sont en ébullition 🔥",
    "La page internet se rafraîchit un petit peu… 🧖",
    "Un pixel goûte la sauce pour vérifier l'assaisonnement 🥄",
    "On réveille doucement le serveur, il n'a pas encore pris son café ☕",
    "Les octets sont en train de mariner 🥩",
    "Le serveur épluche les données et pleure un peu 🧅",
    "Un neurone artificiel vérifie que le four est préchauffé ♨️",
    "On demande à Llama de ne pas goûter avant l'heure 🦙",
    "Le wifi fait revenir les paquets à feu doux 📶",
    "Le chef IA consulte ses grimoires de saveurs 📖",
    "Les algorithmes dressent l'assiette à la pince à épiler 🍽️",
    "On saupoudre juste ce qu'il faut de latence ⏳",
    "Patience : les meilleures recettes ne sont pas des fast-foods 🐌"
];

// Phrase glissée en tête de la directive du chef selon le « moment du repas » choisi
const COURSE_DIRECTIVES = {
    "Entrée": "SERVICE : ENTRÉE. Propose une entrée : portion légère et raffinée qui ouvre le repas, jamais un plat principal.",
    "Plat": "SERVICE : PLAT PRINCIPAL. Propose un plat principal complet et rassasiant.",
    "Dessert": "SERVICE : DESSERT. Propose un dessert (domaine sucré uniquement)."
};

// ==========================================
// 🛠️ UTILITAIRES DOM & UI CENTRALISÉS
// ==========================================
const DOM = {
    get: id => document.getElementById(id),
    getAll: selector => document.querySelectorAll(selector),
    toggle: (el, condition, className = 'hidden-mode') => {
        if(el) condition ? el.classList.remove(className) : el.classList.add(className);
    }
};

const UIManager = {
    closeSidebar: () => DOM.get("mainAppContainer")?.classList.add("sidebar-collapsed"),
    openSidebar: () => DOM.get("mainAppContainer")?.classList.remove("sidebar-collapsed"),
    toggleModal: (modalId, show) => DOM.toggle(DOM.get(modalId), show),
    showWelcome: (show) => DOM.toggle(DOM.get("welcome-screen"), show)
};

// ==========================================
// ⏳ ÉCRAN DE CHARGEMENT PLEIN ÉCRAN
// Recouvre tout (menu mobile compris), montre l'étape en cours, des phrases rigolotes,
// prévient quand le serveur est lent, et propose Annuler / Réessayer en cas de souci.
// ==========================================
const Loader = (() => {
    let quipTimer = null, swapTimer = null, slowTimer = null;
    let quipOrder = [], quipIndex = 0;
    let lastFocus = null;
    let onCancel = null;        // appelé si l'utilisateur annule pendant le chargement
    let resolveError = null;    // résout "retry" ou "close" quand l'erreur est affichée

    const isVisible = () => !DOM.get("loading-display").classList.contains("hidden-mode");

    const shuffled = (list) => {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    const clearTimers = () => {
        clearInterval(quipTimer); clearTimeout(swapTimer); clearTimeout(slowTimer);
        quipTimer = swapTimer = slowTimer = null;
    };

    const nextQuip = () => {
        if (quipIndex >= quipOrder.length) { quipOrder = shuffled(LOADING_QUIPS); quipIndex = 0; }
        return quipOrder[quipIndex++];
    };

    const rotateQuip = () => {
        const quip = DOM.get("loading-quip");
        quip.classList.add("is-fading");
        swapTimer = setTimeout(() => {
            quip.textContent = nextQuip();
            quip.classList.remove("is-fading");
        }, 350);
    };

    const setStep = (step) => {
        DOM.getAll(".loading-step").forEach(el => {
            const n = Number(el.dataset.step);
            el.classList.toggle("is-active", n === step);
            el.classList.toggle("is-done", n < step);
        });
    };

    const handleCancel = () => {
        if (resolveError) {                       // état « erreur » : le bouton sert à fermer
            const done = resolveError; resolveError = null; done("close");
        } else if (onCancel) {                    // état « chargement » : on annule la requête
            onCancel();
        }
    };

    return {
        init() {
            DOM.get("loading-cancel-btn")?.addEventListener("click", handleCancel);
            DOM.get("loading-retry-btn")?.addEventListener("click", () => {
                if (resolveError) { const done = resolveError; resolveError = null; done("retry"); }
            });
            document.addEventListener("keydown", (e) => {
                if (!isVisible()) return;
                if (e.key === "Escape") { e.preventDefault(); handleCancel(); return; }
                if (e.key === "Tab") {                // le focus reste dans l'écran de chargement
                    const buttons = ["loading-retry-btn", "loading-cancel-btn"].map(DOM.get)
                        .filter(b => b && !b.classList.contains("hidden-mode"));
                    if (!buttons.length) return;
                    e.preventDefault();
                    const i = buttons.indexOf(document.activeElement);
                    const next = e.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i === buttons.length - 1 ? 0 : i + 1);
                    buttons[next].focus();
                }
            });
        },

        isVisible,

        show({ step = 1, title = "Alchimie Culinaire en Cours...", onCancel: cancelFn = null } = {}) {
            clearTimers();
            if (!isVisible()) lastFocus = document.activeElement;
            onCancel = cancelFn;
            resolveError = null;

            setStep(step);
            DOM.get("loading-title").textContent = title;
            DOM.toggle(DOM.get("loading-spinner"), true);
            DOM.toggle(DOM.get("loading-quip"), true);
            DOM.toggle(DOM.get("loading-slow"), false);
            DOM.toggle(DOM.get("loading-error-text"), false);
            DOM.toggle(DOM.get("loading-retry-btn"), false);
            DOM.get("loading-cancel-btn").textContent = "Annuler";

            quipOrder = shuffled(LOADING_QUIPS); quipIndex = 0;
            const quip = DOM.get("loading-quip");
            quip.classList.remove("is-fading");
            quip.textContent = nextQuip();
            quipTimer = setInterval(rotateQuip, QUIP_INTERVAL_MS);
            slowTimer = setTimeout(() => DOM.toggle(DOM.get("loading-slow"), true), SLOW_NOTICE_MS);

            DOM.toggle(DOM.get("loading-display"), true);
            DOM.get("loading-cancel-btn").focus();
        },

        // Affiche l'erreur dans le même écran. Résout "retry" ou "close" selon le bouton choisi.
        showError(message) {
            clearTimers();
            onCancel = null;
            DOM.toggle(DOM.get("loading-spinner"), false);
            DOM.toggle(DOM.get("loading-quip"), false);
            DOM.toggle(DOM.get("loading-slow"), false);
            DOM.get("loading-title").textContent = "Oups, ça n'a pas pris…";
            const text = DOM.get("loading-error-text");
            text.textContent = message;
            DOM.toggle(text, true);
            DOM.toggle(DOM.get("loading-retry-btn"), true);
            DOM.get("loading-cancel-btn").textContent = "Fermer";
            DOM.get("loading-retry-btn").focus();
            return new Promise(resolve => { resolveError = resolve; });
        },

        hide() {
            clearTimers();
            onCancel = null;
            resolveError = null;
            DOM.toggle(DOM.get("loading-display"), false);
            if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) {} }
            lastFocus = null;
        }
    };
})();

// ==========================================
// 🖼️ PHOTO DU PLAT : chargement visible + repli propre
// ==========================================
const PlateImage = (() => {
    const GIVE_UP_AFTER_MS = 15000;
    let token = 0, currentUrl = "", state = "idle";   // idle | loading | loaded | failed

    const setPlaceholder = (mode) => {
        const placeholder = DOM.get("plate-placeholder");
        if (!placeholder) return;
        if (mode !== "hidden") {
            DOM.get("plate-placeholder-icon").textContent = mode === "loading" ? "🍽️" : "🍲";
            DOM.get("plate-placeholder-text").textContent = mode === "loading"
                ? "Photo du plat en préparation..."
                : "Pas de photo cette fois, mais la recette est bien là !";
        }
        placeholder.classList.toggle("is-loading", mode === "loading");
        DOM.toggle(placeholder, mode !== "hidden");
    };

    return {
        show(title) {
            const keywords = String(title || "plat").split(' ').slice(0, 4).map(encodeURIComponent).join('%20');
            const url = `https://image.pollinations.ai/prompt/professional%20food%20photography%20of%20${keywords}?width=400&height=400&nologo=true`;
            // Même plat (changement de portions, retour sur un onglet) : on ne recharge pas
            if (url === currentUrl && (state === "loaded" || state === "loading")) return;

            const plateImg = DOM.get("plateImage");
            if (!plateImg) return;
            const myToken = ++token;
            currentUrl = url; state = "loading";
            plateImg.classList.remove("loaded");
            plateImg.style.backgroundImage = "";
            setPlaceholder("loading");

            const giveUpTimer = setTimeout(() => {
                if (token === myToken && state === "loading") { state = "failed"; setPlaceholder("failed"); }
            }, GIVE_UP_AFTER_MS);

            const probe = new Image();
            probe.onload = () => {
                clearTimeout(giveUpTimer);
                if (token !== myToken) return;      // un autre plat a été demandé entre-temps
                state = "loaded";
                plateImg.style.backgroundImage = `url('${url}')`;
                plateImg.classList.add("loaded");
                setPlaceholder("hidden");
            };
            probe.onerror = () => {
                clearTimeout(giveUpTimer);
                if (token !== myToken) return;
                state = "failed";
                setPlaceholder("failed");
            };
            probe.src = url;
        }
    };
})();

document.addEventListener("DOMContentLoaded", () => {

    Loader.init();

    // Réveille le serveur dès l'arrivée sur la page : le premier appel est souvent le plus lent.
    fetch(`${BACKEND_URL}/`).catch(() => {});

    // --- 1. MENUS & THÈME ---
    DOM.get("burger-toggle")?.addEventListener("click", UIManager.openSidebar);
    DOM.get("close-sidebar-btn")?.addEventListener("click", UIManager.closeSidebar);

    DOM.get("theme-toggle")?.addEventListener("click", () => {
        const root = document.documentElement;
        root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
        try { localStorage.setItem("lg_theme", root.dataset.theme); } catch (e) {}
    });

    // --- 2. LOGIQUE GÉNÉRIQUE DES CARTES SÉLECTIONNABLES (D.R.Y) ---
    function setupSelectableCards(selector, containerId, isMultiple = false, onChange = null) {
        DOM.getAll(selector).forEach(card => {
            card.addEventListener('click', () => {
                const container = DOM.get(containerId);
                if (!container || container.classList.contains('disabled')) return;

                if (!isMultiple) {
                    if (card.classList.contains('active')) {
                        card.classList.remove('active');
                    } else {
                        DOM.getAll(selector).forEach(c => c.classList.remove('active'));
                        card.classList.add('active');
                    }
                } else {
                    card.classList.toggle('active');
                }
                if (onChange) onChange(card);
            });
        });
    }

    setupSelectableCards('.equip-card', 'c-equip', true);
    // Dessert => Sucré ; Entrée/Plat => on repasse de Sucré à Salé. Le dernier clic de l'utilisateur gagne.
    setupSelectableCards('.course-card', 'c-diet', false, (card) => {
        if (!card.classList.contains('active')) return;
        const typeCards = Array.from(DOM.getAll('.type-card'));
        const activeType = typeCards.find(c => c.classList.contains('active'));
        const isDessert = card.dataset.course === "Dessert";
        if (isDessert || activeType?.dataset.type === "Sucré") {
            const wanted = isDessert ? "Sucré" : "Salé";
            typeCards.forEach(c => c.classList.toggle('active', c.dataset.type === wanted));
        }
    });
    // Choisir « Salé » alors que Dessert est sélectionné : on retire Dessert pour rester cohérent.
    setupSelectableCards('.type-card', 'c-diet', false, (card) => {
        if (card.classList.contains('active') && card.dataset.type === "Salé") {
            DOM.getAll('.course-card').forEach(c => { if (c.dataset.course === "Dessert") c.classList.remove('active'); });
        }
    });
    setupSelectableCards('.diet-card', 'c-diet', false);
    setupSelectableCards('.style-card', 'c-diet', false);

    // --- 2bis. ÉCRAN D'ACCUEIL ---
    const promptInput = DOM.get("simple-prompt-input");
    DOM.getAll(".welcome-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            if (promptInput) promptInput.value = chip.dataset.prompt || "";
            if (chip.dataset.course) {
                const courseCard = Array.from(DOM.getAll('.course-card')).find(c => c.dataset.course === chip.dataset.course);
                if (courseCard && !courseCard.classList.contains('active')) courseCard.click();
            }
            UIManager.openSidebar();   // sur mobile, le champ est dans le menu
            if (promptInput) {
                if (window.matchMedia?.("(pointer: fine)").matches) promptInput.focus();   // pas de clavier qui surgit sur téléphone
                promptInput.classList.remove("prompt-flash");
                void promptInput.offsetWidth;
                promptInput.classList.add("prompt-flash");
            }
        });
    });
    DOM.get("welcome-surprise-btn")?.addEventListener("click", () => startIdeation(false));

    // --- 3. LINKAGES ON/OFF ---
    ['ing', 'fusion', 'equip', 'sliders', 'diet'].forEach(id => {
        DOM.get(`t-${id}`)?.addEventListener("change", (e) => {
            DOM.get(`c-${id}`)?.classList.toggle("disabled", !e.target.checked);
        });
    });

    // --- 4. SLIDERS & PORTIONS ---
    const dicts = {
        risk: ["Classique", "Original", "Aventure"],
        time: ["Fast Food", "Amateur", "Guide Michelin"]
    };
    
    ['risk', 'time'].forEach(type => {
        DOM.get(`slider-${type}`)?.addEventListener('input', (e) => {
            DOM.get(`${type}-val`).innerText = dicts[type][e.target.value - 1];
        });
    });

    DOM.get("btn-plus")?.addEventListener("click", () => updatePortions(1));
    DOM.get("btn-minus")?.addEventListener("click", () => updatePortions(-1));

    function updatePortions(modifier) {
        const newPortion = AppState.currentPortions + modifier;
        if (newPortion >= 1) {
            AppState.currentPortions = newPortion;
            DOM.get("portion-display").innerText = AppState.currentPortions;
            if(AppState.activeRecipePack) window.renderSelectedVariant(AppState.currentSelectedVariant);
        }
    }

    // --- 5. GESTION DES ONGLETS RECETTE ---
    DOM.getAll(".var-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            if (!AppState.activeRecipePack) return;
            DOM.getAll(".var-tab").forEach(t => t.classList.remove("active-variant"));
            tab.classList.add("active-variant");
            AppState.currentSelectedVariant = tab.dataset.variant;
            window.renderSelectedVariant(AppState.currentSelectedVariant);
        });
    });

    // --- 6. GESTION FUSION DYNAMIQUE ---
    DOM.get("add-fusion-btn")?.addEventListener("click", () => {
        const fusionList = DOM.get("fusion-list");
        if (fusionList && fusionList.children.length < 4) {
            const newRow = document.createElement("div");
            newRow.className = "fusion-row";
            newRow.style.cssText = "display: flex; gap: 10px; align-items: center; margin-top: 10px;";
            
            const selectClone = fusionList.querySelector('.fusion-select').cloneNode(true);
            selectClone.value = ""; 
            
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "remove-fusion-btn";
            deleteBtn.innerHTML = "✕";
            deleteBtn.title = "Supprimer";
            deleteBtn.onclick = () => newRow.remove();

            newRow.append(selectClone, deleteBtn);
            fusionList.appendChild(newRow);
        }
    });

    // --- 7. MOTEUR API (PAYLOAD & FETCH) ---
    function buildPayload() {
        const extractActiveData = (selector, attr) => Array.from(DOM.getAll(`${selector}.active`)).map(el => el.dataset[attr]);
        const isChecked = id => DOM.get(`t-${id}`)?.checked;
        
        const hardware = isChecked('equip') ? extractActiveData('.equip-card', 'equip') : [];
        const fusionValues = isChecked('fusion') ? Array.from(DOM.getAll('.fusion-select')).map(s => s.value).filter(v => v) : [];
        
        const hasIngredients = isChecked('ing') && window.selectedIngredients && 
                               (window.selectedIngredients.base?.size > 0 || 
                                window.selectedIngredients.protein?.size > 0 || 
                                window.selectedIngredients.vegetable?.size > 0 || 
                                window.selectedIngredients["anti-gaspi"]?.size > 0);

        let ingredientsPack = [];
        if (hasIngredients) {
            if (window.selectedIngredients["anti-gaspi"]) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients["anti-gaspi"]));
            if (window.selectedIngredients.base) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.base));
            if (window.selectedIngredients.protein) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.protein));
            if (window.selectedIngredients.vegetable) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.vegetable));
        } else {
            ingredientsPack = ["Auto_FoodPairing"];
        }

        const fusionString = fusionValues.length > 0 ? fusionValues.join(" + ") : "Auto_FoodPairing";

        window.currentHardware = isChecked('equip') && hardware.length > 0 ? hardware.join(', ') : "Libre";
        window.currentComplex = isChecked('sliders') ? DOM.get('time-val').innerText : "Amateur";
        window.currentRisk = isChecked('sliders') ? DOM.get('risk-val').innerText : "Original";

        const inspiration = DOM.get("simple-prompt-input")?.value.trim();

        const course = isChecked('diet') ? extractActiveData('.course-card', 'course')[0] : undefined;
        const selectedType = isChecked('diet') ? extractActiveData('.type-card', 'type')[0] : undefined;
        const dishType = course === "Dessert" ? "Sucré" : (selectedType || "Salé");

        let levelPromptSystem = hasIngredients 
            ? "INSTRUCTION STRICTE : Tu DOIS construire une recette réaliste centrée sur les ingrédients fournis par l'utilisateur. Ne rajoute aucun ingrédient central majeur non listé (sauf sel, poivre, huile)."
            : "INSTRUCTION CRÉATIVE : Tu es un chef créatif libre d'imaginer le meilleur plat possible.";

        if (inspiration && inspiration.length > 0) {
            levelPromptSystem += `\n🚨 PRIORITÉ ABSOLUE (INSPIRATION) : L'utilisateur a demandé : "${inspiration}". La recette DOIT obligatoirement répondre à ce besoin précis.`;
        }
        if (fusionString !== "Auto_FoodPairing") {
            levelPromptSystem += `\n🌍 FUSION GÉOGRAPHIQUE : La recette s'inspire de ces régions : ${fusionString}. INSTRUCTION CRUCIALE : Tu DOIS obligatoirement intégrer 2 à 3 ingrédients phares emblématiques de ces zones pour bien marquer l'inspiration du plat.`;
        }
        if (window.currentComplex === "Fast Food") {
            levelPromptSystem += " Agis en chef street-food : recette extrêmement rapide (moins de 20 min), gourmande, utilisant un minimum de vaisselle (One-Pot).";
        } else if (window.currentComplex === "Guide Michelin") {
            levelPromptSystem += " Agis en chef triplement étoilé : recette technique, sophistiquée, avec des textures contrastées, réduction de sauce, dressage artistique minutieux.";
        } else {
            levelPromptSystem += " Agis en chef amateur passionné : propose une recette conviviale, équilibrée, avec des étapes claires et accessibles.";
        }

        return {
            mode: "Avancé",
            simple_prompt: inspiration || "Repas surprise du chef",
            ingredients: ingredientsPack,
            fusion: fusionString,
            equipment: hardware.length > 0 ? hardware : ["Auto_FoodPairing"],
            risk: window.currentRisk,
            time: window.currentComplex,
            // La consigne de service passe en tête : le serveur tronque la directive à 900 caractères.
            chef_instruction_directive: (course ? `${COURSE_DIRECTIVES[course]}\n` : "") + levelPromptSystem,
            dish_type: isChecked('diet') ? dishType : "Salé",
            diet_profile: isChecked('diet') ? extractActiveData('.diet-card', 'diet')[0] || "Aucun" : "Aucun",
            cooking_style: isChecked('diet') ? extractActiveData('.style-card', 'style')[0] || "Libre" : "Libre"
        };
    }

    // Message lisible selon la cause de l'échec
    function describeError(error) {
        if (error?.name === "AbortError") return "Le serveur met trop de temps à répondre (il se réveille peut-être). Réessaie dans un instant.";
        if (error?.status === 429) return "Trop de demandes d'un coup. Laisse le chef souffler une minute, puis réessaie.";
        if (error?.status >= 500) return "Le chef IA a eu un contretemps en cuisine (erreur du serveur). Ça passe souvent au deuxième essai.";
        if (error?.status) return `Le serveur a répondu une erreur inattendue (code ${error.status}). Réessaie dans un instant.`;
        if (error instanceof TypeError) return "Impossible de joindre le serveur. Vérifie ta connexion internet, puis réessaie.";
        return error?.userMessage || "Quelque chose s'est mal passé en cuisine. Réessaie dans un instant.";
    }

    // Une tentative : affiche le chargement, appelle le serveur, renvoie { data } | { error } | { cancelled }
    async function attemptRequest(endpoint, payload, { step, title, validate }) {
        const controller = new AbortController();
        let cancelled = false;
        Loader.show({ step, title, onCancel: () => { cancelled = true; controller.abort(); } });
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`${BACKEND_URL}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            if (!response.ok) {
                const err = new Error(`HTTP ${response.status}`);
                err.status = response.status;
                throw err;
            }
            const data = await response.json();
            if (validate && !validate(data)) {
                const err = new Error("Réponse inexploitable");
                err.userMessage = "Le chef n'a rien proposé d'exploitable cette fois. Réessaie !";
                throw err;
            }
            return { data };
        } catch (error) {
            if (cancelled) return { cancelled: true };
            console.error(error);
            return { error: describeError(error) };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // Boucle tant que l'utilisateur clique « Réessayer ». Renvoie les données, ou null (annulé / fermé).
    async function apiRequest(endpoint, payload, options) {
        while (true) {
            const result = await attemptRequest(endpoint, payload, options);
            if (result.data !== undefined) { Loader.hide(); return result.data; }
            if (result.cancelled) { Loader.hide(); return null; }
            const choice = await Loader.showError(result.error);
            if (choice !== "retry") { Loader.hide(); return null; }
        }
    }

    let requestInFlight = false;

    // Phase 1 : 3 idées. « isRetry » = clic sur « Essaie encore » : on demande des idées différentes.
    async function startIdeation(isRetry = false) {
        if (requestInFlight) return;
        requestInFlight = true;
        try {
            if (!isRetry) AppState.seenIdeaTitles = [];
            const payload = buildPayload();
            if (AppState.seenIdeaTitles.length) payload.avoid_titles = AppState.seenIdeaTitles.slice(-12);

            const data = await apiRequest('generate-ideas', payload, {
                step: 1,
                title: "Recherche d'inspirations...",
                validate: d => Array.isArray(d?.ideas) && d.ideas.length > 0
            });
            if (!data) return;   // annulé ou fermé : l'écran reste tel qu'il était

            AppState.seenIdeaTitles.push(...data.ideas.map(idea => idea.title));
            const container = DOM.get("ideas-container");
            container.innerHTML = data.ideas.map(idea => `
                <div class="idea-card" data-title="${escapeHtml(idea.title)}">
                    <h4>${escapeHtml(idea.title)}</h4><p>${escapeHtml(idea.description)}</p>
                </div>
            `).join('');

            container.querySelectorAll('.idea-card').forEach(card => {
                card.addEventListener('click', () => fetchFullRecipe(card.dataset.title));
            });

            UIManager.closeSidebar();
            UIManager.toggleModal("ideas-modal-overlay", true);
        } finally {
            requestInFlight = false;
        }
    }

    DOM.get("btn-generate")?.addEventListener("click", () => startIdeation(false));

    // Phase 2 : les 4 variantes de l'idée choisie.
    async function fetchFullRecipe(selectedTitle) {
        if (requestInFlight) return;
        requestInFlight = true;
        try {
            const payload = buildPayload();   // met aussi à jour window.current* (équipement, complexité, risque)
            payload.selected_idea = selectedTitle;
            const context = { hardware: window.currentHardware, complex: window.currentComplex, risk: window.currentRisk };

            // Les idées restent affichées derrière l'écran de chargement : si ça échoue, on peut en choisir une autre.
            const data = await apiRequest('generate-recipe', payload, {
                step: 2,
                title: "Le Chef élabore vos sauces...",
                validate: d => d && typeof d === "object" && d.original && typeof d.original === "object"
            });
            if (!data) return;

            UIManager.toggleModal("ideas-modal-overlay", false);
            AppState.activeRecipePack = data;
            AppState.activeRecipeContext = context;
            AppState.currentPortions = 1;
            DOM.get("portion-display").innerText = "1";
            DOM.get("variationTabsZone").style.display = "flex";

            const origTab = Array.from(DOM.getAll('.var-tab')).find(t => t.dataset.variant === "original");
            if (origTab) origTab.click();

            UIManager.closeSidebar();
        } finally {
            requestInFlight = false;
        }
    }

    // --- 8. GESTION DES MODALES ---
    DOM.get('close-modal-btn')?.addEventListener('click', () => {
        UIManager.toggleModal("ideas-modal-overlay", false);
        UIManager.openSidebar();
    });
    // « Essaie encore » relance vraiment la génération d'idées (en évitant celles déjà vues)
    DOM.get('retry-ideas-btn')?.addEventListener('click', () => startIdeation(true));

    function renderFavoritesModal() {
        const favsContainer = DOM.get("favorites-container");
        if (!favsContainer) return;
        favsContainer.innerHTML = "";
        
        if (AppState.favoris.length === 0) { 
            favsContainer.innerHTML = "<p style='color: var(--text-muted); text-align: center; padding: 20px;'>Aucune recette en favori.</p>"; 
            return; 
        }

        AppState.favoris.forEach((fav, index) => {
            const card = document.createElement("div"); 
            card.className = "idea-card"; 
            card.style.cssText = "flex-direction: row; justify-content: space-between; align-items: center;";
            
            card.innerHTML = `
                <h4 style="margin:0; flex:1;">${escapeHtml(fav.title)}</h4>
                <div style="display:flex; gap:10px;">
                    <button class="control-btn btn-load-fav" style="border-color: var(--healthy-color); color: var(--healthy-color);">Cuisiner</button>
                    <button class="control-btn btn-del-fav" style="border-color: var(--accent); color: var(--accent);">✖</button>
                </div>
            `;
            
            card.querySelector('.btn-load-fav').onclick = (e) => { 
                e.stopPropagation();
                AppState.activeRecipePack = fav.pack;
                AppState.activeRecipeContext = fav.context || null;
                AppState.currentPortions = 1;
                DOM.get("portion-display").innerText = "1";
                DOM.get("variationTabsZone").style.display = "flex";
                UIManager.toggleModal("favorites-modal-overlay", false);
                
                const origTab = Array.from(DOM.getAll('.var-tab')).find(t => t.dataset.variant === "original");
                if (origTab) origTab.click();
                
                UIManager.closeSidebar();
            };

            card.querySelector('.btn-del-fav').onclick = (e) => {
                e.stopPropagation(); 
                AppState.favoris.splice(index, 1); 
                localStorage.setItem("lg_favs", JSON.stringify(AppState.favoris)); 
                renderFavoritesModal(); 
                updateFavStarUI(DOM.get("recipeTitle").innerText);
            };
            
            favsContainer.appendChild(card);
        });
    }

    DOM.get("btn-open-favorites")?.addEventListener("click", () => { 
        renderFavoritesModal(); 
        UIManager.toggleModal("favorites-modal-overlay", true); 
    });
    
    DOM.get("close-fav-modal-btn")?.addEventListener("click", () => { 
        UIManager.toggleModal("favorites-modal-overlay", false); 
    });

    // --- 9. ÉTOILE FAVORIS ---
    const updateFavStarUI = (title) => {
        const btn = DOM.get("btn-favorite-recipe");
        if(!btn) return;
        btn.style.display = "inline-block";
        const isFav = AppState.favoris.some(f => f.title === title);
        btn.innerHTML = isFav ? "★" : "☆";
        btn.classList.toggle("is-favorite", isFav);
    };

    DOM.get("btn-favorite-recipe")?.addEventListener("click", () => {
        if (!AppState.activeRecipePack) return;
        const currentTitle = DOM.get("recipeTitle").innerText;
        const index = AppState.favoris.findIndex(f => f.title === currentTitle);
        
        if (index > -1) AppState.favoris.splice(index, 1);
        else AppState.favoris.push({ title: currentTitle, pack: AppState.activeRecipePack, context: AppState.activeRecipeContext });
        
        localStorage.setItem("lg_favs", JSON.stringify(AppState.favoris));
        updateFavStarUI(currentTitle);
    });

    // --- 10. MODULES D'EXPORTATIONS PREMIUM & CAPTURE ---
    const btnShareScreenshot = DOM.get("btn-share-screenshot");
    if (btnShareScreenshot) {
        btnShareScreenshot.addEventListener("click", async () => {
            const recipeCard = DOM.get("recipeCard"); 
            if (!recipeCard || !AppState.activeRecipePack) return;
            
            const oldText = btnShareScreenshot.innerText; 
            btnShareScreenshot.innerText = "⚡ Immortalisation...";
            
            const actionsContainer = recipeCard.querySelector(".recipe-actions-container"); 
            if (actionsContainer) actionsContainer.style.display = "none";
            
            try {
                const canvas = await html2canvas(recipeCard, { 
                    useCORS: true, 
                    allowTaint: false, 
                    backgroundColor: "#11141a", 
                    scale: 2, 
                    logging: false,
                    // 🚀 1. On simule un écran d'ordinateur de 1200px de large
                    windowWidth: 1200, 
                    // 🚀 2. On modifie le "clone" de la page juste avant la photo
                    onclone: (clonedDoc) => {
                        const clonedCard = clonedDoc.getElementById("recipeCard");
                        if (clonedCard) {
                            // On force la taille de la fiche recette à 850px
                            clonedCard.style.width = "850px";
                            clonedCard.style.maxWidth = "850px";
                            clonedCard.style.margin = "0 auto";
                            
                            // On s'assure que la grille (Ingrédients / Étapes) est bien en 2 colonnes
                            const splitCols = clonedCard.querySelector(".recipe-split-columns");
                            if (splitCols) {
                                splitCols.style.display = "grid";
                                splitCols.style.gridTemplateColumns = "1fr 1.4fr";
                                splitCols.style.gap = "35px";
                            }
                            
                            // On répare le flex des temps (Préparation, Cuisson, Total)
                            const timeRow = clonedCard.querySelector(".mrcook-time-row");
                            if (timeRow) {
                                timeRow.style.flexWrap = "nowrap";
                            }
                        }
                    }
                });
                
                if (actionsContainer) actionsContainer.style.display = "flex";
                
                canvas.toBlob(async (blob) => {
                    if (!blob) return; 
                    const file = new File([blob], "ma-recette-le-gourmet.png", { type: "image/png" });
                    
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: "Ma recette Le Gourmet 🍳", text: "Je partage ma recette !" });
                    } else { 
                        const link = document.createElement("a"); 
                        link.download = "ma-recette-le-gourmet.png"; 
                        link.href = canvas.toDataURL(); 
                        link.click(); 
                    }
                }, "image/png");
            } catch (err) { 
                console.error(err); 
                if (actionsContainer) actionsContainer.style.display = "flex"; 
            } finally { 
                btnShareScreenshot.innerText = oldText; 
            }
        });
    }

    const btnExportNotes = DOM.get("btn-export-notes");
    if (btnExportNotes) {
        btnExportNotes.addEventListener("click", async () => {
            if (!AppState.activeRecipePack) return;
            const data = AppState.activeRecipePack[AppState.currentSelectedVariant]; 
            if (!data) return;
            
            let textOutput = `🛒 LISTE DE COURSES : ${data.title.toUpperCase()}\nPour ${AppState.currentPortions} personne(s)\n\n`;
            data.ingredients.forEach(ing => { 
                textOutput += `- [ ] ${(parseFloat(ing.qty) * AppState.currentPortions).toFixed(1).replace('.0', '')} ${ing.unit} ${ing.name}\n`; 
            });
            
            try {
                await navigator.clipboard.writeText(textOutput);
                if (navigator.share) {
                    await navigator.share({ text: textOutput });
                } else { 
                    const oldText = btnExportNotes.innerText; 
                    btnExportNotes.innerText = "Copié !"; 
                    setTimeout(() => { btnExportNotes.innerText = oldText; }, 2500); 
                }
            } catch (err) {}
        });
    }

    // --- 11. MOTEUR DE RENDU INTERACTIF ---
    window.renderSelectedVariant = function(variantKey) {
        const data = AppState.activeRecipePack[variantKey]; 
        if (!data) return;

        UIManager.showWelcome(false);

        DOM.getAll('.plate-glow').forEach(g => g.classList.remove('active'));
        DOM.get(`glow-${variantKey}`)?.classList.add('active');

        PlateImage.show(data.title);

        DOM.get("recipeTitle").innerText = data.title || "Titre inconnu";
        ['p-time', 'c-time', 't-time'].forEach(type => {
            const key = type[0] === 't' ? 'total' : type === 'p-time' ? 'prep' : 'cook';
            DOM.get(type).innerText = data[`${key}_time`] ? `${data[`${key}_time`]} min` : "--";
        });

        const recipeContext = AppState.activeRecipeContext || {};
        DOM.get("r-equip").innerText = recipeContext.hardware ?? "--";
        DOM.get("r-complex").innerText = recipeContext.complex ?? "--";
        DOM.get("r-risk").innerText = recipeContext.risk ?? "--";
        DOM.get("r-nova").innerText = `NOVA ${data.nova_score || '?'}`;
        
        // Calcul dynamique et itératif des valeurs macro-nutritionnelles selon les portions
        if (data.macros) { 
            const calcMacro = valStr => {
                if (!valStr || valStr === "--") return "--";
                const num = parseFloat(valStr);
                return isNaN(num) ? valStr : `${(num * AppState.currentPortions).toFixed(0)}${valStr.replace(/[0-9.]/g, '')}`;
            };
            DOM.get("r-pro").innerText = calcMacro(data.macros.proteines); 
            DOM.get("r-lip").innerText = calcMacro(data.macros.lipides); 
            DOM.get("r-glu").innerText = calcMacro(data.macros.glucides); 
        }

        const ingList = DOM.get("ingredientsList");
        if (ingList && Array.isArray(data.ingredients)) {
            ingList.innerHTML = data.ingredients.map(ing => `<li><div class="custom-checkbox"></div> <label><strong>${(parseFloat(ing.qty) * AppState.currentPortions).toFixed(1).replace('.0', '')} ${escapeHtml(ing.unit)}</strong> ${escapeHtml(ing.name)}</label></li>`).join('');
            ingList.querySelectorAll('li').forEach(li => li.addEventListener('click', () => li.classList.toggle('checked-item')));
        }

        const stepsList = DOM.get("stepsList");
        if (stepsList && Array.isArray(data.steps)) {
            stepsList.innerHTML = data.steps.map((step, idx) => `<p><strong>Étape ${idx + 1} :</strong> ${escapeHtml(step)}</p>`).join(''); 
            stepsList.querySelectorAll('p').forEach(p => p.addEventListener('click', () => p.classList.toggle('checked-step'))); 
        }

        updateFavStarUI(data.title);
        DOM.get("recipeCard").classList.add("show");
    };
});
