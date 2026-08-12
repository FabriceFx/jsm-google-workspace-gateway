/**
 * FORMULAIRE — Renommage de compte
 * -----------------------------------------------------------------------------
 * Formulaire JSM : changement d'adresse e-mail (mariage, erreur initiale).
 * L'ancienne adresse devient automatiquement un alias.
 *
 * Champs attendus dans `data` : email_cible, nouvel_email
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RENOMMER_COMPTE() {
  return {
    action: 'RENOMMER_COMPTE',
    description: 'Change l\'adresse principale d\'un compte (l\'ancienne devient alias).',
    required: ['email_cible', 'nouvel_email'],
    emails: ['email_cible', 'nouvel_email'],
    fenetre: 'STANDARD',
    handler: actionRenommerCompte
  };
}

/**
 * ACTION RENOMMER_COMPTE — Change l'adresse e-mail principale.
 *
 * data : email_cible, nouvel_email
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRenommerCompte(data, ctx) {
  requireUser_(data.email_cible);

  if (data.email_cible === data.nouvel_email) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: 'L\'adresse est déjà ' + data.nouvel_email + '.'
    };
  }

  // Vérifier que le nouvel e-mail n'est pas déjà pris.
  var existant = getUserOrNull_(data.nouvel_email);
  if (existant) {
    throw new AppError_('ALREADY_EXISTS',
      'L\'adresse ' + data.nouvel_email + ' est déjà utilisée par un autre ' +
      'compte. Choisir une autre adresse.', 409);
  }

  AdminDirectory.Users.patch({ primaryEmail: data.nouvel_email }, data.email_cible);

  return {
    target: data.nouvel_email,
    message: 'Compte renommé de ' + data.email_cible + ' vers ' +
      data.nouvel_email + '. L\'ancienne adresse reste active comme alias.',
    details: {
      ancien_email: data.email_cible,
      nouvel_email: data.nouvel_email
    }
  };
}
