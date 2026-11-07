// Tout texte venant du LLM ou d'un favori stocké doit passer par là avant d'entrer dans innerHTML.
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const AppState = {
    activeRecipePack: null,
    activeRecipeContext: null,   // { hardware, complex, risk } au moment où la recette affichée a été générée
    activeHistoryId: null,       // entrée de l'historique correspondant à la recette affichée
    previousVariant: null,       // { key, recipe } : version avant le dernier ajustement/régénération (pour annuler)
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
            DOM.toggle(DOM.get("loading-steps"), step > 0);   // step 0 = action ponctuelle (ajustement...), pas d'étapes à afficher
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
    Settings.init();   // allergies, exclusions, préférences (localStorage)

    // Nombre de personnes par défaut (paramètre), appliqué à chaque nouvelle recette ouverte
    function resetPortions() {
        AppState.currentPortions = Settings.defaultPortions();
        DOM.get("portion-display").innerText = String(AppState.currentPortions);
    }
    resetPortions();

    // Ouvre une recette (nouvelle génération, favori ou historique) dans la fiche
    function openRecipePack({ pack, context = null, historyId = null }) {
        AppState.activeRecipePack = pack;
        AppState.activeRecipeContext = context;
        AppState.activeHistoryId = historyId;
        AppState.previousVariant = null;
        resetPortions();
        DOM.get("variationTabsZone").style.display = "flex";
        const origTab = Array.from(DOM.getAll('.var-tab')).find(t => t.dataset.variant === "original");
        if (origTab) origTab.click();
        UIManager.closeSidebar();
    }

    // Réveille le serveur dès l'arrivée sur la page : le premier appel est souvent le plus lent.
    fetch(`${BACKEND_URL}/`).catch(() => {});

    // --- 1. MENUS & THÈME ---
    DOM.get("burger-toggle")?.addEventListener("click", UIManager.openSidebar);
    // Sur téléphone, on démarre sur l'accueil (le menu des réglages reste à un tap via ☰).
    if (window.matchMedia?.("(max-width: 768px)").matches) UIManager.closeSidebar();
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
    // Le champ de l'accueil et le champ « Inspiration » du menu sont le même texte : on les garde synchronisés.
    const promptInput = DOM.get("simple-prompt-input");
    const heroInput = DOM.get("hero-input");
    if (heroInput && promptInput) {
        heroInput.value = promptInput.value;
        heroInput.addEventListener("input", () => { promptInput.value = heroInput.value; });
        promptInput.addEventListener("input", () => { heroInput.value = promptInput.value; });
    }
    const flashHero = () => {
        if (!heroInput) return;
        if (window.matchMedia?.("(pointer: fine)").matches) heroInput.focus();   // pas de clavier qui surgit sur téléphone
        const form = DOM.get("hero-ask");
        form?.classList.remove("prompt-flash");
        void form?.offsetWidth;
        form?.classList.add("prompt-flash");
    };
    DOM.get("hero-ask")?.addEventListener("submit", (e) => {
        e.preventDefault();
        if (promptInput && heroInput) promptInput.value = heroInput.value;
        startIdeation(false);
    });
    DOM.getAll(".welcome-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const text = chip.dataset.prompt || "";
            if (promptInput) promptInput.value = text;
            if (heroInput) heroInput.value = text;
            if (chip.dataset.course) {
                const courseCard = Array.from(DOM.getAll('.course-card')).find(c => c.dataset.course === chip.dataset.course);
                if (courseCard && !courseCard.classList.contains('active')) courseCard.click();
            }
            flashHero();
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

    // Réglages par défaut du panneau (Préférences) : appliqués une fois tous les écouteurs branchés.
    Settings.applyPanelDefaults();

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
            // Les exclusions (allergies, aversions) passent AVANT tout le reste : c'est la partie critique.
            chef_instruction_directive: Settings.directivePrefix()
                + (course ? `${COURSE_DIRECTIVES[course]}\n` : "")
                + Settings.softPrefsLine(fusionString === "Auto_FoodPairing")
                + levelPromptSystem,
            exclusions: Settings.exclusionsPayload(),
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
            const historyId = RecipeHistory.add({ pack: data, context });
            openRecipePack({ pack: data, context, historyId });
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
                UIManager.toggleModal("favorites-modal-overlay", false);
                openRecipePack({ pack: fav.pack, context: fav.context || null });
            };

            card.querySelector('.btn-del-fav').onclick = (e) => {
                e.stopPropagation(); 
                AppState.favoris.splice(index, 1); 
                localStorage.setItem("lg_favs", JSON.stringify(AppState.favoris)); 
                renderFavoritesModal(); 
                updateFavStarUI(DOM.get("recipeTitle").textContent);
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
    // Comparaison insensible à la casse : d'anciens favoris ont été enregistrés en MAJUSCULES.
    const sameTitle = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    const updateFavStarUI = (title) => {
        const btn = DOM.get("btn-favorite-recipe");
        if(!btn) return;
        btn.style.display = "inline-block";
        const isFav = AppState.favoris.some(f => sameTitle(f.title, title));
        btn.innerHTML = isFav ? "★" : "☆";
        btn.classList.toggle("is-favorite", isFav);
    };

    DOM.get("btn-favorite-recipe")?.addEventListener("click", () => {
        if (!AppState.activeRecipePack) return;
        const currentTitle = DOM.get("recipeTitle").textContent;
        const index = AppState.favoris.findIndex(f => sameTitle(f.title, currentTitle));
        
        if (index > -1) AppState.favoris.splice(index, 1);
        else AppState.favoris.push({ title: currentTitle, pack: AppState.activeRecipePack, context: AppState.activeRecipeContext });
        
        localStorage.setItem("lg_favs", JSON.stringify(AppState.favoris));
        updateFavStarUI(currentTitle);
    });

    // --- 9bis. HISTORIQUE (20 dernières recettes) ---
    function renderHistoryModal() {
        const box = DOM.get("history-container");
        if (!box) return;
        box.innerHTML = "";
        const entries = RecipeHistory.list();
        DOM.toggle(DOM.get("clear-history-btn"), entries.length > 0);

        if (!entries.length) {
            const empty = document.createElement("p");
            empty.style.cssText = "color: var(--text-muted); text-align: center; padding: 20px;";
            empty.textContent = `Rien pour l'instant : tes ${RecipeHistory.MAX} dernières recettes apparaîtront ici.`;
            box.appendChild(empty);
            return;
        }

        entries.forEach(entry => {
            const card = document.createElement("div");
            card.className = "idea-card";
            card.style.cssText = "flex-direction: row; justify-content: space-between; align-items: center; gap: 12px;";

            const info = document.createElement("div");
            info.style.cssText = "flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;";
            const title = document.createElement("h4");
            title.style.margin = "0";
            title.textContent = entry.title;
            const meta = document.createElement("span");
            meta.className = "history-meta";
            meta.textContent = formatRelativeDate(entry.savedAt);
            info.append(title, meta);

            const actions = document.createElement("div");
            actions.style.cssText = "display: flex; gap: 10px;";
            const openBtn = document.createElement("button");
            openBtn.className = "control-btn";
            openBtn.style.cssText = "border-color: var(--healthy-color); color: var(--healthy-color);";
            openBtn.textContent = "Ouvrir";
            openBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                UIManager.toggleModal("history-modal-overlay", false);
                openRecipePack({ pack: entry.pack, context: entry.context, historyId: entry.id });
            });
            const delBtn = document.createElement("button");
            delBtn.className = "control-btn";
            delBtn.style.cssText = "border-color: var(--accent); color: var(--accent);";
            delBtn.setAttribute("aria-label", `Supprimer ${entry.title} de l'historique`);
            delBtn.textContent = "✖";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                RecipeHistory.remove(entry.id);
                renderHistoryModal();
            });
            actions.append(openBtn, delBtn);

            card.append(info, actions);
            box.appendChild(card);
        });
    }

    DOM.get("btn-open-history")?.addEventListener("click", () => {
        renderHistoryModal();
        UIManager.toggleModal("history-modal-overlay", true);
    });
    DOM.get("close-history-modal-btn")?.addEventListener("click", () => UIManager.toggleModal("history-modal-overlay", false));
    DOM.get("clear-history-btn")?.addEventListener("click", () => {
        if (!confirm("Vider tout l'historique ? Les favoris ne sont pas touchés.")) return;
        RecipeHistory.clear();
        renderHistoryModal();
    });

    // --- 9ter. AJUSTER / RÉGÉNÉRER LA VERSION AFFICHÉE ---
    const isValidVariant = (r) => !!r && typeof r === "object" && Array.isArray(r.ingredients) && r.ingredients.length > 0 && Array.isArray(r.steps) && r.steps.length > 0;

    // Garde l'historique et les favoris à jour quand une version change
    function syncAfterPackChange(oldTitle, newTitle) {
        const pack = AppState.activeRecipePack;
        RecipeHistory.update(AppState.activeHistoryId, pack);
        let favChanged = false;
        AppState.favoris.forEach(f => {
            if (f.pack === pack || sameTitle(f.title, oldTitle)) {
                f.pack = pack;
                if (sameTitle(f.title, oldTitle) && newTitle) f.title = newTitle;
                favChanged = true;
            }
        });
        if (favChanged) localStorage.setItem("lg_favs", JSON.stringify(AppState.favoris));
    }

    function applyVariantChange(key, newRecipe) {
        const pack = AppState.activeRecipePack;
        const previous = pack[key];
        AppState.previousVariant = { key, recipe: previous };
        pack[key] = newRecipe;
        syncAfterPackChange(previous?.title, newRecipe.title);
        window.renderSelectedVariant(key);
    }

    function equipmentForRequest() {
        const hardware = AppState.activeRecipeContext?.hardware;
        return hardware && hardware !== "Libre" && hardware !== "--" ? hardware.split(", ") : ["Auto_FoodPairing"];
    }

    async function adjustCurrentVariant(instruction) {
        const key = AppState.currentSelectedVariant;
        const current = AppState.activeRecipePack?.[key];
        const text = String(instruction || "").trim().slice(0, 380);
        if (!current || text.length < 2 || requestInFlight) return;
        requestInFlight = true;
        try {
            const data = await apiRequest('adjust-recipe', {
                instruction: text,
                variant_key: key,
                recipe: current,
                equipment: equipmentForRequest(),
                exclusions: Settings.exclusionsPayload()
            }, {
                step: 0,
                title: "Le chef ajuste la recette...",
                validate: d => isValidVariant(d?.recipe)
            });
            if (!data) return;
            applyVariantChange(key, data.recipe);
            DOM.get("tweak-input").value = "";
        } finally {
            requestInFlight = false;
        }
    }

    async function regenerateCurrentVariant() {
        const key = AppState.currentSelectedVariant;
        const pack = AppState.activeRecipePack;
        const current = pack?.[key];
        if (!current || requestInFlight) return;
        requestInFlight = true;
        try {
            const data = await apiRequest('regenerate-variant', {
                variant_key: key,
                idea_title: pack.original?.title || current.title,
                previous_title: current.title,
                base_recipe: key === "original" ? null : pack.original,
                equipment: equipmentForRequest(),
                exclusions: Settings.exclusionsPayload()
            }, {
                step: 0,
                title: "Le chef refait cette version...",
                validate: d => isValidVariant(d?.recipe)
            });
            if (!data) return;
            applyVariantChange(key, data.recipe);
        } finally {
            requestInFlight = false;
        }
    }

    const tweakInput = DOM.get("tweak-input");
    const runTweak = () => {
        const text = tweakInput?.value.trim() || "";
        if (text.length < 2) {
            tweakInput?.focus();
            tweakInput?.classList.remove("prompt-flash"); void tweakInput?.offsetWidth; tweakInput?.classList.add("prompt-flash");
            return;
        }
        adjustCurrentVariant(text);
    };
    DOM.get("btn-tweak")?.addEventListener("click", runTweak);
    tweakInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runTweak(); } });
    DOM.getAll("#tweak-suggestions [data-tweak]").forEach(chip => {
        chip.addEventListener("click", () => { if (tweakInput) tweakInput.value = chip.dataset.tweak; adjustCurrentVariant(chip.dataset.tweak); });
    });
    DOM.get("btn-regenerate-variant")?.addEventListener("click", regenerateCurrentVariant);

    DOM.get("btn-undo-tweak")?.addEventListener("click", () => {
        const prev = AppState.previousVariant;
        if (!prev || !AppState.activeRecipePack) return;
        const current = AppState.activeRecipePack[prev.key];
        AppState.activeRecipePack[prev.key] = prev.recipe;
        AppState.previousVariant = null;
        syncAfterPackChange(current?.title, prev.recipe?.title);
        window.renderSelectedVariant(prev.key);
    });

    // Corriger automatiquement une recette qui contient un ingrédient exclu
    DOM.get("btn-fix-exclusions")?.addEventListener("click", () => {
        const found = AppState.lastViolations || [];
        if (!found.length) return;
        const list = found.map(v => `${v.label} (${v.ingredients.join(", ")})`).join(" ; ");
        adjustCurrentVariant(`Retire et remplace par des alternatives sûres ces ingrédients exclus : ${list}. Le plat doit rester cohérent et savoureux.`);
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
                            
                            // Les zones d'interface (ajustement, avertissement) n'ont rien à faire sur l'image partagée
                            clonedCard.querySelectorAll(".recipe-tweak, #exclusion-warning").forEach(el => { el.style.display = "none"; });

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

        // Contrôle des allergies / ingrédients détestés (par mots-clés : réduit le risque, ne le supprime pas)
        const { violations, badIndexes } = Settings.check(data);
        AppState.lastViolations = violations;
        if (violations.length) {
            DOM.get("exclusion-warning-text").textContent = "⚠️ Attention : cette version contient peut-être des ingrédients que tu as exclus — "
                + violations.map(v => `${v.label} : ${v.ingredients.join(", ")}`).join(" · ")
                + ". Vérifie avant de cuisiner.";
        }
        DOM.toggle(DOM.get("exclusion-warning"), violations.length > 0);
        if (ingList) ingList.querySelectorAll('li').forEach((li, i) => li.classList.toggle('is-excluded', badIndexes.has(i)));

        // « Revenir à la version précédente » : seulement sur la version qui vient d'être modifiée
        DOM.toggle(DOM.get("btn-undo-tweak"), !!AppState.previousVariant && AppState.previousVariant.key === variantKey);

        updateFavStarUI(data.title);
        DOM.get("recipeCard").classList.add("show");
    };
});
