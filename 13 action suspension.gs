/**
 * FORMULAIRE — Suspension de compte
 * -----------------------------------------------------------------------------
 * Formulaire JSM : départ, licenciement, incident de sécurité.
 * Fenêtre PERMANENTE : différer une suspension du vendredi soir au lundi
 * matin laisserait l'accès ouvert tout le week-end.
 *
 * Champs attendus dans `data` : email_cible, [motif]
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
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
function SPEC_SUSPENSION() {
  return {
    action: 'SUSPENSION',
    description: 'Suspend un compte et révoque ses sessions actives.',
    required: ['email_cible'],
    emails: ['email_cible'],
    fenetre: 'PERMANENTE',   // retrait d'accès : jamais différé
    handler: actionSuspendreCompte
  };
}

/**
 * ACTION SUSPENSION — Suspend un compte.
 *
 * Ajout par rapport à la v1 : révocation des sessions actives. Sans cela, un
 * salarié parti conserve l'accès à Gmail/Drive sur ses appareils déjà
 * authentifiés pendant plusieurs heures. C'est le point critique d'une
 * procédure de départ.
 *
 * data : email_cible, [motif]
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionSuspendreCompte(data, ctx) {
  const utilisateur = getUserOrNull_(data.email_cible);
  if (!utilisateur) {
    throw new AppError_('NOT_FOUND',
      'Compte ' + data.email_cible + ' introuvable.', 404);
  }
  if (utilisateur.suspended) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: 'Le compte ' + data.email_cible + ' est déjà suspendu.'
    };
  }

  AdminDirectory.Users.patch({ suspended: true }, data.email_cible);

  // Révocation des sessions : non bloquant si l'appel échoue, la suspension
  // reste l'effet principal attendu.
  let sessionsRevoquees = true;
  try {
    AdminDirectory.Users.signOut(data.email_cible);
  } catch (err) {
    sessionsRevoquees = false;
    console.warn('[%s] Révocation des sessions échouée pour %s : %s',
      ctx.traceId, data.email_cible, err.message);
  }

  return {
    target: data.email_cible,
    message: 'Compte ' + data.email_cible + ' suspendu' +
      (data.motif ? ' (motif : ' + data.motif + ')' : '') + '. ' +
      (sessionsRevoquees
        ? 'Sessions actives révoquées.'
        : 'ATTENTION : révocation des sessions à vérifier manuellement.'),
    details: { sessions_revoked: sessionsRevoquees }
  };
}