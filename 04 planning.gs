/**
 * CRÉNEAUX D'ADMINISTRATION
 * -----------------------------------------------------------------------------
 * Détermination des fenêtres horaires, calcul de la prochaine ouverture et
 * calendrier des jours fériés français (Pâques calculée, pas de table).
 *
 * Le fuseau de référence est celui du projet Apps Script
 * (Paramètres du projet > Fuseau horaire) : le positionner sur Europe/Paris.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Détermine le planning applicable à une action.
 *
 * Ordre de résolution :
 *   1. fenetre = 'PERMANENTE' → null (toujours ouvert)
 *   2. propriété PLANNING_<ACTION>  (ex. PLANNING_CREATION_COMPTE)
 *   3. propriété PLANNING_<FENETRE> (ex. PLANNING_STANDARD)
 *   4. CONFIG.PLANNING_DEFAUT
 *
 * @param {string} actionName Nom de l'action.
 * @param {!Object} spec Spécification issue du registre (voir 01_Registre.gs).
 * @return {?Object} Planning, ou null si l'action est ouverte en permanence.
 */
function resoudrePlanning_(actionName, spec) {
  const fenetre = (spec && spec.fenetre) || 'STANDARD';
  if (fenetre === 'PERMANENTE') return null;

  const candidats = ['PLANNING_' + actionName, 'PLANNING_' + fenetre];
  for (let i = 0; i < candidats.length; i++) {
    const brut = getProp_(candidats[i]);
    if (!brut) continue;
    try {
      const planning = JSON.parse(brut);
      if (planning && typeof planning === 'object') return planning;
    } catch (err) {
      // Un planning illisible ne doit pas bloquer le service : on retombe sur
      // le défaut en signalant l'anomalie de configuration.
      console.error("Propriété %s illisible (JSON invalide) : %s",
        candidats[i], err.message);
    }
  }
  return CONFIG.PLANNING_DEFAUT;
}

/**
 * Convertit une heure 'HH:MM' en minutes depuis minuit.
 * @param {string} heure Heure au format 'HH:MM' ('24:00' accepté pour minuit).
 * @return {number} Minutes depuis minuit.
 */
function parseHeure_(heure) {
  const parts = String(heure).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

/** @return {boolean} true si les jours fériés français ferment le service. */
function respecteJoursFeries_() {
  return getProp_('RESPECT_JOURS_FERIES', 'true').toLowerCase() !== 'false';
}

/**
 * Indique si une date tombe dans un créneau ouvert.
 *
 * @param {!Date} date Date à tester.
 * @param {?Object} planning Planning applicable, null = ouvert en permanence.
 * @return {boolean}
 */
function estOuvert_(date, planning) {
  if (!planning) return true;
  if (respecteJoursFeries_() && estJourFerie_(date)) return false;

  const creneaux = planning[String(date.getDay())] || [];
  const minutes = date.getHours() * 60 + date.getMinutes();

  for (let i = 0; i < creneaux.length; i++) {
    if (minutes >= parseHeure_(creneaux[i][0]) &&
        minutes < parseHeure_(creneaux[i][1])) {
      return true;
    }
  }
  return false;
}

/**
 * Calcule la prochaine date d'ouverture à partir d'un instant donné.
 *
 * @param {!Date} depuis Instant de départ.
 * @param {?Object} planning Planning applicable.
 * @return {?Date} Prochaine ouverture, ou null si aucune dans l'horizon
 *     (planning vide ou entièrement fermé — anomalie de configuration).
 */
function prochaineOuverture_(depuis, planning) {
  if (!planning) return new Date(depuis.getTime());

  for (let j = 0; j <= CONFIG.HORIZON_PLANIF_JOURS; j++) {
    const jour = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate() + j);
    if (respecteJoursFeries_() && estJourFerie_(jour)) continue;

    const creneaux = (planning[String(jour.getDay())] || []).slice()
      .sort(function (a, b) { return parseHeure_(a[0]) - parseHeure_(b[0]); });

    for (let k = 0; k < creneaux.length; k++) {
      const debut = parseHeure_(creneaux[k][0]);
      const fin = parseHeure_(creneaux[k][1]);

      if (j === 0) {
        const minutes = depuis.getHours() * 60 + depuis.getMinutes();
        if (minutes >= fin) continue;              // plage déjà passée
        if (minutes >= debut) return new Date(depuis.getTime()); // déjà ouvert
      }
      return new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(),
        Math.floor(debut / 60), debut % 60, 0, 0);
    }
  }
  return null;
}

/**
 * Calcule le dimanche de Pâques (algorithme de Meeus/Jones/Butcher, grégorien).
 * @param {number} annee Année sur 4 chiffres.
 * @return {!Date} Dimanche de Pâques à minuit, heure locale.
 */
function paques_(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

/**
 * Liste les jours fériés légaux français d'une année, au format 'yyyy-MM-dd'.
 * Les fériés mobiles sont dérivés de Pâques. Les propriétés du script peuvent
 * ajouter des jours de fermeture propres à l'entreprise via JOURS_FERMETURE
 * (dates ISO séparées par des virgules, ex. ponts et fermeture de fin d'année).
 *
 * @param {number} annee Année sur 4 chiffres.
 * @return {!Object<string, string>} Index date → libellé.
 */
function joursFeriesFrance_(annee) {
  const p = paques_(annee);
  /** @param {!Date} base @param {number} delta @return {!Date} */
  const plus = function (base, delta) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
  };

  const feries = {};
  const ajoute = function (date, libelle) { feries[cleJour_(date)] = libelle; };

  ajoute(new Date(annee, 0, 1), 'Jour de l\'An');
  ajoute(plus(p, 1), 'Lundi de Pâques');
  ajoute(new Date(annee, 4, 1), 'Fête du Travail');
  ajoute(new Date(annee, 4, 8), 'Victoire 1945');
  ajoute(plus(p, 39), 'Ascension');
  ajoute(plus(p, 50), 'Lundi de Pentecôte');
  ajoute(new Date(annee, 6, 14), 'Fête nationale');
  ajoute(new Date(annee, 7, 15), 'Assomption');
  ajoute(new Date(annee, 10, 1), 'Toussaint');
  ajoute(new Date(annee, 10, 11), 'Armistice 1918');
  ajoute(new Date(annee, 11, 25), 'Noël');

  getProp_('JOURS_FERMETURE').split(',').forEach(function (d) {
    const cle = d.trim();
    if (cle) feries[cle] = 'Fermeture entreprise';
  });

  return feries;
}

/**
 * Clé de comparaison d'une date, indépendante de l'heure.
 * @param {!Date} date Date à formater.
 * @return {string} 'yyyy-MM-dd'.
 */
function cleJour_(date) {
  const mm = ('0' + (date.getMonth() + 1)).slice(-2);
  const jj = ('0' + date.getDate()).slice(-2);
  return date.getFullYear() + '-' + mm + '-' + jj;
}

/**
 * Indique si une date est un jour férié ou de fermeture.
 * @param {!Date} date Date à tester.
 * @return {boolean}
 */
function estJourFerie_(date) {
  return !!joursFeriesFrance_(date.getFullYear())[cleJour_(date)];
}

/**
 * Analyse une date au format ISO strict 'yyyy-MM-dd' (heure locale, minuit).
 *
 * Refuse tout autre format : un « 05/03/2026 » passé à `new Date()` serait lu à
 * l'américaine et produirait une date fausse mais plausible. On valide donc le
 * motif ET la cohérence des composantes (mois 1-12, jour existant du mois).
 *
 * @param {string} valeur Chaîne à analyser.
 * @param {string=} champ Nom du champ, pour le message d'erreur.
 * @return {!Date} Date à minuit, heure locale.
 * @throws {AppError_} Si la valeur n'est pas une date ISO valide.
 */
function parseDateIso_(valeur, champ) {
  var s = String(valeur).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  var libelle = champ ? " (champ '" + champ + "')" : '';
  if (!m) {
    throw new AppError_('INVALID_DATE',
      "Date invalide" + libelle + " : '" + valeur + "'. Format attendu : " +
      'yyyy-MM-dd (ex. 2026-08-15).');
  }
  var annee = Number(m[1]), mois = Number(m[2]), jour = Number(m[3]);
  var d = new Date(annee, mois - 1, jour);
  // Un jour hors borne (ex. 2026-02-31) est « recalé » par Date : on le détecte
  // en vérifiant que les composantes n'ont pas changé.
  if (d.getFullYear() !== annee || d.getMonth() !== mois - 1 || d.getDate() !== jour) {
    throw new AppError_('INVALID_DATE',
      "Date inexistante" + libelle + " : '" + valeur + "'.");
  }
  return d;
}

/**
 * Formate une date pour affichage dans un ticket Jira.
 * @param {?Date} date Date à formater.
 * @return {string} 'dd/MM/yyyy à HH:mm', ou 'date indéterminée'.
 */
function formaterDate_(date) {
  if (!date) return 'date indéterminée';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy')
    + ' à ' + Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm');
}