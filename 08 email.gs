/**
 * GABARIT D'EMAIL — CHARTE COOPERL
 * -----------------------------------------------------------------------------
 * Construit les messages HTML envoyés par la passerelle, conformément à la
 * charte graphique du groupe (bleu dominant, Source Sans Pro, marqueur « :: »,
 * carré de point).
 *
 * CONTRAINTES DES CLIENTS DE MESSAGERIE, qui expliquent les partis pris :
 *  - Mise en page par <table> et styles en ligne : Outlook (moteur Word)
 *    ignore la plupart des dispositions CSS modernes.
 *  - Aucune police web : Gmail supprime @font-face. Source Sans Pro n'est
 *    rendue que si elle est installée sur le poste ; la pile de repli passe
 *    ensuite par Roboto et Segoe UI, cohérentes avec l'univers Workspace.
 *  - Largeur fixée à 600 px, seuil au-delà duquel Gmail et Outlook rognent.
 *  - Couleurs de fond posées à la fois en attribut bgcolor et en style, faute
 *    de quoi le mode sombre de Gmail les recalcule.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.7.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Valeurs de la charte graphique Cooperl (référence : charte, pages 11 et 12).
 * @const
 */
const CHARTE = Object.freeze({
  BLEU: '#0d5973',           // Bleu Cooperl — couleur dominante
  BLEU_FONCE: '#003d52',     // Bleu foncé — pied de page
  ROSE: '#f086a4',           // Rose — accent, réservé aux alertes
  GRIS_FOND: '#f2f4f6',      // Fond des encadrés
  GRIS_BORD: '#dde3e6',
  TEXTE: '#1c2b33',
  TEXTE_SECONDAIRE: '#5a6a73',
  BLANC: '#ffffff',

  /**
   * Source Sans Pro est la police de la charte. Les clients de messagerie ne
   * chargent pas de police web : le repli suit l'univers Google Workspace.
   */
  POLICE: "'Source Sans Pro','Source Sans 3',Roboto,'Segoe UI',Arial,Helvetica,sans-serif",
  LARGEUR: 600,

  /** Coordonnées du siège (charte, page 15). */
  SIEGE: 'Cooperl Siège Social — 7 rue de la Jeannaie, Maroué, Bât. 2, ' +
         'BP 60328, 22403 Lamballe-Armor',
  SITE: 'www.cooperl.com'
});

/**
 * Assemble un email complet aux couleurs de la charte.
 *
 * @param {!Object} o Contenu du message.
 * @param {string} o.titre Titre principal, rendu en capitales.
 * @param {string=} o.sousTitre Surtitre affiché au-dessus du titre.
 * @param {!Array<string>=} o.paragraphes Paragraphes de corps (HTML simple).
 * @param {!Array<{label: string, valeur: string}>=} o.encadres Couples
 *     libellé/valeur mis en avant dans un bloc gris.
 * @param {!Array<string>=} o.liste Éléments de liste à puces.
 * @param {string=} o.note Mention discrète en fin de corps.
 * @param {boolean=} o.alerte true pour l'accent rose (anomalies).
 * @return {string} Document HTML complet.
 */
function construireEmail_(o) {
  const accent = o.alerte ? CHARTE.ROSE : CHARTE.BLEU;
  const blocs = [];

  if (o.sousTitre) {
    blocs.push(
      '<p style="margin:0 0 6px;font-size:13px;line-height:18px;font-weight:600;' +
      'letter-spacing:1.2px;text-transform:uppercase;color:' + accent + ';">' +
      '<span style="color:' + accent + ';">::</span> ' + echapper_(o.sousTitre) +
      '</p>');
  }

  blocs.push(
    '<h1 style="margin:0 0 20px;font-size:24px;line-height:30px;font-weight:700;' +
    'letter-spacing:0.4px;text-transform:uppercase;color:' + CHARTE.BLEU_FONCE +
    ';">' + echapper_(o.titre) + '</h1>');

  (o.paragraphes || []).forEach(function (p) {
    blocs.push(
      '<p style="margin:0 0 16px;font-size:16px;line-height:25px;color:' +
      CHARTE.TEXTE + ';">' + p + '</p>');
  });

  if (o.encadres && o.encadres.length) {
    const lignes = o.encadres.map(function (e) {
      return '' +
        '<tr>' +
        '<td style="padding:0 0 4px;font-size:12px;line-height:16px;' +
        'font-weight:600;letter-spacing:1px;text-transform:uppercase;color:' +
        CHARTE.TEXTE_SECONDAIRE + ';">' + echapper_(e.label) + '</td>' +
        '</tr><tr>' +
        '<td style="padding:0 0 18px;font-size:18px;line-height:24px;' +
        'font-weight:600;color:' + CHARTE.BLEU_FONCE + ';">' + e.valeur + '</td>' +
        '</tr>';
    }).join('');

    blocs.push('' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
      'width="100%" style="margin:0 0 20px;border-collapse:collapse;">' +
      '<tr><td bgcolor="' + CHARTE.GRIS_FOND + '" style="background-color:' +
      CHARTE.GRIS_FOND + ';border-left:4px solid ' + accent +
      ';padding:20px 24px 2px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
      'width="100%">' + lignes + '</table>' +
      '</td></tr></table>');
  }

  if (o.liste && o.liste.length) {
    blocs.push(
      '<ul style="margin:0 0 20px;padding-left:20px;font-size:16px;' +
      'line-height:25px;color:' + CHARTE.TEXTE + ';">' +
      o.liste.map(function (i) {
        return '<li style="margin:0 0 8px;">' + i + '</li>';
      }).join('') + '</ul>');
  }

  if (o.note) {
    blocs.push(
      '<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid ' +
      CHARTE.GRIS_BORD + ';font-size:14px;line-height:21px;color:' +
      CHARTE.TEXTE_SECONDAIRE + ';">' + o.note + '</p>');
  }

  return enveloppeHtml_(blocs.join(''));
}

/**
 * Enveloppe le corps dans la structure complète : en-tête, contenu, pied.
 * @param {string} contenuHtml Corps déjà mis en forme.
 * @return {string} Document HTML complet.
 */
function enveloppeHtml_(contenuHtml) {
  return '' +
'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" ' +
'"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
'<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">' +
'<head>' +
'<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
'<meta name="viewport" content="width=device-width, initial-scale=1" />' +
'<meta name="color-scheme" content="light" />' +
'<title>Cooperl</title>' +
'<style type="text/css">' +
'@media only screen and (max-width:620px){' +
'.cooperl-conteneur{width:100% !important;}' +
'.cooperl-marge{padding-left:24px !important;padding-right:24px !important;}' +
'}' +
// iOS Mail souligne en bleu les adresses et numéros qu'il détecte : on rend
// la main à la charte. Sans effet sur Gmail, qui exige une balise <a> posée
// en amont (voir adresseStylisee_).
'a[x-apple-data-detectors]{color:inherit !important;text-decoration:none ' +
'!important;font-size:inherit !important;font-weight:inherit !important;}' +
'</style>' +
'</head>' +
'<body style="margin:0;padding:0;background-color:' + CHARTE.GRIS_FOND +
';font-family:' + CHARTE.POLICE + ';-webkit-font-smoothing:antialiased;">' +

// Ligne de prévisualisation masquée : évite que Gmail affiche le début du HTML.
'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">&#8203;</div>' +

'<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
'width="100%" bgcolor="' + CHARTE.GRIS_FOND + '" style="background-color:' +
CHARTE.GRIS_FOND + ';">' +
'<tr><td align="center" style="padding:24px 12px;">' +

'<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
'width="' + CHARTE.LARGEUR + '" class="cooperl-conteneur" ' +
'style="width:' + CHARTE.LARGEUR + 'px;max-width:' + CHARTE.LARGEUR +
'px;border-collapse:collapse;">' +

// --- En-tête : fond dicté par la variante de logo (charte, page 8) ---
'<tr><td bgcolor="' + fondEnTete_() + '" style="background-color:' + fondEnTete_() +
';padding:26px 40px;' +
// Le filet bleu rétablit la séparation quand l'en-tête est blanc.
(getLogoVariante_() === 'BLEU' ? 'border-bottom:3px solid ' + CHARTE.BLEU + ';' : '') +
'" class="cooperl-marge">' +
enTeteLogo_() +
'</td></tr>' +

// --- Contenu ---
'<tr><td bgcolor="' + CHARTE.BLANC + '" style="background-color:' +
CHARTE.BLANC + ';padding:36px 40px 32px;" class="cooperl-marge">' +
contenuHtml +
'</td></tr>' +

// --- Pied de page ---
'<tr><td bgcolor="' + CHARTE.BLEU_FONCE + '" style="background-color:' +
CHARTE.BLEU_FONCE + ';padding:24px 40px;" class="cooperl-marge">' +
carreDePoint_(CHARTE.BLANC) +
'<p style="margin:14px 0 0;font-size:12px;line-height:18px;color:#a9c2ce;">' +
'Message automatique — merci de ne pas répondre.<br />' +
echapper_(CHARTE.SIEGE) + '<br />' +
'<a href="https://' + CHARTE.SITE + '" style="color:' + CHARTE.BLANC +
';text-decoration:none;font-weight:600;">' + CHARTE.SITE + '</a>' +
'</p>' +
'<p style="margin:12px 0 0;font-size:11px;line-height:16px;color:#7fa3b3;' +
'font-style:italic;">Pensons à la planète, n\'imprimons ce mail que si ' +
'nécessaire.</p>' +
'</td></tr>' +

'</table></td></tr></table></body></html>';
}

/**
 * Rend le logo en en-tête.
 *
 * Le logo Cooperl est une création typographique qui ne peut pas être
 * reconstituée en HTML : la charte interdit d'en modifier la forme ou la
 * couleur. Héberger le PNG officiel et renseigner la propriété LOGO_URL est
 * donc la seule option conforme. À défaut, on affiche le nom en toutes
 * lettres — un mot, pas le logo — plutôt qu'une approximation du dessin.
 *
 * @return {string} Fragment HTML.
 */
function enTeteLogo_() {
  const url = getLogoUrl_();
  if (url) {
    return '<img src="' + echapper_(url) + '" width="132" alt="Cooperl" ' +
      'style="display:block;width:132px;max-width:132px;height:auto;border:0;" />';
  }
  return '<span style="font-size:26px;line-height:32px;font-weight:700;' +
    'letter-spacing:0.5px;color:' + couleurLogoTexte_() + ';">Cooperl</span>';
}

/**
 * URL du logo, nettoyée et ré-encodée pour être utilisable dans un <img src>.
 * @return {string} URL, ou chaîne vide si non configurée.
 */
function getLogoUrl_() {
  const brut = getProp_('LOGO_URL').trim().replace(/^["'<]+|["'>]+$/g, '');
  return brut ? normaliserUrlImage_(brut) : '';
}

/**
 * Ré-encode le chemin d'une URL d'image.
 *
 * Une adresse copiée depuis la barre d'un navigateur arrive décodée : les
 * espaces y sont littéraux, ce qui rend la balise <img> invalide. UrlFetchApp
 * corrige silencieusement ce défaut, mais pas le relais d'images de Gmail, qui
 * n'affiche alors rien.
 *
 * L'opération est idempotente : chaque segment est décodé avant d'être
 * ré-encodé, si bien qu'une URL déjà correcte n'est pas doublement encodée
 * (%20 resterait sinon %2520).
 *
 * @param {string} url Adresse brute.
 * @return {string} Adresse au chemin correctement encodé.
 */
function normaliserUrlImage_(url) {
  const parties = url.match(/^(https?:\/\/[^\/?#]+)([^?#]*)(.*)$/);
  if (!parties) return url;

  const chemin = parties[2].split('/').map(function (segment) {
    if (!segment) return segment;
    let decode;
    try {
      decode = decodeURIComponent(segment);
    } catch (err) {
      decode = segment;   // séquence % invalide : on encode tel quel
    }
    return encodeURIComponent(decode);
  }).join('/');

  return parties[1] + chemin + parties[3];
}

/**
 * Variante du logo hébergé, qui détermine le fond de l'en-tête.
 *
 * La charte (page 8) admet deux usages : logo blanc sur fond bleu Cooperl
 * (cas B) et logo bleu sur fond blanc (cas A, usage principal). Poser un logo
 * bleu sur le bandeau bleu produirait un logo invisible et contreviendrait
 * à l'interdit de la page 10.
 *
 * @return {string} 'BLANC' (défaut) ou 'BLEU'.
 */
function getLogoVariante_() {
  return getProp_('LOGO_VARIANTE', 'BLANC').trim().toUpperCase() === 'BLEU'
    ? 'BLEU' : 'BLANC';
}

/** @return {string} Couleur de fond de l'en-tête selon la variante de logo. */
function fondEnTete_() {
  return getLogoVariante_() === 'BLEU' ? CHARTE.BLANC : CHARTE.BLEU;
}

/** @return {string} Couleur du nom en toutes lettres, si le logo est absent. */
function couleurLogoTexte_() {
  return getLogoVariante_() === 'BLEU' ? CHARTE.BLEU : CHARTE.BLANC;
}

/**
 * Carré de point de la charte : deux « : » superposés (charte, page 12).
 * Les coins arrondis sont ignorés par Outlook, qui rend alors quatre carrés —
 * dégradation cohérente avec le nom même du symbole.
 *
 * @param {string} couleur Couleur des points.
 * @return {string} Fragment HTML.
 */
function carreDePoint_(couleur) {
  const point = '<td width="7" height="7" bgcolor="' + couleur +
    '" style="background-color:' + couleur +
    ';width:7px;height:7px;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>';
  const espace = '<td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>';
  const ligne = '<tr>' + point + espace + point + '</tr>';
  const interligne = '<tr><td colspan="3" height="5" ' +
    'style="height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>';

  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
    'style="border-collapse:collapse;">' + ligne + interligne + ligne + '</table>';
}

/**
 * Met en forme une adresse e-mail affichée dans un message.
 *
 * Gmail et iOS Mail détectent les adresses laissées en texte brut et leur
 * appliquent leur propre style — bleu souligné, hors charte. Poser nous-mêmes
 * la balise <a> avec nos couleurs désamorce cette réécriture, un style en ligne
 * ne pouvant pas être surchargé depuis une feuille de style.
 *
 * @param {string} adresse Adresse à afficher.
 * @return {string} Fragment HTML.
 */
function adresseStylisee_(adresse) {
  return '<a href="mailto:' + encodeURI(adresse) + '" style="color:' +
    CHARTE.BLEU_FONCE + ';font-weight:600;text-decoration:none;">' +
    echapper_(adresse) + '</a>';
}

/**
 * Échappe les caractères sensibles avant insertion dans du HTML.
 * Appliqué à toute donnée venant de Jira : un nom ou un motif saisi par un
 * demandeur ne doit pas pouvoir injecter de balise dans le message.
 *
 * @param {*} valeur Valeur à échapper.
 * @return {string} Chaîne sûre.
 */
function echapper_(valeur) {
  return String(valeur === null || valeur === undefined ? '' : valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Produit la version texte brut d'un message.
 *
 * Toujours envoyée en parallèle du HTML : certains clients d'entreprise
 * bloquent le HTML par défaut, et un message vide serait alors reçu.
 *
 * @param {!Object} o Mêmes options que construireEmail_.
 * @return {string} Corps en texte brut.
 */
function construireEmailTexte_(o) {
  const l = [];
  if (o.sousTitre) l.push(o.sousTitre.toUpperCase());
  l.push(o.titre.toUpperCase());
  l.push(new Array(Math.min(o.titre.length, 60) + 1).join('='));
  l.push('');

  (o.paragraphes || []).forEach(function (p) { l.push(nettoyerHtml_(p), ''); });
  (o.encadres || []).forEach(function (e) {
    l.push(e.label + ' : ' + nettoyerHtml_(e.valeur));
  });
  if (o.encadres && o.encadres.length) l.push('');
  (o.liste || []).forEach(function (i) { l.push('  - ' + nettoyerHtml_(i)); });
  if (o.liste && o.liste.length) l.push('');
  if (o.note) l.push(nettoyerHtml_(o.note), '');

  l.push('--', 'Message automatique — merci de ne pas répondre.',
    CHARTE.SIEGE, CHARTE.SITE);
  return l.join('\n');
}

/**
 * Retire les balises et rétablit les entités pour la version texte.
 * @param {string} html Fragment HTML.
 * @return {string} Texte brut.
 */
function nettoyerHtml_(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Construit une signature e-mail conforme à la charte (page 15).
 *
 * Destinée à être collée dans Gmail (Paramètres > Signature) : le HTML est
 * volontairement plat, sans <style> ni classes, car l'éditeur de signature
 * Gmail ne conserve que les styles en ligne.
 *
 * @param {!Object} p Coordonnées.
 * @param {string} p.nom Prénom et nom.
 * @param {string} p.fonction Intitulé de poste.
 * @param {string=} p.telephone Ligne fixe.
 * @param {string=} p.mobile Téléphone mobile.
 * @param {string} p.email Adresse professionnelle.
 * @param {string=} p.entite Entité ou site de rattachement.
 * @return {string} Fragment HTML de signature.
 */
function signatureEmailHtml_(p) {
  const ligne = function (contenu) {
    return '<div style="font-size:13px;line-height:19px;color:' + CHARTE.TEXTE +
      ';">' + contenu + '</div>';
  };
  // Signature posée sur fond blanc : seul le logo bleu y est conforme.
  const url = getLogoVariante_() === 'BLEU' ? getLogoUrl_() : '';

  return '' +
'<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
'style="border-collapse:collapse;font-family:' + CHARTE.POLICE + ';">' +
'<tr>' +

// Bloc identité, séparé du logo par le filet bleu de la charte
'<td style="padding:0 18px 0 0;vertical-align:top;">' +
(url
  ? '<img src="' + echapper_(url) + '" width="104" alt="Cooperl" ' +
    'style="display:block;width:104px;height:auto;border:0;" />'
  : '<span style="font-size:20px;font-weight:700;color:' + CHARTE.BLEU +
    ';">Cooperl</span>') +
'</td>' +

'<td style="padding:0 0 0 18px;border-left:2px solid ' + CHARTE.BLEU +
';vertical-align:top;">' +
'<div style="font-size:15px;line-height:20px;font-weight:700;color:' +
CHARTE.BLEU + ';">' + echapper_(p.nom) + '</div>' +
'<div style="font-size:13px;line-height:19px;color:' + CHARTE.TEXTE_SECONDAIRE +
';padding-bottom:8px;">' + echapper_(p.fonction) + '</div>' +
(p.telephone ? ligne(echapper_(p.telephone)) : '') +
(p.mobile ? ligne(echapper_(p.mobile)) : '') +
ligne('<a href="mailto:' + echapper_(p.email) + '" style="color:' +
  CHARTE.BLEU + ';font-weight:600;text-decoration:none;">' +
  echapper_(p.email) + '</a>') +
'<div style="padding-top:8px;font-size:12px;line-height:17px;color:' +
CHARTE.TEXTE_SECONDAIRE + ';">' +
(p.entite ? echapper_(p.entite) + '<br />' : '') +
echapper_(CHARTE.SIEGE) + '<br />' +
'<a href="https://' + CHARTE.SITE + '" style="color:' + CHARTE.BLEU +
';font-weight:600;text-decoration:none;">' + CHARTE.SITE + '</a>' +
'</div>' +
'<div style="padding-top:10px;font-size:11px;line-height:16px;font-style:italic;' +
'color:' + CHARTE.TEXTE_SECONDAIRE + ';">Pensons à la planète, n\'imprimons ' +
'ce mail que si nécessaire...</div>' +
'</td>' +

'</tr></table>';
}

/**
 * Envoie un message construit avec le gabarit, en HTML et en texte brut.
 *
 * @param {string} destinataire Adresse du destinataire.
 * @param {string} objet Objet du message.
 * @param {!Object} contenu Options passées à construireEmail_.
 * @return {boolean} true si l'envoi a réussi.
 */
function envoyerEmailCooperl_(destinataire, objet, contenu) {
  if (!destinataire) return false;
  try {
    MailApp.sendEmail({
      to: destinataire,
      subject: objet,
      name: 'Cooperl — Services numériques',
      body: construireEmailTexte_(contenu),
      htmlBody: construireEmail_(contenu)
    });
    return true;
  } catch (err) {
    console.error('Envoi impossible vers %s : %s', destinataire, err.message);
    return false;
  }
}