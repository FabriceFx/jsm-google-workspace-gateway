/**
 * FORMULAIRE — Réinitialisation de mot de passe
 * -----------------------------------------------------------------------------
 * Formulaire JSM : perte d'accès, mot de passe oublié.
 *
 * Champs attendus dans `data` : email_cible, [manager_email]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Déclaration de l'action au registre.
 *
 * Cette fonction doit être référencée dans declarationsFormulaires_()
 * (01_Registre.gs) pour que l'action soit active. Apps Script n'expose pas les
 * fonctions de premier niveau à l'énumération : la déclaration est explicite.
 *
 * @return {!Object} Spécification de l'action.
 */
function SPEC_RESET_MOT_DE_PASSE() {
  return {
    action: 'RESET_MOT_DE_PASSE',
    description: 'Réinitialise le mot de passe avec changement au 1er login.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',   // soumise au créneau ouvrable, différée sinon
    handler: actionReinitialiserMotDePasse
  };
}

/**
 * ACTION RESET_MOT_DE_PASSE — Réinitialise le mot de passe d'un compte.
 *
 * data : email_cible, [manager_email]
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionReinitialiserMotDePasse(data, ctx) {
  const utilisateur = getUserOrNull_(data.email_cible);
  if (!utilisateur) {
    throw new AppError_('NOT_FOUND',
      'Compte ' + data.email_cible + ' introuvable.', 404);
  }

  const motDePasse = generatePassword_();
  AdminDirectory.Users.patch(
    { password: motDePasse, changePasswordAtNextLogin: true },
    data.email_cible
  );

  const destinataire = data.manager_email || getProp_('NOTIFY_EMAIL');
  const envoye = envoyerIdentifiants_(
    destinataire, data.email_cible, motDePasse, ctx.ticketKey);

  if (!envoye) {
    throw new AppError_('NOTIFY_FAILED',
      'Mot de passe réinitialisé mais non transmissible : aucun destinataire ' +
      "valide. Réinitialiser depuis la console Admin.", 500);
  }

  return {
    target: data.email_cible,
    message: 'Mot de passe de ' + data.email_cible +
      ' réinitialisé. Identifiants envoyés à ' + destinataire + '.'
  };
}