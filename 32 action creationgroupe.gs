/**
 * FORMULAIRE — Création de groupe
 * -----------------------------------------------------------------------------
 * Formulaire JSM : nouveau projet, nouvelle équipe.
 *
 * Champs attendus dans `data` : email_groupe, nom_groupe, [description]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_CREATION_GROUPE() {
  return {
    action: 'CREATION_GROUPE',
    description: 'Crée un nouveau groupe Google.',
    required: ['email_groupe', 'nom_groupe'],
    emails: ['email_groupe'],
    fenetre: 'STANDARD',
    handler: actionCreerGroupe
  };
}

/**
 * ACTION CREATION_GROUPE — Crée un groupe Google.
 *
 * data : email_groupe, nom_groupe, [description]
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionCreerGroupe(data, ctx) {
  // Idempotence : vérifier si le groupe existe déjà.
  var existant = getGroupOrNull_(data.email_groupe);
  if (existant) {
    return {
      idempotent: true,
      target: data.email_groupe,
      message: 'Le groupe ' + data.email_groupe + ' existe déjà (' +
        (existant.directMembersCount || 0) + ' membre(s)).'
    };
  }

  var groupe = {
    email: data.email_groupe,
    name: data.nom_groupe
  };
  if (data.description) groupe.description = data.description;

  AdminDirectory.Groups.insert(groupe);

  return {
    target: data.email_groupe,
    message: 'Groupe ' + data.email_groupe + ' créé (' + data.nom_groupe + ').',
    details: { nom: data.nom_groupe }
  };
}
