/**
 * FORMULAIRE — Archivage de compte utilisateur (optimisation de licence)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : mise en archivage d'un compte après un départ pour conserver
 * ses données (Vault / eDiscovery) sans conserver une licence Workspace active.
 *
 * Champs attendus dans `data` :
 *   email_cible, [unite_organisationnelle] (défaut : /Archives),
 *   [sku_archive] (SKU de la licence Archived User), [sku_source]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_ARCHIVAGE_COMPTE() {
  return {
    action: 'ARCHIVAGE_COMPTE',
    description: 'Archive un compte pour économie de coûts (déplacement OU archive et licence Archived User).',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionArchiverCompte_
  };
}

/**
 * ACTION ARCHIVAGE_COMPTE — Déplace et réassigne la licence vers l'archivage.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionArchiverCompte_(data, ctx) {
  requireUser_(data.email_cible);

  const ouArchive = data.unite_organisationnelle || getProp_('ARCHIVE_OU', '/Archives');
  const skuSource = data.sku_source || getProp_('LICENSE_SKU_ID');
  const skuArchive = data.sku_archive || getProp_('LICENSE_ARCHIVE_SKU_ID');

  const operations = [];

  // 1. Déplacement vers l'OU d'archive si configurée
  try {
    AdminDirectory.Users.patch({ orgUnitPath: ouArchive }, data.email_cible);
    operations.push('déplacé vers ' + ouArchive);
  } catch (err) {
    console.warn('[%s] Échec du déplacement OU vers %s : %s', ctx.traceId, ouArchive, err.message);
  }

  // 2. Retrait de la licence standard si présente
  if (skuSource) {
    try {
      actionRetirerLicence_({
        email_cible: data.email_cible,
        sku_id: skuSource
      }, ctx);
      operations.push('licence standard libérée (' + skuSource + ')');
    } catch (err) {
      console.warn('[%s] Erreur retrait licence standard : %s', ctx.traceId, err.message);
    }
  }

  // 3. Attribution de la licence utilisateur archivé si configurée
  if (skuArchive) {
    try {
      actionAttribuerLicence_({
        email_cible: data.email_cible,
        sku_id: skuArchive
      }, ctx);
      operations.push('licence archivage assignée (' + skuArchive + ')');
    } catch (err) {
      console.warn('[%s] Erreur attribution licence archive : %s', ctx.traceId, err.message);
    }
  }

  return {
    target: data.email_cible,
    message: 'Compte ' + data.email_cible + ' archivé avec succès (' +
      (operations.length ? operations.join(', ') : 'archivage standard') + ').',
    details: {
      email_cible: data.email_cible,
      ou_archive: ouArchive,
      operations: operations
    }
  };
}
