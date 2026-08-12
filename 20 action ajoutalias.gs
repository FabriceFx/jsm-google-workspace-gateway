/**
 * FORMULAIRE — Ajout d'un alias e-mail
 * -----------------------------------------------------------------------------
 * Formulaire JSM : adresse secondaire (nom de mariage, adresse fonctionnelle).
 *
 * Champs attendus dans `data` : email_cible, alias
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_AJOUT_ALIAS() {
  return {
    action: 'AJOUT_ALIAS',
    description: 'Ajoute un alias e-mail à un compte.',
    required: ['email_cible', 'alias'],
    emails: ['email_cible', 'alias'],
    fenetre: 'STANDARD',
    handler: actionAjouterAlias
  };
}

/**
 * ACTION AJOUT_ALIAS — Ajoute un alias e-mail.
 *
 * data : email_cible, alias
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionAjouterAlias(data, ctx) {
  var utilisateur = requireUser_(data.email_cible);

  // Vérifier si l'alias existe déjà (idempotence).
  var aliases = (utilisateur.aliases || []).concat(utilisateur.nonEditableAliases || []);
  if (aliases.indexOf(data.alias) !== -1) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: data.alias + ' est déjà un alias de ' + data.email_cible + '.'
    };
  }

  AdminDirectory.Users.Aliases.insert({ alias: data.alias }, data.email_cible);

  return {
    target: data.email_cible,
    message: 'Alias ' + data.alias + ' ajouté au compte ' + data.email_cible + '.'
  };
}
