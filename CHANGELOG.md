# Journal des modifications / Changelog

Tous les changements notables de ce projet sont documentés ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

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
