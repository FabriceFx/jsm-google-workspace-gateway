/**
 * FORMULAIRE — Retrait d'un compte de TOUS ses groupes
 * -----------------------------------------------------------------------------
 * Formulaire JSM : départ d'un collaborateur, révocation globale d'accès.
 * Fenêtre PERMANENTE : une révocation d'accès ne se diffère pas.
 *
 * Retire l'utilisateur de tous les groupes dont il est membre direct. Les
 * appartenances indirectes (via un groupe imbriqué) ne sont pas modifiables ici
 * et sont ignorées sans erreur.
 *
 * Champs attendus dans `data` : email_cible
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_TOUS_GROUPES() {
  return {
    action: 'RETRAIT_TOUS_GROUPES',
    description: 'Retire un utilisateur de tous les groupes dont il est membre direct.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // retrait d'accès : jamais différé
    handler: actionRetirerTousGroupes
  };
}

/**
 * ACTION RETRAIT_TOUS_GROUPES — Retire un compte de tous ses groupes directs.
 *
 * data : email_cible
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerTousGroupes(data, ctx) {
  requireUser_(data.email_cible);

  // Lister tous les groupes dont l'utilisateur est membre (pagination).
  var groupes = [];
  var pageToken = null;
  do {
    var options = { userKey: data.email_cible, maxResults: 200 };
    if (pageToken) options.pageToken = pageToken;
    var reponse = AdminDirectory.Groups.list(options);
    if (reponse.groups) {
      reponse.groups.forEach(function (g) { groupes.push(g.email); });
    }
    pageToken = reponse.nextPageToken;
  } while (pageToken);

  if (!groupes.length) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: data.email_cible + ' n\'appartient à aucun groupe. Aucune action réalisée.'
    };
  }

  // Retrait un par un : on isole les échecs pour ne pas masquer un retrait
  // partiel derrière une « erreur interne » (même logique que REVOCATION_TOKENS).
  var retires = [];
  var ignores = [];
  var echecs = [];
  groupes.forEach(function (groupe) {
    try {
      AdminDirectory.Members.remove(groupe, data.email_cible);
      retires.push(groupe);
    } catch (err) {
      // 404 = appartenance indirecte (membre d'un groupe imbriqué) : non
      // retirable ici, on l'ignore sans la compter en échec.
      if (estNotFound_(err)) {
        ignores.push(groupe);
      } else {
        echecs.push(groupe + ' (' + err.message + ')');
      }
    }
  });

  if (echecs.length) {
    throw new AppError_('RETRAIT_PARTIEL',
      'Retrait incomplet pour ' + data.email_cible + '. Retirés : ' +
      (retires.join(', ') || 'aucun') + '. En échec : ' + echecs.join(', ') +
      '. Relancer l\'action pour réessayer les groupes restants.', 502);
  }

  return {
    target: data.email_cible,
    message: data.email_cible + ' retiré de ' + retires.length + ' groupe(s)' +
      (ignores.length ? ' (' + ignores.length + ' appartenance(s) indirecte(s) ignorée(s))' : '') +
      (retires.length ? ' : ' + retires.join(', ') : '') + '.',
    details: { retires: retires, ignores: ignores }
  };
}
