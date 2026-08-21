/**
 * JOURNAL D'AUDIT ET NOTIFICATIONS
 * -----------------------------------------------------------------------------
 * Traçabilité des opérations dans l'onglet AUDIT_LOG et alertes e-mail.
 * La journalisation ne doit jamais faire échouer une opération réussie.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Écrit une ligne dans le journal d'audit (Google Sheet).
 * Silencieux si AUDIT_SHEET_ID n'est pas configuré : la journalisation ne doit
 * jamais faire échouer une opération métier déjà réussie.
 *
 * @param {!Object} ctx Contexte d'exécution.
 * @param {string} statut 'SUCCESS' | 'ERROR'.
 * @param {string} cible Adresse concernée.
 * @param {string} message Message détaillé.
 * @param {number} duration Durée d'exécution en ms.
 */
function audit_(ctx, statut, cible, message, duration) {
    const sheetId = getProp_('AUDIT_SHEET_ID');
    if (!sheetId) return;

    try {
        const ss = SpreadsheetApp.openById(sheetId);
        let sheet = ss.getSheetByName(CONFIG.AUDIT_SHEET_NAME);
        if (!sheet) sheet = ss.insertSheet(CONFIG.AUDIT_SHEET_NAME);
        if (sheet.getLastRow() === 0) {
            sheet.appendRow(CONFIG.AUDIT_HEADERS);
            sheet.setFrozenRows(1);
            sheet.getRange(1, 1, 1, CONFIG.AUDIT_HEADERS.length).setFontWeight('bold');
        }
        sheet.appendRow([
            new Date(), ctx.ticketKey, ctx.requestId, ctx.action,
            statut, cible, message, ctx.traceId, duration
        ]);
    } catch (err) {
        console.error('[%s] Journalisation impossible : %s', ctx.traceId, err.message);
    }
}

/**
 * Alerte l'équipe support en cas d'échec définitif ou d'expiration.
 * @param {!Array<string>} alertes Lignes de synthèse.
 */
function notifierAnomalies_(alertes) {
    const destinataire = getProp_('NOTIFY_EMAIL');
    if (!destinataire) return;

    const pluriel = alertes.length > 1 ? 's' : '';

    envoyerEmailCooperl_(destinataire,
        '[Passerelle Jira → Workspace] ' + alertes.length + ' action' + pluriel +
        ' en anomalie', {
        alerte: true,   // accent rose : réservé aux anomalies
        sousTitre: 'Passerelle Jira → Workspace',
        titre: alertes.length + ' action' + pluriel + ' en anomalie',
        paragraphes: [
            'Les demandes suivantes n\'ont pas pu être exécutées automatiquement ' +
            'et nécessitent une intervention manuelle.'
        ],
        liste: alertes.map(function (a) { return echapper_(a); }),
        note: 'Détail complet dans l\'onglet <b>' + CONFIG.QUEUE_SHEET_NAME +
            '</b> du classeur d\'audit.'
    });
}