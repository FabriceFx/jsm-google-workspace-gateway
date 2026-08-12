/**
 * FORMULAIRE — Retrait d'un alias e-mail
 * -----------------------------------------------------------------------------
 * Formulaire JSM : suppression d'un alias obsolète.
 *
 * Champs attendus dans `data` : email_cible, alias
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_ALIAS() {
  return {
    action: 'RETRAIT_ALIAS',
    description: 'Supprime un alias e-mail d\'un compte.',
    required: ['email_cible', 'alias'],
    emails: ['email_cible', 'alias'],
    fenetre: 'STANDARD',
    handler: actionRetirerAlias
  };
}

/**
 * ACTION RETRAIT_ALIAS — Supprime un alias e-mail.
 *
 * data : email_cible, alias
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerAlias(data, ctx) {
  var utilisateur = getUserOrNull_(data.email_cible);
  if (!utilisateur) {
    throw new AppError_('NOT_FOUND',
      'Compte ' + data.email_cible + ' introuvable.', 404);
  }

  var aliases = utilisateur.aliases || [];
  if (aliases.indexOf(data.alias) === -1) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: data.alias + ' n\'est pas un alias de ' + data.email_cible +
        '. Aucune action réalisée.'
    };
  }

  AdminDirectory.Users.Aliases.remove(data.email_cible, data.alias);

  return {
    target: data.email_cible,
    message: 'Alias ' + data.alias + ' supprimé du compte ' + data.email_cible + '.'
  };
}
