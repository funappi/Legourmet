// main.js - Version Fusionnée (Fonctionnalités V2 + Architecture V1)
window.activeRecipePack = null;
window.currentSelectedVariant = "original";
window.currentPortions = 1;

window.currentHardware = "Aucun";
window.currentComplex = "Amateur";
window.currentRisk = "Original";

// Mémoire locale
let favorisRecettes = JSON.parse(localStorage.getItem("lg_favs") || "[]");

document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. UI & MENUS ---
    const appContainer = document.getElementById("mainAppContainer");
    const burgerToggle = document.getElementById("burger-toggle");
    const closeSidebarBtn = document.getElementById("close-sidebar-btn");
    
    if (burgerToggle && appContainer) {
        burgerToggle.addEventListener("click", () => {
            appContainer.classList.remove("sidebar-collapsed");
        });
    }
    
    if (closeSidebarBtn && appContainer) {
        closeSidebarBtn.addEventListener("click", () => {
            appContainer.classList.add("sidebar-collapsed");
        });
    }

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
        });
    }

    // --- 2. TOGGLES & CATÉGORIES ---
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

    // --- 3. SÉLECTIONS DES CARDS ---
    document.querySelectorAll('.equip-card').forEach(card => {
        card.addEventListener('click', () => {
            const equipContainer = document.getElementById('c-equip');
            if (equipContainer && !equipContainer.classList.contains('disabled')) {
                card.classList.toggle('active');
            }
        });
    });

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

    // --- 4. SLIDERS ---
    const riskLevels = { "1": "Classique", "2": "Original", "3": "Aventure" };
    const timeLevels = { "1": "Fast Food", "2": "Amateur", "3": "Guide Michelin" };
    
    document.getElementById('slider-risk')?.addEventListener('input', (e) => {
        document.getElementById('risk-val').innerText = riskLevels[e.target.value];
    });
    
    document.getElementById('slider-time')?.addEventListener('input', (e) => {
        document.getElementById('time-val').innerText = timeLevels[e.target.value];
    });

    // --- 5. ONGLETS DE VARIATIONS & PORTIONS ---
    document.querySelectorAll(".var-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            if (!window.activeRecipePack) return;
            document.querySelectorAll(".var-tab").forEach(t => t.classList.remove("active-variant"));
            tab.classList.add("active-variant");
            window.currentSelectedVariant = tab.dataset.variant;
            window.renderSelectedVariant(window.currentSelectedVariant);
        });
    });

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

    // --- 6. GESTION DU MENU MULTI-FUSION (Issue de la V2) ---
    document.getElementById("add-fusion-btn")?.addEventListener("click", () => {
        const fusionList = document.getElementById("fusion-list");
        if (fusionList && fusionList.children.length < 4) { // Bride de sécurité à 4
            const newRow = document.createElement("div");
            newRow.className = "fusion-row";
            newRow.style.cssText = "display: flex; gap: 10px; align-items: center; margin-top: 10px;";
            
            const originalSelect = fusionList.querySelector('.fusion-select');
            const selectClone = originalSelect.cloneNode(true);
            selectClone.value = ""; 
            
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "remove-fusion-btn";
            deleteBtn.innerHTML = "✕";
            deleteBtn.title = "Supprimer";
            deleteBtn.onclick = () => newRow.remove();

            newRow.appendChild(selectClone);
            newRow.appendChild(deleteBtn);
            fusionList.appendChild(newRow);
        }
    });

    // --- 7. MOTEUR DE GÉNÉRATION & PAYLOAD ---
    const btnGenerate = document.getElementById("btn-generate");
    const loadingDisplay = document.getElementById("loading-display");
    const loadingText = loadingDisplay?.querySelector("h2");
    const ideasModal = document.getElementById("ideas-modal-overlay");
    const ideasContainer = document.getElementById("ideas-container");

    function getFormPayload() {
        const hardware = [];
        document.querySelectorAll('.equip-card.active').forEach(el => hardware.push(el.getAttribute('data-equip')));

        const hasIngredients = document.getElementById('t-ing')?.checked && window.selectedIngredients && window.selectedIngredients.base?.size > 0;
        let ingredientsPack = hasIngredients ? Array.from(window.selectedIngredients.base) : ["Auto_FoodPairing"];

        const fusionSelects = document.querySelectorAll('.fusion-select');
        const fusionValues = [];
        fusionSelects.forEach(select => {
            if(select.value && select.value !== "") fusionValues.push(select.value);
        });
        const fusionString = fusionValues.length > 0 ? fusionValues.join(" + ") : "Auto_FoodPairing";

        const riskVal = document.getElementById('risk-val');
        const timeVal = document.getElementById('time-val');

        window.currentHardware = document.getElementById('t-equip')?.checked && hardware.length > 0 ? hardware.join(', ') : "Libre";
        window.currentComplex = document.getElementById('t-sliders')?.checked && timeVal ? timeVal.innerText : "Amateur";
        window.currentRisk = document.getElementById('t-sliders')?.checked && riskVal ? riskVal.innerText : "Original";

        const inspiration = document.getElementById("simple-prompt-input")?.value.trim();

        // Directive avancée (V2)
        let levelPromptSystem = hasIngredients 
            ? "INSTRUCTION STRICTE : Tu DOIS construire une recette réaliste centrée sur les ingrédients fournis par l'utilisateur. Ne rajoute aucun ingrédient central majeur non listé."
            : "INSTRUCTION CRÉATIVE : Tu es un chef créatif libre d'imaginer le meilleur plat possible.";

        if (inspiration && inspiration.length > 0) {
            levelPromptSystem += `\n🚨 PRIORITÉ ABSOLUE (INSPIRATION) : L'utilisateur a demandé : "${inspiration}". La recette DOIT obligatoirement répondre à ce besoin précis.`;
        }

        if (fusionString !== "Auto_FoodPairing") {
            levelPromptSystem += `\n🌍 FUSION GÉOGRAPHIQUE : La recette s'inspire de ces régions : ${fusionString}. INSTRUCTION CRUCIALE : Tu DOIS obligatoirement intégrer 2 à 3 ingrédients phares emblématiques de ces zones.`;
        }

        if (window.currentComplex === "Fast Food") {
            levelPromptSystem += " Agis en chef street-food (rapide, moins de 20 min).";
        } else if (window.currentComplex === "Guide Michelin") {
            levelPromptSystem += " Agis en chef étoilé (techniques complexes, dressage pro).";
        } else {
            levelPromptSystem += " Agis en chef passionné (convivial, clair).";
        }

        const activeDietCard = document.querySelector('.diet-card.active');
        const activeStyleCard = document.querySelector('.style-card.active');

        return {
            mode: "Avancé",
            simple_prompt: inspiration || "Repas surprise",
            ingredients: ingredientsPack,
            fusion: fusionString,
            equipment: document.getElementById("t-equip")?.checked && hardware.length > 0 ? hardware : ["Auto_FoodPairing"],
            risk: window.currentRisk,
            time: window.currentComplex,
            chef_instruction_directive: levelPromptSystem,
            diet_profile: document.getElementById('t-diet')?.checked ? (activeDietCard ? activeDietCard.dataset.diet : "Aucun") : "Aucun",
            cooking_style: document.getElementById('t-diet')?.checked ? (activeStyleCard ? activeStyleCard.dataset.style : "Libre") : "Libre"
        };
    }

    async function fetchIdeas() {
        if (!btnGenerate) return;
        btnGenerate.disabled = true;
        btnGenerate.innerText = "Recherche d'inspirations...";
        
        document.getElementById("recipeCard").classList.remove("show");
        document.getElementById("variationTabsZone").style.display = "none";
        
        const btnFavStar = document.getElementById("btn-favorite-recipe");
        if (btnFavStar) btnFavStar.style.display = "none";
        
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
                
                if (loadingDisplay) { 
                    loadingDisplay.classList.add("hidden-mode"); 
                    loadingDisplay.style.display = "none"; 
                }
                
                if (appContainer) appContainer.classList.add("sidebar-collapsed");
                ideasModal?.classList.remove("hidden-mode");
            }
        } catch (err) {
            console.error(err);
            if (loadingDisplay) { 
                loadingDisplay.classList.add("hidden-mode"); 
                loadingDisplay.style.display = "none"; 
            }
            alert("⚠️ Le Chef a confondu le câble réseau avec un spaghetti ! Veuillez réessayer.");
        } finally {
            btnGenerate.disabled = false;
            btnGenerate.innerText = "Cuisiner 🚀";
        }
    }

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

            if (appContainer) appContainer.classList.add("sidebar-collapsed");

        } catch (err) {
            console.error(err);
            document.getElementById("recipeTitle").innerText = "🔥 En chasse après les ingrédients";
            const stepsList = document.getElementById("stepsList");
            if (stepsList) {
                stepsList.innerHTML = `<p><strong>🚨 Alerte en cuisine :</strong> Le Chef court après un poulet. Reclique sur Cuisiner !</p>`;
            }
            document.getElementById("recipeCard").classList.add("show");
        } finally {
            if (loadingDisplay) { 
                loadingDisplay.classList.add("hidden-mode"); 
                loadingDisplay.style.display = "none"; 
            }
        }
    }

    if (btnGenerate) btnGenerate.addEventListener("click", fetchIdeas);
    
    document.getElementById("close-modal-btn")?.addEventListener("click", () => { 
        ideasModal?.classList.add("hidden-mode"); 
        if (appContainer) appContainer.classList.remove("sidebar-collapsed"); 
    });
    
    document.getElementById("retry-ideas-btn")?.addEventListener("click", () => { 
        ideasModal?.classList.add("hidden-mode"); 
        if (appContainer) appContainer.classList.remove("sidebar-collapsed"); 
        fetchIdeas(); 
    });

    // --- 8. FAVORIS ---
    const favModal = document.getElementById("favorites-modal-overlay");
    const btnOpenFavs = document.getElementById("btn-open-favorites");
    const closeFavModalBtn = document.getElementById("close-fav-modal-btn");
    const favsContainer = document.getElementById("favorites-container");

    function renderFavoritesModal() {
        if (!favsContainer) return;
        favsContainer.innerHTML = "";
        
        if (favorisRecettes.length === 0) { 
            favsContainer.innerHTML = "<p style='color: var(--text-muted); text-align: center; padding: 20px;'>Aucune recette en favori.</p>"; 
            return; 
        }

        favorisRecettes.forEach((fav, index) => {
            const card = document.createElement("div"); 
            card.className = "idea-card"; 
            card.style.flexDirection = "row"; 
            card.style.justifyContent = "space-between"; 
            card.style.alignItems = "center";
            
            const titleSpan = document.createElement("h4"); 
            titleSpan.innerText = fav.title; 
            titleSpan.style.margin = "0"; 
            titleSpan.style.flex = "1";
            
            const actionDiv = document.createElement("div"); 
            actionDiv.style.display = "flex"; 
            actionDiv.style.gap = "10px";

            const btnLoad = document.createElement("button"); 
            btnLoad.innerText = "Cuisiner"; 
            btnLoad.className = "control-btn"; 
            btnLoad.style.borderColor = "var(--healthy-color)"; 
            btnLoad.style.color = "var(--healthy-color)";
            btnLoad.onclick = (e) => { 
                e.stopPropagation(); 
                loadFavoriteRecipe(fav); 
            };

            const btnDelete = document.createElement("button"); 
            btnDelete.innerText = "✖"; 
            btnDelete.className = "control-btn"; 
            btnDelete.style.borderColor = "var(--accent)"; 
            btnDelete.style.color = "var(--accent)";
            btnDelete.onclick = (e) => {
                e.stopPropagation(); 
                favorisRecettes.splice(index, 1); 
                localStorage.setItem("lg_favs", JSON.stringify(favorisRecettes)); 
                renderFavoritesModal(); 
                
                if (window.activeRecipePack && window.activeRecipePack.original.title === fav.title) {
                    const btnFavStar = document.getElementById("btn-favorite-recipe");
                    if (btnFavStar) { 
                        btnFavStar.innerHTML = "☆"; 
                        btnFavStar.classList.remove("is-favorite"); 
                    }
                }
            };
            
            actionDiv.appendChild(btnLoad); 
            actionDiv.appendChild(btnDelete); 
            card.appendChild(titleSpan); 
            card.appendChild(actionDiv); 
            favsContainer.appendChild(card);
        });
    }

    if (btnOpenFavs) {
        btnOpenFavs.addEventListener("click", () => { 
            renderFavoritesModal(); 
            if(favModal) favModal.classList.remove("hidden-mode"); 
        });
    }
    
    if (closeFavModalBtn) {
        closeFavModalBtn.addEventListener("click", () => { 
            if(favModal) favModal.classList.add("hidden-mode"); 
        });
    }

    function loadFavoriteRecipe(favObj) {
        window.activeRecipePack = favObj.pack; 
        window.currentPortions = 1;
        
        const portionDisplay = document.getElementById("portion-display"); 
        if (portionDisplay) portionDisplay.innerText = "1";
        
        document.getElementById("variationTabsZone").style.display = "flex";
        
        if (favModal) favModal.classList.add("hidden-mode");
        
        const origTab = document.querySelector('[data-variant="original"]'); 
        if (origTab) origTab.click();
        
        if (appContainer) appContainer.classList.add("sidebar-collapsed");
    }

    const btnFavStar = document.getElementById("btn-favorite-recipe");
    if (btnFavStar) {
        btnFavStar.addEventListener("click", () => {
            if (!window.activeRecipePack) return;
            const currentTitle = document.getElementById("recipeTitle").innerText;
            const index = favorisRecettes.findIndex(fav => fav.title === currentTitle);
            
            if (index > -1) { 
                favorisRecettes.splice(index, 1); 
                btnFavStar.innerHTML = "☆"; 
                btnFavStar.classList.remove("is-favorite"); 
            } else { 
                favorisRecettes.push({ title: currentTitle, pack: window.activeRecipePack }); 
                btnFavStar.innerHTML = "★"; 
                btnFavStar.classList.add("is-favorite"); 
            }
            
            localStorage.setItem("lg_favs", JSON.stringify(favorisRecettes));
        });
    }

    // --- 9. EXPORTS ET SCREENSHOT ---
    const btnShareScreenshot = document.getElementById("btn-share-screenshot");
    if (btnShareScreenshot) {
        btnShareScreenshot.addEventListener("click", async () => {
            const recipeCard = document.getElementById("recipeCard"); 
            if (!recipeCard || !window.activeRecipePack) return;
            
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
                        await navigator.share({ 
                            files: [file], 
                            title: "Ma recette Le Gourmet 🍳", 
                            text: "Je partage ma recette!" 
                        });
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

    const btnExportNotes = document.getElementById("btn-export-notes");
    if (btnExportNotes) {
        btnExportNotes.addEventListener("click", async () => {
            if (!window.activeRecipePack) return;
            
            const data = window.activeRecipePack[window.currentSelectedVariant]; 
            if (!data) return;
            
            let textOutput = `🛒 LISTE DE COURSES : ${data.title.toUpperCase()}\nPour ${window.currentPortions} personne(s)\n\n`;
            
            data.ingredients.forEach(ing => { 
                textOutput += `- [ ] ${(parseFloat(ing.qty) * window.currentPortions).toFixed(1).replace('.0', '')} ${ing.unit} ${ing.name}\n`; 
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
});

// --- 10. MOTEUR DE RENDU INTERACTIF ---
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
        const placeholder = document.getElementById("plate-placeholder"); 
        if(placeholder) placeholder.style.display = "none"; 
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
        ingList.innerHTML = data.ingredients.map(ing => `<li><div class="custom-checkbox"></div> <label><strong>${(parseFloat(ing.qty) * window.currentPortions).toFixed(1).replace('.0', '')} ${ing.unit}</strong> ${ing.name}</label></li>`).join('');
        ingList.querySelectorAll('li').forEach(li => li.addEventListener('click', () => li.classList.toggle('checked-item')));
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

    const btnFavStar = document.getElementById("btn-favorite-recipe");
    if (btnFavStar) {
        btnFavStar.style.display = "inline-block";
        if (favorisRecettes.some(fav => fav.title === data.title)) { 
            btnFavStar.innerHTML = "★"; 
            btnFavStar.classList.add("is-favorite"); 
        } else { 
            btnFavStar.innerHTML = "☆"; 
            btnFavStar.classList.remove("is-favorite"); 
        }
    }
    document.getElementById("recipeCard").classList.add("show");
};