/**
 * FORMULAIRE — Retrait d'un groupe
 * -----------------------------------------------------------------------------
 * Formulaire JSM : révocation d'un accès.
 * Fenêtre PERMANENTE : un retrait d'accès ne se diffère pas.
 *
 * Champs attendus dans `data` : email_cible, email_groupe
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Déclaration de l'action au registre.
 *
 * Cette fonction doit être référencée dans declarationsFormulaires_()
 * (01_Registre.gs) pour que l'action soit active. Apps Script n'expose pas les
 * fonctions de premier niveau à l'énumération : la déclaration est explicite.
 *
 * @return {!Object} Spécification de l'action.
 */
function SPEC_RETRAIT_GROUPE() {
  return {
    action: 'RETRAIT_GROUPE',
    description: 'Retire un utilisateur d\'un groupe.',
    required: ['email_cible', 'email_groupe'],
    emails: ['email_cible', 'email_groupe'],
    fenetre: 'PERMANENTE',   // retrait d'accès : jamais différé
    handler: actionRetirerGroupe_
  };
}

/**
 * ACTION RETRAIT_GROUPE — Retire un utilisateur d'un groupe.
 *
 * data : email_cible, email_groupe
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerGroupe_(data, ctx) {
  if (!isMember_(data.email_groupe, data.email_cible)) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: data.email_cible + " n'est pas membre de " + data.email_groupe +
        '. Aucune action réalisée.'
    };
  }
  AdminDirectory.Members.remove(data.email_groupe, data.email_cible);
  return {
    target: data.email_cible,
    message: data.email_cible + ' retiré du groupe ' + data.email_groupe + '.'
  };
}