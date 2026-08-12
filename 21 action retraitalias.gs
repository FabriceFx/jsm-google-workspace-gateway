/**
 * FORMULAIRE — Retrait d'un alias e-mail
 * -----------------------------------------------------------------------------
 * Formulaire JSM : suppression d'un alias obsolète.
 *
 * Champs attendus dans `data` : email_cible, alias
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_ALIAS() {
  return {
    action: 'RETRAIT_ALIAS',
    description: 'Supprime un alias e-mail d\'un compte.',
    required: ['email_cible', 'alias'],
    emails: ['email_cible', 'alias'],
    fenetre: 'STANDARD',
    handler: actionRetirerAlias_
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
function actionRetirerAlias_(data, ctx) {
  var utilisateur = requireUser_(data.email_cible);

  var aliases = utilisateur.aliases || [];
  if (aliases.indexOf(data.alias) === -1) {
    // Un alias non éditable (alias de domaine, généré par Workspace) ne figure
    // pas dans `aliases` mais dans `nonEditableAliases` : le distinguer évite un
    // « erreur interne » opaque au profit d'un message actionnable.
    var nonEditables = utilisateur.nonEditableAliases || [];
    if (nonEditables.indexOf(data.alias) !== -1) {
      throw new AppError_('ALIAS_NON_EDITABLE',
        data.alias + ' est un alias de domaine non modifiable, généré ' +
        'automatiquement par Workspace. Il ne peut pas être retiré via cette ' +
        'action.', 400);
    }
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
