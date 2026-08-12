/**
 * SÉCURITÉ ET VALIDATION
 * -----------------------------------------------------------------------------
 * Authentification par secret partagé, validation des payloads, typage des
 * erreurs applicatives et formatage des réponses HTTP.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Erreur applicative « attendue » : son message est sûr à renvoyer à Jira.
 * @param {string} code Code d'erreur machine (ex. 'FORBIDDEN').
 * @param {string} message Message lisible par l'agent JSM.
 * @param {number} [httpHint=400] Code HTTP indicatif.
 * @constructor
 * @extends {Error}
 */
function AppError_(code, message, httpHint) {
    const err = Error.call(this, message);
    this.name = 'AppError';
    this.code = code;
    this.message = message;
    this.httpHint = httpHint || 400;
    this.stack = err.stack;
}

AppError_.prototype = Object.create(Error.prototype);
AppError_.prototype.constructor = AppError_;

/**
 * Vérifie le secret partagé.
 *
 * Deux durcissements par rapport à la v1 :
 *  - le token vient des Propriétés du script (plus du code source) ;
 *  - la comparaison est à temps constant (limite les attaques temporelles).
 *
 * @param {!Object} payload Payload reçu.
 * @param {!Object} ctx Contexte d'exécution (pour le log).
 * @throws {AppError_} Si le token est absent, invalide ou non configuré.
 */
function assertAuthorized_(payload, ctx) {
    const expected = getProp_('SECRET_TOKEN');

    if (!expected) {
        throw new AppError_('NOT_CONFIGURED',
            "SECRET_TOKEN absent des propriétés du script. Configuration incomplète.", 500);
    }
    if (expected.length < 32) {
        console.warn('[%s] SECRET_TOKEN trop court (%d car.) — recommandé >= 32.',
            ctx.traceId, expected.length);
    }

    const received = payload && payload.secret_token ? String(payload.secret_token) : '';

    if (!safeEquals_(received, expected)) {
        console.warn('[%s] Tentative non autorisée. Ticket: %s / Action: %s',
            ctx.traceId, ctx.ticketKey, ctx.action);
        // Message volontairement laconique : on ne dit pas si le token est
        // "manquant" ou "faux", pour ne pas aider un attaquant.
        throw new AppError_('FORBIDDEN', 'Accès refusé.', 403);
    }
}

/**
 * Comparaison de chaînes à temps constant.
 * @param {string} a
 * @param {string} b
 * @return {boolean}
 */
function safeEquals_(a, b) {
    if (a.length !== b.length) {
        // On compare quand même pour ne pas court-circuiter trop vite.
        let dummy = 0;
        for (let i = 0; i < b.length; i++) dummy |= b.charCodeAt(i);
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/**
 * Valide et normalise le bloc `data` selon la spécification de l'action.
 *
 * @param {*} rawData Bloc `data` brut du payload.
 * @param {!Object} spec Spécification issue du registre (voir 01_Registre.gs).
 * @param {string} actionName Nom de l'action (pour les messages).
 * @return {!Object} Données nettoyées.
 * @throws {AppError_} Si un champ obligatoire manque ou si un e-mail est invalide.
 */
function sanitizeData_(rawData, spec, actionName) {
    if (!rawData || typeof rawData !== 'object') {
        throw new AppError_('BAD_REQUEST',
            "Le bloc 'data' est absent ou mal formé pour l'action " + actionName + '.');
    }

    // Copie superficielle : on ne mute pas le payload d'origine.
    const data = {};
    Object.keys(rawData).forEach(function (k) {
        data[k] = (typeof rawData[k] === 'string') ? rawData[k].trim() : rawData[k];
    });

    // 4.1 Champs obligatoires
    const missing = spec.required.filter(function (f) {
        return data[f] === undefined || data[f] === null || data[f] === '';
    });
    if (missing.length) {
        throw new AppError_('MISSING_FIELDS',
            'Champs obligatoires manquants pour ' + actionName + ' : ' + missing.join(', ') +
            '. Vérifier le mapping des champs dans la règle Jira Automation.');
    }

    // 4.2 Normalisation + validation des e-mails
    const allowed = getProp_('ALLOWED_DOMAINS')
        .split(',').map(function (d) { return d.trim().toLowerCase(); })
        .filter(Boolean);

    spec.emails.forEach(function (field) {
        if (!data[field]) return;
        const email = String(data[field]).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            throw new AppError_('INVALID_EMAIL',
                "Adresse e-mail invalide dans le champ '" + field + "' : " + data[field]);
        }
        // La liste blanche ne s'applique qu'aux comptes du domaine, pas aux
        // adresses personnelles de récupération.
        if (allowed.length && field !== 'email_perso') {
            const domain = email.split('@')[1];
            if (allowed.indexOf(domain) === -1) {
                throw new AppError_('DOMAIN_NOT_ALLOWED',
                    "Domaine '" + domain + "' non autorisé. Domaines admis : " + allowed.join(', '));
            }
        }
        data[field] = email;
    });

    // 4.3 Contrôle de l'unité organisationnelle
    if (data.unite_organisationnelle) {
        const ou = String(data.unite_organisationnelle);
        if (ou.charAt(0) !== '/') {
            throw new AppError_('INVALID_OU',
                "L'unité organisationnelle doit commencer par '/' (reçu : " + ou + ').');
        }
    }

    return data;
}

/**
 * Construit la réponse JSON renvoyée à Jira.
 *
 * Rappel : ContentService ne permet pas de fixer le code HTTP — Apps Script
 * répond 200 dès lors que l'exécution aboutit. Le statut métier est donc porté
 * par les champs `status` / `http_status` du corps.
 *
 * @param {!Object} body Corps de la réponse.
 * @return {!GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse_(body) {
    body.timestamp = new Date().toISOString();
    return ContentService
        .createTextOutput(JSON.stringify(body))
        .setMimeType(ContentService.MimeType.JSON);
}