/**
 * FORMULAIRE — Attribution d'une licence Workspace
 * -----------------------------------------------------------------------------
 * Formulaire JSM : arrivée d'un collaborateur, changement d'édition.
 *
 * ⚠️ Nécessite le scope apps.licensing dans le manifeste, et un SKU de licence
 * défini (propriété LICENSE_SKU_ID ou champ sku_id du ticket). Le SKU dépend de
 * l'abonnement du domaine ; le lister avec admin_listerLicences().
 *
 * Champs attendus dans `data` : email_cible, [product_id], [sku_id]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_ATTRIBUTION_LICENCE() {
  return {
    action: 'ATTRIBUTION_LICENCE',
    description: 'Attribue une licence Workspace à un utilisateur.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'STANDARD',
    handler: actionAttribuerLicence
  };
}

/**
 * ACTION ATTRIBUTION_LICENCE — Assigne une licence à un compte.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionAttribuerLicence(data, ctx) {
  requireUser_(data.email_cible);
  var lic = resoudreLicence_(data);

  try {
    appelLicensingApi_('POST',
      'product/' + encodeURIComponent(lic.productId) +
      '/sku/' + encodeURIComponent(lic.skuId) + '/user',
      { userId: data.email_cible });
  } catch (err) {
    // 409 = licence déjà attribuée : rejeu Jira → succès idempotent.
    if (err instanceof AppError_ && err.httpHint === 409) {
      return {
        idempotent: true,
        target: data.email_cible,
        message: data.email_cible + ' possède déjà la licence ' + lic.skuId +
          '. Aucune action réalisée.',
        details: { sku: lic.skuId }
      };
    }
    throw err;
  }

  return {
    target: data.email_cible,
    message: 'Licence ' + lic.skuId + ' attribuée à ' + data.email_cible + '.',
    details: { produit: lic.productId, sku: lic.skuId }
  };
}
