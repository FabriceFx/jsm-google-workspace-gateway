/**
 * FORMULAIRE — Effacement à distance d'un appareil mobile
 * -----------------------------------------------------------------------------
 * Formulaire JSM : perte ou vol de téléphone, départ d'un salarié.
 * Fenêtre PERMANENTE : un vol n'attend pas les heures de bureau.
 *
 * Champs attendus dans `data` : email_cible, [device_id], [type_effacement]
 *   type_effacement : 'COMPLET' (réinitialisation usine) ou 'COMPTE' (retire
 *   le compte pro, laisse les données perso). Défaut : 'COMPTE'.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
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
