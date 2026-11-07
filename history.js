// ==========================================================================
// HISTORIQUE : les 20 dernières recettes générées, gardées dans le localStorage de cet appareil.
// ==========================================================================
const RecipeHistory = (() => {
    const KEY = "lg_history";
    const MAX = 20;

    const read = () => {
        try {
            const list = JSON.parse(localStorage.getItem(KEY) || "[]");
            return Array.isArray(list) ? list.filter(e => e && e.id && e.pack && e.pack.original) : [];
        } catch (e) { return []; }
    };

    // Si le stockage est plein, on retire les plus anciennes jusqu'à ce que ça rentre.
    const write = (list) => {
        const kept = list.slice(0, MAX);
        while (kept.length) {
            try { localStorage.setItem(KEY, JSON.stringify(kept)); return kept; }
            catch (e) { kept.pop(); }
        }
        try { localStorage.removeItem(KEY); } catch (e) {}
        return [];
    };

    const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    return {
        list: read,

        // Ajoute en tête ; une recette de même titre est remplacée (pas de doublon).
        add({ pack, context }) {
            const entry = {
                id: newId(),
                title: pack.original?.title || "Recette sans titre",
                pack,
                context: context || null,
                savedAt: new Date().toISOString()
            };
            write([entry, ...read().filter(e => e.title !== entry.title)]);
            return entry.id;
        },

        // Met à jour la recette d'une entrée (après un ajustement ou une régénération).
        update(id, pack) {
            if (!id) return;
            const list = read();
            const entry = list.find(e => e.id === id);
            if (!entry) return;
            entry.pack = pack;
            entry.title = pack.original?.title || entry.title;
            write(list);
        },

        remove(id) { write(read().filter(e => e.id !== id)); },
        clear() { write([]); },
        MAX
    };
})();

// « il y a 5 min », « hier », « il y a 3 j »… en français
function formatRelativeDate(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "";
    const seconds = Math.round((then - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
    const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return "à l'instant";
}
