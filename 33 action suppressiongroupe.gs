/**
 * FORMULAIRE — Suppression de groupe
 * -----------------------------------------------------------------------------
 * Formulaire JSM : fin de projet, nettoyage de l'annuaire.
 *
 * ⚠️ Action irréversible. Le champ 'confirmation' doit contenir la valeur
 * exacte 'CONFIRMER_SUPPRESSION'.
 *
 * Champs attendus dans `data` : email_groupe, confirmation
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_SUPPRESSION_GROUPE() {
  return {
    action: 'SUPPRESSION_GROUPE',
    description: 'Supprime définitivement un groupe Google (irréversible).',
    required: ['email_groupe', 'confirmation'],
    emails: ['email_groupe'],
    fenetre: 'STANDARD',
    destructive: true,
    handler: actionSupprimerGroupe_
  };
}

/**
 * ACTION SUPPRESSION_GROUPE — Supprime un groupe Google.
 *
 * data : email_groupe, confirmation
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionSupprimerGroupe_(data, ctx) {
  if (data.confirmation !== 'CONFIRMER_SUPPRESSION') {
    throw new AppError_('CONFIRMATION_REQUISE',
      'Suppression refusée : le champ \'confirmation\' doit contenir ' +
      'exactement \'CONFIRMER_SUPPRESSION\'.', 400);
  }

  if (!getGroupOrNull_(data.email_groupe)) {
    return {
      idempotent: true,
      target: data.email_groupe,
      message: 'Le groupe ' + data.email_groupe +
        ' n\'existe pas ou a déjà été supprimé.'
    };
  }

  AdminDirectory.Groups.remove(data.email_groupe);

  return {
    target: data.email_groupe,
    message: 'Groupe ' + data.email_groupe + ' supprimé définitivement.'
  };
}
