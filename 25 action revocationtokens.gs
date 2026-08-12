/**
 * FORMULAIRE — Révocation des tokens d'applications tierces
 * -----------------------------------------------------------------------------
 * Formulaire JSM : application suspecte autorisée par l'utilisateur.
 * Fenêtre PERMANENTE : incident de sécurité.
 *
 * Champs attendus dans `data` : email_cible, [client_id]
 *   Si client_id est fourni, seule cette application est révoquée.
 *   Sinon, TOUTES les applications tierces sont révoquées.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_REVOCATION_TOKENS_APPS() {
  return {
    action: 'REVOCATION_TOKENS_APPS',
    description: 'Révoque les accès des applications tierces.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',
    handler: actionRevoquerTokens
  };
}

/**
 * ACTION REVOCATION_TOKENS_APPS — Révoque les tokens d'applications tierces.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRevoquerTokens(data, ctx) {
  requireUser_(data.email_cible);

  var reponse = AdminDirectory.Tokens.list(data.email_cible);
  var tokens = reponse.items || [];

  if (!tokens.length) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: 'Aucune application tierce autorisée pour ' + data.email_cible + '.'
    };
  }

  var cibles = data.client_id
    ? tokens.filter(function (t) { return t.clientId === data.client_id; })
    : tokens;

  if (data.client_id && !cibles.length) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: 'Application ' + data.client_id + ' non trouvée pour ' +
        data.email_cible + '. Applications autorisées : ' +
        tokens.map(function (t) { return t.displayText || t.clientId; }).join(', ')
    };
  }

  // Révocation une par une : on isole les échecs pour ne pas laisser une
  // révocation partielle remonter en « erreur interne » sans dire ce qui a été
  // effectivement révoqué.
  var revoquees = [];
  var echecs = [];
  cibles.forEach(function (t) {
    var nom = t.displayText || t.clientId;
    try {
      AdminDirectory.Tokens.remove(data.email_cible, t.clientId);
      revoquees.push(nom);
    } catch (err) {
      echecs.push(nom + ' (' + err.message + ')');
    }
  });

  if (echecs.length) {
    throw new AppError_('REVOCATION_PARTIELLE',
      'Révocation incomplète pour ' + data.email_cible + '. Révoquées : ' +
      (revoquees.join(', ') || 'aucune') + '. En échec : ' + echecs.join(', ') +
      '. Relancer l\'action pour réessayer les applications restantes.', 502);
  }

  return {
    target: data.email_cible,
    message: revoquees.length + ' application(s) révoquée(s) pour ' +
      data.email_cible + ' : ' + revoquees.join(', ') + '.',
    details: { applications: revoquees }
  };
}
