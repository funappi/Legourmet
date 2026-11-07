// ==========================================================================
// ILLUSTRATIONS DU CHARGEMENT : petites scènes dessinées à la main (SVG), un ustensile + un ingrédient.
// Elles défilent pendant les longues générations (menu, planning). Les animations sont en CSS (style.css)
// et s'arrêtent d'elles-mêmes si l'utilisateur a demandé « moins d'animations ».
// ==========================================================================
const LoaderArt = (() => {
    const INK = 'stroke="var(--art-ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';

    const SCENES = [
        { name: "Poêle", label: "Ça saute dans la poêle…", svg: `
<svg viewBox="0 0 200 140" aria-hidden="true">
  <g class="art-steam"><path d="M70 40c-6-8 6-12 0-20" fill="none" ${INK} opacity=".45"/><path d="M96 38c-6-8 6-12 0-20" fill="none" ${INK} opacity=".45"/></g>
  <g class="art-hop art-h1"><circle cx="72" cy="78" r="11" fill="#ef4444" ${INK}/><path d="M68 68c4-5 8-4 10 0" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/></g>
  <g class="art-hop art-h2"><path d="M96 80l22-8 6 12-22 8z" fill="#f97316" ${INK}/><path d="M122 73l6-3" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/></g>
  <g class="art-hop art-h3"><path d="M52 90c0-9 12-12 16-4 3 7-4 14-11 11-3-1-5-4-5-7z" fill="#84cc16" ${INK}/></g>
  <g class="art-pan"><path d="M38 100h96c0 14-12 22-48 22s-48-8-48-22z" fill="#cbd5e1" ${INK}/><path d="M134 104l48-9" fill="none" ${INK} stroke-width="7"/><path d="M134 104l48-9" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/></g>
</svg>` },
        { name: "Couteau", label: "On émince tout ça…", svg: `
<svg viewBox="0 0 200 140" aria-hidden="true">
  <rect x="26" y="108" width="148" height="12" rx="4" fill="#d6b48a" ${INK}/>
  <path d="M60 100c0-8 10-11 22-11h40c8 0 12 4 12 8s-4 8-12 8H80c-12 0-20-1-20-5z" fill="#fb923c" ${INK}/>
  <g class="art-slice art-s1"><ellipse cx="150" cy="98" rx="5" ry="9" fill="#fdba74" ${INK}/></g>
  <g class="art-slice art-s2"><ellipse cx="164" cy="98" rx="5" ry="9" fill="#fdba74" ${INK}/></g>
  <g class="art-knife"><path d="M96 14l16 0 0 62c-12 0-22 4-30 12 6-18 14-34 14-74z" fill="#e2e8f0" ${INK}/><rect x="98" y="2" width="22" height="18" rx="6" fill="#92400e" ${INK}/></g>
</svg>` },
        { name: "Fouet", label: "On fouette énergiquement…", svg: `
<svg viewBox="0 0 200 140" aria-hidden="true">
  <path d="M44 66h112l-10 44c-2 8-10 12-18 12H72c-8 0-16-4-18-12z" fill="#e2e8f0" ${INK}/>
  <path d="M52 78h96" stroke="#fde68a" stroke-width="10" stroke-linecap="round"/>
  <g class="art-whisk"><path d="M100 8v34" fill="none" ${INK} stroke-width="6"/><path d="M100 42c-18 6-18 30 0 36M100 42c18 6 18 30 0 36M100 42c-8 8-8 28 0 36M100 42c8 8 8 28 0 36" fill="none" ${INK}/></g>
  <g class="art-egg"><path d="M154 40c-8 0-12 9-12 16s5 12 12 12 12-5 12-12-4-16-12-16z" fill="#fff7ed" ${INK}/></g>
  <circle class="art-drop art-d1" cx="70" cy="60" r="3.5" fill="#fde68a"/><circle class="art-drop art-d2" cx="132" cy="56" r="3" fill="#fde68a"/>
</svg>` },
        { name: "Rouleau", label: "On étale la pâte…", svg: `
<svg viewBox="0 0 200 140" aria-hidden="true">
  <path d="M24 112h152" ${INK} fill="none"/>
  <ellipse cx="100" cy="104" rx="64" ry="12" fill="#fde7c0" ${INK}/>
  <g class="art-roll"><rect x="58" y="62" width="84" height="22" rx="10" fill="#d6a15f" ${INK}/><path d="M58 73H34M142 73h24" ${INK} stroke-width="7" fill="none"/><path d="M70 68v10M100 68v10M130 68v10" stroke="#a16207" stroke-width="2" stroke-linecap="round" opacity=".5"/></g>
  <g class="art-flour"><circle cx="64" cy="56" r="2.5" fill="var(--art-ink)" opacity=".35"/><circle cx="118" cy="50" r="2" fill="var(--art-ink)" opacity=".35"/><circle cx="148" cy="58" r="2.5" fill="var(--art-ink)" opacity=".35"/></g>
</svg>` }
    ];

    let timer = null, index = 0, host = null;

    const paint = () => {
        if (!host) return;
        const scene = SCENES[index % SCENES.length];
        host.classList.add("is-swapping");
        setTimeout(() => {
            if (!host) return;
            host.innerHTML = scene.svg;
            host.dataset.scene = scene.name;
            host.classList.remove("is-swapping");
            const cap = document.getElementById("loading-art-caption");
            if (cap) cap.textContent = scene.label;
        }, host.innerHTML ? 260 : 0);
        index++;
    };

    return {
        scenes: SCENES,
        start() {
            host = document.getElementById("loading-art");
            if (!host) return;
            host.classList.remove("hidden-mode");
            document.getElementById("loading-art-caption")?.classList.remove("hidden-mode");
            if (timer) return;
            index = Math.floor(Math.random() * SCENES.length);
            host.innerHTML = "";
            paint();
            timer = setInterval(paint, 4200);
        },
        stop() {
            clearInterval(timer); timer = null;
            if (host) { host.classList.add("hidden-mode"); host.innerHTML = ""; }
            document.getElementById("loading-art-caption")?.classList.add("hidden-mode");
        }
    };
})();
