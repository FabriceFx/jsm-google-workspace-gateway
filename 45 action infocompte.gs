/**
 * FORMULAIRE — Fiche diagnostic et audit de compte utilisateur
 * -----------------------------------------------------------------------------
 * Formulaire JSM : diagnostic express pour les agents Helpdesk et Support.
 *
 * Retourne l'état complet du compte (statut, 2FA, OU, groupes directs,
 * délégations, transferts, licences, dernier login) sans modifier aucune donnée.
 *
 * Champs attendus dans `data` : email_cible
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_INFO_COMPTE() {
  return {
    action: 'INFO_COMPTE',
    description: 'Retourne la fiche d\'identité et de diagnostic complète d\'un compte.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // lecture seule : jamais différé
    handler: actionInfoCompte_
  };
}

/**
 * ACTION INFO_COMPTE — Lit et synthétise les informations d'un compte.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object} Fiche d'identité formatée et détails structurés.
 */
function actionInfoCompte_(data, ctx) {
  const utilisateur = requireUser_(data.email_cible, undefined, 'full');

  // Groupes directs dont l'utilisateur est membre (avec pagination)
  let groupes = [];
  try {
    let pageToken = null;
    do {
      const options = { userKey: data.email_cible, maxResults: 100 };
      if (pageToken) options.pageToken = pageToken;
      const repGroupes = AdminDirectory.Groups.list(options);
      if (repGroupes.groups) {
        repGroupes.groups.forEach(function (g) {
          if (g.email) groupes.push(g.email);
        });
      }
      pageToken = repGroupes.nextPageToken;
    } while (pageToken);
    groupes.sort();
  } catch (err) {
    console.warn('[%s] Impossible de lister les groupes pour %s : %s',
      ctx.traceId, data.email_cible, err.message);
  }

  // Licences associées (recherche par SKU direct)
  let licences = [];
  try {
    const prod = getProp_('LICENSE_PRODUCT_ID', 'Google-Apps');
    const skuPrincipal = getProp_('LICENSE_SKU_ID');
    const skuArchive = getProp_('LICENSE_ARCHIVE_SKU_ID');
    const skusATester = [skuPrincipal, skuArchive, 'Google-Apps-For-Business', '1010020020', '1010060001'].filter(Boolean);
    const skusVus = new Set();

    skusATester.forEach(function (sku) {
      if (skusVus.has(sku)) return;
      skusVus.add(sku);
      try {
        const repLic = appelLicensingApi_('GET',
          'product/' + encodeURIComponent(prod) + '/sku/' + encodeURIComponent(sku) + '/user/' + encodeURIComponent(data.email_cible), null);
        if (repLic && repLic.skuId) {
          licences.push(repLic.skuName || repLic.skuId);
        }
      } catch (eLic) {}
    });
  } catch (err) {
    // Non bloquant si licensing API non configurée
  }

  const emailPrincipal = (utilisateur.primaryEmail || data.email_cible).toLowerCase().trim();

  // Appareils mobiles & synchronisation smartphone (MDM / Google Sync)
  let appareils = [];
  let derniereSyncMobileDate = null;
  let appareilsResume = [];
  let erreurAppareils = null;
  try {
    appareils = listerAppareilsUtilisateur_(emailPrincipal);
    if (appareils.length === 0 && data.email_cible.toLowerCase().trim() !== emailPrincipal) {
      appareils = listerAppareilsUtilisateur_(data.email_cible.toLowerCase().trim());
    }
    appareils.forEach(function (d) {
      let syncDate = null;
      let enrollementDate = null;
      if (d.lastSync) {
        const parsed = new Date(d.lastSync);
        if (!isNaN(parsed.getTime())) syncDate = parsed;
      }
      if (d.firstSync) {
        const parsedFirst = new Date(d.firstSync);
        if (!isNaN(parsedFirst.getTime())) enrollementDate = parsedFirst;
      }
      if (syncDate && (!derniereSyncMobileDate || syncDate > derniereSyncMobileDate)) {
        derniereSyncMobileDate = syncDate;
      }
      const nomAppareil = [d.model || d.type || 'Appareil', d.os ? '(' + d.os + ')' : ''].filter(Boolean).join(' ');
      const statutApp = d.status === 'APPROVED' ? '✅ Approuvé' : (d.status === 'BLOCKED' ? '⛔ Bloqué' : (d.status || 'Actif'));
      const syncStr = syncDate ? formaterDate_(syncDate) : 'Aucune synchro';
      const enrolStr = enrollementDate ? ' | enrôlé le : ' + formaterDate_(enrollementDate) : '';
      const sourceStr = d.source ? ' [' + d.source + ']' : '';
      appareilsResume.push(nomAppareil + ' [' + statutApp + sourceStr + '] — synchro : ' + syncStr + enrolStr);
    });
  } catch (err) {
    erreurAppareils = err.message;
    console.warn('[%s] Erreur lecture appareils mobiles pour %s : %s', ctx.traceId, emailPrincipal, err.message);
  }

  // Applications tierces et jetons OAuth (dont applications mobiles sans MDM)
  let tokensList = [];
  let tokensMobiles = [];
  try {
    const repTokens = AdminDirectory.Tokens.list(emailPrincipal);
    tokensList = (repTokens.items || []).map(function (t) {
      return t.displayText || t.clientId;
    });
    tokensMobiles = (repTokens.items || []).filter(function (t) {
      const nom = (t.displayText || '').toLowerCase();
      return nom.includes('android') || nom.includes('ios') || nom.includes('iphone') ||
        nom.includes('ipad') || nom.includes('phone') || nom.includes('gmail') ||
        nom.includes('mobile') || nom.includes('outlook');
    }).map(function (t) {
      return t.displayText || t.clientId;
    });
  } catch (err) {
    // Non bloquant si non autorisé
  }

  // Formatage des dates
  const formatIso = function (iso) {
    if (!iso) return 'Jamais connecté';
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? String(iso) : formaterDate_(d);
    } catch (e) {
      return String(iso);
    }
  };

  const nomComplet = (utilisateur.name && (utilisateur.name.fullName ||
    ((utilisateur.name.givenName || '') + ' ' + (utilisateur.name.familyName || '')))) || 'N/A';

  const org = (utilisateur.organizations && utilisateur.organizations[0]) || {};
  const manager = (utilisateur.relations || []).filter(function (r) { return r.type === 'manager'; })[0];

  // Calcul de la dernière activité réelle (Web vs Smartphone)
  let webLoginDate = null;
  if (utilisateur.lastLoginTime) {
    const parsedWeb = new Date(utilisateur.lastLoginTime);
    if (!isNaN(parsedWeb.getTime())) webLoginDate = parsedWeb;
  }

  let activiteGlobaleStr = 'Jamais connecté';
  if (derniereSyncMobileDate && webLoginDate) {
    activiteGlobaleStr = derniereSyncMobileDate > webLoginDate
      ? formaterDate_(derniereSyncMobileDate) + ' (via Smartphone)'
      : formaterDate_(webLoginDate) + ' (via Web)';
  } else if (derniereSyncMobileDate) {
    activiteGlobaleStr = formaterDate_(derniereSyncMobileDate) + ' (via Smartphone)';
  } else if (webLoginDate) {
    activiteGlobaleStr = formaterDate_(webLoginDate) + ' (via Web)';
  }

  const flotteStr = appareilsResume.length
    ? '\n   ' + appareilsResume.join('\n   ')
    : (tokensMobiles.length
      ? 'Non enrôlé MDM (Accès direct OAuth détecté : ' + tokensMobiles.join(', ') + ')'
      : (erreurAppareils ? 'Erreur de consultation API : ' + erreurAppareils : 'Aucun smartphone ou appareil détecté'));

  const lignes = [
    '════ FICHE DIAGNOSTIC COMPTE : ' + emailPrincipal + ' ════',
    '• Nom : ' + nomComplet,
    '• Statut compte : ' + (utilisateur.suspended ? '⛔ SUSPENDU' : (utilisateur.archived ? '📦 ARCHIVÉ' : '✅ ACTIF')),
    '• Unité organisationnelle (OU) : ' + (utilisateur.orgUnitPath || '/'),
    '• Double authentification (2FA) : ' + (utilisateur.isEnrolledIn2Sv ? '✅ Enrôlé' : '⚠️ Non enrôlé'),
    '• Changement mot de passe au prochain login : ' + (utilisateur.changePasswordAtNextLogin ? 'Oui' : 'Non'),
    '• Dernière activité globale : ' + activiteGlobaleStr,
    '  ├─ Connexion Web / Navigateur : ' + formatIso(utilisateur.lastLoginTime),
    '  └─ Synchronisation Mobile (Smartphones) : ' + (derniereSyncMobileDate ? formaterDate_(derniereSyncMobileDate) : (tokensMobiles.length ? 'Actif via OAuth (' + tokensMobiles.join(', ') + ')' : 'Aucune synchro récente')),
    '• Création du compte : ' + formatIso(utilisateur.creationTime),
    '• Poste / Service : ' + (org.title || 'Non renseigné') + ' / ' + (org.department || 'Non renseigné'),
    '• Manager : ' + (manager ? manager.value : 'Non renseigné'),
    '• Licences : ' + (licences.length ? licences.join(', ') : 'Standard / Non listée'),
    '• Groupes directs (' + groupes.length + ') : ' + (groupes.length ? groupes.join(', ') : 'Aucun'),
    '• Flotte mobile (' + appareils.length + ') : ' + flotteStr,
    '• Applications OAuth autorisées (' + tokensList.length + ') : ' + (tokensList.length ? tokensList.join(', ') : 'Aucune')
  ];

  const resume = lignes.join('\n');

  return {
    target: emailPrincipal,
    message: resume,
    details: {
      primaryEmail: utilisateur.primaryEmail,
      id: utilisateur.id,
      suspended: !!utilisateur.suspended,
      archived: !!utilisateur.archived,
      orgUnitPath: utilisateur.orgUnitPath,
      isEnrolledIn2Sv: !!utilisateur.isEnrolledIn2Sv,
      lastLoginTimeWeb: utilisateur.lastLoginTime,
      lastSyncMobile: derniereSyncMobileDate ? derniereSyncMobileDate.toISOString() : null,
      derniereActiviteGlobale: activiteGlobaleStr,
      creationTime: utilisateur.creationTime,
      title: org.title || null,
      department: org.department || null,
      manager: manager ? manager.value : null,
      groupes: groupes,
      licences: licences,
      appareils: appareils.map(function (d) {
        return {
          model: d.model || d.type,
          os: d.os,
          status: d.status,
          lastSync: d.lastSync
        };
      }),
      tokensMobiles: tokensMobiles,
      tokensList: tokensList
    }
  };
}
