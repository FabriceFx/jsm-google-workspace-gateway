/**
 * FORMULAIRE — Retrait d'un utilisateur de tous les Drives partagés (Shared Drives)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : offboarding, mobilité interne ou revue de conformité sécurité.
 *
 * Supprime TOUTES les permissions directes (type='user') d'un compte sur l'ensemble
 * des Drives partagés du domaine, tout en PRÉSERVANT strictement les accès
 * conférés par l'intermédiaire d'un groupe Google (type='group').
 *
 * Champs attendus dans `data` : email_cible
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.2.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_TOUS_DRIVES_PARTAGES() {
  return {
    action: 'RETRAIT_TOUS_DRIVES_PARTAGES',
    description: 'Retire un utilisateur de tous ses Drives partagés directs (préserve les accès via groupes).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // révocation d'accès : priorité sécurité 24/7
    destructive: false,
    handler: actionRetirerTousDrivesPartages_
  };
}

/**
 * ACTION RETRAIT_TOUS_DRIVES_PARTAGES — Révocation globale des accès directs Shared Drives.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object} Bilan des révocations.
 */
function actionRetirerTousDrivesPartages_(data, ctx) {
  const emailCible = String(data.email_cible).toLowerCase().trim();
  const utilisateur = requireUser_(emailCible);
  const primaryEmail = (utilisateur.primaryEmail || emailCible).toLowerCase();

  // 1. Récupération des groupes directs de l'utilisateur pour détecter les accès hérités
  const groupesMembre = new Set();
  try {
    const repGroupes = AdminDirectory.Groups.list({ userKey: primaryEmail, maxResults: 200 });
    (repGroupes.groups || []).forEach(function (g) {
      if (g.email) groupesMembre.add(g.email.toLowerCase());
    });
  } catch (e) {
    console.warn('[%s] Impossible de lister les groupes de %s : %s', ctx.traceId, primaryEmail, e.message);
  }

  // 2. Énumération de TOUS les Drives partagés du domaine via l'API Drive v3 (Admin Access)
  let pageToken = null;
  const tousLesDrives = [];
  const token = ScriptApp.getOAuthToken();

  do {
    let urlDrives = 'https://www.googleapis.com/drive/v3/drives?pageSize=100&useDomainAdminAccess=true';
    if (pageToken) {
      urlDrives += '&pageToken=' + encodeURIComponent(pageToken);
    }

    const repDrives = UrlFetchApp.fetch(urlDrives, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    const codeDrives = repDrives.getResponseCode();
    if (codeDrives >= 400) {
      let errMsg = repDrives.getContentText();
      try { errMsg = JSON.parse(errMsg).error.message; } catch (e) {}
      throw new AppError_('DRIVE_API_ERROR', 'Impossible d\'énumérer les Drives partagés : ' + errMsg, codeDrives);
    }

    const dataDrives = JSON.parse(repDrives.getContentText());
    const drives = dataDrives.drives || [];
    for (let i = 0; i < drives.length; i++) {
      tousLesDrives.push(drives[i]);
    }
    pageToken = dataDrives.nextPageToken || null;
  } while (pageToken);

  // 3. Parcours de chaque Drive partagé pour analyser et supprimer les permissions directes
  const retraits = [];
  const conservesViaGroupe = [];
  const erreurs = [];

  for (let i = 0; i < tousLesDrives.length; i++) {
    const d = tousLesDrives[i];
    const driveId = d.id;
    const driveName = d.name || driveId;

    try {
      const urlPerms = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) +
        '/permissions?supportsAllDrives=true&useDomainAdminAccess=true&fields=permissions(id,emailAddress,role,type,deleted)';

      const repPerms = UrlFetchApp.fetch(urlPerms, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });

      if (repPerms.getResponseCode() >= 400) {
        console.warn('[%s] Impossible de lire les permissions du Drive %s (%s)', ctx.traceId, driveName, driveId);
        continue;
      }

      const perms = (JSON.parse(repPerms.getContentText()).permissions || []);
      let accesDirect = null;
      let accesGroupe = null;

      for (let j = 0; j < perms.length; j++) {
        const p = perms[j];
        if (p.deleted) continue;
        const pEmail = String(p.emailAddress || '').toLowerCase();

        // Permission directe individuelle (type='user')
        if (p.type === 'user' && (pEmail === primaryEmail || pEmail === emailCible)) {
          accesDirect = p;
        }

        // Permission via groupe Google (type='group')
        if (p.type === 'group' && groupesMembre.has(pEmail)) {
          accesGroupe = { groupEmail: pEmail, role: p.role };
        }
      }

      // Si l'utilisateur a un accès hérité par groupe, on le consigne (laissé intact)
      if (accesGroupe) {
        conservesViaGroupe.push({
          driveId: driveId,
          nom: driveName,
          groupe: accesGroupe.groupEmail,
          role: accesGroupe.role
        });
      }

      // Si l'utilisateur a un accès direct, on le supprime
      if (accesDirect) {
        const urlDel = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(driveId) +
          '/permissions/' + encodeURIComponent(accesDirect.id) + '?supportsAllDrives=true&useDomainAdminAccess=true';

        const repDel = UrlFetchApp.fetch(urlDel, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token },
          muteHttpExceptions: true
        });

        const codeDel = repDel.getResponseCode();
        if (codeDel === 200 || codeDel === 204) {
          retraits.push({
            driveId: driveId,
            nom: driveName,
            role: accesDirect.role
          });
        } else {
          let errDelMsg = repDel.getContentText();
          try { errDelMsg = JSON.parse(errDelMsg).error.message; } catch (e) {}
          erreurs.push(driveName + ' : ' + errDelMsg);
        }
      }

    } catch (errDrive) {
      console.warn('[%s] Erreur traitement Drive %s : %s', ctx.traceId, driveName, errDrive.message);
      erreurs.push(driveName + ' : ' + errDrive.message);
    }
  }

  // 4. Synthèse et réponse
  const nbRetraits = retraits.length;
  const nbGroupes = conservesViaGroupe.length;

  let message = '';
  if (nbRetraits === 0 && nbGroupes === 0) {
    message = primaryEmail + ' n\'a aucun accès (ni direct, ni par groupe) sur les ' + tousLesDrives.length + ' Drives partagés.';
  } else if (nbRetraits === 0 && nbGroupes > 0) {
    message = primaryEmail + ' n\'a aucun accès direct à révoquer (' + nbGroupes + ' accès conservé(s) via groupes Google).';
  } else {
    message = nbRetraits + ' accès direct(s) révoqué(s) sur les Drives partagés pour ' + primaryEmail;
    if (nbGroupes > 0) {
      message += ' (' + nbGroupes + ' accès conservé(s) par groupe)';
    }
    message += '.';
  }

  return {
    target: primaryEmail,
    message: message,
    details: {
      total_drives_analyses: tousLesDrives.length,
      retraits_effectues: nbRetraits,
      conserves_via_groupe: nbGroupes,
      drives_revoques: retraits,
      drives_via_groupes: conservesViaGroupe,
      erreurs: erreurs.length ? erreurs : undefined
    }
  };
}
