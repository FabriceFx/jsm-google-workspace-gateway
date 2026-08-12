/**
 * CONFIGURATION GLOBALE
 * -----------------------------------------------------------------------------
 * Constantes non sensibles du projet et accès aux Propriétés du script.
 * Les secrets (SECRET_TOKEN...) ne figurent JAMAIS ici : ils vivent dans
 * Paramètres du projet > Propriétés du script.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.5.3)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Constantes non sensibles. Tout ce qui est secret vit dans les Propriétés du
 * script, jamais dans le code source (le code part dans Git / Drive partagé).
 * @const
 */
const CONFIG = Object.freeze({
  VERSION: '2.7.0',
  /** Longueur du mot de passe temporaire généré. */
  PASSWORD_LENGTH: 16,
  /** Durée max d'attente du verrou d'exclusion mutuelle (ms). */
  LOCK_TIMEOUT_MS: 20000,
  /** Onglet du classeur d'audit. */
  AUDIT_SHEET_NAME: 'AUDIT_LOG',
  /** Nom de l'en-tête du journal d'audit. */
  AUDIT_HEADERS: [
    'Horodatage', 'Ticket', 'Request ID', 'Action', 'Statut',
    'Cible', 'Message', 'Trace ID', 'Durée (ms)'
  ],

  // --- Planification / file d'attente ---------------------------------------

  /** Onglet de la file d'attente des actions différées. */
  QUEUE_SHEET_NAME: 'FILE_ATTENTE',
  /** En-tête de la file d'attente. */
  QUEUE_HEADERS: [
    'Demandé le', 'Ticket', 'Request ID', 'Action', 'Statut', 'Cible',
    'Données (JSON)', 'Exécution prévue', 'Tentatives', 'Dernier message',
    'Exécuté le', 'Trace ID'
  ],
  /** Statuts possibles d'une ligne de la file. */
  STATUTS: {
    EN_ATTENTE: 'EN_ATTENTE',
    TERMINE: 'TERMINE',
    ECHEC: 'ECHEC',
    ANNULE: 'ANNULE',
    EXPIRE: 'EXPIRE'
  },
  /** Nombre de tentatives avant abandon définitif. */
  MAX_TENTATIVES: 3,
  /** Au-delà, une demande en attente est déclarée périmée (jours). */
  EXPIRATION_JOURS: 7,
  /** Horizon de recherche du prochain créneau (jours). */
  HORIZON_PLANIF_JOURS: 21,
  /** Périodicité du déclencheur de vidange de la file (minutes). */
  INTERVALLE_DECLENCHEUR_MIN: 15,

  /**
   * Créneau d'ouverture par défaut des actions d'administration.
   * Clé = jour de la semaine au sens Date.getDay() : 0 = dimanche … 6 = samedi.
   * Valeur = liste de plages [début, fin] au format 'HH:MM' (fin exclue).
   * Une liste vide signifie « fermé toute la journée ».
   *
   * ⚠️ Le fuseau de référence est celui du PROJET Apps Script
   * (Paramètres du projet > Fuseau horaire). Le positionner sur Europe/Paris.
   */
  PLANNING_DEFAUT: {
    '0': [],                                        // dimanche
    '1': [['08:30', '12:30'], ['13:30', '17:30']],  // lundi
    '2': [['08:30', '12:30'], ['13:30', '17:30']],
    '3': [['08:30', '12:30'], ['13:30', '17:30']],
    '4': [['08:30', '12:30'], ['13:30', '17:30']],
    '5': [['08:30', '12:30'], ['13:30', '16:30']],  // vendredi
    '6': []                                         // samedi
  }
});

/**
 * Correspondance « champ plat du ticket → attribut de schéma personnalisé ».
 *
 * Permet d'exposer chaque attribut RH / accès comme un champ simple (un par
 * champ, pratique côté Jira et pour les listes déroulantes) plutôt que d'exiger
 * un objet JSON dans `custom_schemas`. construireProfilPatch_ (06_Workspace.gs)
 * replie ces champs dans le bon schéma.
 *
 * ⚠️ À ADAPTER aux schémas réellement définis dans la console d'administration
 * (Annuaire > Gérer les attributs personnalisés) : les noms ci-dessous
 * reprennent les schémas observés (Ressources_humaines, Lumapps, Atlassian).
 * `type` : 'number' | 'bool' | (défaut) 'string'.
 * @const
 */
const MAPPING_SCHEMAS_PERSO = Object.freeze({
  rh_matricule:             { schema: 'Ressources_humaines', champ: 'Matricule', type: 'number' },
  rh_statut:                { schema: 'Ressources_humaines', champ: 'Statut' },
  rh_sous_service:          { schema: 'Ressources_humaines', champ: 'Sous_service' },
  rh_site_paie:             { schema: 'Ressources_humaines', champ: 'Site_de_paie' },  // string : garde les zéros ('01')
  rh_cse:                   { schema: 'Ressources_humaines', champ: 'CSE' },
  rh_batiment:              { schema: 'Ressources_humaines', champ: 'Batiment', type: 'number' },
  rh_fonction_transversale: { schema: 'Ressources_humaines', champ: 'Fonction_transversale' },
  acces_lumapps:            { schema: 'Lumapps',    champ: 'Acces',      type: 'bool' },
  acces_jira:               { schema: 'Atlassian',  champ: 'JIRA',       type: 'bool' },
  acces_confluence:         { schema: 'Atlassian',  champ: 'Confluence', type: 'bool' }
});

/**
 * Lecture typée d'une propriété de script.
 * @param {string} key Clé de la propriété.
 * @param {string} [fallback=''] Valeur par défaut si absente.
 * @return {string}
 */
function getProp_(key, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return (value === null || value === '') ? (fallback || '') : value;
}