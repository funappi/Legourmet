// --- 9. LA NOUVELLE LOGIQUE EN 2 ÉTAPES (IDÉES -> RECETTE) ---
    const btnGenerate = document.getElementById("btn-generate");
    const loadingDisplay = document.getElementById("loading-display");
    const loadingText = loadingDisplay?.querySelector("h2");
    const ideasModal = document.getElementById("ideas-modal-overlay");
    const ideasContainer = document.getElementById("ideas-container");

    // Fonction utilitaire pour récupérer tout le contexte de la page
    function getFormPayload() {
        const hardware = [];
        document.querySelectorAll('.equip-card.active').forEach(el => hardware.push(el.getAttribute('data-equip')));

        let ingredientsPack = [];
        if (document.getElementById('t-ing')?.checked) {
            ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients["anti-gaspi"]));
        }
        if (document.getElementById('t-slots')?.checked) {
            ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.base));
            ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.protein));
            ingredientsPack = ingredientsPack.concat(Array.from(window.selectedIngredients.vegetable));
        }

        const riskVal = document.getElementById('risk-val');
        const timeVal = document.getElementById('time-val');
        const flavorResult = document.getElementById('flavor-result');

        currentHardware = document.getElementById('t-equip')?.checked && hardware.length > 0 ? hardware.join(', ') : "Libre";
        currentComplex = document.getElementById('t-sliders')?.checked && timeVal ? timeVal.innerText : "Amateur";
        currentRisk = document.getElementById('t-sliders')?.checked && riskVal ? riskVal.innerText : "Original";

        return {
            mode: isAdvanced ? "Avancé" : "Simple",
            simple_prompt: !isAdvanced ? (document.getElementById("simple-prompt-input")?.value || "Repas surprise du chef") : "Auto_FoodPairing",
            ingredients: isAdvanced ? (ingredientsPack.length > 0 ? ingredientsPack : ["Auto_FoodPairing"]) : ["Auto_FoodPairing"],
            equipment: isAdvanced ? (document.getElementById("t-equip").checked && hardware.length > 0 ? hardware : ["Auto_FoodPairing"]) : ["Auto_FoodPairing"],
            risk: isAdvanced ? (document.getElementById("t-sliders").checked && riskVal ? riskVal.innerText : "Auto_FoodPairing") : "Auto_FoodPairing",
            time: isAdvanced ? (document.getElementById("t-sliders").checked && timeVal ? timeVal.innerText : "Auto_FoodPairing") : "Auto_FoodPairing",
            flavor: isAdvanced ? (document.getElementById("t-flavor").checked && flavorResult ? flavorResult.innerText : "Auto_FoodPairing") : "Auto_FoodPairing"
        };
    }

    // ÉTAPE 1 : Demande des 3 Idées
    async function fetchIdeas() {
        btnGenerate.disabled = true;
        btnGenerate.innerText = "Recherche d'inspirations...";
        document.getElementById("recipeCard").classList.remove("show");
        document.getElementById("variationTabsZone").style.display = "none";
        
        if (loadingText) loadingText.innerText = "Recherche de 3 idées de plats...";
        loadingDisplay.classList.remove("hidden-mode");

        const payload = getFormPayload();

        try {
            const response = await fetch(`${BACKEND_URL}/generate-ideas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Erreur génération idées");
            const data = await response.json();

            // Construction de la fenêtre modale
            ideasContainer.innerHTML = "";
            if (data.ideas && data.ideas.length > 0) {
                data.ideas.forEach(idea => {
                    const card = document.createElement("div");
                    card.className = "idea-card";
                    card.innerHTML = `<h4>${idea.title}</h4><p>${idea.description}</p>`;
                    
                    // Quand on clique sur une idée, on lance l'Étape 2
                    card.addEventListener("click", () => fetchFullRecipe(idea.title));
                    ideasContainer.appendChild(card);
                });
                
                loadingDisplay.classList.add("hidden-mode");
                ideasModal.classList.remove("hidden-mode");
            }
        } catch (err) {
            console.error(err);
            loadingDisplay.classList.add("hidden-mode");
            alert("Erreur de connexion. Veuillez réessayer.");
        } finally {
            btnGenerate.disabled = false;
            btnGenerate.innerText = "Cuisiner 🚀";
        }
    }

    // ÉTAPE 2 : Demande de la recette complète basée sur le choix
    async function fetchFullRecipe(selectedTitle) {
        ideasModal.classList.add("hidden-mode");
        if (loadingText) loadingText.innerText = "Le Chef élabore vos sauces et techniques...";
        loadingDisplay.classList.remove("hidden-mode");

        const payload = getFormPayload();
        payload.selected_idea = selectedTitle; // Ajout du choix dans le payload

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
            document.getElementById("recipeCard").classList.add("show");
        } finally {
            loadingDisplay.classList.add("hidden-mode");
        }
    }

    // Écouteurs des boutons
    if (btnGenerate) btnGenerate.addEventListener("click", fetchIdeas);
    
    document.getElementById("close-modal-btn")?.addEventListener("click", () => {
        ideasModal.classList.add("hidden-mode");
    });
    
    document.getElementById("retry-ideas-btn")?.addEventListener("click", () => {
        ideasModal.classList.add("hidden-mode");
        fetchIdeas();
    });
});
