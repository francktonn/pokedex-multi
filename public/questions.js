// Banque de questions Oui/Non pour le mode "Devinette par questions".
// Fichier partagé : chargé côté serveur (api/room.js) via
// require('../public/questions.js') pour valider les questions posées, et côté
// client via <script src="questions.js"></script> pour la barre de recherche.
// Chaque question a un id STABLE (ne jamais le changer
// une fois en prod, sinon les usedQuestionIds des parties en cours ne matcheront plus).
//
// Les réponses ne sont PAS calculées automatiquement par le serveur : chaque joueur
// interrogé répond lui-même en regardant les infos de son propre Pokémon déjà
// affichées à l'écran (types, catégorie, génération, taille/poids, etc.).
(function (root) {
  var POKEDEX_QUESTIONS = [
    // ---- Types (18) ----
    { id: "type_normal", text: "Est-ce un Pokémon de type Normal ?", tags: ["type", "normal"] },
    { id: "type_feu", text: "Est-ce un Pokémon de type Feu ?", tags: ["type", "feu"] },
    { id: "type_eau", text: "Est-ce un Pokémon de type Eau ?", tags: ["type", "eau"] },
    { id: "type_electrik", text: "Est-ce un Pokémon de type Électrik ?", tags: ["type", "electrik", "électrik"] },
    { id: "type_plante", text: "Est-ce un Pokémon de type Plante ?", tags: ["type", "plante"] },
    { id: "type_glace", text: "Est-ce un Pokémon de type Glace ?", tags: ["type", "glace"] },
    { id: "type_combat", text: "Est-ce un Pokémon de type Combat ?", tags: ["type", "combat"] },
    { id: "type_poison", text: "Est-ce un Pokémon de type Poison ?", tags: ["type", "poison"] },
    { id: "type_sol", text: "Est-ce un Pokémon de type Sol ?", tags: ["type", "sol"] },
    { id: "type_vol", text: "Est-ce un Pokémon de type Vol ?", tags: ["type", "vol"] },
    { id: "type_psy", text: "Est-ce un Pokémon de type Psy ?", tags: ["type", "psy", "psychic"] },
    { id: "type_insecte", text: "Est-ce un Pokémon de type Insecte ?", tags: ["type", "insecte"] },
    { id: "type_roche", text: "Est-ce un Pokémon de type Roche ?", tags: ["type", "roche"] },
    { id: "type_spectre", text: "Est-ce un Pokémon de type Spectre ?", tags: ["type", "spectre"] },
    { id: "type_dragon", text: "Est-ce un Pokémon de type Dragon ?", tags: ["type", "dragon"] },
    { id: "type_tenebres", text: "Est-ce un Pokémon de type Ténèbres ?", tags: ["type", "tenebres", "ténèbres"] },
    { id: "type_acier", text: "Est-ce un Pokémon de type Acier ?", tags: ["type", "acier"] },
    { id: "type_fee", text: "Est-ce un Pokémon de type Fée ?", tags: ["type", "fee", "fée"] },

    // ---- Catégorie (6) ----
    { id: "cat_legendaire", text: "Est-il légendaire ?", tags: ["categorie", "légendaire", "rare"] },
    { id: "cat_mythique", text: "Est-il fabuleux (Pokémon mythique) ?", tags: ["categorie", "fabuleux", "mythique"] },
    { id: "cat_ultra", text: "Est-ce une Ultra-Chimère ?", tags: ["categorie", "ultra-chimère", "ultrabeast"] },
    { id: "cat_fossile", text: "Est-ce un Pokémon fossile ?", tags: ["categorie", "fossile"] },
    { id: "cat_starter", text: "Est-ce un Pokémon starter (de départ) ?", tags: ["categorie", "starter"] },
    { id: "cat_bebe", text: "Est-ce un Pokémon bébé ?", tags: ["categorie", "bébé", "bebe"] },

    // ---- Génération (7) ----
    { id: "gen_1", text: "Vient-il de la 1ère génération ?", tags: ["génération", "1", "kanto"] },
    { id: "gen_2", text: "Vient-il de la 2ème génération ?", tags: ["génération", "2", "johto"] },
    { id: "gen_3", text: "Vient-il de la 3ème génération ?", tags: ["génération", "3", "hoenn"] },
    { id: "gen_4", text: "Vient-il de la 4ème génération ?", tags: ["génération", "4", "sinnoh"] },
    { id: "gen_5", text: "Vient-il de la 5ème génération ?", tags: ["génération", "5", "unys"] },
    { id: "gen_6", text: "Vient-il de la 6ème génération ?", tags: ["génération", "6", "kalos"] },
    { id: "gen_7", text: "Vient-il de la 7ème génération ?", tags: ["génération", "7", "alola"] },

    // ---- Couleur (10) ----
    { id: "color_noir", text: "Est-il principalement de couleur noire ?", tags: ["couleur", "noir"] },
    { id: "color_bleu", text: "Est-il principalement de couleur bleue ?", tags: ["couleur", "bleu"] },
    { id: "color_marron", text: "Est-il principalement de couleur marron ?", tags: ["couleur", "marron"] },
    { id: "color_gris", text: "Est-il principalement de couleur grise ?", tags: ["couleur", "gris"] },
    { id: "color_vert", text: "Est-il principalement de couleur verte ?", tags: ["couleur", "vert"] },
    { id: "color_rose", text: "Est-il principalement de couleur rose ?", tags: ["couleur", "rose"] },
    { id: "color_violet", text: "Est-il principalement de couleur violette ?", tags: ["couleur", "violet"] },
    { id: "color_rouge", text: "Est-il principalement de couleur rouge ?", tags: ["couleur", "rouge"] },
    { id: "color_blanc", text: "Est-il principalement de couleur blanche ?", tags: ["couleur", "blanc"] },
    { id: "color_jaune", text: "Est-il principalement de couleur jaune ?", tags: ["couleur", "jaune"] },

    // ---- Habitat (9) ----
    { id: "habitat_grotte", text: "Vit-il dans une grotte ?", tags: ["habitat", "grotte"] },
    { id: "habitat_foret", text: "Vit-il en forêt ?", tags: ["habitat", "foret", "forêt"] },
    { id: "habitat_prairie", text: "Vit-il en prairie ?", tags: ["habitat", "prairie"] },
    { id: "habitat_montagne", text: "Vit-il en montagne ?", tags: ["habitat", "montagne"] },
    { id: "habitat_rare", text: "A-t-il un habitat rare ?", tags: ["habitat", "rare"] },
    { id: "habitat_terrain_accidente", text: "Vit-il en terrain accidenté ?", tags: ["habitat", "terrain accidenté"] },
    { id: "habitat_mer", text: "Vit-il en mer ?", tags: ["habitat", "mer"] },
    { id: "habitat_urbain", text: "Vit-il en zone urbaine ?", tags: ["habitat", "urbain", "ville"] },
    { id: "habitat_bord_eau", text: "Vit-il au bord de l'eau ?", tags: ["habitat", "bord de l'eau"] },

    // ---- Taille / poids (4) ----
    { id: "size_grand", text: "Mesure-t-il plus d'1 mètre ?", tags: ["taille", "grand"] },
    { id: "size_petit", text: "Mesure-t-il moins de 50 cm ?", tags: ["taille", "petit"] },
    { id: "weight_lourd", text: "Pèse-t-il plus de 50 kg ?", tags: ["poids", "lourd"] },
    { id: "weight_leger", text: "Pèse-t-il moins de 10 kg ?", tags: ["poids", "léger", "leger"] },
 
    // ---- Capture (2) ----
    { id: "capture_facile", text: "Sa capture est-elle facile ou très facile ?", tags: ["capture", "facile"] },
    { id: "capture_difficile", text: "Sa capture est-elle difficile, très difficile ou extrême ?", tags: ["capture", "difficile"] },

    // ---- Évolution (2) ----
    { id: "evo_peut_encore", text: "Peut-il encore évoluer ?", tags: ["évolution", "peut évoluer"] },
    { id: "evo_final", text: "Est-il au bout de sa chaîne d'évolution (ne peut plus évoluer) ?", tags: ["évolution", "final"] },

    // ---- Divers (3) ----
    { id: "multi_type", text: "A-t-il deux types (type double) ?", tags: ["type", "double"] },
    { id: "nom_long", text: "Son nom comporte-t-il plus de 8 lettres ?", tags: ["nom", "lettres"] },
    { id: "double_genre", text: "Existe-t-il en mâle ET en femelle ?", tags: ["genre", "mâle", "femelle"] }
  ];

  if (typeof module !== "undefined" && module.exports) {
    module.exports = POKEDEX_QUESTIONS;
  } else {
    root.POKEDEX_QUESTIONS = POKEDEX_QUESTIONS;
  }
})(typeof window !== "undefined" ? window : global);
