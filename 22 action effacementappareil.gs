/**
 * FORMULAIRE — Effacement à distance d'un appareil mobile
 * -----------------------------------------------------------------------------
 * Formulaire JSM : perte ou vol de téléphone, départ d'un salarié.
 * Fenêtre PERMANENTE : un vol n'attend pas les heures de bureau.
 *
 * Champs attendus dans `data` : email_cible, [device_id], [type_effacement],
 *   [confirmation]
 *   type_effacement : 'COMPLET' (réinitialisation usine) ou 'COMPTE' (retire
 *   le compte pro, laisse les données perso). Défaut : 'COMPTE'.
 *   confirmation : requis (= 'CONFIRMER_EFFACEMENT') uniquement pour un wipe
 *   'COMPLET' visant TOUS les appareils (aucun device_id fourni).
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_EFFACEMENT_APPAREIL() {
  return {
    action: 'EFFACEMENT_APPAREIL',
    description: 'Efface à distance un appareil mobile (vol, perte).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',
    handler: actionEffacerAppareil
  };
}

/**
 * ACTION EFFACEMENT_APPAREIL — Efface un ou tous les appareils d'un utilisateur.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionEffacerAppareil(data, ctx) {
  var type = String(data.type_effacement || 'COMPTE').toUpperCase();

  // Enum validée explicitement : une valeur inattendue ne doit pas retomber
  // silencieusement sur le wipe partiel (un agent croirait avoir réinitialisé
  // un téléphone volé alors que seules les données pro auraient été retirées).
  if (type !== 'COMPLET' && type !== 'COMPTE') {
    throw new AppError_('INVALID_TYPE',
      "type_effacement '" + data.type_effacement + "' invalide. Valeurs admises : " +
      "COMPLET (réinitialisation usine) ou COMPTE (compte pro uniquement).");
  }

  // Garde-fou : une réinitialisation usine SANS device_id efface TOUS les
  // appareils de l'utilisateur, y compris personnels (BYOD). On exige alors une
  // confirmation explicite, comme pour les suppressions de compte.
  if (type === 'COMPLET' && !data.device_id &&
      data.confirmation !== 'CONFIRMER_EFFACEMENT') {
    throw new AppError_('CONFIRMATION_REQUISE',
      "Réinitialisation usine de TOUS les appareils de " + data.email_cible +
      " demandée. Pour éviter un effacement accidentel (appareils personnels " +
      "inclus), renseigner 'confirmation' = 'CONFIRMER_EFFACEMENT', ou cibler " +
      "un seul appareil via 'device_id'.", 400);
  }

  var action = (type === 'COMPLET') ? 'admin_remote_wipe' : 'admin_account_wipe';
  var libelle = (type === 'COMPLET')
    ? 'réinitialisé en configuration usine'
    : 'nettoyé (compte professionnel supprimé)';

  var resultat = actionSurAppareils_(data.email_cible, action, data.device_id);

  return {
    target: data.email_cible,
    message: resultat.traites + ' appareil(s) ' + libelle +
      ' pour ' + data.email_cible + '.',
    details: { type: type, appareils: resultat.appareils }
  };
}
