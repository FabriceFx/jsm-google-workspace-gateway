# Passerelle Jira Service Management → Google Workspace

> **v2.8.0** — Automatise les opérations d'administration Google Workspace
> déclenchées par les formulaires Jira Service Management.

*[English version below](#jira-service-management--google-workspace-gateway)*

---

## Présentation

Quand un agent JSM valide un ticket (arrivée, départ, demande d'accès,
réinitialisation de mot de passe…), Jira Automation envoie un webhook POST
vers cette webapp Google Apps Script. Le routeur identifie l'action demandée,
vérifie l'authentification et les données, puis exécute l'opération via
l'Admin SDK — le tout sans intervention manuelle.

### Actions disponibles

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
| `DELEGATION_EMAIL` | Donne accès à la boîte mail d'un utilisateur à un délégué | Standard |
| `RETRAIT_DELEGATION_EMAIL` | Retire l'accès d'un délégué à une boîte mail | Standard |
| `REPONSE_ABSENCE` | Active la réponse d'absence automatique | Standard |
| `DESACTIVATION_REPONSE_ABSENCE` | Désactive la réponse d'absence automatique | Standard |
| `TRANSFERT_EMAILS` | Redirige les e-mails entrants vers une autre adresse | Standard |
| `ARRET_TRANSFERT_EMAILS` | Désactive la redirection automatique des e-mails | Standard |
| **Drive** | | |
| `TRANSFERT_DRIVE` | Transfère la propriété des fichiers Drive à un autre utilisateur | Standard |
| **Licences** | | |
| `ATTRIBUTION_LICENCE` | Attribue une licence Workspace à un utilisateur | Standard |
| `RETRAIT_LICENCE` | Libère la licence d'un utilisateur (facturée tant qu'assignée) | Standard |
| **Groupes d'action** (séquences orchestrées) | | |
| `ARRIVEE_COLLABORATEUR` | Onboarding : création du compte + licence + groupes + alias, dans l'ordre | Standard |
| `DEPART_COLLABORATEUR` | Offboarding : transferts + délégation + retrait groupes + suspension + retrait licence | Permanente |
| `RETOUR_ABSENCE` | Coupe réponse d'absence, transfert et délégation posés au départ | Standard |

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
`DEPART_COLLABORATEUR` (offboarding), `RETOUR_ABSENCE`.

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
   | `SECRET_TOKEN` | ✅ | Généré à l'étape 4 |
   | `AUDIT_SHEET_ID` | ✅ | ID du classeur Google Sheets d'audit |
   | `ALLOWED_DOMAINS` | ✅ | Domaines autorisés, séparés par des virgules |
   | `ADMIN_UI_EMAILS` | ✅ (console) | Adresses admin autorisées à utiliser la console de test, séparées par des virgules |
   | `NOTIFY_EMAIL` | Recommandé | Adresse de notification (anomalies, mots de passe) |
   | `LICENSE_SKU_ID` | Optionnel | SKU de licence par défaut (actions de licence). Voir `admin_listerLicences()` |
   | `LICENSE_PRODUCT_ID` | Optionnel | Produit de licence (défaut `Google-Apps`) |
   | `LICENSE_CUSTOMER_ID` | Optionnel | Client pour lister les licences (domaine principal). À défaut, 1er `ALLOWED_DOMAINS` |
   | `DEFAULT_OU` | Optionnel | Unité organisationnelle par défaut (ex. `/Collaborateurs`) |
   | `LOGO_URL` | Optionnel | URL publique du logo Cooperl pour les e-mails |
   | `LOGO_VARIANTE` | Optionnel | `BLANC` (défaut) ou `BLEU` selon le fichier hébergé |
   | `RESPECT_JOURS_FERIES` | Optionnel | `true` (défaut) ou `false` |
   | `JOURS_FERMETURE` | Optionnel | Dates ISO de fermeture entreprise, séparées par des virgules |
   | `SERVICE_ACCOUNT_EMAIL` | Optionnel | E-mail du compte de service (actions Gmail) |
   | `SERVICE_ACCOUNT_KEY` | Optionnel | Clé privée PEM du compte de service (actions Gmail) |

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
    "email_souhaite": "{{issue.Email souhaité}}"
  }
}
```

Champs optionnels selon l'action :
- `force_immediat` : `true` pour forcer l'exécution hors créneau
- `motif_urgence` : obligatoire si `force_immediat` est vrai

## Ajouter une action

1. Créer un fichier `1x action monaction.gs` contenant :
   - Une fonction `SPEC_MON_ACTION()` retournant la spécification
   - Une fonction handler exécutant l'opération

2. Ajouter `SPEC_MON_ACTION` dans `declarationsFormulaires_()` de
   [01 registre.gs](01%20registre.gs). C'est le **seul** fichier existant à
   modifier.

3. Vérifier avec `test_verifierRegistre()`.

## Tests & Console WebApp Interactive

Vous pouvez tester l'ensemble du système **avant même de configurer Jira** :

### 1. Console de Test WebApp HTML (Interface graphique)
En ouvrant l'URL du déploiement WebApp (`https://script.google.com/macros/s/.../exec`) directement dans votre navigateur web, vous accédez à la **Console de test interactive** :
- Sélection graphique de l'action parmi les 34 disponibles
- Génération automatique des champs avec exemples pré-remplis
- Simulation de dérogations d'urgence (`force_immediat`)
- Visualisation en temps réel des réponses JSON, statuts HTTP et journaux

*(Note : pour obtenir la réponse de supervision JSON à destination de vos outils de monitoring, ajoutez `?format=json` à l'URL).*

### 2. Fonctions de test Apps Script

| Fonction | Rôle |
|---|---|
| `test_unitaires()` | **Suite de tests automatiques** (assertions, aucun effet réel) |
| `setup_verifierConfiguration()` | Diagnostic complet de la configuration |
| `admin_verifierApis()` | **Smoke test des API** en lecture seule (Directory, Gmail, Licensing, Data Transfer) |
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
08 email.gs                  Gabarit e-mail chartée Cooperl
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
90 administration.gs         Fonctions de pilotage manuel
91 tests.gs                  Tests (unitaires + diagnostics manuels)
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

> **v2.8.0** — Automates Google Workspace administration operations triggered
> by Jira Service Management forms.

## Overview

When a JSM agent validates a ticket (onboarding, offboarding, access request,
password reset…), Jira Automation sends a POST webhook to this Google Apps
Script webapp. The router identifies the requested action, verifies
authentication and data, then executes the operation via the Admin SDK — all
without manual intervention.

### Available actions

25 actions are available across 7 categories: accounts, groups, aliases,
security, mobile devices, email (⚙️ requires service account), and Drive.
See the French section above for the complete table.

**Standard window**: immediate execution during admin hours (Mon–Fri
8:30–17:30, excluding French public holidays). Outside hours, the request is
queued for automatic execution at the next open slot.

**Permanent window**: immediate execution 24/7. Reserved for security actions
(suspension, access revocation) and read-only operations.

## Prerequisites

- A Google Apps Script project with the **Admin SDK API** advanced service enabled
- A Google Workspace account with the appropriate **admin privileges**
  (super-admin or delegated admin with user and group management rights)
- A **Google Sheets** spreadsheet for the audit log and queue
- A **Jira Automation** rule configured to send a POST webhook

## Setup

1. **Create the Apps Script project**
   Copy all `.gs` files into a new Apps Script project.

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
   | `SECRET_TOKEN` | ✅ | Generated in step 4 |
   | `AUDIT_SHEET_ID` | ✅ | Google Sheets spreadsheet ID for audit |
   | `ALLOWED_DOMAINS` | ✅ | Allowed domains, comma-separated |
   | `NOTIFY_EMAIL` | Recommended | Notification address (alerts, passwords) |
   | `DEFAULT_OU` | Optional | Default organisational unit (e.g. `/Employees`) |
   | `LOGO_URL` | Optional | Public URL of the Cooperl logo for emails |
   | `LOGO_VARIANTE` | Optional | `BLANC` (default) or `BLEU` depending on hosted file |
   | `RESPECT_JOURS_FERIES` | Optional | `true` (default) or `false` |
   | `JOURS_FERMETURE` | Optional | ISO dates for company closure days, comma-separated |

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

## Adding an action

1. Create a file `1x action myaction.gs` containing:
   - A `SPEC_MY_ACTION()` function returning the specification
   - A handler function executing the operation

2. Add `SPEC_MY_ACTION` to `declarationsFormulaires_()` in
   [01 registre.gs](01%20registre.gs). This is the **only** existing file to
   modify.

3. Verify with `test_verifierRegistre()`.

## Security

- Secrets are stored in `PropertiesService`, never in source code
- Authentication uses **constant-time** comparison
- Passwords are **never** returned in the HTTP response
- All external content is **escaped** before HTML insertion
- Internal errors are **never** exposed to Jira

## License

MIT — See the LICENSE file for details.

## Author

**Fabrice Faucheux** — [https://faucheux.bzh](https://faucheux.bzh)
