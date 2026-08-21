/**
 * REGISTRE DES ACTIONS
 * -----------------------------------------------------------------------------
 * Assemble le catalogue des formulaires pris en charge par la passerelle.
 *
 * AJOUTER UN FORMULAIRE : créer le fichier 1x_Action_*.gs contenant sa fonction
 * SPEC_<ACTION>, puis ajouter une ligne à declarationsFormulaires_() ci-dessous.
 * C'est le seul fichier existant à modifier.
 *
 * POURQUOI UNE LISTE EXPLICITE : Apps Script n'expose pas les fonctions de
 * premier niveau à l'énumération (`Object.keys(globalThis)` ne les liste pas),
 * une découverte automatique par convention de nommage y est donc impossible.
 *
 * POURQUOI UNE FONCTION PLUTÔT QU'UN TABLEAU CONSTANT : les fichiers .gs d'un
 * projet partagent un seul espace global et sont chargés dans un ordre que
 * l'éditeur ne garantit pas. Un tableau de premier niveau serait évalué au
 * chargement, donc potentiellement avant que les fichiers d'actions n'aient été
 * lus. En plaçant les références dans le corps d'une fonction, elles ne sont
 * résolues qu'à la première invocation — après chargement complet du projet.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Liste des formulaires actifs.
 *
 * Chaque entrée est une RÉFÉRENCE de fonction (sans parenthèses), pas un appel.
 * Une entrée pointant vers une fonction inexistante provoque une ReferenceError
 * explicite dès la première requête, mentionnant le nom fautif.
 *
 * @return {!Array<!Function>} Fonctions déclarant chacune une action.
 */
function declarationsFormulaires_() {
  return [
    // --- Comptes utilisateur -------------------------------------------------
    SPEC_CREATION_COMPTE,
    SPEC_CHANGEMENT_OU,
    SPEC_MISE_A_JOUR_PROFIL,
    SPEC_RENOMMER_COMPTE,
    SPEC_SUPPRESSION_COMPTE,

    // --- Groupes -------------------------------------------------------------
    SPEC_AJOUT_GROUPE,
    SPEC_RETRAIT_GROUPE,
    SPEC_RETRAIT_TOUS_GROUPES,
    SPEC_CREATION_GROUPE,
    SPEC_SUPPRESSION_GROUPE,
    SPEC_LISTE_MEMBRES_GROUPE,

    // --- Alias e-mail --------------------------------------------------------
    SPEC_AJOUT_ALIAS,
    SPEC_RETRAIT_ALIAS,

    // --- Sécurité ------------------------------------------------------------
    SPEC_SUSPENSION,
    SPEC_REACTIVATION,
    SPEC_RESET_MOT_DE_PASSE,
    SPEC_DECONNEXION_FORCEE,
    SPEC_REVOCATION_TOKENS_APPS,
    SPEC_GENERATION_CODES_SECOURS,

    // --- Appareils mobiles ---------------------------------------------------
    SPEC_EFFACEMENT_APPAREIL,
    SPEC_BLOCAGE_APPAREIL,
    SPEC_APPROBATION_APPAREIL,

    // --- Messagerie (nécessitent un compte de service + DWD) -----------------
    SPEC_DELEGATION_EMAIL,
    SPEC_RETRAIT_DELEGATION_EMAIL,
    SPEC_REPONSE_ABSENCE,
    SPEC_DESACTIVATION_REPONSE_ABSENCE,
    SPEC_TRANSFERT_EMAILS,
    SPEC_ARRET_TRANSFERT_EMAILS,
    SPEC_SIGNATURE_EMAIL,

    // --- Configuration des Groupes (Groups Settings API) --------------------
    SPEC_CONFIG_GROUPE,

    // --- Drive ---------------------------------------------------------------
    SPEC_TRANSFERT_DRIVE,

    // --- Licences ------------------------------------------------------------
    SPEC_ATTRIBUTION_LICENCE,
    SPEC_RETRAIT_LICENCE,

    // --- Diagnostic & Support (lecture seule) -------------------------------
    SPEC_INFO_COMPTE,
    SPEC_AUDIT_ACCES_COMPLET,

    // --- Drives partagés (Shared Drives) -------------------------------------
    SPEC_AJOUT_MEMBRE_DRIVE_PARTAGE,
    SPEC_RETRAIT_MEMBRE_DRIVE_PARTAGE,
    SPEC_CREATION_DRIVE_PARTAGE,

    // --- Calendriers Google & Ressources ------------------------------------
    SPEC_PARTAGE_CALENDRIER,
    SPEC_RETRAIT_PARTAGE_CALENDRIER,
    SPEC_CREATION_RESSOURCE_CALENDRIER,
    SPEC_SUPPRESSION_RESSOURCE_CALENDRIER,

    // --- Groupes d'action (séquences orchestrées) ----------------------------
    SPEC_ARRIVEE_COLLABORATEUR,
    SPEC_DEPART_COLLABORATEUR,
    SPEC_RETOUR_ABSENCE,
    SPEC_URGENCE_COMPROMISSION,
    SPEC_MUTATION_INTERNE,
    SPEC_ARCHIVAGE_COMPTE
  ];
}

/**
 * Préfixe attendu sur le nom d'une fonction déclarant une action.
 * @const {string}
 */
const PREFIXE_SPEC = 'SPEC_';

/**
 * Cache du registre, construit à la première demande.
 * Volontairement `let` et non `const` : l'affectation se fait dans une
 * fonction, jamais au chargement du fichier.
 * @type {?Object}
 */
let REGISTRE_CACHE = null;

/**
 * Construit (une seule fois par exécution) et retourne le registre des actions.
 *
 * @return {!Object<string, !Object>} Index nom d'action → spécification.
 * @throws {AppError_} Si la liste est vide ou si une déclaration est invalide —
 *     mieux vaut un échec explicite au premier appel qu'une action
 *     silencieusement absente du catalogue.
 */
function getActions_() {
  if (REGISTRE_CACHE) return REGISTRE_CACHE;

  const declarations = declarationsFormulaires_();
  const registre = {};

  declarations.forEach(function (declaration, i) {
    const position = 'entrée #' + (i + 1) + " de declarationsFormulaires_()";

    if (typeof declaration !== 'function') {
      throw new AppError_('REGISTRE_INVALIDE',
        position + ' n\'est pas une fonction. Référencer SPEC_MON_ACTION ' +
        'sans parenthèses.', 500);
    }

    const nom = declaration.name || position;
    let spec;
    try {
      spec = declaration();
    } catch (err) {
      throw new AppError_('REGISTRE_INVALIDE',
        'La déclaration ' + nom + ' a échoué : ' + err.message, 500);
    }
    validerSpec_(nom, spec);

    if (registre[spec.action]) {
      throw new AppError_('REGISTRE_INVALIDE',
        "L'action '" + spec.action + "' est déclarée deux fois dans " +
        'declarationsFormulaires_().', 500);
    }
    registre[spec.action] = spec;
  });

  if (!Object.keys(registre).length) {
    throw new AppError_('REGISTRE_VIDE',
      'Aucun formulaire déclaré. Compléter declarationsFormulaires_() dans ' +
      '01_Registre.gs.', 500);
  }

  REGISTRE_CACHE = registre;
  return registre;
}

/**
 * Retourne la spécification d'une action, ou undefined si elle n'existe pas.
 * @param {string} nomAction Nom de l'action recherchée.
 * @return {!Object|undefined}
 */
function getSpec_(nomAction) {
  return getActions_()[nomAction];
}

/**
 * Liste les noms d'actions disponibles.
 * @return {!Array<string>} Noms triés par ordre alphabétique.
 */
function listerActions_() {
  return Object.keys(getActions_()).sort();
}

/**
 * Vérifie qu'une spécification respecte le contrat attendu par le routeur.
 * Contrôle volontairement strict : une faute de frappe dans un nom de champ
 * obligatoire ne se verrait sinon qu'au premier ticket réel.
 *
 * @param {string} nom Nom de la fonction déclarante (pour le message d'erreur).
 * @param {*} spec Spécification à valider.
 * @throws {AppError_} Si la spécification est incomplète ou mal typée.
 */
function validerSpec_(nom, spec) {
  const exige = function (condition, detail) {
    if (!condition) {
      throw new AppError_('REGISTRE_INVALIDE', nom + ' : ' + detail, 500);
    }
  };

  exige(spec && typeof spec === 'object', 'doit retourner un objet.');
  exige(typeof spec.action === 'string' && spec.action,
    "champ 'action' manquant.");
  exige(nom.indexOf(PREFIXE_SPEC) !== 0 ||
        spec.action === nom.slice(PREFIXE_SPEC.length),
    "le champ 'action' (" + spec.action + ") doit correspondre au nom de la " +
    'fonction (' + nom + ').');
  exige(typeof spec.handler === 'function', "champ 'handler' absent ou non fonction.");
  exige(Array.isArray(spec.required), "champ 'required' doit être un tableau.");
  exige(Array.isArray(spec.emails), "champ 'emails' doit être un tableau.");
  exige(spec.fenetre === 'STANDARD' || spec.fenetre === 'PERMANENTE',
    "champ 'fenetre' invalide (reçu '" + spec.fenetre +
    "'). Valeurs admises : 'STANDARD', 'PERMANENTE'.");

  // Un champ listé dans `emails` sans exister ailleurs n'est pas une erreur
  // (il peut être optionnel), mais l'inverse trahit une faute de frappe.
  spec.required.forEach(function (champ) {
    exige(typeof champ === 'string' && champ,
      "la liste 'required' contient une entrée vide.");
  });
}