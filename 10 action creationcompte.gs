/**
 * FORMULAIRE — Création de compte Workspace
 * -----------------------------------------------------------------------------
 * Formulaire JSM : arrivée d'un collaborateur.
 *
 * Champs `data` : prenom, nom, email_souhaite (requis), [unite_organisationnelle],
 * plus tous les champs de profil optionnels reconnus par construireProfilPatch_
 * (voir 06_Workspace.gs) : email_perso/email_recuperation, manager_email,
 * intitule_poste, departement, societe, centre_cout, telephone_pro,
 * telephone_mobile, adresse, batiment, etage, bureau, tel_recuperation,
 * custom_schemas.
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
function SPEC_CREATION_COMPTE() {
  return {
    action: 'CREATION_COMPTE',
    description: 'Crée un compte utilisateur Workspace.',
    required: ['prenom', 'nom', 'email_souhaite'],
    // manager_email est listé ici pour que sanitizeData_ valide son format ET
    // son domaine : il reçoit le mot de passe provisoire, jamais vers l'externe.
    emails: ['email_souhaite', 'email_perso', 'manager_email', 'email_recuperation'],
    fenetre: 'STANDARD',   // soumise au créneau ouvrable, différée sinon
    handler: actionCreerUtilisateur_
  };
}

/**
 * ACTION CREATION_COMPTE — Crée un compte utilisateur Workspace.
 *
 * data : prenom, nom, email_souhaite, [unite_organisationnelle], [email_perso],
 *        [manager_email], [intitule_poste], [telephone]
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object} Résultat structuré.
 */
function actionCreerUtilisateur_(data, ctx) {
  const email = data.email_souhaite;

  // Idempotence : si Jira rejoue la requête, on ne recrée pas le compte.
  const existant = getUserOrNull_(email);
  if (existant) {
    // creationTime est normalement toujours renvoyé, mais on ne laisse pas une
    // date absente produire un "Invalid Date" dans le commentaire du ticket.
    const creation = existant.creationTime
      ? Utilities.formatDate(new Date(existant.creationTime),
          Session.getScriptTimeZone(), 'dd/MM/yyyy')
      : 'date inconnue';
    return {
      idempotent: true,
      target: email,
      message: 'Le compte ' + email + ' existe déjà (créé le ' + creation +
        '). Aucune action réalisée.',
      details: { suspended: !!existant.suspended, orgUnitPath: existant.orgUnitPath }
    };
  }

  const motDePasse = generatePassword_();

  // Le profil (nom, poste, service, société, téléphones, manager, adresse,
  // localisation, récupération, schémas personnalisés…) est bâti par la source
  // partagée avec MISE_A_JOUR_PROFIL : les deux exposent le même jeu de champs.
  const profil = construireProfilPatch_(data, null).patch;

  /** @type {!Object} Ressource User de l'Admin SDK. */
  const nouvelUtilisateur = Object.assign({
    primaryEmail: email,
    password: motDePasse,
    changePasswordAtNextLogin: true,
    orgUnitPath: data.unite_organisationnelle || getProp_('DEFAULT_OU', '/')
  }, profil);

  // Garantit un nom même si prenom/nom venaient à manquer (ils sont requis).
  if (!nouvelUtilisateur.name) {
    nouvelUtilisateur.name = { givenName: data.prenom, familyName: data.nom };
  }

  let cree;
  try {
    cree = AdminDirectory.Users.insert(nouvelUtilisateur);
  } catch (err) {
    // La traduction générique est assurée par traduireErreurAdmin_ ; on n'ajoute
    // ici que le contexte que seule cette action connaît (adresse et OU visées).
    const traduite = traduireErreurAdmin_(err);
    if (traduite) {
      throw new AppError_(traduite.code,
        traduite.message + ' [demandé : ' + email + ' dans ' +
        nouvelUtilisateur.orgUnitPath + ']', traduite.httpHint);
    }
    throw err;
  }

  // Diffusion du mot de passe hors réponse HTTP (cf. envoyerIdentifiants_).
  const destinataire = data.manager_email || getProp_('NOTIFY_EMAIL');
  const envoye = envoyerIdentifiants_(destinataire, email, motDePasse, ctx.ticketKey);

  return {
    target: email,
    message: 'Compte ' + email + ' créé dans ' + nouvelUtilisateur.orgUnitPath + '. ' +
      (envoye
        ? 'Mot de passe provisoire envoyé à ' + destinataire + '.'
        : 'ATTENTION : aucun destinataire configuré pour le mot de passe — ' +
          'utiliser la console Admin pour le réinitialiser.'),
    details: {
      userId: cree.id,
      orgUnitPath: nouvelUtilisateur.orgUnitPath,
      password_sent_to: envoye ? destinataire : null
    }
  };
}