/**
 * FORMULAIRE — Retrait d'un utilisateur de tous les Drives partagés (Shared Drives)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : offboarding, mobilité interne ou revue de conformité sécurité.
 *
 * Supprime TOUTES les permissions directes (type='user') d'un compte sur l'ensemble
 * des Drives partagés du domaine, tout en PRÉSERVANT strictement les accès
 * conférés par l'intermédiaire d'un groupe Google (type='group').
 *
 * Prend en compte l'ensemble des adresses de l'utilisateur (e-mail principal et
 * tous ses alias), et interroge la totalité du parc de Drives partagés.
 *
 * Champs attendus dans `data` : email_cible
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.3.0)
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
  const primaryEmail = (utilisateur.primaryEmail || emailCible).toLowerCase().trim();

  // 1. Récupération de TOUTES les adresses e-mails associées à l'utilisateur (principal + alias)
  const tousEmailsUtilisateur = new Set();
  tousEmailsUtilisateur.add(primaryEmail);
  tousEmailsUtilisateur.add(emailCible);

  if (Array.isArray(utilisateur.aliases)) {
    utilisateur.aliases.forEach(function (a) {
      if (a) tousEmailsUtilisateur.add(String(a).toLowerCase().trim());
    });
  }
  if (Array.isArray(utilisateur.nonEditableAliases)) {
    utilisateur.nonEditableAliases.forEach(function (a) {
      if (a) tousEmailsUtilisateur.add(String(a).toLowerCase().trim());
    });
  }

  // 2. Récupération des groupes de l'utilisateur pour identifier les accès hérités
  const groupesMembre = new Set();
  try {
    const repGroupes = AdminDirectory.Groups.list({ userKey: primaryEmail, maxResults: 200 });
    (repGroupes.groups || []).forEach(function (g) {
      if (g.email) groupesMembre.add(String(g.email).toLowerCase().trim());
    });
  } catch (e) {
    console.warn('[%s] Impossible de lister les groupes de %s : %s', ctx.traceId, primaryEmail, e.message);
  }

  // 3. Énumération exhaustive de TOUS les Drives partagés
  const tousLesDrives = listerTousDrivesPartages_(ctx.traceId);

  // 4. Parcours de chaque Drive partagé pour analyser et supprimer les permissions directes
  const retraits = [];
  const conservesViaGroupe = [];
  const erreurs = [];

  for (let i = 0; i < tousLesDrives.length; i++) {
    const d = tousLesDrives[i];
    const driveId = d.id;
    const driveName = d.name || driveId;

    try {
      const perms = listerPermissionsFichierOuDrive_(driveId, ctx.traceId);
      const accesDirects = [];
      let accesGroupe = null;

      for (let j = 0; j < perms.length; j++) {
        const p = perms[j];
        if (p.deleted) continue;
        const pEmail = String(p.emailAddress || '').toLowerCase().trim();

        // Permission directe individuelle (type='user') sur l'adresse principale ou l'un des alias
        if (p.type === 'user' && pEmail && tousEmailsUtilisateur.has(pEmail)) {
          accesDirects.push(p);
        }

        // Permission via groupe Google (type='group')
        if (p.type === 'group' && pEmail && groupesMembre.has(pEmail)) {
          accesGroupe = { groupEmail: pEmail, role: p.role };
        }
      }

      // Si l'utilisateur a un accès hérité par groupe, on le consigne
      if (accesGroupe) {
        conservesViaGroupe.push({
          driveId: driveId,
          nom: driveName,
          groupe: accesGroupe.groupEmail,
          role: accesGroupe.role
        });
      }

      // Si l'utilisateur a des accès directs, suppression de chacun
      for (let k = 0; k < accesDirects.length; k++) {
        const permDirecte = accesDirects[k];
        const ok = supprimerPermissionFichierOuDrive_(driveId, permDirecte.id, ctx.traceId);
        if (ok) {
          retraits.push({
            driveId: driveId,
            nom: driveName,
            role: permDirecte.role,
            email: permDirecte.emailAddress || primaryEmail
          });
        } else {
          erreurs.push(driveName + ' (permission ' + permDirecte.id + ') : Échec de la révocation');
        }
      }

    } catch (errDrive) {
      console.warn('[%s] Erreur traitement Drive %s (%s) : %s', ctx.traceId, driveName, driveId, errDrive.message);
      erreurs.push(driveName + ' : ' + errDrive.message);
    }
  }

  // 5. Synthèse et message de retour
  const nbRetraits = retraits.length;
  const nbGroupes = conservesViaGroupe.length;

  let message = '';
  if (nbRetraits === 0 && nbGroupes === 0) {
    message = primaryEmail + ' n\'a aucun accès (ni direct, ni par groupe) sur les ' + tousLesDrives.length + ' Drives partagés.';
  } else if (nbRetraits === 0 && nbGroupes > 0) {
    message = primaryEmail + ' n\'a aucun accès direct à révoquer (' + nbGroupes + ' accès conservé(s) via groupes Google sur ' + tousLesDrives.length + ' Drives analysés).';
  } else {
    message = nbRetraits + ' accès direct(s) révoqué(s) sur les Drives partagés pour ' + primaryEmail;
    if (nbGroupes > 0) {
      message += ' (' + nbGroupes + ' accès conservé(s) par groupe)';
    }
    message += ' sur ' + tousLesDrives.length + ' Drives analysés.';
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
