/**
 * FORMULAIRE — Réactivation de compte
 * -----------------------------------------------------------------------------
 * Formulaire JSM : retour de congé longue durée, réintégration.
 *
 * Champs attendus dans `data` : email_cible
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Déclaration de l'action au registre.
 *
 * Cette fonction doit être référencée dans declarationsFormulaires_()
 * (01_Registre.gs) pour que l'action soit active. Apps Script n'expose pas les
 * fonctions de premier niveau à l'énumération : la déclaration est explicite.
 *
 * @return {!Object} Spécification de l'action.
 */
function SPEC_REACTIVATION() {
    return {
        action: 'REACTIVATION',
        description: 'Réactive un compte précédemment suspendu.',
        required: ['email_cible'],
        emails: ['email_cible'],
        fenetre: 'STANDARD',   // soumise au créneau ouvrable, différée sinon
        handler: actionReactiverCompte_
    };
}

/**
 * ACTION REACTIVATION — Réactive un compte suspendu.
 *
 * data : email_cible
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionReactiverCompte_(data, ctx) {
    const utilisateur = requireUser_(data.email_cible);
    if (!utilisateur.suspended) {
        return {
            idempotent: true,
            target: data.email_cible,
            message: 'Le compte ' + data.email_cible + ' est déjà actif.'
        };
    }
    AdminDirectory.Users.patch({ suspended: false }, data.email_cible);
    return {
        target: data.email_cible,
        message: 'Compte ' + data.email_cible + ' réactivé.'
    };
}