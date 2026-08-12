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
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
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

  // Vérifier que le délégué existe dans l'annuaire.
  var delegue = getUserOrNull_(data.email_delegue);
  if (!delegue) {
    throw new AppError_('NOT_FOUND',
      'Délégué ' + data.email_delegue + ' introuvable dans l\'annuaire.', 404);
  }

  appelGmailApi_(data.email_cible,
    'settings/delegates',
    'POST',
    { delegateEmail: data.email_delegue },
    SCOPE);

  return {
    target: data.email_cible,
    message: data.email_delegue + ' peut désormais accéder à la boîte de ' +
      data.email_cible + ' (délégation créée).',
    details: { delegue: data.email_delegue }
  };
}
