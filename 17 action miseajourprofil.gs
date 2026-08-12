/**
 * FORMULAIRE — Mise à jour du profil utilisateur
 * -----------------------------------------------------------------------------
 * Formulaire JSM : changement de nom, de poste, de manager, de téléphone.
 * Tous les champs sont optionnels sauf email_cible : seuls les champs
 * renseignés sont mis à jour.
 *
 * Champs attendus dans `data` : email_cible, [prenom], [nom],
 *   [intitule_poste], [telephone], [manager_email], [departement]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_MISE_A_JOUR_PROFIL() {
  return {
    action: 'MISE_A_JOUR_PROFIL',
    description: 'Met à jour les informations du profil utilisateur.',
    required: ['email_cible'],
    emails: ['email_cible', 'manager_email'],
    fenetre: 'STANDARD',
    handler: actionMettreAJourProfil
  };
}

/**
 * ACTION MISE_A_JOUR_PROFIL — Met à jour le profil d'un utilisateur.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionMettreAJourProfil(data, ctx) {
  var utilisateur = getUserOrNull_(data.email_cible);
  if (!utilisateur) {
    throw new AppError_('NOT_FOUND',
      'Compte ' + data.email_cible + ' introuvable.', 404);
  }

  var patch = {};
  var modifications = [];

  if (data.prenom || data.nom) {
    const nomExistant = utilisateur.name || {};
    patch.name = {
      givenName: data.prenom || nomExistant.givenName || '',
      familyName: data.nom || nomExistant.familyName || ''
    };
    modifications.push('nom : ' + patch.name.givenName + ' ' + patch.name.familyName);
  }

  if (data.intitule_poste) {
    patch.organizations = [{ title: data.intitule_poste, primary: true }];
    if (data.departement) patch.organizations[0].department = data.departement;
    modifications.push('poste : ' + data.intitule_poste);
  } else if (data.departement) {
    patch.organizations = [{ department: data.departement, primary: true }];
    modifications.push('département : ' + data.departement);
  }

  if (data.telephone) {
    patch.phones = [{ value: data.telephone, type: 'work' }];
    modifications.push('téléphone : ' + data.telephone);
  }

  if (data.manager_email) {
    patch.relations = [{ value: data.manager_email, type: 'manager' }];
    modifications.push('manager : ' + data.manager_email);
  }

  if (!modifications.length) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: 'Aucun champ à mettre à jour pour ' + data.email_cible + '.'
    };
  }

  AdminDirectory.Users.patch(patch, data.email_cible);

  return {
    target: data.email_cible,
    message: 'Profil de ' + data.email_cible + ' mis à jour : ' +
      modifications.join(', ') + '.',
    details: { modifications: modifications }
  };
}
