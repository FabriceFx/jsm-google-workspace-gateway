/**
 * FORMULAIRE — Arrêt du transfert d'e-mails
 * -----------------------------------------------------------------------------
 * Formulaire JSM : fin d'une redirection (retour d'absence, fin de remplacement).
 * Symétrique de TRANSFERT_EMAILS.
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

function SPEC_ARRET_TRANSFERT_EMAILS() {
  return {
    action: 'ARRET_TRANSFERT_EMAILS',
    description: 'Désactive la redirection automatique des e-mails entrants.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionArreterTransfertEmails
  };
}

/**
 * ACTION ARRET_TRANSFERT_EMAILS — Coupe la redirection automatique.
 *
 * Désactiver la redirection suffit à stopper le flux ; on ne supprime pas
 * l'adresse de transfert enregistrée, réutilisable plus tard. Idempotent :
 * désactiver une redirection déjà inactive n'a aucun effet.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionArreterTransfertEmails(data, ctx) {
  var SCOPE = 'https://www.googleapis.com/auth/gmail.settings.sharing';

  requireUser_(data.email_cible);

  appelGmailApi_(data.email_cible,
    'settings/autoForwarding',
    'PUT',
    { enabled: false },
    SCOPE);

  return {
    target: data.email_cible,
    message: 'Redirection des e-mails désactivée pour ' + data.email_cible + '.'
  };
}
