const BACKEND_URL = "https://Alexoff59.pythonanywhere.com";

// Structure unifiée sous forme de Set unique pour le champ d'ingrédients global
window.selectedIngredients = new Set();

// Dictionnaire local premium embarqué (pour combler les manques ou pannes de la BDD)
const LOCAL_INGREDIENTS_DB = [
    { nom: "Pâtes", categorie: "Féculent" },
    { nom: "Poulet (Filet)", categorie: "Protéine" },
    { nom: "Œuf", categorie: "Protéine" },
    { nom: "Crème fraîche", categorie: "Produit Laitier" },
    { nom: "Riz Basmati", categorie: "Féculent" },
    { nom: "Saumon (Pavé)", categorie: "Protéine" },
    { nom: "Pomme de terre", categorie: "Féculent" },
    { nom: "Oignon rouge", categorie: "Légume" },
    { nom: "Ail", categorie: "Aromate" },
    { nom: "Avocat", categorie: "Légume" },
    { nom: "Tomate cerise", categorie: "Légume" },
    { nom: "Bœuf (Haché)", categorie: "Protéine" },
    { nom: "Lait de coco", categorie: "Produit Laitier" },
    { nom: "Champignons de Paris", categorie: "Légume" },
    { nom: "Mozzarella di Bufala", categorie: "Produit Laitier" },
    { nom: "Parmigiano Reggiano", categorie: "Produit Laitier" },
    { nom: "Quinoa", categorie: "Féculent" },
    { nom: "Huile d'olive", categorie: "Sauce" },
    { nom: "Beurre", categorie: "Produit Laitier" },
    { nom: "Citron jaune", categorie: "Légume" },
    { nom: "Crevettes", categorie: "Protéine" },
    { nom: "Courgette", categorie: "Légume" },
    { nom: "Carotte", categorie: "Légume" },
    { nom: "Épinards frais", categorie: "Légume" },
    { nom: "Thon en boîte", categorie: "Protéine" },
    { nom: "Lardons", categorie: "Protéine" },
    { nom: "Miel", categorie: "Aromate" },
    { nom: "Sauce soja sucrée", categorie: "Sauce" },
    { nom: "Sauce soja salée", categorie: "Sauce" },
    { nom: "Farine de blé", categorie: "Féculent" },
    { nom: "Chocolat noir", categorie: "Aromate" }
];

/**
 * Nettoie une chaîne de caractères : retire les accents, passe en minuscules,
 * et convertit les caractères spéciaux comme 'œ' pour une correspondance parfaite.
 */
function normalizeString(str) {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Supprime les diacritiques (accents)
        .toLowerCase()
        .replace(/œ/g, "oe")
        .trim();
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.querySelector(".ingredient-autocomplete-input");
    const autocompleteList = document.getElementById("autocomplete-list");
    let debounceTimer = null;

    if (!input || !autocompleteList) {
        console.warn("Éléments de l'inventaire ou liste d'autocomplétion manquants dans le DOM.");
        return;
    }

    // Écoute de la saisie utilisateur
    input.addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        autocompleteList.innerHTML = "";
        
        const query = e.target.value.trim();

        // RÈGLE D'OR INTERRUPTEURS : Bloquer si l'interrupteur Ingrédients (t-ing) est OFF
        const toggle = document.getElementById("t-ing");
        if (toggle && !toggle.checked) return;

        if (query.length < 2) {
            autocompleteList.classList.add("hidden-mode");
            return;
        }

        // Anti-rebond (Debounce) optimisé à 200ms
        debounceTimer = setTimeout(async () => {
            try {
                const cleanedQuery = normalizeString(query);
                let matches = [];

                // 1. Filtrage sans accent depuis notre dictionnaire local enrichi
                matches = LOCAL_INGREDIENTS_DB.filter(item => 
                    normalizeString(item.nom).includes(cleanedQuery)
                );

                // 2. Requêtage de secours sur votre API SQLite distante
                try {
                    const response = await fetch(`${BACKEND_URL}/api/ingredients?q=${encodeURIComponent(query)}`);
                    if (response.ok) {
                        const apiData = await response.json();
                        apiData.forEach(apiItem => {
                            // Évite d'ajouter des doublons si déjà trouvé localement
                            const exists = matches.some(m => normalizeString(m.nom) === normalizeString(apiItem.nom));
                            if (!exists) {
                                matches.push({ nom: apiItem.nom, categorie: apiItem.categorie || "Épicerie" });
                            }
                        });
                    }
                } catch (apiErr) {
                    // En cas de problème réseau avec l'API, le catalogue local prend le relais de manière transparente
                    console.log("Mode dégradé : utilisation exclusive du catalogue local.");
                }

                autocompleteList.innerHTML = "";

                // GESTION ADAPTATIVE : Si aucune correspondance n'est validée dans les catalogues
                if (matches.length === 0) {
                    const li = document.createElement("li");
                    li.innerText = `Ajouter le tag libre : "${query}"`;
                    li.addEventListener("click", () => {
                        injectIngredientTag(query);
                        input.value = "";
                        autocompleteList.classList.add("hidden-mode");
                    });
                    autocompleteList.appendChild(li);
                } else {
                    // Boucle de rendu sur les suggestions filtrées
                    matches.forEach(item => {
                        const li = document.createElement("li");
                        li.innerText = `${item.nom} [${item.categorie}]`;
                        li.addEventListener("click", () => {
                            injectIngredientTag(item.nom);
                            input.value = "";
                            autocompleteList.classList.add("hidden-mode");
                        });
                        autocompleteList.appendChild(li);
                    });
                }

                // Positionnement dynamique absolu sous la barre de saisie unique
                autocompleteList.style.top = `${input.offsetTop + input.offsetHeight}px`;
                autocompleteList.classList.remove("hidden-mode");

            } catch (err) {
                console.error("Erreur lors de l'autocomplétion :", err);
            }
        }, 200);
    });

    // Masquage automatique de la liste lors d'un clic à l'extérieur
    document.addEventListener("click", (e) => {
        if (e.target !== input) {
            autocompleteList.classList.add("hidden-mode");
        }
    });

    // Moteur d'injection et de création des puces graphiques (Tags)
    function injectIngredientTag(name) {
        if (window.selectedIngredients.has(name)) return;
        window.selectedIngredients.add(name);

        const container = document.getElementById("tags-ingredients-container");
        if (!container) return;

        const chip = document.createElement("div");
        chip.className = "tag";
        chip.innerHTML = `${name} <span data-name="${name}">✖</span>`;
        
        // Suppression unitaire du tag au clic sur la croix
        chip.querySelector('span').addEventListener('click', (e) => {
            const targetName = e.target.dataset.name;
            window.selectedIngredients.delete(targetName);
            chip.remove();
        });

        container.appendChild(chip);
    }
});
