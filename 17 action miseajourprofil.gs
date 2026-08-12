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
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
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
  var utilisateur = requireUser_(data.email_cible);

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

  // Les champs tableau (organizations, phones, relations) sont REMPLACÉS en bloc
  // par Users.patch. On repart donc de l'existant et on ne touche qu'à l'entrée
  // concernée, pour ne pas effacer département, centre de coûts, autres numéros
  // ou autres relations déjà en place.
  if (data.intitule_poste || data.departement) {
    var orgs = (utilisateur.organizations || []).map(function (o) {
      return Object.assign({}, o);
    });
    var orgPrincipale = null;
    for (var i = 0; i < orgs.length; i++) {
      if (orgs[i].primary) { orgPrincipale = orgs[i]; break; }
    }
    if (!orgPrincipale) {
      orgPrincipale = { primary: true };
      orgs.push(orgPrincipale);
    }
    if (data.intitule_poste) {
      orgPrincipale.title = data.intitule_poste;
      modifications.push('poste : ' + data.intitule_poste);
    }
    if (data.departement) {
      orgPrincipale.department = data.departement;
      modifications.push('département : ' + data.departement);
    }
    patch.organizations = orgs;
  }

  if (data.telephone) {
    var phones = (utilisateur.phones || []).filter(function (p) {
      return p.type !== 'work';   // on ne remplace que le numéro professionnel
    });
    phones.push({ value: data.telephone, type: 'work' });
    patch.phones = phones;
    modifications.push('téléphone : ' + data.telephone);
  }

  if (data.manager_email) {
    var relations = (utilisateur.relations || []).filter(function (r) {
      return r.type !== 'manager'; // on ne remplace que la relation manager
    });
    relations.push({ value: data.manager_email, type: 'manager' });
    patch.relations = relations;
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
