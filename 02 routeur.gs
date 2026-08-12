/**
* ROUTEUR HTTP
* -----------------------------------------------------------------------------
* Points d'entrée doPost (webhook Jira) et doGet (supervision), plus
* l'exécuteur partagé entre traitement synchrone et traitement différé.
*
* Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
* ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
*/

/**
 * Endpoint principal appelé par Jira Automation (Send web request → POST).
 *
 * Séquence : parsing → authentification → validation → verrou → exécution
 * → journalisation → réponse.
 *
 * @param {!GoogleAppsScript.Events.DoPost} e Événement HTTP.
 * @return {!GoogleAppsScript.Content.TextOutput} Réponse JSON.
 */
function doPost(e) {
    const started = Date.now();
    const traceId = Utilities.getUuid().slice(0, 8);
    let ctx = { ticketKey: 'N/A', requestId: '', action: 'N/A', traceId: traceId };

    try {
        // --- 3.1 Extraction défensive du corps de la requête -------------------
        if (!e || !e.postData || !e.postData.contents) {
            throw new AppError_('BAD_REQUEST',
                'Corps de requête absent. Vérifier que Jira envoie bien un POST ' +
                'avec Content-Type application/json.');
        }

        let payload;
        try {
            payload = JSON.parse(e.postData.contents);
        } catch (parseErr) {
            throw new AppError_('BAD_REQUEST', 'Payload JSON illisible : ' + parseErr.message);
        }

        ctx.ticketKey = String(payload.ticket_key || 'N/A');
        ctx.requestId = String(payload.request_id || ctx.ticketKey + '-' + traceId);
        ctx.action = String(payload.action || 'N/A');

        // --- 3.2 Authentification ---------------------------------------------
        assertAuthorized_(payload, ctx);

        // --- 3.3 Résolution et validation de l'action -------------------------
        const spec = getSpec_(ctx.action);
        if (!spec) {
            throw new AppError_('UNKNOWN_ACTION',
                "Action '" + ctx.action + "' inconnue. Actions disponibles : " +
                listerActions_().join(', '));
        }

        const data = sanitizeData_(payload.data, spec, ctx.action);

        // --- 3.4 Contrôle du créneau d'administration -------------------------
        const maintenant = new Date();
        const planning = resoudrePlanning_(ctx.action, spec);
        const ouvert = estOuvert_(maintenant, planning);
        const forcage = (payload.force_immediat === true || payload.force_immediat === 'true');

        if (!ouvert && forcage) {
            // Dérogation explicite : tracée, et conditionnée à un motif écrit.
            if (!payload.motif_urgence) {
                throw new AppError_('MOTIF_REQUIS',
                    "Exécution hors créneau demandée sans justification. Renseigner " +
                    "'motif_urgence' dans le payload pour forcer l'exécution.");
            }
            ctx.derogation = String(payload.motif_urgence);
            console.warn("[%s] DÉROGATION hors créneau — %s / %s — motif : %s",
                traceId, ctx.action, ctx.ticketKey, ctx.derogation);
        }

        if (!ouvert && !forcage) {
            // Hors créneau : on mémorise la demande, le déclencheur l'exécutera
            // à l'ouverture. Voir traiterFileAttente().
            const lockQ = LockService.getScriptLock();
            if (!lockQ.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
                throw new AppError_('BUSY',
                    'File d\'attente occupée. Jira peut relancer la requête.');
            }
            let planif;
            try {
                planif = enfilerAction_(ctx, data, planning);
            } finally {
                lockQ.releaseLock();
            }

            const dureeQ = Date.now() - started;
            console.log('[%s] DIFFÉRÉ %s / %s — %s (%d ms)',
                traceId, ctx.action, ctx.ticketKey, planif.message, dureeQ);
            audit_(ctx, 'QUEUED', planif.target || '', planif.message, dureeQ);

            return jsonResponse_({
                status: 'queued',
                http_status: 202,
                action: ctx.action,
                ticket_key: ctx.ticketKey,
                request_id: ctx.requestId,
                trace_id: traceId,
                idempotent: !!planif.idempotent,
                scheduled_for: planif.scheduledForIso,
                message: planif.message
            });
        }

        // --- 3.5 Exécution sous verrou (évite les doublons sur retry Jira) ----
        const result = executerAction_(spec, data, ctx);

        // --- 3.6 Journalisation + réponse -------------------------------------
        const duration = Date.now() - started;
        console.log('[%s] OK %s / %s — %s (%d ms)',
            traceId, ctx.action, ctx.ticketKey, result.message, duration);

        audit_(ctx, 'SUCCESS', result.target || '', result.message, duration);

        return jsonResponse_({
            status: 'success',
            http_status: 200,
            action: ctx.action,
            ticket_key: ctx.ticketKey,
            request_id: ctx.requestId,
            trace_id: traceId,
            idempotent: !!result.idempotent,
            derogation: ctx.derogation || null,
            message: result.message,
            details: result.details || {}
        });

    } catch (err) {
        // --- 3.7 Gestion centralisée des erreurs ------------------------------
        const duration = Date.now() - started;
        const isAppError = err instanceof AppError_;
        const code = isAppError ? err.code : 'INTERNAL_ERROR';
        const httpHint = isAppError ? err.httpHint : 500;

        // On loggue TOUT côté Google (stack incluse)...
        console.error('[%s] KO %s / %s — %s\n%s',
            traceId, ctx.action, ctx.ticketKey, err.message, err.stack || '(pas de stack)');

        audit_(ctx, 'ERROR', '', code + ' : ' + err.message, duration);

        // ...mais on ne renvoie à Jira qu'un message maîtrisé, sans détail interne
        // sur les erreurs non prévues (évite la fuite d'infos dans le ticket).
        const publicMessage = isAppError
            ? err.message
            : "Erreur interne côté Google. Communiquer le trace_id à l'équipe IT.";

        return jsonResponse_({
            status: 'error',
            http_status: httpHint,
            error_code: code,
            action: ctx.action,
            ticket_key: ctx.ticketKey,
            trace_id: traceId,
            message: publicMessage
        });
    }
}

/**
 * Endpoint de supervision (health check). Permet de vérifier que le
 * déploiement répond sans exposer d'information sensible.
 *
 * @param {!GoogleAppsScript.Events.DoGet} e Événement HTTP.
 * @return {!GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
    if (e && e.parameter && e.parameter.format === 'json') {
        const maintenant = new Date();
        const planningStandard = resoudrePlanning_('STANDARD', { fenetre: 'STANDARD' });
        const ouvert = estOuvert_(maintenant, planningStandard);
        const prochaine = ouvert ? maintenant : prochaineOuverture_(maintenant, planningStandard);

        return jsonResponse_({
            status: 'success',
            http_status: 200,
            service: 'Passerelle Jira → Google Workspace',
            version: CONFIG.VERSION,
            actions: listerActions_(),
            configured: !!getProp_('SECRET_TOKEN'),
            fenetre_ouverte: ouvert,
            prochaine_ouverture: prochaine ? prochaine.toISOString() : null,
            file_attente: compterEnAttente_(),
            timestamp: maintenant.toISOString()
        });
    }

    // XFrameOptionsMode.DEFAULT (et non ALLOWALL) : l'interface déclenche des
    // actions d'administration, elle ne doit pas être encadrable par un site
    // tiers (protection anti-clickjacking).
    return HtmlService.createHtmlOutputFromFile('ui_test')
        .setTitle('Passerelle JSM → Google Workspace — Console de Test')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Exécute une action métier sous verrou d'exclusion mutuelle.
 * Point d'entrée unique partagé par le traitement synchrone (doPost) et le
 * traitement différé (traiterFileAttente) : la logique métier ne se dédouble
 * donc jamais entre les deux chemins.
 *
 * @param {!Object} spec Spécification issue du registre (voir 01_Registre.gs).
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object} Résultat du handler.
 * @throws {AppError_} Si le verrou n'est pas obtenu.
 */
function executerAction_(spec, data, ctx) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
        throw new AppError_('BUSY',
            'Une autre exécution est en cours. Jira peut relancer la requête.');
    }
    try {
        return appelerHandler_(spec, data, ctx);
    } finally {
        lock.releaseLock();
    }
}

/**
 * Invoque une fonction métier en traduisant les erreurs de l'Admin SDK.
 *
 * Point de passage unique de TOUS les appels métier — synchrone, différé ou
 * forcé manuellement — afin qu'un même échec produise partout le même message
 * exploitable dans le ticket, plutôt qu'un « erreur interne » opaque.
 *
 * @param {!Object} spec Spécification de l'action.
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object} Résultat du handler.
 */
function appelerHandler_(spec, data, ctx) {
    try {
        return spec.handler(data, ctx);
    } catch (err) {
        if (err instanceof AppError_) throw err;      // déjà explicite
        const traduite = traduireErreurAdmin_(err);
        if (traduite) {
            // La cause d'origine reste dans les logs Google pour l'analyse.
            console.error('[%s] %s → %s : %s',
                ctx.traceId, ctx.action, traduite.code, err.message);
            throw traduite;
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
//  HELPERS SERVEUR POUR L'INTERFACE WEBAPP DE TEST (google.script.run)
// ---------------------------------------------------------------------------

/**
 * Expose la liste des spécifications au client HTML.
 * Réservé aux administrateurs autorisés (voir assertAdminUI_).
 * @return {!Array<!Object>}
 */
function getSpecsCatalogue() {
  assertAdminUI_();
  const actions = getActions_();
  return Object.keys(actions).sort().map(function (nom) {
    const s = actions[nom];
    return {
      action: s.action,
      description: s.description,
      required: s.required || [],
      emails: s.emails || [],
      fenetre: s.fenetre
    };
  });
}

/**
 * Fournit les options d'une liste déroulante dynamique de la console.
 * Réservé aux administrateurs autorisés (voir assertAdminUI_).
 *
 * Extensible : ajouter un `case` par source. Chaque source renvoie un tableau
 * d'options { val, txt } que le client injecte dans un <select>.
 *
 * @param {string} source Identifiant de la source (ex. 'orgunits').
 * @return {!Array<!{val: string, txt: string}>}
 */
function getOptionsUI(source) {
  assertAdminUI_();

  if (source === 'orgunits') {
    var reponse = AdminDirectory.Orgunits.list('my_customer', { type: 'all' });
    var chemins = (reponse.organizationUnits || []).map(function (ou) {
      return ou.orgUnitPath;
    });
    chemins.unshift('/');                 // la racine n'est pas listée par l'API
    chemins.sort();
    return chemins.map(function (c) { return { val: c, txt: c }; });
  }

  if (source === 'buildings') {
    // Nécessite le scope admin.directory.resource.calendar.readonly.
    var rep = AdminDirectory.Resources.Buildings.list('my_customer');
    return (rep.buildings || []).map(function (b) {
      return {
        val: b.buildingId,
        txt: b.buildingName ? (b.buildingName + ' (' + b.buildingId + ')') : b.buildingId
      };
    }).sort(function (a, b) { return a.txt.localeCompare(b.txt); });
  }

  // Suggestions tirées des valeurs existantes de l'annuaire (cache 6 h).
  if (source.indexOf('suggest:') === 0) {
    return suggestionsAnnuaire_(source.slice('suggest:'.length));
  }

  // Source inconnue : tableau vide (le client retombe sur une saisie libre).
  return [];
}

/**
 * Retourne d'un coup TOUTES les listes de suggestions tirées de l'annuaire
 * (société, service, centre de coûts, description, statut, CSE, fonction…).
 * Une seule énumération partagée côté serveur (voir construireToutesSuggestions_).
 * Réservé aux administrateurs autorisés.
 * @return {!Object<string, !Array<!{val: string, txt: string}>>}
 */
function getSuggestionsUI() {
  assertAdminUI_();
  return construireToutesSuggestions_();
}

/**
 * Exécute une action depuis la console de test WebApp.
 *
 * L'appelant doit d'abord être authentifié comme administrateur (assertAdminUI_).
 * Ce n'est qu'APRÈS cette vérification d'identité — plus forte que le simple
 * secret partagé — qu'on injecte le SECRET_TOKEN pour le passage par doPost.
 * Sans le garde, injecter le token neutraliserait toute l'authentification pour
 * un visiteur anonyme (l'ancienne faille).
 *
 * @param {!Object} payload
 * @return {!Object}
 */
function executerActionDepuisUI(payload) {
  const admin = assertAdminUI_();
  payload = payload || {};
  payload.secret_token = getProp_('SECRET_TOKEN');
  console.log("Exécution console par %s : %s / %s",
    admin, payload.action, payload.ticket_key);
  const textOutput = doPost({ postData: { contents: JSON.stringify(payload) } });
  return JSON.parse(textOutput.getContent());
}

/**
 * Retourne l'URL publique canonique de la WebApp.
 * Réservé aux administrateurs autorisés (voir assertAdminUI_).
 *
 * @return {string} URL officielle de la WebApp, ou chaîne vide si indéterminée.
 */
function getWebhookUrl() {
  assertAdminUI_();
  try {
    const url = ScriptApp.getService().getUrl();
    if (url) return url;
  } catch (err) {
    console.warn('Impossible de lire ScriptApp.getService().getUrl() : ' + err.message);
  }
  // Pas de repli codé en dur : un ID de déploiement ne doit pas vivre dans le
  // code source (il part dans Git). L'UI gère l'absence d'URL.
  return '';
}