/**
 * FORMULAIRE — Génération de codes de secours 2FA
 * -----------------------------------------------------------------------------
 * Formulaire JSM : utilisateur ayant perdu son 2e facteur.
 * Les anciens codes sont définitivement révoqués.
 *
 * Champs attendus dans `data` : email_cible, [manager_email]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_GENERATION_CODES_SECOURS() {
  return {
    action: 'GENERATION_CODES_SECOURS',
    description: 'Génère de nouveaux codes de secours 2FA (les anciens sont révoqués).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionGenererCodesSecours
  };
}

/**
 * ACTION GENERATION_CODES_SECOURS — Génère et transmet des codes de secours.
 *
 * Comme pour les mots de passe, les codes ne sont JAMAIS renvoyés dans la
 * réponse HTTP : ils sont envoyés par e-mail au manager ou à NOTIFY_EMAIL.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionGenererCodesSecours(data, ctx) {
  var utilisateur = getUserOrNull_(data.email_cible);
  if (!utilisateur) {
    throw new AppError_('NOT_FOUND',
      'Compte ' + data.email_cible + ' introuvable.', 404);
  }

  // Générer de nouveaux codes (révoque les anciens).
  AdminDirectory.VerificationCodes.generate(data.email_cible);

  // Récupérer les codes générés.
  var reponse = AdminDirectory.VerificationCodes.list(data.email_cible);
  var codes = (reponse.items || []).map(function (c) { return c.verificationCode; });

  if (!codes.length) {
    throw new AppError_('CODES_NON_GENERES',
      'La génération a abouti mais aucun code n\'a été retourné. ' +
      'Vérifier manuellement depuis la console d\'administration.', 500);
  }

  // Envoi par canal séparé (même logique que les mots de passe).
  var destinataire = data.manager_email || getProp_('NOTIFY_EMAIL');
  var envoye = envoyerCodesSecours_(
    destinataire, data.email_cible, codes, ctx.ticketKey);

  if (!envoye) {
    throw new AppError_('NOTIFY_FAILED',
      'Codes de secours générés mais non transmissibles : aucun destinataire ' +
      'valide. Consulter la console d\'administration.', 500);
  }

  return {
    target: data.email_cible,
    message: codes.length + ' codes de secours générés pour ' + data.email_cible +
      '. Envoyés à ' + destinataire + '.',
    details: { nombre_codes: codes.length, envoyes_a: destinataire }
  };
}
