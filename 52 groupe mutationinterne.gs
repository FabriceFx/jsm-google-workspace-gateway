/**
 * GROUPE D'ACTION — Mobilité interne & changement de poste
 * -----------------------------------------------------------------------------
 * Formulaire JSM : mutation d'un collaborateur vers un autre service/site.
 *
 * Enchaîne dans l'ordre :
 *   1. CHANGEMENT_OU         (si nouvelle OU spécifiée)
 *   2. MISE_A_JOUR_PROFIL    (nouveau poste, manager, service, téléphones, RH)
 *   3. RETRAIT_TOUS_GROUPES  (optionnel, si retirer_anciens_groupes est coché)
 *   4. AJOUT_GROUPE × N      (un pas par groupe listé dans `nouveaux_groupes`)
 *
 * Champs attendus dans `data` :
 *   email_cible, [unite_organisationnelle], [intitule_poste], [departement],
 *   [societe], [centre_cout], [manager_email], [telephone_pro],
 *   [retirer_anciens_groupes], [nouveaux_groupes] (séparés par des virgules)
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.0.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_MUTATION_INTERNE() {
  return {
    action: 'MUTATION_INTERNE',
    description: 'Mobilité interne : déplacement OU, mise à jour du profil et transfert de groupes.',
    required: ['email_cible'],
    emails: ['email_cible', 'manager_email'],
    fenetre: 'STANDARD',
    handler: actionMutationInterne_
  };
}

/**
 * ACTION MUTATION_INTERNE — Orchestre la mobilité interne.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionMutationInterne_(data, ctx) {
  requireUser_(data.email_cible);

  const etapes = [
    {
      nom: 'CHANGEMENT_OU',
      si: function (d) { return !!d.unite_organisationnelle; },
      fn: function (d, c) {
        return actionChangerOU_({
          email_cible: d.email_cible,
          unite_organisationnelle: d.unite_organisationnelle
        }, c);
      }
    },
    {
      nom: 'MISE_A_JOUR_PROFIL',
      fn: function (d, c) {
        return actionMettreAJourProfil_(d, c);
      }
    },
    {
      nom: 'RETRAIT_ANCIENS_GROUPES',
      si: function (d) {
        return d.retirer_anciens_groupes === true ||
          String(d.retirer_anciens_groupes).toLowerCase() === 'true' ||
          String(d.retirer_anciens_groupes).toLowerCase() === 'oui';
      },
      fn: function (d, c) {
        return actionRetirerTousGroupes_({ email_cible: d.email_cible }, c);
      }
    }
  ];

  // Nouveaux groupes à rejoindre
  const nouveauxGroupes = String(data.nouveaux_groupes || '')
    .split(',').map(function (g) { return g.trim().toLowerCase(); })
    .filter(Boolean);

  nouveauxGroupes.forEach(function (groupe) {
    etapes.push({
      nom: 'AJOUT_GROUPE (' + groupe + ')',
      fn: function (d, c) {
        return actionAjouterGroupe_({
          email_cible: d.email_cible,
          email_groupe: groupe,
          role: 'MEMBER'
        }, c);
      }
    });
  });

  const resultats = executerEtapes_(etapes, data, ctx);
  return synthetiserGroupe_('Mobilité interne', data.email_cible, resultats);
}
