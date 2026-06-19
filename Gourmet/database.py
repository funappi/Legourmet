import sqlite3

def rebuild_database():
    # Connexion à la base de données (crée le fichier s'il n'existe pas)
    conn = sqlite3.connect('legourmet.db')
    cursor = conn.cursor()

    # 1. Recréation propre de la table ingredients
    cursor.execute("DROP TABLE IF EXISTS ingredients")
    cursor.execute("""
        CREATE TABLE ingredients (
            nom TEXT NOT NULL,
            categorie TEXT NOT NULL,
            calories INTEGER NOT NULL
        )
    """)

    # 2. Liste exhaustive d'ingrédients bruts sans doublons
    # Catégories redéfinies de façon logique :
    # - 'base' : Céréales, pâtes, riz, féculents, wraps
    # - 'protein' : Viandes, poissons, œufs, tofu, légumineuses
    # - 'vegetable' : Légumes, fruits, herbes fraîches
    # - 'sauce' : Condiments liquides complexes de cuisine
    # - 'corps_gras' : Huiles, beurres, crèmes
    # - 'epice' : Piments, aromates secs, graines, poudres aromatiques
    # - 'sucre_farine' : Sucres, miels, farines, liants
    ingredients_premium = [
        # === BASES, FÉCULENTS, RIZ, PÂTES & WRAPS ('base') ===
        ("Riz", "base", 350),
        ("Pâtes", "base", 350),
        ("Nouilles Soba", "base", 330),
        ("Nouilles Udon", "base", 130),
        ("Vermicelles de Riz", "base", 350),
        ("Quinoa", "base", 360),
        ("Patate Douce", "base", 86),
        ("Pomme de Terre", "base", 80),
        ("Semoule", "base", 350),
        ("Boulgour", "base", 342),
        ("Polenta", "base", 345),
        ("Feuille de Nori", "base", 35),
        ("Galette de Riz", "base", 340),
        ("Galette de Blé", "base", 310),
        ("Galette de Maïs", "base", 220),
        ("Pain Pita", "base", 275),
        ("Pain Naan", "base", 290),

        # === PROTÉINES BRUTES ('protein') ===
        ("Poulet", "protein", 110),
        ("Bœuf", "protein", 150),
        ("Porc", "protein", 160),
        ("Agneau", "protein", 220),
        ("Canard", "protein", 200),
        ("Saumon", "protein", 200),
        ("Cabillaud", "protein", 82),
        ("Thon", "protein", 140),
        ("Crevettes", "protein", 95),
        ("Tofu", "protein", 120),
        ("Tempeh", "protein", 190),
        ("Seitan", "protein", 140),
        ("Œuf", "protein", 145),
        ("Pois Chiches", "protein", 360),
        ("Lentilles", "protein", 350),
        ("Haricots Rouges", "protein", 330),
        ("Haricots Noirs", "protein", 340),
        ("Edamame", "protein", 120),

        # === LÉGUMES, FRUITS & FRAÎCHEUR SANS DOUBLONS ('vegetable') ===
        ("Brocoli", "vegetable", 34),
        ("Avocat", "vegetable", 160),
        ("Épinards", "vegetable", 23),
        ("Poivron", "vegetable", 26),
        ("Tomate", "vegetable", 18),
        ("Champignon", "vegetable", 22),
        ("Asperges", "vegetable", 20),
        ("Carotte", "vegetable", 41),
        ("Courgette", "vegetable", 17),
        ("Aubergine", "vegetable", 25),
        ("Chou", "vegetable", 25),
        ("Oignon", "vegetable", 40),
        ("Ail", "vegetable", 149),
        ("Gingembre", "vegetable", 80),
        ("Citron", "vegetable", 30),
        ("Mangue", "vegetable", 60),
        ("Pomme", "vegetable", 52),
        ("Ananas", "vegetable", 50),
        ("Coriandre", "vegetable", 23),
        ("Basilic", "vegetable", 23),
        ("Menthe", "vegetable", 44),
        ("Ciboulette", "vegetable", 30),

        # === SAUCES ('sauce') ===
        ("Sauce Soja", "sauce", 150),
        ("Sauce Teriyaki", "sauce", 90),
        ("Sauce Nuoc-mâm", "sauce", 55),
        ("Sauce Sriracha", "sauce", 120),
        ("Pâte de Curry", "sauce", 135),
        ("Pâte de Miso", "sauce", 200),
        ("Sauce Pesto", "sauce", 530),
        ("Sauce Tahini", "sauce", 595),
        ("Moutarde", "sauce", 150),
        ("Ketchup", "sauce", 110),

        # === CORPS GRAS, HUILES & PRODUITS LAITIERS ('corps_gras') ===
        ("Huile d'Olive", "corps_gras", 884),
        ("Huile de S Sesame", "corps_gras", 884),
        ("Huile de Tournesol", "corps_gras", 884),
        ("Beurre", "corps_gras", 717),
        ("Crème Fraîche", "corps_gras", 292),
        ("Lait de Coco", "corps_gras", 230),
        ("Fromage râpé", "corps_gras", 390),
        ("Fromage de Chèvre", "corps_gras", 268),
        ("Mozzarella", "corps_gras", 280),

        # === ÉPICES, GRAINES & CONDIMENTS SECS ('epice') ===
        ("Piment", "epice", 40),
        ("Sel", "epice", 0),
        ("Poivre", "epice", 250),
        ("Curry", "epice", 325),
        ("Paprika", "epice", 282),
        ("Cumin", "epice", 375),
        ("Cannelle", "epice", 247),
        ("Herbes de Provence", "epice", 270),
        ("Muscade", "epice", 525),
        ("Wasabi", "epice", 290),
        ("Graines de Sésame", "epice", 573),
        ("Graines de Chia", "epice", 486),
        ("Noix de Cajou", "epice", 553),
        ("Cacahuètes", "epice", 567),

        # === SUCRES, FARINES & LIANTS ('sucre_farine') ===
        ("Farine de Blé", "sucre_farine", 364),
        ("Fécule de Maïs (Maïzena)", "sucre_farine", 381),
        ("Sucre", "sucre_farine", 387),
        ("Miel", "sucre_farine", 304),
        ("Sirop d'Érable", "sucre_farine", 260)
    ]

    # 3. Insertion de la liste dans la table locale
    cursor.executemany("INSERT INTO ingredients (nom, categorie, calories) VALUES (?, ?, ?)", ingredients_premium)
    
    # Validation et sauvegarde
    conn.commit()
    conn.close()
    print(f"Base de données culinaire 'legourmet.db' reconstruite avec {len(ingredients_premium)} ingrédients premium !")

if __name__ == '__main__':
    rebuild_database()