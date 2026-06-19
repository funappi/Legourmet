Voici une version totalement épurée, anonymisée et sécurisée de ton fichier **`README.md`**. Tous tes détails personnels (comme ton pseudo exact, tes chemins de dossiers privés ou tes clés) ont été remplacés par des balises génériques (`VOTRE_PSEUDO`, `VOTRE_DOMAINE`).

Tu peux copier-coller ce contenu directement à la racine de ton projet sur GitHub sans craindre d'exposer ta vie privée ou la sécurité de ton serveur :

```markdown
# 🍳 Le Gourmet Premium — Laboratoire Culinaire IA & Créateur de Saveurs

Le Gourmet Premium est une application web moderne reposant sur une architecture dégroupée (*Decoupled Architecture*). Elle révolutionne l'improvisation en cuisine grâce à l'intelligence artificielle en combinant un système d'autocomplétion basé sur une base de données locale, une analyse chromatique des saveurs, et une génération instantanée de recettes multi-variantes.

---

## 🏗️ Architecture Globale du Système

Pour garantir une vitesse d'exécution optimale, une sécurité totale des clés d'accès et une gratuité des infrastructures, le projet est divisé en deux entités indépendantes :

* **Frontend (L'Interface) — GitHub Pages :** Hébergement statique et hautement performant contenant les interfaces utilisateur (HTML5 / CSS3), la gestion des thèmes et la logique d'interaction dynamique (JavaScript ES6).
* **Backend (Le Cerveau) — API Flask :** Serveur d'API privé gérant les connexions sécurisées à l'infrastructure LLM, l'accès à la base de données relationnelle locale et le traitement des requêtes sans jamais exposer les clés secrètes au grand public.
* **Automatisation (Le Majordome) — GitHub Actions :** Un pipeline CI/CD automatisé qui se charge de synchroniser le design, mais aussi de piloter le serveur à distance pour le maintenir en ligne indéfiniment de manière autonome (tâche planifiée Cron).

---

## 🌟 Fonctionnalités Majeures

* **Saisie Tri-Entrée Culinaire :** Moteur d'autocomplétion prédictif branché sur une base SQLite pour isoler finement les Féculents, Protéines et Légumes.
* **Machine Anti-Gaspi :** Système de sélection interactive avec verrous physiques pour improviser intelligemment à partir des restes du réfrigérateur.
* **Roue des Saveurs Chromatique :** Analyseur trigonométrique capturant graphiquement le profil aromatique ciblé (Frais, Épicé, Sucré, Umami) selon la position du curseur.
* **Moteur Multi-Variantes LLM :** Inférence IA ultra-rapide via l'API Groq (Llama 3.1) générant simultanément 4 déclinaisons autonomes d'un même plat (*Original*, *Healthy*, *Protéiné*, *Gourmand*).
* **Imagerie Culinaire Contextuelle :** Génération à la volée de photographies culinaires professionnelles et réalistes via l'API asynchrone de Pollinations.ai.
* **Mr. Cook Widget :** Calculateur dynamique qui réajuste instantanément les quantités d'ingrédients, les temps de cuisson et les indicateurs nutritionnels selon le nombre de portions.

---

## 📂 Structure du Projet

### 💻 Répertoire Frontend (Dépôt GitHub)
```text
.
├── index.html          # Structure HTML5 sémantique de l'application
├── style.css           # Design système, animations néons et défilements réactifs
├── main.js             # Logique centrale, gestion des modes, des portions et du rendu
├── inventory.js        # Moteur d'autocomplétion et d'injection des tags d'ingrédients
└── .github/
    └── workflows/
        └── deploy.yml  # Robot d'automatisation et de maintenance temporelle

```

### 🐍 Répertoire Backend (Serveur Privé)

```text
/home/VOTRE_NOM_UTILISATEUR/
├── app.py              # Serveur Flask, routage API, gestion CORS et requêtes Groq
├── legourmet.db        # Base de données SQLite contenant les tables d'ingrédients
└── .env                # FICHIER PRIVÉ (Clé API secrète - Ne jamais envoyer sur GitHub)

```

---

## 🛠️ Déploiement et Configuration Sécurisée

### 1. Configuration du Serveur d'API

1. Déposez les fichiers `app.py`, `legourmet.db` et votre fichier `.env` sur votre serveur d'hébergement Python.
2. Installez l'environnement logiciel requis via votre terminal :
```bash
pip install flask flask-cors groq python-dotenv

```


3. Configurez votre point d'entrée WSGI en y incluant le chemin absolu vers votre dossier d'application pour lier correctement l'application Flask :
```python
import sys
import os

path = '/home/VOTRE_NOM_UTILISATEUR/'
if path not in sys.path:
    sys.path.append(path)

from app import app as application

```



### 2. Isolation des Clés via les Secrets GitHub

Pour que l'application puisse communiquer et s'automatiser sans écrire de données sensibles dans le code public, vous devez configurer les variables secrètes dans l'onglet **Settings** > **Secrets and variables** > **Actions** de votre dépôt GitHub :

* `PA_USER` : Votre nom d'utilisateur serveur.
* `PA_DOMAIN` : L'adresse URL de votre API backend (en minuscules).
* `PA_API_TOKEN` : Le jeton d'authentification privé généré par votre hébergeur.

### 3. Automatisation Intelligente (Zéro Maintenance)

Le fichier `.github/workflows/deploy.yml` intègre un déclencheur temporel basé sur une tâche Cron :

```yaml
on:
  push:
    branches:
      - main
  schedule:
    - cron: '0 0 * * 1' # Exécution automatique tous les lundis à minuit

```

Ce réveil hebdomadaire automatique ordonne à GitHub de se connecter à l'API de votre hébergeur pour valider la prolongation gratuite de votre serveur d'hébergement. **Le compteur de validité de votre application est ainsi repoussé à perpétuité dans le futur, garantissant un fonctionnement 100 % autonome sans aucune intervention humaine.**

---

## 🖥️ Technologies et Protocoles Employés

* **Langages :** HTML5, CSS3 Moderne, JavaScript (ES6+), Python 3.10, SQL (SQLite).
* **Frameworks :** Flask 3.0 (Gestion d'API), Flask-CORS (Contournement des blocages de sécurité Cross-Origin).
* **Modèles d'Intelligence Artificielle :** LLM Llama 3.1 (8B) via Groq Cloud API, Générateur d'images par diffusion Pollinations.ai.
* **Sécurité :** Chiffrement asymétrique via les secrets de dépôt GitHub, isolation des clés locales via fichier `.env`.

```

```
