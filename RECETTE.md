# Cahier de Recette & Guide de Qualification Opérationnelle
# *Acceptance Test Playbook & Operational Qualification Guide*

> **Passerelle Jira Service Management → Google Workspace (v3.3.0)**  
> *Développé par Fabrice Faucheux ([faucheux.bzh](https://faucheux.bzh))*

---

## 🇫🇷 Version Française

### 1. Présentation & Objectifs
Ce cahier de recette accompagne la mise en service de la passerelle. Il permet de tester méthodiquement chacune des **50 actions**, de vérifier leur conformité opérationnelle et de consigner leur validation directement dans le **Banc d'Essai & Matrice de Recette** de la console d'administration avant le raccordement en production avec Jira Service Management.

### 2. Outils de test à disposition
1. **Banc d'Essai & Recette (Onglet 2 de la WebApp)** : Tableau de bord de qualification avec sélecteur d'état opérationnel (🟢 *Validé*, 🟡 *À tester*, 🔴 *Anomalie*, ⚪ *Non applicable*), saisie d'observations et export du PV de recette.
2. **Console d'administration (Onglet 1 de la WebApp)** : Formulaire dynamique pour tester chaque action en réel ou avec des données pré-remplies (« Remplir avec un exemple »), avec support de l'exécution programmée (`date_execution`) et du callback Jira automatique.
3. **Diagnostics & Tests Apps Script (`91 tests.gs` / `90 administration.gs`)** :
   - `test_unitaires()` : Contrôle automatique de 100% des fonctions pures (79 tests).
   - `admin_verifierApis()` : Smoke test des API en lecture seule (Directory, Gmail, Licensing, DataTransfer).

---

### 3. Fiches de Test par Famille d'Actions

#### 👤 1. Gestion des Comptes Utilisateur
| Action | Données de test recommandées | Résultat attendu | Points de contrôle |
|---|---|---|---|
| `CREATION_COMPTE` | `prenom`: "Test", `nom`: "Recette", `email_souhaite`: "test.recette@domaine.com", `manager_email`: "votre-email@domaine.com" | Compte créé dans l'annuaire, mot de passe provisoire reçu par email. | Vérifier dans Google Admin (OU, statut actif, mot de passe temporaire exigé au 1er login). |
| `CHANGEMENT_OU` | `email_cible`: "test.recette@domaine.com", `unite_organisationnelle`: "/Direction/IT" | Compte déplacé dans la nouvelle OU. | Vérifier l'OU dans Google Admin. |
| `MISE_A_JOUR_PROFIL` | `email_cible`: "test.recette@domaine.com", `intitule_poste`: "Directeur Projets", `telephone_pro`: "+33 2 96 00 00 00" | Profil mis à jour sans écraser les autres attributs. | Vérifier la préservation des attributs personnalisés RH. |
| `RENOMMER_COMPTE` | `email_cible`: "ancien.nom@domaine.com", `nouvel_email`: "nouveau.nom@domaine.com" | Adresse principale renommée, l'ancienne adresse devient un alias. | Vérifier la continuité de réception. |
| `SUPPRESSION_COMPTE` | `email_cible`: "test.recette@domaine.com", `confirmation`: "CONFIRMER_SUPPRESSION" | Compte supprimé définitivement. | Action destructive (garde-fou confirmation obligatoire). |

#### 👥 2. Groupes Google & Listes de Diffusion
| Action | Données de test | Résultat attendu |
|---|---|---|
| `CREATION_GROUPE` | `email_groupe`: "grp-recette@domaine.com", `nom_groupe`: "Groupe Recette", `proprietaire_email`: "votre-email@domaine.com" | Groupe créé dans Google Admin avec son propriétaire. |
| `AJOUT_GROUPE` | `email_cible`: "collaborateur@domaine.com", `email_groupe`: "grp-recette@domaine.com", `role`: "MEMBER" | Utilisateur ajouté au groupe avec le rôle demandé. |
| `RETRAIT_GROUPE` | `email_cible`: "collaborateur@domaine.com", `email_groupe`: "grp-recette@domaine.com" | Utilisateur retiré du groupe. |
| `RETRAIT_TOUS_GROUPES` | `email_cible`: "partant@domaine.com" | Utilisateur retiré de tous ses groupes directs (ignore gracieusement les groupes dynamiques). |
| `LISTE_MEMBRES_GROUPE` | `email_groupe`: "grp-recette@domaine.com" | Liste complète des membres avec leurs rôles retournée. |
| `CONFIG_GROUPE` | `email_groupe`: "grp-recette@domaine.com", `qui_peut_poster`: "ALL_IN_DOMAIN_CAN_POST", `qui_peut_voir`: "ALL_IN_DOMAIN_CAN_VIEW" | Paramètres de publication et de modération mis à jour via Groups Settings API. |
| `SUPPRESSION_GROUPE` | `email_groupe`: "grp-recette@domaine.com", `confirmation`: "CONFIRMER_SUPPRESSION" | Groupe supprimé. |

#### 🏷️ 3. Alias E-mail
| Action | Données de test | Résultat attendu |
|---|---|---|
| `AJOUT_ALIAS` | `email_cible`: "test.recette@domaine.com", `alias`: "test.alias@domaine.com" | Alias rattaché au compte. |
| `RETRAIT_ALIAS` | `email_cible`: "test.recette@domaine.com", `alias`: "test.alias@domaine.com" | Alias supprimé du compte. |

#### 🔒 4. Sécurité & Mots de Passe
| Action | Données de test | Résultat attendu | Points de contrôle |
|---|---|---|---|
| `SUSPENSION` | `email_cible`: "compte-test@domaine.com" | Compte suspendu et sessions révoquées. | Statut "Suspendu" dans Google Admin. Fenêtre permanente (24/7). |
| `REACTIVATION` | `email_cible`: "compte-test@domaine.com" | Compte réactivé. | Statut "Actif" rétabli. |
| `RESET_MOT_DE_PASSE` | `email_cible`: "compte-test@domaine.com", `manager_email`: "votre-email@domaine.com" | Nouveau mot de passe généré et envoyé par email au manager. | Changement au 1er login exigé. |
| `DECONNEXION_FORCEE`| `email_cible`: "compte-test@domaine.com" | Toutes les sessions web et Google sont coupées. | Le compte reste actif mais doit se ré-authentifier. |
| `REVOCATION_TOKENS_APPS` | `email_cible`: "compte-test@domaine.com" | Accès tiers OAuth révoqués. | Vérifier la section Sécurité du compte. |
| `GENERATION_CODES_SECOURS` | `email_cible`: "compte-test@domaine.com", `manager_email`: "votre-email@domaine.com" | Nouveaux codes 2FA générés et envoyés au manager. | Anciens codes révoqués. |
| `RETRAIT_INFOS_RECUPERATION` | `email_cible`: "compte-test@domaine.com" | E-mail personnel et numéro de téléphone de secours purgés de la fiche du compte. | Idempotent si aucun contact enregistré. |

#### 📱 5. Flotte Mobile
| Action | Données de test | Résultat attendu |
|---|---|---|
| `APPROBATION_APPAREIL` | `email_cible`: "compte-test@domaine.com" | Appareil en attente validé. |
| `BLOCAGE_APPAREIL` | `email_cible`: "compte-test@domaine.com" | Appareil bloqué de l'accès pro. |
| `EFFACEMENT_APPAREIL` | `email_cible`: "compte-test@domaine.com", `type_effacement`: "COMPTE" | Effacement des données professionnelles. |

#### ✉️ 6. Messagerie Gmail *(Compte de Service requis)*
| Action | Données de test | Résultat attendu |
|---|---|---|
| `SIGNATURE_EMAIL` | `email_cible`: "compte-test@domaine.com" | Signature HTML officielle déployée selon la charte graphique. |
| `REPONSE_ABSENCE` | `email_cible`: "compte-test@domaine.com", `message_absence`: "En congé", `date_debut`: "2026-08-01", `date_fin`: "2026-08-31" | Répondeur d'absence activé dans Gmail. |
| `DESACTIVATION_REPONSE_ABSENCE` | `email_cible`: "compte-test@domaine.com" | Répondeur d'absence désactivé. |
| `TRANSFERT_EMAILS` | `email_cible`: "compte-test@domaine.com", `email_destination`: "successeur@domaine.com" | Redirection automatique active dans Gmail. |
| `ARRET_TRANSFERT_EMAILS` | `email_cible`: "compte-test@domaine.com" | Redirection arrêtée. |
| `DELEGATION_EMAIL` | `email_cible`: "compte-test@domaine.com", `email_delegue`: "delegue@domaine.com" | Accès délégué accordé dans Gmail. |
| `RETRAIT_DELEGATION_EMAIL` | `email_cible`: "compte-test@domaine.com", `email_delegue`: "delegue@domaine.com" | Délégation révoquée. |

#### 🌟 7. Diagnostic & Support Helpdesk
| Action | Données de test | Résultat attendu | Points de contrôle |
|---|---|---|---|
| `INFO_COMPTE` | `email_cible`: "compte-test@domaine.com" | Fiche diagnostic express (statut, 2FA, OU, groupes, transferts, licences, dernier login, synchro mobile). | Fenêtre permanente 24/7 en lecture seule. |
| `AUDIT_ACCES_COMPLET` | `email_cible`: "compte-test@domaine.com" | Revue exhaustive consolidée de tout le patrimoine d'accès (groupes, Drives partagés, agendas, délégations, licences, mobiles, OAuth). | Idéal pour audits de sécurité et RGPD. |

#### 📁 8. Google Drive & Drives Partagés (Shared Drives)
| Action | Données de test | Résultat attendu |
|---|---|---|
| `TRANSFERT_DRIVE` | `email_source`: "partant@domaine.com", `email_destination`: "manager@domaine.com" | Demande de transfert de propriété initiée via DataTransfer API. |
| `CREATION_DRIVE_PARTAGE` | `nom_drive`: "Projet Recette", `gestionnaire_email`: "votre-email@domaine.com" | Shared Drive créé avec rôle `organizer` assigné au gestionnaire. |
| `AJOUT_MEMBRE_DRIVE_PARTAGE` | `email_cible`: "collaborateur@domaine.com", `drive_id`: "ID_DU_DRIVE", `role`: "fileOrganizer" | Permission créée sur le Drive partagé. |
| `RETRAIT_MEMBRE_DRIVE_PARTAGE`| `email_cible`: "collaborateur@domaine.com", `drive_id`: "ID_DU_DRIVE" | Permission révoquée du Drive partagé. |
| `RETRAIT_TOUS_DRIVES_PARTAGES`| `email_cible`: "collaborateur@domaine.com" | Révocation en masse des permissions directes sur tous les Drives partagés (accès via groupes conservés). |

#### 📅 9. Calendriers Google & Salles de Réunion
| Action | Données de test | Résultat attendu |
|---|---|---|
| `PARTAGE_CALENDRIER` | `email_calendrier`: "agenda@domaine.com", `email_beneficiaire`: "assistante@domaine.com", `role`: "writer" | Règle d'accès ACL ajoutée sur l'agenda Calendar. |
| `RETRAIT_PARTAGE_CALENDRIER`| `email_calendrier`: "agenda@domaine.com", `email_beneficiaire`: "assistante@domaine.com" | ACL supprimée de l'agenda. |
| `CREATION_RESSOURCE_CALENDRIER` | `resource_id`: "salle-test", `resource_name`: "Salle Test", `capacity`: 10 | Salle de réunion créée dans Calendar Resources. |
| `SUPPRESSION_RESSOURCE_CALENDRIER` | `resource_id`: "salle-test" | Ressource supprimée de Google Calendar. |

#### 💳 10. Licences Workspace & Archivage
| Action | Données de test | Résultat attendu |
|---|---|---|
| `ATTRIBUTION_LICENCE` | `email_cible`: "compte-test@domaine.com" | Licence attribuée selon `LICENSE_SKU_ID`. |
| `RETRAIT_LICENCE` | `email_cible`: "compte-test@domaine.com" | Licence libérée pour économie de coûts. |
| `ARCHIVAGE_COMPTE` | `email_cible`: "compte-test@domaine.com" | Compte déplacé dans `/Archives`, licence standard retirée, licence Archived User assignée. |

#### 🔄 11. Groupes d'actions (Séquences Orchestrées)
| Action | Séquence vérifiée | Résultat attendu |
|---|---|---|
| `ARRIVEE_COLLABORATEUR` | `CREATION_COMPTE` → `ATTRIBUTION_LICENCE` → `AJOUT_GROUPE(s)` → `AJOUT_ALIAS` | Onboarding complet exécuté dans l'ordre. Rapport détaillé par étape. |
| `DEPART_COLLABORATEUR` | `TRANSFERT_EMAILS` → `DELEGATION_EMAIL` → `TRANSFERT_DRIVE` → `RETRAIT_TOUS_GROUPES` → `SUSPENSION` → `RETRAIT_LICENCE` | Offboarding sans rupture (transferts posés *avant* suspension). |
| `RETOUR_ABSENCE` | `DESACTIVATION_REPONSE_ABSENCE` → `ARRET_TRANSFERT_EMAILS` → `RETRAIT_DELEGATION_EMAIL` | Remise en état normal post-absence. |
| `URGENCE_COMPROMISSION`| `SUSPENSION` → `DECONNEXION_FORCEE` → `REVOCATION_TOKENS_APPS` → `BLOCAGE_APPAREIL` | Kill-switch neutralisant tout accès en moins de 3 secondes. |
| `MUTATION_INTERNE` | `CHANGEMENT_OU` → `MISE_A_JOUR_PROFIL` → `RETRAIT_ANCIENS_GROUPES` → `AJOUT_GROUPE(s)` | Mobilité interne avec mise à jour RH et nouveaux groupes. |

---

### 4. Procédure de Clôture de Recette
1. Rendez-vous sur l'onglet **« Banc d'Essai & Recette »** de votre WebApp.
2. Vérifiez que le taux d'achèvement atteint **100%** (toutes les actions nécessaires validées).
3. Cliquez sur **« Exporter le bilan »** pour récupérer le procès-verbal de recette en Markdown.
4. Conservez ce document ou attachez-le au ticket de suivi du déploiement.

---

### 5. Passage à l'Intégration Jira Service Management

Une fois la recette achevée, raccordez vos tickets JSM en suivant l'**Onglet 3 (« Guide d'Intégration JSM »)** :

1. **Jira Automation Rule** : Déclenchement sur transition de ticket (ex: *Statut = Approuvé*).
2. **Action Webhook** :
   - Méthode : `POST`
   - URL : `URL_DE_VOTRE_WEBAPP` (obtenue via le bouton Déployer > Gérer les déploiements)
   - Headers : `Content-Type: application/json`
3. **Corps JSON** : Copiez le modèle exact fourni dans le Guide pour chaque action, en remplaçant les valeurs par les Smart Values JSM (`{{issue.customfield_...}}`).
4. **Traitement du retour** :
   - Si `{{webhookResponse.status}}` == 200 : Commentaire de confirmation sur le ticket.
   - Si `{{webhookResponse.status}}` == 202 : Demande mise en file d'attente (hors créneau ouvrable).
   - Si `{{webhookResponse.status}}` >= 400 : Alerte à l'agent JSM avec le message clair renvoyé par la passerelle.

---
---

## 🇬🇧 English Version

### 1. Overview & Acceptance Goals
This test playbook guides the operational acceptance testing (OAT) of the gateway. It allows systematically testing each of the **43 actions**, verifying their compliance, and recording validation results directly in the **Acceptance Test Matrix** before connecting to production Jira Service Management.

### 2. Available Testing Tools
1. **Acceptance Test Matrix (Tab 2 of the WebApp)**: Operational dashboard with status selectors (🟢 *Validated*, 🟡 *Pending Test*, 🔴 *Defect*, ⚪ *N/A*), test notes input, and sign-off export.
2. **Administration Console (Tab 1 of the WebApp)**: Dynamic execution console with sample fill buttons for safe real-time testing.
3. **Apps Script Diagnostics (`91 tests.gs` / `90 administration.gs`)**:
   - `test_unitaires()`: Automated regression test suite.
   - `admin_verifierApis()`: Read-only API smoke test.

### 3. Sign-off & Production Rollout
1. Run test cases for all needed action families.
2. Check off statuses in the **Acceptance Test Matrix**.
3. Export the final Acceptance Report using the **"Exporter le bilan"** button.
4. Follow the **JSM Integration Guide (Tab 3)** to configure Jira Automation webhooks and Smart Values.
