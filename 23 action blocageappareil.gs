/**
 * FORMULAIRE — Blocage d'un appareil mobile
 * -----------------------------------------------------------------------------
 * Formulaire JSM : appareil suspect, incident de sécurité.
 * Fenêtre PERMANENTE : un incident de sécurité n'attend pas.
 *
 * Champs attendus dans `data` : email_cible, [device_id]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_BLOCAGE_APPAREIL() {
  return {
    action: 'BLOCAGE_APPAREIL',
    description: 'Bloque un appareil mobile (incident de sécurité).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',
    handler: actionBloquerAppareil
  };
}

/**
 * ACTION BLOCAGE_APPAREIL — Bloque un ou tous les appareils d'un utilisateur.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionBloquerAppareil(data, ctx) {
  var resultat = actionSurAppareils_(data.email_cible, 'block', data.device_id);

  return {
    target: data.email_cible,
    message: resultat.traites + ' appareil(s) bloqué(s) pour ' +
      data.email_cible + '.',
    details: { appareils: resultat.appareils }
  };
}
