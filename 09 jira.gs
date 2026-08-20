/**
 * MODULE JIRA CLOUD — CALLBACKS & NOTIFICATIONS AUTOMATIQUES
 * -----------------------------------------------------------------------------
 * Permet à la passerelle de communiquer avec l'API REST de Jira Cloud (v3) :
 *  - Ajout d'une note interne sur le ticket Jira (`posterCommentaireJira_`)
 *  - Transition du ticket (ex: passage à l'état Résolu) (`transitionnerTicketJira_`)
 *
 * Paramètres lus dans les ScriptProperties :
 *  - JIRA_BASE_URL : URL de l'instance Jira (ex: https://mon-domaine.atlassian.net)
 *  - JIRA_USER_EMAIL : Email du compte de service / admin Jira
 *  - JIRA_API_TOKEN : Token d'API Jira Cloud
 *  - JIRA_AUTO_RESOLVE : (Optionnel) "true" pour tenter de résoudre le ticket
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Notifie Jira du résultat d'une action Google Workspace (Callback).
 *
 * @param {string} issueKey Clé du ticket Jira (ex: "SUP-1042").
 * @param {!Object} resultat Résultat de l'action exécutée.
 * @param {!Object} ctx Contexte de la demande.
 * @param {boolean=} estDiffere true si l'exécution a été déclenchée en différé.
 */
function notifierJiraCallback_(issueKey, resultat, ctx, estDiffere) {
  if (!issueKey) return;
  const baseUrl = getProp_('JIRA_BASE_URL');
  const userEmail = getProp_('JIRA_USER_EMAIL');
  const apiToken = getProp_('JIRA_API_TOKEN');

  if (!baseUrl || !userEmail || !apiToken) {
    return; // Callback non configuré : sortie silencieuse
  }

  try {
    const horodatage = formaterDate_(new Date());
    const prefixe = estDiffere ? '⏳ *[Exécution différée]* ' : '⚡ *[Exécution immédiate]* ';
    const actionNom = ctx.action || 'ACTION';

    const lignes = [
      prefixe + 'Action Google Workspace *' + actionNom + '* exécutée avec succès le ' + horodatage + ' :',
      '',
      '> ' + (resultat.message || 'Opération terminée avec succès.').replace(/\n/g, '\n> '),
      '',
      '_Trace ID : ' + (ctx.traceId || 'N/A') + ' | Passerelle v' + CONFIG.VERSION + '_'
    ];

    const messageTexte = lignes.join('\n');
    posterCommentaireJira_(issueKey, messageTexte, true);

    // Résolution automatique si demandée et configurée
    if (getProp_('JIRA_AUTO_RESOLVE') === 'true') {
      transitionnerTicketJira_(issueKey, ['Terminé', 'Résolu', 'Done', 'Resolved', 'Fermé', 'Closed']);
    }
  } catch (err) {
    console.warn('[%s] Échec de la notification Jira pour %s : %s',
      ctx.traceId, issueKey, err.message);
  }
}

/**
 * Poste un commentaire (interne par défaut) sur une issue Jira Cloud.
 *
 * @param {string} issueKey Clé de l'issue (ex: "IT-102").
 * @param {string} texte Contenu du commentaire en syntaxe Jira/Markdown.
 * @param {boolean=} interne true pour une note interne visible uniquement par les agents (JSM).
 * @return {!Object}
 */
function posterCommentaireJira_(issueKey, texte, interne) {
  const baseUrl = (getProp_('JIRA_BASE_URL') || '').replace(/\/+$/, '');
  const userEmail = getProp_('JIRA_USER_EMAIL');
  const apiToken = getProp_('JIRA_API_TOKEN');

  if (!baseUrl || !userEmail || !apiToken) {
    throw new AppError_('JIRA_CONFIG_MANQUANTE', 'Paramètres Jira Cloud non configurés.', 500);
  }

  const url = baseUrl + '/rest/api/3/issue/' + encodeURIComponent(issueKey) + '/comment';
  const authHeader = 'Basic ' + Utilities.base64Encode(userEmail + ':' + apiToken);

  // Format Atlassian Document Format (ADF)
  const payload = {
    body: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: texte
            }
          ]
        }
      ]
    }
  };

  // Visibilité restreinte au rôle Service Desk Team / Administrateurs
  if (interne) {
    payload.properties = [
      {
        key: 'sd.public.comment',
        value: { internal: true }
      }
    ];
  }

  const reponse = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = reponse.getResponseCode();
  if (code >= 400) {
    throw new AppError_('JIRA_API_ERROR', 'Erreur Jira API (' + code + ') : ' + reponse.getContentText(), 502);
  }

  return JSON.parse(reponse.getContentText() || '{}');
}

/**
 * Tente d'appliquer une transition d'état sur un ticket Jira (ex: vers Résolu).
 *
 * @param {string} issueKey Clé du ticket.
 * @param {!Array<string>} nomsCibles Noms acceptés pour la transition cible.
 * @return {boolean} true si transition appliquée.
 */
function transitionnerTicketJira_(issueKey, nomsCibles) {
  const baseUrl = (getProp_('JIRA_BASE_URL') || '').replace(/\/+$/, '');
  const userEmail = getProp_('JIRA_USER_EMAIL');
  const apiToken = getProp_('JIRA_API_TOKEN');
  if (!baseUrl || !userEmail || !apiToken) return false;

  const authHeader = 'Basic ' + Utilities.base64Encode(userEmail + ':' + apiToken);
  const urlGet = baseUrl + '/rest/api/3/issue/' + encodeURIComponent(issueKey) + '/transitions';

  const rep = UrlFetchApp.fetch(urlGet, {
    method: 'GET',
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    muteHttpExceptions: true
  });

  if (rep.getResponseCode() !== 200) return false;
  const data = JSON.parse(rep.getContentText() || '{}');
  const transitions = data.transitions || [];

  let transitionChoisie = null;
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const nom = (t.name || '').toLowerCase();
    for (let j = 0; j < nomsCibles.length; j++) {
      if (nom.includes(nomsCibles[j].toLowerCase())) {
        transitionChoisie = t;
        break;
      }
    }
    if (transitionChoisie) break;
  }

  if (!transitionChoisie) return false;

  const urlPost = baseUrl + '/rest/api/3/issue/' + encodeURIComponent(issueKey) + '/transitions';
  const postRep = UrlFetchApp.fetch(urlPost, {
    method: 'POST',
    contentType: 'application/json',
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    payload: JSON.stringify({ transition: { id: transitionChoisie.id } }),
    muteHttpExceptions: true
  });

  return postRep.getResponseCode() === 204 || postRep.getResponseCode() === 200;
}
