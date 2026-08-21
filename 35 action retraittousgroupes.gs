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
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.2.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_TOUS_GROUPES() {
  return {
    action: 'RETRAIT_TOUS_GROUPES',
    description: 'Retire un utilisateur de tous ses groupes directs (ignore les groupes dynamiques).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // retrait d'accès : jamais différé
    destructive: true,
    handler: actionRetirerTousGroupes_
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
function actionRetirerTousGroupes_(data, ctx) {
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
  // partiel derrière une « erreur interne ».
  var retires = [];
  var ignores = [];      // appartenances indirectes (groupe imbriqué)
  var dynamiques = [];   // groupes dynamiques : membres non modifiables manuellement
  var echecs = [];

  groupes.forEach(function (groupe) {
    try {
      AdminDirectory.Members.remove(groupe, data.email_cible);
      retires.push(groupe);
    } catch (err) {
      if (estNotFound_(err)) {
        // 404 = appartenance indirecte (membre d'un groupe imbriqué).
        ignores.push(groupe);
      } else if (estErreurGroupeDynamique_(err)) {
        // Groupe dynamique : l'appartenance est calculée par requête, on ne
        // peut pas la retirer manuellement. Ce n'est pas un échec.
        dynamiques.push(groupe);
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

  var message = '';
  if (retires.length === 0) {
    if (dynamiques.length > 0) {
      message = data.email_cible + ' n\'appartient à aucun groupe statique (' +
        dynamiques.length + ' groupe(s) dynamique(s) ignoré(s) car géré(s) automatiquement : ' +
        dynamiques.join(', ') + ').';
    } else {
      message = data.email_cible + ' n\'a aucun groupe direct à révoquer (' +
        ignores.length + ' appartenance(s) indirecte(s) ignorée(s)).';
    }
  } else {
    message = data.email_cible + ' retiré de ' + retires.length + ' groupe(s) direct(s)';
    if (dynamiques.length > 0) {
      message += ' (' + dynamiques.length + ' groupe(s) dynamique(s) ignoré(s))';
    }
    if (ignores.length > 0) {
      message += ' (' + ignores.length + ' appartenance(s) indirecte(s) ignorée(s))';
    }
    message += ' : ' + retires.join(', ') + '.';
  }

  return {
    target: data.email_cible,
    message: message,
    details: {
      retires: retires,
      ignores: ignores,
      dynamiques: dynamiques,
      total_groupes: groupes.length
    }
  };
}
