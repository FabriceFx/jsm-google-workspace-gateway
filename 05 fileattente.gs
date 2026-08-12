/**
 * FILE D'ATTENTE DES ACTIONS DIFFÉRÉES
 * -----------------------------------------------------------------------------
 * Persistance des demandes hors créneau dans l'onglet FILE_ATTENTE du
 * classeur d'audit, et vidange périodique par déclencheur temporel.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/** Index des colonnes de la file (base 0), pour éviter les nombres magiques. */
const COL = Object.freeze({
    DEMANDE: 0, TICKET: 1, REQUEST_ID: 2, ACTION: 3, STATUT: 4, CIBLE: 5,
    DATA: 6, PREVU: 7, TENTATIVES: 8, MESSAGE: 9, EXECUTE: 10, TRACE: 11
});

/**
 * Ouvre (ou crée) l'onglet de la file d'attente.
 * @return {?GoogleAppsScript.Spreadsheet.Sheet} L'onglet, ou null si le
 *     classeur n'est pas configuré.
 */
function getQueueSheet_() {
    const sheetId = getProp_('AUDIT_SHEET_ID');
    if (!sheetId) return null;

    const ss = SpreadsheetApp.openById(sheetId);
    let sheet = ss.getSheetByName(CONFIG.QUEUE_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(CONFIG.QUEUE_SHEET_NAME);
        sheet.setColumnWidth(7, 320);
    }
    // L'onglet peut exister mais avoir été vidé à la main : sans cette garde, la
    // première demande enregistrée occuperait la ligne 1 et serait prise pour un
    // en-tête par toutes les lectures ultérieures (donc jamais exécutée).
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(CONFIG.QUEUE_HEADERS);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, CONFIG.QUEUE_HEADERS.length).setFontWeight('bold');
    }
    return sheet;
}

/**
 * Enregistre une action hors créneau pour exécution ultérieure.
 *
 * @param {!Object} ctx Contexte d'exécution.
 * @param {!Object} data Données validées.
 * @param {?Object} planning Planning applicable.
 * @return {!Object} { message, scheduledForIso, target, idempotent }.
 * @throws {AppError_} Si le classeur d'audit n'est pas configuré.
 */
function enfilerAction_(ctx, data, planning) {
    const sheet = getQueueSheet_();
    if (!sheet) {
        throw new AppError_('NOT_CONFIGURED',
            "Action hors créneau, mais la file d'attente est indisponible : la " +
            'propriété AUDIT_SHEET_ID doit pointer vers un classeur Google Sheets.', 500);
    }

    // Idempotence : un rejeu Jira ne doit pas empiler deux fois la même demande.
    const existante = trouverLigne_(sheet, ctx.requestId, CONFIG.STATUTS.EN_ATTENTE);
    if (existante) {
        const prevu = existante.row[COL.PREVU];
        return {
            idempotent: true,
            target: existante.row[COL.CIBLE],
            scheduledForIso: prevu instanceof Date ? prevu.toISOString() : null,
            message: 'Demande déjà enregistrée en file d\'attente (' + ctx.requestId +
                '), exécution prévue le ' + formaterDate_(prevu instanceof Date ? prevu : null) + '.'
        };
    }

    const prevu = prochaineOuverture_(new Date(), planning);
    if (!prevu) {
        throw new AppError_('PLANNING_INVALIDE',
            "Aucun créneau d'ouverture trouvé dans les " + CONFIG.HORIZON_PLANIF_JOURS +
            ' prochains jours. Vérifier la configuration du planning.', 500);
    }

    const cible = data.email_cible || data.email_souhaite || '';

    sheet.appendRow([
        new Date(), ctx.ticketKey, ctx.requestId, ctx.action,
        CONFIG.STATUTS.EN_ATTENTE, cible, JSON.stringify(data),
        prevu, 0, 'En attente du prochain créneau', '', ctx.traceId
    ]);

    return {
        target: cible,
        scheduledForIso: prevu.toISOString(),
        message: 'Demande enregistrée hors créneau d\'administration. ' +
            'Exécution automatique prévue le ' + formaterDate_(prevu) + '.'
    };
}

/**
 * Recherche une ligne de la file par identifiant de demande.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet Onglet de la file.
 * @param {string} requestId Identifiant recherché.
 * @param {string=} statut Filtre optionnel sur le statut.
 * @return {?{index: number, row: !Array<*>}} Ligne trouvée (index base 1) ou null.
 */
function trouverLigne_(sheet, requestId, statut) {
    const values = sheet.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
        if (String(values[i][COL.REQUEST_ID]) === String(requestId) &&
            (!statut || values[i][COL.STATUT] === statut)) {
            return { index: i + 1, row: values[i] };
        }
    }
    return null;
}

/** @return {number} Nombre de demandes actuellement en attente. */
function compterEnAttente_() {
    try {
        const sheet = getQueueSheet_();
        if (!sheet) return 0;
        return sheet.getDataRange().getValues().filter(function (r) {
            return r[COL.STATUT] === CONFIG.STATUTS.EN_ATTENTE;
        }).length;
    } catch (err) {
        return 0;
    }
}

/**
 * Vide la file d'attente : exécute les demandes dont le créneau est ouvert.
 *
 * ⚠️ Cette fonction est le point d'entrée du déclencheur temporel. Elle doit
 * rester globale et sans paramètre. Installation : setup_installerDeclencheur().
 *
 * Comportement :
 *  - ignore les demandes dont le créneau est encore fermé ;
 *  - réessaie jusqu'à CONFIG.MAX_TENTATIVES en cas d'erreur transitoire ;
 *  - marque EXPIRE au-delà de CONFIG.EXPIRATION_JOURS ;
 *  - notifie NOTIFY_EMAIL sur échec définitif ou expiration.
 */
function traiterFileAttente() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
        console.log('Vidange de la file ignorée : traitement déjà en cours.');
        return;
    }

    try {
        const sheet = getQueueSheet_();
        if (!sheet) return;

        const values = sheet.getDataRange().getValues();
        const maintenant = new Date();
        let traitees = 0, reportees = 0;
        const alertes = [];

        for (let i = 1; i < values.length; i++) {
            const row = values[i];
            if (row[COL.STATUT] !== CONFIG.STATUTS.EN_ATTENTE) continue;

            const numLigne = i + 1;
            const ctx = {
                ticketKey: String(row[COL.TICKET] || 'N/A'),
                requestId: String(row[COL.REQUEST_ID] || ''),
                action: String(row[COL.ACTION] || ''),
                traceId: Utilities.getUuid().slice(0, 8),
                differe: true
            };

            // --- Péremption ----------------------------------------------------
            // La cellule contient normalement une vraie Date ; on tolère une saisie
            // texte (ligne recopiée à la main) plutôt que de perdre la péremption.
            const brutDemande = row[COL.DEMANDE];
            const demandeLe = (brutDemande && !isNaN(new Date(brutDemande).getTime()))
                ? new Date(brutDemande) : maintenant;
            const ageJours = (maintenant.getTime() - demandeLe.getTime()) / 86400000;
            if (ageJours > CONFIG.EXPIRATION_JOURS) {
                majLigne_(sheet, numLigne, CONFIG.STATUTS.EXPIRE,
                    'Demande périmée après ' + CONFIG.EXPIRATION_JOURS + ' jours.', row, maintenant);
                alertes.push('EXPIRÉ — ' + ctx.ticketKey + ' / ' + ctx.action);
                continue;
            }

            // --- Action encore connue du registre ? ----------------------------
            const spec = getSpec_(ctx.action);
            if (!spec) {
                majLigne_(sheet, numLigne, CONFIG.STATUTS.ECHEC,
                    "Action '" + ctx.action + "' retirée du registre.", row, maintenant);
                alertes.push('ÉCHEC — ' + ctx.ticketKey + ' / action inconnue');
                continue;
            }

            // --- Créneau ouvert ? ----------------------------------------------
            const planning = resoudrePlanning_(ctx.action, spec);
            if (!estOuvert_(maintenant, planning)) { reportees++; continue; }

            // --- Exécution ------------------------------------------------------
            const tentative = Number(row[COL.TENTATIVES] || 0) + 1;
            try {
                const data = JSON.parse(row[COL.DATA]);
                const result = appelerHandler_(spec, data, ctx);

                majLigne_(sheet, numLigne, CONFIG.STATUTS.TERMINE,
                    result.message, row, maintenant, tentative);
                audit_(ctx, 'SUCCESS_DIFFERE', result.target || row[COL.CIBLE],
                    result.message, 0);
                traitees++;
                console.log('[%s] DIFFÉRÉ EXÉCUTÉ %s / %s — %s',
                    ctx.traceId, ctx.action, ctx.ticketKey, result.message);

            } catch (err) {
                const definitif = tentative >= CONFIG.MAX_TENTATIVES;
                const message = 'Tentative ' + tentative + '/' + CONFIG.MAX_TENTATIVES +
                    ' — ' + err.message;

                majLigne_(sheet, numLigne,
                    definitif ? CONFIG.STATUTS.ECHEC : CONFIG.STATUTS.EN_ATTENTE,
                    message, row, maintenant, tentative);
                audit_(ctx, definitif ? 'ERROR_DIFFERE' : 'RETRY_DIFFERE',
                    String(row[COL.CIBLE]), message, 0);

                console.error('[%s] DIFFÉRÉ KO %s / %s — %s',
                    ctx.traceId, ctx.action, ctx.ticketKey, err.message);
                if (definitif) {
                    alertes.push('ÉCHEC — ' + ctx.ticketKey + ' / ' + ctx.action + ' : ' + err.message);
                }
            }
        }

        if (traitees || reportees) {
            console.log('File d\'attente : %d exécutée(s), %d encore hors créneau.',
                traitees, reportees);
        }
        if (alertes.length) notifierAnomalies_(alertes);

    } finally {
        lock.releaseLock();
    }
}

/**
 * Met à jour une ligne de la file après traitement.
 * @param {!GoogleAppsScript.Spreadsheet.Sheet} sheet Onglet de la file.
 * @param {number} numLigne Numéro de ligne (base 1).
 * @param {string} statut Nouveau statut.
 * @param {string} message Dernier message.
 * @param {!Array<*>} row Ligne courante.
 * @param {!Date} horodatage Instant du traitement.
 * @param {number=} tentatives Nombre de tentatives effectuées.
 */
function majLigne_(sheet, numLigne, statut, message, row, horodatage, tentatives) {
    row[COL.STATUT] = statut;
    row[COL.MESSAGE] = String(message).slice(0, 500);
    row[COL.TENTATIVES] = (tentatives === undefined) ? row[COL.TENTATIVES] : tentatives;
    // Une ligne qui repart en attente n'a pas encore de date d'exécution.
    row[COL.EXECUTE] = (statut === CONFIG.STATUTS.EN_ATTENTE) ? '' : horodatage;
    sheet.getRange(numLigne, 1, 1, CONFIG.QUEUE_HEADERS.length).setValues([row]);
}