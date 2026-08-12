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

  cibles.forEach(function (t) {
    AdminDirectory.Tokens.remove(data.email_cible, t.clientId);
  });

  var noms = cibles.map(function (t) { return t.displayText || t.clientId; });

  return {
    target: data.email_cible,
    message: cibles.length + ' application(s) révoquée(s) pour ' +
      data.email_cible + ' : ' + noms.join(', ') + '.',
    details: { applications: noms }
  };
}
