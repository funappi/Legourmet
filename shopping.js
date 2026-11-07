// ==========================================================================
// LISTE DE COURSES : fusionne les ingrédients de plusieurs recettes (planning, menu, recette seule),
// range par rayon, et gère « j'ai déjà » + un garde-manger mémorisé (localStorage).
// ==========================================================================
const Shopping = (() => {
    const PANTRY_KEY = "lg_pantry";
    const PANTRY_SUGGESTIONS = ["sel", "poivre", "huile d'olive", "huile", "farine", "sucre", "beurre", "oeuf", "ail", "oignon", "vinaigre", "moutarde"];

    const AISLES = [
        { id: "fruits", label: "🥬 Fruits & légumes", words: ["tomate", "carotte", "oignon", "echalote", "ail ", "pomme de terre", "patate", "courgette", "aubergine", "poivron", "salade", "laitue", "epinard", "champignon", "poireau", "chou", "brocoli", "concombre", "avocat", "citron", "orange", "pomme", "poire", "banane", "fraise", "framboise", "fruit", "mangue", "ananas", "peche", "abricot", "cerise", "raisin", "betterave", "radis", "celeri", "fenouil", "courge", "potiron", "butternut", "haricot vert", "petits pois", "mais", "basilic", "persil", "coriandre", "menthe", "ciboulette", "thym", "romarin", "gingembre", "legume", "roquette", "mache", "navet", "panais", "asperge", "artichaut", "myrtille", "kiwi", "figue", "melon", "pasteque", "prune", "noix de coco"] },
        { id: "viandes", label: "🥩 Viandes & poissons", words: ["poulet", "boeuf", "veau", "porc", "agneau", "dinde", "canard", "lardon", "jambon", "saucisse", "chorizo", "bacon", "steak", "viande", "hache", "filet", "magret", "saumon", "thon", "cabillaud", "colin", "crevette", "poisson", "moule", "gambas", "calamar", "sardine", "maquereau", "truite", "bar ", "dorade", "lotte", "coquille", "saint-jacques", "cuisse", "escalope", "cote", "gigot", "merguez", "boudin"] },
        { id: "frais", label: "🧀 Frais & crèmerie", words: ["lait", "creme", "beurre", "fromage", "yaourt", "yogourt", "skyr", "fromage blanc", "mozzarella", "parmesan", "gruyere", "comte", "emmental", "feta", "chevre", "mascarpone", "ricotta", "oeuf", "burrata", "cheddar", "reblochon", "camembert", "tofu", "tempeh"] },
        { id: "boulangerie", label: "🥖 Boulangerie", words: ["pain", "baguette", "brioche", "tortilla", "wrap", "pate feuilletee", "pate brisee", "pate a pizza", "croissant", "biscuit", "boudoir", "galette"] },
        { id: "epices", label: "🧂 Épices & condiments", words: ["sel", "poivre", "paprika", "cumin", "curcuma", "cannelle", "muscade", "piment", "curry", "origan", "herbes de provence", "vanille", "moutarde", "vinaigre", "sauce soja", "soja", "ketchup", "mayonnaise", "harissa", "tabasco", "sauce", "bouillon", "cube", "epice", "safran", "clou de girofle", "laurier", "sesame", "miel", "sirop"] },
        { id: "epicerie", label: "🥫 Épicerie", words: ["pate", "spaghetti", "tagliatelle", "penne", "riz", "semoule", "quinoa", "boulgour", "lentille", "pois chiche", "haricot", "farine", "sucre", "maizena", "levure", "chocolat", "cacao", "huile", "conserve", "coulis", "concentre", "noix", "amande", "noisette", "pistache", "cacahuete", "flocon", "avoine", "chapelure", "lait de coco", "creme de coco", "confiture", "nutella", "compote", "olive", "cornichon", "capre", "gelatine", "poudre", "eau", "vin", "biere", "alcool", "rhum", "cafe", "the "] }
    ];
    const OTHER = { id: "autres", label: "🛍️ Autres" };

    const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[’']/g, "'").trim();

    // Nettoie le nom pour comparer « Tomates cerises » et « tomate cerise » : minuscules, sans accents, sans article, sans pluriel
    function keyOf(name) {
        let t = norm(name).replace(/\(.*?\)/g, " ").replace(/^(de |du |des |d'|le |la |les |l'|un |une )+/, "");
        t = t.split(",")[0];
        t = t.replace(/\s+/g, " ").trim().split(" ").map(w => w.length > 3 ? w.replace(/(s|x)$/, "") : w).join(" ");
        return t;
    }

    const UNIT_CLASSES = [
        { cls: "mass", base: "g", test: /^(g|gr|gramme|grammes)$/, factor: 1 },
        { cls: "mass", base: "g", test: /^(kg|kilo|kilos)$/, factor: 1000 },
        { cls: "mass", base: "g", test: /^mg$/, factor: 0.001 },
        { cls: "vol", base: "ml", test: /^(ml)$/, factor: 1 },
        { cls: "vol", base: "ml", test: /^(cl)$/, factor: 10 },
        { cls: "vol", base: "ml", test: /^(dl)$/, factor: 100 },
        { cls: "vol", base: "ml", test: /^(l|litre|litres)$/, factor: 1000 },
        { cls: "cas", base: "c.à.s", test: /^(c\.?a\.?s\.?|cuillere a soupe|cuilleres a soupe|cs)$/, factor: 1 },
        { cls: "cac", base: "c.à.c", test: /^(c\.?a\.?c\.?|cuillere a cafe|cuilleres a cafe|cc)$/, factor: 1 },
        { cls: "pinch", base: "pincée", test: /^(pincee|pincees)$/, factor: 1 },
        { cls: "piece", base: "", test: /^(piece|pieces|u|unite|unites|)$/, factor: 1 }
    ];

    function classify(unit) {
        const u = norm(unit).replace(/\s+/g, " ");
        const hit = UNIT_CLASSES.find(c => c.test.test(u));
        if (hit) return hit;
        return { cls: "x:" + u, base: String(unit || "").trim(), factor: 1 };
    }

    function formatNumber(n) {
        const r = Math.round(n * 10) / 10;
        return String(r).replace(".", ",").replace(/,0$/, "");
    }
    function formatQty(cls, base, amount) {
        if (cls === "mass" && amount >= 1000) return `${formatNumber(amount / 1000)} kg`;
        if (cls === "vol" && amount >= 1000) return `${formatNumber(amount / 1000)} l`;
        if (cls === "mass" || cls === "vol") return `${formatNumber(Math.round(amount))} ${base}`;
        if (cls === "piece") return `${formatNumber(Math.ceil(amount - 0.001))}`;
        return `${formatNumber(amount)} ${base}`.trim();
    }

    // Mot entier (pluriel toléré) : « ail » ne doit pas matcher « taille »
    const wordHit = (text, word) => new RegExp("(^|[^a-z])" + word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s|x)?($|[^a-z])").test(text);
    function aisleOf(name) {
        const n = norm(name);
        if (/(lait|creme) de coco/.test(n)) return AISLES.find(a => a.id === "epicerie");
        for (const aisle of AISLES) {
            if (aisle.words.some(w => wordHit(n, w))) return aisle;
        }
        return OTHER;
    }

    // recipes : [{ title, recipe: {ingredients:[{name,qty,unit}]}, persons }]  =>  [{ key, name, parts:[{cls,base,amount}], from:[titres], aisle }]
    function merge(recipes) {
        const map = new Map();
        recipes.forEach(({ title, recipe, persons }) => {
            (recipe?.ingredients || []).forEach(ing => {
                const key = keyOf(ing.name);
                if (!key) return;
                const qty = parseFloat(String(ing.qty).replace(",", "."));
                const scale = Number.isFinite(qty) ? qty * (persons || 1) : 0;
                const u = classify(ing.unit);
                let item = map.get(key);
                if (!item) {
                    const raw = String(ing.name).trim();
                    item = { key, name: raw.charAt(0).toUpperCase() + raw.slice(1), parts: new Map(), from: new Set() };
                    map.set(key, item);
                }
                if (scale > 0) {
                    const prev = item.parts.get(u.cls) || { cls: u.cls, base: u.base, amount: 0 };
                    prev.amount += scale * u.factor;
                    item.parts.set(u.cls, prev);
                }
                if (title) item.from.add(title);
            });
        });
        return Array.from(map.values()).map(item => ({
            key: item.key, name: item.name,
            parts: Array.from(item.parts.values()),
            from: Array.from(item.from),
            aisle: aisleOf(item.name)
        }));
    }

    const qtyText = (item) => item.parts.map(p => formatQty(p.cls, p.base, p.amount)).filter(Boolean).join(" + ");

    // ---------- garde-manger ----------
    const readPantry = () => {
        try { const v = JSON.parse(localStorage.getItem(PANTRY_KEY) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.key && x.name) : []; }
        catch (e) { return []; }
    };
    const writePantry = (list) => { try { localStorage.setItem(PANTRY_KEY, JSON.stringify(list)); } catch (e) {} };
    const inPantry = (key) => readPantry().some(p => p.key === key);
    const addPantry = (name) => {
        const key = keyOf(name);
        if (!key) return;
        const list = readPantry();
        if (!list.some(p => p.key === key)) { list.push({ key, name: String(name).trim() }); writePantry(list); }
    };
    const removePantry = (key) => writePantry(readPantry().filter(p => p.key !== key));

    // ---------- fenêtre ----------
    let current = { title: "", subtitle: "", items: [], have: new Set(), source: [] };
    const $ = (id) => document.getElementById(id);

    function listAsText(forBuy = true) {
        const lines = [`🛒 ${current.title || "Liste de courses"}`];
        if (current.subtitle) lines.push(current.subtitle);
        const buy = current.items.filter(i => !current.have.has(i.key));
        const order = [...AISLES, OTHER];
        order.forEach(aisle => {
            const group = buy.filter(i => i.aisle.id === aisle.id);
            if (!group.length) return;
            lines.push("", aisle.label);
            group.forEach(i => lines.push(`- [ ] ${qtyText(i) ? qtyText(i) + " " : ""}${i.name.toLowerCase()}`));
        });
        return lines.join("\n");
    }

    function toggleHave(key, on) {
        if (on) current.have.add(key); else current.have.delete(key);
        render();
    }

    function render() {
        const body = $("shopping-body");
        if (!body) return;
        body.innerHTML = "";
        const buy = current.items.filter(i => !current.have.has(i.key));
        const have = current.items.filter(i => current.have.has(i.key));

        $("shopping-subtitle").textContent = current.subtitle || "";
        $("shopping-count").textContent = buy.length ? `${buy.length} article${buy.length > 1 ? "s" : ""} à acheter` : "Tout est à la maison 🎉";

        const mkRow = (item, checked) => {
            const li = document.createElement("li");
            li.className = "shop-row" + (checked ? " is-have" : "");
            const label = document.createElement("label");
            label.className = "shop-label";
            const box = document.createElement("input");
            box.type = "checkbox"; box.checked = checked;
            box.setAttribute("aria-label", `J'ai déjà : ${item.name}`);
            box.addEventListener("change", () => toggleHave(item.key, box.checked));
            const tick = document.createElement("span"); tick.className = "shop-tick";
            const text = document.createElement("span"); text.className = "shop-text";
            const q = qtyText(item);
            text.innerHTML = (q ? `<strong>${escapeHtml(q)}</strong> ` : "") + escapeHtml(item.name.toLowerCase());
            label.append(box, tick, text);
            li.appendChild(label);
            if (current.from.length > 1 && item.from.length) {
                const f = document.createElement("span"); f.className = "shop-from";
                f.textContent = item.from.length > 1 ? `${item.from.length} recettes` : item.from[0];
                f.title = item.from.join(" · ");
                li.appendChild(f);
            }
            const pin = document.createElement("button");
            pin.type = "button"; pin.className = "shop-pin";
            const pinned = inPantry(item.key);
            pin.textContent = pinned ? "📌" : "📍";
            pin.title = pinned ? "Retirer de mon garde-manger" : "Toujours chez moi (garde-manger)";
            pin.setAttribute("aria-label", pin.title);
            pin.addEventListener("click", () => {
                if (inPantry(item.key)) { removePantry(item.key); }
                else { addPantry(item.name); current.have.add(item.key); }
                render();
            });
            li.appendChild(pin);
            return li;
        };

        [...AISLES, OTHER].forEach(aisle => {
            const group = buy.filter(i => i.aisle.id === aisle.id).sort((a, b) => a.name.localeCompare(b.name, "fr"));
            if (!group.length) return;
            const sec = document.createElement("section"); sec.className = "shop-aisle";
            const h = document.createElement("h4"); h.textContent = aisle.label;
            const ul = document.createElement("ul"); ul.className = "shop-list";
            group.forEach(i => ul.appendChild(mkRow(i, false)));
            sec.append(h, ul); body.appendChild(sec);
        });

        if (!buy.length && !current.items.length) {
            const p = document.createElement("p"); p.className = "shop-empty";
            p.textContent = "Aucun ingrédient pour l'instant."; body.appendChild(p);
        }

        if (have.length) {
            const det = document.createElement("details"); det.className = "shop-have";
            const sum = document.createElement("summary"); sum.textContent = `Déjà à la maison (${have.length})`;
            const ul = document.createElement("ul"); ul.className = "shop-list";
            have.sort((a, b) => a.name.localeCompare(b.name, "fr")).forEach(i => ul.appendChild(mkRow(i, true)));
            det.append(sum, ul); det.open = det.dataset.open === "1" || have.length <= 4;
            body.appendChild(det);
        }
        renderPantry();
    }

    function renderPantry() {
        const box = $("pantry-chips");
        if (!box) return;
        box.innerHTML = "";
        const list = readPantry();
        if (!list.length) {
            const p = document.createElement("span"); p.className = "pantry-none";
            p.textContent = "Vide pour l'instant. Épingle un ingrédient (📍) ou ajoute-en un ci-dessous."; box.appendChild(p);
        }
        list.forEach(item => {
            const chip = document.createElement("span"); chip.className = "pantry-chip";
            chip.textContent = item.name;
            const x = document.createElement("button"); x.type = "button"; x.textContent = "✕";
            x.setAttribute("aria-label", `Retirer ${item.name} du garde-manger`);
            x.addEventListener("click", () => { removePantry(item.key); render(); });
            chip.appendChild(x); box.appendChild(chip);
        });
        const sugg = $("pantry-suggestions");
        if (sugg) {
            sugg.innerHTML = "";
            PANTRY_SUGGESTIONS.filter(s => !inPantry(keyOf(s))).slice(0, 8).forEach(s => {
                const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = "+ " + s;
                b.addEventListener("click", () => { addPantry(s); applyPantryToCurrent(); render(); });
                sugg.appendChild(b);
            });
        }
    }

    function applyPantryToCurrent() {
        const keys = new Set(readPantry().map(p => p.key));
        current.items.forEach(i => { if (keys.has(i.key)) current.have.add(i.key); });
    }

    function open({ title, subtitle = "", recipes }) {
        const items = merge(recipes);
        current = { title, subtitle, items, have: new Set(), from: recipes.map(r => r.title) };
        applyPantryToCurrent();
        render();
        $("shopping-modal-overlay").classList.remove("hidden-mode");
        $("shopping-pantry")?.removeAttribute("open");
        $("shopping-close-btn")?.focus();
    }
    const close = () => $("shopping-modal-overlay")?.classList.add("hidden-mode");

    function flash(btn, text) {
        const old = btn.dataset.label || btn.textContent;
        btn.dataset.label = old; btn.textContent = text;
        setTimeout(() => { btn.textContent = old; }, 2000);
    }

    function init() {
        $("shopping-close-btn")?.addEventListener("click", close);
        $("shopping-modal-overlay")?.addEventListener("click", (e) => { if (e.target.id === "shopping-modal-overlay") close(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("shopping-modal-overlay")?.classList.contains("hidden-mode")) close(); });
        $("shopping-copy-btn")?.addEventListener("click", async (e) => {
            try { await navigator.clipboard.writeText(listAsText()); flash(e.currentTarget, "Copié ✓"); }
            catch (err) { flash(e.currentTarget, "Copie impossible"); }
        });
        $("shopping-share-btn")?.addEventListener("click", async (e) => {
            const text = listAsText();
            if (navigator.share) { try { await navigator.share({ title: current.title, text }); } catch (err) {} }
            else { try { await navigator.clipboard.writeText(text); flash(e.currentTarget, "Copié ✓"); } catch (err) { flash(e.currentTarget, "Partage impossible"); } }
        });
        const addInput = $("pantry-input");
        const addNow = () => {
            const v = addInput.value.trim();
            if (v.length < 2) return;
            addPantry(v); addInput.value = ""; applyPantryToCurrent(); render();
        };
        $("pantry-add-btn")?.addEventListener("click", addNow);
        addInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addNow(); } });
    }

    return { init, open, close, merge, keyOf, aisleOf, listAsText: () => listAsText(), _readPantry: readPantry };
})();
