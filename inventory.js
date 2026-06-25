// inventory.js
const BACKEND_URL = "https://alexoff59.pythonanywhere.com";

// Initialisation globale avec toutes les catégories requises
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

    inputs.forEach(input => {
        input.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            autocompleteList.innerHTML = "";
            currentActiveInput = input;
            
            const query = e.target.value.trim();
            // Récupération stricte de la catégorie avec repli par défaut
            const category = input.dataset.category || "base";

            // Vérification de l'état des Toggles
            const toggleId = (category === "base" || category === "protein" || category === "vegetable") ? "t-slots" : "t-ing";
            const toggle = document.getElementById(toggleId);
            if (toggle && !toggle.checked) return;

            // Déclenchement à partir de 2 caractères minimum
            if (query.length < 2) {
                autocompleteList.classList.add("hidden-mode");
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const response = await fetch(`${BACKEND_URL}/api/ingredients?q=${encodeURIComponent(query)}`);
                    if (!response.ok) return;
                    
                    const data = await response.json();
                    autocompleteList.innerHTML = "";

                    if (data.length === 0) {
                        // Cas 1 : Création d'un tag libre
                        const li = document.createElement("li");
                        li.innerText = `Ajouter le tag libre : "${query}"`;
                        li.addEventListener("click", () => {
                            injectIngredientTag(query, category);
                            input.value = "";
                            autocompleteList.classList.add("hidden-mode");
                            input.focus(); // Confort UX
                        });
                        autocompleteList.appendChild(li);
                    } else {
                        // Cas 2 : Suggestions depuis l'API avec affichage de la catégorie source
                        data.forEach(item => {
                            const li = document.createElement("li");
                            li.innerText = item.categorie ? `${item.nom} [${item.categorie}]` : `${item.nom}`;
                            li.addEventListener("click", () => {
                                injectIngredientTag(item.nom, category);
                                input.value = "";
                                autocompleteList.classList.add("hidden-mode");
                                input.focus(); // Confort UX
                            });
                            autocompleteList.appendChild(li);
                        });
                    }

                    // Positionnement intelligent via le wrapper parent s'il existe, sinon l'input
                    const wrapper = document.getElementById("ingredient-wrapper");
                    if (wrapper) {
                        autocompleteList.style.top = `${wrapper.offsetTop + wrapper.offsetHeight + 5}px`;
                    } else {
                        autocompleteList.style.top = `${input.offsetTop + input.offsetHeight}px`;
                    }
                    autocompleteList.classList.remove("hidden-mode");

                } catch (err) {
                    console.error("Erreur lors de l'appel d'autocomplétion :", err);
                }
            }, 200);
        });
    });

    // Fermeture de la liste d'autocomplétion si l'utilisateur clique ailleurs
    document.addEventListener("click", (e) => {
        if (currentActiveInput && e.target !== currentActiveInput) {
            autocompleteList.classList.add("hidden-mode");
        }
    });

    function injectIngredientTag(name, category) {
        // Initialisation de secours si la catégorie a été modifiée dans le DOM
        if (!window.selectedIngredients[category]) {
            window.selectedIngredients[category] = new Set();
        }
        
        // Empêche les doublons
        if (window.selectedIngredients[category].has(name)) return;
        window.selectedIngredients[category].add(name);

        // Définition stricte des conteneurs cibles
        const containerMap = {
            "base": "tags-base-container",
            "protein": "tags-protein-container",
            "vegetable": "tags-vegetable-container",
            "anti-gaspi": "tags-antigaspi-container"
        };
        
        let container = document.getElementById(containerMap[category]);
        
        // Fallback visuel si le conteneur spécifique n'est pas trouvé
        if (!container) {
            container = document.getElementById("tags-ingredients-container");
        }
        if (!container) return;

        // Création de l'élément HTML du Tag
        const chip = document.createElement("div");
        chip.className = "tag";
        chip.innerHTML = `${name} <span data-name="${name}" data-cat="${category}" title="Supprimer">✕</span>`;
        
        // Logique de suppression liée à la croix
        chip.querySelector('span').addEventListener('click', (e) => {
            const targetName = e.target.dataset.name;
            const targetCat = e.target.dataset.cat;
            if (window.selectedIngredients[targetCat]) {
                window.selectedIngredients[targetCat].delete(targetName);
            }
            chip.remove();
        });

        container.appendChild(chip);
    }
});