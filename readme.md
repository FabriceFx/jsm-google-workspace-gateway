# Passerelle Jira Service Management → Google Workspace

> **v3.1.0** — Automatise les opérations d'administration Google Workspace
> déclenchées par les formulaires Jira Service Management.

*[English version below](#jira-service-management--google-workspace-gateway)*

---

## Présentation

Quand un agent JSM valide un ticket (arrivée, départ, demande d'accès,
réinitialisation de mot de passe, demande de Drive partagé…), Jira Automation
envoie un webhook POST vers cette webapp Google Apps Script. Le routeur
identifie l'action demandée, vérifie l'authentification et les données, puis
exécute l'opération via l'Admin SDK — le tout sans intervention manuelle.

### Actions disponibles (48 actions)

| Action | Description | Fenêtre |
|---|---|---|
| **Comptes** | | |
| `CREATION_COMPTE` | Crée un compte Workspace (profil complet), envoie le mot de passe par canal séparé | Standard |
| `CHANGEMENT_OU` | Déplace un compte dans une autre unité organisationnelle | Standard |
| `MISE_A_JOUR_PROFIL` | Met à jour nom, poste, service, société, centre de coûts, téléphones, manager, adresse, localisation, récupération, visibilité annuaire et **attributs personnalisés** | Standard |
| `RENOMMER_COMPTE` | Change l'adresse principale (l'ancienne devient alias) | Standard |
| `SUPPRESSION_COMPTE` | Supprime définitivement un compte (confirmation obligatoire) | Standard |
| **Groupes** | | |
| `AJOUT_GROUPE` | Ajoute un utilisateur à un groupe (MEMBER, MANAGER, OWNER) | Standard |
| `RETRAIT_GROUPE` | Retire un utilisateur d'un groupe | Permanente |
| `RETRAIT_TOUS_GROUPES` | Retire un utilisateur de tous ses groupes directs | Permanente |
| `CREATION_GROUPE` | Crée un nouveau groupe Google | Standard |
| `SUPPRESSION_GROUPE` | Supprime un groupe (confirmation obligatoire) | Standard |
| `LISTE_MEMBRES_GROUPE` | Liste les membres d'un groupe (lecture seule) | Permanente |
| `CONFIG_GROUPE` | Modifie les autorisations de publication, modération et accès externe via Groups Settings API | Standard |
| **Alias** | | |
| `AJOUT_ALIAS` | Ajoute un alias e-mail à un compte | Standard |
| `RETRAIT_ALIAS` | Supprime un alias e-mail d'un compte | Standard |
| **Sécurité** | | |
| `SUSPENSION` | Suspend un compte et révoque les sessions actives | Permanente |
| `REACTIVATION` | Réactive un compte précédemment suspendu | Standard |
| `RESET_MOT_DE_PASSE` | Réinitialise le mot de passe avec changement au 1er login | Standard |
| `DECONNEXION_FORCEE` | Déconnecte toutes les sessions (le compte reste actif) | Permanente |
| `REVOCATION_TOKENS_APPS` | Révoque les accès des applications tierces | Permanente |
| `GENERATION_CODES_SECOURS` | Génère de nouveaux codes 2FA (anciens révoqués) | Standard |
| **Appareils mobiles** | | |
| `EFFACEMENT_APPAREIL` | Efface à distance un appareil (vol, perte) | Permanente |
| `BLOCAGE_APPAREIL` | Bloque un appareil suspect | Permanente |
| `APPROBATION_APPAREIL` | Approuve un nouvel appareil en attente | Standard |
| **Messagerie** ⚙️ | | |
| `SIGNATURE_EMAIL` | Déploie automatiquement la signature HTML officielle Gmail (charte d'entreprise) ou personnalisée | Standard |
| `DELEGATION_EMAIL` | Donne accès à la boîte mail d'un utilisateur à un délégué | Standard |
| `RETRAIT_DELEGATION_EMAIL` | Retire l'accès d'un délégué à une boîte mail | Standard |
| `REPONSE_ABSENCE` | Active la réponse d'absence automatique | Standard |
| `DESACTIVATION_REPONSE_ABSENCE` | Désactive la réponse d'absence automatique | Standard |
| `TRANSFERT_EMAILS` | Redirige les e-mails entrants vers une autre adresse | Standard |
| `ARRET_TRANSFERT_EMAILS` | Désactive la redirection automatique des e-mails | Standard |
| **Diagnostic & Support** | | |
| `INFO_COMPTE` | Retourne la fiche diagnostic express d'un compte (statut, 2FA, OU, groupes, dernier login, synchro mobile) | Permanente |
| `AUDIT_ACCES_COMPLET` | Revue consolidée complète de tout le patrimoine d'accès (groupes, Drives partagés, agendas, délégations, licences, mobiles, OAuth) | Permanente |
| **Drive & Drives partagés** | | |
| `TRANSFERT_DRIVE` | Transfère la propriété des fichiers Drive à un autre utilisateur | Standard |
| `CREATION_DRIVE_PARTAGE` | Crée un nouveau Shared Drive et lui assigne son gestionnaire initial | Standard |
| `AJOUT_MEMBRE_DRIVE_PARTAGE` | Ajoute un membre ou un groupe à un Drive partagé avec rôle (organizer, fileOrganizer, commenter, reader) | Standard |
| `RETRAIT_MEMBRE_DRIVE_PARTAGE` | Révoque l'accès d'un membre à un Drive partagé | Permanente |
| **Calendriers & Salles** | | |
| `PARTAGE_CALENDRIER` | Accorde l'accès à un agenda Google Calendar (lecture, modification, gestion) | Standard |
| `RETRAIT_PARTAGE_CALENDRIER` | Révoque l'accès d'un collaborateur à un agenda | Permanente |
| `CREATION_RESSOURCE_CALENDRIER` | Crée une nouvelle salle de réunion ou ressource d'entreprise réservable | Standard |
| `SUPPRESSION_RESSOURCE_CALENDRIER` | Supprime définitivement une ressource de calendrier ou salle | Standard |
| **Licences & Archivage** | | |
| `ATTRIBUTION_LICENCE` | Attribue une licence Workspace à un utilisateur | Standard |
| `RETRAIT_LICENCE` | Libère la licence d'un utilisateur (facturée tant qu'assignée) | Standard |
| `ARCHIVAGE_COMPTE` | Archive un compte : déplacement dans `/Archives`, libération licence standard et attribution licence Archived User | Standard |
| **Groupes d'action** (séquences orchestrées) | | |
| `ARRIVEE_COLLABORATEUR` | Onboarding : création du compte + licence + groupes + alias, dans l'ordre | Standard |
| `DEPART_COLLABORATEUR` | Offboarding : transferts + délégation + retrait groupes + suspension + retrait licence | Permanente |
| `RETOUR_ABSENCE` | Coupe réponse d'absence, transfert et délégation posés au départ | Standard |
| `URGENCE_COMPROMISSION` | Kill-switch sécurité : suspension + déconnexion + révocation OAuth + blocage appareils | Permanente |
| `MUTATION_INTERNE` | Mobilité interne : déplacement OU + profil RH + retrait anciens groupes + ajout nouveaux groupes | Standard |

> ⚙️ Les actions **Messagerie** nécessitent un compte de service avec
> délégation de domaine (voir section « Actions Gmail »).
>
> 👥 **Groupes dynamiques** : un groupe dont l'appartenance est calculée
> automatiquement par une requête (membres dérivés des attributs des comptes)
> **n'accepte ni ajout ni retrait manuel** de membre. `AJOUT_GROUPE` et
> `RETRAIT_GROUPE` renvoient alors un message explicite `GROUPE_DYNAMIQUE`
> (au lieu d'une erreur brute), et `RETRAIT_TOUS_GROUPES` **saute** ces groupes
> sans les compter en échec (listés dans `details.dynamiques`). Pour changer
> l'appartenance, ajuster les attributs du compte (service, OU…) ou la règle du
> groupe dans la console d'administration.
>
> 🧩 Les **attributs personnalisés** (création et mise à jour de profil)
> peuvent être fournis de deux façons, combinables : un objet JSON
> `custom_schemas` (`{"NomSchema": {"Champ": valeur}}`), ou des **champs plats**
> plus simples pour Jira et les listes déroulantes (`rh_matricule`, `rh_statut`,
> `rh_site_paie`, `rh_cse`, `acces_jira`, `acces_confluence`, `acces_lumapps`…),
> repliés dans les bons schémas via `MAPPING_SCHEMAS_PERSO` (00_Config.gs — **à
> adapter à vos schémas**). Les schémas doivent **exister au préalable** dans la
> console d'administration (Annuaire > Gérer les attributs personnalisés).
>
> 🏢 La console propose des **listes déroulantes dynamiques** pour l'unité
> organisationnelle (OU) et le bâtiment (buildingId), peuplées en direct depuis
> Google. Le bâtiment nécessite le scope
> `admin.directory.resource.calendar.readonly` (réautoriser après mise à jour du
> manifeste).
>
> 📝 **Modifier les valeurs des listes déroulantes** : tout est regroupé dans
> l'objet `LISTES`, en tête du `<script>` de `ui_test.html` (bloc « LISTES
> DÉROULANTES — SEUL ENDROIT À MODIFIER »). Format : `{ val: 'valeur envoyée',
> txt: 'texte affiché' }`. Une **liste vide `[]`** rend le champ en saisie libre
> (et, pour l'OU, en liste dynamique). Concernés : `societe`, `centre_cout`,
> `statut`, `cse`, `fonction_transversale`, `ou`, plus les listes techniques
> (`role_groupe`, `type_effacement`…).
>
> 💡 **Listes alimentées depuis l'annuaire** : `societe`, `departement`,
> `centre_cout`, `org_description`, `statut`, `cse`, `fonction_transversale`
> s'affichent en **menus déroulants** peuplés avec les valeurs déjà présentes
> dans les comptes (comme l'OU). Priorité : une liste curée dans `LISTES` (non
> vide) l'emporte ; sinon la liste dynamique s'affiche. Les valeurs sont
> extraites en **une seule** énumération de l'annuaire, **mise en cache 6 h**
> (attention : elles reflètent les données telles quelles, variantes/fautes
> comprises). `admin_viderCacheSuggestions()` force le rafraîchissement.

**Fenêtre Standard** : exécution immédiate pendant les créneaux d'administration
(lun.–ven. 8h30–17h30, sauf jours fériés français). Hors créneau, la demande
est mise en file d'attente pour exécution automatique au prochain créneau.

**Fenêtre Permanente** : exécution immédiate 24 h/24, 7 j/7. Réservée aux
actions de sécurité (suspension, retrait d'accès) et aux lectures qui ne
doivent jamais être différées.

### Groupes d'action

Un **groupe d'action** enchaîne plusieurs actions atomiques dans le bon ordre,
en un seul ticket. Sa valeur n'est pas seulement d'économiser des tickets :
c'est d'**encoder la séquence correcte** que l'agent devrait sinon connaître de
tête (par exemple, sur un départ, poser transferts et délégation *pendant que le
compte est actif*, et suspendre *en dernier*).

- Les groupes **réutilisent** les handlers atomiques : aucune logique dupliquée.
- Ils héritent de leur **idempotence** — rejouer un groupe est sûr (les étapes
  déjà faites se signalent, les étapes en échec sont réessayées).
- Politique **continue-on-error avec rapport** : on fait le maximum ; le détail
  étape par étape figure dans `details.etapes`, et toute étape en échec fait
  remonter un statut d'erreur récapitulatif à Jira (pour relance).

Groupes disponibles : `ARRIVEE_COLLABORATEUR` (onboarding),
`DEPART_COLLABORATEUR` (offboarding), `RETOUR_ABSENCE`, `URGENCE_COMPROMISSION` (kill-switch sécurité), `MUTATION_INTERNE` (mobilité interne RH).

## Prérequis

- Un projet Google Apps Script avec le **service avancé Admin SDK API** activé
- Un compte Google Workspace avec les **droits d'administration** nécessaires
  (super-admin ou admin délégué avec droits utilisateurs et groupes)
- Un **classeur Google Sheets** pour le journal d'audit et la file d'attente
- Une règle **Jira Automation** configurée pour envoyer un webhook POST

## Installation

1. **Créer le projet Apps Script**
   Copier l'ensemble des fichiers `.gs` dans un nouveau projet Apps Script.

2. **Activer le service avancé**
   Dans l'éditeur Apps Script : **Services > Admin SDK API > Ajouter**.

3. **Configurer le fuseau horaire**
   Paramètres du projet → Fuseau horaire : `Europe/Paris`.

4. **Générer le secret d'authentification**
   Exécuter `setup_genererToken()` depuis l'éditeur. Copier le token affiché
   dans les logs.

5. **Renseigner les propriétés du script**
   Paramètres du projet → Propriétés du script :

   | Propriété | Obligatoire | Description |
   |---|---|---|
   | `SECRET_TOKEN` | ✅ | Généré à l'étape 4 (authentification du webhook) |
   | `AUDIT_SHEET_ID` | ✅ | ID du classeur Google Sheets d'audit et file d'attente |
   | `ALLOWED_DOMAINS` | ✅ | Domaines Workspace autorisés, séparés par des virgules |
   | `ADMIN_UI_EMAILS` | ✅ (console) | Adresses admin autorisées à utiliser la console de test, séparées par des virgules |
   | `NOTIFY_EMAIL` | Recommandé | Adresse de notification (anomalies, mots de passe) |
   | `JIRA_BASE_URL` | Optionnel | URL de base Jira Cloud (ex: `https://mon-domaine.atlassian.net`) pour les callbacks automatiques |
   | `JIRA_USER_EMAIL` | Optionnel | E-mail du compte de service / admin Jira pour le callback |
   | `JIRA_API_TOKEN` | Optionnel | Jeton d'API REST Jira Cloud |
   | `JIRA_AUTO_RESOLVE` | Optionnel | `true` pour passer automatiquement les tickets Jira à l'état Résolu après exécution |
   | `LICENSE_SKU_ID` | Optionnel | SKU de licence par défaut (actions de licence). Voir `admin_listerLicences()` |
   | `LICENSE_SKU_ARCHIVE` | Optionnel | SKU de licence d'archivage Google Vault (ex. `1010020030`) pour `ARCHIVAGE_COMPTE` |
   | `LICENSE_PRODUCT_ID` | Optionnel | Produit de licence (défaut `Google-Apps`) |
   | `LICENSE_CUSTOMER_ID` | Optionnel | Client pour lister les licences (domaine principal). À défaut, 1er `ALLOWED_DOMAINS` |
   | `DEFAULT_OU` | Optionnel | Unité organisationnelle par défaut (ex. `/Collaborateurs`) |
   | `LOGO_URL` | Optionnel | URL publique du logo d'entreprise pour les e-mails et signatures |
   | `LOGO_VARIANTE` | Optionnel | `BLANC` (défaut) ou `BLEU` selon le fichier hébergé |
   | `RESPECT_JOURS_FERIES` | Optionnel | `true` (défaut) ou `false` |
   | `JOURS_FERMETURE` | Optionnel | Dates ISO de fermeture entreprise, séparées par des virgules |
   | `SERVICE_ACCOUNT_EMAIL` | Optionnel | E-mail du compte de service avec DWD (actions Gmail & Signatures) |
   | `SERVICE_ACCOUNT_KEY` | Optionnel | Clé privée PEM du compte de service |

6. **Installer le déclencheur**
   Exécuter `setup_installerDeclencheur()` pour créer le trigger de vidange
   de la file d'attente (toutes les 15 minutes par défaut).

7. **Déployer la webapp**
   Déployer → Nouveau déploiement → Application Web.
   Exécuter en tant que : *vous-même*. Accès : *tout le monde*.

   > ⚠️ **Sécurité de la console.** L'accès *tout le monde* est requis par le
   > webhook : Jira appelle `doPost` sans session Google, l'authentification y
   > reposant sur le `SECRET_TOKEN`. La **même URL** sert aussi la console
   > d'administration (`doGet` + fonctions `google.script.run`), qui s'exécutent
   > avec **vos droits d'administration**. Ces fonctions sont donc protégées par
   > un contrôle d'identité (`assertAdminUI_`) : seul le propriétaire du script
   > (depuis l'éditeur) et les adresses listées dans **`ADMIN_UI_EMAILS`**
   > peuvent les invoquer. **Renseignez `ADMIN_UI_EMAILS`** avec les adresses
   > des administrateurs habilités, sans quoi la console reste inutilisable
   > depuis le navigateur (par sécurité).

8. **Configurer Jira Automation**
   Créer une règle avec l'action « Send web request » pointant vers l'URL
   du déploiement, en POST, Content-Type `application/json`.

9. **Vérifier**
   Exécuter `setup_verifierConfiguration()` pour contrôler que tout est en place.

## Configuration côté Jira

Le webhook doit envoyer un JSON de cette forme :

```json
{
  "secret_token": "votre-token",
  "action": "CREATION_COMPTE",
  "ticket_key": "{{issue.key}}",
  "request_id": "{{issue.key}}-{{now.epochMillis}}",
  "data": {
    "prenom": "{{issue.Prénom}}",
    "nom": "{{issue.Nom}}",
    "email_souhaite": "{{issue.Email souhaité}}",
    "issue_key": "{{issue.key}}"
  }
}
```

Champs optionnels avancés :
- `date_execution` : `"2026-09-30T18:00:00Z"` pour programmer l'exécution automatique à une date et heure future.
- `force_immediat` : `true` pour forcer l'exécution hors créneau d'administration.
- `motif_urgence` : obligatoire si `force_immediat` est vrai (tracé dans l'audit).
- `issue_key` : clé du ticket Jira pour le callback automatique de note interne et clôture.

## Ajouter une action

1. Créer un fichier `1x action monaction.gs` contenant :
   - Une fonction `SPEC_MON_ACTION()` retournant la spécification
   - Une fonction handler exécutant l'opération

2. Ajouter `SPEC_MON_ACTION` dans `declarationsFormulaires_()` de
   [01 registre.gs](01%20registre.gs). C'est le **seul** fichier existant à
   modifier.

3. Vérifier avec `test_verifierRegistre()`.

## Tests, Console WebApp & Présentation Interactive

Vous pouvez tester l'ensemble du système **avant même de configurer Jira** :

### 1. Console WebApp Interactive & Banc d'Essai
En ouvrant l'URL du déploiement WebApp (`https://script.google.com/macros/s/.../exec`) directement dans votre navigateur web, vous accédez à :
- **Onglet 1 — Console d'administration** : sélection dynamique parmi les **48 actions**, formulaires intelligents pré-remplis (« Remplir avec un exemple »), test d'exécution programmée et exécution réelle.
- **Onglet 2 — Banc d'Essai & Recette** : matrice de qualification opérationnelle des 48 actions avec sélecteurs de conformité (🟢 Validé, 🟡 À tester, 🔴 Anomalie), suivi du taux d'achèvement et export du PV de recette.
- **Onglet 3 — Guide d'Intégration JSM** : documentation Jira Automation générée dynamiquement avec les composants JSON prêts à copier-coller.
- **Présentation & Schéma Directeur** (`?page=presentation` ou via le bouton d'en-tête) : synthèse visuelle et schémas d'architecture SVG interactifs.

*(Note : pour obtenir la réponse de supervision JSON à destination de vos outils de monitoring, ajoutez `?format=json` à l'URL).*

### 2. Fonctions de test Apps Script

| Fonction | Rôle |
|---|---|
| `test_unitaires()` | **Suite de tests automatiques** (assertions pures, 79 tests, aucun effet réel) |
| `setup_verifierConfiguration()` | Diagnostic complet de la configuration |
| `admin_verifierApis()` | **Smoke test des API** en lecture seule (Directory, Gmail, Licensing, Data Transfer, Calendar) |
| `admin_viderCacheSuggestions()` | Force le rafraîchissement des autocomplétions (après nettoyage de données) |
| `test_verifierRegistre()` | Validation du catalogue des actions |
| `test_verifierPlanning()` | Simulation des créneaux sur 7 jours |
| `test_casDErreur()` | Vérifie les garde-fous (token, action, champs) par assertions |
| `test_apercuEmails()` | Envoi d'e-mails de test à votre adresse (**⚠️ effet réel**) |
| `test_simulerCreationCompteReelle()` | Simulation de bout en bout (**⚠️ crée un vrai compte** ; désactivée par défaut) |

## Actions Gmail (configuration avancée)

Les actions **DELEGATION_EMAIL**, **REPONSE_ABSENCE** et **TRANSFERT_EMAILS**
modifient les paramètres Gmail d'un autre utilisateur. Contrairement à l'Admin
SDK, la Gmail API exige une autorisation *au nom de* l'utilisateur cible :

1. Créer un compte de service dans le projet GCP lié au script
2. Activer la délégation de domaine (*domain-wide delegation*) pour ce compte
   dans la console d'administration (Sécurité > API Controls)
3. Autoriser les scopes :
   - `https://www.googleapis.com/auth/gmail.settings.basic`
   - `https://www.googleapis.com/auth/gmail.settings.sharing`
4. Télécharger la clé JSON du compte de service
5. Renseigner dans les propriétés du script :
   - `SERVICE_ACCOUNT_EMAIL` : l'adresse du compte de service
   - `SERVICE_ACCOUNT_KEY` : le contenu du champ `private_key` du fichier JSON

Sans cette configuration, les 3 actions Gmail renvoient une erreur explicite.
Toutes les autres actions fonctionnent uniquement avec l'Admin SDK.

## Structure des fichiers

```
00 config.gs                 Constantes, accès PropertiesService
01 registre.gs               Catalogue des actions, validation des specs
02 routeur.gs                doPost / doGet, exécuteur sous verrou
03 securite.gs               Auth, validation, AppError_, réponse JSON
04 planning.gs               Créneaux horaires, jours fériés français
05 fileattente.gs            File d'attente persistante (Google Sheets)
06 workspace.gs              Briques Admin SDK, Gmail API, traduction erreurs
07 journal.gs                Journal d'audit, notifications d'anomalies
08 email.gs                  Gabarit e-mail chartée Cooperl (signatures incluses)
09 jira.gs                   Module de callback & notifications Jira Cloud
10 action creationcompte     Création de compte Workspace
11 action ajoutgroupe        Ajout à un groupe
12 action retraitgroupe      Retrait d'un groupe
13 action suspension         Suspension + révocation de sessions
14 action reactivation       Réactivation de compte
15 action resetmotdepasse    Réinitialisation de mot de passe
16 action changementou       Changement d'unité organisationnelle
17 action miseajourprofil    Mise à jour du profil (nom, poste, manager…)
18 action renommercompte     Changement d'adresse e-mail
19 action suppressioncompte  Suppression définitive de compte
20 action ajoutalias         Ajout d'alias e-mail
21 action retraitalias       Retrait d'alias e-mail
22 action effacementappareil Effacement à distance d'appareil mobile
23 action blocageappareil    Blocage d'appareil mobile
24 action approbationappareil Approbation d'appareil mobile
25 action revocationtokens   Révocation des apps tierces
26 action codesecours        Génération de codes 2FA
27 action deconnexionforcee  Déconnexion de toutes les sessions
28 action delegationemail    Délégation de boîte mail
29 action reponseabsence     Réponse d'absence automatique
30 action transfertemails    Redirection d'e-mails
31 action transfertdrive     Transfert de propriété Drive
32 action creationgroupe     Création de groupe
33 action suppressiongroupe  Suppression de groupe
34 action listemembregroupe  Liste des membres d'un groupe
35 action retraittousgroupes Retrait de tous les groupes (offboarding)
36 action arretreponseabsence Désactivation de la réponse d'absence
37 action arrettransfertemails Arrêt de la redirection d'e-mails
38 action retraitdelegation  Retrait d'une délégation de boîte mail
39 orchestration.gs          Helper des groupes d'action (executerEtapes_)
40 groupe departcollaborateur Groupe d'action : offboarding complet
41 groupe retourabsence      Groupe d'action : retour d'absence
42 action attributionlicence Attribution d'une licence Workspace
43 action retraitlicence     Libération d'une licence Workspace
44 groupe arriveecollaborateur Groupe d'action : onboarding complet
45 action infocompte.gs      Fiche d'identité et diagnostic de compte
46 action ajoutmembredrivepartage.gs Ajout de membre sur Drive partagé
47 action retraitmembredrivepartage.gs Retrait de membre sur Drive partagé
48 action creationdrivepartage.gs Création de Drive partagé
49 action partagecalendrier.gs Partage et délégation d'agenda
50 action retraitpartagecalendrier.gs Révocation de partage d'agenda
51 groupe urgencecompromission.gs Groupe d'action : kill-switch sécurité
52 groupe mutationinterne.gs Groupe d'action : mobilité interne RH
53 action archivagecompte.gs Déclassement et licence Archived User
54 action signatureemail.gs  Signature d'e-mail automatique (charte Gmail)
55 action auditaccescomplet.gs Revue consolidée de tout le patrimoine d'accès
56 action configgroupe.gs    Configuration et modération des groupes (API Groups Settings)
57 action creationressourcecalendrier.gs Création de ressource de calendrier / salle
58 action suppressionressourcecalendrier.gs Suppression de ressource de calendrier
90 administration.gs         Fonctions de pilotage manuel
91 tests.gs                  Tests (unitaires + diagnostics manuels)
ui_test.html                 Console WebApp, simulateur & banc d'essai
presentation.html            Présentation visuelle & schéma d'architecture interactif
```

## Sécurité

- Les secrets sont stockés dans `PropertiesService`, jamais dans le code
- L'authentification utilise une comparaison à **temps constant**
- Les mots de passe ne transitent **jamais** dans la réponse HTTP
- Tout contenu externe est **échappé** avant insertion dans du HTML
- Les erreurs internes ne sont **jamais** exposées à Jira

## Licence

MIT — Voir le fichier LICENSE pour les détails.

## Auteur

**Fabrice Faucheux** — [https://faucheux.bzh](https://faucheux.bzh)

---

# Jira Service Management → Google Workspace gateway

> **v3.1.0** — Automates Google Workspace administration operations triggered
> by Jira Service Management forms.

## Overview

When a JSM agent validates a ticket (onboarding, offboarding, access request,
password reset, email signature, Shared Drive or Calendar resource creation…), Jira Automation sends a POST webhook to this Google Apps
Script webapp. The router identifies the requested action, verifies
authentication and data, then executes the operation via the Admin SDK — all
without manual intervention.

### Available actions (48 actions)

| Action | Description | Window |
|---|---|---|
| **Accounts** | | |
| `CREATION_COMPTE` | Creates a Workspace account (full profile) and sends credentials via separate channel | Standard |
| `CHANGEMENT_OU` | Moves an account to another organisational unit | Standard |
| `MISE_A_JOUR_PROFIL` | Updates name, job title, department, company, cost centre, phones, manager, address, recovery, directory visibility & **custom attributes** | Standard |
| `RENOMMER_COMPTE` | Renames primary email address (old address preserved as alias) | Standard |
| `SUPPRESSION_COMPTE` | Permanently deletes an account (mandatory confirmation) | Standard |
| **Groups** | | |
| `AJOUT_GROUPE` | Adds a user to a group (MEMBER, MANAGER, OWNER) | Standard |
| `RETRAIT_GROUPE` | Removes a user from a group | Permanent |
| `RETRAIT_TOUS_GROUPES` | Removes a user from all direct groups | Permanent |
| `CREATION_GROUPE` | Creates a new Google Group | Standard |
| `SUPPRESSION_GROUPE` | Deletes a group (mandatory confirmation) | Standard |
| `LISTE_MEMBRES_GROUPE` | Lists group members (read-only) | Permanent |
| `CONFIG_GROUPE` | Updates posting permissions, moderation and external access via Groups Settings API | Standard |
| **Aliases** | | |
| `AJOUT_ALIAS` | Adds an email alias to an account | Standard |
| `RETRAIT_ALIAS` | Removes an email alias from an account | Standard |
| **Security** | | |
| `SUSPENSION` | Suspends an account and revokes all active sessions | Permanent |
| `REACTIVATION` | Reactivates a previously suspended account | Standard |
| `RESET_MOT_DE_PASSE` | Resets account password with mandatory change at next login | Standard |
| `DECONNEXION_FORCEE` | Forces sign-out across all sessions (account remains active) | Permanent |
| `REVOCATION_TOKENS_APPS` | Revokes third-party application OAuth tokens | Permanent |
| `GENERATION_CODES_SECOURS` | Generates new 2FA backup verification codes | Standard |
| **Mobile devices** | | |
| `EFFACEMENT_APPAREIL` | Remote wipes a mobile device (lost or stolen) | Permanent |
| `BLOCAGE_APPAREIL` | Blocks access for a suspicious mobile device | Permanent |
| `APPROBATION_APPAREIL` | Approves a pending mobile device registration | Standard |
| **Email & Messaging** ⚙️ | | |
| `SIGNATURE_EMAIL` | Automatically deploys company-branded HTML email signature or custom signature | Standard |
| `DELEGATION_EMAIL` | Grants mailbox delegation access to another user | Standard |
| `RETRAIT_DELEGATION_EMAIL` | Revokes mailbox delegation access | Standard |
| `REPONSE_ABSENCE` | Enables automatic out-of-office vacation responder | Standard |
| `DESACTIVATION_REPONSE_ABSENCE` | Disables vacation responder | Standard |
| `TRANSFERT_EMAILS` | Enables email forwarding to another address | Standard |
| `ARRET_TRANSFERT_EMAILS` | Disables automatic email forwarding | Standard |
| **Diagnostic & Support** | | |
| `INFO_COMPTE` | Returns diagnostic summary of an account (status, 2FA, OU, groups, last login, mobile sync) | Permanent |
| `AUDIT_ACCES_COMPLET` | Complete consolidated audit of user access assets (groups, Shared Drives, calendars, delegations, licenses, mobile devices, OAuth tokens) | Permanent |
| **Drive & Shared Drives** | | |
| `TRANSFERT_DRIVE` | Transfers file ownership in Google Drive to another user | Standard |
| `CREATION_DRIVE_PARTAGE` | Creates a new Shared Drive and assigns its initial manager | Standard |
| `AJOUT_MEMBRE_DRIVE_PARTAGE` | Adds a user or group to a Shared Drive with specific role | Standard |
| `RETRAIT_MEMBRE_DRIVE_PARTAGE` | Revokes a member's access from a Shared Drive | Permanent |
| **Calendars & Room Resources** | | |
| `PARTAGE_CALENDRIER` | Shares a Google Calendar with specific permissions | Standard |
| `RETRAIT_PARTAGE_CALENDRIER` | Revokes calendar sharing access | Permanent |
| `CREATION_RESSOURCE_CALENDRIER` | Creates a new bookable meeting room or company equipment resource | Standard |
| `SUPPRESSION_RESSOURCE_CALENDRIER` | Deletes a calendar resource or meeting room | Standard |
| **Licensing & Archiving** | | |
| `ATTRIBUTION_LICENCE` | Assigns a Workspace license SKU to a user | Standard |
| `RETRAIT_LICENCE` | Releases a Workspace license SKU | Standard |
| `ARCHIVAGE_COMPTE` | Archives an account: moves to `/Archives`, frees standard license, and assigns Google Vault Archived User license | Standard |
| **Orchestrated Action Groups** | | |
| `ARRIVEE_COLLABORATEUR` | Full onboarding sequence: create account + license + groups + aliases in ordered steps | Standard |
| `DEPART_COLLABORATEUR` | Full offboarding sequence: forwarding + delegation + remove groups + suspend + release license | Permanent |
| `RETOUR_ABSENCE` | Disables vacation responder, forwarding and delegation set during departure | Standard |
| `URGENCE_COMPROMISSION` | Security kill-switch: suspend + sign-out + revoke OAuth tokens + block mobile devices | Permanent |
| `MUTATION_INTERNE` | Internal mobility: move OU + update HR profile + remove previous groups + add new groups | Standard |

> ⚙️ **Email actions** require a GCP Service Account with Domain-Wide Delegation (see "Gmail Service Account Setup" below).

**Scheduled execution**: pass `date_execution: "2026-09-30T18:00:00Z"` in payload to schedule an action or orchestrated group at an exact future date/time.

**Jira closed-loop callback**: automatically adds an internal comment to the Jira ticket (`issue_key`) and can auto-resolve it upon successful completion.

**Standard window**: immediate execution during admin hours (Mon–Fri 8:30–17:30, excluding French public holidays). Outside hours, requests are queued for automatic execution at the next open slot.

**Permanent window**: immediate execution 24/7. Reserved for security actions (suspension, revocation) and read-only operations.

## Prerequisites

- A Google Apps Script project with the **Admin SDK API** advanced service enabled
- A Google Workspace account with the appropriate **admin privileges**
  (super-admin or delegated admin with user and group management rights)
- A **Google Sheets** spreadsheet for the audit log and queue
- A **Jira Automation** rule configured to send a POST webhook

## Setup

1. **Create the Apps Script project**
   Copy all `.gs` and `.html` files into a new Apps Script project.

2. **Enable the advanced service**
   In the Apps Script editor: **Services > Admin SDK API > Add**.

3. **Set the timezone**
   Project Settings → Time zone: `Europe/Paris`.

4. **Generate the authentication secret**
   Run `setup_genererToken()` from the editor. Copy the token shown in the logs.

5. **Set up script properties**
   Project Settings → Script properties:

   | Property | Required | Description |
   |---|---|---|
   | `SECRET_TOKEN` | ✅ | Generated in step 4 (webhook bearer secret) |
   | `AUDIT_SHEET_ID` | ✅ | Google Sheets spreadsheet ID for audit log and queue |
   | `ALLOWED_DOMAINS` | ✅ | Allowed Workspace domains, comma-separated |
   | `ADMIN_UI_EMAILS` | ✅ (console) | Admin email addresses authorized to use the web console |
   | `NOTIFY_EMAIL` | Recommended | Notification address (alerts, credentials) |
   | `JIRA_BASE_URL` | Optional | Jira Cloud instance URL (e.g. `https://domain.atlassian.net`) for callbacks |
   | `JIRA_USER_EMAIL`| Optional | Jira user email for REST API callback |
   | `JIRA_API_TOKEN` | Optional | Jira Cloud API token |
   | `JIRA_AUTO_RESOLVE` | Optional | `true` to auto-resolve Jira issues upon successful execution |
   | `LICENSE_SKU_ID` | Optional | Default license SKU for assignment. See `admin_listerLicences()` |
   | `LICENSE_SKU_ARCHIVE` | Optional | Archived User SKU ID (e.g. `1010020030`) for `ARCHIVAGE_COMPTE` |
   | `LICENSE_PRODUCT_ID` | Optional | License product ID (default `Google-Apps`) |
   | `LICENSE_CUSTOMER_ID` | Optional | Customer ID for license listing (default: 1st `ALLOWED_DOMAINS`) |
   | `DEFAULT_OU` | Optional | Default organisational unit (e.g. `/Employees`) |
   | `LOGO_URL` | Optional | Public URL of company logo for emails and HTML signatures |
   | `LOGO_VARIANTE` | Optional | `BLANC` (default) or `BLEU` |
   | `RESPECT_JOURS_FERIES` | Optional | `true` (default) or `false` |
   | `JOURS_FERMETURE` | Optional | ISO dates for company closure days, comma-separated |
   | `SERVICE_ACCOUNT_EMAIL` | Optional | GCP Service Account email with DWD (Gmail & Signature actions) |
   | `SERVICE_ACCOUNT_KEY` | Optional | Private key PEM string of the GCP Service Account |

6. **Install the trigger**
   Run `setup_installerDeclencheur()` to create the queue processing trigger
   (every 15 minutes by default).

7. **Deploy the webapp**
   Deploy → New deployment → Web app.
   Execute as: *yourself*. Access: *anyone*.

8. **Configure Jira Automation**
   Create a rule with the "Send web request" action pointing to the deployment
   URL, as POST, Content-Type `application/json`.

9. **Verify**
   Run `setup_verifierConfiguration()` to check everything is in place.

## Jira Webhook Configuration

The Jira Automation rule sends a JSON payload structured as follows:

```json
{
  "secret_token": "your-secret-token",
  "action": "CREATION_COMPTE",
  "ticket_key": "{{issue.key}}",
  "request_id": "{{issue.key}}-{{now.epochMillis}}",
  "data": {
    "prenom": "{{issue.Prénom}}",
    "nom": "{{issue.Nom}}",
    "email_souhaite": "{{issue.Email souhaité}}",
    "issue_key": "{{issue.key}}"
  }
}
```

Advanced payload parameters:
- `date_execution`: ISO 8601 string (e.g. `"2026-09-30T18:00:00Z"`) to schedule automated execution at a specific future date and time.
- `force_immediat`: `true` to force execution outside standard admin hours.
- `motif_urgence`: mandatory when `force_immediat` is true (logged for audit).
- `issue_key`: Jira ticket key for closed-loop callback note and auto-resolution.

## Testing & Interactive WebApp

You can test the entire platform without sending webhooks from Jira:

### 1. Interactive Web Console & Test Bench
Opening the WebApp deployment URL (`https://script.google.com/macros/s/.../exec`) in your web browser provides:
- **Tab 1 — Admin Console**: live dynamic execution across all **48 actions** with auto-fill examples and scheduled execution testing.
- **Tab 2 — Test Bench & Acceptance**: interactive verification matrix for all 48 actions with status selectors (🟢 Validated, 🟡 Pending, 🔴 Defect) and acceptance report export.
- **Tab 3 — JSM Integration Guide**: live-generated JSON components and automation templates.
- **Presentation & Architecture Diagram** (`?page=presentation` or top header link): interactive SVG system diagrams and architectural workflow presentation.

*(Note: append `?format=json` to the URL for an automated health check response).*

### 2. Apps Script Test Functions

| Function | Description |
|---|---|
| `test_unitaires()` | **Automated unit test suite** (79 assertion tests, zero side-effects) |
| `setup_verifierConfiguration()` | Complete configuration diagnostic report |
| `admin_verifierApis()` | **Smoke test of all APIs** in read-only mode |
| `admin_viderCacheSuggestions()` | Clears auto-completion suggestions cache |
| `test_verifierRegistre()` | Validates the action catalogue registry |
| `test_verifierPlanning()` | Simulates admin schedule slots over 7 days |

## Gmail Service Account Setup

Actions modifying Gmail settings (`SIGNATURE_EMAIL`, `DELEGATION_EMAIL`, `REPONSE_ABSENCE`, `TRANSFERT_EMAILS`) require Domain-Wide Delegation (DWD):

1. Create a Service Account in the GCP project linked to the script.
2. Enable Domain-Wide Delegation in Google Workspace Admin Console (Security > API Controls > Domain-wide Delegation).
3. Authorize the required OAuth scopes:
   - `https://www.googleapis.com/auth/gmail.settings.basic`
   - `https://www.googleapis.com/auth/gmail.settings.sharing`
4. Download the Service Account JSON key.
5. Set `SERVICE_ACCOUNT_EMAIL` and `SERVICE_ACCOUNT_KEY` in Script Properties.

## Adding an Action

1. Create a file `1x action myaction.gs` containing:
   - A `SPEC_MY_ACTION()` specification function.
   - A handler function implementing the operation.
2. Register `SPEC_MY_ACTION` in `declarationsFormulaires_()` in [01 registre.gs](01%20registre.gs).
3. Validate with `test_verifierRegistre()`.

## Security

- Secrets are stored in `PropertiesService`, never in source code
- Authentication uses **constant-time** comparison
- Passwords are **never** returned in the HTTP response
- All external content is **escaped** before HTML insertion
- Internal error stack traces are **never** exposed to Jira

## License

MIT — See LICENSE file for details.

## Author

**Fabrice Faucheux** — [https://faucheux.bzh](https://faucheux.bzh)
