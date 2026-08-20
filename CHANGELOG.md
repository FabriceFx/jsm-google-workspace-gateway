# Journal des modifications / Changelog

Tous les changements notables de ce projet sont documentés ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [3.0.0] — 2026-08-20

### Boîte à outils Helpdesk, Drives partagés, Agendas & Kill-switch sécurité

> **Fini les 10 onglets ouverts dans Google Admin pour traiter un simple ticket.** L'agent Helpdesk ne perd plus 5 minutes par demande à naviguer dans l'annuaire pour vérifier un statut 2FA, ajouter un collègue à un Drive partagé ou partager l'agenda d'une assistante. Tout est exécuté et documenté en une seconde directement depuis le ticket Jira.

### Nouvelles Actions (portant le catalogue à 43 actions)

- **Diagnostic & Support Helpdesk** :
  - `INFO_COMPTE` : Fiche d'identité express d'un compte (statut actif/suspendu, 2FA enrôlé, OU, groupes directs, délégations, transferts, licences, dernier login) pour injection automatique en note Jira interne.
- **Drives partagés (Shared Drives)** :
  - `CREATION_DRIVE_PARTAGE` : Création instantanée d'un nouvel espace d'équipe avec gestionnaire initial.
  - `AJOUT_MEMBRE_DRIVE_PARTAGE` : Ajout d'un membre ou groupe avec permissions fines (`organizer`, `fileOrganizer`, `commenter`, `reader`).
  - `RETRAIT_MEMBRE_DRIVE_PARTAGE` : Révocation des accès sur un Drive partagé.
- **Calendriers Google** :
  - `PARTAGE_CALENDRIER` : Partage et délégation d'agendas (`reader`, `writer`, `owner`, `freeBusyReader`).
  - `RETRAIT_PARTAGE_CALENDRIER` : Suppression des partages d'agenda.
- **Cybersécurité & Mobilité interne** :
  - `URGENCE_COMPROMISSION` : **Kill-switch sécurité** neutralisant une menace en moins de 3 secondes (suspension + déconnexion forcée + révocation des tokens OAuth + blocage des téléphones).
  - `MUTATION_INTERNE` : Séquence orchestrée pour les mobilités de collaborateurs (changement d'OU + mise à jour du profil RH + bascule des groupes + alerte nouveau manager).
  - `ARCHIVAGE_COMPTE` : Déclassement d'un compte vers l'OU `/Archives` avec réassignation vers une licence d'archivage Google Vault (`Archived-User`) pour optimiser les coûts.

## [2.9.0] — 2026-08-20

### Banc d'essai & matrice de qualification opérationnelle

> **L'esprit libre au moment de brancher Jira.** Tu n'as plus à redouter le premier ticket d'onboarding ou de départ en production. Chaque action a son témoin vert, chaque comportement est vérifié, chaque retour est tracé : tu branches le webhook Jira avec la certitude absolue que toute la chaîne répond au millimètre.

### Ajouts & Améliorations

- **Matrice de recette interactive (Onglet « Banc d'Essai & Recette »)** :
  - Tableau de bord de qualification dynamique couvrant l'intégralité des 34 actions Google Workspace.
  - Sélecteurs de statuts opérationnels (🟢 *Validé / Opérationnel*, 🟡 *À tester*, 🔴 *En anomalie*, ⚪ *Non applicable*) persistés côté serveur via `ScriptProperties` (`RECETTE_STATUS_JSON`).
  - Jauges de suivi en temps réel (taux d'achèvement, actions validées, anomalies et reste à tester).
  - Saisie de notes et d'observations de test avec horodatage et identification automatique de l'administrateur testeur.
  - Boutons de bascule rapide vers la console d'exécution pour test direct et vers le guide Jira Automation.
  - Export instantané du procès-verbal de recette au format Markdown pour l'archivage de projet.
- **Fonctions d'administration & API de recette** :
  - Ajout des points d'entrée sécurisés `getStatutsRecette()`, `sauvegarderStatutRecette()` et `reinitialiserStatutsRecette()` dans `02 routeur.gs`, protégés par `assertAdminUI_()`.
- **Cahier de recette exhaustif bilingue (`RECETTE.md`)** :
  - Protocole de test et jeux de données recommandés pour chacune des 34 actions et groupes d'actions.

## [2.8.0] — 2026-08-12

Correctifs issus d'une revue d'expert de maturité (sécurité, correction, robustesse).

### Sécurité

- **SEC‑1 (critique) — Fermeture de l'exécution non authentifiée.** Les 34
  handlers d'action sont désormais des fonctions **privées** (suffixe `_`),
  donc **non appelables via `google.script.run`**. Avant, un détenteur de
  compte Google atteignant l'URL pouvait invoquer directement un handler
  (`actionSupprimerCompte_`…) avec les droits admin, en contournant le token,
  `assertAdminUI_` et `sanitizeData_`. Les fonctions de test à effet réel sont
  également gardées.
- Le `SECRET_TOKEN` n'est **plus jamais journalisé** (`setup_genererToken`) — il
  serait sinon persisté en clair dans Cloud Logging.
- Le health check public (`?format=json`) ne divulgue plus l'inventaire des
  actions ni l'état de configuration.

### Corrigé

- **DATA‑1 (critique) — Perte silencieuse d'attributs de schéma.** En mise à
  jour de profil, l'utilisateur est lu en projection `full` : la fusion des
  `customSchemas` ne repart plus d'un objet vide et **n'efface plus** les autres
  attributs (Matricule, accès…).
- **RENOMMER_COMPTE idempotent** : un rejeu Jira après renommage ne renvoie plus
  un faux `ALREADY_EXISTS` (comparaison des `id`).
- **REPONSE_ABSENCE** : la date de fin est désormais **incluse** (plus de coupure
  un jour trop tôt).

### Tests

- Nouveaux tests unitaires sur `construireProfilPatch_` (non-régression DATA‑1 :
  préservation des tableaux et des schémas) et sur l'ordre des motifs de
  `traduireErreurAdmin_`.

### Interface (UX‑1)

- **Recadrage sémantique** : la « Console de Test » devient la **Console
  d'administration** (le vocabulaire « simuler / tester » est retiré), avec une
  **bannière d'avertissement** rappelant que les actions s'exécutent réellement.
- **Confirmation modale** avant toute action destructive : la SPEC porte un flag
  `destructive` (exposé au catalogue), et la console demande une confirmation
  explicite rappelant l'action et la cible avant exécution.

## [2.7.0] — 2026-08-12

### Sécurité (correctifs critiques)

- **Console d'administration protégée.** Les fonctions exposées à
  `google.script.run` (`getSpecsCatalogue`, `executerActionDepuisUI`,
  `getWebhookUrl`, et les fonctions `admin_*`/`setup_*`) exigent désormais un
  contrôle d'identité (`assertAdminUI_`) : propriétaire du script ou adresse
  listée dans la nouvelle propriété **`ADMIN_UI_EMAILS`**. `executerActionDepuisUI`
  n'injecte plus le token sans cette vérification. Anti-clickjacking
  (`XFrameOptionsMode.DEFAULT`) et suppression de l'ID de déploiement codé en dur.
- **Fuite de secrets corrigée.** `manager_email` est désormais validé
  (format + domaine) dans `CREATION_COMPTE`, `RESET_MOT_DE_PASSE` et
  `GENERATION_CODES_SECOURS` : plus d'envoi d'identifiants vers un domaine externe.
- **XSS de la console** neutralisé (échappement systématique des données serveur
  et messages d'erreur injectés en `innerHTML`).

### Corrigé

- `isMember_` ne renvoie plus `false` que sur un vrai 404 (fin des faux succès
  sur `RETRAIT_GROUPE`).
- `type_effacement` validé + confirmation exigée pour un wipe usine de tous les
  appareils.
- Destinataire du secret contrôlé **avant** l'effet destructif (reset, codes 2FA).
- `MISE_A_JOUR_PROFIL` fusionne les tableaux `organizations`/`phones`/`relations`
  au lieu de les écraser.
- Dates ISO strictes pour la réponse d'absence ; révocations partielles isolées.

### Ajouté — 9 nouvelles actions et groupes (34 au total)

**Actions atomiques**
- **`RETRAIT_TOUS_GROUPES`** — Retire un compte de tous ses groupes (offboarding).
- **`DESACTIVATION_REPONSE_ABSENCE`**, **`ARRET_TRANSFERT_EMAILS`**,
  **`RETRAIT_DELEGATION_EMAIL`** — Les inverses des actions Gmail (retour d'absence).
- **`ATTRIBUTION_LICENCE`** / **`RETRAIT_LICENCE`** — Gestion des licences
  Workspace (une licence non retirée reste facturée). Propriétés `LICENSE_SKU_ID`
  / `LICENSE_PRODUCT_ID`, scope `apps.licensing`.

**Groupes d'action (séquences orchestrées, rapport étape par étape)**
- **`ARRIVEE_COLLABORATEUR`** — Onboarding : création + licence + groupes + alias.
- **`DEPART_COLLABORATEUR`** — Offboarding dans le bon ordre : transferts +
  délégation + retrait des groupes + suspension + retrait de licence.
- **`RETOUR_ABSENCE`** — Coupe réponse d'absence, transfert et délégation.

### Documentation

- **Guide d'intégration JSM entièrement refondu** pour un public novice :
  checklist des prérequis, principe illustré, création du **formulaire JSM et
  mapping des champs personnalisés**, création de la règle, structure du payload,
  traitement des réponses, tableau de dépannage des codes d'erreur, glossaire.
- Scope `admin.directory.orgunit.readonly` ajouté ; nouvelles propriétés
  documentées dans le README.

## [2.6.0] — 2026-08-12

### Ajouté — 19 nouvelles actions (25 au total)

Fini de jongler entre Jira et la console d'administration. Les agents JSM
peuvent désormais traiter la quasi-totalité des demandes courantes sans
quitter leur ticket.

**Cycle de vie du compte**
- **`CHANGEMENT_OU`** — Mutation, changement de service : un ticket suffit.
- **`MISE_A_JOUR_PROFIL`** — Nom, poste, manager, téléphone, département.
- **`RENOMMER_COMPTE`** — Mariage, erreur initiale. L'ancienne adresse
  reste en alias.
- **`SUPPRESSION_COMPTE`** — Départ définitif. Confirmation obligatoire
  (`CONFIRMER_SUPPRESSION`) pour éviter les catastrophes.

**Alias e-mail**
- **`AJOUT_ALIAS`** / **`RETRAIT_ALIAS`** — Adresses secondaires, noms
  de mariage, adresses fonctionnelles.

**Appareils mobiles**
- **`EFFACEMENT_APPAREIL`** — Vol, perte. Wipe complet ou retrait du
  compte pro. Fenêtre permanente.
- **`BLOCAGE_APPAREIL`** — Incident de sécurité, appareil suspect.
- **`APPROBATION_APPAREIL`** — Nouveau téléphone en attente.

**Sécurité**
- **`REVOCATION_TOKENS_APPS`** — Coupe l'accès des apps tierces suspectes
  sans suspendre le compte.
- **`GENERATION_CODES_SECOURS`** — Nouveaux codes 2FA envoyés par e-mail
  au manager. Les anciens sont révoqués.
- **`DECONNEXION_FORCEE`** — Sessions suspectes, le compte reste actif.

**Messagerie** (⚙️ nécessite un compte de service + DWD)
- **`DELEGATION_EMAIL`** — Accès à la boîte d'un absent.
- **`REPONSE_ABSENCE`** — Configure le message d'absence à la place de
  l'utilisateur.
- **`TRANSFERT_EMAILS`** — Redirection automatique vers une autre adresse.

**Drive**
- **`TRANSFERT_DRIVE`** — Transfère la propriété des fichiers Drive
  (process de départ).

**Groupes**
- **`CREATION_GROUPE`** / **`SUPPRESSION_GROUPE`** — Gestion du cycle de
  vie des groupes.
- **`LISTE_MEMBRES_GROUPE`** — Audit d'un groupe (lecture seule).

### Modifié

- `06 workspace.gs` enrichi : fonctions partagées pour appareils mobiles,
  envoi de codes de secours, impersonation Gmail via JWT/compte de service.
- `01 registre.gs` : catalogue structuré en 7 catégories avec commentaires.
- Version passée à 2.6.0.

## [2.5.3] — 2026-08-12

### Corrigé

- **Validation `fenetre` dans le registre** — La condition acceptait
  n'importe quelle chaîne (`'STANDART'`, `'permanente'`…) au lieu des seules
  valeurs `STANDARD` et `PERMANENTE`. Une faute de frappe dans une
  spécification d'action passait inaperçue au chargement du registre.
- **Chemin différé sans traduction d'erreurs** — La file d'attente appelait
  directement `spec.handler()`, contournant `appelerHandler_()` et sa
  traduction des erreurs Admin SDK. Les messages d'erreur sur les actions
  différées remontaient bruts (`"Resource Not Found"`) au lieu des consignes
  actionnables destinées à l'agent JSM.

### Ajouté

- **README bilingue** (FR/EN) — Prérequis, installation, configuration,
  ajout d'une action, tests, structure, sécurité.
- **CHANGELOG.md** — Historique des versions.
- **LICENSE** — Licence MIT.
- **`admin_aPropos()`** — Affiche les informations du projet et du
  développeur depuis l'éditeur Apps Script.

### Harmonisé

- Toutes les versions dans les en-têtes de fichiers sont alignées sur
  `CONFIG.VERSION` (2.5.3). Auparavant, certains fichiers portaient encore
  v2.2.0 ou v2.3.0.

## [2.5.2]

### Ajouté

- Vérification du logo hébergé (`admin_verifierLogo()`) : accessibilité
  anonyme, type MIME, poids, encodage du chemin.

## [2.5.0]

### Ajouté

- Gabarit d'e-mail chartée Cooperl (charte graphique complète).
- Version texte brut envoyée en parallèle du HTML.
- Signature e-mail conforme à la charte.
- Tests d'aperçu des e-mails (`test_apercuEmails()`).

## [2.4.0]

### Ajouté

- Routeur HTTP avec exécuteur partagé synchrone/différé.
- Dérogation hors créneau avec motif obligatoire (`force_immediat` +
  `motif_urgence`).

## [2.3.0]

### Ajouté

- Registre extensible des actions avec validation stricte des
  spécifications.
- Six actions métier : création de compte, ajout/retrait de groupe,
  suspension, réactivation, réinitialisation de mot de passe.
- Idempotence sur toutes les actions.

## [2.2.0]

### Ajouté

- File d'attente persistante dans Google Sheets.
- Créneaux d'administration configurables.
- Calcul des jours fériés français (Pâques algorithmique).
- Péremption et tentatives automatiques.
