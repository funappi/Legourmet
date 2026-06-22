window.activeRecipePack = null;
window.currentSelectedVariant = "original";
window.currentPortions = 1;

window.currentHardware = "Aucun";
window.currentComplex = "Amateur";
window.currentRisk = "Original";

document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. ARCHITECTURE DES COULEURS & THÈMES ---
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
        });
    }

    // --- 2. GESTION DES INTERRUPTEURS (LINKAGES ON/OFF) ---
    const linkages = [
        { t: 't-ing', c: 'c-ing' },
        { t: 't-fusion', c: 'c-fusion' },
        { t: 't-equip', c: 'c-equip' },
        { t: 't-sliders', c: 'c-sliders' },
        { t: 't-diet', c: 'c-diet' }
    ];

    linkages.forEach(link => {
        const toggle = document.getElementById(link.t);
        const content = document.getElementById(link.c);
        if (toggle && content) {
            toggle.addEventListener("change", () => {
                content.classList.toggle("disabled", !toggle.checked);
            });
        }
    });

    // --- 3. SÉLECTION DES CARDS ÉQUIPEMENT (MULTIPLE) ---
    document.querySelectorAll('.equip-card').forEach(card => {
        card.addEventListener('click', () => {
            const equipContainer = document.getElementById('c-equip');
            if (equipContainer && !equipContainer.classList.contains('disabled')) {
                card.classList.toggle('active');
            }
        });
    });

    // --- 4. SÉLECTION DES CARDS RÉGIME ALIMENTAIRE (UNIQUE / TOGGLE) ---
    document.querySelectorAll('.diet-card').forEach(card => {
        card.addEventListener('click', () => {
            const dietContainer = document.getElementById('c-diet');
            if (dietContainer && !dietContainer.classList.contains('disabled')) {
                if (card.classList.contains('active')) {
                    card.classList.remove('active');
                } else {
                    document.querySelectorAll('.diet-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                }
            }
        });
    });

    // --- 5. SÉLECTION DES CARDS MODE DE CUISSON (UNIQUE / TOGGLE) ---
    document.querySelectorAll('.style-card').forEach(card => {
        card.addEventListener('click', () => {
            const dietContainer = document.getElementById('c-diet');
            if (dietContainer && !dietContainer.classList.contains('disabled')) {
                if (card.classList.contains('active')) {
                    card.classList.remove('active');
                } else {
                    document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                }
            }
        });
    });

    // --- 6. VALEURS TEXTUELLES DES SLIDERS ---
    const riskLevels = { "1": "Classique", "2": "Original", "3": "Aventure" };
    const timeLevels = { "1": "Fast Food", "2": "Amateur", "3": "Guide Michelin" };

    document.getElementById('slider-risk')?.addEventListener('input', (e) => {
        document.getElementById('risk-val').innerText = riskLevels[e.target.value];
    });
    document.getElementById('slider-time')?.addEventListener('input', (e) => {
        document.getElementById('time-val').innerText = timeLevels[e.target.value];
    });

    // --- 7. ÉCOUTEURS D'ONGLETS VARIATIONS ---
    document.querySelectorAll(".var-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            if (!window.activeRecipePack) return;
            document.querySelectorAll(".var-tab").forEach(t => t.classList.remove("active-variant"));
            tab.classList.add("active-variant");
            window.currentSelectedVariant = tab.dataset.variant;
            window.renderSelectedVariant(window.currentSelectedVariant);
        });
    });

    // --- 8. WIDGET MULTIPLICATEUR DE PORTIONS (MR. COOK) ---
    document.getElementById("btn-plus")?.addEventListener("click", () => {
        window.currentPortions++;
        document.getElementById("portion-display").innerText = window.currentPortions;
        if(window.activeRecipePack) window.renderSelectedVariant(window.currentSelectedVariant);
    });
    document.getElementById("btn-minus")?.addEventListener("click", () => {
        if (window.currentPortions > 1) {
            window.currentPortions--;
            document.getElementById("portion-display").innerText = window.currentPortions;
            if(window.activeRecipePack) window.renderSelectedVariant(window.currentSelectedVariant);
        }
    });

    // --- 9. CONFIGURATION ET AGGRÉGATION DU PAYLOAD ---
    const btnGenerate = document.getElementById("btn-generate");
    const loadingDisplay = document.getElementById("loading-display");
    const loadingText = loadingDisplay?.querySelector("h2");
    const ideasModal = document.getElementById("ideas-modal-overlay");
    const ideasContainer = document.getElementById("ideas-container");

    function getFormPayload() {
        const hardware = [];
        document.querySelectorAll('.equip-card.active').forEach(el => hardware.push(el.getAttribute('data-equip')));

        let ingredientsPack = [];
        if (document.getElementById('t-ing')?.checked && window.selectedIngredients) {
            if (window.selectedIngredients["anti-gaspi"]) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients["anti-gaspi"]));
            if (window.selectedIngredients.base) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.base));
            if (window.selectedIngredients.protein) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.protein));
            if (window.selectedIngredients.vegetable) ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.vegetable));
        }
        if (ingredientsPack.length === 0) ingredientsPack = ["Auto_FoodPairing"];

        const riskVal = document.getElementById('risk-val');
        const timeVal = document.getElementById('time-val');

        window.currentHardware = document.getElementById('t-equip')?.checked && hardware.length > 0 ? hardware.join(', ') : "Libre";
        window.currentComplex = document.getElementById('t-sliders')?.checked && timeVal ? timeVal.innerText : "Amateur";
        window.currentRisk = document.getElementById('t-sliders')?.checked && riskVal ? riskVal.innerText : "Original";

        let levelPromptSystem = "Créer une recette équilibrée et accessible.";
        if (window.currentComplex === "Fast Food") {
            levelPromptSystem = "INSTRUCTION CRITIQUE : Agir en chef street-food. La recette doit être extrêmement rapide (moins de 20 minutes), réconfortante, gourmande (comfort food), utilisant un minimum de vaisselle (One-Pot/One-Pan) and des techniques de cuisson simples et directes.";
        } else if (window.currentComplex === "Guide Michelin") {
            levelPromptSystem = "INSTRUCTION CRITIQUE : Agir en chef triplement étoilé au Guide Michelin. La recette doit être technique, sophistiquée, avec des textures contrastées, une réduction de sauce ou une émulsion recherchée, des découpes ultra-précises and un guide de dressage artistique minutieux digne de la haute gastronomie.";
        }

        const activeDietCard = document.querySelector('.diet-card.active');
        const activeStyleCard = document.querySelector('.style-card.active');

        return {
            mode: "Avancé",
            simple_prompt: document.getElementById("simple-prompt-input")?.value || "Repas surprise du chef",
            ingredients: ingredientsPack,
            fusion: document.getElementById("t-fusion")?.checked ? (document.getElementById("fusion-input")?.value || "Auto_FoodPairing") : "Auto_FoodPairing",
            equipment: document.getElementById("t-equip")?.checked && hardware.length > 0 ? hardware : ["Auto_FoodPairing"],
            risk: window.currentRisk,
            time: window.currentComplex,
            chef_instruction_directive: levelPromptSystem,
            diet_profile: document.getElementById('t-diet')?.checked ? (activeDietCard ? activeDietCard.dataset.diet : "Aucun") : "Aucun",
            cooking_style: document.getElementById('t-diet')?.checked ? (activeStyleCard ? activeStyleCard.dataset.style : "Libre") : "Libre"
        };
    }

    // ÉTAPE 1 : Demande des 3 Inspirations (generate-ideas)
    async function fetchIdeas() {
        if (!btnGenerate) return;
        btnGenerate.disabled = true;
        btnGenerate.innerText = "Recherche d'inspirations...";
        document.getElementById("recipeCard").classList.remove("show");
        document.getElementById("variationTabsZone").style.display = "none";
        
        document.getElementById("recipeTitle").innerText = "Analyse moléculaire...";
        
        if (loadingText) loadingText.innerText = "Recherche de 3 idées de plats...";
        if (loadingDisplay) {
            loadingDisplay.classList.remove("hidden-mode");
            loadingDisplay.style.display = "block";
        }

        const payload = getFormPayload();

        try {
            const response = await fetch(`${BACKEND_URL}/generate-ideas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Erreur génération idées");
            const data = await response.json();

            if (ideasContainer && data.ideas && data.ideas.length > 0) {
                ideasContainer.innerHTML = "";
                data.ideas.forEach(idea => {
                    const card = document.createElement("div");
                    card.className = "idea-card";
                    card.innerHTML = `<h4>${idea.title}</h4><p>${idea.description}</p>`;
                    card.addEventListener("click", () => fetchFullRecipe(idea.title));
                    ideasContainer.appendChild(card);
                });
                ideasModal?.classList.remove("hidden-mode");
            }
        } catch (err) {
            console.error(err);
            alert("Erreur de connexion avec le laboratoire. Veuillez réessayer.");
        } finally {
            // Sécurisé ici : Le chargement se coupe TOUJOURS dès que le réseau s'arrête
            if (loadingDisplay) {
                loadingDisplay.classList.add("hidden-mode");
                loadingDisplay.style.display = "none"; 
            }
            btnGenerate.disabled = false;
            btnGenerate.innerText = "Cuisiner 🚀";
        }
    }

    // ÉTAPE 2 : Concoction finale de la recette complète basée sur le choix
    async function fetchFullRecipe(selectedTitle) {
        if (ideasModal) ideasModal.classList.add("hidden-mode");
        if (loadingText) loadingText.innerText = "Le Chef élabore vos sauces et techniques...";
        if (loadingDisplay) {
            loadingDisplay.classList.remove("hidden-mode");
            loadingDisplay.style.display = "block";
        }

        const payload = getFormPayload();
        payload.selected_idea = selectedTitle;

        try {
            const response = await fetch(`${BACKEND_URL}/generate-recipe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Erreur génération recette");
            
            window.activeRecipePack = await response.json();
            window.currentPortions = 1;
            
            const portionDisplay = document.getElementById("portion-display");
            if (portionDisplay) portionDisplay.innerText = "1";
            
            const variationTabsZone = document.getElementById("variationTabsZone");
            if (variationTabsZone) variationTabsZone.style.display = "flex";
            
            const origTab = document.querySelector('[data-variant="original"]');
            if (origTab) origTab.click();

        } catch (err) {
            console.error(err);
            document.getElementById("recipeTitle").innerText = "Surcharge Moléculaire";
            const stepsList = document.getElementById("stepsList");
            if (stepsList) stepsList.innerHTML = "<p>L'intelligence artificielle n'a pas pu structurer la recette complète.</p>";
            document.getElementById("recipeCard").classList.add("show");
        } finally {
            if (loadingDisplay) {
                loadingDisplay.classList.add("hidden-mode");
                loadingDisplay.style.display = "none"; 
            }
        }
    }

    // Assignation des déclencheurs de base
    if (btnGenerate) btnGenerate.addEventListener("click", fetchIdeas);
    
    document.getElementById("close-modal-btn")?.addEventListener("click", () => {
        ideasModal?.classList.add("hidden-mode");
    });
    
    document.getElementById("retry-ideas-btn")?.addEventListener("click", () => {
        ideasModal?.classList.add("hidden-mode");
        fetchIdeas();
    });

    // ==========================================================================
    // ACTION 1 : SCREENSHOT DE LA FICHE + OUVERTURE DU VOLET DE PARTAGE NATIF
    // ==========================================================================
    const btnShareScreenshot = document.getElementById("btn-share-screenshot");
    if (btnShareScreenshot) {
        btnShareScreenshot.addEventListener("click", async () => {
            const recipeCard = document.getElementById("recipeCard");
            if (!recipeCard || !window.activeRecipePack) return;

            const oldText = btnShareScreenshot.innerText;
            btnShareScreenshot.innerText = "⚡ Génération du visuel...";

            try {
                const canvas = await html2canvas(recipeCard, {
                    useCORS: true,          
                    backgroundColor: "#07090e", 
                    scale: 2                
                });

                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const file = new File([blob], "ma-recette-le-gourmet.png", { type: "image/png" });

                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: "Ma recette Le Gourmet 🍳",
                            text: "Regarde le plat moléculaire que je viens de concevoir !"
                        });
                    } else {
                        const link = document.createElement("a");
                        link.download = "ma-recette-le-gourmet.png";
                        link.href = canvas.toDataURL();
                        link.click();
                    }
                }, "image/png");

            } catch (err) {
                console.error("Erreur lors de la capture de la fiche :", err);
            } finally {
                btnShareScreenshot.innerText = oldText;
            }
        });
    }

    // ==========================================================================
    // ACTION 2 : COPIE DE LA LISTE DE COURSES + REDIRECTION VERS LES NOTES
    // ==========================================================================
    const btnExportNotes = document.getElementById("btn-export-notes");
    if (btnExportNotes) {
        btnExportNotes.addEventListener("click", async () => {
            if (!window.activeRecipePack) return;
            const data = window.activeRecipePack[window.currentSelectedVariant];
            if (!data) return;

            let textOutput = `🛒 LISTE DE COURSES : ${data.title.toUpperCase()}\n`;
            textOutput += `Pour ${window.currentPortions} personne(s)\n\n`;
            
            data.ingredients.forEach(ing => {
                const qty = (parseFloat(ing.qty) * window.currentPortions).toFixed(1).replace('.0', '');
                textOutput += `- [ ] ${qty} ${ing.unit} ${ing.name}\n`;
            });

            try {
                await navigator.clipboard.writeText(textOutput);

                if (navigator.share) {
                    await navigator.share({
                        text: textOutput
                    });
                } else {
                    const oldText = btnExportNotes.innerText;
                    btnExportNotes.innerText = "Copié ! Prêt à coller dans vos notes ✓";
                    setTimeout(() => { btnExportNotes.innerText = oldText; }, 2500);
                }
            } catch (err) {
                console.error("Erreur d'exportation vers les notes :", err);
            }
        });
    }
});

// --- 11. LE MOTEUR DE RENDU INTERACTIF DOUBLE COLONNE MR. COOK ---
window.renderSelectedVariant = function(variantKey) {
    const data = window.activeRecipePack[variantKey];
    if (!data) return;

    document.querySelectorAll('.plate-glow').forEach(g => g.classList.remove('active'));
    const glowTarget = document.getElementById(`glow-${variantKey}`);
    if (glowTarget) glowTarget.classList.add('active');

    const keywords = data.title.split(' ').slice(0, 4).join('%20');
    const plateImg = document.getElementById("plateImage");
    if(plateImg) {
        plateImg.style.backgroundImage = `url('https://image.pollinations.ai/prompt/professional%20food%20photography%20of%20${keywords}?width=400&height=400&nologo=true')`;
    }

    document.getElementById("recipeTitle").innerText = data.title || "Titre inconnu";
    document.getElementById("p-time").innerText = data.prep_time ? `${data.prep_time} min` : "--";
    document.getElementById("c-time").innerText = data.cook_time ? `${data.cook_time} min` : "--";
    document.getElementById("t-time").innerText = data.total_time ? `${data.total_time} min` : "--";
    
    const rEquip = document.getElementById("r-equip");
    if(rEquip) rEquip.innerText = window.currentHardware;
    const rComplex = document.getElementById("r-complex");
    if(rComplex) rComplex.innerText = window.currentComplex;
    const rRisk = document.getElementById("r-risk");
    if(rRisk) rRisk.innerText = window.currentRisk;

    document.getElementById("r-nova").innerText = `NOVA ${data.nova_score || '?'}`;
    
    if (data.macros) {
        document.getElementById("r-pro").innerText = data.macros.proteines || "--";
        document.getElementById("r-lip").innerText = data.macros.lipides || "--";
        document.getElementById("r-glu").innerText = data.macros.glucides || "--";
    }

    const ingList = document.getElementById("ingredientsList");
    if (ingList && data.ingredients && Array.isArray(data.ingredients)) {
        ingList.innerHTML = data.ingredients.map(ing => {
            const calculatedQty = (parseFloat(ing.qty) * window.currentPortions).toFixed(1).replace('.0', '');
            return `<li><div class="custom-checkbox"></div> <label><strong>${calculatedQty} ${ing.unit}</strong> ${ing.name}</label></li>`;
        }).join('');

        ingList.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => li.classList.toggle('checked-item'));
        });
    }

    const stepsList = document.getElementById("stepsList");
    if (stepsList && data.steps) {
        if (Array.isArray(data.steps)) {
            stepsList.innerHTML = data.steps.map((step, idx) => `<p><strong>Étape ${idx + 1} :</strong> ${step}</p>`).join('');
            stepsList.querySelectorAll('p').forEach(p => p.addEventListener('click', () => p.classList.toggle('checked-step')));
        } else {
            stepsList.innerHTML = `<p>${data.steps}</p>`;
        }
    }

    document.getElementById("recipeCard").classList.add("show");
};
