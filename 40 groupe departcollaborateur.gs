/**
 * GROUPE D'ACTION — Départ d'un collaborateur (offboarding)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : départ définitif. Enchaîne, DANS L'ORDRE, les gestes d'un
 * offboarding en un seul ticket. L'ordre est le cœur du groupe : on pose les
 * transferts et la délégation PENDANT que le compte est encore actif, et on
 * suspend EN DERNIER (sinon les appels Gmail sur la cible échoueraient).
 * Fenêtre PERMANENTE : couper les accès n'attend pas les heures ouvrables.
 *
 * Séquence :
 *   1. TRANSFERT_EMAILS       (si email_transfert ou email_manager)
 *   2. DELEGATION_EMAIL       (si email_manager)
 *   3. TRANSFERT_DRIVE        (si email_drive ou email_manager)
 *   4. RETRAIT_TOUS_GROUPES
 *   5. SUSPENSION             (en dernier geste d'accès)
 *   6. RETRAIT_LICENCE        (si une licence est configurée)
 *
 * Politique : continue-on-error avec rapport détaillé — on cherche à faire le
 * maximum, et à ne jamais laisser un accès ouvert. La moindre étape en échec
 * fait remonter un statut d'erreur récapitulatif à Jira (voir synthetiserGroupe_).
 *
 * Champs attendus dans `data` :
 *   email_cible (le partant), [email_manager] (délégué + destination par défaut),
 *   [email_transfert] (destination du transfert d'e-mails, défaut email_manager),
 *   [email_drive] (nouveau propriétaire Drive, défaut email_manager),
 *   [conserver_copie], [inclure_prives], [motif]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_DEPART_COLLABORATEUR() {
  return {
    action: 'DEPART_COLLABORATEUR',
    description: 'Offboarding complet : transferts, délégation, retrait des ' +
      'groupes puis suspension (dans l\'ordre).',
    required: ['email_cible'],
    emails: ['email_cible', 'email_manager', 'email_transfert', 'email_drive'],
    fenetre: 'PERMANENTE',   // contient une suspension : jamais différé
    destructive: true,
    handler: actionDepartCollaborateur_
  };
}

/**
 * ACTION DEPART_COLLABORATEUR — Orchestre l'offboarding.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionDepartCollaborateur_(data, ctx) {
  requireUser_(data.email_cible);

  // Destinations : le manager sert de valeur par défaut pour les transferts.
  var destTransfert = data.email_transfert || data.email_manager || '';
  var destDrive = data.email_drive || data.email_manager || '';

  var etapes = [
    {
      nom: 'TRANSFERT_EMAILS',
      si: function () { return !!destTransfert; },
      obligatoire: true,
      fn: function (d, c) {
        return actionTransfererEmails_({
          email_cible: d.email_cible,
          email_destination: destTransfert,
          conserver_copie: d.conserver_copie
        }, c);
      }
    },
    {
      nom: 'DELEGATION_EMAIL',
      si: function (d) { return !!d.email_manager; },
      obligatoire: true,
      fn: function (d, c) {
        return actionDeleguerEmail_({
          email_cible: d.email_cible,
          email_delegue: d.email_manager
        }, c);
      }
    },
    {
      nom: 'TRANSFERT_DRIVE',
      si: function () { return !!destDrive; },
      fn: function (d, c) {
        return actionTransfererDrive_({
          email_source: d.email_cible,
          email_destination: destDrive,
          inclure_prives: d.inclure_prives
        }, c);
      }
    },
    {
      nom: 'RETRAIT_TOUS_GROUPES',
      fn: function (d, c) {
        return actionRetirerTousGroupes_({ email_cible: d.email_cible }, c);
      }
    },
    {
      // Toujours en dernier : une fois suspendu, les gestes Gmail ci-dessus
      // ne seraient plus applicables sur la cible.
      nom: 'SUSPENSION',
      fn: function (d, c) {
        return actionSuspendreCompte_({
          email_cible: d.email_cible,
          motif: d.motif || 'Départ du collaborateur'
        }, c);
      }
    },
    {
      // Après la suspension : libérer la licence (facturée tant qu'assignée).
      // Ne s'exécute que si une licence est configurée (propriété ou champ).
      nom: 'RETRAIT_LICENCE',
      si: function (d) { return !!(d.sku_id || getProp_('LICENSE_SKU_ID')); },
      fn: function (d, c) {
        return actionRetirerLicence_({
          email_cible: d.email_cible,
          product_id: d.product_id,
          sku_id: d.sku_id
        }, c);
      }
    }
  ];

  var resultats = executerEtapes_(etapes, data, ctx);
  return synthetiserGroupe_('Départ', data.email_cible, resultats);
}
