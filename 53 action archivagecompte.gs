/**
 * FORMULAIRE — Archivage de compte utilisateur (optimisation de licence)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : mise en archivage d'un compte après un départ pour conserver
 * ses données (Vault / eDiscovery) sans conserver une licence Workspace active.
 *
 * Applique le statut archivé (`archived: true`), suspend le compte, déplace dans
 * l'OU d'archive, attribue la licence Archived User et libère la licence standard.
 *
 * Champs attendus dans `data` :
 *   email_cible, [unite_organisationnelle] (défaut : /Archives),
 *   [sku_archive] (SKU de la licence Archived User), [sku_source]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.3.1)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_ARCHIVAGE_COMPTE() {
  return {
    action: 'ARCHIVAGE_COMPTE',
    description: 'Archive un compte (statut archivé, déplacement OU archive et licence Archived User).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    destructive: true,
    handler: actionArchiverCompte_
  };
}

/**
 * ACTION ARCHIVAGE_COMPTE — Déplace, archive et réassigne la licence vers l'archivage.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionArchiverCompte_(data, ctx) {
  const utilisateur = requireUser_(data.email_cible);

  if (utilisateur.isAdmin || utilisateur.isDelegatedAdmin) {
    throw new AppError_('COMPTE_PROTEGE',
      'Le compte ' + data.email_cible + ' dispose de droits d\'administration : ' +
      'l\'archivage automatique par ticket est refusé. Rétrograder le compte avant archivage.', 403);
  }

  const ouArchive = data.unite_organisationnelle || getProp_('ARCHIVE_OU', '/Archives');
  const skuSource = data.sku_source || getProp_('LICENSE_SKU_ID');
  const skuArchive = data.sku_archive || getProp_('LICENSE_ARCHIVE_SKU_ID');

  const operations = [];

  // 1. Attribution prioritaire de la licence utilisateur archivé si configurée
  if (skuArchive) {
    actionAttribuerLicence_({
      email_cible: data.email_cible,
      sku_id: skuArchive
    }, ctx);
    operations.push('licence archivage assignée (' + skuArchive + ')');
  }

  // 2. Retrait de la licence standard une fois la licence archive sécurisée
  if (skuSource) {
    try {
      actionRetirerLicence_({
        email_cible: data.email_cible,
        sku_id: skuSource
      }, ctx);
      operations.push('licence standard libérée (' + skuSource + ')');
    } catch (errLic) {
      console.warn('[%s] Avertissement retrait licence standard : %s', ctx.traceId, errLic.message);
    }
  }

  // 3. Application du statut archivé + suspendu + déplacement OU dans l'Admin SDK
  const patchUser = {
    archived: true,
    suspended: true
  };
  if (ouArchive) patchUser.orgUnitPath = ouArchive;

  try {
    AdminDirectory.Users.patch(patchUser, data.email_cible);
    operations.push('statut archivé activé');
    if (ouArchive) operations.push('déplacé vers ' + ouArchive);
  } catch (errPatch) {
    const errTraduite = traduireErreurAdmin_(errPatch);
    if (errTraduite) throw errTraduite;
    throw new AppError_('ARCHIVE_FAILED', 'Échec de l\'archivage de l\'utilisateur dans l\'annuaire : ' + (errPatch.message || errPatch), 502);
  }

  return {
    target: data.email_cible,
    message: 'Compte ' + data.email_cible + ' archivé avec succès (' + operations.join(', ') + ').',
    details: {
      email_cible: data.email_cible,
      ou_archive: ouArchive,
      archived: true,
      suspended: true,
      operations: operations
    }
  };
}
