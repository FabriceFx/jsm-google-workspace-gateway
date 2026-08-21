/**
 * GROUPE D'ACTION — Urgence compromission / Kill-switch cybersécurité
 * -----------------------------------------------------------------------------
 * Formulaire JSM : compte compromis, suspicion de piratage ou phishing avéré.
 *
 * Enchaîne instantanément en une seule requête 24/7 (Fenêtre PERMANENTE) :
 *   1. SUSPENSION du compte Workspace
 *   2. DECONNEXION_FORCEE de toutes les sessions web / cookies
 *   3. REVOCATION_TOKENS_APPS des applications tierces OAuth
 *   4. BLOCAGE_APPAREIL de tous les smartphones / tablettes synchronisés
 *
 * Champs attendus dans `data` : email_cible, [motif]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_URGENCE_COMPROMISSION() {
  return {
    action: 'URGENCE_COMPROMISSION',
    description: 'Kill-switch sécurité : suspension, déconnexion forcée, révocation OAuth et blocage des appareils.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // urgence sécurité absolue : jamais différé
    destructive: true,
    handler: actionUrgenceCompromission_
  };
}

/**
 * ACTION URGENCE_COMPROMISSION — Orchestre la neutralisation d'un compte compromis.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionUrgenceCompromission_(data, ctx) {
  requireUser_(data.email_cible);

  const motif = data.motif || 'Urgence sécurité — suspicion de compromission';

  const etapes = [
    {
      nom: 'SUSPENSION',
      fn: function (d, c) {
        return actionSuspendreCompte_({
          email_cible: d.email_cible,
          motif: motif
        }, c);
      }
    },
    {
      nom: 'DECONNEXION_FORCEE',
      fn: function (d, c) {
        return actionDeconnexionForcee_({
          email_cible: d.email_cible,
          motif: motif
        }, c);
      }
    },
    {
      nom: 'REVOCATION_TOKENS_APPS',
      fn: function (d, c) {
        return actionRevoquerTokens_({
          email_cible: d.email_cible
        }, c);
      }
    },
    {
      nom: 'BLOCAGE_APPAREIL',
      fn: function (d, c) {
        try {
          return actionBloquerAppareil_({
            email_cible: d.email_cible
          }, c);
        } catch (errApp) {
          if (errApp && (errApp.code === 'NO_DEVICE' || estNotFound_(errApp))) {
            return {
              idempotent: true,
              target: d.email_cible,
              message: 'Aucun appareil mobile MDM synchronisé pour ' + d.email_cible + ' (aucun blocage requis).'
            };
          }
          throw errApp;
        }
      }
    }
  ];

  const resultats = executerEtapes_(etapes, data, ctx);
  return synthetiserGroupe_('Neutralisation sécurité', data.email_cible, resultats);
}
