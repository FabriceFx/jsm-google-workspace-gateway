/**
 * FORMULAIRE — Changement d'unité organisationnelle
 * -----------------------------------------------------------------------------
 * Formulaire JSM : mutation, changement de service.
 *
 * Champs attendus dans `data` : email_cible, unite_organisationnelle
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_CHANGEMENT_OU() {
  return {
    action: 'CHANGEMENT_OU',
    description: 'Déplace un compte dans une autre unité organisationnelle.',
    required: ['email_cible', 'unite_organisationnelle'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionChangerOU_
  };
}

/**
 * ACTION CHANGEMENT_OU — Déplace un compte vers une autre OU.
 *
 * data : email_cible, unite_organisationnelle
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionChangerOU_(data, ctx) {
  var utilisateur = requireUser_(data.email_cible);

  var ancienneOU = utilisateur.orgUnitPath || '/';
  if (ancienneOU === data.unite_organisationnelle) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: data.email_cible + ' est déjà dans ' + data.unite_organisationnelle + '.'
    };
  }

  AdminDirectory.Users.patch(
    { orgUnitPath: data.unite_organisationnelle }, data.email_cible);

  return {
    target: data.email_cible,
    message: data.email_cible + ' déplacé de ' + ancienneOU +
      ' vers ' + data.unite_organisationnelle + '.',
    details: { ancienne_ou: ancienneOU, nouvelle_ou: data.unite_organisationnelle }
  };
}
