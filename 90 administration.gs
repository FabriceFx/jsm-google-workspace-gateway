/**
 * PILOTAGE MANUEL
 * -----------------------------------------------------------------------------
 * Fonctions à exécuter depuis l'éditeur Apps Script pour installer,
 * diagnostiquer et piloter la file d'attente.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Génère un SECRET_TOKEN aléatoire et l'enregistre dans les propriétés.
 * À exécuter UNE FOIS à l'installation, puis recopier la valeur affichée
 * dans le webhook Jira. Refuse d'écraser un token existant.
 */
function setup_genererToken() {
    assertAdminUI_();
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('SECRET_TOKEN')) {
        console.log('Un SECRET_TOKEN existe déjà. Le supprimer manuellement pour ' +
            'en générer un nouveau (pensez à mettre Jira à jour).');
        return;
    }
    const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('SECRET_TOKEN', token);
    // On NE journalise JAMAIS le token : avec exceptionLogging STACKDRIVER, il
    // serait persisté en clair dans Cloud Logging. On le lit dans les Propriétés.
    console.log('SECRET_TOKEN généré (' + token.length + ' caractères) et enregistré. ' +
        'Le copier dans Jira depuis : Paramètres du projet → Propriétés du script ' +
        '→ SECRET_TOKEN. (Non affiché ici pour ne pas le journaliser.)');
}

/**
 * Vérifie que la configuration est complète et que l'Admin SDK répond.
 * Retourne un diagnostic dans les logs d'exécution.
 */
function setup_verifierConfiguration() {
    assertAdminUI_();
    const rapport = [];
    const token = getProp_('SECRET_TOKEN');

    rapport.push('SECRET_TOKEN      : ' +
        (token ? 'OK (' + token.length + ' caractères)' : 'MANQUANT'));
    rapport.push('AUDIT_SHEET_ID    : ' + (getProp_('AUDIT_SHEET_ID') || 'non configuré'));
    rapport.push('NOTIFY_EMAIL      : ' + (getProp_('NOTIFY_EMAIL') || 'non configuré'));
    rapport.push('ALLOWED_DOMAINS   : ' + (getProp_('ALLOWED_DOMAINS') || 'aucun filtre'));
    rapport.push('DEFAULT_OU        : ' + getProp_('DEFAULT_OU', '/'));
    const saEmail = getProp_('SERVICE_ACCOUNT_EMAIL');
    const saKey = getProp_('SERVICE_ACCOUNT_KEY');
    rapport.push('Compte de service : ' +
        (saEmail && saKey ? 'OK (' + saEmail + ')' : 'Non configuré (requis pour actions Gmail)'));

    try {
        const domaine = AdminDirectory.Users.list({ customer: 'my_customer', maxResults: 1 });
        rapport.push('Admin SDK         : OK (' +
            (domaine.users ? domaine.users.length : 0) + ' utilisateur test lu)');
    } catch (err) {
        rapport.push('Admin SDK         : ERREUR — ' + err.message +
            '\n  → Activer le service avancé "Admin SDK API" et vérifier les droits.');
    }

    rapport.push('Quota e-mail restant : ' + MailApp.getRemainingDailyQuota());
    rapport.push('Fuseau du projet   : ' + Session.getScriptTimeZone());
    rapport.push('Jours fériés       : ' +
        (respecteJoursFeries_() ? 'pris en compte' : 'ignorés'));

    const declencheurs = ScriptApp.getProjectTriggers().filter(function (t) {
        return t.getHandlerFunction() === 'traiterFileAttente';
    });
    rapport.push('Déclencheur file   : ' +
        (declencheurs.length ? 'OK (' + declencheurs.length + ')'
            : 'ABSENT — exécuter setup_installerDeclencheur()'));

    const maintenant = new Date();
    const planning = resoudrePlanning_('STANDARD', { fenetre: 'STANDARD' });
    rapport.push('Créneau actuel     : ' +
        (estOuvert_(maintenant, planning) ? 'OUVERT'
            : 'FERMÉ — prochaine ouverture ' +
            formaterDate_(prochaineOuverture_(maintenant, planning))));
    rapport.push('Demandes en attente : ' + compterEnAttente_());

    rapport.push('Actions déclarées :');
    listerActions_().forEach(function (nom) {
        rapport.push('  - ' + nom + ' [' + (getSpec_(nom).fenetre || 'STANDARD') + ']');
    });

    console.log(rapport.join('\n'));
}

/**
 * Installe (ou réinstalle) le déclencheur temporel qui vide la file d'attente.
 * À exécuter une fois après le déploiement, et après toute modification de
 * CONFIG.INTERVALLE_DECLENCHEUR_MIN.
 */
function setup_installerDeclencheur() {
    assertAdminUI_();
    ScriptApp.getProjectTriggers().forEach(function (t) {
        if (t.getHandlerFunction() === 'traiterFileAttente') {
            ScriptApp.deleteTrigger(t);
        }
    });
    ScriptApp.newTrigger('traiterFileAttente')
        .timeBased()
        .everyMinutes(CONFIG.INTERVALLE_DECLENCHEUR_MIN)
        .create();
    console.log('Déclencheur installé : traiterFileAttente toutes les ' +
        CONFIG.INTERVALLE_DECLENCHEUR_MIN + ' minutes.');
}

/**
 * Affiche les chemins d'unités organisationnelles réellement disponibles.
 *
 * À exécuter avant de renseigner DEFAULT_OU ou le champ
 * `unite_organisationnelle` d'un formulaire Jira : les chemins sont sensibles
 * à la casse et aux accents, et une valeur inexacte fait échouer la création
 * de compte avec INVALID_OU_ID.
 */
function admin_listerUnitesOrganisationnelles() {
    assertAdminUI_();
    try {
        const reponse = AdminDirectory.Orgunits.list('my_customer', { type: 'all' });
        const unites = reponse.organizationUnits || [];

        if (!unites.length) {
            console.log("Aucune unité organisationnelle : seule '/' est utilisable.");
            return;
        }
        const chemins = unites.map(function (ou) { return ou.orgUnitPath; }).sort();
        console.log(['Unités organisationnelles disponibles :', '  /']
            .concat(chemins.map(function (c) { return '  ' + c; })).join('\n'));

    } catch (err) {
        console.error("Lecture impossible : " + err.message +
            "\n  → Vérifier que la portée admin.directory.orgunit.readonly est " +
            'autorisée (réautoriser le script après mise à jour du manifeste).');
    }
}

/**
 * Contrôle que le logo configuré est réellement exploitable dans un e-mail.
 *
 * Vérifie l'accessibilité anonyme, le type MIME et le nom de fichier. Gmail ne
 * charge pas les images directement : il les relaie par son proxy
 * googleusercontent, qui exige une lecture publique et un type MIME correct.
 */
function admin_verifierLogo() {
    assertAdminUI_();
    const brut = getProp_('LOGO_URL').trim().replace(/^["'<]+|["'>]+$/g, '');
    const url = getLogoUrl_();
    const rapport = [];

    if (!url) {
        console.log("LOGO_URL n'est pas renseigné : l'en-tête affiche « Cooperl » " +
            'en toutes lettres.');
        return;
    }
    rapport.push('Valeur enregistrée : ' + brut);
    if (brut !== url) {
        rapport.push('URL utilisée       : ' + url);
        rapport.push('  → Le chemin a été ré-encodé automatiquement. La valeur ' +
            "enregistrée n'était pas utilisable telle quelle dans une balise <img> : " +
            "c'est la cause la plus fréquente d'un logo absent dans Gmail.");
    }
    rapport.push('Variante  : logo ' + getLogoVariante_().toLowerCase() +
        ' → en-tête ' + (getLogoVariante_() === 'BLEU' ? 'blanc' : 'bleu Cooperl'));

    // Caractères qui fragilisent le relais d'images de Gmail.
    const nom = decodeURIComponent(brut.split('/').pop().split('?')[0]);
    const gene = [];
    if (/\s/.test(nom)) gene.push('espaces');
    if (nom.indexOf('+') !== -1) gene.push("signe « + »");
    if (/[^\w.\-]/.test(nom.replace(/\s/g, ''))) gene.push('caractères spéciaux');
    rapport.push('Nom       : ' + (gene.length
        ? 'contient ' + gene.join(', ') + '. L\'encodage compense, mais renommer ' +
        "l'objet en cooperl-logo-blanc.png reste la solution fiable."
        : 'OK'));

    // Accès anonyme : muteHttpExceptions pour lire le code plutôt que lever.
    try {
        const rep = UrlFetchApp.fetch(url, {
            muteHttpExceptions: true,
            followRedirects: true
        });
        const code = rep.getResponseCode();
        const type = rep.getHeaders()['Content-Type'] ||
            rep.getHeaders()['content-type'] || 'inconnu';
        const poids = rep.getContent().length;

        rapport.push('Réponse   : HTTP ' + code +
            (code === 200 ? ' — accessible'
                : code === 403 ? " — ACCÈS REFUSÉ. Rendre l'objet lisible par " +
                    "'allUsers' dans Cloud Storage."
                    : code === 404 ? ' — INTROUVABLE. Vérifier le chemin exact.'
                        : ' — réponse inattendue.'));

        if (code === 200) {
            rapport.push('Type MIME : ' + type +
                (type.indexOf('image/') === 0 ? ' — OK'
                    : ' — INCORRECT. Corriger les métadonnées de l\'objet : un type ' +
                    'autre qu\'image/* est refusé par le relais Gmail.'));
            rapport.push('Poids     : ' + Math.round(poids / 1024) + ' Ko' +
                (poids > 200000 ? ' — lourd, viser moins de 100 Ko.' : ''));
        }
    } catch (err) {
        rapport.push('Réponse   : échec de la requête — ' + err.message);
    }

    rapport.push('');
    rapport.push('Rappel : si le logo hébergé est bleu, positionner la propriété ' +
        'LOGO_VARIANTE sur BLEU (la charte interdit le logo bleu sur fond coloré).');
    console.log(rapport.join('\n'));
}

/**
 * Produit une signature e-mail chartée, à coller dans Gmail.
 *
 * Adapter les coordonnées ci-dessous puis exécuter : le HTML s'affiche dans
 * les logs. Le coller dans Gmail > Paramètres > Signature en mode HTML
 * (ou l'ouvrir dans un navigateur, tout sélectionner, puis copier-coller).
 */
function admin_genererSignatureEmail() {
    assertAdminUI_();
    const signature = signatureEmailHtml_({
        nom: 'Prénom Nom',
        fonction: 'Intitulé du poste',
        entite: 'Cooperl Nutrition',
        telephone: '+33 2 96 30 70 00',
        mobile: '+33 6 00 00 00 00',
        email: 'prenom.nom@cooperl.com'
    });
    console.log(signature);
}

/**
 * Affiche les licences (SKU) souscrites par le domaine et leur usage.
 *
 * À exécuter avant de renseigner LICENSE_SKU_ID : le SKU identifie l'édition
 * exacte (Business Starter/Standard/Plus…) et conditionne les actions
 * ATTRIBUTION_LICENCE / RETRAIT_LICENCE.
 */
function admin_listerLicences() {
    assertAdminUI_();
    var productId = getProp_('LICENSE_PRODUCT_ID', 'Google-Apps');

    // L'API Licensing exige un customerId explicite (domaine principal ou ID
    // client) : l'alias 'my_customer' de l'Admin SDK n'y est pas reconnu. On le
    // prend dans LICENSE_CUSTOMER_ID, sinon dans le 1er ALLOWED_DOMAINS.
    var customerId = getProp_('LICENSE_CUSTOMER_ID');
    if (!customerId) {
        customerId = getProp_('ALLOWED_DOMAINS').split(',')
            .map(function (d) { return d.trim(); }).filter(Boolean)[0] || '';
    }
    if (!customerId) {
        console.log('Impossible de lister les licences : renseigner LICENSE_CUSTOMER_ID ' +
            '(domaine principal du client, ex. cooperl.com) ou ALLOWED_DOMAINS.');
        return;
    }

    try {
        var reponse = appelLicensingApi_('GET',
            'product/' + encodeURIComponent(productId) + '/users' +
            '?customerId=' + encodeURIComponent(customerId) + '&maxResults=100', null);
        // L'endpoint listForProduct liste les assignations ; le champ skuId y figure.
        var skus = {};
        (reponse && reponse.items || []).forEach(function (a) {
            skus[a.skuId] = (skus[a.skuId] || 0) + 1;
        });
        var lignes = ['Produit : ' + productId + ' — client : ' + customerId,
            'SKU rencontrés (échantillon des 100 premières assignations) :'];
        Object.keys(skus).forEach(function (s) {
            lignes.push('  - ' + s + ' (' + skus[s] + ' assignation(s) vues)');
        });
        if (!Object.keys(skus).length) {
            lignes.push('  (aucune assignation lue — vérifier le scope apps.licensing, ' +
                'le productId et le customerId)');
        }
        lignes.push('\nRenseigner LICENSE_SKU_ID avec le SKU de l\'édition à gérer.');
        console.log(lignes.join('\n'));
    } catch (err) {
        console.error('Lecture des licences impossible : ' + err.message +
            '\n  → Vérifier le scope apps.licensing (réautoriser après mise à jour ' +
            'du manifeste), le customerId et les droits d\'administration.');
    }
}

/**
 * Smoke test des API en LECTURE SEULE : vérifie que chaque famille d'API
 * répond réellement (Directory, Gmail impersoné, Licensing, Data Transfer),
 * sans rien modifier. À lancer avant la mise en service.
 *
 * ✅ = appel réussi, ❌ = échec (message affiché), ⚠️ = non testé (config absente).
 */
function admin_verifierApis() {
    assertAdminUI_();
    var moi = Session.getEffectiveUser().getEmail();
    var lignes = ['Smoke test des API (lecture seule) :', ''];

    // 1-3. Admin SDK Directory
    lignes.push(testerApi_('Directory / utilisateurs', function () {
        var r = AdminDirectory.Users.list({ customer: 'my_customer', maxResults: 1 });
        return (r.users ? r.users.length : 0) + ' lu(s)';
    }));
    lignes.push(testerApi_('Directory / unités org.', function () {
        var r = AdminDirectory.Orgunits.list('my_customer', { type: 'all' });
        return ((r.organizationUnits || []).length) + ' OU';
    }));
    lignes.push(testerApi_('Directory / appareils', function () {
        AdminDirectory.Mobiledevices.list('my_customer', { maxResults: 1 });
        return 'accessible';
    }));
    lignes.push(testerApi_('Directory / bâtiments', function () {
        var r = AdminDirectory.Resources.Buildings.list('my_customer');
        return ((r.buildings || []).length) + ' bâtiment(s) — liste déroulante OK';
    }));

    // 4. Gmail (compte de service + délégation de domaine)
    if (!getProp_('SERVICE_ACCOUNT_EMAIL') || !getProp_('SERVICE_ACCOUNT_KEY')) {
        lignes.push('  ⚠️ Gmail (compte de service) — NON CONFIGURÉ ' +
            '(actions Gmail indisponibles tant que SERVICE_ACCOUNT_* est absent)');
    } else if (!moi) {
        lignes.push('  ⚠️ Gmail — IGNORÉ (adresse administrateur indisponible)');
    } else {
        lignes.push(testerApi_('Gmail (impersonation)', function () {
            appelGmailApi_(moi, 'settings/vacation', 'GET', null,
                'https://www.googleapis.com/auth/gmail.settings.basic');
            return 'jeton + lecture des réglages OK (' + moi + ')';
        }));
    }

    // 5. Licensing
    var custId = getProp_('LICENSE_CUSTOMER_ID') ||
        (getProp_('ALLOWED_DOMAINS').split(',')
            .map(function (d) { return d.trim(); }).filter(Boolean)[0] || '');
    if (!custId) {
        lignes.push('  ⚠️ Licensing — IGNORÉ (renseigner LICENSE_CUSTOMER_ID ou ALLOWED_DOMAINS)');
    } else {
        var prod = getProp_('LICENSE_PRODUCT_ID', 'Google-Apps');
        lignes.push(testerApi_('Licensing', function () {
            appelLicensingApi_('GET', 'product/' + encodeURIComponent(prod) +
                '/users?customerId=' + encodeURIComponent(custId) + '&maxResults=1', null);
            return 'accessible (' + prod + ' / ' + custId + ')';
        }));
    }

    // 6. Data Transfer (Drive)
    lignes.push(testerApi_('Data Transfer', function () {
        var rep = UrlFetchApp.fetch(
            'https://admin.googleapis.com/admin/datatransfer/v1/transfers?maxResults=1',
            {
                headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
                muteHttpExceptions: true
            });
        var code = rep.getResponseCode();
        if (code >= 400) {
            var msg = '';
            try { msg = JSON.parse(rep.getContentText()).error.message; }
            catch (e) { msg = rep.getContentText(); }
            throw new Error('HTTP ' + code + ' — ' + msg);
        }
        return 'accessible';
    }));

    // 7. Google Drive & Drives partagés
    lignes.push(testerApi_('Drive / Drives partagés', function () {
        if (typeof Drive !== 'undefined' && Drive.Drives && typeof Drive.Drives.list === 'function') {
            try {
                var rAdv = Drive.Drives.list({ pageSize: 1, useDomainAdminAccess: true });
                return 'accessible via service avancé (' + ((rAdv.drives || []).length) + ' drive(s) lu(s))';
            } catch (eAdv) {
                // Essai sans useDomainAdminAccess si le compte n'a pas les droits Drive admin globaux
                var rAdv2 = Drive.Drives.list({ pageSize: 1 });
                return 'accessible en membre direct (' + ((rAdv2.drives || []).length) + ' drive(s) lu(s))';
            }
        }
        var rep = UrlFetchApp.fetch(
            'https://www.googleapis.com/drive/v3/drives?pageSize=1&useDomainAdminAccess=true',
            {
                headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
                muteHttpExceptions: true
            });
        var code = rep.getResponseCode();
        if (code >= 400) {
            var msg = '';
            try { msg = JSON.parse(rep.getContentText()).error.message; }
            catch (e) { msg = rep.getContentText(); }
            if (code === 403) {
                throw new Error('HTTP 403 — Activer l\'API Google Drive sur le projet GCP 507613315199 : https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=507613315199');
            }
            throw new Error('HTTP ' + code + ' — ' + msg);
        }
        var data = JSON.parse(rep.getContentText());
        return 'accessible via REST (' + (data.drives || []).length + ' drive(s) lu(s))';
    }));

    // 8. Google Calendar / Ressources
    lignes.push(testerApi_('Calendar / Ressources', function () {
        var r = AdminDirectory.Resources.Calendars.list('my_customer', { maxResults: 1 });
        return 'accessible (' + ((r.items || []).length) + ' ressource(s) lue(s))';
    }));

    lignes.push('', 'Rappel : ce test ne modifie rien. Les ❌ indiquent un scope non ' +
        'autorisé (réautoriser après mise à jour du manifeste) ou un droit manquant.');
    console.log(lignes.join('\n'));
}

/**
 * Exécute un test d'API et retourne une ligne de rapport formatée.
 * @param {string} nom Nom de la famille d'API.
 * @param {function():string} fn Appel de test (retourne un détail lisible).
 * @return {string}
 */
function testerApi_(nom, fn) {
    try {
        return '  ✅ ' + nom + ' — ' + fn();
    } catch (err) {
        return '  ❌ ' + nom + ' — ' + ((err && err.message) || err);
    }
}

/**
 * Vide le cache des suggestions (listes déroulantes à autocomplétion de la
 * console). À exécuter après un nettoyage des données de l'annuaire pour que
 * les nouvelles valeurs (ou la disparition des anciennes) soient prises en
 * compte sans attendre l'expiration automatique (6 h).
 */
function admin_viderCacheSuggestions() {
    assertAdminUI_();
    viderCacheSuggestions_();
    console.log('Cache des suggestions vidé. Il sera reconstruit au prochain ' +
        'chargement d\'un formulaire concerné.');
}

/** Affiche dans les logs les demandes actuellement en attente. */
function admin_listerFileAttente() {
    assertAdminUI_();
    const sheet = getQueueSheet_();
    if (!sheet) { console.log('Classeur d\'audit non configuré.'); return; }

    const lignes = sheet.getDataRange().getValues().filter(function (r, i) {
        return i > 0 && r[COL.STATUT] === CONFIG.STATUTS.EN_ATTENTE;
    });
    if (!lignes.length) { console.log('Aucune demande en attente.'); return; }

    console.log(lignes.map(function (r) {
        return r[COL.REQUEST_ID] + ' | ' + r[COL.ACTION] + ' | ' + r[COL.CIBLE] +
            ' | prévu ' + formaterDate_(r[COL.PREVU] instanceof Date ? r[COL.PREVU] : null);
    }).join('\n'));
}

/**
 * Annule une demande en attente (elle ne sera jamais exécutée).
 * @param {string} requestId Identifiant de la demande.
 */
function admin_annulerAction(requestId) {
    assertAdminUI_();
    const sheet = getQueueSheet_();
    const cible = sheet && trouverLigne_(sheet, requestId, CONFIG.STATUTS.EN_ATTENTE);
    if (!cible) { console.log('Aucune demande en attente pour ' + requestId); return; }

    majLigne_(sheet, cible.index, CONFIG.STATUTS.ANNULE,
        'Annulée manuellement', cible.row, new Date());
    console.log('Demande ' + requestId + ' annulée.');
}

/**
 * Force l'exécution immédiate d'une demande en attente, hors créneau.
 * À réserver aux urgences : l'opération est tracée dans le journal d'audit.
 * @param {string} requestId Identifiant de la demande.
 */
function admin_forcerExecution(requestId) {
    assertAdminUI_();
    const sheet = getQueueSheet_();
    const cible = sheet && trouverLigne_(sheet, requestId, CONFIG.STATUTS.EN_ATTENTE);
    if (!cible) { console.log('Aucune demande en attente pour ' + requestId); return; }

    const row = cible.row;
    const spec = getSpec_(String(row[COL.ACTION]));
    if (!spec) { console.log('Action inconnue : ' + row[COL.ACTION]); return; }

    const ctx = {
        ticketKey: String(row[COL.TICKET]),
        requestId: String(row[COL.REQUEST_ID]),
        action: String(row[COL.ACTION]),
        traceId: Utilities.getUuid().slice(0, 8),
        derogation: 'Forçage manuel depuis l\'éditeur Apps Script'
    };

    try {
        const result = appelerHandler_(spec, JSON.parse(row[COL.DATA]), ctx);
        majLigne_(sheet, cible.index, CONFIG.STATUTS.TERMINE,
            'Forcé manuellement — ' + result.message, row, new Date(),
            Number(row[COL.TENTATIVES] || 0) + 1);
        audit_(ctx, 'SUCCESS_FORCE', result.target || '', result.message, 0);
        console.log(result.message);
    } catch (err) {
        console.error('Échec du forçage : ' + err.message);
    }
}

/**
 * Affiche les informations du projet et du développeur.
 *
 * Équivalent d'un menu « À propos » pour un projet déclenché par webhook :
 * à exécuter depuis l'éditeur Apps Script.
 */
function admin_aPropos() {
    const lignes = [
        '══════════════════════════════════════════════════════════',
        '  Passerelle Jira Service Management → Google Workspace',
        '  Version ' + CONFIG.VERSION,
        '══════════════════════════════════════════════════════════',
        '',
        'Automatise les opérations d\'administration Google Workspace',
        'déclenchées par les formulaires Jira Service Management :',
        'création de compte, gestion de groupes, suspension,',
        'réactivation, réinitialisation de mot de passe.',
        '',
        'Actions disponibles : ' + listerActions_().join(', '),
        '',
        '──────────────────────────────────────────────────────────',
        '  Développé par Fabrice Faucheux',
        '  https://faucheux.bzh',
        '──────────────────────────────────────────────────────────',
        '',
        'Licence MIT — voir le fichier LICENSE pour les détails.'
    ];
    console.log(lignes.join('\n'));
}

/**
 * Diagnostic direct des terminaux mobiles et synchronisations dans l'annuaire Google.
 * À exécuter depuis l'éditeur Apps Script pour inspecter le retour brut des APIs Google.
 *
 * @param {string=} emailTest Adresse e-mail à inspecter (optionnel).
 */
function setup_diagnostiquerMobile(emailTest) {
    assertAdminUI_();
    const email = emailTest || Session.getActiveUser().getEmail();
    console.log('════ DIAGNOSTIC MOBILE POUR : ' + email + ' ════');

    // 1. Test AdminDirectory.Mobiledevices.list brut
    try {
        console.log('--- 1. Appel AdminDirectory.Mobiledevices.list (recherche globale) ---');
        const repGlobale = AdminDirectory.Mobiledevices.list('my_customer', {
            projection: 'FULL',
            maxResults: 10
        });
        const total = (repGlobale.mobiledevices || []).length;
        console.log('Nombre de mobiles trouvés sur la 1ère page globale : ' + total);
        if (total > 0) {
            console.log('Exemple de mobile brut dans l\'annuaire : ', JSON.stringify(repGlobale.mobiledevices[0]));
        }
    } catch (err) {
        console.error('Erreur AdminDirectory.Mobiledevices.list : ' + err.message);
    }

    // 2. Test recherche spécifique par email
    try {
        console.log('--- 2. Appel listerAppareilsUtilisateur_ pour ' + email + ' ---');
        const appareils = listerAppareilsUtilisateur_(email);
        console.log('Appareils retournés pour ' + email + ' : ' + appareils.length);
        appareils.forEach(function (app, idx) {
            console.log('Appareil #' + (idx + 1) + ' : ' +
                (app.model || app.type) + ' | ' + app.os + ' | Statut: ' + app.status +
                ' | lastSync: ' + app.lastSync + ' | firstSync: ' + app.firstSync + ' | Source: ' + app.source);
        });
    } catch (err) {
        console.error('Erreur listerAppareilsUtilisateur_ : ' + err.message);
    }

    // 3. Test des jetons OAuth mobiles
    try {
        console.log('--- 3. Appel AdminDirectory.Tokens.list pour ' + email + ' ---');
        const repTokens = AdminDirectory.Tokens.list(email);
        const tokens = repTokens.items || [];
        console.log('Nombre d\'applications/tokens OAuth trouvés : ' + tokens.length);
        tokens.forEach(function (t) {
            console.log('Token : ' + (t.displayText || t.clientId) + ' (anonyme: ' + !!t.anonymous + ')');
        });
    } catch (err) {
        console.error('Erreur AdminDirectory.Tokens.list : ' + err.message);
    }
}