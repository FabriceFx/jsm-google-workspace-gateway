/**
 * FORMULAIRE — Suppression de compte
 * -----------------------------------------------------------------------------
 * Formulaire JSM : départ définitif, après période de rétention.
 *
 * ⚠️ Action irréversible. Le champ 'confirmation' doit contenir la valeur
 * exacte 'CONFIRMER_SUPPRESSION' pour éviter toute suppression accidentelle.
 *
 * Champs attendus dans `data` : email_cible, confirmation, [motif]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_SUPPRESSION_COMPTE() {
  return {
    action: 'SUPPRESSION_COMPTE',
    description: 'Supprime définitivement un compte (irréversible).',
    required: ['email_cible', 'confirmation'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionSupprimerCompte
  };
}

/**
 * ACTION SUPPRESSION_COMPTE — Supprime définitivement un compte.
 *
 * data : email_cible, confirmation, [motif]
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionSupprimerCompte(data, ctx) {
  if (data.confirmation !== 'CONFIRMER_SUPPRESSION') {
    throw new AppError_('CONFIRMATION_REQUISE',
      'Suppression refusée : le champ \'confirmation\' doit contenir ' +
      'exactement \'CONFIRMER_SUPPRESSION\' pour éviter une suppression ' +
      'accidentelle.', 400);
  }

  var utilisateur = getUserOrNull_(data.email_cible);
  if (!utilisateur) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: 'Le compte ' + data.email_cible + ' n\'existe pas ou a déjà été supprimé.'
    };
  }

  AdminDirectory.Users.remove(data.email_cible);

  return {
    target: data.email_cible,
    message: 'Compte ' + data.email_cible + ' supprimé définitivement' +
      (data.motif ? ' (motif : ' + data.motif + ')' : '') + '.',
    details: { supprime: true }
  };
}
