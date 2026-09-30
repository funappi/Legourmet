<div align="center">

  <h1>🍳 Le Gourmet Premium</h1>
  <p><b>Laboratoire d'Alchimie Culinaire Assisté par IA & Générateur Multi-Variantes</b></p>

  <p>
    <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+" />
    <img src="https://img.shields.io/badge/Flask-3.0-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask 3.0" />
   <img src="https://img.shields.io/badge/Groq_API-Llama 3.1-f43f5e?style=for-the-badge&logo=openai&logoColor=white"llama3.1" />
    <img src="https://img.shields.io/badge/SQLite3-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite3" />
    <img src="https://img.shields.io/badge/Frontend-Vanilla_JS_/_CSS3-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="Vanilla JS" />
  </p>

  <p>
    <i>Une application web full-stack d'alchimie culinaire. Transformez vos contraintes réelles (ingrédients du frigo, matériel disponible, régime et audace) en recettes gastronomiques déclinées en 4 variantes nutritionnelles.</i>
  </p>

</div>

---

## 📖 Sommaire

- [À propos du projet](#-à-propos-du-projet)
- [Fonctionnalités clés](#-fonctionnalités-clés)
- [Architecture & Pipeline IA](#-architecture--pipeline-ia)
- [Structure du Projet](#-structure-du-projet)
- [Documentation de l'API REST](#-documentation-de-lapi-rest)
- [Installation & Lancement Local](#-installation--lancement-local)
- [Déploiement & CI/CD (GitHub Actions)](#-déploiement--cicd-github-actions)
- [Design System & Thèmes](#-design-system--thèmes)

---

## 💡 À propos du projet

**Le Gourmet Premium** résout le problème classique du *"Qu'est-ce qu'on mange ce soir ?"* en combinant la précision d'une base de données locale (SQLite) et la créativité d'un grand modèle de langage (Llama 3.1 via Groq API).

Contrairement aux générateurs de recettes génériques :
1. **Il respecte la réalité physique de votre cuisine** : Si vous n'avez qu'un *Airfryer* ou un *Micro-ondes*, l'IA réinvente la méthode de cuisson sans inventer d'étapes impossibles.
2. **Il verrouille le domaine culinaire (Sucré / Salé)** : Impossible d'obtenir du poulet ou des lardons dans une crêpe ou un tiramisu protéiné.
3. **Il décline chaque idée en 4 variantes scientifiques** : *Original*, *Healthy*, *Protéiné* et *Gourmand*.
4. **Il ne ment pas sur la nutrition** : Les calories et macronutriments sont calculés ou vérifiés de manière déterministe via la base SQLite plutôt que d'être inventés par le LLM.

---

## 🌟 Fonctionnalités clés

### 🧠 Moteur d'Idéation & de Déclinaison (2 Phases)
* **Phase 1 — Idéation** : À partir de vos envies ou de vos restes, l'application génère **3 concepts culinaires uniques**. Si vous demandez un plat précis (ex: *"Lasagnes"*), le moteur verrouille ce choix et vous propose 3 déclinaisons de ce même plat.
* **Phase 2 — Génération des 4 Variantes** : L'idée sélectionnée est déclinée simultanément en :
  * **✨ Original** : La recette authentique avec un twist optionnel.
  * **🌿 Healthy** : Réduction des sucres et gras ajoutés, enrichissement en fibres et légumes.
  * **💪 Protéiné** : Augmentation significative de l'apport protéique avec des ingrédients adaptés au domaine (skyr/whey pour le sucré, volaille/œufs/tofu pour le salé).
  * **🧀 Gourmand** : Accentuation du caractère riche et réconfortant.

### 🍳 Filtres & Réalité de la Cuisine
* **Matériel exclusif (Liste fermée)** : Four, Micro-ondes, Airfryer, Plaques de cuisson.
* **Type de plat strict** : Verrouillage absolu Salé / Sucré.
* **Profils & Régimes** : Végétarien, Végan, Sans Gluten, Sans Lactose.
* **Styles de cuisson & Fusions** : Sauté au Wok, Mijoté, Vapeur, Papillote, Frit, Rôti, etc.
* **Curseurs de personnalisation** : Audace culinaire (*Classique*, *Original*, *Aventure*) et Complexité (*Fast Food*, *Amateur*, *Michelin*).

### 🛠️ Outils UX & Confort
* **Mr. Cook Widget** : Calculateur dynamique de portions réajustant automatiquement les grammages en direct.
* **Checklist interactive** : Cocher les ingrédients au fur et me mesure des courses et les étapes pendant la cuisine.
* **Exportation Notes & Screenshot** : Copie de la liste de courses dans le presse-papier et génération d'une capture d'écran HD nettoyée (via `html2canvas`) adaptée au thème (Clair/Sombre).
* **Système de Favoris** : Sauvegarde locale de vos recettes préférées dans le `localStorage`.

---

## 🏗️ Architecture & Pipeline IA

Le système repose sur un **moteur hybride dégroupé** où Python joue le rôle d'arbitre déterministe et le LLM le rôle de créateur gastronomique.

```text
 ┌────────────────────────┐
 │   FRONTEND (Client)    │
 │ Vanilla JS / HTML / CSS│
 └───────────┬────────────┘
             │ 1. POST /generate-ideas
             ▼
 ┌────────────────────────┐      2. Prompt avec      ┌────────────────────────┐
 │   SERVER FLASK (App)   │ ───────────────────────> │    LLM GROQ (Llama)    │
 │                        │ <─────────────────────── │   Génération des 3     │
 └───────────┬────────────┘      3. Réponses JSON    │        Idées               │
             │                                       └────────────────────────┘
             │ 4. Choix d'une idée par l'utilisateur
             ▼
 ┌────────────────────────┐      5. Master Prompt    ┌────────────────────────┐
 │   SERVER FLASK (App)   │ ───────────────────────> │    LLM GROQ (Llama)    │
 │   + Airbag Python      │ <─────────────────────── │  Génération 4 Variantes│
 └───────────┬────────────┘      6. JSON Recettes    └────────────────────────┘
             │
             │ 7. Contrôle de cohérence (Verrou Sucré/Salé & Matériel)
             │ 8. Calcul/Enrichissement des macros via SQLite
             ▼
 ┌────────────────────────┐
 │   RENDU FICHE RECETTE  │
 └────────────────────────┘
