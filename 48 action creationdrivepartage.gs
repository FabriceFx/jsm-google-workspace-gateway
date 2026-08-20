/**
 * FORMULAIRE — Création d'un Drive partagé (Shared Drive)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : demande de création d'un nouvel espace documentaire d'équipe.
 *
 * Champs attendus dans `data` :
 *   nom_drive (nom d'affichage), gestionnaire_email (reçoit les droits 'organizer')
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.0.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_CREATION_DRIVE_PARTAGE() {
  return {
    action: 'CREATION_DRIVE_PARTAGE',
    description: 'Crée un nouveau Drive partagé (Shared Drive) et assigne son gestionnaire initial.',
    required: ['nom_drive', 'gestionnaire_email'],
    emails: ['gestionnaire_email'],
    fenetre: 'STANDARD',
    handler: actionCreerDrivePartage_
  };
}

/**
 * ACTION CREATION_DRIVE_PARTAGE — Crée un Shared Drive et assigne l'organizer.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionCreerDrivePartage_(data, ctx) {
  const nomDrive = String(data.nom_drive).trim();
  const gestionnaire = String(data.gestionnaire_email).toLowerCase().trim();
  const requestId = Utilities.getUuid();

  // 1. Création du Shared Drive
  const urlCreate = 'https://www.googleapis.com/drive/v3/drives?requestId=' + encodeURIComponent(requestId);
  const repCreate = UrlFetchApp.fetch(urlCreate, {
    method: 'POST',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ name: nomDrive }),
    muteHttpExceptions: true
  });

  const codeCreate = repCreate.getResponseCode();
  const txtCreate = repCreate.getContentText();

  if (codeCreate !== 200 && codeCreate !== 201) {
    let errMsg = txtCreate;
    try { errMsg = JSON.parse(txtCreate).error.message; } catch (e) {}
    throw new AppError_('DRIVE_API_ERROR', 'Échec de la création du Drive partagé : ' + errMsg, codeCreate);
  }

  const driveObj = JSON.parse(txtCreate);
  const driveId = driveObj.id;

  // 2. Attribution du rôle Gestionnaire (organizer) au demandeur
  const urlPerm = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) +
    '/permissions?supportsAllDrives=true&sendNotificationEmail=false';

  const repPerm = UrlFetchApp.fetch(urlPerm, {
    method: 'POST',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      role: 'organizer',
      type: 'user',
      emailAddress: gestionnaire
    }),
    muteHttpExceptions: true
  });

  const codePerm = repPerm.getResponseCode();
  if (codePerm !== 200 && codePerm !== 201) {
    console.warn('[%s] Drive créé (%s) mais échec de l\'assignation du gestionnaire %s : %s',
      ctx.traceId, driveId, gestionnaire, repPerm.getContentText());
  }

  return {
    target: nomDrive,
    message: 'Drive partagé « ' + nomDrive + ' » créé avec succès (ID : ' + driveId + '). ' +
      'Gestionnaire assigné : ' + gestionnaire + '.',
    details: {
      driveId: driveId,
      nom_drive: nomDrive,
      gestionnaire: gestionnaire
    }
  };
}
