/**
 * FORMULAIRE — Partage d'agenda Google Calendar
 * -----------------------------------------------------------------------------
 * Formulaire JSM : délégation ou partage d'accès sur un agenda d'utilisateur
 * ou une ressource / salle.
 *
 * Champs attendus dans `data` :
 *   email_calendrier (agenda source), email_beneficiaire (qui reçoit l'accès),
 *   [role] ∈ {freeBusyReader, reader, writer, owner} (défaut : reader)
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.0.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_PARTAGE_CALENDRIER() {
  return {
    action: 'PARTAGE_CALENDRIER',
    description: 'Accorde l\'accès à un agenda Google Calendar (collaborateur ou ressource).',
    required: ['email_calendrier', 'email_beneficiaire'],
    emails: ['email_calendrier', 'email_beneficiaire'],
    fenetre: 'STANDARD',
    handler: actionPartagerCalendrier_
  };
}

/**
 * ACTION PARTAGE_CALENDRIER — Ajoute ou met à jour une ACL sur un agenda.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionPartagerCalendrier_(data, ctx) {
  const rolesValides = ['freeBusyReader', 'reader', 'writer', 'owner'];
  const roleMap = {
    'freebusyreader': 'freeBusyReader',
    'disponibilites': 'freeBusyReader',
    'reader': 'reader',
    'lecture': 'reader',
    'writer': 'writer',
    'ecriture': 'writer',
    'modification': 'writer',
    'owner': 'owner',
    'proprietaire': 'owner'
  };

  const roleBrut = String(data.role || 'reader').toLowerCase().trim();
  const roleCanonique = roleMap[roleBrut] || data.role;

  if (rolesValides.indexOf(roleCanonique) === -1) {
    throw new AppError_('INVALID_ROLE',
      "Rôle d'agenda '" + data.role + "' invalide. Valeurs admises : " +
      rolesValides.join(', ') + '.');
  }

  const calId = String(data.email_calendrier).trim();
  const beneficiaire = String(data.email_beneficiaire).toLowerCase().trim();

  const urlAcl = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calId) + '/acl';

  const body = {
    role: roleCanonique,
    scope: {
      type: 'user',
      value: beneficiaire
    }
  };

  const rep = UrlFetchApp.fetch(urlAcl, {
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
      target: calId,
      message: 'Accès à l\'agenda ' + calId + ' accordé à ' + beneficiaire + ' (droits : ' + roleCanonique + ').',
      details: { aclId: res.id, role: roleCanonique }
    };
  }

  // Si l'accès existe déjà, mise à jour (PATCH)
  if (code === 409 || (code === 400 && txt.indexOf('already exists') !== -1)) {
    const aclRuleId = 'user:' + beneficiaire;
    const urlPatch = urlAcl + '/' + encodeURIComponent(aclRuleId);
    const repPatch = UrlFetchApp.fetch(urlPatch, {
      method: 'PATCH',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ role: roleCanonique }),
      muteHttpExceptions: true
    });

    if (repPatch.getResponseCode() === 200) {
      return {
        idempotent: true,
        target: calId,
        message: 'Droits de ' + beneficiaire + ' sur l\'agenda ' + calId + ' actualisés vers ' + roleCanonique + '.'
      };
    }
  }

  if (code === 404) {
    throw new AppError_('NOT_FOUND', 'Agenda (' + calId + ') introuvable ou droits insuffisants.', 404);
  }

  let errMsg = txt;
  try { errMsg = JSON.parse(txt).error.message; } catch (e) {}
  throw new AppError_('CALENDAR_API_ERROR', 'Échec du partage de calendrier : ' + errMsg, code);
}
