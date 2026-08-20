/**
 * FORMULAIRE — Suppression d'une ressource de calendrier (salle de réunion, équipement)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : suppression d'une salle fermée ou d'une ressource retirée.
 *
 * Champs attendus dans `data` :
 *  - resource_id (requis) : identifiant de la ressource
 *  - [confirmation] (optionnel) : confirmation obligatoire pour action destructive
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_SUPPRESSION_RESSOURCE_CALENDRIER() {
  return {
    action: 'SUPPRESSION_RESSOURCE_CALENDRIER',
    description: 'Supprime définitivement une ressource de calendrier ou salle de réunion.',
    required: ['resource_id'],
    emails: [],
    fenetre: 'STANDARD',
    destructive: true,
    handler: actionSuppressionRessourceCalendrier_
  };
}

/**
 * ACTION SUPPRESSION_RESSOURCE_CALENDRIER — Supprime la ressource via Calendar Resources API.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionSuppressionRessourceCalendrier_(data, ctx) {
  const resourceId = String(data.resource_id).trim();

  try {
    AdminDirectory.Resources.Calendars.remove('my_customer', resourceId);
  } catch (err) {
    if (err.message && (err.message.includes('notFound') || err.message.includes('404'))) {
      return {
        idempotent: true,
        target: resourceId,
        message: 'La ressource de calendrier ' + resourceId + ' n\'existe pas (déjà supprimée).'
      };
    }
    throw new AppError_('CALENDAR_RESOURCE_ERROR', 'Erreur lors de la suppression de la ressource : ' + err.message, 502);
  }

  return {
    target: resourceId,
    message: 'Ressource de calendrier ' + resourceId + ' supprimée avec succès.',
    details: { resourceId: resourceId }
  };
}
