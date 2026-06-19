from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from groq import Groq
import os
import json
import sqlite3
from dotenv import load_dotenv

load_dotenv()
print(f"Laboratoire Le Gourmet - Clé Groq détectée : {os.getenv('GROQ_API_KEY') is not None}")

app = Flask(__name__, static_folder='static')
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Connexion centralisée à la base SQLite locale (CIQUAL)
def get_db_connection():
    conn = sqlite3.connect('legourmet.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

# --- CODE 2 : AUTOCÒMPLÈTION NETTOYÉE ET SÉCURISÉE AVEC DISTINCT ---
@app.route('/api/ingredients', methods=['GET'])
def search_ingredients():
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])
    try:
        conn = get_db_connection()
        # Sélection unique nettoyée pour éliminer les doublons de l'autocomplétion
        cursor = conn.execute(
            "SELECT DISTINCT nom, categorie, calories FROM ingredients WHERE nom LIKE ? LIMIT 8", 
            (f"%{query}%",)
        )
        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(results)
    except Exception as e:
        print(f"Erreur DB Autocomplete: {e}")
        return jsonify([])

# --- CODE 1 & 2 : CHARGEMENT DES SUGGESTIONS DES ROULETTES AU DEMARRAGE ---
@app.route('/get-ingredients', methods=['GET'])
def get_ingredients():
    try:
        conn = get_db_connection()
        bases = [dict(row) for row in conn.execute("SELECT nom, calories FROM ingredients WHERE categorie = 'base'").fetchall()]
        proteins = [dict(row) for row in conn.execute("SELECT nom, calories FROM ingredients WHERE categorie = 'protein'").fetchall()]
        vegetables = [dict(row) for row in conn.execute("SELECT nom, calories FROM ingredients WHERE categorie = 'vegetable'").fetchall()]
        conn.close()
        return jsonify({"bases": bases, "proteins": proteins, "vegetables": vegetables})
    except Exception as e:
        print(f"Erreur DB get_ingredients: {e}")
        return jsonify({"error": str(e)}), 500

# --- LE MOTEUR D'ALCHIMIE CULINAIRE EN 4 VERSIONS SIMULTANÉES ---
@app.route('/generate-recipe', methods=['POST'])
def generate_recipe():
    data = request.json
    
    # Extraction exhaustive des données (Combinaison Code 1 & Code 2)
    mode = data.get('mode', 'Avancé')
    simple_prompt = data.get('simple_prompt', 'N/A')
    ingredients_list = data.get('ingredients', [])
    equipment = data.get('equipment', [])
    
    base = data.get('base')
    protein = data.get('protein')
    vegetable = data.get('vegetable')
    flavor = data.get('flavor', 'Auto_FoodPairing')
    risk = data.get('risk', 'Auto_FoodPairing')
    time_level = data.get('time', 'Auto_FoodPairing')
    fusion = data.get('fusion', 'Auto_FoodPairing')

    # Construction adaptative des clauses sémantiques (Règle d'or ON/OFF de Code 1)
    if ingredients_list and "Auto_FoodPairing" not in ingredients_list:
        ing_clause = f"Impose l'utilisation stricte de ces éléments saisis par l'utilisateur : {', '.join(ingredients_list)}."
    else:
        base_clause = f"la base '{base}'" if base and base != "auto" and base != "Auto_FoodPairing" else "une base céréalière ou féculente de ton choix"
        protein_clause = f"la protéine '{protein}'" if protein and protein != "auto" and protein != "Auto_FoodPairing" else "une source de protéine de ton choix"
        veg_clause = f"le légume '{vegetable}'" if vegetable and vegetable != "auto" and vegetable != "Auto_FoodPairing" else "un accompagnement de légumes de ton choix"
        ing_clause = f"Utilise harmonieusement les éléments suivants : {base_clause}, {protein_clause} et {veg_clause}."

    equip_clause = f"Matériel disponible à utiliser obligatoirement : {', '.join(equipment) if isinstance(equipment, list) else equipment}." if equipment and "Auto_FoodPairing" not in equipment else "Matériel de cuisine : Libre choix selon la cohérence de la recette."
    flavor_clause = f"Profil aromatique ciblé de la sauce ou du liant : {flavor}." if flavor and flavor != "auto" and flavor != "Auto_FoodPairing" else "Profil aromatique : Crée l'équilibre idéal de ton choix."
    risk_clause = f"Prise de risque culinaire (degré d'audace moléculaire) : {risk}/3." if risk and risk != "auto" and risk != "Auto_FoodPairing" else "Prise de risque : Laisse libre cours à ton inspiration de chef."
    time_clause = f"Contrainte de temps globale : {time_level}." if time_level and time_level != "auto" and time_level != "Auto_FoodPairing" else "Temps de préparation : S'adaptant au profil thématique."
    fusion_clause = f"Univers culturel / Fusion transnational : {fusion}." if fusion and fusion != "auto" and fusion != "Auto_FoodPairing" else "Mariage des cultures : Libres affinités chimiques."

    # Assemblage du Prompt Maître Multidimensionnel à structure stricte pour 1 personne (Code 2)
    prompt = f"""Tu es un Chef Alchimiste Étoilé Expert en Food Pairing Moléculaire et Chimie des Saveurs. 
    Génère une recette fusion unique rédigée entièrement en français, déclinée simultanément en 4 versions distinctes basées sur ces contraintes :
    
    CONTEXTE D'APPEL :
    - Mode d'exécution de l'application : {mode}
    - Saisie libre de l'utilisateur (si Mode Simple) : {simple_prompt}
    
    PARAMÈTRES MOLÉCULAIRES APPLIQUÉS :
    - {ing_clause}
    - {equip_clause}
    - {flavor_clause}
    - {risk_clause}
    - {time_clause}
    - {fusion_clause}

    CONSIGNES DE STRUCTURATION UNIQUEMENT POUR 1 PERSONNE :
    1. Pour chaque déclinaison, estime précisément le temps de préparation (prep_time), de cuisson (cook_time) et le total en minutes (chaînes de caractères numériques).
    2. Estime rigoureusement le score de transformation industrielle NOVA (1 à 4) et les macros par portion.
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
            "prep_time": "15",
            "cook_time": "15",
            "total_time": "30",
            "nova_score": 1,
            "macros": {{"proteines": "22g", "lipides": "5g", "glucides": "35g"}},
            "ingredients": [
                {{"name": "Riz noir", "qty": 60, "unit": "g"}},
                {{"name": "Filet de poulet", "qty": 100, "unit": "g"}}
            ],
            "steps": ["..."]
        }},
        "protein": {{
            "title": "Nom du plat version enrichie en protéines (bâtisseur musculaire)",
            "prep_time": "20",
            "cook_time": "20",
            "total_time": "40",
            "nova_score": 2,
            "macros": {{"proteines": "45g", "lipides": "12g", "glucides": "30g"}},
            "ingredients": [
                {{"name": "Riz noir", "qty": 60, "unit": "g"}},
                {{"name": "Filet de poulet", "qty": 150, "unit": "g"}}
            ],
            "steps": ["..."]
        }},
        "gourmand": {{
            "title": "Nom du plat version Fat, généreuse et réconfortante (sauce onctueuse ou fromage fondant)",
            "prep_time": "15",
            "cook_time": "25",
            "total_time": "40",
            "nova_score": 3,
            "macros": {{"proteines": "28g", "lipides": "22g", "glucides": "50g"}},
            "ingredients": [
                {{"name": "Riz noir", "qty": 80, "unit": "g"}},
                {{"name": "Filet de poulet", "qty": 120, "unit": "g"}},
                {{"name": "Crème fraîche", "qty": 30, "unit": "ml"}}
            ],
            "steps": ["..."]
        }}
    }}"""

    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        raw_content = completion.choices[0].message.content
        print(f"Réponse brute générée du laboratoire : {raw_content}")
        return jsonify(json.loads(raw_content))
        
    except Exception as e:
        print(f"Erreur d'inférence ou de parsing (Activation structure de secours) : {e}")
        # CODE 1 : Génération d'une structure de secours miroir propre pour éviter tout crash Javascript
        fallback_struct = {}
        for version in ["original", "healthy", "protein", "gourmand"]:
            fallback_struct[version] = {
                "title": f"Création Alchimique ({version.capitalize()})",
                "prep_time": "0", "cook_time": "0", "total_time": "0", "nova_score": 0,
                "macros": {"proteines": "0g", "lipides": "0g", "glucides": "0g"},
                "ingredients": [{"name": "Ingrédients indéterminés (Vérifier serveur)", "qty": 0, "unit": "g"}],
                "steps": ["Le laboratoire subit une surcharge thermique ou de connexion API. Veuillez relancer la génération."]
            }
        return jsonify(fallback_struct), 500

if __name__ == '__main__':
    # Configuration ouverte sur le réseau local (0.0.0.0) idéale pour les tests sur smartphone
    app.run(debug=True, host='0.0.0.0')