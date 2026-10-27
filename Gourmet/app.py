import json
import os
import sqlite3
import time
from collections import defaultdict, deque
from contextlib import closing

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from groq import Groq

load_dotenv()

# ---------------------------------------------------------------------------
# CONFIGURATION (tout est surchargeable par variable d'environnement)
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DB_PATH", os.path.join(BASE_DIR, "legourmet.db"))
MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "10"))
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "https://funappi.github.io,http://localhost:5500,http://127.0.0.1:5500",
    ).split(",")
    if o.strip()
]

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
print(f"Laboratoire Le Gourmet - Clé Groq détectée : {GROQ_API_KEY is not None}")

app = Flask(__name__)
# Le front est servi depuis GitHub Pages (autre origine) : CORS est indispensable.
CORS(app, origins=ALLOWED_ORIGINS)
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

AUTO = ("auto", "Auto_FoodPairing")
VARIANTS = ("original", "healthy", "protein", "gourmand")


# ---------------------------------------------------------------------------
# OUTILS
# ---------------------------------------------------------------------------
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


_hits = defaultdict(deque)


def client_ip():
    # Derrière le proxy PythonAnywhere, l'IP réelle est dans X-Forwarded-For.
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or request.remote_addr or "?"


def rate_limited():
    """Limite simple par IP (mémoire du processus) pour protéger le quota Groq."""
    now = time.time()
    if len(_hits) > 5000:  # évite une croissance infinie du dictionnaire
        for ip in [ip for ip, q in _hits.items() if not q or now - q[-1] > 60]:
            del _hits[ip]
    q = _hits[client_ip()]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MIN:
        return True
    q.append(now)
    return False


def clean(value, max_len=300):
    """Texte venant du client : converti en chaîne, tronqué, sans retours chariot."""
    return " ".join(str(value).split())[:max_len]


def is_set(value):
    return bool(value) and value not in AUTO


def extra_constraints(data):
    """Contraintes envoyées par le front (type de plat, régime, style, directive)."""
    lines = []
    dish_type = clean(data.get("dish_type", ""), 20)
    if is_set(dish_type):
        lines.append(
            f"- Type de plat VERROUILLÉ : {dish_type}. Aucun ingrédient du domaine opposé "
            "(pas de viande dans un dessert, pas de sucre ajouté dans un plat salé)."
        )
    diet = clean(data.get("diet_profile", ""), 40)
    if is_set(diet) and diet != "Aucun":
        lines.append(f"- Régime à respecter strictement : {diet}.")
    style = clean(data.get("cooking_style", ""), 40)
    if is_set(style) and style != "Libre":
        lines.append(f"- Style de cuisson : {style}.")
    directive = clean(data.get("chef_instruction_directive", ""), 900)
    if directive:
        lines.append(f"- Directive du chef : {directive}")
    return "\n    ".join(lines) if lines else "- Aucune contrainte supplémentaire."


def ingredients_clause(data):
    ingredients_list = data.get("ingredients", [])
    if isinstance(ingredients_list, list) and ingredients_list and "Auto_FoodPairing" not in ingredients_list:
        items = ", ".join(clean(i, 60) for i in ingredients_list[:30])
        return f"Impose l'utilisation stricte de ces éléments saisis par l'utilisateur : {items}."

    def pick(key, fallback):
        value = data.get(key)
        return clean(value, 60) if is_set(value) else fallback

    base = pick("base", "une base céréalière ou féculente de ton choix")
    protein = pick("protein", "une source de protéine de ton choix")
    vegetable = pick("vegetable", "un accompagnement de légumes de ton choix")
    return f"Utilise harmonieusement les éléments suivants : {base}, {protein} et {vegetable}."


def equipment_clause(data):
    equipment = data.get("equipment", [])
    if isinstance(equipment, str):
        equipment = [equipment]
    if equipment and "Auto_FoodPairing" not in equipment:
        items = ", ".join(clean(e, 40) for e in equipment[:10])
        return f"Matériel disponible à utiliser obligatoirement : {items}."
    return "Matériel de cuisine : Libre choix selon la cohérence de la recette."


def call_llm(prompt):
    if client is None:
        raise RuntimeError("GROQ_API_KEY manquante côté serveur")
    completion = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    return json.loads(completion.choices[0].message.content)


def validate_pack(pack):
    """Vérifie que les 4 variantes existent avec la structure attendue par le front."""
    if not isinstance(pack, dict):
        raise ValueError("réponse non-objet")
    for key in VARIANTS:
        v = pack.get(key)
        if not isinstance(v, dict):
            raise ValueError(f"variante manquante : {key}")
        if not isinstance(v.get("ingredients"), list) or not isinstance(v.get("steps"), list):
            raise ValueError(f"structure invalide pour : {key}")
    return pack


def fallback_pack():
    pack = {}
    for version in VARIANTS:
        pack[version] = {
            "title": f"Création Alchimique ({version.capitalize()})",
            "prep_time": "0", "cook_time": "0", "total_time": "0", "nova_score": 0,
            "macros": {"proteines": "0g", "lipides": "0g", "glucides": "0g"},
            "ingredients": [{"name": "Ingrédients indéterminés (Vérifier serveur)", "qty": 0, "unit": "g"}],
            "steps": ["Le laboratoire subit une surcharge thermique ou de connexion API. Veuillez relancer la génération."],
        }
    return pack


# ---------------------------------------------------------------------------
# ROUTES
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    # Le front est déployé séparément (GitHub Pages) : ici, seulement l'API.
    return jsonify({"service": "Le Gourmet - API", "status": "ok"})


@app.route("/api/ingredients", methods=["GET"])
def search_ingredients():
    query = request.args.get("q", "").strip()
    if len(query) < 2:
        return jsonify([])
    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.execute(
                "SELECT DISTINCT nom, categorie, calories FROM ingredients WHERE nom LIKE ? LIMIT 8",
                (f"%{query}%",),
            )
            return jsonify([dict(row) for row in cursor.fetchall()])
    except Exception as e:
        print(f"Erreur DB Autocomplete: {e}")
        return jsonify([])


@app.route("/get-ingredients", methods=["GET"])
def get_ingredients():
    try:
        with closing(get_db_connection()) as conn:
            def by_category(cat):
                rows = conn.execute("SELECT nom, calories FROM ingredients WHERE categorie = ?", (cat,)).fetchall()
                return [dict(row) for row in rows]

            return jsonify({
                "bases": by_category("base"),
                "proteins": by_category("protein"),
                "vegetables": by_category("vegetable"),
            })
    except Exception as e:
        print(f"Erreur DB get_ingredients: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/generate-ideas", methods=["POST"])
def generate_ideas():
    """Phase 1 : 3 concepts de plats. Contrat attendu par main.js : {"ideas": [{title, description}]}."""
    if rate_limited():
        return jsonify({"error": "Trop de requêtes, réessaie dans une minute."}), 429
    data = request.get_json(silent=True) or {}
    inspiration = clean(data.get("simple_prompt", ""), 300)

    prompt = f"""Tu es un Chef Alchimiste Étoilé. Propose exactement 3 idées de plats distinctes, rédigées en français.

    CONTRAINTES :
    - {ingredients_clause(data)}
    - {equipment_clause(data)}
    - Univers culturel / fusion : {clean(data.get('fusion', 'libre'), 120)}.
    - Prise de risque : {clean(data.get('risk', 'Original'), 30)}. Niveau de complexité : {clean(data.get('time', 'Amateur'), 30)}.
    - Envie exprimée par l'utilisateur : {inspiration or 'aucune, surprends-moi'}.
    {extra_constraints(data)}

    Renvoie UNIQUEMENT un objet JSON brut de cette forme, sans texte autour :
    {{"ideas": [{{"title": "Nom du plat", "description": "Une phrase appétissante"}}]}}"""

    try:
        result = call_llm(prompt)
        ideas = [
            {"title": clean(i["title"], 120), "description": clean(i.get("description", ""), 300)}
            for i in result.get("ideas", [])
            if isinstance(i, dict) and i.get("title")
        ][:3]
        if not ideas:
            raise ValueError("aucune idée exploitable")
        return jsonify({"ideas": ideas})
    except Exception as e:
        print(f"Erreur generate-ideas : {e}")
        return jsonify({"ideas": [], "error": "Génération impossible pour le moment."}), 500


@app.route("/generate-recipe", methods=["POST"])
def generate_recipe():
    """Phase 2 : décline l'idée choisie en 4 variantes (original, healthy, protéiné, gourmand)."""
    if rate_limited():
        return jsonify({"error": "Trop de requêtes, réessaie dans une minute."}), 429
    data = request.get_json(silent=True) or {}

    mode = clean(data.get("mode", "Avancé"), 30)
    simple_prompt = clean(data.get("simple_prompt", "N/A"), 300)
    selected_idea = clean(data.get("selected_idea", ""), 120)
    flavor = data.get("flavor", "Auto_FoodPairing")
    risk = data.get("risk", "Auto_FoodPairing")
    time_level = data.get("time", "Auto_FoodPairing")
    fusion = data.get("fusion", "Auto_FoodPairing")

    flavor_clause = f"Profil aromatique ciblé de la sauce ou du liant : {clean(flavor, 80)}." if is_set(flavor) else "Profil aromatique : Crée l'équilibre idéal de ton choix."
    risk_clause = f"Prise de risque culinaire (degré d'audace moléculaire) : {clean(risk, 30)}." if is_set(risk) else "Prise de risque : Laisse libre cours à ton inspiration de chef."
    time_clause = f"Contrainte de temps globale : {clean(time_level, 30)}." if is_set(time_level) else "Temps de préparation : S'adaptant au profil thématique."
    fusion_clause = f"Univers culturel / Fusion transnational : {clean(fusion, 120)}." if is_set(fusion) else "Mariage des cultures : Libres affinités chimiques."
    idea_clause = f"Plat choisi par l'utilisateur (à décliner, ne pas en changer) : {selected_idea}." if selected_idea else "Plat : à toi de choisir le meilleur concept."

    prompt = f"""Tu es un Chef Alchimiste Étoilé Expert en Food Pairing Moléculaire et Chimie des Saveurs.
    Génère une recette unique rédigée entièrement en français, déclinée simultanément en 4 versions distinctes basées sur ces contraintes :

    CONTEXTE D'APPEL :
    - Mode d'exécution de l'application : {mode}
    - Saisie libre de l'utilisateur : {simple_prompt}
    - {idea_clause}

    PARAMÈTRES MOLÉCULAIRES APPLIQUÉS :
    - {ingredients_clause(data)}
    - {equipment_clause(data)}
    - {flavor_clause}
    - {risk_clause}
    - {time_clause}
    - {fusion_clause}
    {extra_constraints(data)}

    CONSIGNES DE STRUCTURATION UNIQUEMENT POUR 1 PERSONNE :
    1. Pour chaque déclinaison, estime le temps de préparation (prep_time), de cuisson (cook_time) et le total en minutes (chaînes de caractères numériques).
    2. Estime le score de transformation industrielle NOVA (1 à 4) et les macros par portion (estimations, pas des mesures).
    3. Les ingrédients de chaque version doivent être listés sous forme d'objets structurés avec les clés exactes "name", "qty" (nombre entier uniquement) et "unit" ("g", "ml", "pincée", etc.) pour permettre un recalcul mathématique des portions côté client.

    Tu dois impérativement générer les 4 déclinaisons du plat en même temps (Original, Healthy, Protéiné, Gourmand).
    Renvoie UNIQUEMENT un objet JSON brut respectant rigoureusement cette arborescence exacte en minuscules, sans aucune introduction, conclusion ou texte périphérique :
    {{
        "original": {{
            "title": "Nom du plat version originale",
            "prep_time": "15",
            "cook_time": "20",
            "total_time": "35",
            "nova_score": 2,
            "macros": {{"proteines": "25g", "lipides": "10g", "glucides": "40g"}},
            "ingredients": [
                {{"name": "Riz noir", "qty": 80, "unit": "g"}},
                {{"name": "Filet de poulet", "qty": 120, "unit": "g"}},
                {{"name": "Sel", "qty": 1, "unit": "pincée"}}
            ],
            "steps": ["Étape 1...", "Étape 2..."]
        }},
        "healthy": {{
            "title": "Nom du plat version allégée, saine et riche en micronutriments",
            "prep_time": "15", "cook_time": "15", "total_time": "30", "nova_score": 1,
            "macros": {{"proteines": "22g", "lipides": "5g", "glucides": "35g"}},
            "ingredients": [{{"name": "Riz noir", "qty": 60, "unit": "g"}}],
            "steps": ["..."]
        }},
        "protein": {{
            "title": "Nom du plat version enrichie en protéines (bâtisseur musculaire)",
            "prep_time": "20", "cook_time": "20", "total_time": "40", "nova_score": 2,
            "macros": {{"proteines": "45g", "lipides": "12g", "glucides": "30g"}},
            "ingredients": [{{"name": "Filet de poulet", "qty": 150, "unit": "g"}}],
            "steps": ["..."]
        }},
        "gourmand": {{
            "title": "Nom du plat version généreuse et réconfortante (sauce onctueuse ou fromage fondant)",
            "prep_time": "15", "cook_time": "25", "total_time": "40", "nova_score": 3,
            "macros": {{"proteines": "28g", "lipides": "22g", "glucides": "50g"}},
            "ingredients": [{{"name": "Crème fraîche", "qty": 30, "unit": "ml"}}],
            "steps": ["..."]
        }}
    }}"""

    try:
        return jsonify(validate_pack(call_llm(prompt)))
    except Exception as e:
        print(f"Erreur d'inférence ou de parsing (structure de secours) : {e}")
        # Structure miroir propre pour éviter tout crash JavaScript côté client
        return jsonify(fallback_pack()), 500


if __name__ == "__main__":
    # Par défaut : local uniquement. Pour tester depuis un smartphone sur le réseau : HOST=0.0.0.0
    app.run(debug=os.getenv("FLASK_DEBUG") == "1", host=os.getenv("HOST", "127.0.0.1"))
