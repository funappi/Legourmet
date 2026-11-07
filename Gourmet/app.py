from flask import Flask, request, send_from_directory, Response
from flask_cors import CORS
from groq import Groq
import functools
import os
import re
import json
import sqlite3
import unicodedata
from dotenv import load_dotenv

# Verrouillage du chemin absolu
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = Flask(__name__, static_folder='static')
CORS(app)

GROQ_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_KEY:
    print("[CRITIQUE] GROQ_API_KEY introuvable dans le .env !")

client = Groq(api_key=GROQ_KEY)
DB_PATH = os.path.join(BASE_DIR, "legourmet.db")

VARIANTS = ("original", "healthy", "protein", "gourmand")
VARIANT_BRIEFS = {
    "original": "la version originale et authentique du plat",
    "healthy": "une version allégée, saine et riche en micronutriments (moins de sucres et de gras ajoutés, plus de fibres et de légumes)",
    "protein": "une version enrichie en protéines, bâtisseuse de muscle (adaptée au domaine sucré ou salé du plat)",
    "gourmand": "une version généreuse et réconfortante (sauce onctueuse, fromage fondant ou équivalent)",
}
VARIANT_JSON_SHAPE = """{
        "title": "Nom du plat",
        "prep_time": "15", "cook_time": "20", "total_time": "35",
        "nova_score": 2, "kcal_100g": 145,
        "macros": {"proteines": "25g", "lipides": "10g", "glucides": "40g"},
        "ingredients": [{"name": "Riz noir", "qty": 80, "unit": "g"}],
        "steps": ["Étape 1...", "Étape 2..."]
    }"""

# ==========================================
# 🛠️ UTILITAIRES & CONFIGURATION
# ==========================================
def json_response(data, status=200):
    """Force l'encodage UTF-8 pour éviter les problèmes d'accents (les Ã©, Ã¢...)."""
    return Response(
        response=json.dumps(data, ensure_ascii=False),
        status=status,
        mimetype='application/json; charset=utf-8'
    )

# Les modèles gpt-oss de Groq réfléchissent longuement par défaut : « low » divise le temps de réponse.
# Réglable avec la variable d'environnement GROQ_REASONING (low, medium, high ; vide = désactivé).
_REASONING = os.getenv("GROQ_REASONING", "low").strip()
LLM_EXTRA = {"reasoning_effort": _REASONING} if _REASONING and "gpt-oss" in os.getenv("GROQ_MODEL", "openai/gpt-oss-120b") else {}

def ask_llm(prompt):
    """Gère l'appel à l'IA de manière centralisée pour éviter le code dupliqué."""
    try:
        completion = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
            messages=[
                {"role": "system", "content": "Tu es un chef cuisinier expert. Tu réponds obligatoirement au format JSON valide."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.25,
            **LLM_EXTRA
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"[ERREUR GROQ BRUTE] : {e}")
        return None

def clean(value, max_len=300):
    """Texte venant du client : converti en chaîne, tronqué, sans retours chariot."""
    return " ".join(str(value).split())[:max_len]

def _clean_list(value, limit, max_len=40):
    return [clean(x, max_len) for x in (value if isinstance(value, list) else [])[:limit] if isinstance(x, str) and x.strip()]

# ==========================================
# 🥗 PRÉFÉRENCES, ALLERGIES & AVERSIONS (page « Préférences » du site)
# ==========================================
def exclusions_lines(data):
    """Section « PROFIL UTILISATEUR » : exclusions (absolues) et goûts (à privilégier)."""
    ex = data.get("exclusions")
    if not isinstance(ex, dict):
        return []
    allergies = _clean_list(ex.get("allergies"), 20)
    dislikes = _clean_list(ex.get("dislikes"), 40)
    avoid_text = clean(ex.get("avoid_text", ""), 600)
    likes_text = clean(ex.get("likes_text", ""), 600)
    if not (allergies or dislikes or avoid_text or likes_text):
        return []
    lines = ["PROFIL UTILISATEUR (règles PRIORITAIRES, au-dessus de toutes les autres) :"]
    if avoid_text:
        lines.append(
            "  * À ÉVITER, écrit par l'utilisateur avec ses mots (allergies et aversions : respecte-le à la lettre, "
            f"y compris les dérivés et les ingrédients composés) : « {avoid_text} »."
        )
    if likes_text:
        lines.append(
            "  * PRÉFÉRENCES, écrites par l'utilisateur avec ses mots (à privilégier quand c'est cohérent avec le plat, "
            f"sans forcer) : « {likes_text} »."
        )
    if allergies:
        lines.append(
            "  * ALLERGIES : exclusion ABSOLUE, aucun de ces allergènes ni leurs dérivés, même en petite quantité "
            f"(vérifie aussi les ingrédients composés : sauces, bouillons, pâtes, fonds) : {', '.join(allergies)}."
        )
    if dislikes:
        lines.append(
            "  * INGRÉDIENTS INTERDITS (détestés) : ne les mets NI dans les ingrédients, NI dans les étapes, "
            f"NI en garniture ou en option : {', '.join(dislikes)}."
        )
    return lines

def profile_reminder(data):
    """Rappel placé en toute fin de prompt : les modèles respectent mieux la dernière consigne lue."""
    ex = data.get("exclusions")
    if not isinstance(ex, dict):
        return ""
    banned = _clean_list(ex.get("allergies"), 20) + _clean_list(ex.get("dislikes"), 40)
    avoid_text = clean(ex.get("avoid_text", ""), 600)
    if not banned and not avoid_text:
        return ""
    listed = f" Ils ne doivent contenir AUCUN de ces éléments : {', '.join(banned)}." if banned else ""
    written = f" Relis aussi ce que l'utilisateur veut éviter : « {avoid_text} »." if avoid_text else ""
    return "RAPPEL FINAL : avant de répondre, relis ta liste d'ingrédients et tes étapes." + listed + written

def _norm(text):
    text = str(text or "").lower().replace("œ", "oe").replace("æ", "ae")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", text)).strip()

def _has_term(text, term):
    term = _norm(term)
    return bool(term) and re.search(r"(^|[^a-z0-9])" + re.escape(term).replace(r"\ ", r"[^a-z0-9]+") + r"(s|x)?($|[^a-z0-9])", text) is not None

def forbidden_hits(recipes, data):
    """Éléments interdits repérés dans des recettes (ingrédients ; étapes pour les aversions)."""
    ex = data.get("exclusions")
    if not isinstance(ex, dict):
        return []
    dislikes = _clean_list(ex.get("dislikes"), 40)
    rules = []
    for rule in (ex.get("allergy_rules") if isinstance(ex.get("allergy_rules"), list) else [])[:20]:
        if isinstance(rule, dict):
            rules.append((
                clean(rule.get("label", ""), 40),
                _clean_list(rule.get("keywords"), 80),
                [_norm(x) for x in _clean_list(rule.get("safe"), 30)],
            ))
    hits = []
    for recipe in recipes:
        if not isinstance(recipe, dict):
            continue
        names = [_norm(i.get("name")) for i in recipe.get("ingredients", []) if isinstance(i, dict)]
        steps = _norm(" ".join(x for x in recipe.get("steps", []) if isinstance(x, str)))
        for name in names:
            for label, keywords, safe in rules:
                cleaned = name
                for expr in safe:
                    cleaned = cleaned.replace(expr, " ")
                if any(_has_term(cleaned, k) for k in keywords):
                    hits.append(f"{label} : {name}")
            for d in dislikes:
                if _has_term(name, d):
                    hits.append(f"{d} : {name}")
        for d in dislikes:
            if _has_term(steps, d):
                hits.append(f"{d} (dans les étapes)")
    return sorted(set(hits))

def ask_llm_checked(prompt, data, extract, parse=lambda r: r):
    """Appelle le LLM puis vérifie les exclusions ; en cas d'élément interdit, redemande UNE fois en le nommant.
    `extract` renvoie la liste de recettes à contrôler. Renvoie None si l'IA échoue ou répond hors format.
    Si la 2e réponse est encore fautive, on la renvoie quand même : le site affichera alors son avertissement."""
    def attempt(text):
        raw = ask_llm(text)
        if raw is None:
            return None
        try:
            return parse(raw)
        except (ValueError, KeyError, TypeError) as e:
            print(f"[RÉPONSE IA INVALIDE] : {e}")
            return None

    result = attempt(prompt)
    if result is None:
        return None
    hits = forbidden_hits(extract(result), data)
    if not hits:
        return result
    print(f"[EXCLUSIONS NON RESPECTÉES, nouvelle tentative] : {hits}")
    retry = (
        prompt
        + "\n\n    ERREUR DANS TA RÉPONSE PRÉCÉDENTE : elle contenait des éléments INTERDITS ("
        + "; ".join(hits[:8])
        + "). Refais la réponse complète en remplaçant ces éléments par des alternatives sûres, "
        + "et en respectant strictement le même format JSON."
    )
    second = attempt(retry)
    return second if second is not None else result

def avoid_clause(data):
    """Titres déjà proposés (bouton « Essaie encore » du site) : on demande d'autres plats."""
    avoid = data.get("avoid_titles", [])
    if not isinstance(avoid, list):
        return ""
    titles = [clean(t, 80) for t in avoid[:12] if isinstance(t, str) and t.strip()]
    return f"- IDÉES DÉJÀ PROPOSÉES, À NE PAS REDONNER (propose 3 plats différents) : {', '.join(titles)}." if titles else ""

def validate_pack(pack):
    """Vérifie que les 4 variantes existent avec la structure attendue par le site."""
    if not isinstance(pack, dict):
        raise ValueError("réponse non-objet")
    for key in VARIANTS:
        v = pack.get(key)
        if not isinstance(v, dict):
            raise ValueError(f"variante manquante : {key}")
        if not isinstance(v.get("ingredients"), list) or not isinstance(v.get("steps"), list):
            raise ValueError(f"structure invalide pour : {key}")
    return pack

def sanitize_variant(value):
    """Nettoie une recette (venant du site ou de l'IA) : types, longueurs, clés attendues par le site."""
    if not isinstance(value, dict):
        raise ValueError("recette non-objet")
    ingredients = []
    raw_ingredients = value.get("ingredients")
    for item in (raw_ingredients if isinstance(raw_ingredients, list) else [])[:40]:
        if not isinstance(item, dict) or not item.get("name"):
            continue
        try:
            qty = float(item.get("qty", 0))
        except (TypeError, ValueError):
            qty = 0
        qty = int(qty) if qty == int(qty) else round(qty, 1)
        ingredients.append({"name": clean(item["name"], 80), "qty": qty, "unit": clean(item.get("unit", ""), 20)})
    raw_steps = value.get("steps")
    steps = [clean(x, 500) for x in (raw_steps if isinstance(raw_steps, list) else [])[:30] if isinstance(x, str) and x.strip()]
    if not ingredients or not steps:
        raise ValueError("structure invalide")
    macros = value.get("macros") if isinstance(value.get("macros"), dict) else {}
    try:
        nova = max(0, min(4, int(value.get("nova_score", 0))))
    except (TypeError, ValueError):
        nova = 0
    out = {
        "title": clean(value.get("title", "Recette"), 120) or "Recette",
        "prep_time": clean(value.get("prep_time", "0"), 6),
        "cook_time": clean(value.get("cook_time", "0"), 6),
        "total_time": clean(value.get("total_time", "0"), 6),
        "nova_score": nova,
        "macros": {k: clean(macros.get(k, "--"), 10) for k in ("proteines", "lipides", "glucides")},
        "ingredients": ingredients,
        "steps": steps,
    }
    try:
        out["kcal_100g"] = round(float(value["kcal_100g"]))
    except (KeyError, TypeError, ValueError):
        pass
    return out

# ==========================================
# 🌐 ROUTES API
# ==========================================
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@functools.lru_cache(maxsize=512)
def _search_cached(query):
    query_smart = query.replace("oe", "œ")
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT DISTINCT nom, categorie, calories FROM ingredients WHERE nom LIKE ? OR nom LIKE ? LIMIT 8",
            (f"%{query}%", f"%{query_smart}%")
        )
        return tuple(dict(row) for row in cursor.fetchall())

@app.route('/api/ingredients', methods=['GET'])
def search_ingredients():
    query = request.args.get('q', '').strip().lower()
    if len(query) < 2:
        return json_response([])

    try:
        return json_response(list(_search_cached(query)))
    except Exception as e:
        print(f"Erreur DB: {e}")
        return json_response([])

@app.route('/generate-ideas', methods=['POST'])
def generate_ideas():
    data = request.get_json(silent=True) or {}

    simple_prompt = data.get('simple_prompt', 'Repas surprise')
    ingredients_list = data.get('ingredients', [])
    fusion = data.get('fusion', 'Auto_FoodPairing')
    diet = data.get('diet_profile', 'Aucun')
    cooking_style = data.get('cooking_style', 'Libre')
    dish_type = data.get('dish_type', 'Salé')
    risk = data.get('risk', 'Original')
    time_level = data.get('time', 'Amateur')
    equipment = data.get('equipment', [])
    chef_directive = clean(data.get('chef_instruction_directive', ''), 1500)

    constraints = [
        f"RÈGLE D'OR : Ce plat DOIT ABSOLUMENT ÊTRE {dish_type.upper()}.",
        "INTERDICTION D'INVENTER DES MOTS : Utilise un vocabulaire culinaire français strict et existant. Aucun ingrédient imaginaire.",
        "COHÉRENCE CULINAIRE ABSOLUE : Respecte strictement la logique et la physique de la cuisson. Si le matériel exclusif imposé ne correspond pas aux techniques traditionnelles des ingrédients choisis, tu DOIS réinventer la forme du plat ou la méthode de préparation pour que la recette reste 100% réalisable, réaliste et cohérente avec cet équipement précis. Aucune aberration technique n'est tolérée."
    ]

    risk_prompts = {
        "Classique": "STYLE : Ultra-Classique et Traditionnel. AUCUNE excentricité.",
        "Aventure": "STYLE : Avant-gardiste et audacieux. Créativité folle.",
        "Original": "STYLE : Original. Traditionnel mais avec un twist créatif."
    }
    constraints.append(risk_prompts.get(risk, risk_prompts["Original"]))

    # Application stricte de l'équipement dès la génération d'idées
    if equipment and "Auto_FoodPairing" not in equipment:
        constraints.append(f"- MATÉRIEL STRICTEMENT LIMITÉ À : {', '.join(equipment)}. Ne propose AUCUNE idée nécessitant un autre équipement.")

    constraints.append(f"- NIVEAU ET TEMPS DISPONIBLE : {time_level}.")

    if simple_prompt and simple_prompt != "Repas surprise": constraints.append(f"- INSPIRATION REQUISE : '{simple_prompt}'")
    if ingredients_list and "Auto_FoodPairing" not in ingredients_list: constraints.append(f"- INGRÉDIENTS CIBLES : {', '.join(ingredients_list)}")
    if fusion and fusion != "Auto_FoodPairing": constraints.append(f"- INFLUENCE CULTURELLE : {fusion}")
    if diet and diet != "Aucun": constraints.append(f"- RÉGIME STRICT : {diet}. INTERDICTION d'utiliser des aliments contraires.")
    if cooking_style and cooking_style != "Libre": constraints.append(f"- MODE DE CUISSON : {cooking_style}")
    constraints.extend(exclusions_lines(data))
    if avoid_clause(data): constraints.append(avoid_clause(data))

    prompt = f"""Tu es une Intelligence Artificielle Culinaire Experte. Tu dois proposer 3 idées de plats.
    VOICI LES CONTRAINTES ABSOLUES :
    {chr(10).join(constraints)}

    DIRECTIVE GLOBALE DU CHEF :
    {chef_directive}

    {profile_reminder(data)}

    Propose EXACTEMENT 3 titres différents respectant 100% des contraintes. Rédige dans un français PARFAIT.
    Renvoie UNIQUEMENT un JSON avec cette structure :
    {{ "ideas": [ {{"title": "Nom 1", "description": "Desc 1"}}, ... ] }}"""

    response = ask_llm(prompt)
    return json_response(response) if response else json_response({"error": "Erreur serveur"}, 500)

@app.route('/generate-recipe', methods=['POST'])
def generate_recipe():
    data = request.get_json(silent=True) or {}

    selected_idea = data.get('selected_idea', 'Un plat surprise')
    equipment = data.get('equipment', [])
    risk = data.get('risk', 'Original')
    time_level = data.get('time', 'Amateur')
    ingredients_list = data.get('ingredients', [])
    diet = data.get('diet_profile', 'Aucun')
    cooking_style = data.get('cooking_style', 'Libre')
    fusion = data.get('fusion', 'Auto_FoodPairing')
    dish_type = data.get('dish_type', 'Salé')
    chef_directive = clean(data.get('chef_instruction_directive', ''), 1500)

    personas = {
        "Classique": ("une Grand-mère experte en recettes familiales.", "AUDACE : TRÈS CLASSIQUE. Zéro ingrédient bizarre."),
        "Aventure": ("un Chef Alchimiste 3 étoiles Michelin audacieux.", "AUDACE : AVENTURE EXTRÊME. Surprends-moi."),
        "Original": ("un Chef de bistronomie moderne.", "AUDACE : ORIGINAL. Classique avec un twist.")
    }
    persona, risk_clause = personas.get(risk, personas["Original"])

    equip_clause = f"Matériel EXCLUSIF : {', '.join(equipment)}. N'utilise RIEN d'autre." if equipment and "Auto_FoodPairing" not in equipment else "Matériel : Libre."

    # 🚀 NOUVEAUTÉ : GÉNÉRATION DYNAMIQUE DES VARIANTES SELON LE TYPE DE PLAT
    if dish_type.lower() == "sucré":
        variantes_clause = """-> Pour HEALTHY : Réduis drastiquement le sucre blanc et le gras. Utilise du miel, sirop d'agave, de la compote pour remplacer le beurre, ou ajoute des fruits frais. INTERDICTION ABSOLUE D'AJOUTER DU SEL, DE LA VIANDE, OU TOUT INGRÉDIENT SALÉ.
      -> Pour PROTEIN : Ajoute des sources de protéines cohérentes avec un dessert (ex: skyr, fromage blanc, œufs, poudre de protéine/whey, beurre de cacahuète, purée d'amande). INTERDICTION ABSOLUE DE METTRE DE LA VIANDE OU DU SEL.
      -> Pour GOURMAND : Fais dans l'excès sucré (ex: double ration de chocolat, ajout de caramel, mascarpone, chantilly, praliné, beurre). INTERDICTION ABSOLUE D'AJOUTER DU SEL OU DES INGRÉDIENTS SALÉS."""
    else:
        variantes_clause = """-> Pour HEALTHY : Utilise de vrais substituts naturels (ex: viande blanche, fromage blanc, crème végétale, ajout de légumes) ou réduis les quantités de gras. Ne te contente pas de mettre "Light" dans le titre.
      -> Pour PROTEIN : Ajoute de VRAIES sources de protéines (ex: oeufs, poulet, dinde, tofu, lentilles, skyr).
      -> Pour GOURMAND : Ajoute de vrais ingrédients riches (ex: lardons, crème entière, double ration d'un vrai fromage classique, beurre)."""

    exclusions_block = "\n    ".join(exclusions_lines(data))

    prompt = f"""Tu es {persona} Le client a validé cette idée : "{selected_idea}". (Type : {dish_type.upper()}).
    Décline ce plat en 4 versions (original, healthy, protein, gourmand).

    RÈGLES INTRANSIGEANTES :
    - {risk_clause}
    - Complexité : {time_level}
    - {equip_clause}
    - COHÉRENCE CULINAIRE ABSOLUE : Respecte strictement la logique et la physique de la cuisson. Si le matériel exclusif imposé ne correspond pas aux techniques traditionnelles des ingrédients choisis, tu DOIS réinventer la forme du plat ou la méthode de préparation pour que la recette reste 100% réalisable, réaliste et cohérente avec cet équipement précis. Aucune aberration technique n'est tolérée.
    - INTERDICTION D'INVENTER DES MOTS : Utilise un vocabulaire culinaire français strict et existant.
    - GESTION DES VARIANTES (CRUCIAL) : Il est STRICTEMENT INTERDIT d'inventer des adjectifs magiques pour faire correspondre un ingrédient à une variante (ex: ne dis JAMAIS "Bolognaise protéique", "Comté épaissi", "Fromage maigre", ou "Baguette croustillante"). Garde le vrai nom brut de l'ingrédient.
    {variantes_clause}
    {f'- RÉGIME STRICT : {diet}.' if diet != "Aucun" else ''}
    {f'- CUISSON : {cooking_style}.' if cooking_style != "Libre" else ''}
    {f'- BASE OBLIGATOIRE : {", ".join(ingredients_list)}.' if ingredients_list and "Auto_FoodPairing" not in ingredients_list else ''}
    {f'- ADN CULTUREL : {fusion}.' if fusion != "Auto_FoodPairing" else ''}
    {f'- DIRECTIVE DU CHEF : {chef_directive}' if chef_directive else ''}
    {exclusions_block}

    {profile_reminder(data)}

    FORMATAGE JSON OBLIGATOIRE (6-10 étapes détaillées, sans sauces vagues, portion 1 personne, français parfait) :
    - RÈGLE DES UNITÉS : N'utilise JAMAIS l'abréviation "u". Pour un ingrédient entier, utilise "pièce" ou convertis en une unité. Utilise uniquement "g", "mg", "ml", "cl", "c.à.s", "c.à.c" ou "pincée".
    {{
        "original": {{
            "title": "Titre", "prep_time": "20", "cook_time": "25", "total_time": "45",
            "nova_score": 2, "kcal_100g": 145, "macros": {{"proteines": "25g", "lipides": "10g", "glucides": "40g"}},
            "ingredients": [ {{"name": "Nom", "qty": 150, "unit": "g"}} ],
            "steps": ["Étape 1...", "Étape 2..."]
        }},
        "healthy": {{ ... }}, "protein": {{ ... }}, "gourmand": {{ ... }}
    }}"""

    response = ask_llm_checked(prompt, data, extract=lambda pack: [pack[k] for k in VARIANTS], parse=validate_pack)
    return json_response(response) if response else json_response({"error": "Erreur serveur"}, 500)

@app.route('/adjust-recipe', methods=['POST'])
def adjust_recipe():
    """Réécrit UNE version de recette selon une consigne (« sans four », « moins épicé »…)."""
    data = request.get_json(silent=True) or {}
    instruction = clean(data.get("instruction", ""), 400)
    if len(instruction) < 2:
        return json_response({"error": "Consigne vide."}, 400)
    try:
        recipe = sanitize_variant(data.get("recipe"))
    except ValueError:
        return json_response({"error": "Recette invalide."}, 400)

    equipment = data.get("equipment", [])
    equip_clause = f"Matériel EXCLUSIF : {', '.join(clean(e, 40) for e in equipment[:10])}." if isinstance(equipment, list) and equipment and "Auto_FoodPairing" not in equipment else "Matériel : Libre."
    prompt = f"""Tu es un Chef Alchimiste Étoilé. Voici une recette au format JSON (quantités pour 1 personne) :
    {json.dumps(recipe, ensure_ascii=False)}

    CONSIGNE DE L'UTILISATEUR : « {instruction} »

    Réécris la recette COMPLÈTE en appliquant cette consigne, en gardant l'esprit du plat, en français.
    CONTRAINTES :
    - {equip_clause}
    - INTERDICTION D'INVENTER DES MOTS : vocabulaire culinaire français strict et existant.
    - Les quantités des ingrédients restent pour 1 PERSONNE (le site les multiplie selon le nombre de personnes).
    - Mets à jour le titre si la consigne change le plat, les temps, le score NOVA et les macros (estimations).
    {chr(10).join("    " + l for l in exclusions_lines(data)).strip()}
    {profile_reminder(data)}

    Renvoie UNIQUEMENT un objet JSON brut de cette forme, sans texte autour :
    {VARIANT_JSON_SHAPE}"""

    result = ask_llm_checked(prompt, data, extract=lambda r: [r], parse=sanitize_variant)
    return json_response({"recipe": result}) if result else json_response({"error": "Ajustement impossible pour le moment."}, 500)

@app.route('/regenerate-variant', methods=['POST'])
def regenerate_variant():
    """Refait UNE version (original, healthy, protein, gourmand) sans toucher aux trois autres."""
    data = request.get_json(silent=True) or {}
    key = clean(data.get("variant_key", ""), 20)
    if key not in VARIANTS:
        return json_response({"error": "Version inconnue."}, 400)
    idea = clean(data.get("idea_title", ""), 120)
    previous = clean(data.get("previous_title", ""), 120)
    base = None
    if data.get("base_recipe"):
        try:
            base = sanitize_variant(data.get("base_recipe"))
        except ValueError:
            base = None

    base_clause = (
        f"Pars de cette recette de base (JSON, quantités pour 1 personne) et décline-la :\n    {json.dumps(base, ensure_ascii=False)}"
        if base else f"Le plat de départ est : {idea or 'au choix du chef'}."
    )
    equipment = data.get("equipment", [])
    equip_clause = f"Matériel EXCLUSIF : {', '.join(clean(e, 40) for e in equipment[:10])}." if isinstance(equipment, list) and equipment and "Auto_FoodPairing" not in equipment else "Matériel : Libre."
    prompt = f"""Tu es un Chef Alchimiste Étoilé. {base_clause}

    Crée {VARIANT_BRIEFS[key]}.
    Cette version doit être DIFFÉRENTE de la précédente, intitulée « {previous or 'inconnue'} » : change l'approche, les accompagnements ou la technique, tout en restant fidèle au plat de départ.
    CONTRAINTES :
    - {equip_clause}
    - INTERDICTION D'INVENTER DES MOTS : vocabulaire culinaire français strict et existant.
    - GESTION DES VARIANTES : garde le vrai nom brut des ingrédients (jamais d'adjectifs magiques du type « Fromage maigre »).
    - Rédige en français, quantités pour 1 PERSONNE. N'utilise JAMAIS l'abréviation "u" (écris "pièce"). Unités admises : "g", "mg", "ml", "cl", "c.à.s", "c.à.c", "pincée", "pièce".
    {chr(10).join("    " + l for l in exclusions_lines(data)).strip()}
    {profile_reminder(data)}

    Renvoie UNIQUEMENT un objet JSON brut de cette forme, sans texte autour :
    {VARIANT_JSON_SHAPE}"""

    result = ask_llm_checked(prompt, data, extract=lambda r: [r], parse=sanitize_variant)
    return json_response({"recipe": result}) if result else json_response({"error": "Régénération impossible pour le moment."}, 500)

@app.route('/generate-meal', methods=['POST'])
def generate_meal():
    """Planning : UNE recette (version Original) pour un repas précis. Les autres versions se demandent ensuite à la carte."""
    data = request.get_json(silent=True) or {}
    course = clean(data.get("course", "Plat"), 20)
    if course not in ("Entrée", "Plat", "Dessert"):
        course = "Plat"
    dish_type = "Sucré" if course == "Dessert" else "Salé"
    slot = clean(data.get("slot", ""), 40)
    avoid = _clean_list(data.get("avoid_titles"), 40, 90)
    equipment = data.get("equipment", [])
    equip_clause = f"Matériel EXCLUSIF : {', '.join(clean(e, 40) for e in equipment[:10])}." if isinstance(equipment, list) and equipment and "Auto_FoodPairing" not in equipment else "Matériel : Libre."
    briefs = {
        "Entrée": "une entrée légère et raffinée qui ouvre le repas (jamais un plat principal)",
        "Plat": "un plat principal complet et rassasiant",
        "Dessert": "un dessert (domaine sucré uniquement)",
    }
    diet = clean(data.get("diet_profile", "Aucun"), 40)
    time_level = clean(data.get("time", "Amateur"), 30)
    vary = bool(data.get("vary", True))
    directive = clean(data.get("chef_instruction_directive", ""), 900)
    prompt = f"""Tu es un chef de bistronomie qui prépare le planning de la semaine d'une famille. Propose {briefs[course]} pour : {slot or 'un repas'}.
    RÈGLES :
    - Complexité : {time_level}. {equip_clause}
    - Type : {dish_type.upper()}.
    {f'- RÉGIME STRICT : {diet}.' if diet != "Aucun" else ''}
    {'- VARIÉTÉ : change de cuisine, de protéine principale et de technique par rapport aux plats déjà prévus.' if vary else ''}
    {f"- PLATS DÉJÀ PRÉVUS CETTE SEMAINE, À NE PAS REDONNER NI IMITER : {', '.join(avoid)}." if avoid else ''}
    {f'- DIRECTIVE DU CHEF : {directive}' if directive else ''}
    - INTERDICTION D'INVENTER DES MOTS : vocabulaire culinaire français strict et existant.
    - Rédige en français, 6 à 9 étapes, quantités pour 1 PERSONNE. N'utilise JAMAIS l'abréviation "u" (écris "pièce"). Unités admises : "g", "mg", "ml", "cl", "c.à.s", "c.à.c", "pincée", "pièce".
    {chr(10).join("    " + l for l in exclusions_lines(data)).strip()}
    {profile_reminder(data)}

    Renvoie UNIQUEMENT un objet JSON brut de cette forme, sans texte autour :
    {VARIANT_JSON_SHAPE}"""

    result = ask_llm_checked(prompt, data, extract=lambda r: [r], parse=sanitize_variant)
    return json_response({"recipe": result, "course": course}) if result else json_response({"error": "Génération impossible pour le moment."}, 500)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
