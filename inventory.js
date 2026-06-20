// inventory.js
const BACKEND_URL = "https://alexoff59.pythonanywhere.com";
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
            const category = input.dataset.category;

            const toggleId = (category === "base" || category === "protein" || category === "vegetable") ? "t-slots" : "t-ing";
            const toggle = document.getElementById(toggleId);
            if (toggle && !toggle.checked) return;

            if (query.length < 2) {
                autocompleteList.classList.add("hidden-mode");
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    // CORRECTION TECHNIQUE : Ajout de BACKEND_URL pour interroger PythonAnywhere
                    const response = await fetch(`${BACKEND_URL}/api/ingredients?q=${encodeURIComponent(query)}`);
                    if (!response.ok) return;
                    
                    const data = await response.json();
                    autocompleteList.innerHTML = "";

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

                    autocompleteList.style.top = `${input.offsetTop + input.offsetHeight}px`;
                    autocompleteList.classList.remove("hidden-mode");

                } catch (err) {
                    console.error("Erreur lors de l'appel d'autocomplétion :", err);
                }
            }, 200);
        });
    });

    document.addEventListener("click", (e) => {
        if (currentActiveInput && e.target !== currentActiveInput) {
            autocompleteList.classList.add("hidden-mode");
        }
    });

    function injectIngredientTag(name, category) {
        if (window.selectedIngredients[category].has(name)) return;
        window.selectedIngredients[category].add(name);

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
        
        chip.querySelector('span').addEventListener('click', (e) => {
            const targetName = e.target.dataset.name;
            const targetCat = e.target.dataset.cat;
            window.selectedIngredients[targetCat].delete(targetName);
            chip.remove();
        });

        container.appendChild(chip);
    }
});
