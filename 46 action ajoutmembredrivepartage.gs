/**
 * FORMULAIRE — Ajout d'un membre à un Drive partagé (Shared Drive)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : demande d'accès à un espace de stockage d'équipe.
 *
 * Champs attendus dans `data` :
 *   email_cible, drive_id (ID du Drive partagé),
 *   [role] ∈ {reader, commenter, fileOrganizer, organizer} (défaut : fileOrganizer),
 *   [type_membre] ∈ {user, group} (défaut : user)
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.0.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_AJOUT_MEMBRE_DRIVE_PARTAGE() {
  return {
    action: 'AJOUT_MEMBRE_DRIVE_PARTAGE',
    description: 'Ajoute un utilisateur ou un groupe à un Drive partagé (Shared Drive).',
    required: ['email_cible', 'drive_id'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionAjouterMembreDrivePartage_
  };
}

/**
 * ACTION AJOUT_MEMBRE_DRIVE_PARTAGE — Ajoute une permission sur un Shared Drive.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionAjouterMembreDrivePartage_(data, ctx) {
  const rolesValides = ['reader', 'commenter', 'fileOrganizer', 'organizer'];
  const role = String(data.role || 'fileOrganizer').toLowerCase();
  
  const roleMap = {
    'reader': 'reader',
    'commenter': 'commenter',
    'fileorganizer': 'fileOrganizer',
    'organizer': 'organizer',
    'manager': 'organizer',
    'gestionnaire': 'organizer'
  };

  const roleCanonique = roleMap[role.toLowerCase()] || role;

  if (rolesValides.indexOf(roleCanonique) === -1) {
    throw new AppError_('INVALID_ROLE',
      "Rôle Drive partagé '" + data.role + "' invalide. Valeurs admises : " +
      rolesValides.join(', ') + '.');
  }

  const typeMembre = String(data.type_membre || 'user').toLowerCase();
  const driveId = String(data.drive_id).trim();

  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) +
    '/permissions?supportsAllDrives=true&sendNotificationEmail=false';

  const body = {
    role: roleCanonique,
    type: typeMembre === 'group' ? 'group' : 'user',
    emailAddress: data.email_cible
  };

  const rep = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const code = rep.getResponseCode();
  const txt = rep.getContentText();

  if (code === 200 || code === 201) {
    const res = JSON.parse(txt);
    return {
      target: data.email_cible,
      message: data.email_cible + ' ajouté au Drive partagé (' + driveId + ') avec le rôle ' + roleCanonique + '.',
      details: { permissionId: res.id, role: roleCanonique, driveId: driveId }
    };
  }

  if (code === 404) {
    throw new AppError_('NOT_FOUND',
      'Drive partagé (' + driveId + ') ou adresse (' + data.email_cible + ') introuvable.', 404);
  }

  if (code === 400 && txt.indexOf('already has permission') !== -1) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: data.email_cible + ' dispose déjà d\'une permission sur ce Drive partagé.'
    };
  }

  let errMsg = txt;
  try { errMsg = JSON.parse(txt).error.message; } catch (e) {}
  throw new AppError_('DRIVE_API_ERROR', 'Échec de l\'ajout au Drive partagé : ' + errMsg, code);
}
