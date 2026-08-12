/**
 * FORMULAIRE — Liste des membres d'un groupe
 * -----------------------------------------------------------------------------
 * Formulaire JSM : audit d'un groupe avant ajout/retrait, vérification.
 * Action en lecture seule, aucune modification de l'annuaire.
 *
 * Champs attendus dans `data` : email_groupe
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_LISTE_MEMBRES_GROUPE() {
  return {
    action: 'LISTE_MEMBRES_GROUPE',
    description: 'Liste les membres d\'un groupe (lecture seule).',
    required: ['email_groupe'],
    emails: ['email_groupe'],
    fenetre: 'PERMANENTE',   // lecture seule : aucune raison de différer
    handler: actionListerMembresGroupe
  };
}

/**
 * ACTION LISTE_MEMBRES_GROUPE — Retourne la liste des membres d'un groupe.
 *
 * data : email_groupe
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionListerMembresGroupe(data, ctx) {
  // Vérifier que le groupe existe.
  if (!getGroupOrNull_(data.email_groupe)) {
    throw new AppError_('NOT_FOUND',
      'Groupe ' + data.email_groupe + ' introuvable.', 404);
  }

  // Paginer les membres.
  var membres = [];
  var pageToken = null;
  do {
    var options = { maxResults: 200 };
    if (pageToken) options.pageToken = pageToken;
    var reponse = AdminDirectory.Members.list(data.email_groupe, options);
    if (reponse.members) {
      reponse.members.forEach(function (m) {
        membres.push({
          email: m.email,
          role: m.role,
          type: m.type,
          status: m.status
        });
      });
    }
    pageToken = reponse.nextPageToken;
  } while (pageToken);

  // Le message part dans un commentaire Jira : on borne l'aperçu pour ne pas
  // produire un commentaire démesuré sur un groupe de plusieurs milliers de
  // membres. La liste complète reste disponible dans `details.membres`.
  var MAX_APERCU = 50;
  var resume = membres.slice(0, MAX_APERCU).map(function (m) {
    return m.email + ' (' + m.role + ')';
  });
  var apercu = resume.join(', ');
  if (membres.length > MAX_APERCU) {
    apercu += ', … (+' + (membres.length - MAX_APERCU) + ' — liste complète ' +
      'dans les détails)';
  }

  return {
    target: data.email_groupe,
    message: data.email_groupe + ' : ' + membres.length + ' membre(s)' +
      (membres.length ? ' — ' + apercu : '') + '.',
    details: { total: membres.length, membres: membres }
  };
}
