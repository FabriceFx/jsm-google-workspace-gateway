/**
 * ORCHESTRATION DES GROUPES D'ACTION
 * -----------------------------------------------------------------------------
 * Un « groupe d'action » enchaîne plusieurs actions atomiques (déjà déclarées
 * au registre) dans le bon ordre, en un seul ticket. La valeur d'un groupe est
 * autant l'économie de tickets que l'ENCODAGE DE L'ORDRE correct : par exemple,
 * poser transfert/délégation pendant que le compte est actif, et suspendre en
 * dernier.
 *
 * Chaque groupe est une action comme une autre (une SPEC de plus dans
 * 01_Registre.gs). Son handler construit une liste d'étapes et la confie à
 * executerEtapes_ ci-dessous, qui applique une politique « continue-on-error »
 * et retourne un rapport détaillé, étape par étape.
 *
 * Idempotence : les actions atomiques étant déjà idempotentes, rejouer un
 * groupe entier est sûr — les étapes déjà faites se signalent DEJA_FAIT et les
 * étapes en échec sont réessayées.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Exécute une séquence d'étapes et agrège un rapport.
 *
 * Politique « continue-on-error » : l'échec d'une étape n'interrompt pas les
 * suivantes (on veut faire le maximum, notamment couper les accès). Une étape
 * marquée `obligatoire` fait toutefois basculer les suivantes en IGNORE, pour
 * les prérequis durs (inutile d'agir sur un compte dont la résolution a échoué).
 *
 * @param {!Array<{nom: string, fn: function(!Object,!Object):!Object,
 *     si: (function(!Object):boolean)=, obligatoire: boolean=}>} etapes
 *     Étapes à exécuter. `fn` reçoit (data, ctx) et retourne un résultat
 *     d'action ({message, target, idempotent?}). `si` (optionnel) conditionne
 *     l'exécution de l'étape.
 * @param {!Object} data Données validées du groupe.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Array<{action: string, statut: string, message: string}>} Rapport.
 */
function executerEtapes_(etapes, data, ctx) {
  var resultats = [];
  var blocage = null;   // nom de l'étape obligatoire ayant échoué, le cas échéant

  etapes.forEach(function (etape) {
    if (blocage) {
      resultats.push({ action: etape.nom, statut: 'IGNORE',
        message: 'Ignorée : l\'étape obligatoire « ' + blocage + ' » a échoué.' });
      return;
    }
    if (etape.si && !etape.si(data)) {
      resultats.push({ action: etape.nom, statut: 'IGNORE',
        message: 'Non applicable (paramètres non fournis).' });
      return;
    }

    try {
      var r = etape.fn(data, ctx) || {};
      resultats.push({
        action: etape.nom,
        statut: r.idempotent ? 'DEJA_FAIT' : 'OK',
        message: r.message || '',
        cible: r.target || ''
      });
    } catch (err) {
      // Les sous-handlers sont appelés directement (hors appelerHandler_) : on
      // traduit ici les erreurs brutes de l'Admin SDK en message exploitable.
      var traduite = (err instanceof AppError_) ? err : (traduireErreurAdmin_(err) || err);
      resultats.push({ action: etape.nom, statut: 'ECHEC',
        message: traduite.message || String(err) });
      console.error('[%s] GROUPE %s — étape %s KO : %s',
        ctx.traceId, ctx.action, etape.nom, (traduite.message || err));
      if (etape.obligatoire) blocage = etape.nom;
    }
  });

  return resultats;
}

/**
 * Construit le résultat final d'un groupe à partir du rapport d'étapes.
 *
 * Si au moins une étape a échoué, on LÈVE une AppError_ récapitulative (même
 * esprit que les révocations partielles) : Jira voit alors que l'opération
 * n'est pas complète et peut relancer, ce qui réessaiera les étapes en échec.
 *
 * @param {string} intitule Libellé du groupe (ex. 'Départ').
 * @param {string} cible Adresse principale concernée.
 * @param {!Array<!Object>} resultats Rapport produit par executerEtapes_.
 * @return {!Object} Résultat d'action si tout est OK.
 * @throws {AppError_} Si au moins une étape a échoué.
 */
function synthetiserGroupe_(intitule, cible, resultats) {
  var lignes = resultats.map(function (r) {
    return '• ' + r.action + ' : ' + r.statut + (r.message ? ' — ' + r.message : '');
  });
  var resume = lignes.join('\n');
  var echecs = resultats.filter(function (r) { return r.statut === 'ECHEC'; });

  if (echecs.length) {
    throw new AppError_('GROUPE_PARTIEL',
      intitule + ' de ' + cible + ' partiellement traité (' + echecs.length +
      ' étape(s) en échec) :\n' + resume, 502);
  }

  return {
    target: cible,
    message: intitule + ' de ' + cible + ' traité :\n' + resume,
    details: { etapes: resultats }
  };
}
