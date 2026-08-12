/**
 * FORMULAIRE — Mise à jour du profil utilisateur
 * -----------------------------------------------------------------------------
 * Formulaire JSM : changement de nom, de poste, de manager, de téléphone.
 * Tous les champs sont optionnels sauf email_cible : seuls les champs
 * renseignés sont mis à jour.
 *
 * Champs `data` : email_cible + tous les champs de profil optionnels reconnus
 * par construireProfilPatch_ (voir 06_Workspace.gs) : prenom, nom,
 * intitule_poste, departement, societe, centre_cout, manager_email,
 * telephone_pro, telephone_mobile, adresse, batiment, etage, bureau,
 * email_recuperation, tel_recuperation, visible_annuaire, custom_schemas.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_MISE_A_JOUR_PROFIL() {
  return {
    action: 'MISE_A_JOUR_PROFIL',
    description: 'Met à jour les informations du profil utilisateur.',
    required: ['email_cible'],
    emails: ['email_cible', 'manager_email', 'email_recuperation'],
    fenetre: 'STANDARD',
    handler: actionMettreAJourProfil_
  };
}

/**
 * ACTION MISE_A_JOUR_PROFIL — Met à jour le profil d'un utilisateur.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionMettreAJourProfil_(data, ctx) {
  // Projection 'full' INDISPENSABLE : la projection basic ne renvoie pas
  // customSchemas ; sans elle, la fusion des schémas repartirait d'un objet
  // vide et EFFACERAIT les autres attributs (Matricule, accès…) lors du patch.
  var utilisateur = requireUser_(data.email_cible, undefined, 'full');

  // Construction du patch fusionnée avec l'existant (source partagée avec
  // CREATION_COMPTE) : aucun tableau — organizations, phones, relations,
  // addresses, locations — n'est écrasé en bloc.
  var resultat = construireProfilPatch_(data, utilisateur);

  if (!resultat.modifications.length) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: 'Aucun champ à mettre à jour pour ' + data.email_cible + '.'
    };
  }

  AdminDirectory.Users.patch(resultat.patch, data.email_cible);

  return {
    target: data.email_cible,
    message: 'Profil de ' + data.email_cible + ' mis à jour : ' +
      resultat.modifications.join(', ') + '.',
    details: { modifications: resultat.modifications }
  };
}
