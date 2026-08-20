/**
 * FORMULAIRE — Configuration des autorisations et paramètres d'un groupe Google
 * -----------------------------------------------------------------------------
 * Formulaire JSM : ouverture d'un groupe aux expéditeurs externes (fournisseurs/clients),
 * restriction interne, modération des messages ou visibilité des membres.
 *
 * Champs attendus dans `data` :
 *  - email_groupe (requis) : adresse e-mail du groupe
 *  - [who_can_post_message] (optionnel) : ANYONE_CAN_POST, ALL_IN_DOMAIN_CAN_POST,
 *    ALL_MEMBERS_CAN_POST, ALL_MANAGERS_CAN_POST
 *  - [allow_external_members] (optionnel) : "true" ou "false"
 *  - [who_can_view_group] (optionnel) : ANYONE_CAN_VIEW, ALL_IN_DOMAIN_CAN_VIEW, ALL_MEMBERS_CAN_VIEW
 *  - [who_can_view_membership] (optionnel) : ALL_IN_DOMAIN_CAN_VIEW, ALL_MEMBERS_CAN_VIEW, ALL_MANAGERS_CAN_VIEW
 *  - [message_moderation_level] (optionnel) : MODERATE_NONE, MODERATE_ALL_MESSAGES, MODERATE_NON_MEMBERS
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_CONFIG_GROUPE() {
  return {
    action: 'CONFIG_GROUPE',
    description: 'Modifie les autorisations de publication et de visibilité d\'un groupe.',
    required: ['email_groupe'],
    emails: ['email_groupe'],
    fenetre: 'STANDARD',
    handler: actionConfigGroupe_
  };
}

/**
 * ACTION CONFIG_GROUPE — Met à jour les paramètres du groupe via Groups Settings API.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionConfigGroupe_(data, ctx) {
  requireGroup_(data.email_groupe);

  const payload = {};
  if (data.who_can_post_message) payload.whoCanPostMessage = data.who_can_post_message;
  if (data.allow_external_members !== undefined) payload.allowExternalMembers = String(data.allow_external_members);
  if (data.who_can_view_group) payload.whoCanViewGroup = data.who_can_view_group;
  if (data.who_can_view_membership) payload.whoCanViewMembership = data.who_can_view_membership;
  if (data.message_moderation_level) payload.messageModerationLevel = data.message_moderation_level;

  if (Object.keys(payload).length === 0) {
    return {
      idempotent: true,
      target: data.email_groupe,
      message: 'Aucun paramètre à modifier fourni pour le groupe ' + data.email_groupe + '.'
    };
  }

  const url = 'https://www.googleapis.com/groups/v1/groups/' + encodeURIComponent(data.email_groupe);
  const token = ScriptApp.getOAuthToken();

  const rep = UrlFetchApp.fetch(url, {
    method: 'PATCH',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = rep.getResponseCode();
  if (code >= 400) {
    let msg = rep.getContentText();
    try { msg = JSON.parse(msg).error.message; } catch (e) {}
    throw new AppError_('GROUPS_SETTINGS_ERROR', 'Erreur Groups Settings API (' + code + ') : ' + msg, code >= 500 ? 502 : code);
  }

  const detailsModifs = [];
  if (payload.whoCanPostMessage) detailsModifs.push('Publication: ' + payload.whoCanPostMessage);
  if (payload.allowExternalMembers) detailsModifs.push('Membres externes: ' + payload.allowExternalMembers);
  if (payload.messageModerationLevel) detailsModifs.push('Modération: ' + payload.messageModerationLevel);

  return {
    target: data.email_groupe,
    message: 'Paramètres du groupe ' + data.email_groupe + ' mis à jour : ' + detailsModifs.join(', ') + '.',
    details: {
      email_groupe: data.email_groupe,
      modifications: payload
    }
  };
}
