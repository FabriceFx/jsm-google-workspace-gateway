/**
 * FORMULAIRE — Transfert d'e-mails (redirection)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : rediriger les mails d'un compte vers un autre (départ).
 *
 * ⚠️ Cette action nécessite un compte de service avec délégation de domaine
 * (voir README, section « Actions Gmail »). Propriétés requises :
 * SERVICE_ACCOUNT_EMAIL et SERVICE_ACCOUNT_KEY.
 *
 * Champs attendus dans `data` : email_cible, email_destination, [conserver_copie]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_TRANSFERT_EMAILS() {
  return {
    action: 'TRANSFERT_EMAILS',
    description: 'Redirige les e-mails entrants vers une autre adresse.',
    required: ['email_cible', 'email_destination'],
    emails: ['email_cible', 'email_destination'],
    fenetre: 'STANDARD',
    handler: actionTransfererEmails
  };
}

/**
 * ACTION TRANSFERT_EMAILS — Configure la redirection automatique.
 *
 * Séquence en deux étapes :
 *  1. Créer l'adresse de transfert (si elle n'existe pas déjà)
 *  2. Activer la redirection automatique
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionTransfererEmails(data, ctx) {
  var SCOPE = 'https://www.googleapis.com/auth/gmail.settings.sharing';
  var conserverCopie = boolDeFormulaire_(data.conserver_copie, true);

  // Étape 1 : enregistrer l'adresse de redirection.
  try {
    appelGmailApi_(data.email_cible,
      'settings/forwardingAddresses',
      'POST',
      { forwardingEmail: data.email_destination },
      SCOPE);
  } catch (err) {
    // 409 = adresse déjà enregistrée (idempotence). On s'appuie sur le code HTTP
    // porté par l'AppError_ plutôt que sur une recherche de sous-chaîne, qui
    // avalerait une erreur légitime dont le libellé contient « already ».
    if (!(err instanceof AppError_) || err.httpHint !== 409) {
      throw err;
    }
  }

  // Étape 2 : activer la redirection automatique.
  appelGmailApi_(data.email_cible,
    'settings/autoForwarding',
    'PUT',
    {
      enabled: true,
      emailAddress: data.email_destination,
      disposition: conserverCopie ? 'leaveInInbox' : 'archive'
    },
    SCOPE);

  return {
    target: data.email_cible,
    message: 'Les e-mails de ' + data.email_cible + ' sont désormais redirigés ' +
      'vers ' + data.email_destination +
      (conserverCopie ? ' (copie conservée dans la boîte).' : ' (archivés dans la boîte).'),
    details: {
      destination: data.email_destination,
      copie_conservee: conserverCopie
    }
  };
}
