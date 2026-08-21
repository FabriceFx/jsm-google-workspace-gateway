/**
 * ACCÈS GOOGLE WORKSPACE
 * -----------------------------------------------------------------------------
 * Briques réutilisables au-dessus de l'Admin SDK : lecture d'utilisateur,
 * appartenance à un groupe, génération et transmission des mots de passe.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
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
            // Groupe à appartenance calculée : ajout/retrait manuel impossible.
            motifs: ['DYNAMIC'],
            code: 'GROUPE_DYNAMIQUE', http: 400,
            message: "Ce groupe est un GROUPE DYNAMIQUE : ses membres sont " +
                "calculés automatiquement à partir d'une requête sur les attributs " +
                "des comptes. On ne peut donc PAS y ajouter ni retirer un membre " +
                "manuellement. Pour changer l'appartenance, ajuster les attributs " +
                "du compte (service, OU…) ou la règle du groupe dans la console " +
                'd\'administration.'
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
 * Indique si une erreur signale un GROUPE DYNAMIQUE (appartenance calculée par
 * une requête, non modifiable manuellement) ou système. Utilisé pour distinguer
 * ce cas d'un échec réel lors des retraits en masse ou ciblés.
 *
 * @param {!Error} err Erreur levée par l'Admin SDK.
 * @return {boolean}
 */
function estErreurGroupeDynamique_(err) {
    const m = String((err && err.message) || err).toUpperCase();
    return m.indexOf('CONDITION NOT MET') !== -1 ||
           m.indexOf('CONDITION_NOT_MET') !== -1 ||
           m.indexOf('PRECONDITION') !== -1 ||
           m.indexOf('DYNAMIC') !== -1 ||
           m.indexOf('CANNOT MUTATE') !== -1 ||
           m.indexOf('CANNOT_MUTATE') !== -1 ||
           m.indexOf('CANNOT MODIFY MEMBERS') !== -1 ||
           m.indexOf('CANNOT_MODIFY_MEMBERS') !== -1 ||
           m.indexOf('CANNOT BE UPDATED DIRECTLY') !== -1 ||
           m.indexOf('SYSTEM GROUP') !== -1 ||
           m.indexOf('SYSTEM_GROUP') !== -1 ||
           m.indexOf('MANAGED AUTOMATICALLY') !== -1 ||
           m.indexOf('INVALID MEMBER TYPE') !== -1 ||
           m.indexOf('INVALID_MEMBER_TYPE') !== -1;
}

/**
 * Récupère un utilisateur Workspace, ou null s'il n'existe pas.
 * Sert de brique d'idempotence : Jira Automation peut rejouer une requête
 * (timeout réseau, relance manuelle) sans qu'on doive créer un doublon.
 *
 * @param {string} email Adresse à rechercher.
 * @param {string=} projection 'full' pour inclure les schémas personnalisés
 *     (customSchemas), absents de la projection 'basic' par défaut. À utiliser
 *     avant toute fusion d'attributs de schéma, sous peine de les écraser.
 * @return {?Object} Ressource User de l'Admin SDK, ou null.
 */
function getUserOrNull_(email, projection) {
    try {
        return projection
            ? AdminDirectory.Users.get(email, { projection: projection })
            : AdminDirectory.Users.get(email);
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
 * Construit un patch de profil Admin SDK à partir des champs `data`, en
 * fusionnant avec l'utilisateur existant pour ne JAMAIS écraser un tableau
 * (Users.patch remplace un champ tableau en bloc).
 *
 * Source unique partagée par CREATION_COMPTE (existant = null) et
 * MISE_A_JOUR_PROFIL (existant = ressource lue) : les deux exposent ainsi
 * exactement le même jeu de champs de profil.
 *
 * Champs `data` reconnus (tous optionnels) :
 *   prenom, nom, intitule_poste, departement, societe, centre_cout,
 *   org_description, manager_email, telephone_pro (ou telephone), telephone_mobile,
 *   adresse, batiment, etage, bureau,
 *   email_recuperation (ou email_perso), tel_recuperation,
 *   visible_annuaire, custom_schemas (objet ou chaîne JSON).
 *
 * @param {!Object} data Données validées.
 * @param {?Object} existant Ressource User existante, ou null (création).
 * @return {!{patch: !Object, modifications: !Array<string>}}
 */
function construireProfilPatch_(data, existant) {
  existant = existant || {};
  var patch = {};
  var mods = [];

  // --- Nom ---
  if (data.prenom || data.nom) {
    var n = existant.name || {};
    patch.name = {
      givenName: data.prenom || n.givenName || '',
      familyName: data.nom || n.familyName || ''
    };
    mods.push('nom : ' + patch.name.givenName + ' ' + patch.name.familyName);
  }

  // --- Organisation principale : poste, service, société, centre de coûts ---
  if (data.intitule_poste || data.departement || data.societe ||
      data.centre_cout || data.org_description) {
    var orgs = (existant.organizations || []).map(function (o) {
      return Object.assign({}, o);
    });
    var principale = null;
    for (var i = 0; i < orgs.length; i++) {
      if (orgs[i].primary) { principale = orgs[i]; break; }
    }
    if (!principale) { principale = { primary: true }; orgs.push(principale); }
    if (data.intitule_poste) { principale.title = data.intitule_poste; mods.push('poste : ' + data.intitule_poste); }
    if (data.departement) { principale.department = data.departement; mods.push('service : ' + data.departement); }
    if (data.societe) { principale.name = data.societe; mods.push('société : ' + data.societe); }
    if (data.centre_cout) { principale.costCenter = data.centre_cout; mods.push('centre de coûts : ' + data.centre_cout); }
    if (data.org_description) { principale.description = data.org_description; mods.push('description : ' + data.org_description); }
    patch.organizations = orgs;
  }

  // --- Téléphones par type (sans effacer les autres numéros) ---
  var majTel = function (type, valeur, libelle) {
    if (!valeur) return;
    if (!patch.phones) {
      patch.phones = (existant.phones || []).map(function (p) { return Object.assign({}, p); });
    }
    patch.phones = patch.phones.filter(function (p) { return p.type !== type; });
    patch.phones.push({ value: String(valeur), type: type });
    mods.push(libelle + ' : ' + valeur);
  };
  majTel('work', data.telephone_pro || data.telephone, 'téléphone pro');
  majTel('mobile', data.telephone_mobile, 'mobile');

  // --- Manager (relation) ---
  if (data.manager_email) {
    var rel = (existant.relations || []).filter(function (r) { return r.type !== 'manager'; });
    rel.push({ value: data.manager_email, type: 'manager' });
    patch.relations = rel;
    mods.push('manager : ' + data.manager_email);
  }

  // --- Adresse professionnelle ---
  if (data.adresse) {
    var adr = (existant.addresses || []).filter(function (a) { return a.type !== 'work'; });
    adr.push({ type: 'work', formatted: String(data.adresse) });
    patch.addresses = adr;
    mods.push('adresse');
  }

  // --- Localisation (poste de travail) ---
  if (data.batiment || data.etage || data.bureau) {
    var loc = (existant.locations || []).filter(function (l) { return l.type !== 'desk'; });
    var desk = { type: 'desk', area: 'desk' };
    if (data.batiment) desk.buildingId = String(data.batiment);
    if (data.etage) desk.floorName = String(data.etage);
    if (data.bureau) desk.deskCode = String(data.bureau);
    loc.push(desk);
    patch.locations = loc;
    mods.push('localisation bureau');
  }

  // --- Informations de récupération ---
  var recup = data.email_recuperation || data.email_perso;
  if (recup) { patch.recoveryEmail = recup; mods.push('e-mail de récupération'); }
  if (data.tel_recuperation) { patch.recoveryPhone = String(data.tel_recuperation); mods.push('téléphone de récupération'); }

  // --- Visibilité dans l'annuaire global ---
  if (data.visible_annuaire !== undefined && data.visible_annuaire !== '') {
    patch.includeInGlobalAddressList = boolDeFormulaire_(data.visible_annuaire, true);
    mods.push('visible dans l\'annuaire : ' + patch.includeInGlobalAddressList);
  }

  // --- Schémas personnalisés (RH, Atlassian, Lumapps…) ---
  // Deux entrées possibles, combinées : un objet/chaîne JSON `custom_schemas`,
  // et des champs plats mappés (MAPPING_SCHEMAS_PERSO). Fusion au niveau champ
  // avec l'existant pour ne pas effacer les autres attributs d'un même schéma.
  var fournis = {};
  var ajouterAttribut = function (schema, champ, valeur) {
    fournis[schema] = fournis[schema] || {};
    fournis[schema][champ] = valeur;
  };

  if (data.custom_schemas) {
    var parsed;
    try {
      parsed = (typeof data.custom_schemas === 'string')
        ? JSON.parse(data.custom_schemas) : data.custom_schemas;
    } catch (e) {
      throw new AppError_('INVALID_SCHEMA',
        "Le champ 'custom_schemas' n'est pas un JSON valide : " + e.message);
    }
    if (parsed && typeof parsed === 'object') {
      Object.keys(parsed).forEach(function (schema) {
        Object.keys(parsed[schema] || {}).forEach(function (champ) {
          ajouterAttribut(schema, champ, parsed[schema][champ]);
        });
      });
    }
  }

  // Champs plats → schéma/attribut (Matricule, Statut, accès Atlassian…).
  Object.keys(MAPPING_SCHEMAS_PERSO).forEach(function (cle) {
    var v = data[cle];
    if (v === undefined || v === null || v === '') return;
    var m = MAPPING_SCHEMAS_PERSO[cle];
    var valeur;
    if (m.type === 'number') {
      valeur = Number(v);
      if (isNaN(valeur)) {
        throw new AppError_('INVALID_SCHEMA',
          "Le champ '" + cle + "' doit être numérique (reçu : " + v + ').');
      }
    } else if (m.type === 'bool') {
      valeur = boolDeFormulaire_(v, false);
    } else {
      valeur = String(v);
    }
    ajouterAttribut(m.schema, m.champ, valeur);
  });

  if (Object.keys(fournis).length) {
    var existSchemas = existant.customSchemas || {};
    var fusion = {};
    Object.keys(fournis).forEach(function (schema) {
      fusion[schema] = Object.assign({}, existSchemas[schema] || {}, fournis[schema]);
    });
    patch.customSchemas = fusion;
    mods.push('attributs personnalisés : ' + Object.keys(fournis).join(', '));
  }

  return { patch: patch, modifications: mods };
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
function requireUser_(email, libelle, projection) {
    const utilisateur = getUserOrNull_(email, projection);
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
 * Liste les appareils mobiles enregistrés pour un utilisateur via AdminDirectory.Mobiledevices.
 * @param {string} email Adresse de l'utilisateur.
 * @return {!Array<!Object>} Liste des appareils (peut être vide).
 */
function listerAppareilsUtilisateur_(email) {
  const emailPropre = String(email || '').toLowerCase().trim();
  const appareils = [];
  let pageToken = null;

  // 1. Recherche directe via Admin Directory Mobiledevices avec projection: 'FULL'
  try {
    do {
      const options = {
        query: 'email:' + emailPropre,
        projection: 'FULL',
        maxResults: 100
      };
      if (pageToken) options.pageToken = pageToken;
      const reponse = AdminDirectory.Mobiledevices.list('my_customer', options);
      if (reponse.mobiledevices) {
        reponse.mobiledevices.forEach(function (d) {
          d.source = 'Admin Directory MDM';
          appareils.push(d);
        });
      }
      pageToken = reponse.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.warn('Erreur lors de la recherche des appareils mobiles pour ' + emailPropre + ' : ' + err.message);
  }

  // 2. Si aucun résultat, tentative élargie par préfixe utilisateur
  if (appareils.length === 0 && emailPropre.indexOf('@') !== -1) {
    const userPart = emailPropre.split('@')[0];
    try {
      pageToken = null;
      do {
        const options = {
          query: 'email:' + userPart + '*',
          projection: 'FULL',
          maxResults: 100
        };
        if (pageToken) options.pageToken = pageToken;
        const reponse = AdminDirectory.Mobiledevices.list('my_customer', options);
        if (reponse.mobiledevices) {
          reponse.mobiledevices.forEach(function (d) {
            const emailsApp = (d.email || []).map(function (e) { return String(e).toLowerCase().trim(); });
            if (emailsApp.indexOf(emailPropre) !== -1 || emailsApp.some(function (e) { return e.indexOf(userPart) === 0; })) {
              if (!appareils.some(function (exist) { return exist.resourceId === d.resourceId; })) {
                d.source = 'Admin Directory MDM';
                appareils.push(d);
              }
            }
          });
        }
        pageToken = reponse.nextPageToken;
      } while (pageToken);
    } catch (err) {
      console.warn('Erreur lors du repli de recherche mobile pour ' + userPart + ' : ' + err.message);
    }
  }

  // 3. Si toujours aucun résultat, parcours direct du parc mobile global (sans query) avec filtrage local
  if (appareils.length === 0) {
    try {
      pageToken = null;
      let pages = 0;
      const userPrefix = emailPropre.split('@')[0];
      do {
        const options = { projection: 'FULL', maxResults: 100 };
        if (pageToken) options.pageToken = pageToken;
        const reponse = AdminDirectory.Mobiledevices.list('my_customer', options);
        if (reponse.mobiledevices) {
          reponse.mobiledevices.forEach(function (d) {
            const emailsApp = (d.email || []).map(function (e) { return String(e).toLowerCase().trim(); });
            const nomsApp = (d.name || []).map(function (n) { return String(n).toLowerCase().trim(); });
            const emailMatch = emailsApp.indexOf(emailPropre) !== -1 || emailsApp.some(function (e) { return e.indexOf(userPrefix) === 0; });
            const nomMatch = nomsApp.some(function (n) { return n.indexOf(userPrefix) !== -1; });
            if (emailMatch || nomMatch) {
              if (!appareils.some(function (exist) { return exist.resourceId === d.resourceId; })) {
                d.source = 'Admin Directory MDM (Scan parc)';
                appareils.push(d);
              }
            }
          });
        }
        pageToken = reponse.nextPageToken;
        pages++;
      } while (pageToken && pages < 10 && appareils.length === 0);
    } catch (err) {
      console.warn('Erreur lors du scan global des appareils mobiles : ' + err.message);
    }
  }

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
//  SUGGESTIONS — valeurs distinctes tirées de l'annuaire (pour datalists)
// ---------------------------------------------------------------------------

/**
 * Sources de suggestions autorisées : où lire les valeurs distinctes dans la
 * ressource User. Volontairement une liste blanche (le client ne peut demander
 * qu'une clé connue). Les clés correspondent à celles de LISTES côté console.
 * @const
 */
const SOURCES_SUGGESTIONS = Object.freeze({
  societe:               { champ: 'organizations', sous: 'name' },
  departement:           { champ: 'organizations', sous: 'department' },
  centre_cout:           { champ: 'organizations', sous: 'costCenter' },
  org_description:       { champ: 'organizations', sous: 'description' },
  statut:                { schema: 'Ressources_humaines', attr: 'Statut' },
  cse:                   { schema: 'Ressources_humaines', attr: 'CSE' },
  fonction_transversale: { schema: 'Ressources_humaines', attr: 'Fonction_transversale' }
});

/** Nb max de pages (500 comptes/page) parcourues pour construire une suggestion. */
const SUGGESTIONS_MAX_PAGES = 20;

/**
 * Extrait la ou les valeurs d'un champ d'un utilisateur selon la définition.
 * @param {!Object} user Ressource User (projection full).
 * @param {!Object} def Entrée de SOURCES_SUGGESTIONS.
 * @return {!Array<*>}
 */
function extraireValeursUser_(user, def) {
  if (def.champ === 'organizations') {
    return (user.organizations || []).map(function (o) { return o[def.sous]; });
  }
  if (def.schema) {
    var s = (user.customSchemas || {})[def.schema] || {};
    return [s[def.attr]];
  }
  return [];
}

/**
 * Construit, en UNE seule énumération de l'annuaire, les valeurs distinctes de
 * TOUTES les sources de suggestions à la fois. L'agrégat est MIS EN CACHE 6 h :
 * on évite ainsi 6 parcours concurrents au chargement d'un formulaire.
 *
 * ⚠️ Reflète les données telles quelles (variantes/fautes de saisie comprises) :
 * c'est une aide, pas un référentiel. Borné à SUGGESTIONS_MAX_PAGES pages.
 *
 * @return {!Object<string, !Array<!{val: string, txt: string}>>} clé → options.
 */
function construireToutesSuggestions_() {
  var cache = CacheService.getScriptCache();
  var enCache = cache.get('sugg_all');
  if (enCache) return JSON.parse(enCache);

  var cles = Object.keys(SOURCES_SUGGESTIONS);
  var sets = {};
  cles.forEach(function (c) { sets[c] = {}; });

  var pageToken = null;
  var pages = 0;
  do {
    var opt = {
      customer: 'my_customer', maxResults: 500,
      projection: 'full', viewType: 'admin_view'
    };
    if (pageToken) opt.pageToken = pageToken;
    var rep = AdminDirectory.Users.list(opt);
    (rep.users || []).forEach(function (u) {
      cles.forEach(function (c) {
        extraireValeursUser_(u, SOURCES_SUGGESTIONS[c]).forEach(function (v) {
          if (v !== null && v !== undefined && String(v).trim() !== '') {
            sets[c][String(v)] = true;
          }
        });
      });
    });
    pageToken = rep.nextPageToken;
    pages++;
  } while (pageToken && pages < SUGGESTIONS_MAX_PAGES);

  var resultat = {};
  cles.forEach(function (c) {
    resultat[c] = Object.keys(sets[c]).sort().map(function (v) {
      return { val: v, txt: v };
    });
  });
  cache.put('sugg_all', JSON.stringify(resultat), 21600);  // 6 h (max CacheService)
  return resultat;
}

/**
 * Suggestions distinctes pour une clé (compat getOptionsUI('suggest:cle')).
 * S'appuie sur l'agrégat partagé (une seule énumération).
 * @param {string} cle Clé de SOURCES_SUGGESTIONS.
 * @return {!Array<!{val: string, txt: string}>}
 */
function suggestionsAnnuaire_(cle) {
  if (!SOURCES_SUGGESTIONS[cle]) return [];
  return construireToutesSuggestions_()[cle] || [];
}

/** Vide le cache des suggestions (à appeler après un nettoyage de données). */
function viderCacheSuggestions_() {
  CacheService.getScriptCache().remove('sugg_all');
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