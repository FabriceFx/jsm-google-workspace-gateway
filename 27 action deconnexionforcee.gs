/**
 * FORMULAIRE — Déconnexion forcée
 * -----------------------------------------------------------------------------
 * Formulaire JSM : sessions suspectes sur un compte non suspendu.
 * Fenêtre PERMANENTE : incident de sécurité.
 *
 * À la différence de SUSPENSION, le compte reste actif : l'utilisateur peut
 * se reconnecter. Utile quand on veut couper des sessions douteuses sans
 * bloquer l'utilisateur (ex. : appareil prêté, session oubliée).
 *
 * Champs attendus dans `data` : email_cible, [motif]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_DECONNEXION_FORCEE() {
  return {
    action: 'DECONNEXION_FORCEE',
    description: 'Déconnecte toutes les sessions actives (le compte reste actif).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',
    destructive: true,
    handler: actionDeconnexionForcee_
  };
}

/**
 * ACTION DECONNEXION_FORCEE — Révoque toutes les sessions sans suspendre.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionDeconnexionForcee_(data, ctx) {
  requireUser_(data.email_cible);

  AdminDirectory.Users.signOut(data.email_cible);

  return {
    target: data.email_cible,
    message: 'Toutes les sessions de ' + data.email_cible +
      ' ont été révoquées' +
      (data.motif ? ' (motif : ' + data.motif + ')' : '') +
      '. Le compte reste actif.'
  };
}
