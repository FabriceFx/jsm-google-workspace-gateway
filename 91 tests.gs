/**
 * TESTS
 * -----------------------------------------------------------------------------
 * Deux familles, à lancer depuis l'éditeur Apps Script :
 *
 *  1. TESTS UNITAIRES (test_unitaires) — assertions automatiques sur les
 *     fonctions déterministes. AUCUNE écriture sur l'annuaire, aucun e-mail,
 *     aucune dépendance réseau. C'est la suite à relancer après chaque
 *     modification : elle affiche un bilan RÉUSSITE/ÉCHEC exploitable.
 *
 *  2. DIAGNOSTICS MANUELS — scénarios à observer à l'œil (rendu d'e-mail,
 *     planning, registre). Certains ont des effets réels : ils sont signalés.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

// ---------------------------------------------------------------------------
//  HARNAIS D'ASSERTIONS
// ---------------------------------------------------------------------------

/**
 * Contexte de la suite en cours. Volontairement une variable de fonction (pas
 * de premier niveau) : rien ne s'exécute au chargement.
 * @type {?{reussis: number, echecs: !Array<string>}}
 */
let SUITE_COURANTE = null;

/**
 * Vérifie une condition. Enregistre un succès ou un échec dans la suite.
 * @param {boolean} condition Résultat attendu vrai.
 * @param {string} message Description de ce qui est vérifié.
 */
function assert_(condition, message) {
    if (!SUITE_COURANTE) SUITE_COURANTE = { reussis: 0, echecs: [] };
    if (condition) {
        SUITE_COURANTE.reussis++;
    } else {
        SUITE_COURANTE.echecs.push(message);
    }
}

/**
 * Vérifie une égalité stricte, avec un message montrant attendu vs obtenu.
 * @param {*} obtenu Valeur produite.
 * @param {*} attendu Valeur attendue.
 * @param {string} message Description.
 */
function assertEquals_(obtenu, attendu, message) {
    assert_(obtenu === attendu,
        message + ' — attendu ' + JSON.stringify(attendu) +
        ', obtenu ' + JSON.stringify(obtenu));
}

/**
 * Vérifie que `fn` lève une AppError_ portant le code attendu.
 * @param {function()} fn Fonction censée lever.
 * @param {string} codeAttendu Code d'erreur attendu.
 * @param {string} message Description.
 */
function assertThrows_(fn, codeAttendu, message) {
    try {
        fn();
        assert_(false, message + ' — aucune erreur levée (attendu ' + codeAttendu + ')');
    } catch (err) {
        assert_(err instanceof AppError_ && err.code === codeAttendu,
            message + ' — attendu code ' + codeAttendu + ', obtenu ' +
            (err && err.code ? err.code : err.message));
    }
}

/**
 * Exécute une fonction de test dans un bloc protégé : une exception inattendue
 * devient un échec au lieu d'interrompre toute la suite.
 * @param {string} nom Nom du groupe de tests.
 * @param {function()} fn Corps du test.
 */
function groupe_(nom, fn) {
    try {
        fn();
    } catch (err) {
        assert_(false, nom + ' — exception inattendue : ' + err.message);
    }
}

// ---------------------------------------------------------------------------
//  SUITE DE TESTS UNITAIRES  (point d'entrée : test_unitaires)
// ---------------------------------------------------------------------------

/**
 * Lance toutes les vérifications automatiques et affiche le bilan.
 * À exécuter depuis l'éditeur après toute modification du code.
 */
function test_unitaires() {
    SUITE_COURANTE = { reussis: 0, echecs: [] };

    groupe_('safeEquals_', testSafeEquals_);
    groupe_('boolDeFormulaire_', testBoolDeFormulaire_);
    groupe_('estNotFound_', testEstNotFound_);
    groupe_('parseHeure_', testParseHeure_);
    groupe_('parseDateIso_', testParseDateIso_);
    groupe_('estOuvert_', testEstOuvert_);
    groupe_('prochaineOuverture_', testProchaineOuverture_);
    groupe_('joursFeriesFrance_', testJoursFeries_);
    groupe_('generatePassword_', testGeneratePassword_);
    groupe_('echapper_ / nettoyerHtml_', testEchapper_);
    groupe_('normaliserUrlImage_', testNormaliserUrlImage_);
    groupe_('sanitizeData_', testSanitizeData_);
    groupe_('construireProfilPatch_', testConstruireProfilPatch_);
    groupe_('traduireErreurAdmin_', testTraduireErreurAdmin_);
    groupe_('estErreurGroupeDynamique_', testEstErreurGroupeDynamique_);
    groupe_('toutes les specs et handlers', testTousHandlersRegistre_);

    const s = SUITE_COURANTE;
    const total = s.reussis + s.echecs.length;
    const lignes = [
        '════════════════════════════════════════',
        s.echecs.length === 0
            ? '✅ TOUS LES TESTS PASSENT (' + s.reussis + '/' + total + ')'
            : '❌ ' + s.echecs.length + ' ÉCHEC(S) sur ' + total,
        '════════════════════════════════════════'
    ];
    s.echecs.forEach(function (e) { lignes.push('  ✗ ' + e); });
    console.log(lignes.join('\n'));
    SUITE_COURANTE = null;
}

function testSafeEquals_() {
    assert_(safeEquals_('abc', 'abc'), 'chaînes égales → true');
    assert_(!safeEquals_('abc', 'abd'), 'même longueur, différentes → false');
    assert_(!safeEquals_('abc', 'abcd'), 'longueurs différentes → false');
    assert_(!safeEquals_('', 'x'), 'vide vs non vide → false');
    assert_(safeEquals_('', ''), 'deux vides → true');
}

function testBoolDeFormulaire_() {
    assert_(boolDeFormulaire_(true, false) === true, 'true natif');
    assert_(boolDeFormulaire_(false, true) === false, 'false natif');
    assert_(boolDeFormulaire_('true', false) === true, "'true'");
    assert_(boolDeFormulaire_('oui', false) === true, "'oui'");
    assert_(boolDeFormulaire_('NON', true) === false, "'NON' insensible à la casse");
    assert_(boolDeFormulaire_('false', true) === false, "'false'");
    assert_(boolDeFormulaire_('', true) === true, 'vide → défaut true');
    assert_(boolDeFormulaire_('peut-être', false) === false, 'inconnu → défaut false');
    assert_(boolDeFormulaire_(undefined, true) === true, 'absent → défaut');
}

function testEstNotFound_() {
    assert_(estNotFound_({ message: 'Resource Not Found: userKey' }), 'Resource Not Found');
    assert_(estNotFound_({ message: 'notFound' }), 'notFound');
    assert_(estNotFound_(new Error('GoogleJsonResponseException: Not Found')), 'Not Found');
    assert_(!estNotFound_({ message: 'Quota exceeded' }), 'quota → false');
    assert_(!estNotFound_({ message: 'Insufficient Permission' }), 'permission → false');
}

function testParseHeure_() {
    assertEquals_(parseHeure_('08:30'), 510, '08:30 → 510 min');
    assertEquals_(parseHeure_('00:00'), 0, 'minuit → 0');
    assertEquals_(parseHeure_('24:00'), 1440, '24:00 → 1440');
    assertEquals_(parseHeure_('17'), 1020, "'17' sans minutes → 1020");
}

function testParseDateIso_() {
    var d = parseDateIso_('2026-08-15', 'x');
    assertEquals_(d.getFullYear(), 2026, 'date simple année');
    assertEquals_(d.getMonth(), 7, 'date simple mois (0-based)');
    assertEquals_(d.getDate(), 15, 'date simple jour');

    var dHeure = parseDateIso_('2026-08-15T14:30', 'x');
    assertEquals_(dHeure.getFullYear(), 2026, 'date+heure année');
    assertEquals_(dHeure.getHours(), 14, 'date+heure heure');
    assertEquals_(dHeure.getMinutes(), 30, 'date+heure minute');

    var dUtc = parseDateIso_('2026-08-15T14:30:00Z', 'x');
    assertEquals_(dUtc.getUTCFullYear(), 2026, 'UTC année');
    assertEquals_(dUtc.getUTCHours(), 14, 'UTC heure');
    assertEquals_(dUtc.getUTCMinutes(), 30, 'UTC minute');

    var dOffset = parseDateIso_('2026-08-15T16:30:00+02:00', 'x');
    assertEquals_(dOffset.getUTCHours(), 14, 'Offset +02:00 converti en UTC 14h');

    assertThrows_(function () { parseDateIso_('15/08/2026', 'x'); },
        'INVALID_DATE', 'format FR refusé');
    assertThrows_(function () { parseDateIso_('2026-02-31', 'x'); },
        'INVALID_DATE', 'jour inexistant refusé');
    assertThrows_(function () { parseDateIso_('2026-08-15T25:00', 'x'); },
        'INVALID_DATE', 'heure 25 refusée');
    assertThrows_(function () { parseDateIso_('2026-08-15T14:99', 'x'); },
        'INVALID_DATE', 'minute 99 refusée');
    assertThrows_(function () { parseDateIso_('2026-08-15T14:30PARASITE', 'x'); },
        'INVALID_DATE', 'suffixe parasite refusé');
    assertThrows_(function () { parseDateIso_('pas une date', 'x'); },
        'INVALID_DATE', 'texte refusé');
}

function testEstOuvert_() {
    // Planning fictif : lundi (1) ouvert 09:00–12:00, fériés ignorés via planning null.
    var planning = { '1': [['09:00', '12:00']] };
    var lundi10h = new Date(2026, 0, 5, 10, 0);   // 5 janv. 2026 = lundi
    var lundi13h = new Date(2026, 0, 5, 13, 0);
    var mardi10h = new Date(2026, 0, 6, 10, 0);
    assert_(estOuvert_(lundi10h, planning), 'lundi 10h dans le créneau');
    assert_(!estOuvert_(lundi13h, planning), 'lundi 13h hors créneau');
    assert_(!estOuvert_(mardi10h, planning), 'mardi absent du planning');
    assert_(estOuvert_(mardi10h, null), 'planning null = toujours ouvert');
    // Borne de fin exclue.
    assert_(!estOuvert_(new Date(2026, 0, 5, 12, 0), planning), 'fin exclue (12:00)');
    assert_(estOuvert_(new Date(2026, 0, 5, 11, 59), planning), '11:59 inclus');
}

function testProchaineOuverture_() {
    var planning = { '1': [['09:00', '12:00']] };  // seulement le lundi
    // Un mardi → prochaine ouverture = lundi suivant 09:00.
    var mardi = new Date(2026, 0, 6, 15, 0);
    var prochaine = prochaineOuverture_(mardi, planning);
    assert_(prochaine !== null, 'une ouverture est trouvée');
    assertEquals_(prochaine.getDay(), 1, 'tombe un lundi');
    assertEquals_(prochaine.getHours(), 9, 'à 9h');
    // Déjà ouvert → retourne l'instant lui-même.
    var lundi10h = new Date(2026, 0, 5, 10, 0);
    assertEquals_(prochaineOuverture_(lundi10h, planning).getTime(), lundi10h.getTime(),
        'déjà ouvert → instant courant');
    // Planning null → toujours ouvert.
    assert_(prochaineOuverture_(mardi, null).getTime() === mardi.getTime(),
        'null → instant courant');
}

function testJoursFeries_() {
    var f2026 = joursFeriesFrance_(2026);
    assert_(!!f2026['2026-01-01'], 'Jour de l\'An');
    assert_(!!f2026['2026-07-14'], 'Fête nationale');
    assert_(!!f2026['2026-12-25'], 'Noël');
    // Pâques 2026 = 5 avril → Lundi de Pâques = 6 avril.
    assert_(!!f2026['2026-04-06'], 'Lundi de Pâques 2026 (dérivé de Pâques)');
    assert_(!f2026['2026-07-15'], 'un jour ouvré n\'est pas férié');
}

function testGeneratePassword_() {
    var mdp = generatePassword_();
    assertEquals_(mdp.length, CONFIG.PASSWORD_LENGTH, 'longueur = CONFIG.PASSWORD_LENGTH');
    assert_(/[A-Z]/.test(mdp), 'contient une majuscule');
    assert_(/[a-z]/.test(mdp), 'contient une minuscule');
    assert_(/[0-9]/.test(mdp), 'contient un chiffre');
    assert_(/[!@#$%*\-_=+?]/.test(mdp), 'contient un caractère spécial');
    // Deux tirages successifs doivent différer (entropie réelle).
    assert_(generatePassword_() !== generatePassword_(), 'deux mots de passe diffèrent');
}

function testEchapper_() {
    assertEquals_(echapper_('<script>'), '&lt;script&gt;', 'balise échappée');
    assertEquals_(echapper_('a & b'), 'a &amp; b', 'esperluette');
    assertEquals_(echapper_(null), '', 'null → vide');
    // Aller-retour HTML → texte.
    assertEquals_(nettoyerHtml_('Ligne1<br />Ligne2'), 'Ligne1\nLigne2', 'br → retour ligne');
    assertEquals_(nettoyerHtml_('<b>gras</b>'), 'gras', 'balises retirées');
}

function testNormaliserUrlImage_() {
    // Un espace littéral doit être encodé.
    assertEquals_(normaliserUrlImage_('https://ex.com/mon logo.png'),
        'https://ex.com/mon%20logo.png', 'espace → %20');
    // Idempotence : une URL déjà encodée n'est pas ré-encodée.
    assertEquals_(normaliserUrlImage_('https://ex.com/mon%20logo.png'),
        'https://ex.com/mon%20logo.png', 'déjà encodée : inchangée');
}

function testSanitizeData_() {
    // Spec minimale factice ; sanitizeData_ ne dépend que de required/emails.
    var spec = { required: ['email_cible'], emails: ['email_cible'] };

    // Champ obligatoire manquant.
    assertThrows_(function () { sanitizeData_({}, spec, 'TEST'); },
        'MISSING_FIELDS', 'champ requis manquant');

    // E-mail au format invalide (rejet indépendant de ALLOWED_DOMAINS).
    assertThrows_(function () {
        sanitizeData_({ email_cible: 'pas-un-email' }, spec, 'TEST');
    }, 'INVALID_EMAIL', 'e-mail mal formé');

    // Bloc data absent.
    assertThrows_(function () { sanitizeData_(null, spec, 'TEST'); },
        'BAD_REQUEST', 'data absent');

    // Normalisation : trim + minuscules. On passe par email_perso, exempté de la
    // liste blanche ALLOWED_DOMAINS, pour que le test ne dépende pas de la config.
    var specPerso = { required: [], emails: ['email_perso'] };
    var ok = sanitizeData_({ email_perso: '  JEAN.Dupont@Exemple.FR ' }, specPerso, 'TEST');
    assertEquals_(ok.email_perso, 'jean.dupont@exemple.fr', 'e-mail normalisé');

    // OU doit commencer par '/'.
    var specOu = { required: [], emails: [] };
    assertThrows_(function () {
        sanitizeData_({ unite_organisationnelle: 'Sans slash' }, specOu, 'TEST');
    }, 'INVALID_OU', 'OU sans slash refusée');
}

function testConstruireProfilPatch_() {
    // Non-régression DATA-1 : mettre à jour UN attribut de schéma ne doit pas
    // effacer les autres (exige que l'existant soit lu en projection 'full').
    var existant = {
        organizations: [{ primary: true, title: 'Dev', department: 'DSI', costCenter: 'CC1' }],
        phones: [{ type: 'work', value: '01' }, { type: 'mobile', value: '06' }],
        relations: [{ type: 'manager', value: 'old@x.fr' }, { type: 'assistant', value: 'a@x.fr' }],
        customSchemas: { RH: { Matricule: 42, Statut: 'Cadre' } }
    };

    // 1. Fusion schéma : on ne change que Statut, Matricule doit survivre.
    var r1 = construireProfilPatch_({ custom_schemas: '{"RH":{"Statut":"ETAM"}}' }, existant);
    assertEquals_(r1.patch.customSchemas.RH.Statut, 'ETAM', 'schéma : Statut mis à jour');
    assertEquals_(r1.patch.customSchemas.RH.Matricule, 42, 'schéma : Matricule PRÉSERVÉ (anti DATA-1)');

    // 2. Organisation : changer le poste préserve département et centre de coûts.
    var r2 = construireProfilPatch_({ intitule_poste: 'Lead' }, existant);
    var org = r2.patch.organizations[0];
    assertEquals_(org.title, 'Lead', 'org : titre mis à jour');
    assertEquals_(org.department, 'DSI', 'org : département préservé');
    assertEquals_(org.costCenter, 'CC1', 'org : centre de coûts préservé');

    // 3. Téléphones : changer le pro préserve le mobile.
    var r3 = construireProfilPatch_({ telephone_pro: '02' }, existant);
    var work = r3.patch.phones.filter(function (p) { return p.type === 'work'; })[0];
    var mob = r3.patch.phones.filter(function (p) { return p.type === 'mobile'; })[0];
    assertEquals_(work.value, '02', 'tél : pro mis à jour');
    assertEquals_(mob.value, '06', 'tél : mobile préservé');

    // 4. Relations : changer le manager préserve l'assistant.
    var r4 = construireProfilPatch_({ manager_email: 'new@x.fr' }, existant);
    assertEquals_(r4.patch.relations.length, 2, 'relations : les deux conservées');

    // 5. Coercition de type + JSON invalide.
    var r5 = construireProfilPatch_({ rh_matricule: '99', acces_jira: 'oui' }, {});
    assertEquals_(r5.patch.customSchemas.Ressources_humaines.Matricule, 99, 'matricule → number');
    assertEquals_(r5.patch.customSchemas.Atlassian.JIRA, true, 'accès → bool');
    assertThrows_(function () {
        construireProfilPatch_({ custom_schemas: '{pas du json' }, {});
    }, 'INVALID_SCHEMA', 'JSON invalide rejeté');
}

function testTraduireErreurAdmin_() {
    // L'ordre des motifs est volontaire (le plus spécifique d'abord).
    assertEquals_(traduireErreurAdmin_({ message: 'Domain not found' }).code,
        'INVALID_DOMAIN', 'domaine avant not-found générique');
    assertEquals_(traduireErreurAdmin_({ message: 'Resource Not Found' }).code,
        'NOT_FOUND', 'not found générique');
    assertEquals_(traduireErreurAdmin_({ message: 'Cannot modify dynamic group' }).code,
        'GROUPE_DYNAMIQUE', 'groupe dynamique');
    assertEquals_(traduireErreurAdmin_({ message: 'Invalid Input: INVALID_OU_ID' }).code,
        'INVALID_OU', 'OU invalide');
    assert_(traduireErreurAdmin_({ message: 'quelque chose d\'inconnu' }) === null,
        'motif inconnu → null');
}

function testEstErreurGroupeDynamique_() {
    assert_(estErreurGroupeDynamique_('Condition not met'), 'Condition not met → true');
    assert_(estErreurGroupeDynamique_('Cannot mutate dynamic group'), 'Cannot mutate dynamic group → true');
    assert_(estErreurGroupeDynamique_('Invalid member type'), 'Invalid member type → true');
    assert_(!estErreurGroupeDynamique_('Generic precondition failure'), 'Precondition générique sans condition not met → false');
    assert_(!estErreurGroupeDynamique_('Not Found 404'), '404 not found → false');
}

function testTousHandlersRegistre_() {
    const actionsObj = getActions_();
    const actionNoms = Object.keys(actionsObj);
    assert_(actionNoms.length >= 50, 'Registre chargé avec au moins 50 actions (actuel: ' + actionNoms.length + ')');
    
    actionNoms.forEach(function (nom) {
        const spec = actionsObj[nom];
        assert_(typeof spec.action === 'string' && spec.action.length > 0, nom + ' : nom d\'action valide');
        assert_(typeof spec.description === 'string' && spec.description.length > 0, nom + ' : description présente');
        assert_(Array.isArray(spec.required), nom + ' : required est un tableau');
        assert_(Array.isArray(spec.emails), nom + ' : emails est un tableau');
        assert_(spec.fenetre === 'STANDARD' || spec.fenetre === 'PERMANENTE', nom + ' : fenêtre valide (STANDARD ou PERMANENTE)');
        assert_(typeof spec.handler === 'function', nom + ' : handler est une fonction valide');
    });
}

// ---------------------------------------------------------------------------
//  DIAGNOSTICS MANUELS  (observation à l'œil ; effets réels signalés)
// ---------------------------------------------------------------------------

/**
 * Affiche le planning résolu et simule l'ouverture heure par heure sur 7 jours.
 * Utile pour valider une surcharge PLANNING_* avant mise en production.
 * Lecture seule.
 */
function test_verifierPlanning() {
    const planning = resoudrePlanning_('STANDARD', { fenetre: 'STANDARD' });
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const lignes = ['Planning appliqué :'];

    Object.keys(planning).sort().forEach(function (k) {
        const creneaux = planning[k];
        lignes.push('  ' + jours[Number(k)].padEnd(10) + ' : ' +
            (creneaux.length
                ? creneaux.map(function (c) { return c[0] + '–' + c[1]; }).join(', ')
                : 'fermé'));
    });

    lignes.push('\nSimulation à 7 jours (une ligne par changement d\'état) :');
    const depart = new Date();
    let etatPrecedent = null;
    for (let h = 0; h < 24 * 7; h++) {
        const instant = new Date(depart.getFullYear(), depart.getMonth(),
            depart.getDate(), depart.getHours() + h);
        const etat = estOuvert_(instant, planning);
        if (etat !== etatPrecedent) {
            lignes.push('  ' + formaterDate_(instant) + ' → ' + (etat ? 'OUVERT' : 'fermé'));
            etatPrecedent = etat;
        }
    }

    lignes.push('\nJours fériés ' + depart.getFullYear() + ' :');
    const feries = joursFeriesFrance_(depart.getFullYear());
    Object.keys(feries).sort().forEach(function (d) {
        lignes.push('  ' + d + ' — ' + feries[d]);
    });

    console.log(lignes.join('\n'));
}

/**
 * Contrôle le registre des formulaires sans effectuer aucune écriture.
 *
 * À exécuter après tout ajout ou modification d'un fichier 1x_Action_*.gs :
 * c'est le seul moyen de valider une déclaration hors d'une requête réelle.
 * Lecture seule.
 */
function test_verifierRegistre() {
    let actions;
    try {
        actions = getActions_();
    } catch (err) {
        console.error('Registre invalide — ' + err.message);
        return;
    }

    const lignes = ['Registre valide : ' + Object.keys(actions).length + ' formulaire(s).'];
    listerActions_().forEach(function (nom) {
        const spec = actions[nom];
        lignes.push('  ' + nom);
        lignes.push('    fenêtre     : ' + spec.fenetre +
            (spec.fenetre === 'PERMANENTE' ? '  (jamais différée)' : ''));
        lignes.push('    obligatoire : ' + (spec.required.join(', ') || '—'));
        lignes.push('    e-mails     : ' + (spec.emails.join(', ') || '—'));
        lignes.push('    description : ' + spec.description);
    });
    console.log(lignes.join('\n'));
}

/**
 * Envoie un exemplaire de chaque gabarit d'email à l'adresse qui exécute le
 * script, afin de contrôler le rendu réel dans Gmail (et sur mobile).
 *
 * ⚠️ EFFET RÉEL : envoie deux e-mails et consomme le quota Gmail. Aucune
 * donnée réelle utilisée, aucun compte créé.
 */
function test_apercuEmails() {
    assertAdminUI_();   // effet réel (envoi d'e-mails) : réservé à l'admin
    const moi = Session.getActiveUser().getEmail();
    if (!moi) { console.log('Adresse de l\'utilisateur indisponible.'); return; }

    envoyerIdentifiants_(moi, 'prenom.nom@cooperl.com', 'Ex3mple-Mdp-Test', 'TEST-000');
    notifierAnomalies_([
        'ÉCHEC — ITSM-4312 / CREATION_COMPTE : adresse déjà utilisée',
        'EXPIRÉ — ITSM-4288 / AJOUT_GROUPE'
    ]);

    console.log('Deux messages d\'exemple envoyés à ' + moi + '.' +
        (getProp_('LOGO_URL') ? '' :
            '\n  Note : LOGO_URL n\'est pas renseigné, l\'en-tête affiche le nom en ' +
            'toutes lettres au lieu du logo.'));
}

/**
 * Vérifie que la configuration minimale est en place avant de lancer un test
 * à effet réel. Sans cette garde, un test lancé sur un projet neuf échoue sur
 * une pile d'appels interne au lieu d'indiquer la marche à suivre.
 *
 * @return {boolean} true si les tests peuvent être exécutés.
 */
function testsPretsAExecuter_() {
    if (getProp_('SECRET_TOKEN')) return true;
    console.log(
        'Configuration incomplète : SECRET_TOKEN absent.\n' +
        '  1. Exécuter setup_genererToken()\n' +
        '  2. Renseigner AUDIT_SHEET_ID (obligatoire pour la file d\'attente)\n' +
        '  3. Contrôler avec setup_verifierConfiguration()');
    return false;
}

/**
 * Vérifie les garde-fous d'entrée par des assertions, SANS aucune écriture sur
 * l'annuaire : token invalide, action inconnue, champ manquant, e-mail
 * invalide, corps absent. Contrairement à la création de compte, ces cas
 * échouent AVANT tout appel à l'Admin SDK.
 *
 * Affiche un bilan RÉUSSITE/ÉCHEC.
 */
function test_casDErreur() {
    if (!testsPretsAExecuter_()) return;
    SUITE_COURANTE = { reussis: 0, echecs: [] };

    const appel = function (payload) {
        const e = payload ? { postData: { contents: JSON.stringify(payload) } } : {};
        return JSON.parse(doPost(e).getContent());
    };
    const token = getProp_('SECRET_TOKEN');

    var r;
    r = appel({ secret_token: 'faux', action: 'SUSPENSION', data: {} });
    assertEquals_(r.error_code, 'FORBIDDEN', 'token invalide → FORBIDDEN');

    r = appel({ secret_token: token, action: 'INEXISTANTE', data: {} });
    assertEquals_(r.error_code, 'UNKNOWN_ACTION', 'action inconnue → UNKNOWN_ACTION');

    r = appel({ secret_token: token, action: 'SUSPENSION', data: {} });
    assertEquals_(r.error_code, 'MISSING_FIELDS', 'champ manquant → MISSING_FIELDS');

    r = appel({ secret_token: token, action: 'SUSPENSION', data: { email_cible: 'pas-un-email' } });
    assertEquals_(r.error_code, 'INVALID_EMAIL', 'e-mail invalide → INVALID_EMAIL');

    r = appel(null);
    assertEquals_(r.error_code, 'BAD_REQUEST', 'corps absent → BAD_REQUEST');

    const s = SUITE_COURANTE;
    const total = s.reussis + s.echecs.length;
    const lignes = [s.echecs.length === 0
        ? '✅ Garde-fous OK (' + s.reussis + '/' + total + ')'
        : '❌ ' + s.echecs.length + ' ÉCHEC(S) sur ' + total];
    s.echecs.forEach(function (e) { lignes.push('  ✗ ' + e); });
    console.log(lignes.join('\n'));
    SUITE_COURANTE = null;
}

/**
 * Simule un appel Jira de bout en bout pour l'action CREATION_COMPTE.
 *
 * ⚠️ EFFET RÉEL ET DESTRUCTIF : ce n'est PAS une simulation à vide — le compte
 * est réellement créé dans l'annuaire. Pour éviter une exécution accidentelle,
 * la garde ci-dessous exige de passer AUTORISER_CREATION à true après avoir
 * adapté le domaine et vérifié l'OU. Pensez à supprimer le compte de test
 * ensuite (action SUPPRESSION_COMPTE ou console d'administration).
 */
function test_simulerCreationCompteReelle() {
    assertAdminUI_();   // effet réel (crée un vrai compte) : réservé à l'admin
    if (!testsPretsAExecuter_()) return;

    const AUTORISER_CREATION = false;   // ⚠️ passer à true en connaissance de cause
    if (!AUTORISER_CREATION) {
        console.log('Test à effet réel désactivé. Ce test CRÉE un vrai compte dans ' +
            'l\'annuaire.\n  → Adapter le domaine/OU dans le payload, puis passer ' +
            'AUTORISER_CREATION à true pour l\'exécuter. Supprimer le compte ensuite.');
        return;
    }

    const payload = {
        secret_token: getProp_('SECRET_TOKEN'),
        action: 'CREATION_COMPTE',
        ticket_key: 'TEST-001',
        request_id: 'TEST-001-1',
        data: {
            prenom: 'Jean',
            nom: 'Dupont',
            email_souhaite: 'jean.dupont@exemple.fr',   // ADAPTER : domaine de votre annuaire
            manager_email: 'manager@exemple.fr'          // ADAPTER : reçoit le mot de passe
        }
    };

    const reponse = doPost({ postData: { contents: JSON.stringify(payload) } });
    console.log(reponse.getContent());
}

/**
 * Diagnostic manuel : Invoque chaque handler d'action avec un domaine réservé invalide
 * (@smoke-test.invalid) afin de vérifier l'absence d'erreur de syntaxe ou de ReferenceError.
 *
 * ⚠️ RISQUE D'EFFET DE BORD : Désactivé par défaut. Utilise un faux domaine pour
 * faire échouer les appels en amont sans impacter le domaine réel de production.
 */
function test_smokeTestHandlersManuels_() {
    assertAdminUI_();
    if (!testsPretsAExecuter_()) return;

    const AUTORISER_SMOKE_TEST = false; // ⚠️ Passer à true pour exécuter ce diagnostic manuel
    if (!AUTORISER_SMOKE_TEST) {
        console.log('Smoke test d\'invocation désactivé par sécurité.\n' +
            '  → Passer AUTORISER_SMOKE_TEST à true dans 91 tests.gs pour l\'exécuter manuellement.');
        return;
    }

    const actionsObj = getActions_();
    const actionNoms = Object.keys(actionsObj);
    const mockCtx = {
        action: 'SMOKE_MANUEL',
        ticketKey: 'SMOKE-001',
        requestId: 'SMOKE-001-1',
        traceId: 'TRACE-SMOKE'
    };
    const mockData = {
        email_cible: 'user.test@smoke-test.invalid',
        email_source: 'user.test@smoke-test.invalid',
        email_destination: 'dest@smoke-test.invalid',
        email_groupe: 'grp_test@smoke-test.invalid',
        email_manager: 'dest@smoke-test.invalid',
        email_delegue: 'dest@smoke-test.invalid',
        prenom: 'Test',
        nom: 'Smoke',
        email_souhaite: 'test.smoke@smoke-test.invalid',
        nouvel_email: 'test.smoke2@smoke-test.invalid',
        manager_email: 'dest@smoke-test.invalid',
        alias: 'test.alias@smoke-test.invalid',
        nom_groupe: 'Groupe Test Smoke',
        description: 'Groupe test smoke',
        drive_id: 'drive-smoke-invalid',
        nom_drive: 'Drive Smoke Test',
        role: 'MEMBER',
        nouvelle_ou: '/Collaborateurs',
        motif: 'Test smoke',
        message: 'Absent',
        objet: 'Absence',
        date_debut: '2026-08-25',
        date_fin: '2026-08-30',
        code_batiment: 'BAT-1',
        nom_ressource: 'Salle Smoke',
        type_ressource: 'ROOM',
        capacite: 10,
        email_ressource: 'salle.smoke@resource.calendar.google.com'
    };

    let reussis = 0;
    actionNoms.forEach(function (nom) {
        const spec = actionsObj[nom];
        try {
            spec.handler(Object.assign({}, mockData), Object.assign({}, mockCtx, { action: nom }));
            reussis++;
        } catch (err) {
            if (err instanceof ReferenceError || (err instanceof TypeError && err.message.indexOf('is not a function') !== -1)) {
                console.error('❌ BUG REFERENCE dans ' + nom + ' : ' + err.message);
            } else {
                reussis++;
            }
        }
    });
    console.log('✅ Smoke test manuel terminé : ' + reussis + ' / ' + actionNoms.length + ' handlers vérifiés.');
}
