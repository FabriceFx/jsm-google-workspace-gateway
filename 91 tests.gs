/**
 * TESTS MANUELS
 * -----------------------------------------------------------------------------
 * Scénarios à lancer depuis l'éditeur. Aucun n'est appelé en production.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v2.6.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

/**
 * Affiche le planning résolu et simule l'ouverture heure par heure sur 7 jours.
 * Utile pour valider une surcharge PLANNING_* avant mise en production.
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
 *
 * Détecte : entrée mal référencée, action déclarée deux fois, champ manquant,
 * incohérence entre le nom de la fonction et le champ `action`.
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
 * Aucune donnée réelle n'est utilisée et aucun compte n'est créé.
 */
function test_apercuEmails() {
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
 * Vérifie que la configuration minimale est en place avant de lancer un test.
 * Sans cette garde, un test lancé sur un projet neuf échoue sur une pile
 * d'appels interne au lieu d'indiquer la marche à suivre.
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
 * Simule un appel Jira sans passer par le réseau. Modifier `payload` puis
 * exécuter depuis l'éditeur pour tester une action de bout en bout.
 *
 * ⚠️ Ce test n'est PAS une simulation à vide : le compte est réellement créé
 * dans l'annuaire. Adapter le domaine et vérifier que l'OU existe.
 */
function test_simulerAppelJira() {
  if (!testsPretsAExecuter_()) return;

  const payload = {
    secret_token: getProp_('SECRET_TOKEN'),
    action: 'CREATION_COMPTE',
    ticket_key: 'TEST-001',
    request_id: 'TEST-001-1',
    data: {
      prenom: 'Jean',
      nom: 'Dupont',
      email_souhaite: 'jean.dupont@exemple.fr',   // ADAPTER : domaine de votre annuaire
      // unite_organisationnelle : laissée vide → DEFAULT_OU, sinon '/'.
      // Chemins valides : voir admin_listerUnitesOrganisationnelles().
      manager_email: 'manager@exemple.fr'          // ADAPTER : reçoit le mot de passe
    }
  };

  const reponse = doPost({ postData: { contents: JSON.stringify(payload) } });
  console.log(reponse.getContent());
}

/**
 * Vérifie les garde-fous : token invalide, action inconnue, champs manquants.
 * N'effectue aucune écriture sur l'annuaire.
 */
function test_casDErreur() {
  if (!testsPretsAExecuter_()) return;

  const cas = [
    { libelle: 'Token invalide', payload: { secret_token: 'faux', action: 'SUSPENSION', data: {} } },
    { libelle: 'Action inconnue', payload: { secret_token: getProp_('SECRET_TOKEN'), action: 'INEXISTANTE', data: {} } },
    { libelle: 'Champ manquant', payload: { secret_token: getProp_('SECRET_TOKEN'), action: 'SUSPENSION', data: {} } },
    { libelle: 'E-mail invalide', payload: { secret_token: getProp_('SECRET_TOKEN'), action: 'SUSPENSION', data: { email_cible: 'pas-un-email' } } },
    { libelle: 'Corps absent', payload: null }
  ];

  cas.forEach(function (c) {
    const e = c.payload ? { postData: { contents: JSON.stringify(c.payload) } } : {};
    console.log('--- ' + c.libelle + ' ---\n' + doPost(e).getContent());
  });
}