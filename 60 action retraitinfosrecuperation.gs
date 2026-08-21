/**
 * FORMULAIRE — Retrait des informations de récupération
 * -----------------------------------------------------------------------------
 * Formulaire JSM : suppression des coordonnées personnelles de secours
 * (adresse e-mail et numéro de téléphone de récupération).
 *
 * Champs attendus dans `data` :
 *   email_cible (compte Workspace dont on purge les données de récupération)
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.3.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Déclaration de l'action au registre.
 *
 * @return {!Object} Spécification de l'action.
 */
function SPEC_RETRAIT_INFOS_RECUPERATION() {
  return {
    action: 'RETRAIT_INFOS_RECUPERATION',
    description: 'Supprime l\'e-mail et le téléphone de récupération associés à un compte.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    destructive: true,
    handler: actionRetirerInfosRecuperation_
  };
}

/**
 * ACTION RETRAIT_INFOS_RECUPERATION — Purge l'e-mail et le téléphone de récupération.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerInfosRecuperation_(data, ctx) {
  const user = requireUser_(data.email_cible);
  const primaryEmail = user.primaryEmail;

  const ancienEmail = user.recoveryEmail || '';
  const ancienTel = user.recoveryPhone || '';

  // Idempotence : si aucune information de récupération n'est présente
  if (!ancienEmail && !ancienTel) {
    return {
      idempotent: true,
      target: primaryEmail,
      message: primaryEmail + ' n\'a aucune information de récupération (e-mail ou téléphone) renseignée. Aucune action réalisée.'
    };
  }

  // Effacement des coordonnées de secours
  AdminDirectory.Users.patch(
    {
      recoveryEmail: '',
      recoveryPhone: ''
    },
    primaryEmail
  );

  const purges = [];
  if (ancienEmail) purges.push('e-mail : ' + ancienEmail);
  if (ancienTel) purges.push('téléphone : ' + ancienTel);

  return {
    target: primaryEmail,
    message: 'Informations de récupération purgées pour ' + primaryEmail + ' (' + purges.join(', ') + ').',
    details: {
      ancien_email_recuperation: ancienEmail || null,
      ancien_tel_recuperation: ancienTel || null
    }
  };
}
