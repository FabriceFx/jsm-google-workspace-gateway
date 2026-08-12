/**
 * FORMULAIRE — Transfert de propriété Drive
 * -----------------------------------------------------------------------------
 * Formulaire JSM : départ d'un collaborateur, transfert de fichiers.
 *
 * Utilise l'API Data Transfer pour transférer la propriété de tous les
 * fichiers Google Drive d'un utilisateur vers un autre.
 *
 * ⚠️ Nécessite le scope admin.datatransfer dans le manifeste du projet.
 *
 * Champs attendus dans `data` : email_source, email_destination,
 *   [inclure_prives]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.8.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_TRANSFERT_DRIVE() {
  return {
    action: 'TRANSFERT_DRIVE',
    description: 'Transfère la propriété des fichiers Drive d\'un utilisateur à un autre.',
    required: ['email_source', 'email_destination'],
    emails: ['email_source', 'email_destination'],
    fenetre: 'STANDARD',
    handler: actionTransfererDrive_
  };
}

/**
 * ACTION TRANSFERT_DRIVE — Transfert de propriété des fichiers Drive.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionTransfererDrive_(data, ctx) {
  /** ID de l'application Google Drive dans l'API Data Transfer. */
  var DRIVE_APP_ID = '55656082996';

  if (data.email_source === data.email_destination) {
    throw new AppError_('SOURCE_EGALE_DESTINATION',
      'Le compte source et le compte destination sont identiques (' +
      data.email_source + ') : aucun transfert à effectuer.');
  }

  // Résoudre les adresses en identifiants internes.
  var source = requireUser_(data.email_source, 'source');
  var destination = requireUser_(data.email_destination, 'destination');

  var inclurePrives = boolDeFormulaire_(data.inclure_prives, false);
  var niveaux = inclurePrives ? ['SHARED', 'PRIVATE'] : ['SHARED'];

  var corps = {
    oldOwnerUserId: source.id,
    newOwnerUserId: destination.id,
    applicationDataTransfers: [{
      applicationId: DRIVE_APP_ID,
      applicationTransferParams: [{
        key: 'PRIVACY_LEVEL',
        value: niveaux
      }]
    }]
  };

  // Appel à l'API Data Transfer via UrlFetchApp.
  var jeton = ScriptApp.getOAuthToken();
  var reponse = UrlFetchApp.fetch(
    'https://admin.googleapis.com/admin/datatransfer/v1/transfers', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + jeton },
    payload: JSON.stringify(corps),
    muteHttpExceptions: true
  });

  var code = reponse.getResponseCode();
  if (code >= 400) {
    var message = '';
    try { message = JSON.parse(reponse.getContentText()).error.message; }
    catch (e) { message = reponse.getContentText(); }
    throw new AppError_('TRANSFER_FAILED',
      'Transfert Drive échoué : ' + message + '. Vérifier que le scope ' +
      'admin.datatransfer est autorisé.', code >= 500 ? 502 : code);
  }

  var resultat = JSON.parse(reponse.getContentText());

  return {
    target: data.email_source,
    message: 'Transfert Drive de ' + data.email_source + ' vers ' +
      data.email_destination + ' lancé' +
      (inclurePrives ? ' (fichiers partagés et privés).' : ' (fichiers partagés).') +
      ' Le transfert peut prendre plusieurs heures selon le volume.',
    details: {
      transfer_id: resultat.id,
      statut: resultat.overallTransferStatusCode,
      inclut_prives: inclurePrives
    }
  };
}
