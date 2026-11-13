'use strict';

// Outils partagés par le formulaire, la connexion et le tableau de bord.
window.SAI = (() => {
  // Les pages sont publiées sur GitHub Pages ; les données viennent de l'Edge Function « api » du projet Supabase.
  const API = 'https://iddpcjpqabulpiikjsct.supabase.co/functions/v1';
  // Racine du site (page du formulaire), d'après l'adresse de ce script : js/commun.js.
  const RACINE = new URL('../', document.currentScript.src).href;

  // GitHub Pages ne permet pas d'interdire l'affichage dans un cadre : une page encadrée par un autre site
  // reprend toute la fenêtre.
  if (window.top !== window.self) {
    try {
      window.top.location.replace(window.location.href);
    } catch {
      document.documentElement.hidden = true;
    }
  }

  const formatNombre = new Intl.NumberFormat('fr-FR');
  const formatPourcent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
  const formatDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  const formatHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const formatRelatif = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

  const TRACES = {
    chevron: '<path d="m6 9 6 6 6-6"/>',
    utilisateur: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    utilisateurs: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    livre: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    diplome: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>',
    cible: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    coche: '<path d="M20 6 9 17l-5-5"/>',
    croix: '<path d="M18 6 6 18M6 6l12 12"/>',
    alerte: '<path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    moins: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    telecharger: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    lien: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    recherche: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    crayon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    corbeille: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    cadenas: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    oeil: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    oeilBarre: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
    bouclier: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    graphique: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/>',
    historique: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
    fleche: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    actualiser: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    copie: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  };

  function icone(nom, classe = '') {
    return `<svg class="icone ${classe}" viewBox="0 0 24 24" aria-hidden="true">${TRACES[nom] || ''}</svg>`;
  }

  const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (valeur) => String(valeur ?? '').replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]);

  const nombre = (n) => (n === null || n === undefined ? '—' : formatNombre.format(n));
  const ratio = (num, den) => (den > 0 ? num / den : null);
  const pourcent = (num, den) => (den > 0 ? formatPourcent.format(num / den) : '—');
  const date = (iso) => (iso ? formatDate.format(new Date(iso)) : '—');
  const heure = (iso) => formatHeure.format(iso ? new Date(iso) : new Date());

  function ilYa(iso) {
    if (!iso) return '—';
    const secondes = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const abs = Math.abs(secondes);
    if (abs < 45) return "à l'instant";
    if (abs < 3600) return formatRelatif.format(Math.round(secondes / 60), 'minute');
    if (abs < 86400) return formatRelatif.format(Math.round(secondes / 3600), 'hour');
    if (abs < 86400 * 30) return formatRelatif.format(Math.round(secondes / 86400), 'day');
    return date(iso);
  }

  // Pieux, districts, missions et branches : leurs noms, dans l'ordre d'affichage. Les textes qui parlent
  // de ces unités se construisent d'après les types présents, pour rester justes pays par pays.
  const TYPES_UNITE = {
    Pieu: { un: 'pieu', plusieurs: 'pieux', le: 'le pieu', ce: 'ce pieu' },
    District: { un: 'district', plusieurs: 'districts', le: 'le district', ce: 'ce district' },
    Mission: { un: 'mission', plusieurs: 'missions', le: 'la mission', ce: 'cette mission' },
    Branche: { un: 'branche', plusieurs: 'branches', le: 'la branche', ce: 'cette branche' },
  };
  const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);
  // « a, b et c » ou « a, b ou c »
  const enumerer = (mots, liaison = 'et') => (mots.length > 1 ? `${mots.slice(0, -1).join(', ')} ${liaison} ${mots.at(-1)}` : mots[0] || '');
  // Les types présents dans une liste d'unités (tous si la liste est vide), dans l'ordre d'affichage.
  const typesPresents = (unites) => {
    const presents = Object.keys(TYPES_UNITE).filter((t) => unites.some((u) => u.type === t));
    return presents.length ? presents : Object.keys(TYPES_UNITE);
  };
  // « pieu, district ou mission », « le pieu, le district ou la mission »… selon la forme demandée.
  const formesTypes = (unites, forme, liaison = 'ou') => enumerer(typesPresents(unites).map((t) => TYPES_UNITE[t][forme]), liaison);
  // « pieux, districts et missions », « mission », ou avec les nombres « 24 pieux, 7 districts et 6 missions ».
  function typesUnites(unites, { avecNombres = false } = {}) {
    return enumerer(typesPresents(unites).map((t) => {
      const { un, plusieurs } = TYPES_UNITE[t];
      if (!avecNombres) return unites.length > 1 ? plusieurs : un;
      const n = unites.filter((u) => u.type === t).length;
      return `${formatNombre.format(n)} ${n > 1 ? plusieurs : un}`;
    }));
  }

  // « Abidjan Lagune CR (80998) » → { libelle: 'Abidjan Lagune CR', code: '80998' }
  function programme(nom) {
    const m = /^(.*?)\s*\((\d+)\)?\s*$/.exec(nom || '');
    return m ? { libelle: m[1], code: m[2] } : { libelle: nom || '', code: null };
  }

  // Session administrateur : le jeton remis à la connexion, gardé sur cet appareil (12 heures au plus).
  // Le préfixe « sai2- » sépare ces clés de celles des autres sites publiés sur israeldah.github.io.
  const session = stockage('sai2-jeton');
  const entetesSession = () => {
    const jeton = session.lire();
    return jeton ? { Authorization: `Bearer ${jeton}` } : {};
  };

  // url : chemin de l'API, par exemple « /api/unites ».
  async function api(url, options = {}) {
    const init = { ...options, headers: { Accept: 'application/json', ...entetesSession(), ...options.headers } };
    if (options.body !== undefined && typeof options.body !== 'string') {
      init.body = JSON.stringify(options.body);
      init.headers['Content-Type'] = 'application/json';
    }
    let reponse;
    try {
      reponse = await fetch(`${API}${url}`, init);
    } catch {
      throw Object.assign(new Error('Connexion impossible. Vérifiez votre réseau puis réessayez.'), { reseau: true });
    }
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      throw Object.assign(new Error(donnees.erreur || `Erreur ${reponse.status}`), { statut: reponse.status, details: donnees });
    }
    return donnees;
  }

  let pileToasts;
  function toast(message, type = 'info', duree = 4200) {
    if (!pileToasts) {
      pileToasts = document.createElement('div');
      pileToasts.className = 'toasts';
      pileToasts.setAttribute('role', 'status');
      pileToasts.setAttribute('aria-live', 'polite');
      document.body.append(pileToasts);
    }
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    const nomIcone = { succes: 'coche', erreur: 'alerte' }[type] || 'info';
    el.innerHTML = `${icone(nomIcone)}<span>${esc(message)}</span>`;
    pileToasts.append(el);
    setTimeout(() => {
      el.classList.add('is-sortie');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duree);
  }

  const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fait défiler un nombre de son ancienne valeur vers la nouvelle.
  function compter(el, cible, format = nombre) {
    const depart = Number(el.dataset.valeur ?? 0);
    el.dataset.valeur = String(cible);
    if (mouvementReduit() || depart === cible) {
      el.textContent = format(cible);
      return;
    }
    const debut = performance.now();
    const duree = 900;
    const etape = (t) => {
      const p = Math.min(1, (t - debut) / duree);
      const lisse = 1 - (1 - p) ** 4;
      el.textContent = format(Math.round(depart + (cible - depart) * lisse));
      if (p < 1) requestAnimationFrame(etape);
    };
    requestAnimationFrame(etape);
  }

  function stockage(cle) {
    return {
      lire() {
        try {
          return JSON.parse(localStorage.getItem(cle) || 'null');
        } catch {
          return null;
        }
      },
      ecrire(valeur) {
        try {
          localStorage.setItem(cle, JSON.stringify(valeur));
        } catch {
          // stockage indisponible (navigation privée) : on continue sans brouillon
        }
      },
      effacer() {
        try {
          localStorage.removeItem(cle);
        } catch {
          // idem
        }
      },
    };
  }

  return {
    API, RACINE,
    icone, esc, nombre, ratio, pourcent, date, heure, ilYa, programme,
    TYPES_UNITE, majuscule, enumerer, formesTypes, typesUnites,
    api, session, entetesSession, toast, compter, mouvementReduit, stockage,
  };
})();
