/**
 * FORMULAIRE — Désactivation de la réponse d'absence
 * -----------------------------------------------------------------------------
 * Formulaire JSM : retour de congé, l'utilisateur est de nouveau disponible.
 * Symétrique de REPONSE_ABSENCE.
 *
 * ⚠️ Cette action nécessite un compte de service avec délégation de domaine
 * (voir README, section « Actions Gmail »). Propriétés requises :
 * SERVICE_ACCOUNT_EMAIL et SERVICE_ACCOUNT_KEY.
 *
 * Champs attendus dans `data` : email_cible
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_DESACTIVATION_REPONSE_ABSENCE() {
  return {
    action: 'DESACTIVATION_REPONSE_ABSENCE',
    description: 'Désactive la réponse d\'absence automatique d\'un utilisateur.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionDesactiverReponseAbsence
  };
}

/**
 * ACTION DESACTIVATION_REPONSE_ABSENCE — Coupe la réponse d'absence Gmail.
 *
 * Naturellement idempotent : désactiver une réponse déjà inactive n'a aucun
 * effet de bord.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionDesactiverReponseAbsence(data, ctx) {
  var SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';

  requireUser_(data.email_cible);

  appelGmailApi_(data.email_cible,
    'settings/vacation',
    'PUT',
    { enableAutoReply: false },
    SCOPE);

  return {
    target: data.email_cible,
    message: 'Réponse d\'absence désactivée pour ' + data.email_cible + '.'
  };
}
