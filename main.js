window.activeRecipePack = null;
window.currentSelectedVariant = "original";
window.currentPortions = 1;

// Variables pour les Context Pills
window.currentHardware = "Aucun";
window.currentComplex = "Amateur";
window.currentRisk = "Original";

document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. ARCHITECTURE DES COULEURS & MODES ---
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
        });
    }

    let isAdvanced = false;
    const modeBtn = document.getElementById("mode-toggle");
    const simpleMode = document.getElementById("simple-mode");
    const advancedMode = document.getElementById("advanced-mode");

    if (modeBtn && simpleMode && advancedMode) {
        modeBtn.addEventListener("click", () => {
            isAdvanced = !isAdvanced;
            simpleMode.classList.toggle("hidden-mode", isAdvanced);
            advancedMode.classList.toggle("hidden-mode", !isAdvanced);
            modeBtn.innerText = isAdvanced ? "Mode Simple 📝" : "Mode Avancé ⚙️";
            
            document.getElementById("autocomplete-list")?.classList.add("hidden-mode");
        });
    }

    // --- 2. GESTION DES INTERRUPTEURS (RÈGLE D'OR ON/OFF) ---
    const linkages = [
        { t: 't-slots', c: 'c-slots' },
        { t: 't-ing', c: 'c-ing' },
        { t: 't-fusion', c: 'c-fusion' },
        { t: 't-equip', c: 'c-equip' },
        { t: 't-sliders', c: 'c-sliders' },
        { t: 't-flavor', c: 'c-flavor' }
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

    // --- 3. SÉLECTION DES CARDS ÉQUIPEMENT ---
    const equipCards = document.querySelectorAll('.equip-card');
    equipCards.forEach(card => {
        card.addEventListener('click', () => {
            const equipContainer = document.getElementById('c-equip');
            if (equipContainer && !equipContainer.classList.contains('disabled')) {
                card.classList.toggle('active');
            }
        });
    });

    // --- 4. TEXTES DES SLIDERS AVANCÉS ---
    const riskLevels = { "1": "Classique", "2": "Original", "3": "Aventure" };
    const timeLevels = { "1": "Fast Food", "2": "Amateur", "3": "Guide Michelin" };

    document.getElementById('slider-risk')?.addEventListener('input', (e) => {
        document.getElementById('risk-val').innerText = riskLevels[e.target.value];
    });
    document.getElementById('slider-time')?.addEventListener('input', (e) => {
        document.getElementById('time-val').innerText = timeLevels[e.target.value];
    });

    // --- 5. ÉCOUTEURS D'ONGLETS VARIATIONS ---
    document.querySelectorAll(".var-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            if (!window.activeRecipePack) return;
            
            document.querySelectorAll(".var-tab").forEach(t => t.classList.remove("active-variant"));
            tab.classList.add("active-variant");
            
            const variantKey = tab.dataset.variant;
            window.currentSelectedVariant = variantKey;
            window.renderSelectedVariant(variantKey);
        });
    });

    // --- 6. WIDGET MULTIPLICATEUR DE PORTIONS (MR. COOK) ---
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

    // --- 7. AGGRÉGATION DU PAYLOAD COMPLET (RÈGLE D'OR AUTO_FOODPAIRING) ---
    const btnGenerate = document.getElementById("btn-generate");
    if (btnGenerate) {
        btnGenerate.addEventListener("click", async () => {
            btnGenerate.disabled = true;
            btnGenerate.innerText = "Alchimie en cours...";
            document.getElementById("recipeCard").classList.remove("show");
            document.getElementById("variationTabsZone").style.display = "none";
            document.getElementById("loading-display").classList.remove("hidden-mode");

            const hardware = [];
            document.querySelectorAll('.equip-card.active').forEach(el => hardware.push(el.getAttribute('data-equip')));

            // Mise à jour des variables de contexte pour l'affichage final
            window.currentHardware = document.getElementById('t-equip')?.checked && hardware.length > 0 ? hardware.join(', ') : "Libre";
            window.currentComplex = document.getElementById('t-sliders')?.checked ? document.getElementById('time-val')?.innerText : "Auto";
            window.currentRisk = document.getElementById('t-sliders')?.checked ? document.getElementById('risk-val')?.innerText : "Auto";

            let ingredientsPack = [];
            if (document.getElementById('t-slots')?.checked) {
                ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.base));
                ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.protein));
                ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.vegetable));
            }
            if (document.getElementById('t-ing')?.checked) {
                ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients["anti-gaspi"]));
            }

            const payload = {
                mode: isAdvanced ? "Avancé" : "Simple",
                simple_prompt: !isAdvanced ? (document.getElementById("simple-prompt-input")?.value || "Repas surprise du chef") : "Auto_FoodPairing",
                ingredients: isAdvanced ? (ingredientsPack.length > 0 ? ingredientsPack : ["Auto_FoodPairing"]) : ["Auto_FoodPairing"],
                fusion: isAdvanced ? (document.getElementById("t-fusion").checked ? (document.getElementById("fusion-input")?.value || "Auto_FoodPairing") : "Auto_FoodPairing") : "Auto_FoodPairing",
                equipment: isAdvanced ? (document.getElementById("t-equip").checked && hardware.length > 0 ? hardware : ["Auto_FoodPairing"]) : ["Auto_FoodPairing"],
                risk: isAdvanced ? (document.getElementById("t-sliders").checked ? document.getElementById("risk-val").innerText : "Auto_FoodPairing") : "Auto_FoodPairing",
                time: isAdvanced ? (document.getElementById("t-sliders").checked ? document.getElementById("time-val").innerText : "Auto_FoodPairing") : "Auto_FoodPairing",
                flavor: isAdvanced ? (document.getElementById("t-flavor").checked ? document.getElementById("flavor-result").innerText : "Auto_FoodPairing") : "Auto_FoodPairing"
            };

            try {
                // Requête utilisant la constante BACKEND_URL définie dans inventory.js
                const response = await fetch(`${BACKEND_URL}/generate-recipe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                
                window.activeRecipePack = await response.json();
                window.currentPortions = 1;
                document.getElementById("portion-display").innerText = "1";
                
                document.getElementById("loading-display").classList.add("hidden-mode");
                document.getElementById("variationTabsZone").style.display = "flex";
                document.querySelector('[data-variant="original"]').click();

            } catch (err) {
                console.error(err);
                document.getElementById("recipeTitle").innerText = "Surcharge Moléculaire";
                const stepsList = document.getElementById("stepsList");
                if (stepsList) {
                    stepsList.innerHTML = "<p>L'intelligence artificielle n'a pas pu traiter la demande ou le serveur est inaccessible.</p>";
                }
                document.getElementById("recipeCard").classList.add("show");
            } finally {
                btnGenerate.disabled = false;
                btnGenerate.innerText = "Cuisiner 🚀";
                document.getElementById("loading-display").classList.add("hidden-mode");
            }
        });
    }
});

// --- 8. LE MOTEUR DE RENDU INTERACTIF DOUBLE COLONNE MR. COOK ---
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
    
    // Remplissage des Context Pills avec les variables globales
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
            li.addEventListener('click', (e) => {
                li.classList.toggle('checked-item');
            });
        });
    }

    const stepsList = document.getElementById("stepsList");
    if (stepsList && data.steps) {
        if (Array.isArray(data.steps)) {
            stepsList.innerHTML = data.steps.map((step, idx) => `<p><strong>Étape ${idx + 1} :</strong> ${step}</p>`).join('');
            stepsList.querySelectorAll('p').forEach(p => {
                p.addEventListener('click', () => {
                    p.classList.toggle('checked-step');
                });
            });
        } else {
            stepsList.innerHTML = `<p>${data.steps}</p>`;
        }
    }

    document.getElementById("recipeCard").classList.add("show");
};
