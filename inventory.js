const BACKEND_URL = "https://Alexoff59.pythonanywhere.com"; // Remplacer VOTRE_PSEUDO une fois le compte créé

window.selectedIngredients = {
    base: new Set(),
    protein: new Set(),
    vegetable: new Set(),
    "anti-gaspi": new Set()
};

document.addEventListener("DOMContentLoaded", () => {
    const inputs = document.querySelectorAll(".ingredient-autocomplete-input");
    const autocompleteList = document.getElementById("autocomplete-list");
    let debounceTimer = null;
    let currentActiveInput = null;

    if (inputs.length === 0 || !autocompleteList) {
        console.warn("Éléments de l'inventaire ou liste d'autocomplétion manquants dans le DOM.");
        return;
    }

    // Écoute universelle de toutes les barres de saisie à autocomplétion
    inputs.forEach(input => {
        input.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            autocompleteList.innerHTML = "";
            currentActiveInput = input;
            
            const query = e.target.value.trim();
            const category = input.dataset.category;

            // RÈGLE D'OR INTERRUPTEURS : Bloquer la recherche si l'interrupteur parent est OFF
            const toggleId = (category === "base" || category === "protein" || category === "vegetable") ? "t-slots" : "t-ing";
            const toggle = document.getElementById(toggleId);
            if (toggle && !toggle.checked) return;

            if (query.length < 2) {
                autocompleteList.classList.add("hidden-mode");
                return;
            }

            // Anti-rebond (Debounce) pour optimiser les performances de requêtage
            debounceTimer = setTimeout(async () => {
                try {
                    // Appel à votre API locale SQLite alimentée par vos tables d'ingrédients premium
                    const response = await fetch(`/api/ingredients?q=${encodeURIComponent(query)}`);
                    if (!response.ok) return;
                    
                    const data = await response.json();
                    autocompleteList.innerHTML = "";

                    // GESTION ADAPTATIVE (CODE 2) : Si la BDD locale ne contient pas l'élément
                    if (data.length === 0) {
                        const li = document.createElement("li");
                        li.innerText = `Ajouter le tag libre : "${query}"`;
                        li.addEventListener("click", () => {
                            injectIngredientTag(query, category);
                            input.value = "";
                            autocompleteList.classList.add("hidden-mode");
                        });
                        autocompleteList.appendChild(li);
                    } else {
                        // Sinon, on boucle sur les correspondances de la base SQLite
                        data.forEach(item => {
                            const li = document.createElement("li");
                            li.innerText = `${item.nom} [${item.categorie}]`;
                            li.addEventListener("click", () => {
                                injectIngredientTag(item.nom, category);
                                input.value = "";
                                autocompleteList.classList.add("hidden-mode");
                            });
                            autocompleteList.appendChild(li);
                        });
                    }

                    // Positionnement dynamique absolu de la liste déroulante juste sous l'input actif
                    autocompleteList.style.top = `${input.offsetTop + input.offsetHeight}px`;
                    autocompleteList.classList.remove("hidden-mode");

                } catch (err) {
                    console.error("Erreur lors de l'appel d'autocomplétion :", err);
                }
            }, 200); // Temporisation de 200ms
        });
    });

    // Masquage automatique de la liste en cas de clic en dehors de la zone active
    document.addEventListener("click", (e) => {
        if (currentActiveInput && e.target !== currentActiveInput) {
            autocompleteList.classList.add("hidden-mode");
        }
    });

    // Moteur d'injection et de ciblage des puces (Tags) par conteneur dédié
    function injectIngredientTag(name, category) {
        if (window.selectedIngredients[category].has(name)) return;
        window.selectedIngredients[category].add(name);

        // Mapping dynamique des conteneurs de destination HTML
        const containerMap = {
            "base": "tags-base-container",
            "protein": "tags-protein-container",
            "vegetable": "tags-vegetable-container",
            "anti-gaspi": "tags-antigaspi-container"
        };
        
        const container = document.getElementById(containerMap[category]);
        if (!container) return;

        const chip = document.createElement("div");
        chip.className = "tag";
        chip.innerHTML = `${name} <span data-name="${name}" data-cat="${category}">✖</span>`;
        
        // Suppression unitaire du tag
        chip.querySelector('span').addEventListener('click', (e) => {
            const targetName = e.target.dataset.name;
            const targetCat = e.target.dataset.cat;
            window.selectedIngredients[targetCat].delete(targetName);
            chip.remove();
        });

        container.appendChild(chip);
    }
});