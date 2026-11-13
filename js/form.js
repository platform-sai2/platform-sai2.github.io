'use strict';

(() => {
  const {
    icone, esc, nombre, pourcent, ratio, programme, TYPES_UNITE, majuscule, formesTypes, typesUnites, api, toast, date, RACINE,
  } = window.SAI;

  // 5 chiffres au plus : une faute de frappe ne peut pas devenir un nombre aberrant.
  const VALEUR_MAX = 99999;

  // Pour chaque programme : classes prévues et classes ouvertes. Les effectifs ne sont pas demandés pour l'instant.
  const SECTIONS = [
    { cle: 'sem', titre: 'Séminaire', icone: 'livre' },
    { cle: 'inst', titre: 'Institut', icone: 'diplome' },
    { cle: 'rae', titre: "Réussir à l'école", icone: 'cible' },
    { cle: 'mis', titre: 'Préparation missionnaire', icone: 'globe' },
  ].map((s) => ({
    ...s,
    blocs: [
      {
        champs: [
          { nom: `${s.cle}_classes_a_ouvrir`, label: 'Classes prévues' },
          { nom: `${s.cle}_classes_ouvertes`, label: 'Classes ouvertes' },
        ],
        jauge: { titre: 'Classes déjà ouvertes', num: `${s.cle}_classes_ouvertes`, den: `${s.cle}_classes_a_ouvrir` },
      },
    ],
  }));

  const CHAMPS = SECTIONS.flatMap((s) => s.blocs.flatMap((b) => b.champs.map((c) => c.nom)));
  const SECTION_DE = Object.fromEntries(SECTIONS.flatMap((s) => s.blocs.flatMap((b) => b.champs.map((c) => [c.nom, s.cle]))));

  const form = document.getElementById('formulaire');
  const select = document.getElementById('coordinateur');
  const champCoordinateur = document.getElementById('champ-coordinateur');
  const erreurCoordinateur = document.getElementById('coordinateur-err');
  const zoneProgramme = document.getElementById('zone-programme');
  const conteneurSections = document.getElementById('sections');
  const commentaire = document.getElementById('commentaire');
  const sectionCommentaire = commentaire.closest('section');
  const compteurCommentaire = document.getElementById('compteur-commentaire');
  const progresNombre = document.getElementById('progres-nombre');
  const crans = document.getElementById('crans');
  const boutonEnvoi = document.getElementById('bouton-envoi');
  const boutonReinitialiser = document.getElementById('reinitialiser');
  const succes = document.getElementById('succes');
  const brouillon = window.SAI.stockage('sai2-rapport-brouillon-v1');
  const champUnite = document.getElementById('champ-unite');
  const libelleUnite = document.getElementById('libelle-unite');
  const aideUnite = document.getElementById('unite-aide');
  const choixPays = document.getElementById('choix-pays');
  const selectUnite = document.getElementById('unite');
  const erreurUnite = document.getElementById('unite-err');

  let coordinateurs = [];
  let pays = [];
  let unites = [];
  let paysChoisi = null;
  let paysChoisiAMain = false;
  let envoiEnCours = false;
  const envoyesCetteVisite = new Set();

  /* ------------------------------------------------------------ Rendu */

  function ligneHTML(c) {
    return `
      <div class="ligne" data-champ="${c.nom}">
        <label for="${c.nom}">
          <span class="ligne__nom">${c.label}</span>
          ${c.aide ? `<span class="ligne__aide">${c.aide}</span>` : ''}
        </label>
        <div class="pas">
          <button type="button" class="pas__btn" data-pas="-1" tabindex="-1" aria-label="Retirer 1 : ${c.label}">${icone('moins')}</button>
          <input class="pas__saisie" id="${c.nom}" name="${c.nom}" type="text" inputmode="numeric" pattern="[0-9]*"
            autocomplete="off" enterkeyhint="next" maxlength="5" required aria-describedby="${c.nom}-err">
          <button type="button" class="pas__btn" data-pas="1" tabindex="-1" aria-label="Ajouter 1 : ${c.label}">${icone('plus')}</button>
        </div>
        <p class="num__erreur" id="${c.nom}-err"></p>
      </div>`;
  }

  function jaugeHTML(j) {
    return `
      <div class="jauge" data-num="${j.num}" data-den="${j.den}"${j.alerte ? ` data-alerte="${esc(j.alerte)}"` : ''}>
        <div class="jauge__tete"><span>${j.titre}</span><span><span class="jauge__detail"></span> <strong class="jauge__val">–</strong></span></div>
        <div class="jauge__piste" aria-hidden="true"><div class="jauge__barre"></div></div>
        <p class="jauge__note" hidden>${icone('alerte')}<span></span></p>
      </div>`;
  }

  function sectionHTML(s) {
    const total = s.blocs.reduce((n, b) => n + b.champs.length, 0);
    return `
      <section class="programme teinte-${s.cle}" aria-labelledby="titre-${s.cle}">
        <header class="programme__bande">
          ${icone(s.icone)}
          <h2 id="titre-${s.cle}">${s.titre}</h2>
          <span class="programme__compte" data-compte="${s.cle}">0 sur ${total}</span>
        </header>
        <div class="programme__corps">
          ${s.blocs.map((b) => `${b.champs.map(ligneHTML).join('')}${b.jauge ? jaugeHTML(b.jauge) : ''}`).join('')}
        </div>
      </section>`;
  }

  conteneurSections.innerHTML = `<p class="indice-verrou" id="indice-verrou">${icone('cadenas')}Choisissez votre nom, puis ${formesTypes([], 'le')} : les chiffres se débloquent ensuite.</p>${SECTIONS.map(sectionHTML).join('')}`;
  crans.innerHTML = CHAMPS.map((c) => `<span class="cran teinte-${SECTION_DE[c]}" data-cran="${c}"></span>`).join('');
  crans.style.setProperty('--n', String(CHAMPS.length));
  document.getElementById('progres-total').textContent = String(CHAMPS.length);
  const indiceVerrou = document.getElementById('indice-verrou');

  function verrouiller(verrou) {
    conteneurSections.classList.toggle('is-verrouille', verrou);
    for (const section of conteneurSections.querySelectorAll('.programme')) section.inert = verrou;
    sectionCommentaire.classList.toggle('is-verrouille', verrou);
    sectionCommentaire.inert = verrou;
    indiceVerrou.hidden = !verrou;
  }

  const coordinateurParId = (id) => coordinateurs.find((c) => String(c.id) === String(id)) || null;
  const typeProgramme = () => form.elements.namedItem('programme_type')?.value || 'principal';

  function rendreProgramme(coord, typeVoulu = 'principal') {
    if (!coord) {
      zoneProgramme.hidden = true;
      zoneProgramme.innerHTML = '';
      return;
    }
    const programmes = coord.programmes;
    if (programmes.length === 1) {
      const p = programme(programmes[0].nom);
      zoneProgramme.innerHTML = `
        <div class="ticket">
          <span class="ticket__icone">${icone('livre')}</span>
          <span class="ticket__corps">
            <span class="ticket__label">Votre programme</span>
            <span class="ticket__nom">${esc(p.libelle)}</span>
          </span>
          ${p.code ? `<span class="ticket__code">${esc(p.code)}</span>` : ''}
        </div>
        <input type="hidden" name="programme_type" value="principal">`;
    } else {
      const choisi = programmes.some((p) => p.type === typeVoulu) ? typeVoulu : 'principal';
      zoneProgramme.innerHTML = `
        <p class="zone-programme__intro">Deux programmes sont à votre nom. Choisissez celui de ce rapport ; vous pourrez remplir l'autre juste après.</p>
        <div class="choix-programmes" role="radiogroup" aria-label="Programme concerné par ce rapport">
          ${programmes.map((prog) => {
            const p = programme(prog.nom);
            const fait = envoyesCetteVisite.has(`${coord.id}:${prog.type}`);
            return `
              <label class="ticket ticket--choix">
                <input type="radio" name="programme_type" value="${prog.type}"${prog.type === choisi ? ' checked' : ''}>
                <span class="ticket__radio" aria-hidden="true"></span>
                <span class="ticket__corps">
                  <span class="ticket__label">${prog.type === 'principal' ? 'Programme assigné' : 'Programme affilié'}</span>
                  <span class="ticket__nom">${esc(p.libelle)}</span>
                </span>
                ${fait ? `<span class="pill pill--good">${icone('coche')}Envoyé</span>` : p.code ? `<span class="ticket__code">${esc(p.code)}</span>` : ''}
              </label>`;
          }).join('')}
        </div>`;
    }
    zoneProgramme.hidden = false;
  }

  /* ------------------------------------------------------------ Pays, pieux, districts et missions */

  const uniteParId = (id) => unites.find((u) => String(u.id) === String(id)) || null;
  const unitesDuPays = (code = paysChoisi) => unites.filter((u) => u.pays === code);
  const drapeau = (code) => `<img class="drapeau" src="${RACINE}img/drapeaux/${code.toLowerCase()}.svg" alt="" width="36" height="24">`;
  const pret = () => Boolean(coordinateurParId(select.value) && uniteParId(selectUnite.value));

  // Pays le plus probable d'après le nom du programme ; la personne peut en choisir un autre.
  function paysProbable(coord) {
    const nom = coord?.programmes.find((p) => p.type === typeProgramme())?.nom || '';
    if (/togo|lom[eé]|ts[eé]vi[eé]/i.test(nom)) return 'TG';
    if (/b[ée]nin|cotonou|cococodji|bohicon/i.test(nom)) return 'BJ';
    if (/s[ée]n[ée]gal|dakar/i.test(nom)) return 'SN';
    if (/guin[ée]e|conakry/i.test(nom)) return 'GN';
    if (/gambi|banjul/i.test(nom)) return 'GM';
    return 'CI';
  }

  function rendrePays() {
    choixPays.innerHTML = pays.map((p) => `
      <label class="pays__choix">
        <input type="radio" name="pays" value="${p.code}"${p.code === paysChoisi ? ' checked' : ''}>
        ${drapeau(p.code)}
        <span class="pays__nom">${esc(p.nom)}</span>
        <span class="pays__compte">${typesUnites(unites.filter((u) => u.pays === p.code), { avecNombres: true })}</span>
      </label>`).join('');
  }

  function rendreUnites(uniteVoulue = '') {
    const coord = coordinateurParId(select.value);
    const envoye = (u) => coord && envoyesCetteVisite.has(`${coord.id}:${typeProgramme()}:${u.id}`);
    const duPays = unitesDuPays();
    // Libellés selon ce que le pays compte : « Pieu, district ou mission », « Branche »…
    libelleUnite.textContent = `${majuscule(formesTypes(duPays, 'un'))} de ce rapport`;
    aideUnite.textContent = `Un rapport par ${formesTypes(duPays, 'un')} : après l'envoi, vous pourrez remplir le suivant.`;
    const groupes = Object.entries(TYPES_UNITE).map(([type, noms]) => {
      const liste = duPays.filter((u) => u.type === type);
      return liste.length
        ? `<optgroup label="${majuscule(noms.plusieurs)} (${liste.length})">${liste.map((u) => `<option value="${u.id}">${esc(u.nom)}${envoye(u) ? ' (envoyé)' : ''}</option>`).join('')}</optgroup>`
        : '';
    });
    selectUnite.innerHTML = `<option value="">Choisissez ${formesTypes(duPays, 'le')}</option>${groupes.join('')}`;
    selectUnite.value = duPays.some((u) => String(u.id) === String(uniteVoulue)) ? String(uniteVoulue) : '';
  }

  // Après le choix du nom : pays deviné, liste de ses pieux, districts et missions ; formulaire verrouillé
  // tant qu'aucun n'est choisi.
  function preparerUnite(coord, uniteVoulue = '') {
    champUnite.hidden = !coord;
    if (!coord) return;
    if (!paysChoisiAMain) paysChoisi = paysProbable(coord);
    rendrePays();
    rendreUnites(uniteVoulue);
  }

  function effacerErreurUnite() {
    champUnite.classList.remove('is-invalid');
    erreurUnite.textContent = '';
  }

  /* ------------------------------------------------------------ Chiffres */

  function nettoyer(valeur) {
    const chiffres = String(valeur).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    return chiffres.slice(0, String(VALEUR_MAX).length);
  }

  const valeur = (nom) => {
    const el = form.elements.namedItem(nom);
    return el && el.value !== '' ? Number(el.value) : null;
  };

  function effacerErreur(input) {
    const ligne = input.closest('.ligne');
    ligne.classList.remove('is-invalide');
    ligne.querySelector('.num__erreur').textContent = '';
  }

  function majJauges() {
    for (const jauge of form.querySelectorAll('.jauge[data-num]')) {
      const num = valeur(jauge.dataset.num);
      const den = valeur(jauge.dataset.den);
      const connu = num !== null && den !== null;
      const taux = connu ? ratio(num, den) : null;
      const depasse = Boolean(jauge.dataset.alerte) && connu && num > den;

      jauge.querySelector('.jauge__val').textContent = taux === null ? '–' : pourcent(num, den);
      jauge.querySelector('.jauge__detail').textContent = connu ? `${nombre(num)} sur ${nombre(den)}` : '';
      jauge.querySelector('.jauge__barre').style.width = `${depasse ? 100 : Math.min(100, (taux || 0) * 100)}%`;
      jauge.classList.toggle('is-depasse', depasse);
      const note = jauge.querySelector('.jauge__note');
      note.hidden = !depasse;
      if (depasse) note.querySelector('span').textContent = jauge.dataset.alerte;
    }
  }

  function majProgres() {
    let remplis = 0;
    const parSection = {};
    for (const c of CHAMPS) {
      const plein = form.elements.namedItem(c).value !== '';
      if (plein) remplis += 1;
      parSection[SECTION_DE[c]] = (parSection[SECTION_DE[c]] || 0) + (plein ? 1 : 0);
      const cran = crans.querySelector(`[data-cran="${c}"]`);
      if (cran.classList.contains('is-plein') !== plein) cran.classList.toggle('is-plein', plein);
    }
    progresNombre.textContent = String(remplis);
    for (const s of SECTIONS) {
      const total = s.blocs.reduce((n, b) => n + b.champs.length, 0);
      const fait = parSection[s.cle] || 0;
      conteneurSections.querySelector(`[data-compte="${s.cle}"]`).textContent = fait === total ? 'Complet' : `${fait} sur ${total}`;
    }
  }

  function majTout() {
    for (const nom of CHAMPS) {
      const input = form.elements.namedItem(nom);
      input.closest('.ligne').classList.toggle('is-rempli', input.value !== '');
    }
    compteurCommentaire.textContent = nombre(commentaire.value.length);
    majJauges();
    majProgres();
  }

  function apresSaisie(input) {
    input.closest('.ligne').classList.toggle('is-rempli', input.value !== '');
    effacerErreur(input);
    majJauges();
    majProgres();
    planifierBrouillon();
  }

  function incrementer(input, pas) {
    const actuel = input.value === '' ? 0 : Number(input.value);
    const suivant = input.value === '' && pas < 0 ? 0 : Math.min(VALEUR_MAX, Math.max(0, actuel + pas));
    input.value = String(suivant);
    const ligne = input.closest('.ligne');
    ligne.classList.remove('is-pulse');
    void ligne.offsetWidth;
    ligne.classList.add('is-pulse');
    apresSaisie(input);
  }

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList.contains('pas__saisie')) {
      const propre = nettoyer(el.value);
      if (propre !== el.value) el.value = propre;
      apresSaisie(el);
    } else if (el === commentaire) {
      compteurCommentaire.textContent = nombre(commentaire.value.length);
      planifierBrouillon();
    } else if (el.name === 'programme_type') {
      planifierBrouillon();
    }
  });

  // Boutons − / + : un appui = 1 pas, appui maintenu = défilement rapide.
  form.addEventListener('pointerdown', (e) => {
    const bouton = e.target.closest('.pas__btn');
    if (!bouton || e.button > 0) return;
    e.preventDefault();
    const input = bouton.parentElement.querySelector('.pas__saisie');
    const pas = Number(bouton.dataset.pas);
    incrementer(input, pas);
    let minuterie = setTimeout(function repeter() {
      incrementer(input, pas);
      minuterie = setTimeout(repeter, 70);
    }, 420);
    const arreter = () => {
      clearTimeout(minuterie);
      window.removeEventListener('pointerup', arreter);
      window.removeEventListener('pointercancel', arreter);
      bouton.removeEventListener('pointerleave', arreter);
    };
    window.addEventListener('pointerup', arreter);
    window.addEventListener('pointercancel', arreter);
    bouton.addEventListener('pointerleave', arreter);
  });

  // Activation au clavier ou par lecteur d'écran (pas d'événement pointeur dans ce cas).
  form.addEventListener('click', (e) => {
    const bouton = e.target.closest('.pas__btn');
    if (bouton && e.detail === 0) incrementer(bouton.parentElement.querySelector('.pas__saisie'), Number(bouton.dataset.pas));
  });

  form.addEventListener('keydown', (e) => {
    const input = e.target;
    if (!input.classList?.contains('pas__saisie')) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      incrementer(input, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    } else if (e.key === 'Enter') {
      // Entrée passe au chiffre suivant plutôt que d'envoyer un rapport incomplet.
      const suivant = CHAMPS[CHAMPS.indexOf(input.name) + 1];
      if (suivant) {
        e.preventDefault();
        form.elements.namedItem(suivant).focus();
      }
    }
  });

  /* ------------------------------------------------------------ Identification */

  form.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'pays') {
      paysChoisi = el.value;
      paysChoisiAMain = true;
      rendreUnites('');
      effacerErreurUnite();
      verrouiller(!pret());
      planifierBrouillon();
    } else if (el.name === 'programme_type') {
      preparerUnite(coordinateurParId(select.value), selectUnite.value);
    } else if (el === selectUnite) {
      effacerErreurUnite();
      verrouiller(!pret());
      planifierBrouillon();
    }
  });

  select.addEventListener('change', () => {
    const coord = coordinateurParId(select.value);
    champCoordinateur.classList.remove('is-invalid');
    erreurCoordinateur.textContent = '';
    rendreProgramme(coord); // toujours « programme assigné » par défaut pour une nouvelle personne
    paysChoisiAMain = false;
    preparerUnite(coord);
    verrouiller(!pret());
    planifierBrouillon();
  });

  async function chargerCoordinateurs() {
    select.disabled = true;
    select.innerHTML = '<option value="">Chargement de la liste…</option>';
    erreurCoordinateur.textContent = '';
    try {
      const [liste, reference] = await Promise.all([api('/api/coordinateurs'), api('/api/unites')]);
      coordinateurs = liste;
      pays = reference.pays;
      unites = reference.unites;
    } catch (err) {
      select.innerHTML = '<option value="">Liste indisponible</option>';
      erreurCoordinateur.innerHTML = `${esc(err.message)} <button type="button" class="lien-discret" id="recharger-liste">Recharger la liste</button>`;
      document.getElementById('recharger-liste').addEventListener('click', chargerCoordinateurs);
      return;
    }
    // Noms regroupés par rôle pour qu'on se retrouve vite dans la liste.
    const GROUPES_ROLES = [
      ['Coordonnateur', 'Coordonnateurs'],
      ['Instructeur', 'Instructeurs'],
      ['Directeur de région', 'Direction de région'],
    ];
    const connus = new Set(GROUPES_ROLES.map(([role]) => role));
    const groupe = (libelleGroupe, personnes) => (personnes.length
      ? `<optgroup label="${esc(libelleGroupe)}">${personnes.map((c) => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}</optgroup>`
      : '');
    select.innerHTML = `<option value="">Choisissez votre nom</option>${
      GROUPES_ROLES.map(([role, libelleGroupe]) => groupe(libelleGroupe, coordinateurs.filter((c) => c.role === role))).join('')
    }${groupe('Autres', coordinateurs.filter((c) => !connus.has(c.role)))}`;
    select.disabled = false;
    restaurerBrouillon();
  }

  /* ------------------------------------------------------------ Brouillon */

  let minuterieBrouillon;
  function planifierBrouillon() {
    clearTimeout(minuterieBrouillon);
    minuterieBrouillon = setTimeout(sauverBrouillon, 400);
  }

  // Annule une sauvegarde en attente : sinon elle réécrirait un rapport déjà envoyé.
  function effacerBrouillon() {
    clearTimeout(minuterieBrouillon);
    brouillon.effacer();
  }

  function sauverBrouillon() {
    const valeurs = Object.fromEntries(CHAMPS.map((c) => [c, form.elements.namedItem(c).value]));
    const vide = !select.value && CHAMPS.every((c) => valeurs[c] === '') && !commentaire.value.trim();
    if (vide || form.hidden) {
      brouillon.effacer();
      return;
    }
    brouillon.ecrire({
      coordinateur_id: select.value,
      programme_type: typeProgramme(),
      pays: paysChoisi,
      pays_a_main: paysChoisiAMain,
      unite_id: selectUnite.value,
      valeurs,
      commentaire: commentaire.value,
      le: Date.now(),
    });
  }

  function restaurerBrouillon() {
    const b = brouillon.lire();
    if (!b || typeof b !== 'object' || Date.now() - Number(b.le) > 14 * 24 * 3600 * 1000) return;
    const coord = coordinateurParId(b.coordinateur_id);
    if (coord) {
      select.value = String(coord.id);
      rendreProgramme(coord, b.programme_type);
      paysChoisiAMain = Boolean(b.pays_a_main);
      if (pays.some((p) => p.code === b.pays)) paysChoisi = b.pays;
      preparerUnite(coord, b.unite_id);
    }
    verrouiller(!pret());
    let remplis = 0;
    for (const c of CHAMPS) {
      const v = nettoyer(b.valeurs?.[c] ?? '');
      form.elements.namedItem(c).value = v;
      if (v !== '') remplis += 1;
    }
    commentaire.value = typeof b.commentaire === 'string' ? b.commentaire.slice(0, 1000) : '';
    majTout();
    if (coord || remplis) toast('Vos chiffres non envoyés ont été récupérés.', 'info', 5000);
  }

  let minuterieConfirmation;
  boutonReinitialiser.addEventListener('click', () => {
    if (!boutonReinitialiser.dataset.confirmer) {
      boutonReinitialiser.dataset.confirmer = '1';
      boutonReinitialiser.textContent = 'Confirmer : tout effacer';
      minuterieConfirmation = setTimeout(() => {
        delete boutonReinitialiser.dataset.confirmer;
        boutonReinitialiser.textContent = 'Tout effacer';
      }, 3500);
      return;
    }
    clearTimeout(minuterieConfirmation);
    delete boutonReinitialiser.dataset.confirmer;
    boutonReinitialiser.textContent = 'Tout effacer';
    reinitialiser({ garderCoordinateur: false });
    toast('Formulaire effacé.', 'info', 2500);
  });

  function reinitialiser({ garderCoordinateur }) {
    for (const c of CHAMPS) {
      const input = form.elements.namedItem(c);
      input.value = '';
      effacerErreur(input);
    }
    commentaire.value = '';
    if (!garderCoordinateur) {
      select.value = '';
      rendreProgramme(null);
      paysChoisi = null;
      paysChoisiAMain = false;
      preparerUnite(null);
    }
    selectUnite.value = '';
    effacerErreurUnite();
    verrouiller(true);
    majTout();
    effacerBrouillon();
  }

  /* ------------------------------------------------------------ Envoi */

  function signaler(nom, message) {
    const input = form.elements.namedItem(nom);
    if (!input) return;
    const ligne = input.closest('.ligne');
    ligne.classList.add('is-invalide');
    ligne.querySelector('.num__erreur').textContent = message;
    const pas = ligne.querySelector('.pas');
    pas.classList.remove('secoue');
    void pas.offsetWidth;
    pas.classList.add('secoue');
  }

  function valider() {
    let premier = null;
    if (!coordinateurParId(select.value)) {
      champCoordinateur.classList.add('is-invalid');
      erreurCoordinateur.textContent = 'Choisissez votre nom dans la liste.';
      premier = select;
    } else if (!uniteParId(selectUnite.value)) {
      champUnite.classList.add('is-invalid');
      erreurUnite.textContent = `Choisissez ${formesTypes(unitesDuPays(), 'le')} de ce rapport.`;
      return selectUnite; // les chiffres restent verrouillés tant que rien n'est choisi
    }
    for (const nom of CHAMPS) {
      const input = form.elements.namedItem(nom);
      if (input.value === '') {
        signaler(nom, 'Indiquez un nombre, ou 0 s’il n’y en a pas.');
        premier ??= input;
      }
    }
    return premier;
  }

  function enEnvoi(actif) {
    envoiEnCours = actif;
    boutonEnvoi.disabled = actif;
    boutonEnvoi.classList.toggle('is-loading', actif);
    boutonEnvoi.querySelector('.btn__texte').textContent = actif ? 'Envoi en cours' : 'Envoyer le rapport';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (envoiEnCours) return;

    const premierInvalide = valider();
    if (premierInvalide) {
      premierInvalide.focus({ preventScroll: true });
      premierInvalide.scrollIntoView({ behavior: window.SAI.mouvementReduit() ? 'auto' : 'smooth', block: 'center' });
      const manquants = CHAMPS.filter((c) => form.elements.namedItem(c).value === '').length;
      let message = `Il manque ${manquants} chiffre${manquants > 1 ? 's' : ''}. Mettez 0 s'il n'y en a pas.`;
      if (premierInvalide === select) message = 'Choisissez votre nom dans la liste.';
      if (premierInvalide === selectUnite) message = `Choisissez ${formesTypes(unitesDuPays(), 'le')} de ce rapport.`;
      toast(message, 'erreur');
      return;
    }

    const coord = coordinateurParId(select.value);
    const type = typeProgramme();
    const corps = { coordinateur_id: coord.id, programme_type: type, unite_id: Number(selectUnite.value), commentaire: commentaire.value.trim() };
    for (const c of CHAMPS) corps[c] = Number(form.elements.namedItem(c).value);

    enEnvoi(true);
    try {
      const { rapport } = await api('/api/rapports', { method: 'POST', body: corps });
      afficherSucces(coord, type, corps, rapport);
      effacerBrouillon();
    } catch (err) {
      for (const [nom, message] of Object.entries(err.details?.champs || {})) {
        if (nom === 'unite_id') {
          champUnite.classList.add('is-invalid');
          erreurUnite.textContent = message;
        } else signaler(nom, message);
      }
      toast(err.reseau ? `${err.message} Vos chiffres restent sur cet appareil.` : err.message, 'erreur', 6500);
    } finally {
      enEnvoi(false);
    }
  });

  /* ------------------------------------------------------------ Confirmation */

  function afficherSucces(coord, type, corps, rapport) {
    const unite = uniteParId(corps.unite_id);
    envoyesCetteVisite.add(`${coord.id}:${type}`);
    envoyesCetteVisite.add(`${coord.id}:${type}:${unite.id}`);
    const prog = coord.programmes.find((p) => p.type === type);
    const autre = coord.programmes.find((p) => p.type !== type && !envoyesCetteVisite.has(`${coord.id}:${p.type}`));
    // Passer au suivant n'a de sens que si le pays compte plusieurs pieux, districts, missions ou branches.
    const memePays = unitesDuPays(unite.pays);
    const ligneRecap = (s) => {
      const prevues = corps[`${s.cle}_classes_a_ouvrir`];
      const ouvertes = corps[`${s.cle}_classes_ouvertes`];
      return `<tr class="teinte-${s.cle}"><th scope="row">${s.titre}</th><td data-label="Prévues">${nombre(prevues)}</td><td data-label="Ouvertes">${nombre(ouvertes)}</td><td data-label="Taux">${pourcent(ouvertes, prevues)}</td></tr>`;
    };

    succes.innerHTML = `
      <div class="succes__soleil">
        <svg class="succes__check" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="40"/><path d="M24 41.5 35 52.5 57 29"/></svg>
      </div>
      <h2>Rapport envoyé</h2>
      <p class="succes__unite">${drapeau(unite.pays)}<span>${esc(unite.nom)}</span></p>
      <p class="succes__texte">Merci, ${esc(coord.nom)}. Les chiffres de ${(TYPES_UNITE[unite.type] || TYPES_UNITE.Pieu).ce} pour <strong>${esc(programme(prog.nom).libelle)}</strong> sont arrivés chez l'administration le ${esc(date(rapport.soumis_le))}.</p>
      <table class="recap">
        <thead><tr><th scope="col"><span class="sr-only">Programme</span></th><th scope="col">Classes prévues</th><th scope="col">Classes ouvertes</th><th scope="col">Taux d'ouverture</th></tr></thead>
        <tbody>${SECTIONS.map(ligneRecap).join('')}</tbody>
      </table>
      <div class="succes__actions">
        ${memePays.length > 1 ? `<button type="button" class="btn btn--primary" data-action="autre-unite">Autre ${formesTypes(memePays, 'un')}</button>` : ''}
        ${autre ? `<button type="button" class="btn" data-action="autre">Remplir pour ${esc(programme(autre.nom).libelle)}</button>` : ''}
        <button type="button" class="btn" data-action="corriger">${icone('crayon')}Corriger ce rapport</button>
        <button type="button" class="btn btn--ghost" data-action="nouveau">Nouveau rapport</button>
      </div>`;
    succes.dataset.autre = autre ? autre.type : '';
    form.hidden = true;
    succes.hidden = false;
    succes.focus({ preventScroll: true });
    document.querySelector('.feuille').scrollIntoView({ behavior: window.SAI.mouvementReduit() ? 'auto' : 'smooth', block: 'start' });
  }

  function revenirAuFormulaire() {
    succes.hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: window.SAI.mouvementReduit() ? 'auto' : 'smooth', block: 'start' });
  }

  succes.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const coord = coordinateurParId(select.value);
    if (action === 'autre-unite') {
      // Même personne, même programme, même pays : on passe au pieu, district ou mission suivant.
      reinitialiser({ garderCoordinateur: true });
      rendreProgramme(coord, typeProgramme());
      preparerUnite(coord);
    } else if (action === 'autre') {
      reinitialiser({ garderCoordinateur: true });
      rendreProgramme(coord, succes.dataset.autre);
      preparerUnite(coord);
    } else if (action === 'corriger') {
      const uniteActuelle = selectUnite.value;
      rendreProgramme(coord, typeProgramme());
      preparerUnite(coord, uniteActuelle);
      toast('Modifiez les chiffres puis renvoyez : le nouvel envoi remplace le précédent.', 'info', 5500);
    } else {
      reinitialiser({ garderCoordinateur: false });
    }
    revenirAuFormulaire();
  });

  /* ------------------------------------------------------------ Démarrage */

  verrouiller(true);
  majTout();
  chargerCoordinateurs();
})();
