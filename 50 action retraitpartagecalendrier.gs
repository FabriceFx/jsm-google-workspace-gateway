/**
 * FORMULAIRE — Retrait du partage d'agenda Google Calendar
 * -----------------------------------------------------------------------------
 * Formulaire JSM : révocation des droits d'un utilisateur sur un agenda.
 *
 * Champs attendus dans `data` : email_calendrier, email_beneficiaire
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_PARTAGE_CALENDRIER() {
  return {
    action: 'RETRAIT_PARTAGE_CALENDRIER',
    description: 'Retire l\'accès d\'un utilisateur à un agenda Google Calendar.',
    required: ['email_calendrier', 'email_beneficiaire'],
    emails: ['email_calendrier', 'email_beneficiaire'],
    fenetre: 'PERMANENTE',   // retrait d'accès : jamais différé
    handler: actionRetirerPartageCalendrier_
  };
}

/**
 * ACTION RETRAIT_PARTAGE_CALENDRIER — Supprime une ACL d'agenda.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerPartageCalendrier_(data, ctx) {
  const calId = String(data.email_calendrier).trim();
  const beneficiaire = String(data.email_beneficiaire).toLowerCase().trim();
  const aclRuleId = 'user:' + beneficiaire;

  const urlDel = 'https://www.googleapis.com/calendar/v3/calendars/' +
    encodeURIComponent(calId) + '/acl/' + encodeURIComponent(aclRuleId);

  const rep = UrlFetchApp.fetch(urlDel, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  const code = rep.getResponseCode();

  if (code === 204 || code === 200) {
    return {
      target: calId,
      message: 'Partage de l\'agenda ' + calId + ' révoqué pour ' + beneficiaire + '.',
      details: { email_calendrier: calId, beneficiaire: beneficiaire }
    };
  }

  if (code === 404) {
    return {
      idempotent: true,
      target: calId,
      message: beneficiaire + ' ne dispose d\'aucun accès direct sur l\'agenda ' + calId + '.'
    };
  }

  let errMsg = rep.getContentText();
  try { errMsg = JSON.parse(errMsg).error.message; } catch (e) {}
  throw new AppError_('CALENDAR_API_ERROR', 'Échec du retrait de partage d\'agenda : ' + errMsg, code);
}
