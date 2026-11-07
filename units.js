// Conversion d'affichage des quantités et des températures (réglages : Préférences > Unités).
// Les recettes restent stockées en unités métriques : seule l'AFFICHAGE change.
const Units = (() => {
    const FRACTIONS = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
    const cfg = () => (typeof Settings !== "undefined" && Settings.units) ? Settings.units() : { system: "metric", temp: "c" };

    // 1,5 -> « 1 ½ » ; arrondi au quart
    function fraction(n) {
        const q = Math.round(n * 4) / 4;
        if (q <= 0) return "¼";
        const whole = Math.floor(q), rest = q - whole;
        const frac = FRACTIONS[rest] || "";
        return (whole ? String(whole) : "") + (whole && frac ? " " : "") + frac;
    }
    const decimal = (n) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10).replace(/\.0$/, ""));

    function unitKey(unit) {
        const u = String(unit || "").toLowerCase().replace(/[.\s]/g, "");
        if (["g", "gr", "gramme", "grammes"].includes(u)) return "g";
        if (["kg", "kilo", "kilos"].includes(u)) return "kg";
        if (["ml", "millilitre", "millilitres"].includes(u)) return "ml";
        if (["cl", "centilitre", "centilitres"].includes(u)) return "cl";
        if (["dl", "decilitre", "décilitre", "décilitres"].includes(u)) return "dl";
        if (["l", "litre", "litres"].includes(u)) return "l";
        if (["càs", "cas", "càsoupe", "cuillèreàsoupe", "cuillèresàsoupe"].includes(u)) return "cas";
        if (["càc", "cac", "càcafé", "cuillèreàcafé", "cuillèresàcafé"].includes(u)) return "cac";
        return "";
    }

    function usVolume(ml) {
        if (ml < 14) return `${fraction(ml / 5)} tsp`;
        if (ml < 60) return `${fraction(ml / 15)} tbsp`;
        const cups = ml / 240;
        return `${fraction(cups)} ${cups > 1.125 ? "cups" : "cup"}`;
    }

    // Renvoie « 3,5 oz » / « 1 ½ cups », ou null quand il n'y a rien à convertir (métrique, pièce, pincée...).
    function quantity(qty, unit) {
        if (cfg().system !== "us" || !(qty > 0)) return null;
        switch (unitKey(unit)) {
            case "g": { const oz = qty / 28.3495; return oz >= 16 ? `${decimal(oz / 16)} lb` : `${decimal(oz)} oz`; }
            case "kg": return `${decimal(qty * 2.20462)} lb`;
            case "ml": return usVolume(qty);
            case "cl": return usVolume(qty * 10);
            case "dl": return usVolume(qty * 100);
            case "l": return usVolume(qty * 1000);
            case "cas": return `${fraction(qty)} tbsp`;
            case "cac": return `${fraction(qty)} tsp`;
            default: return null;
        }
    }

    function tempString(c) {
        const t = cfg().temp;
        if (t === "f") return `${Math.round((c * 9 / 5 + 32) / 5) * 5} °F`;
        if (t === "th") return c < 120 ? null : `thermostat ${Math.min(10, Math.max(1, Math.round(c / 30)))}`;
        return null;
    }

    // Convertit les températures citées dans un texte d'étape (180°C, 180 °C, 180 degrés, 180-200°C).
    function text(str) {
        const t = cfg().temp;
        const s = String(str ?? "");
        if (t === "c") return s;
        const unitRe = "(?:\\s?°\\s?C(?![a-zA-Z])|\\s?°(?!\\s?[CF])|\\s?degrés(?:\\s+Celsius)?(?![a-zA-Z]))";
        const range = new RegExp(`(\\d{2,3})\\s?[-–à]\\s?(\\d{2,3})${unitRe}`, "g");
        const single = new RegExp(`(\\d{2,3})${unitRe}`, "g");
        const num = (c) => tempString(c).replace(/^thermostat /, "").replace(/ °F$/, "");
        const suffix = t === "f" ? " °F" : "";
        const prefix = t === "th" ? "thermostat " : "";
        return s
            .replace(range, (m, a, b) => (t === "th" && (+a < 120 || +b < 120)) ? m : `${prefix}${num(+a)}–${num(+b)}${suffix}`)
            .replace(single, (m, a) => tempString(+a) || m);
    }

    return { quantity, text };
})();
