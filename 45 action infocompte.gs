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
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.0.0)
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

  // Groupes directs dont l'utilisateur est membre
  let groupes = [];
  try {
    const repGroupes = AdminDirectory.Groups.list({
      userKey: data.email_cible,
      maxResults: 100
    });
    groupes = (repGroupes.groups || []).map(function (g) {
      return g.email;
    }).sort();
  } catch (err) {
    console.warn('[%s] Impossible de lister les groupes pour %s : %s',
      ctx.traceId, data.email_cible, err.message);
  }

  // Licences associées
  let licences = [];
  try {
    const custId = getProp_('LICENSE_CUSTOMER_ID') ||
      (getProp_('ALLOWED_DOMAINS').split(',')
        .map(function (d) { return d.trim(); }).filter(Boolean)[0] || '');
    if (custId) {
      const prod = getProp_('LICENSE_PRODUCT_ID', 'Google-Apps');
      const repLic = appelLicensingApi_('GET',
        'product/' + encodeURIComponent(prod) + '/users/' + encodeURIComponent(data.email_cible), null);
      if (repLic && repLic.skuId) licences.push(repLic.skuName || repLic.skuId);
    }
  } catch (err) {
    // Non bloquant si licensing API non configurée ou compte sans licence
  }

  // Appareils mobiles & synchronisation smartphone
  let appareils = [];
  let derniereSyncMobileDate = null;
  let appareilsResume = [];
  try {
    appareils = listerAppareilsUtilisateur_(data.email_cible);
    appareils.forEach(function (d) {
      const syncDate = d.lastSync ? new Date(d.lastSync) : null;
      if (syncDate && (!derniereSyncMobileDate || syncDate > derniereSyncMobileDate)) {
        derniereSyncMobileDate = syncDate;
      }
      const nomAppareil = [d.model || d.type || 'Appareil', d.os ? '(' + d.os + ')' : ''].filter(Boolean).join(' ');
      const statutApp = d.status === 'APPROVED' ? '✅ Approuvé' : (d.status === 'BLOCKED' ? '⛔ Bloqué' : (d.status || 'Actif'));
      const syncStr = syncDate ? formaterDate_(syncDate) : 'Aucune synchro';
      appareilsResume.push(nomAppareil + ' [' + statutApp + '] — synchro : ' + syncStr);
    });
  } catch (err) {
    // Non bloquant si aucun appareil ou erreur API
  }

  // Formatage des dates
  const formatIso = function (iso) {
    if (!iso) return 'Jamais connecté';
    try {
      return formaterDate_(new Date(iso));
    } catch (e) {
      return iso;
    }
  };

  const nomComplet = (utilisateur.name && (utilisateur.name.fullName ||
    ((utilisateur.name.givenName || '') + ' ' + (utilisateur.name.familyName || '')))) || 'N/A';

  const org = (utilisateur.organizations && utilisateur.organizations[0]) || {};
  const manager = (utilisateur.relations || []).filter(function (r) { return r.type === 'manager'; })[0];

  // Calcul de la dernière activité réelle (Web vs Smartphone)
  const webLoginDate = utilisateur.lastLoginTime ? new Date(utilisateur.lastLoginTime) : null;
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

  const lignes = [
    '════ FICHE DIAGNOSTIC COMPTE : ' + data.email_cible + ' ════',
    '• Nom : ' + nomComplet,
    '• Statut compte : ' + (utilisateur.suspended ? '⛔ SUSPENDU' : (utilisateur.archived ? '📦 ARCHIVÉ' : '✅ ACTIF')),
    '• Unité organisationnelle (OU) : ' + (utilisateur.orgUnitPath || '/'),
    '• Double authentification (2FA) : ' + (utilisateur.isEnrolledIn2Sv ? '✅ Enrôlé' : '⚠️ Non enrôlé'),
    '• Changement mot de passe au prochain login : ' + (utilisateur.changePasswordAtNextLogin ? 'Oui' : 'Non'),
    '• Dernière activité globale : ' + activiteGlobaleStr,
    '  ├─ Connexion Web / Navigateur : ' + formatIso(utilisateur.lastLoginTime),
    '  └─ Synchronisation Mobile (Smartphones) : ' + (derniereSyncMobileDate ? formaterDate_(derniereSyncMobileDate) : 'Aucun mobile actif'),
    '• Création du compte : ' + formatIso(utilisateur.creationTime),
    '• Poste / Service : ' + (org.title || 'Non renseigné') + ' / ' + (org.department || 'Non renseigné'),
    '• Manager : ' + (manager ? manager.value : 'Non renseigné'),
    '• Licences : ' + (licences.length ? licences.join(', ') : 'Standard / Non listée'),
    '• Groupes directes (' + groupes.length + ') : ' + (groupes.length ? groupes.join(', ') : 'Aucun'),
    '• Flotte mobile (' + appareils.length + ') : ' + (appareilsResume.length ? '\n   ' + appareilsResume.join('\n   ') : 'Aucun smartphone enregistré')
  ];

  const resume = lignes.join('\n');

  return {
    target: data.email_cible,
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
      })
    }
  };
}
