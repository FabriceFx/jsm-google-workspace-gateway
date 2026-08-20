/**
 * FORMULAIRE — Mise à jour de la signature d'e-mail Gmail
 * -----------------------------------------------------------------------------
 * Formulaire JSM : automatisation de la charte de signature ou personnalisation.
 *
 * Champs attendus dans `data` :
 *  - email_cible (requis) : adresse e-mail du collaborateur
 *  - [signature_html] (optionnel) : code HTML personnalisé. Si omis, généré
 *    automatiquement depuis le profil de l'annuaire Workspace (nom, poste, tél...).
 *  - [send_as_email] (optionnel) : adresse alias spécifique. Si omis, applique
 *    sur l'adresse principale.
 *
 * Projet : Passerelle Jira Service Management → Google Workspace (v3.1.0)
 * ⚠️ Aucun code ne doit s'exécuter au chargement de ce fichier (voir README).
 */

function SPEC_SIGNATURE_EMAIL() {
  return {
    action: 'SIGNATURE_EMAIL',
    description: 'Définit ou réinitialise la signature Gmail d\'un collaborateur.',
    required: ['email_cible'],
    emails: ['email_cible', 'send_as_email'],
    fenetre: 'STANDARD',
    handler: actionSignatureEmail_
  };
}

/**
 * ACTION SIGNATURE_EMAIL — Met à jour la signature via l'API Gmail SendAs.
 *
 * @param {!Object} data Données validées.
 * @param {!Object} ctx Contexte d'exécution.
 * @return {!Object}
 */
function actionSignatureEmail_(data, ctx) {
  const utilisateur = requireUser_(data.email_cible, undefined, 'full');
  const sendAsEmail = data.send_as_email || utilisateur.primaryEmail;

  let htmlSignature = data.signature_html;
  if (!htmlSignature) {
    htmlSignature = genererSignatureHtml_(utilisateur, {
      telephone: data.telephone,
      poste: data.poste,
      service: data.service,
      societe: data.societe
    });
  }

  const endpoint = 'settings/sendAs/' + encodeURIComponent(sendAsEmail);
  const payload = { signature: htmlSignature };

  appelGmailApi_(data.email_cible, endpoint, 'PATCH', payload,
    ['https://www.googleapis.com/auth/gmail.settings.basic']);

  return {
    target: data.email_cible,
    message: 'Signature Gmail mise à jour avec succès pour ' + data.email_cible +
      ' (alias : ' + sendAsEmail + ').',
    details: {
      email_cible: data.email_cible,
      send_as_email: sendAsEmail,
      signature_generee: !data.signature_html
    }
  };
}
