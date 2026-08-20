/**
 * FORMULAIRE — Création d'une ressource de calendrier (salle de réunion, visio, équipement)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : création d'une nouvelle salle ou ressource réservable.
 *
 * Champs attendus dans `data` :
 *  - resource_id (requis) : identifiant unique de la ressource (ex: "salle-armor-lamballe")
 *  - resource_name (requis) : nom lisible (ex: "Salle Armor (Bât 2)")
 *  - [resource_type] (optionnel) : type de ressource (ex: "SALLE", "VISIO", "VEHICULE")
 *  - [capacity] (optionnel) : capacité d'accueil (ex: 12)
 *  - [building_id] (optionnel) : code du bâtiment
 *  - [floor_name] (optionnel) : étage (ex: "1er étage")
 *  - [resource_description] (optionnel) : description des équipements (ex: "Écran 75 pouces, Caméra Meet")
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_CREATION_RESSOURCE_CALENDRIER() {
  return {
    action: 'CREATION_RESSOURCE_CALENDRIER',
    description: 'Crée une nouvelle salle de réunion ou ressource réservable Google Calendar.',
    required: ['resource_id', 'resource_name'],
    emails: [],
    fenetre: 'STANDARD',
    handler: actionCreationRessourceCalendrier_
  };
}

/**
 * ACTION CREATION_RESSOURCE_CALENDRIER — Crée la ressource via Calendar Resources API.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionCreationRessourceCalendrier_(data, ctx) {
  const resource = {
    resourceId: String(data.resource_id).trim(),
    resourceName: String(data.resource_name).trim(),
    resourceType: data.resource_type || 'SALLE'
  };

  if (data.capacity) resource.capacity = Number(data.capacity);
  if (data.building_id) resource.buildingId = String(data.building_id).trim();
  if (data.floor_name) resource.floorName = String(data.floor_name).trim();
  if (data.resource_description) resource.resourceDescription = String(data.resource_description).trim();

  let cree = null;
  try {
    cree = AdminDirectory.Resources.Calendars.insert(resource, 'my_customer');
  } catch (err) {
    if (err.message && err.message.includes('duplicate')) {
      return {
        idempotent: true,
        target: resource.resourceId,
        message: 'La ressource de calendrier ' + resource.resourceId + ' existe déjà.'
      };
    }
    throw new AppError_('CALENDAR_RESOURCE_ERROR', 'Erreur lors de la création de la ressource : ' + err.message, 502);
  }

  return {
    target: resource.resourceId,
    message: 'Ressource de calendrier « ' + resource.resourceName + ' » créée avec succès (E-mail ressource : ' + (cree.resourceEmail || 'N/A') + ').',
    details: {
      resourceId: cree.resourceId,
      resourceName: cree.resourceName,
      resourceEmail: cree.resourceEmail,
      capacity: cree.capacity,
      buildingId: cree.buildingId
    }
  };
}
