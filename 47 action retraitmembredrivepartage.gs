/**
 * FORMULAIRE — Retrait d'un membre d'un Drive partagé (Shared Drive)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : révocation d'accès à un espace de stockage d'équipe.
 *
 * Champs attendus dans `data` : email_cible, drive_id
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_MEMBRE_DRIVE_PARTAGE() {
  return {
    action: 'RETRAIT_MEMBRE_DRIVE_PARTAGE',
    description: 'Retire un utilisateur ou un groupe d\'un Drive partagé (Shared Drive).',
    required: ['email_cible', 'drive_id'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // retrait d'accès : jamais différé
    handler: actionRetirerMembreDrivePartage_
  };
}

/**
 * ACTION RETRAIT_MEMBRE_DRIVE_PARTAGE — Supprime une permission sur un Shared Drive.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerMembreDrivePartage_(data, ctx) {
  const driveId = String(data.drive_id).trim();
  const emailCible = String(data.email_cible).toLowerCase().trim();

  // 1. Lister les permissions du Drive pour trouver l'ID de permission
  const urlList = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) +
    '/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress,role)';

  const repList = UrlFetchApp.fetch(urlList, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  const codeList = repList.getResponseCode();
  const txtList = repList.getContentText();

  if (codeList === 404) {
    throw new AppError_('NOT_FOUND', 'Drive partagé (' + driveId + ') introuvable.', 404);
  }
  if (codeList >= 400) {
    let errMsg = txtList;
    try { errMsg = JSON.parse(txtList).error.message; } catch (e) {}
    throw new AppError_('DRIVE_API_ERROR', 'Impossible de lire les permissions du Drive partagé : ' + errMsg, codeList);
  }

  const perms = (JSON.parse(txtList).permissions || []);
  const permCible = perms.filter(function (p) {
    return String(p.emailAddress || '').toLowerCase() === emailCible;
  })[0];

  if (!permCible) {
    return {
      idempotent: true,
      target: emailCible,
      message: emailCible + ' ne dispose d\'aucun accès direct sur le Drive partagé (' + driveId + ').'
    };
  }

  // 2. Supprimer la permission
  const urlDel = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) +
    '/permissions/' + encodeURIComponent(permCible.id) + '?supportsAllDrives=true';

  const repDel = UrlFetchApp.fetch(urlDel, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  const codeDel = repDel.getResponseCode();
  if (codeDel === 204 || codeDel === 200) {
    return {
      target: emailCible,
      message: 'Accès de ' + emailCible + ' révoqué du Drive partagé (' + driveId + ').',
      details: { driveId: driveId, permissionId: permCible.id }
    };
  }

  let delErrMsg = repDel.getContentText();
  try { delErrMsg = JSON.parse(delErrMsg).error.message; } catch (e) {}
  throw new AppError_('DRIVE_API_ERROR', 'Échec du retrait de la permission : ' + delErrMsg, codeDel);
}
