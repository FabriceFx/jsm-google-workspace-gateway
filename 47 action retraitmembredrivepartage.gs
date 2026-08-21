/**
 * FORMULAIRE — Retrait d'un membre d'un Drive partagé (Shared Drive)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : révocation d'accès à un espace de stockage d'équipe.
 *
 * Champs attendus dans `data` : email_cible, drive_id
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_MEMBRE_DRIVE_PARTAGE() {
  return {
    action: 'RETRAIT_MEMBRE_DRIVE_PARTAGE',
    description: 'Retire un utilisateur ou un groupe d\'un Drive partagé (Shared Drive).',
    required: ['email_cible', 'drive_id'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // retrait d'accès : jamais différé
    handler: actionRetirerMembreDrivePartage_
  };
}

/**
 * ACTION RETRAIT_MEMBRE_DRIVE_PARTAGE — Supprime une permission sur un Shared Drive.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerMembreDrivePartage_(data, ctx) {
  const driveId = String(data.drive_id).trim();
  const emailCible = String(data.email_cible).toLowerCase().trim();

  // Récupération des alias éventuels de l'utilisateur
  const tousEmails = new Set();
  tousEmails.add(emailCible);
  try {
    const user = findUser_(emailCible);
    if (user) {
      if (user.primaryEmail) tousEmails.add(String(user.primaryEmail).toLowerCase().trim());
      if (Array.isArray(user.aliases)) {
        user.aliases.forEach(function (a) { if (a) tousEmails.add(String(a).toLowerCase().trim()); });
      }
      if (Array.isArray(user.nonEditableAliases)) {
        user.nonEditableAliases.forEach(function (a) { if (a) tousEmails.add(String(a).toLowerCase().trim()); });
      }
    }
  } catch (e) {}

  // 1. Lister les permissions du Drive pour trouver la permission cible
  const perms = listerPermissionsFichierOuDrive_(driveId, ctx.traceId);
  const permsCibles = perms.filter(function (p) {
    if (p.deleted) return false;
    const pEmail = String(p.emailAddress || '').toLowerCase().trim();
    return tousEmails.has(pEmail);
  });

  if (permsCibles.length === 0) {
    return {
      idempotent: true,
      target: emailCible,
      message: emailCible + ' ne dispose d\'aucun accès direct sur le Drive partagé (' + driveId + ').'
    };
  }

  // 2. Supprimer la ou les permissions directes
  const supprIds = [];
  for (let i = 0; i < permsCibles.length; i++) {
    const perm = permsCibles[i];
    const ok = supprimerPermissionFichierOuDrive_(driveId, perm.id, ctx.traceId);
    if (ok) supprIds.push(perm.id);
  }

  if (supprIds.length > 0) {
    return {
      target: emailCible,
      message: 'Accès de ' + emailCible + ' révoqué du Drive partagé (' + driveId + ').',
      details: { driveId: driveId, permissionsSupprimees: supprIds }
    };
  }

  throw new AppError_('DRIVE_API_ERROR', 'Échec du retrait de la permission sur le Drive partagé (' + driveId + ').', 500);
}
