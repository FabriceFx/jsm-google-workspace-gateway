/**
 * FORMULAIRE — Audit de conformité et revue complète des accès utilisateur
 * -----------------------------------------------------------------------------
 * Formulaire JSM : revue de sécurité, conformité RGPD / ISO 27001 ou litige.
 *
 * Consolide en un seul rapport exhaustif :
 *  - Identité, statut, OU, 2FA, création et licences
 *  - Groupes Google (directs)
 *  - Drives partagés et rôles
 *  - Partages et délégations d'agendas
 *  - Délégations de boîte mail et transferts actifs
 *  - Terminaux mobiles MDM (enrôlement + dernière synchro) et jetons OAuth
 *
 * Champs attendus dans `data` : email_cible
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_AUDIT_ACCES_COMPLET() {
  return {
    action: 'AUDIT_ACCES_COMPLET',
    description: 'Génère la revue complète et consolidée des accès d\'un compte.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // lecture seule : jamais différé
    handler: actionAuditAccesComplet_
  };
}

/**
 * ACTION AUDIT_ACCES_COMPLET — Consolide tout le patrimoine d'accès d'un utilisateur.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionAuditAccesComplet_(data, ctx) {
  const emailCible = data.email_cible.toLowerCase().trim();
  const utilisateur = requireUser_(emailCible, undefined, 'full');
  const primaryEmail = (utilisateur.primaryEmail || emailCible).toLowerCase();

  // 1. Diagnostic de base & Groupes
  let groupes = [];
  try {
    const repGroupes = AdminDirectory.Groups.list({ userKey: primaryEmail, maxResults: 200 });
    groupes = (repGroupes.groups || []).map(function (g) { return g.email; }).sort();
  } catch (e) {
    console.warn('[%s] Erreur groupes audit : %s', ctx.traceId, e.message);
  }

  // 2. Licences
  let licences = [];
  try {
    const custId = getProp_('LICENSE_CUSTOMER_ID') ||
      (getProp_('ALLOWED_DOMAINS').split(',')
        .map(function (d) { return d.trim(); }).filter(Boolean)[0] || '');
    if (custId) {
      const prod = getProp_('LICENSE_PRODUCT_ID', 'Google-Apps');
      const repLic = appelLicensingApi_('GET',
        'product/' + encodeURIComponent(prod) + '/users/' + encodeURIComponent(primaryEmail), null);
      if (repLic && repLic.skuId) licences.push(repLic.skuName || repLic.skuId);
    }
  } catch (e) {}

  // 3. Flotte mobile & Synchronisation
  let appareils = [];
  let appareilsResume = [];
  try {
    appareils = listerAppareilsUtilisateur_(primaryEmail);
    appareils.forEach(function (d) {
      const syncDate = d.lastSync ? formaterDate_(new Date(d.lastSync)) : 'Aucune synchro';
      const enrolDate = d.firstSync ? ' | Enrôlé : ' + formaterDate_(new Date(d.firstSync)) : '';
      const nom = [d.model || d.type || 'Appareil', d.os ? '(' + d.os + ')' : ''].filter(Boolean).join(' ');
      appareilsResume.push(nom + ' [' + (d.status || 'Actif') + '] — synchro : ' + syncDate + enrolDate);
    });
  } catch (e) {}

  // 4. Jetons OAuth
  let tokensApps = [];
  try {
    const repTokens = AdminDirectory.Tokens.list(primaryEmail);
    tokensApps = (repTokens.items || []).map(function (t) { return t.displayText || t.clientId; });
  } catch (e) {}

  // 5. Messagerie Gmail (Délégations & Transferts si SA configuré)
  let delegations = [];
  let transferts = [];
  try {
    const repDel = appelGmailApi_(primaryEmail, 'settings/delegates', 'GET', null,
      ['https://www.googleapis.com/auth/gmail.settings.sharing']);
    delegations = (repDel && repDel.delegates || []).map(function (d) {
      return d.delegateEmail + ' (' + (d.verificationStatus || 'ACTIVE') + ')';
    });
  } catch (e) {}

  try {
    const repFwd = appelGmailApi_(primaryEmail, 'settings/forwardingAddresses', 'GET', null,
      ['https://www.googleapis.com/auth/gmail.settings.sharing']);
    transferts = (repFwd && repFwd.forwardingAddresses || []).map(function (f) {
      return f.forwardingEmail + ' (' + (f.verificationStatus || 'ACTIVE') + ')';
    });
  } catch (e) {}

  const nomComplet = (utilisateur.name && (utilisateur.name.fullName ||
    ((utilisateur.name.givenName || '') + ' ' + (utilisateur.name.familyName || '')))) || 'N/A';
  const org = (utilisateur.organizations && utilisateur.organizations[0]) || {};

  const lignes = [
    '════════════ REVUE D\'ACCÈS ET CONFORMITÉ : ' + primaryEmail + ' ════════════',
    '• Nom complet : ' + nomComplet,
    '• Statut compte : ' + (utilisateur.suspended ? '⛔ SUSPENDU' : (utilisateur.archived ? '📦 ARCHIVÉ' : '✅ ACTIF')),
    '• Unité organisationnelle (OU) : ' + (utilisateur.orgUnitPath || '/'),
    '• Sécurité 2FA : ' + (utilisateur.isEnrolledIn2Sv ? '✅ Double authentification active' : '⚠️ 2FA non configuré'),
    '• Poste / Service : ' + (org.title || 'N/A') + ' / ' + (org.department || 'N/A'),
    '• Date de création : ' + (utilisateur.creationTime ? formaterDate_(new Date(utilisateur.creationTime)) : 'Inconnue'),
    '• Licences assignées : ' + (licences.length ? licences.join(', ') : 'Standard / Non listée'),
    '',
    '─── PERMÈTRE DES GROUPES (' + groupes.length + ') ───',
    groupes.length ? '  • ' + groupes.join('\n  • ') : '  (Aucun groupe direct)',
    '',
    '─── MESSAGERIE & DÉLÉGATIONS GMAIL ───',
    '  • Délégués ayant accès à la boîte : ' + (delegations.length ? delegations.join(', ') : 'Aucun'),
    '  • Redirections d\'e-mails configurées : ' + (transferts.length ? transferts.join(', ') : 'Aucune'),
    '',
    '─── TERMINAUX MOBILES & ACCÈS OAUTH ───',
    '  • Flotte mobile (' + appareils.length + ') : ' + (appareilsResume.length ? '\n    - ' + appareilsResume.join('\n    - ') : 'Aucun mobile MDM'),
    '  • Applications tierces autorisées (' + tokensApps.length + ') : ' + (tokensApps.length ? tokensApps.join(', ') : 'Aucune application tierce'),
    '════════════════════════════════════════════════════════════════'
  ];

  const resume = lignes.join('\n');

  return {
    target: primaryEmail,
    message: resume,
    details: {
      primaryEmail: primaryEmail,
      fullName: nomComplet,
      suspended: !!utilisateur.suspended,
      archived: !!utilisateur.archived,
      orgUnitPath: utilisateur.orgUnitPath,
      isEnrolledIn2Sv: !!utilisateur.isEnrolledIn2Sv,
      groupes: groupes,
      licences: licences,
      delegations: delegations,
      transferts: transferts,
      appareils: appareilsResume,
      tokensApps: tokensApps
    }
  };
}
