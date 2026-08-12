/**
 * FORMULAIRE — Approbation d'un appareil mobile
 * -----------------------------------------------------------------------------
 * Formulaire JSM : nouveau téléphone en attente de validation.
 *
 * Champs attendus dans `data` : email_cible, [device_id]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_APPROBATION_APPAREIL() {
  return {
    action: 'APPROBATION_APPAREIL',
    description: 'Approuve un appareil mobile en attente de validation.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionApprouverAppareil_
  };
}

/**
 * ACTION APPROBATION_APPAREIL — Approuve un ou tous les appareils en attente.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionApprouverAppareil_(data, ctx) {
  var resultat = actionSurAppareils_(data.email_cible, 'approve', data.device_id);

  return {
    target: data.email_cible,
    message: resultat.traites + ' appareil(s) approuvé(s) pour ' +
      data.email_cible + '.',
    details: { appareils: resultat.appareils }
  };
}
