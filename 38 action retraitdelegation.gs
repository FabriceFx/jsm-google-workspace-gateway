/**
 * FORMULAIRE — Retrait d'une délégation de boîte mail
 * -----------------------------------------------------------------------------
 * Formulaire JSM : fin d'accès d'un délégué à la boîte d'un tiers.
 * Symétrique de DELEGATION_EMAIL.
 *
 * ⚠️ Cette action nécessite un compte de service avec délégation de domaine
 * (voir README, section « Actions Gmail »). Propriétés requises :
 * SERVICE_ACCOUNT_EMAIL et SERVICE_ACCOUNT_KEY.
 *
 * Champs attendus dans `data` : email_cible, email_delegue
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_DELEGATION_EMAIL() {
  return {
    action: 'RETRAIT_DELEGATION_EMAIL',
    description: 'Retire l\'accès d\'un délégué à la boîte mail d\'un utilisateur.',
    required: ['email_cible', 'email_delegue'],
    emails: ['email_cible', 'email_delegue'],
    fenetre: 'STANDARD',
    handler: actionRetirerDelegationEmail
  };
}

/**
 * ACTION RETRAIT_DELEGATION_EMAIL — Supprime une délégation de boîte mail.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerDelegationEmail(data, ctx) {
  var SCOPE = 'https://www.googleapis.com/auth/gmail.settings.sharing';

  requireUser_(data.email_cible, 'cible');

  try {
    appelGmailApi_(data.email_cible,
      'settings/delegates/' + encodeURIComponent(data.email_delegue),
      'DELETE',
      null,
      SCOPE);
  } catch (err) {
    // 404 = la délégation n'existe pas (ou plus) : un rejeu Jira doit renvoyer
    // un succès idempotent plutôt qu'échouer.
    if (err instanceof AppError_ && err.httpHint === 404) {
      return {
        idempotent: true,
        target: data.email_cible,
        message: data.email_delegue + ' n\'était pas (ou plus) délégué de ' +
          data.email_cible + '. Aucune action réalisée.',
        details: { delegue: data.email_delegue }
      };
    }
    throw err;
  }

  return {
    target: data.email_cible,
    message: 'Accès de ' + data.email_delegue + ' à la boîte de ' +
      data.email_cible + ' retiré (délégation supprimée).',
    details: { delegue: data.email_delegue }
  };
}
