/**
 * FORMULAIRE — Renommage de compte
 * -----------------------------------------------------------------------------
 * Formulaire JSM : changement d'adresse e-mail (mariage, erreur initiale).
 * L'ancienne adresse devient automatiquement un alias.
 *
 * Champs attendus dans `data` : email_cible, nouvel_email
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RENOMMER_COMPTE() {
  return {
    action: 'RENOMMER_COMPTE',
    description: 'Change l\'adresse principale d\'un compte (l\'ancienne devient alias).',
    required: ['email_cible', 'nouvel_email'],
    emails: ['email_cible', 'nouvel_email'],
    fenetre: 'STANDARD',
    handler: actionRenommerCompte_
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
function actionRenommerCompte_(data, ctx) {
  var utilisateur = requireUser_(data.email_cible);

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
    // Idempotence : après un premier renommage réussi, l'ancienne adresse est
    // devenue un alias qui résout LE MÊME compte. Un rejeu Jira trouve donc la
    // cible ET la nouvelle adresse pointant sur le même id → succès, pas erreur.
    if (existant.id === utilisateur.id) {
      return {
        idempotent: true,
        target: data.nouvel_email,
        message: 'Le compte est déjà renommé en ' + data.nouvel_email +
          ' (l\'ancienne adresse reste un alias). Aucune action réalisée.'
      };
    }
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
