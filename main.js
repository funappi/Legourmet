// main.js - Version Senior Spécialiste (Zéro Omission, DRY & Modulaire)
const AppState = {
    activeRecipePack: null,
    currentSelectedVariant: "original",
    currentPortions: 1,
    favoris: JSON.parse(localStorage.getItem("lg_favs") || "[]")
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
    setLoading: (isLoading, text = "Chargement...") => {
        const loader = DOM.get("loading-display");
        const loaderText = loader?.querySelector("h2");
        if (loaderText) loaderText.innerText = text;
        DOM.toggle(loader, isLoading);
        const btn = DOM.get("btn-generate");
        if (btn) btn.disabled = isLoading;
    },
    closeSidebar: () => DOM.get("mainAppContainer")?.classList.add("sidebar-collapsed"),
    openSidebar: () => DOM.get("mainAppContainer")?.classList.remove("sidebar-collapsed"),
    toggleModal: (modalId, show) => DOM.toggle(DOM.get(modalId), show)
};

document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. MENUS & THÈME ---
    DOM.get("burger-toggle")?.addEventListener("click", UIManager.openSidebar);
    DOM.get("close-sidebar-btn")?.addEventListener("click", UIManager.closeSidebar);
    
    DOM.get("theme-toggle")?.addEventListener("click", () => {
        const root = document.documentElement;
        root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    });

    // --- 2. LOGIQUE GÉNÉRIQUE DES CARTES SÉLECTIONNABLES (D.R.Y) ---
    function setupSelectableCards(selector, containerId, isMultiple = false) {
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
            });
        });
    }

    setupSelectableCards('.equip-card', 'c-equip', true);  
    setupSelectableCards('.type-card', 'c-diet', false);   
    setupSelectableCards('.diet-card', 'c-diet', false);   
    setupSelectableCards('.style-card', 'c-diet', false);  

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
            chef_instruction_directive: levelPromptSystem,
            dish_type: isChecked('diet') ? extractActiveData('.type-card', 'type')[0] || "Salé" : "Salé",
            diet_profile: isChecked('diet') ? extractActiveData('.diet-card', 'diet')[0] || "Aucun" : "Aucun",
            cooking_style: isChecked('diet') ? extractActiveData('.style-card', 'style')[0] || "Libre" : "Libre"
        };
    }

    async function apiRequest(endpoint, payload, loadingMessage) {
        UIManager.setLoading(true, loadingMessage);
        try {
            const response = await fetch(`${BACKEND_URL}/${endpoint}`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(error);
            alert("⚠️ Problème de connexion avec le serveur culinaire !");
            return null;
        } finally {
            UIManager.setLoading(false);
            const btn = DOM.get("btn-generate");
            if (btn) btn.innerText = "Cuisiner 🚀";
        }
    }

    DOM.get("btn-generate")?.addEventListener("click", async () => {
        DOM.get("recipeCard").classList.remove("show");
        DOM.get("variationTabsZone").style.display = "none"; // Reset visuel pendant le chargement
        const btnFavStar = DOM.get("btn-favorite-recipe");
        if (btnFavStar) btnFavStar.style.display = "none";
        
        const data = await apiRequest('generate-ideas', buildPayload(), "Recherche d'inspirations...");
        
        if (data?.ideas?.length) {
            const container = DOM.get("ideas-container");
            container.innerHTML = data.ideas.map(idea => `
                <div class="idea-card" data-title="${idea.title}">
                    <h4>${idea.title}</h4><p>${idea.description}</p>
                </div>
            `).join('');

            container.querySelectorAll('.idea-card').forEach(card => {
                card.addEventListener('click', () => fetchFullRecipe(card.dataset.title));
            });
            
            UIManager.closeSidebar();
            UIManager.toggleModal("ideas-modal-overlay", true);
        }
    });

    async function fetchFullRecipe(selectedTitle) {
        UIManager.toggleModal("ideas-modal-overlay", false);
        
        const payload = buildPayload();
        payload.selected_idea = selectedTitle;

        const data = await apiRequest('generate-recipe', payload, "Le Chef élabore vos sauces...");
        if (data) {
            AppState.activeRecipePack = data;
            AppState.currentPortions = 1;
            DOM.get("portion-display").innerText = "1";
            DOM.get("variationTabsZone").style.display = "flex";
            
            const origTab = Array.from(DOM.getAll('.var-tab')).find(t => t.dataset.variant === "original");
            if (origTab) origTab.click();
            
            UIManager.closeSidebar();
        }
    }

    // --- 8. GESTION DES MODALES ---
    ['close-modal-btn', 'retry-ideas-btn'].forEach(id => {
        DOM.get(id)?.addEventListener('click', () => {
            UIManager.toggleModal("ideas-modal-overlay", false);
            UIManager.openSidebar();
        });
    });

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
                <h4 style="margin:0; flex:1;">${fav.title}</h4>
                <div style="display:flex; gap:10px;">
                    <button class="control-btn btn-load-fav" style="border-color: var(--healthy-color); color: var(--healthy-color);">Cuisiner</button>
                    <button class="control-btn btn-del-fav" style="border-color: var(--accent); color: var(--accent);">✖</button>
                </div>
            `;
            
            card.querySelector('.btn-load-fav').onclick = (e) => { 
                e.stopPropagation(); 
                AppState.activeRecipePack = fav.pack;
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
        else AppState.favoris.push({ title: currentTitle, pack: AppState.activeRecipePack });
        
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
                    logging: false 
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

        DOM.getAll('.plate-glow').forEach(g => g.classList.remove('active'));
        DOM.get(`glow-${variantKey}`)?.classList.add('active');

        const keywords = data.title.split(' ').slice(0, 4).join('%20');
        const plateImg = DOM.get("plateImage");
        if(plateImg) { 
            plateImg.style.backgroundImage = `url('https://image.pollinations.ai/prompt/professional%20food%20photography%20of%20${keywords}?width=400&height=400&nologo=true')`; 
            DOM.toggle(DOM.get("plate-placeholder"), false); 
        }

        DOM.get("recipeTitle").innerText = data.title || "Titre inconnu";
        ['p-time', 'c-time', 't-time'].forEach(type => {
            const key = type[0] === 't' ? 'total' : type === 'p-time' ? 'prep' : 'cook';
            DOM.get(type).innerText = data[`${key}_time`] ? `${data[`${key}_time`]} min` : "--";
        });

        DOM.get("r-equip").innerText = window.currentHardware;
        DOM.get("r-complex").innerText = window.currentComplex;
        DOM.get("r-risk").innerText = window.currentRisk;
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
            ingList.innerHTML = data.ingredients.map(ing => `<li><div class="custom-checkbox"></div> <label><strong>${(parseFloat(ing.qty) * AppState.currentPortions).toFixed(1).replace('.0', '')} ${ing.unit}</strong> ${ing.name}</label></li>`).join('');
            ingList.querySelectorAll('li').forEach(li => li.addEventListener('click', () => li.classList.toggle('checked-item')));
        }

        const stepsList = DOM.get("stepsList");
        if (stepsList && Array.isArray(data.steps)) {
            stepsList.innerHTML = data.steps.map((step, idx) => `<p><strong>Étape ${idx + 1} :</strong> ${step}</p>`).join(''); 
            stepsList.querySelectorAll('p').forEach(p => p.addEventListener('click', () => p.classList.toggle('checked-step'))); 
        }

        updateFavStarUI(data.title);
        DOM.get("recipeCard").classList.add("show");
    };
});
