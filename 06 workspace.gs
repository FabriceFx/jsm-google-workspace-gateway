/**
 * ACCÈS GOOGLE WORKSPACE
 * -----------------------------------------------------------------------------
 * Briques réutilisables au-dessus de l'Admin SDK : lecture d'utilisateur,
 * appartenance à un groupe, génération et transmission des mots de passe.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Génère un mot de passe temporaire robuste.
 *
 * La v1 utilisait `Math.random()`, qui n'est pas cryptographiquement sûr et
 * pouvait produire des chaînes plus courtes qu'annoncé. On s'appuie ici sur
 * `Utilities.getUuid()` (générateur sécurisé côté serveur Google) comme source
 * d'entropie, en garantissant la présence des 4 classes de caractères.
 *
 * @return {string} Mot de passe de CONFIG.PASSWORD_LENGTH caractères.
 */
function generatePassword_() {
    const sets = [
        'ABCDEFGHJKLMNPQRSTUVWXYZ',   // sans I et O (confusion visuelle)
        'abcdefghijkmnopqrstuvwxyz',  // sans l
        '23456789',                   // sans 0 et 1
        '!@#$%*-_=+?'
    ];
    const all = sets.join('');

    // Flux hexadécimal aléatoire, réalimenté à la demande par des UUID v4.
    // (Le nombre de tirages dépend de la longueur ET du mélange final : on ne
    // peut donc pas pré-calculer la taille du flux, d'où le rechargement paresseux.)
    let entropy = '';
    let cursor = 0;

    /**
     * Tirage d'un entier dans [0, max) par échantillonnage avec rejet,
     * afin d'éviter le biais modulo d'un simple `% max`.
     * @param {number} max Borne supérieure exclue.
     * @return {number}
     */
    const nextInt = function (max) {
        const CHUNK = 4;                    // 4 hex = 16 bits = [0, 65536)
        const RANGE = 65536;
        const limit = RANGE - (RANGE % max); // seuil au-delà duquel on rejette
        for (; ;) {
            if (cursor + CHUNK > entropy.length) {
                entropy = entropy.slice(cursor) + Utilities.getUuid().replace(/-/g, '');
                cursor = 0;
            }
            const value = parseInt(entropy.substr(cursor, CHUNK), 16);
            cursor += CHUNK;
            if (value < limit) return value % max;
        }
    };

    // 1 caractère garanti par classe, puis remplissage.
    const chars = sets.map(function (s) { return s.charAt(nextInt(s.length)); });
    while (chars.length < CONFIG.PASSWORD_LENGTH) {
        chars.push(all.charAt(nextInt(all.length)));
    }

    // Mélange de Fisher-Yates pour ne pas figer l'ordre des classes.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = nextInt(i + 1);
        const tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    return chars.join('');
}

/**
 * Traduit une erreur brute de l'Admin SDK en erreur applicative actionnable.
 *
 * Les messages de l'API sont laconiques et destinés à un développeur
 * ('Invalid Input: INVALID_OU_ID') : renvoyés tels quels dans un ticket, ils
 * n'aident pas l'agent JSM. Cette table les convertit en consignes.
 *
 * La comparaison est faite en majuscules : la casse des messages Google n'est
 * pas stable d'un point d'API à l'autre, et s'y fier a déjà laissé passer un
 * cas (INVALID_OU_ID) qui remontait alors en « erreur interne ».
 *
 * @param {!Error} err Erreur levée par l'Admin SDK.
 * @return {?AppError_} Erreur traduite, ou null si le motif est inconnu.
 */
function traduireErreurAdmin_(err) {
    const brut = String((err && err.message) || err).toUpperCase();
    const contient = function (motif) { return brut.indexOf(motif) !== -1; };

    const table = [
        {
            motifs: ['INVALID_OU_ID', 'INVALID OU ID', 'ORGUNIT'],
            code: 'INVALID_OU', http: 400,
            message: "Unité organisationnelle introuvable. Le chemin doit commencer " +
                "par '/' et respecter exactement la casse et les accents de la console " +
                "d'administration (Annuaire > Unités organisationnelles). Exécuter " +
                'admin_listerUnitesOrganisationnelles() pour obtenir les chemins valides.'
        },
        {
            motifs: ['ENTITY ALREADY EXISTS', 'DUPLICATE'],
            code: 'ALREADY_EXISTS', http: 409,
            message: 'Adresse déjà utilisée par un compte, un alias ou un groupe. ' +
                'Choisir une autre adresse.'
        },
        {
            motifs: ['MEMBER ALREADY EXISTS'],
            code: 'ALREADY_MEMBER', http: 409,
            message: "L'utilisateur est déjà membre de ce groupe."
        },
        {
            motifs: ['DOMAIN NOT FOUND', 'INVALID_DOMAIN'],
            code: 'INVALID_DOMAIN', http: 400,
            message: "Domaine inconnu de l'annuaire Workspace. Vérifier la liste des " +
                'domaines dans la console d\'administration et la propriété ALLOWED_DOMAINS.'
        },
        {
            // Volontairement APRÈS le motif domaine : 'NOT FOUND' est générique et
            // capterait sinon 'domain not found'. Toute règle ajoutée à cette table
            // doit être placée avant les motifs plus larges qu'elle.
            motifs: ['RESOURCE NOT FOUND', 'NOTFOUND', 'NOT FOUND'],
            code: 'NOT_FOUND', http: 404,
            message: 'Compte ou groupe introuvable dans l\'annuaire. Vérifier ' +
                "l'orthographe de l'adresse et le domaine."
        },
        {
            motifs: ['NOT AUTHORIZED', 'INSUFFICIENT PERMISSION', 'FORBIDDEN'],
            code: 'DROITS_INSUFFISANTS', http: 403,
            message: 'Le compte propriétaire du script ne dispose pas des droits ' +
                "d'administration nécessaires. Vérifier son rôle dans la console."
        },
        {
            motifs: ['QUOTA', 'RATE LIMIT', 'TOO MANY'],
            code: 'QUOTA_DEPASSE', http: 429,
            message: "Quota de l'API Admin dépassé. Relancer la demande plus tard ; " +
                "une action mise en file d'attente sera automatiquement réessayée."
        },
        {
            motifs: ['INVALID INPUT: PASSWORD', 'WEAK PASSWORD'],
            code: 'MOT_DE_PASSE_REFUSE', http: 400,
            message: 'Mot de passe refusé par la politique du domaine. Vérifier la ' +
                'longueur minimale exigée et ajuster CONFIG.PASSWORD_LENGTH.'
        }
    ];

    for (let i = 0; i < table.length; i++) {
        for (let j = 0; j < table[i].motifs.length; j++) {
            if (contient(table[i].motifs[j])) {
                return new AppError_(table[i].code, table[i].message, table[i].http);
            }
        }
    }
    return null;
}

/**
 * Indique si une erreur de l'Admin SDK correspond à une ressource inexistante.
 *
 * Point unique de reconnaissance du « 404 » : les libellés varient d'un point
 * d'API à l'autre ('Resource Not Found', 'notFound', 'Not Found'), et les
 * répartir inline dans chaque action a déjà produit des divergences. Toute
 * erreur qui n'est PAS un not-found doit continuer à remonter.
 *
 * @param {!Error} err Erreur levée par l'Admin SDK.
 * @return {boolean} true si l'erreur signale une ressource inexistante.
 */
function estNotFound_(err) {
    const m = String((err && err.message) || err).toLowerCase();
    return m.indexOf('resource not found') !== -1 ||
        m.indexOf('notfound') !== -1 ||
        m.indexOf('not found') !== -1;
}

/**
 * Récupère un utilisateur Workspace, ou null s'il n'existe pas.
 * Sert de brique d'idempotence : Jira Automation peut rejouer une requête
 * (timeout réseau, relance manuelle) sans qu'on doive créer un doublon.
 *
 * @param {string} email Adresse à rechercher.
 * @return {?Object} Ressource User de l'Admin SDK, ou null.
 */
function getUserOrNull_(email) {
    try {
        return AdminDirectory.Users.get(email);
    } catch (err) {
        // 404 = utilisateur inexistant, cas nominal. Toute autre erreur remonte.
        if (estNotFound_(err)) return null;
        throw err;
    }
}

/**
 * Récupère un groupe Workspace, ou null s'il n'existe pas.
 * Symétrique de getUserOrNull_ : évite de dupliquer le try/catch autour de
 * AdminDirectory.Groups.get dans les actions de gestion de groupes.
 *
 * @param {string} email Adresse du groupe.
 * @return {?Object} Ressource Group de l'Admin SDK, ou null.
 */
function getGroupOrNull_(email) {
    try {
        return AdminDirectory.Groups.get(email);
    } catch (err) {
        if (estNotFound_(err)) return null;
        throw err;
    }
}

/**
 * Récupère un utilisateur, ou lève une erreur NOT_FOUND explicite et uniforme.
 * Factorise le préambule « compte introuvable » répété dans une douzaine
 * d'actions et garantit un message identique côté ticket.
 *
 * @param {string} email Adresse du compte.
 * @param {string=} libelle Qualificatif du compte (ex. 'source', 'délégué').
 * @return {!Object} Ressource User de l'Admin SDK.
 * @throws {AppError_} 404 si le compte n'existe pas.
 */
function requireUser_(email, libelle) {
    const utilisateur = getUserOrNull_(email);
    if (!utilisateur) {
        throw new AppError_('NOT_FOUND',
            'Compte ' + (libelle ? libelle + ' ' : '') + email + ' introuvable.', 404);
    }
    return utilisateur;
}

/**
 * Indique si un utilisateur est déjà membre d'un groupe.
 *
 * ⚠️ Ne renvoie `false` QUE lorsque l'appartenance est réellement absente
 * (404). Une erreur transitoire (quota, permission, réseau) est propagée :
 * la traiter comme « pas membre » ferait remonter un faux succès sur un
 * RETRAIT_GROUPE dont l'accès n'aurait en réalité pas été révoqué.
 *
 * @param {string} groupEmail Adresse du groupe.
 * @param {string} memberEmail Adresse du membre.
 * @return {boolean}
 * @throws {!Error} Toute erreur autre qu'un 404.
 */
function isMember_(groupEmail, memberEmail) {
    try {
        AdminDirectory.Members.get(groupEmail, memberEmail);
        return true;
    } catch (err) {
        if (estNotFound_(err)) return false;
        throw err;
    }
}

/**
 * Interprète une valeur booléenne issue d'un formulaire Jira.
 *
 * Les champs de formulaire arrivent en texte : un helper unique évite les
 * conventions contradictoires (un fichier lisant 'false', un autre 'true').
 * Sont considérés comme vrais : true, 'true', 'oui', 'yes', '1', 'on' ;
 * comme faux : false, 'false', 'non', 'no', '0', 'off'. Toute autre valeur
 * (y compris vide ou absente) retombe sur `defaut`.
 *
 * @param {*} valeur Valeur brute du champ.
 * @param {boolean} defaut Valeur si le champ est absent ou non reconnu.
 * @return {boolean}
 */
function boolDeFormulaire_(valeur, defaut) {
    if (valeur === true || valeur === false) return valeur;
    const v = String(valeur === null || valeur === undefined ? '' : valeur)
        .trim().toLowerCase();
    if (['true', 'oui', 'yes', '1', 'on'].indexOf(v) !== -1) return true;
    if (['false', 'non', 'no', '0', 'off'].indexOf(v) !== -1) return false;
    return defaut;
}

/**
 * Détermine le destinataire d'un secret (mot de passe, codes 2FA) et échoue
 * AVANT tout effet irréversible s'il n'y en a pas.
 *
 * Les actions qui écrasent un identifiant (reset de mot de passe, génération de
 * codes de secours) doivent appeler ce contrôle avant l'appel Admin SDK : sans
 * lui, on révoque l'accès existant puis on découvre qu'aucun destinataire n'est
 * configuré — l'utilisateur se retrouve verrouillé et personne ne détient le
 * nouveau secret. Le format et le domaine de `data.manager_email` sont déjà
 * validés en amont par sanitizeData_ (champ déclaré dans spec.emails).
 *
 * @param {!Object} data Données validées de l'action.
 * @return {string} Adresse du destinataire.
 * @throws {AppError_} 500 si aucun destinataire n'est disponible.
 */
function requireDestinataireSecret_(data) {
    const destinataire = data.manager_email || getProp_('NOTIFY_EMAIL');
    if (!destinataire) {
        throw new AppError_('NOTIFY_FAILED',
            "Aucun destinataire pour transmettre le secret : renseigner " +
            "'manager_email' dans le ticket ou configurer la propriété " +
            'NOTIFY_EMAIL. Opération interrompue avant toute modification.', 500);
    }
    return destinataire;
}

/**
 * Transmet un mot de passe temporaire par e-mail.
 *
 * Choix de conception : le mot de passe n'est JAMAIS renvoyé dans la réponse
 * HTTP, car Jira le recopierait dans le commentaire du ticket — donc dans un
 * historique consultable et indexé. Il part vers NOTIFY_EMAIL (ou le manager
 * indiqué dans le ticket), qui le transmet hors canal.
 *
 * @param {string} destinataire Adresse du destinataire.
 * @param {string} compte Compte concerné.
 * @param {string} motDePasse Mot de passe temporaire.
 * @param {string} ticketKey Référence du ticket.
 * @return {boolean} true si l'envoi a réussi.
 */
function envoyerIdentifiants_(destinataire, compte, motDePasse, ticketKey) {
    return envoyerEmailCooperl_(destinataire,
        '[' + ticketKey + '] Identifiants provisoires — ' + compte, {
        sousTitre: 'Ticket ' + ticketKey,
        titre: 'Compte Workspace créé',
        paragraphes: [
            'Le compte ci-dessous a été créé à la suite de votre demande. ' +
            'Le mot de passe est provisoire : son changement est imposé à la ' +
            'première connexion.'
        ],
        encadres: [
            { label: 'Adresse du compte', valeur: adresseStylisee_(compte) },
            {
                label: 'Mot de passe provisoire',
                // Police à chasse fixe : évite toute confusion de lecture entre
                // caractères voisins au moment de la transmission orale.
                valeur: '<span style="font-family:Consolas,Menlo,monospace;' +
                    'font-size:19px;letter-spacing:1px;">' + echapper_(motDePasse) +
                    '</span>'
            }
        ],
        note: 'Transmettez ce mot de passe par un canal distinct de cet e-mail ' +
            '(téléphone ou SMS), puis supprimez ce message.'
    });
}

// ---------------------------------------------------------------------------
//  APPAREILS MOBILES
// ---------------------------------------------------------------------------

/**
 * Liste les appareils mobiles enregistrés pour un utilisateur.
 * @param {string} email Adresse de l'utilisateur.
 * @return {!Array<!Object>} Liste des appareils (peut être vide).
 */
function listerAppareilsUtilisateur_(email) {
  const appareils = [];
  let pageToken = null;
  do {
    const options = { query: 'email:' + email, maxResults: 100 };
    if (pageToken) options.pageToken = pageToken;
    const reponse = AdminDirectory.Mobiledevices.list('my_customer', options);
    if (reponse.mobiledevices) {
      reponse.mobiledevices.forEach(function (d) { appareils.push(d); });
    }
    pageToken = reponse.nextPageToken;
  } while (pageToken);
  return appareils;
}

/**
 * Exécute une action sur les appareils mobiles d'un utilisateur.
 *
 * @param {string} email Adresse de l'utilisateur.
 * @param {string} action Action Admin SDK : 'admin_remote_wipe',
 *     'admin_account_wipe', 'approve', 'block'.
 * @param {string=} deviceId Si fourni, cible un seul appareil.
 * @return {!{traites: number, appareils: !Array<!Object>}}
 * @throws {AppError_} Si aucun appareil n'est trouvé.
 */
function actionSurAppareils_(email, action, deviceId) {
  const appareils = listerAppareilsUtilisateur_(email);
  if (!appareils.length) {
    throw new AppError_('NO_DEVICE',
      'Aucun appareil mobile enregistré pour ' + email + '.', 404);
  }

  const cibles = deviceId
    ? appareils.filter(function (d) { return d.resourceId === deviceId; })
    : appareils;

  if (deviceId && !cibles.length) {
    throw new AppError_('DEVICE_NOT_FOUND',
      'Appareil ' + deviceId + ' introuvable pour ' + email + '. ' +
      'Appareils disponibles : ' + appareils.map(function (d) {
        return d.resourceId + ' (' + (d.model || '?') + ')';
      }).join(', '), 404);
  }

  cibles.forEach(function (d) {
    AdminDirectory.Mobiledevices.action({ action: action }, 'my_customer', d.resourceId);
  });

  return {
    traites: cibles.length,
    appareils: cibles.map(function (d) {
      return { resourceId: d.resourceId, model: d.model || '', type: d.type || '' };
    })
  };
}

// ---------------------------------------------------------------------------
//  E-MAIL : CODES DE SECOURS
// ---------------------------------------------------------------------------

/**
 * Envoie les codes de vérification à deux facteurs par e-mail.
 *
 * Comme pour les mots de passe, les codes ne passent JAMAIS dans la réponse
 * HTTP : ils sont transmis par canal séparé.
 *
 * @param {string} destinataire Adresse du destinataire.
 * @param {string} compte Compte concerné.
 * @param {!Array<string>} codes Codes de secours.
 * @param {string} ticketKey Référence du ticket.
 * @return {boolean} true si l'envoi a réussi.
 */
function envoyerCodesSecours_(destinataire, compte, codes, ticketKey) {
  return envoyerEmailCooperl_(destinataire,
    '[' + ticketKey + '] Codes de secours 2FA — ' + compte, {
    sousTitre: 'Ticket ' + ticketKey,
    titre: 'Codes de secours générés',
    paragraphes: [
      'De nouveaux codes de secours ont été générés pour le compte ci-dessous. ' +
      'Les anciens codes sont définitivement révoqués.'
    ],
    encadres: [
      { label: 'Compte', valeur: adresseStylisee_(compte) },
      {
        label: 'Codes de secours (usage unique)',
        valeur: '<span style="font-family:Consolas,Menlo,monospace;' +
          'font-size:15px;letter-spacing:1px;">' +
          codes.map(function (c) { return echapper_(c); }).join('<br />') +
          '</span>'
      }
    ],
    note: 'Chaque code ne peut être utilisé qu\'une seule fois. ' +
      'Conservez-les en lieu sûr, puis supprimez ce message.'
  });
}

// ---------------------------------------------------------------------------
//  GMAIL API — IMPERSONATION VIA COMPTE DE SERVICE
// ---------------------------------------------------------------------------

/**
 * Crée un jeton d'accès OAuth2 en impersonnant un utilisateur du domaine.
 *
 * Nécessite :
 *  - SERVICE_ACCOUNT_EMAIL dans les propriétés du script
 *  - SERVICE_ACCOUNT_KEY  (clé privée PEM) dans les propriétés du script
 *  - La délégation de domaine activée pour le compte de service dans la
 *    console d'administration Google (Sécurité > API Controls > Domain-wide
 *    Delegation)
 *
 * @param {string} emailCible Utilisateur à impersonner.
 * @param {string} scopes Scopes OAuth2, séparés par des espaces.
 * @return {string} Jeton d'accès OAuth2.
 * @throws {AppError_} Si la configuration est absente ou si l'échange échoue.
 */
function creerJetonImpersonation_(emailCible, scopes) {
  const saEmail = getProp_('SERVICE_ACCOUNT_EMAIL');
  const saKey = getProp_('SERVICE_ACCOUNT_KEY');

  if (!saEmail || !saKey) {
    throw new AppError_('NOT_CONFIGURED',
      'Les actions Gmail nécessitent un compte de service avec délégation ' +
      'de domaine. Renseigner SERVICE_ACCOUNT_EMAIL et SERVICE_ACCOUNT_KEY ' +
      'dans les propriétés du script.', 500);
  }

  const maintenant = Math.floor(Date.now() / 1000);
  const entete = Utilities.base64EncodeWebSafe(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '');
  const revendications = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: saEmail,
    sub: emailCible,
    scope: scopes,
    aud: 'https://oauth2.googleapis.com/token',
    iat: maintenant,
    exp: maintenant + 3600
  })).replace(/=+$/, '');

  const aSignier = entete + '.' + revendications;
  var signature = Utilities.computeRsaSha256Signature(aSignier, saKey.replace(/\\n/g, '\n'));
  var signatureB64 = Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');
  var jwt = aSignier + '.' + signatureB64;

  var reponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    muteHttpExceptions: true,
    payload: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
      '&assertion=' + jwt
  });

  if (reponse.getResponseCode() !== 200) {
    throw new AppError_('AUTH_GMAIL_FAILED',
      'Impossible d\'obtenir un jeton pour ' + emailCible + '. ' +
      'Vérifier la configuration du compte de service et la délégation ' +
      'de domaine. Réponse : ' + reponse.getContentText(), 500);
  }

  return JSON.parse(reponse.getContentText()).access_token;
}

/**
 * Appelle l'API Gmail REST en impersonnant un utilisateur.
 *
 * @param {string} emailCible Utilisateur impersonné.
 * @param {string} endpoint Chemin après /gmail/v1/users/{userId}/.
 * @param {string} methode Méthode HTTP (GET, POST, PUT, PATCH, DELETE).
 * @param {?Object} payload Corps de la requête (null si GET/DELETE).
 * @param {string} scopes Scopes OAuth2 requis.
 * @return {?Object} Réponse JSON, ou null si 204.
 * @throws {AppError_} En cas d'erreur API.
 */
function appelGmailApi_(emailCible, endpoint, methode, payload, scopes) {
  var jeton = creerJetonImpersonation_(emailCible, scopes);
  var url = 'https://gmail.googleapis.com/gmail/v1/users/' +
    encodeURIComponent(emailCible) + '/' + endpoint;

  var options = {
    method: methode,
    headers: { Authorization: 'Bearer ' + jeton },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var reponse = UrlFetchApp.fetch(url, options);
  var code = reponse.getResponseCode();

  if (code >= 400) {
    var message = '';
    try { message = JSON.parse(reponse.getContentText()).error.message; }
    catch (e) { message = reponse.getContentText(); }
    throw new AppError_('GMAIL_API_ERROR',
      'API Gmail (' + endpoint + ') : ' + message, code >= 500 ? 502 : code);
  }

  if (code === 204 || !reponse.getContentText()) return null;
  return JSON.parse(reponse.getContentText());
}

// ---------------------------------------------------------------------------
//  LICENCES WORKSPACE — Enterprise License Manager API
// ---------------------------------------------------------------------------

/**
 * Résout le couple (produit, SKU) de licence à utiliser.
 *
 * Priorité : champ du ticket (product_id / sku_id) puis propriétés du script
 * (LICENSE_PRODUCT_ID / LICENSE_SKU_ID). Le SKU identifie l'édition précise
 * (ex. Business Standard) et dépend de l'abonnement du domaine : il n'a donc pas
 * de valeur codée en dur. Le produit vaut 'Google-Apps' pour Workspace par
 * défaut.
 *
 * @param {!Object} data Données validées de l'action.
 * @return {!{productId: string, skuId: string}}
 * @throws {AppError_} 500 si le SKU n'est pas déterminable.
 */
function resoudreLicence_(data) {
  var productId = data.product_id || getProp_('LICENSE_PRODUCT_ID', 'Google-Apps');
  var skuId = data.sku_id || getProp_('LICENSE_SKU_ID');
  if (!skuId) {
    throw new AppError_('NOT_CONFIGURED',
      "Aucun SKU de licence défini. Renseigner la propriété LICENSE_SKU_ID " +
      "(identifiant de l'édition, ex. Business Standard) ou passer 'sku_id' " +
      'dans le ticket. Voir admin_listerLicences() pour les SKU du domaine.', 500);
  }
  return { productId: productId, skuId: skuId };
}

/**
 * Appelle l'Enterprise License Manager API en REST.
 *
 * Utilise le jeton OAuth du script (droits d'administration du déployeur),
 * comme le transfert Drive : pas d'impersonation ici, c'est une opération
 * d'administration du domaine. Scope requis : apps.licensing.
 *
 * @param {string} methode 'GET' | 'POST' | 'PUT' | 'DELETE'.
 * @param {string} chemin Chemin après /apps/licensing/v1/.
 * @param {?Object} payload Corps de la requête (null si GET/DELETE).
 * @return {?Object} Réponse JSON, ou null si vide.
 * @throws {AppError_} En cas d'erreur API.
 */
function appelLicensingApi_(methode, chemin, payload) {
  var url = 'https://licensing.googleapis.com/apps/licensing/v1/' + chemin;
  var options = {
    method: methode,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var reponse = UrlFetchApp.fetch(url, options);
  var code = reponse.getResponseCode();

  if (code >= 400) {
    var message = '';
    try { message = JSON.parse(reponse.getContentText()).error.message; }
    catch (e) { message = reponse.getContentText(); }
    throw new AppError_('LICENSING_API_ERROR',
      'API Licences : ' + message, code >= 500 ? 502 : code);
  }

  if (code === 204 || !reponse.getContentText()) return null;
  return JSON.parse(reponse.getContentText());
}