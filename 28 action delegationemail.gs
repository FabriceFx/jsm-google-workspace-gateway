/**
 * FORMULAIRE — Délégation d'accès à une boîte mail
 * -----------------------------------------------------------------------------
 * Formulaire JSM : un manager doit accéder à la boîte d'un absent.
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

function SPEC_DELEGATION_EMAIL() {
  return {
    action: 'DELEGATION_EMAIL',
    description: 'Donne accès à la boîte mail d\'un utilisateur à un délégué.',
    required: ['email_cible', 'email_delegue'],
    emails: ['email_cible', 'email_delegue'],
    fenetre: 'STANDARD',
    handler: actionDeleguerEmail
  };
}

/**
 * ACTION DELEGATION_EMAIL — Crée une délégation de boîte mail.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionDeleguerEmail(data, ctx) {
  var SCOPE = 'https://www.googleapis.com/auth/gmail.settings.sharing';

  // Vérifier que les deux comptes existent dans l'annuaire.
  requireUser_(data.email_cible, 'cible');
  requireUser_(data.email_delegue, 'délégué');

  try {
    appelGmailApi_(data.email_cible,
      'settings/delegates',
      'POST',
      { delegateEmail: data.email_delegue },
      SCOPE);
  } catch (err) {
    // 409 = délégation déjà en place : un rejeu Jira doit renvoyer un succès
    // idempotent plutôt qu'échouer.
    if (err instanceof AppError_ && err.httpHint === 409) {
      return {
        idempotent: true,
        target: data.email_cible,
        message: data.email_delegue + ' a déjà accès à la boîte de ' +
          data.email_cible + '. Aucune action réalisée.',
        details: { delegue: data.email_delegue }
      };
    }
    throw err;
  }

  return {
    target: data.email_cible,
    message: data.email_delegue + ' peut désormais accéder à la boîte de ' +
      data.email_cible + ' (délégation créée).',
    details: { delegue: data.email_delegue }
  };
}
