/**
 * FORMULAIRE — Réponse d'absence automatique
 * -----------------------------------------------------------------------------
 * Formulaire JSM : l'utilisateur est indisponible (hospitalisation, congé
 * longue durée) et ne peut pas configurer lui-même sa réponse d'absence.
 *
 * ⚠️ Cette action nécessite un compte de service avec délégation de domaine
 * (voir README, section « Actions Gmail »). Propriétés requises :
 * SERVICE_ACCOUNT_EMAIL et SERVICE_ACCOUNT_KEY.
 *
 * Champs attendus dans `data` : email_cible, message_absence,
 *   [date_debut], [date_fin], [objet]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_REPONSE_ABSENCE() {
  return {
    action: 'REPONSE_ABSENCE',
    description: 'Active la réponse d\'absence automatique d\'un utilisateur.',
    required: ['email_cible', 'message_absence'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionReponseAbsence
  };
}

/**
 * ACTION REPONSE_ABSENCE — Configure la réponse d'absence Gmail.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionReponseAbsence(data, ctx) {
  var SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic';

  requireUser_(data.email_cible);

  var vacation = {
    enableAutoReply: true,
    responseSubject: data.objet || 'Absence',
    responseBodyHtml: echapper_(data.message_absence)
      .replace(/\n/g, '<br />'),
    restrictToContacts: false,
    restrictToDomain: false
  };

  // Dates optionnelles au format ISO strict yyyy-MM-dd. On refuse tout autre
  // format : « 05/03/2026 » serait interprété à l'américaine (3 mai) et poserait
  // une période d'absence silencieusement fausse.
  var debut = data.date_debut ? parseDateIso_(data.date_debut, 'date_debut') : null;
  var fin = data.date_fin ? parseDateIso_(data.date_fin, 'date_fin') : null;
  if (debut && fin && fin.getTime() < debut.getTime()) {
    throw new AppError_('INVALID_DATE',
      "La date de fin (" + data.date_fin + ") précède la date de début (" +
      data.date_debut + ").");
  }
  if (debut) vacation.startTime = debut.getTime();
  if (fin) vacation.endTime = fin.getTime();

  appelGmailApi_(data.email_cible,
    'settings/vacation',
    'PUT',
    vacation,
    SCOPE);

  var periode = '';
  if (data.date_debut && data.date_fin) {
    periode = ' du ' + data.date_debut + ' au ' + data.date_fin;
  } else if (data.date_debut) {
    periode = ' à partir du ' + data.date_debut;
  }

  return {
    target: data.email_cible,
    message: 'Réponse d\'absence activée pour ' + data.email_cible + periode + '.',
    details: { objet: vacation.responseSubject }
  };
}
