/**
 * GROUPE D'ACTION — Arrivée d'un collaborateur (onboarding)
 * -----------------------------------------------------------------------------
 * Formulaire JSM : arrivée d'un collaborateur. Enchaîne, dans l'ordre, les
 * gestes d'un onboarding en un seul ticket. Fenêtre STANDARD : une arrivée
 * n'est pas urgente et peut être différée au prochain créneau (une seule entrée
 * de file pour tout le groupe).
 *
 * Séquence :
 *   1. CREATION_COMPTE       (OBLIGATOIRE : sans compte, rien ne suit)
 *   2. ATTRIBUTION_LICENCE   (si une licence est configurée)
 *   3. AJOUT_GROUPE × N       (un par groupe listé dans `groupes`)
 *   4. AJOUT_ALIAS           (si alias)
 *
 * Politique : stop-on-error sur la création (étape obligatoire), puis
 * continue-on-error avec rapport détaillé pour le reste.
 *
 * Champs attendus dans `data` :
 *   prenom, nom, email_souhaite,
 *   [unite_organisationnelle], [manager_email], [intitule_poste],
 *   [telephone], [email_perso],
 *   [groupes] (adresses de groupes séparées par des virgules),
 *   [alias], [sku_id], [product_id]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_ARRIVEE_COLLABORATEUR() {
  return {
    action: 'ARRIVEE_COLLABORATEUR',
    description: 'Onboarding complet : création du compte, licence, groupes et ' +
      'alias, dans l\'ordre.',
    required: ['prenom', 'nom', 'email_souhaite'],
    emails: ['email_souhaite', 'email_perso', 'email_recuperation', 'manager_email', 'alias'],
    fenetre: 'STANDARD',
    handler: actionArriveeCollaborateur_
  };
}

/**
 * ACTION ARRIVEE_COLLABORATEUR — Orchestre l'onboarding.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionArriveeCollaborateur_(data, ctx) {
  var etapes = [
    {
      // Obligatoire : les étapes suivantes visent ce compte.
      nom: 'CREATION_COMPTE',
      obligatoire: true,
      fn: function (d, c) { return actionCreerUtilisateur_(d, c); }
    },
    {
      nom: 'ATTRIBUTION_LICENCE',
      si: function (d) { return !!(d.sku_id || getProp_('LICENSE_SKU_ID')); },
      fn: function (d, c) {
        return actionAttribuerLicence_({
          email_cible: d.email_souhaite,
          product_id: d.product_id,
          sku_id: d.sku_id
        }, c);
      }
    }
  ];

  // Un pas d'ajout par groupe listé (adresses séparées par des virgules).
  // La validation de format/domaine des groupes est laissée à l'Admin SDK, qui
  // rejette une adresse invalide — l'échec est alors isolé dans le rapport.
  var groupes = String(data.groupes || '')
    .split(',').map(function (g) { return g.trim().toLowerCase(); })
    .filter(Boolean);

  groupes.forEach(function (groupe) {
    etapes.push({
      nom: 'AJOUT_GROUPE (' + groupe + ')',
      fn: function (d, c) {
        return actionAjouterGroupe_({
          email_cible: d.email_souhaite,
          email_groupe: groupe,
          role: 'MEMBER'
        }, c);
      }
    });
  });

  etapes.push({
    nom: 'AJOUT_ALIAS',
    si: function (d) { return !!d.alias; },
    fn: function (d, c) {
      return actionAjouterAlias_({
        email_cible: d.email_souhaite,
        alias: d.alias
      }, c);
    }
  });

  var resultats = executerEtapes_(etapes, data, ctx);
  return synthetiserGroupe_('Arrivée', data.email_souhaite, resultats);
}
