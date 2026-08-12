/**
 * GROUPE D'ACTION — Retour d'absence
 * -----------------------------------------------------------------------------
 * Formulaire JSM : l'utilisateur revient de congé/absence longue. Défait, en un
 * seul ticket, les dispositions posées au départ. Exact inverse du groupe
 * ABSENCE_LONGUE. Fenêtre STANDARD : aucune urgence de sécurité.
 *
 * Séquence :
 *   1. DESACTIVATION_REPONSE_ABSENCE
 *   2. ARRET_TRANSFERT_EMAILS
 *   3. RETRAIT_DELEGATION_EMAIL   (si email_delegue fourni)
 *
 * Politique : continue-on-error avec rapport détaillé — on veut rétablir un
 * état normal aussi complètement que possible.
 *
 * Champs attendus dans `data` : email_cible, [email_delegue]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_RETOUR_ABSENCE() {
  return {
    action: 'RETOUR_ABSENCE',
    description: 'Retour d\'absence : coupe réponse d\'absence, transfert et ' +
      'délégation posés au départ.',
    required: ['email_cible'],
    emails: ['email_cible', 'email_delegue'],
    fenetre: 'STANDARD',
    handler: actionRetourAbsence
  };
}

/**
 * ACTION RETOUR_ABSENCE — Orchestre le rétablissement post-absence.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionRetourAbsence(data, ctx) {
  requireUser_(data.email_cible);

  var etapes = [
    {
      nom: 'DESACTIVATION_REPONSE_ABSENCE',
      fn: function (d, c) {
        return actionDesactiverReponseAbsence({ email_cible: d.email_cible }, c);
      }
    },
    {
      nom: 'ARRET_TRANSFERT_EMAILS',
      fn: function (d, c) {
        return actionArreterTransfertEmails({ email_cible: d.email_cible }, c);
      }
    },
    {
      nom: 'RETRAIT_DELEGATION_EMAIL',
      si: function (d) { return !!d.email_delegue; },
      fn: function (d, c) {
        return actionRetirerDelegationEmail({
          email_cible: d.email_cible,
          email_delegue: d.email_delegue
        }, c);
      }
    }
  ];

  var resultats = executerEtapes_(etapes, data, ctx);
  return synthetiserGroupe_('Retour d\'absence', data.email_cible, resultats);
}
