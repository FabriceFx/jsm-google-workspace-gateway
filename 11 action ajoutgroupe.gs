/**
 * FORMULAIRE — Ajout à un groupe
 * -----------------------------------------------------------------------------
 * Formulaire JSM : demande d'accès à une liste ou un partage.
 *
 * Champs attendus dans `data` : email_cible, email_groupe, [role] ∈ {MEMBER, MANAGER, OWNER}
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
function SPEC_AJOUT_GROUPE() {
  return {
    action: 'AJOUT_GROUPE',
    description: 'Ajoute un utilisateur à un groupe.',
    required: ['email_cible', 'email_groupe'],
    emails: ['email_cible', 'email_groupe'],
    fenetre: 'STANDARD',   // soumise au créneau ouvrable, différée sinon
    handler: actionAjouterGroupe
  };
}

/**
 * ACTION AJOUT_GROUPE — Ajoute un utilisateur à un groupe.
 *
 * data : email_cible, email_groupe, [role] ∈ {MEMBER, MANAGER, OWNER}
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionAjouterGroupe(data, ctx) {
  const role = String(data.role || 'MEMBER').toUpperCase();
  if (['MEMBER', 'MANAGER', 'OWNER'].indexOf(role) === -1) {
    throw new AppError_('INVALID_ROLE',
      "Rôle '" + role + "' invalide. Valeurs admises : MEMBER, MANAGER, OWNER.");
  }

  // Un membre peut être un groupe imbriqué : on ne bloque donc pas si
  // l'adresse cible n'est pas un utilisateur, on laisse l'API arbitrer.
  if (isMember_(data.email_groupe, data.email_cible)) {
    return {
      idempotent: true,
      target: data.email_cible,
      message: data.email_cible + ' est déjà membre de ' + data.email_groupe + '.'
    };
  }

  try {
    AdminDirectory.Members.insert(
      { email: data.email_cible, role: role },
      data.email_groupe
    );
  } catch (err) {
    if (estNotFound_(err)) {
      throw new AppError_('NOT_FOUND',
        'Groupe ' + data.email_groupe + ' ou membre ' + data.email_cible +
        ' introuvable.', 404);
    }
    throw err;
  }

  return {
    target: data.email_cible,
    message: data.email_cible + ' ajouté à ' + data.email_groupe +
      ' (rôle : ' + role + ').'
  };
}