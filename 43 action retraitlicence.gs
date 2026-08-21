/**
 * FORMULAIRE — Retrait d'une licence Workspace
 * -----------------------------------------------------------------------------
 * Formulaire JSM : départ d'un collaborateur, libération de licence (une
 * licence non retirée continue d'être facturée).
 *
 * ⚠️ Nécessite le scope apps.licensing dans le manifeste, et un SKU de licence
 * défini (propriété LICENSE_SKU_ID ou champ sku_id du ticket).
 *
 * Champs attendus dans `data` : email_cible, [product_id], [sku_id]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETRAIT_LICENCE() {
  return {
    action: 'RETRAIT_LICENCE',
    description: 'Libère la licence Workspace d\'un utilisateur.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionRetirerLicence_
  };
}

/**
 * ACTION RETRAIT_LICENCE — Libère la licence d'un compte.
 *
 * Ne vérifie PAS l'existence du compte au préalable : on veut pouvoir libérer
 * la licence même d'un compte suspendu ou en cours de suppression.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetirerLicence_(data, ctx) {
  var lic = resoudreLicence_(data);

  try {
    appelLicensingApi_('DELETE',
      'product/' + encodeURIComponent(lic.productId) +
      '/sku/' + encodeURIComponent(lic.skuId) +
      '/user/' + encodeURIComponent(data.email_cible),
      null);
  } catch (err) {
    // 404 = aucune licence de ce SKU pour l'utilisateur : rien à libérer.
    if (err instanceof AppError_ && err.httpHint === 404) {
      return {
        idempotent: true,
        target: data.email_cible,
        message: data.email_cible + ' ne possédait pas la licence ' + lic.skuId +
          '. Aucune action réalisée.',
        details: { sku: lic.skuId }
      };
    }
    throw err;
  }

  return {
    target: data.email_cible,
    message: 'Licence ' + lic.skuId + ' libérée pour ' + data.email_cible + '.',
    details: { produit: lic.productId, sku: lic.skuId }
  };
}
