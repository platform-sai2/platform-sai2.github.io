'use strict';

(() => {
  const { api, icone, session } = window.SAI;

  // Session encore ouverte sur cet appareil : directement au tableau de bord.
  if (session.lire()) {
    api('/api/admin/session')
      .then(() => window.location.replace('tableau.html'))
      .catch((err) => {
        if (err.statut === 401) session.effacer();
      });
  }

  const form = document.getElementById('form-connexion');
  const champ = document.getElementById('mot-de-passe');
  const enveloppe = champ.closest('.champ-mdp');
  const bascule = document.getElementById('basculer-mdp');
  const alerte = document.getElementById('alerte');
  const alerteTexte = document.getElementById('alerte-texte');
  const majActive = document.getElementById('maj-active');
  const bouton = document.getElementById('bouton-connexion');
  const texteBouton = bouton.querySelector('.btn__texte');

  bascule.innerHTML = icone('oeil');
  bascule.addEventListener('click', () => {
    const visible = champ.type === 'text';
    champ.type = visible ? 'password' : 'text';
    bascule.innerHTML = icone(visible ? 'oeil' : 'oeilBarre');
    bascule.setAttribute('aria-pressed', String(!visible));
    bascule.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
    champ.focus();
  });

  const verifierMajuscules = (e) => {
    if (typeof e.getModifierState === 'function') majActive.hidden = !e.getModifierState('CapsLock');
  };
  champ.addEventListener('keydown', verifierMajuscules);
  champ.addEventListener('keyup', verifierMajuscules);

  champ.addEventListener('input', () => {
    alerte.hidden = true;
    enveloppe.classList.remove('is-invalide');
  });

  function echec(message) {
    alerteTexte.textContent = message;
    alerte.hidden = false;
    enveloppe.classList.add('is-invalide');
    enveloppe.classList.remove('secoue');
    void enveloppe.offsetWidth;
    enveloppe.classList.add('secoue');
    champ.select();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (bouton.disabled) return;
    if (!champ.value) {
      echec('Saisissez le mot de passe.');
      return;
    }
    bouton.disabled = true;
    bouton.classList.add('is-loading');
    texteBouton.textContent = 'Vérification';
    try {
      const { jeton } = await api('/api/admin/connexion', { method: 'POST', body: { motDePasse: champ.value } });
      session.ecrire(jeton);
      bouton.classList.remove('is-loading');
      bouton.classList.add('is-succes');
      texteBouton.textContent = 'Connexion réussie';
      setTimeout(() => window.location.replace('tableau.html'), 350);
    } catch (err) {
      bouton.disabled = false;
      bouton.classList.remove('is-loading');
      texteBouton.textContent = 'Ouvrir le tableau de bord';
      echec(err.message);
    }
  });
})();
