/**
 * FORMULAIRE — Réinitialisation de mot de passe
 * -----------------------------------------------------------------------------
 * Formulaire JSM : perte d'accès, mot de passe oublié.
 *
 * Champs attendus dans `data` : email_cible, [manager_email]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
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
    // manager_email reçoit le mot de passe : validé (format + domaine) ici pour
    // interdire l'envoi du secret vers une adresse hors du domaine.
    emails: ['email_cible', 'manager_email'],
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
  requireUser_(data.email_cible);

  // Contrôle du destinataire AVANT d'écraser le mot de passe : sans lui, on
  // déconnecterait l'utilisateur sans que personne ne détienne le nouveau
  // secret. Le format/domaine de manager_email est déjà validé (spec.emails).
  const destinataire = requireDestinataireSecret_(data);

  const motDePasse = generatePassword_();
  AdminDirectory.Users.patch(
    { password: motDePasse, changePasswordAtNextLogin: true },
    data.email_cible
  );

  const envoye = envoyerIdentifiants_(
    destinataire, data.email_cible, motDePasse, ctx.ticketKey);

  if (!envoye) {
    throw new AppError_('NOTIFY_FAILED',
      'Mot de passe réinitialisé mais son envoi à ' + destinataire +
      ' a échoué. Réinitialiser depuis la console Admin.', 500);
  }

  return {
    target: data.email_cible,
    message: 'Mot de passe de ' + data.email_cible +
      ' réinitialisé. Identifiants envoyés à ' + destinataire + '.'
  };
}