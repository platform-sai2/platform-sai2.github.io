'use strict';

(() => {
  const {
    icone, esc, nombre, pourcent, ratio, date, ilYa, programme, TYPES_UNITE, majuscule, formesTypes, typesUnites, api, toast, compter,
    session, entetesSession, RACINE,
  } = window.SAI;

  // Session expirée, fermée ou absente : retour à la page de connexion (admin/), une seule fois même si
  // plusieurs demandes en cours reçoivent le refus.
  let retourEnCours = false;
  function retourConnexion() {
    if (retourEnCours) return;
    retourEnCours = true;
    session.effacer();
    window.location.replace('./');
  }
  if (!session.lire()) {
    retourConnexion();
    return;
  }

  const $ = (id) => document.getElementById(id);
  const el = {
    nbRecus: $('nb-recus'),
    appelTexte: $('appel-texte'),
    titreUnites: $('titre-unites'),
    titreEffectifs: $('titre-effectifs'),
    sousTitreProgrammes: $('sous-titre-programmes'),
    titreBase: $('titre-base'),
    segments: $('segments'),
    dernier: $('dernier'),
    totaux: $('totaux'),
    paysCartes: $('pays-cartes'),
    tuilesUnites: $('tuiles-unites'),
    noteSansPieu: $('note-sans-pieu'),
    tuilesProgrammes: $('tuiles-programmes'),
    appelProgrammes: $('appel-programmes'),
    grapheZone: $('graphe-zone'),
    graphe: $('graphe'),
    tableVue: $('table-vue'),
    sousTitreBase: $('sous-titre-base'),
    tableHistorique: $('table-historique'),
    tableCoordinateurs: $('table-coordinateurs'),
    badgeHistorique: $('badge-historique'),
    direct: $('direct'),
    infobulle: $('infobulle'),
    rechercheVue: $('recherche-vue'),
    rechercheHistorique: $('recherche-historique'),
    segmentPopulation: $('segment-population'),
    segmentPays: $('segment-pays'),
    dialogueCoordinateur: $('dialogue-coordinateur'),
    formCoordinateur: $('form-coordinateur'),
    titreDialogueCoordinateur: $('titre-dialogue-coordinateur'),
    boutonEnregistrer: $('enregistrer-coordinateur'),
    dialogueConfirmation: $('dialogue-confirmation'),
    texteConfirmation: $('texte-confirmation'),
    boutonConfirmer: $('confirmer-suppression'),
  };
  const onglets = [...document.querySelectorAll('[role="tab"]')];

  const etat = {
    donnees: null,
    revision: null, // révision des données affichées (voir « Temps réel »)
    dernierId: null, // numéro du dernier rapport connu
    premierRendu: true,
    population: 'total',
    pays: 'tous',
    role: 'tous',
    rechercheVue: '',
    rechercheHistorique: '',
    tri: { cle: 'unite', sens: 1 },
    programmesSurligner: new Set(),
    unitesSurligner: new Set(),
    lignesSurligner: new Set(),
    rapportsSurligner: new Set(),
    lignesGraphe: [],
    infobulleIndex: null,
    coordinateurEdite: null,
    rapportASupprimer: null,
  };

  const SEM = { cle: 'sem', titre: 'Séminaire', icone: 'livre' };
  const INST = { cle: 'inst', titre: 'Institut', icone: 'diplome' };
  const RAE = { cle: 'rae', titre: "Réussir à l'école", icone: 'cible' };
  const MIS = { cle: 'mis', titre: 'Préparation missionnaire', icone: 'globe' };
  const GROUPES = [SEM, INST, RAE, MIS];

  // Colonnes chiffrées communes à la base de données et à l'historique : pour chaque programme,
  // les classes prévues (colonnes « classes_a_ouvrir ») puis les classes ouvertes, avec la part déjà ouverte.
  const COLONNES_CHIFFRES = GROUPES.flatMap((g) => [
    { cle: `${g.cle}_classes_a_ouvrir`, titre: 'Prévues', groupe: g, debut: true },
    { cle: `${g.cle}_classes_ouvertes`, titre: 'Ouvertes', groupe: g, den: `${g.cle}_classes_a_ouvrir` },
  ]);

  // Classes prévues et ouvertes d'un ensemble de rapports, pour certains programmes ou pour tous.
  function classesDe(rapports, cles = GROUPES.map((g) => g.cle)) {
    let prevues = 0;
    let ouvertes = 0;
    for (const r of rapports) {
      for (const cle of cles) {
        prevues += r[`${cle}_classes_a_ouvrir`] ?? 0;
        ouvertes += r[`${cle}_classes_ouvertes`] ?? 0;
      }
    }
    return { prevues, ouvertes };
  }
  const collator = new Intl.Collator('fr', { sensitivity: 'base' });
  const libelle = (nomProgramme) => programme(nomProgramme).libelle;
  const SANS_PIEU = 'Sans pieu (envoyé avant la mise à jour)';
  const nomPays = (code) => etat.donnees?.pays.find((p) => p.code === code)?.nom || '';
  const drapeau = (code) => (code
    ? `<img class="drapeau" src="${RACINE}img/drapeaux/${code.toLowerCase()}.svg" alt="${esc(nomPays(code))}" width="24" height="16">`
    : '');
  // Clé d'une ligne retenue : un programme pour un pieu (ou sans pieu pour les anciens envois).
  const cleLigne = (nomProgramme, uniteId) => `${nomProgramme}|${uniteId ?? ''}`;
  const somme0 = (rapports, cle) => rapports.reduce((t, r) => t + (r[cle] ?? 0), 0);
  const programmesTries = () => [...etat.donnees.programmes].sort((a, b) => collator.compare(libelle(a.programme), libelle(b.programme)));
  function trierLignes(lignes) {
    const ordre = new Map(etat.donnees.unites.map((u, i) => [u.id, i]));
    return [...lignes].sort((a, b) => (ordre.get(a.unite_id) ?? 999) - (ordre.get(b.unite_id) ?? 999)
      || collator.compare(libelle(a.programme), libelle(b.programme)));
  }
  const mouvement = () => (window.SAI.mouvementReduit() ? 'auto' : 'smooth');

  /* ================================================================ Données */

  let chargementEnCours = false;
  let rechargerEnsuite = false;

  async function rafraichir() {
    if (chargementEnCours) {
      rechargerEnsuite = true;
      return;
    }
    chargementEnCours = true;
    try {
      etat.donnees = await api('/api/admin/donnees');
      etat.revision = etat.donnees.revision;
      etat.dernierId = Math.max(etat.dernierId ?? 0, etat.donnees.rapports[0]?.id ?? 0);
      rendre();
      etat.premierRendu = false;
    } catch (err) {
      if (err.statut === 401) {
        retourConnexion();
        return;
      }
      toast(err.message, 'erreur');
    } finally {
      chargementEnCours = false;
      if (rechargerEnsuite) {
        rechargerEnsuite = false;
        rafraichir();
      }
    }
  }

  // Regroupe les demandes rapprochées (événement temps réel + action locale) en un seul chargement.
  let minuterieRafraichissement;
  function planifierRafraichissement() {
    clearTimeout(minuterieRafraichissement);
    minuterieRafraichissement = setTimeout(rafraichir, 150);
  }

  function rendre() {
    rendreTextesUnites();
    rendreAppel();
    rendreTotaux();
    rendrePays();
    rendreUnites();
    rendreProgrammes();
    rendreGraphe();
    rendreTableVue();
    rendreHistorique();
    rendreCoordinateurs();
  }

  // Titres et filtres qui dépendent de la liste : ils restent justes quand un pays, un pieu, un district,
  // une mission ou une branche s'ajoute.
  const unitesActives = () => etat.donnees.unites.filter((u) => u.actif);

  function rendreTextesUnites() {
    const actives = unitesActives();
    el.titreUnites.textContent = majuscule(typesUnites(actives));
    el.titreEffectifs.textContent = `Classes par ${formesTypes(actives, 'un', 'et')}`;
    el.sousTitreProgrammes.textContent = `Qui a envoyé, et pour combien de ${typesUnites(actives)}.`;
    el.titreBase.textContent = `Dernier rapport de chaque programme, par ${formesTypes(actives, 'un')}`;
    if (!el.segmentPays.querySelector('[data-pays]:not([data-pays="tous"])')) {
      el.segmentPays.insertAdjacentHTML('beforeend', etat.donnees.pays.map((p) => `
        <button type="button" data-pays="${p.code}" aria-pressed="${etat.pays === p.code}"><img class="drapeau" src="${RACINE}img/drapeaux/${p.code.toLowerCase()}.svg" alt="" width="24" height="16">${esc(p.nom)}</button>`).join(''));
    }
  }

  // Le surlignage vit quelques secondes, quel que soit le nombre de rendus entre-temps.
  function surligner(ensemble, cle) {
    ensemble.add(cle);
    setTimeout(() => ensemble.delete(cle), 4000);
  }

  function animerBarres(racine) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const barre of racine.querySelectorAll('[data-largeur]')) barre.style.width = `${barre.dataset.largeur}%`;
    }));
  }

  /* ================================================================ En-tête : l'appel */

  function rendreAppel() {
    const { totaux, rapports, unites, pays } = etat.donnees;
    compter(el.nbRecus, totaux.unites_recues);
    el.appelTexte.innerHTML = `${esc(typesUnites(unitesActives()))} sur <strong>${nombre(totaux.unites_total)}</strong> ont envoyé des chiffres`;
    el.badgeHistorique.textContent = nombre(rapports.length);

    // Un segment par pieu, district ou mission, regroupés par pays derrière leur drapeau.
    let i = 0;
    el.segments.classList.toggle('premier-rendu', etat.premierRendu);
    el.segments.innerHTML = pays.map((p) => {
      const duPays = unites.filter((u) => u.pays === p.code && u.actif);
      return `
        <div class="segments__pays" style="--n:${duPays.length}">
          ${drapeau(p.code)}
          <div class="segments__liste">${duPays.map((u) => {
            const recu = u.nb_rapports > 0;
            const titre = `${u.nom} : ${recu ? `${u.nb_rapports} programme${u.nb_rapports > 1 ? 's' : ''}` : 'aucun rapport'}`;
            const classes = `segment-prog${recu ? ' is-recu' : ''}${etat.unitesSurligner.has(u.id) ? ' is-nouveau' : ''}`;
            return `<span class="${classes}" style="--i:${i++}" title="${esc(titre)}"></span>`;
          }).join('')}</div>
        </div>`;
    }).join('');

    const n = totaux.programmes_recus;
    el.appelProgrammes.textContent = `${nombre(n)} programme${n > 1 ? 's' : ''} sur ${nombre(totaux.programmes_attendus)} ${n > 1 ? 'ont' : 'a'} envoyé au moins un rapport.`;

    const dernier = rapports[0];
    el.dernier.innerHTML = dernier
      ? `Dernier rapport : <strong>${esc(dernier.unite_nom || libelle(dernier.programme))}</strong>${dernier.unite_nom ? ` pour ${esc(libelle(dernier.programme))}` : ''}, envoyé par ${esc(dernier.coordinateur_nom)} ${esc(ilYa(dernier.soumis_le))}.`
      : 'Aucun rapport pour l’instant. Copiez le lien du formulaire et envoyez-le aux coordonnateurs et aux instructeurs.';
  }

  function majDirect(etatConnexion) {
    el.direct.dataset.etat = etatConnexion;
    el.direct.querySelector('.direct__texte').textContent = etatConnexion === 'ok' ? 'En direct' : 'Reconnexion';
    el.direct.title = etatConnexion === 'ok' ? 'Les nouveaux rapports apparaissent sans recharger la page' : 'Connexion en direct interrompue, nouvelle tentative en cours';
  }

  /* ================================================================ Totaux */

  // Une carte par programme : classes ouvertes sur classes prévues.
  function rendreTotaux() {
    const t = etat.donnees.totaux;
    if (!el.totaux.childElementCount) {
      el.totaux.innerHTML = GROUPES.map((g) => `
        <div class="total teinte-${g.cle}" data-total="${g.cle}">
          <p class="total__label">${icone(g.icone)}${g.titre}</p>
          <p class="total__valeur"><span data-valeur>0</span> <small></small></p>
          <div class="jauge__piste" role="img"><div class="jauge__barre"></div></div>
          <p class="total__detail"></p>
          <p class="total__couverture" hidden></p>
        </div>`).join('');
    }
    for (const g of GROUPES) {
      const bloc = el.totaux.querySelector(`[data-total="${g.cle}"]`);
      const { prevues, ouvertes } = classesDe([t], [g.cle]);
      compter(bloc.querySelector('[data-valeur]'), ouvertes);
      bloc.querySelector('small').textContent = `sur ${nombre(prevues)}`;
      const piste = bloc.querySelector('.jauge__piste');
      piste.setAttribute('aria-label', `${g.titre} : ${ouvertes} classes ouvertes sur ${prevues} prévues`);
      piste.querySelector('.jauge__barre').dataset.largeur = String(Math.min(1, ratio(ouvertes, prevues) || 0) * 100);
      let detail = 'En attente des premiers rapports';
      if (t.recus) detail = prevues ? `${pourcent(ouvertes, prevues)} ouvertes` : 'Aucune classe prévue';
      bloc.querySelector('.total__detail').textContent = detail;
      // Les rapports envoyés avant l'ajout d'une question n'y répondent pas : on dit sur combien porte le total.
      const renseignes = Math.min(...[`${g.cle}_classes_a_ouvrir`, `${g.cle}_classes_ouvertes`].map((c) => t.renseignes?.[c] ?? t.recus));
      const couverture = bloc.querySelector('.total__couverture');
      couverture.hidden = !t.recus || renseignes >= t.recus;
      couverture.textContent = `Renseigné dans ${nombre(renseignes)} des ${nombre(t.recus)} rapports retenus`;
    }
    animerBarres(el.totaux);
  }

  /* ================================================================ Par pays */

  function rendrePays() {
    const { pays, lignes, unites } = etat.donnees;
    el.paysCartes.innerHTML = pays.map((p) => {
      const rapports = lignes.filter((l) => l.pays === p.code).map((l) => l.rapport);
      const duPays = unites.filter((u) => u.pays === p.code && u.actif);
      const recues = duPays.filter((u) => u.nb_rapports > 0).length;
      return `
        <article class="pays-carte">
          <header class="pays-carte__tete">
            <img class="drapeau drapeau--grand" src="${RACINE}img/drapeaux/${p.code.toLowerCase()}.svg" alt="" width="48" height="32">
            <div>
              <h3>${esc(p.nom)}</h3>
              <p title="${esc(typesUnites(duPays))}">Renseignés : <strong>${nombre(recues)}</strong> sur ${nombre(duPays.length)}</p>
            </div>
          </header>
          <div class="jauge__piste" role="img" aria-label="${esc(`Renseignés : ${recues} sur ${duPays.length} ${typesUnites(duPays)}`)}">
            <div class="jauge__barre" data-largeur="${duPays.length ? (recues / duPays.length) * 100 : 0}"></div>
          </div>
          <p class="pays-carte__legende">Classes ouvertes sur classes prévues</p>
          <dl class="pays-carte__chiffres">${GROUPES.map((g) => {
            const { prevues, ouvertes } = classesDe(rapports, [g.cle]);
            return `<div class="teinte-${g.cle}"><dt><i></i>${g.titre}</dt><dd>${nombre(ouvertes)} <small>sur ${nombre(prevues)}</small></dd></div>`;
          }).join('')}</dl>
          <button type="button" class="lien-carte" data-voir-pays="${p.code}">Voir dans la base de données</button>
        </article>`;
    }).join('');
    animerBarres(el.paysCartes);
  }

  function voirDansLaBase({ recherche = '', pays = 'tous' }) {
    etat.rechercheVue = recherche;
    el.rechercheVue.value = recherche;
    choisirPays(pays);
    choisirOnglet('base');
    document.querySelector('.onglets').scrollIntoView({ behavior: mouvement(), block: 'start' });
  }

  el.paysCartes.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-voir-pays]');
    if (bouton) voirDansLaBase({ pays: bouton.dataset.voirPays });
  });

  /* ================================================================ Pieux, districts et missions (tuiles) */

  function rendreUnites() {
    const { pays, unites, lignes } = etat.donnees;
    el.tuilesUnites.innerHTML = pays.map((p) => {
      const duPays = unites.filter((u) => u.pays === p.code && (u.actif || u.nb_rapports));
      return `
        <section class="groupe-pays" aria-label="${esc(p.nom)}">
          <h3 class="groupe-pays__titre">${drapeau(p.code)}${esc(p.nom)}<span>${nombre(duPays.filter((u) => u.nb_rapports).length)} sur ${nombre(duPays.length)}</span></h3>
          <div class="tuiles">${duPays.map((u) => {
            const recu = u.nb_rapports > 0;
            const classes = classesDe(lignes.filter((l) => l.unite_id === u.id).map((l) => l.rapport));
            const statut = recu
              ? `${icone('coche')}${u.nb_rapports} programme${u.nb_rapports > 1 ? 's' : ''}, ${esc(ilYa(u.dernier_envoi))}`
              : `${icone('horloge')}Aucun rapport`;
            return `
              <button type="button" class="tuile ${recu ? 'is-recu' : 'is-attente'}${etat.unitesSurligner.has(u.id) ? ' is-nouveau' : ''}" data-unite="${esc(u.nom)}">
                <span class="tuile__nom">${esc(u.nom)}</span>
                <span class="tuile__coord">${esc(u.type)}</span>
                ${recu ? `<span class="tuile__chiffres"><span><b>${nombre(classes.ouvertes)}</b> classes ouvertes sur ${nombre(classes.prevues)}</span></span>` : ''}
                <span class="tuile__statut">${statut}</span>
              </button>`;
          }).join('')}</div>
        </section>`;
    }).join('');

    const sansPieu = lignes.filter((l) => l.unite_id === null).length;
    el.noteSansPieu.hidden = !sansPieu;
    el.noteSansPieu.textContent = `${nombre(sansPieu)} rapport${sansPieu > 1 ? 's' : ''} envoyé${sansPieu > 1 ? 's' : ''} avant la mise à jour n'${sansPieu > 1 ? 'ont' : 'a'} pas de pieu : ${sansPieu > 1 ? 'ils restent comptés' : 'il reste compté'} jusqu'à ce que le programme envoie ses chiffres par pieu, district ou mission.`;
  }

  el.tuilesUnites.addEventListener('click', (e) => {
    const tuile = e.target.closest('[data-unite]');
    if (tuile) voirDansLaBase({ recherche: tuile.dataset.unite });
  });

  /* ================================================================ Programmes (tuiles) */

  function rendreProgrammes() {
    el.tuilesProgrammes.innerHTML = programmesTries().map((p) => {
      let statut = `${icone('horloge')}En attente`;
      if (p.recu && p.sans_pieu) statut = `${icone('coche')}Reçu sans pieu ${esc(ilYa(p.dernier_envoi))}`;
      else if (p.recu) {
        const envoyes = etat.donnees.lignes.filter((l) => l.programme === p.programme && l.unite_id !== null).map((l) => ({ type: l.unite_type }));
        statut = `${icone('coche')}${typesUnites(envoyes, { avecNombres: true })}, ${esc(ilYa(p.dernier_envoi))}`;
      }
      return `
        <button type="button" class="tuile${p.recu ? ' is-recu' : ' is-attente'}${etat.programmesSurligner.has(p.programme) ? ' is-nouveau' : ''}" data-programme="${esc(p.programme)}">
          <span class="tuile__nom">${esc(libelle(p.programme))}</span>
          <span class="tuile__coord">${esc(p.coordinateur_nom)}</span>
          <span class="tuile__statut">${statut}</span>
        </button>`;
    }).join('');
  }

  el.tuilesProgrammes.addEventListener('click', (e) => {
    const tuile = e.target.closest('[data-programme]');
    if (tuile) voirDansLaBase({ recherche: libelle(tuile.dataset.programme) });
  });

  /* ================================================================ Graphique */

  function rendreGraphe() {
    const pop = etat.population;
    el.grapheZone.className = `graphe-zone pop-${pop}`;
    const cles = pop === 'total' ? undefined : [pop];

    // Une barre par pieu, district ou mission : les programmes qui le renseignent s'additionnent.
    const groupes = new Map();
    for (const l of etat.donnees.lignes) {
      const cle = l.unite_id ?? `sans-pieu:${l.programme}`;
      if (!groupes.has(cle)) {
        groupes.set(cle, {
          titre: l.unite_nom || SANS_PIEU,
          pays: l.pays,
          sansPieu: l.unite_id === null,
          programmes: [],
          rapports: [],
        });
      }
      const g = groupes.get(cle);
      g.programmes.push(libelle(l.programme));
      g.rapports.push(l.rapport);
    }
    const lignes = [...groupes.values()]
      .map((g) => ({
        ...g,
        sous: g.sansPieu ? g.programmes[0] : `${g.programmes.length} programme${g.programmes.length > 1 ? 's' : ''}`,
        ...classesDe(g.rapports, cles),
      }))
      .sort((a, b) => b.prevues - a.prevues || b.ouvertes - a.ouvertes);
    etat.lignesGraphe = lignes;
    cacherInfobulle();

    if (!lignes.length) {
      el.graphe.innerHTML = `
        <div class="vide">
          <strong>Aucun rapport pour l'instant</strong>
          <span>Les classes de chaque ${formesTypes(unitesActives(), 'un', 'et')} s'afficheront ici dès le premier envoi.</span>
          <button type="button" class="btn btn--primary btn--sm" data-copier-lien>${icone('lien')}Copier le lien du formulaire</button>
        </div>`;
      return;
    }

    const max = Math.max(1, ...lignes.map((x) => Math.max(x.prevues, x.ouvertes)));
    el.graphe.innerHTML = lignes.map((x, i) => `
      <div class="graphe__ligne" tabindex="0" data-index="${i}" aria-label="${esc(`${x.titre} : ${x.ouvertes} classes ouvertes sur ${x.prevues} prévues`)}">
        <div class="graphe__libelle">
          <span class="graphe__prog">${drapeau(x.pays)}${esc(x.titre)}</span>
          <span class="graphe__coord">${esc(x.sous)}</span>
        </div>
        <div class="graphe__piste" aria-hidden="true">
          <div class="graphe__barre graphe__barre--prevues" data-largeur="${(x.prevues / max) * 100}"></div>
          <div class="graphe__barre graphe__barre--ouvertes" data-largeur="${(x.ouvertes / max) * 100}"></div>
        </div>
        <div class="graphe__valeur" aria-hidden="true"><strong>${nombre(x.ouvertes)}</strong> sur ${nombre(x.prevues)}</div>
      </div>`).join('');
    animerBarres(el.graphe);
  }

  function montrerInfobulle(ligne, x, y) {
    const index = Number(ligne.dataset.index);
    const d = etat.lignesGraphe[index];
    if (!d) return;
    if (etat.infobulleIndex !== index) {
      etat.infobulleIndex = index;
      el.infobulle.innerHTML = `
        <strong>${esc(d.titre)}</strong>
        <div class="infobulle__coord">${esc(d.sansPieu ? d.sous : `${nomPays(d.pays)}, ${d.programmes.join(', ')}`)}</div>
        <div class="infobulle__ligne"><i style="background:var(--clair)"></i>Classes prévues<b>${nombre(d.prevues)}</b></div>
        <div class="infobulle__ligne"><i style="background:var(--fonce)"></i>Classes ouvertes<b>${nombre(d.ouvertes)}</b></div>
        <div class="infobulle__ligne"><i></i>Taux d'ouverture<b>${pourcent(d.ouvertes, d.prevues)}</b></div>`;
    }
    // Les pastilles lisent les couleurs de la population affichée
    el.infobulle.className = `infobulle pop-${etat.population}`;
    el.infobulle.style.setProperty('--clair', getComputedStyle(el.grapheZone).getPropertyValue('--clair'));
    el.infobulle.style.setProperty('--fonce', getComputedStyle(el.grapheZone).getPropertyValue('--fonce'));
    el.infobulle.hidden = false;
    const { width, height } = el.infobulle.getBoundingClientRect();
    const gauche = Math.min(window.innerWidth - width - 12, Math.max(12, x + 16));
    const haut = y - height - 14 < 12 ? y + 20 : y - height - 14;
    el.infobulle.style.left = `${gauche}px`;
    el.infobulle.style.top = `${haut}px`;
  }

  function cacherInfobulle() {
    el.infobulle.hidden = true;
    etat.infobulleIndex = null;
  }

  el.graphe.addEventListener('pointermove', (e) => {
    const ligne = e.target.closest('.graphe__ligne');
    if (ligne) montrerInfobulle(ligne, e.clientX, e.clientY);
    else cacherInfobulle();
  });
  el.graphe.addEventListener('pointerleave', cacherInfobulle);
  el.graphe.addEventListener('focusin', (e) => {
    const ligne = e.target.closest('.graphe__ligne');
    if (!ligne) return;
    const r = ligne.getBoundingClientRect();
    montrerInfobulle(ligne, r.left + r.width / 2, r.top);
  });
  el.graphe.addEventListener('focusout', cacherInfobulle);
  window.addEventListener('scroll', cacherInfobulle, { passive: true });

  el.segmentPopulation.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-population]');
    if (!bouton) return;
    etat.population = bouton.dataset.population;
    for (const b of el.segmentPopulation.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === bouton));
    rendreGraphe();
  });

  /* ================================================================ Cellules partagées des tableaux */

  // Première colonne : le pieu, district ou mission (avec son drapeau), puis le programme et la personne.
  function celluleLigne({ unite_nom: uniteNom, pays, programme: nomProgramme, coordinateur_nom: coordinateur, programme_type: type }) {
    const details = [libelle(nomProgramme), coordinateur, type === 'affilie' ? 'affilié' : null].filter(Boolean).join(', ');
    return `<td class="fige"><div class="cellule-prog"><strong>${drapeau(pays)}${esc(uniteNom || SANS_PIEU)}</strong><span>${esc(details)}</span></div></td>`;
  }

  function celluleChiffre(r, col) {
    const classe = `num${col.debut ? ' debut-groupe' : ''}`;
    if (!r) return `<td class="${classe}">–</td>`;
    if (r[col.cle] === null || r[col.cle] === undefined) {
      return `<td class="${classe}" title="Chiffre pas encore demandé lors de cet envoi">–</td>`;
    }
    const part = col.den ? `<span class="sous-valeur">${pourcent(r[col.cle], r[col.den])}</span>` : '';
    return `<td class="${classe}">${nombre(r[col.cle])}${part}</td>`;
  }

  function thTri(col, attributs = '') {
    const classes = [col.fige && 'fige', col.num && 'num', col.debut && 'debut-groupe'].filter(Boolean).join(' ');
    if (!col.triable) return `<th ${attributs} class="${classes}" scope="col">${col.titre}</th>`;
    const tri = etat.tri.cle === col.cle ? (etat.tri.sens > 0 ? 'ascending' : 'descending') : 'none';
    return `<th ${attributs} class="${classes}" scope="col" aria-sort="${tri}"><button type="button" class="trier" data-tri="${col.cle}">${col.titre}</button></th>`;
  }

  function enteteGroupes(avant, apres, triable = false) {
    const ligne1 = [
      ...avant.map((c) => thTri(c, 'rowspan="2"')),
      ...GROUPES.map((g) => `<th class="groupe teinte-${g.cle}" colspan="${COLONNES_CHIFFRES.filter((c) => c.groupe === g).length}" scope="colgroup">${g.titre}</th>`),
      ...apres.map((c) => thTri(c, 'rowspan="2"')),
    ];
    const ligne2 = COLONNES_CHIFFRES.map((c) => thTri({ ...c, num: true, triable }));
    return `<thead><tr>${ligne1.join('')}</tr><tr>${ligne2.join('')}</tr></thead>`;
  }

  function correspond(texte, recherche) {
    if (!recherche) return true;
    const normaliser = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    return normaliser(texte).includes(normaliser(recherche));
  }

  /* ================================================================ Base de données (dernier rapport par pieu et par programme) */

  const colonneUnite = (options = {}) => ({ cle: 'unite', titre: `${majuscule(formesTypes(unitesActives(), 'un'))} et programme`, fige: true, ...options });
  const COLONNE_MAJ = { cle: 'maj', titre: 'Mis à jour', debut: true, triable: true };

  function valeurTri(ligne, cle, ordre) {
    const r = ligne.rapport;
    if (cle === 'unite') return `${String(ordre.get(ligne.unite_id) ?? 999).padStart(4, '0')}|${libelle(ligne.programme).toLowerCase()}`;
    if (cle === 'maj') return r.soumis_le;
    return COLONNES_CHIFFRES.some((c) => c.cle === cle) ? (r[cle] ?? -1) : -1;
  }

  function rendreTableVue() {
    const { lignes: toutes, totaux, unites } = etat.donnees;
    const ordre = new Map(unites.map((u, i) => [u.id, i]));
    const lignes = toutes
      .filter((l) => etat.pays === 'tous' || l.pays === etat.pays)
      .filter((l) => correspond(`${l.unite_nom || SANS_PIEU} ${l.programme} ${l.coordinateur_nom}`, etat.rechercheVue))
      .sort((a, b) => {
        const va = valeurTri(a, etat.tri.cle, ordre);
        const vb = valeurTri(b, etat.tri.cle, ordre);
        return (va < vb ? -1 : va > vb ? 1 : 0) * etat.tri.sens;
      });

    const sansEnvoi = totaux.programmes_attendus - totaux.programmes_recus;
    el.sousTitreBase.textContent = `${nombre(totaux.recus)} rapport${totaux.recus > 1 ? 's' : ''} retenu${totaux.recus > 1 ? 's' : ''}, ${nombre(totaux.unites_recues)} ${typesUnites(unitesActives())} sur ${nombre(totaux.unites_total)}. ${nombre(sansEnvoi)} programme${sansEnvoi > 1 ? 's' : ''} sans aucun envoi. ${nombre(lignes.length)} affiché${lignes.length > 1 ? 's' : ''}.`;

    const entete = enteteGroupes([colonneUnite({ triable: true })], [COLONNE_MAJ], true);
    const corps = lignes.length
      ? lignes.map((l) => {
        const r = l.rapport;
        const nouveau = etat.lignesSurligner.has(cleLigne(l.programme, l.unite_id));
        return `
          <tr class="${nouveau ? 'is-nouveau' : ''}">
            ${celluleLigne(l)}
            ${COLONNES_CHIFFRES.map((c) => celluleChiffre(r, c)).join('')}
            <td class="debut-groupe cellule-statut"><span title="${esc(date(r.soumis_le))}">${esc(ilYa(r.soumis_le))}</span></td>
          </tr>`;
      }).join('')
      : `<tr class="table-vide"><td colspan="${COLONNES_CHIFFRES.length + 2}">${toutes.length ? 'Aucun rapport ne correspond. Effacez la recherche ou choisissez « Tous ».' : 'Aucun rapport pour l’instant.'}</td></tr>`;

    const total = {};
    for (const cle of etat.donnees.champs) total[cle] = somme0(lignes.map((l) => l.rapport), cle);
    const pied = lignes.length
      ? `<tfoot><tr>
          <td class="fige">Total de ${nombre(lignes.length)} rapport${lignes.length > 1 ? 's' : ''}</td>
          ${COLONNES_CHIFFRES.map((c) => celluleChiffre(total, c)).join('')}
          <td class="debut-groupe"></td>
        </tr></tfoot>`
      : '';

    el.tableVue.innerHTML = `${entete}<tbody>${corps}</tbody>${pied}`;
  }

  el.tableVue.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-tri]');
    if (!bouton) return;
    const cle = bouton.dataset.tri;
    etat.tri = { cle, sens: etat.tri.cle === cle ? -etat.tri.sens : (cle === 'unite' ? 1 : -1) };
    rendreTableVue();
    el.tableVue.querySelector(`[data-tri="${cle}"]`)?.focus();
  });

  el.rechercheVue.addEventListener('input', () => {
    etat.rechercheVue = el.rechercheVue.value.trim();
    rendreTableVue();
  });

  function choisirPays(code) {
    etat.pays = code;
    for (const b of el.segmentPays.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.pays === code));
    if (etat.donnees) rendreTableVue();
  }

  el.segmentPays.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-pays]');
    if (bouton) choisirPays(bouton.dataset.pays);
  });

  /* ================================================================ Historique */

  function rendreHistorique() {
    const { rapports, unites } = etat.donnees;
    const paysUnite = new Map(unites.map((u) => [u.id, u.pays]));
    // Du plus récent au plus ancien : le premier envoi vu pour un couple (programme, pieu) est sa version actuelle.
    const vus = new Set();
    const actuels = new Set();
    for (const r of rapports) {
      const cle = cleLigne(r.programme, r.unite_id);
      if (vus.has(cle)) continue;
      vus.add(cle);
      actuels.add(r.id);
    }
    const lignes = rapports.filter((r) => correspond(`${r.unite_nom || SANS_PIEU} ${r.programme} ${r.coordinateur_nom} ${r.commentaire || ''}`, etat.rechercheHistorique));

    const entete = enteteGroupes(
      [colonneUnite(), { cle: 'date', titre: 'Envoyé le' }],
      [{ cle: 'commentaire', titre: 'Commentaire', debut: true }, { cle: 'actions', titre: '<span class="sr-only">Actions</span>' }],
    );
    const corps = lignes.length
      ? lignes.map((r) => {
        const actuel = actuels.has(r.id);
        const nouveau = etat.rapportsSurligner.has(r.id);
        return `
          <tr class="${nouveau ? 'is-nouveau' : ''}">
            ${celluleLigne({ ...r, pays: paysUnite.get(r.unite_id) })}
            <td><span class="horodatage">${esc(date(r.soumis_le))}</span>
              ${actuel ? `<span class="pill pill--good">${icone('coche')}Version actuelle</span>` : '<span class="sous-valeur">Remplacé par un envoi plus récent</span>'}</td>
            ${COLONNES_CHIFFRES.map((c) => celluleChiffre(r, c)).join('')}
            <td class="debut-groupe commentaire-cellule">${r.commentaire ? esc(r.commentaire) : '<span class="sous-valeur">Aucun</span>'}</td>
            <td><div class="actions-ligne">
              <button type="button" class="btn btn--table danger" data-supprimer="${r.id}" aria-label="Supprimer ce rapport" title="Supprimer ce rapport">${icone('corbeille')}</button>
            </div></td>
          </tr>`;
      }).join('')
      : `<tr class="table-vide"><td colspan="${COLONNES_CHIFFRES.length + 4}">${rapports.length ? 'Aucun envoi ne correspond à cette recherche.' : 'Aucun rapport reçu pour l’instant.'}</td></tr>`;

    el.tableHistorique.innerHTML = `${entete}<tbody>${corps}</tbody>`;
  }

  el.rechercheHistorique.addEventListener('input', () => {
    etat.rechercheHistorique = el.rechercheHistorique.value.trim();
    rendreHistorique();
  });

  el.tableHistorique.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-supprimer]');
    if (!bouton) return;
    const rapport = etat.donnees.rapports.find((r) => r.id === Number(bouton.dataset.supprimer));
    if (!rapport) return;
    etat.rapportASupprimer = rapport;
    const type = etat.donnees.unites.find((u) => u.id === rapport.unite_id)?.type;
    el.texteConfirmation.textContent = `Le rapport de ${rapport.unite_nom || SANS_PIEU} pour ${libelle(rapport.programme)}, envoyé par ${rapport.coordinateur_nom} le ${date(rapport.soumis_le)}, sera supprimé définitivement. S'il s'agit de la version actuelle, l'envoi précédent de ce programme pour ${(TYPES_UNITE[type] || TYPES_UNITE.Pieu).ce} reprend sa place.`;
    el.dialogueConfirmation.showModal();
  });

  el.boutonConfirmer.addEventListener('click', async () => {
    const rapport = etat.rapportASupprimer;
    if (!rapport) return;
    el.boutonConfirmer.disabled = true;
    try {
      await api(`/api/admin/rapports/${rapport.id}`, { method: 'DELETE' });
      el.dialogueConfirmation.close();
      toast('Rapport supprimé.', 'succes');
      planifierRafraichissement();
    } catch (err) {
      toast(err.message, 'erreur');
    } finally {
      el.boutonConfirmer.disabled = false;
      etat.rapportASupprimer = null;
    }
  });

  /* ================================================================ Coordonnateurs et instructeurs */

  // Même règle que le serveur : « … IN » = instructeur ; « … CR » ou sans mention = coordonnateur.
  const roleSelonProgramme = (nomProgramme) => (/\bIN\b/.test(nomProgramme) ? 'Instructeur' : 'Coordonnateur');
  const pluriel = (n, singulier, forme = `${singulier}s`) => `${nombre(n)} ${n > 1 ? forme : singulier}`;

  function rendreCoordinateurs() {
    const { coordinateurs, rapports } = etat.donnees;
    const dernierEnvoi = new Map();
    for (const r of rapports) if (!dernierEnvoi.has(r.coordinateur_id)) dernierEnvoi.set(r.coordinateur_id, r.soumis_le);

    const actifs = coordinateurs.filter((c) => c.actif);
    const compte = (role) => actifs.filter((c) => c.role === role).length;
    const inactifs = coordinateurs.length - actifs.length;
    $('sous-titre-equipe').textContent = `${pluriel(compte('Coordonnateur'), 'coordonnateur')} et ${pluriel(compte('Instructeur'), 'instructeur')} actifs${inactifs ? `, ${pluriel(inactifs, 'personne inactive', 'personnes inactives')}` : ''}. Cette liste remplit le menu du formulaire ; une personne inactive n'y apparaît plus.`;

    const lignes = coordinateurs.filter((c) => etat.role === 'tous' || c.role === etat.role).map((c) => {
      const affilie = c.programme_affilie ? programme(c.programme_affilie) : null;
      const assigne = programme(c.programme);
      const envoi = dernierEnvoi.get(c.id);
      return `
        <tr class="${c.actif ? '' : 'is-attente'}">
          <td class="fige"><strong>${esc(c.nom)}</strong></td>
          <td><span class="role">${esc(c.role)}</span></td>
          <td class="num">${esc(c.employee_id || '–')}</td>
          <td><div class="cellule-prog"><strong>${esc(assigne.libelle)}</strong>${assigne.code ? `<span>${esc(assigne.code)}</span>` : ''}</div></td>
          <td>${affilie ? `<div class="cellule-prog"><strong>${esc(affilie.libelle)}</strong>${affilie.code ? `<span>${esc(affilie.code)}</span>` : ''}</div>` : '<span class="sous-valeur">Aucun</span>'}</td>
          <td title="${envoi ? esc(date(envoi)) : ''}">${envoi ? esc(ilYa(envoi)) : '<span class="sous-valeur">Jamais</span>'}</td>
          <td>${c.actif ? `<span class="pill pill--good">${icone('coche')}Actif</span>` : `<span class="pill pill--neutre">${icone('moins')}Inactif</span>`}</td>
          <td><div class="actions-ligne">
            <button type="button" class="btn btn--table" data-modifier="${c.id}" aria-label="Modifier ${esc(c.nom)}" title="Modifier">${icone('crayon')}</button>
          </div></td>
        </tr>`;
    });

    el.tableCoordinateurs.innerHTML = `
      <thead><tr>
        <th class="fige" scope="col">Nom et prénom</th>
        <th scope="col">Rôle</th>
        <th class="num" scope="col">ID employé</th>
        <th scope="col">Programme assigné</th>
        <th scope="col">Programme affilié</th>
        <th scope="col">Dernier envoi</th>
        <th scope="col">Statut</th>
        <th scope="col"><span class="sr-only">Actions</span></th>
      </tr></thead>
      <tbody>${lignes.length ? lignes.join('') : '<tr class="table-vide"><td colspan="8">Personne avec ce rôle pour l’instant.</td></tr>'}</tbody>`;
  }

  $('segment-role').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-role]');
    if (!bouton) return;
    etat.role = bouton.dataset.role;
    for (const b of $('segment-role').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === bouton));
    rendreCoordinateurs();
  });

  // Le rôle suit le programme saisi tant que l'administrateur ne l'a pas choisi lui-même.
  let roleChoisiAMain = false;
  const aideRole = $('aide-role');

  function proposerRole() {
    const f = el.formCoordinateur;
    if (roleChoisiAMain || f.elements.role.value === 'Directeur de région') return;
    const programmeSaisi = f.elements.programme.value.trim();
    if (!programmeSaisi) return;
    const propose = roleSelonProgramme(programmeSaisi);
    f.elements.role.value = propose;
    aideRole.hidden = false;
    aideRole.textContent = /\bIN\b/.test(programmeSaisi) ? 'Proposé : le programme se termine par IN.' : 'Proposé : programme CR ou sans mention.';
  }

  function ouvrirDialogueCoordinateur(coordinateur) {
    etat.coordinateurEdite = coordinateur;
    roleChoisiAMain = Boolean(coordinateur);
    aideRole.hidden = true;
    const f = el.formCoordinateur;
    f.reset();
    for (const champ of f.querySelectorAll('[data-champ]')) {
      champ.classList.remove('is-invalid');
      champ.querySelector('.field__erreur').textContent = '';
    }
    el.titreDialogueCoordinateur.textContent = coordinateur ? `Modifier : ${coordinateur.nom}` : 'Ajouter une personne';
    f.elements.nom.value = coordinateur?.nom || '';
    f.elements.employee_id.value = coordinateur?.employee_id || '';
    f.elements.role.value = coordinateur?.role || 'Coordonnateur';
    f.elements.programme.value = coordinateur?.programme || '';
    f.elements.programme_affilie.value = coordinateur?.programme_affilie || '';
    f.elements.actif.checked = coordinateur ? coordinateur.actif : true;
    el.dialogueCoordinateur.showModal();
    f.elements.nom.focus();
  }

  function signalerChamp(nom, message) {
    const champ = el.formCoordinateur.querySelector(`[data-champ="${nom}"]`);
    if (!champ) return;
    champ.classList.add('is-invalid');
    champ.querySelector('.field__erreur').textContent = message;
  }

  el.tableCoordinateurs.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-modifier]');
    if (!bouton) return;
    ouvrirDialogueCoordinateur(etat.donnees.coordinateurs.find((c) => c.id === Number(bouton.dataset.modifier)));
  });

  $('ajouter-coordinateur').addEventListener('click', () => ouvrirDialogueCoordinateur(null));

  el.formCoordinateur.addEventListener('input', (e) => {
    const champ = e.target.closest('[data-champ]');
    if (!champ) return;
    champ.classList.remove('is-invalid');
    champ.querySelector('.field__erreur').textContent = '';
    if (e.target.name === 'programme') proposerRole();
  });

  el.formCoordinateur.elements.role.addEventListener('change', () => {
    roleChoisiAMain = true;
    aideRole.hidden = true;
  });

  el.formCoordinateur.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = el.formCoordinateur;
    const corps = {
      nom: f.elements.nom.value.trim(),
      employee_id: f.elements.employee_id.value.trim(),
      role: f.elements.role.value.trim(),
      programme: f.elements.programme.value.trim(),
      programme_affilie: f.elements.programme_affilie.value.trim(),
      actif: f.elements.actif.checked,
    };
    let invalide = false;
    if (!corps.nom) { signalerChamp('nom', 'Indiquez le nom et le prénom.'); invalide = true; }
    if (!corps.programme) { signalerChamp('programme', 'Indiquez le programme assigné.'); invalide = true; }
    if (invalide) return;

    const edite = etat.coordinateurEdite;
    el.boutonEnregistrer.disabled = true;
    el.boutonEnregistrer.classList.add('is-loading');
    try {
      await api(edite ? `/api/admin/coordinateurs/${edite.id}` : '/api/admin/coordinateurs', { method: edite ? 'PUT' : 'POST', body: corps });
      el.dialogueCoordinateur.close();
      toast(edite ? `${corps.nom} : modifications enregistrées.` : `Ajout enregistré : ${corps.nom} apparaît déjà dans le formulaire.`, 'succes');
      planifierRafraichissement();
    } catch (err) {
      for (const [nom, message] of Object.entries(err.details?.champs || {})) signalerChamp(nom, message);
      toast(err.message, 'erreur');
    } finally {
      el.boutonEnregistrer.disabled = false;
      el.boutonEnregistrer.classList.remove('is-loading');
    }
  });

  // Fermeture des dialogues : boutons « Annuler », croix, clic sur le fond.
  for (const dialogue of [el.dialogueCoordinateur, el.dialogueConfirmation]) {
    dialogue.addEventListener('click', (e) => {
      if (e.target === dialogue || e.target.closest('[data-fermer]')) dialogue.close();
    });
  }

  /* ================================================================ Onglets */

  function choisirOnglet(nom, { focus = false } = {}) {
    for (const onglet of onglets) {
      const actif = onglet.dataset.onglet === nom;
      onglet.setAttribute('aria-selected', String(actif));
      onglet.tabIndex = actif ? 0 : -1;
      $(onglet.getAttribute('aria-controls')).hidden = !actif;
      if (actif && focus) onglet.focus();
    }
    cacherInfobulle();
    try {
      window.history.replaceState(null, '', `#${nom}`);
    } catch {
      // sans incidence
    }
  }

  for (const onglet of onglets) onglet.addEventListener('click', () => choisirOnglet(onglet.dataset.onglet));

  document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = onglets.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    const suivant = onglets[(i + (e.key === 'ArrowRight' ? 1 : -1) + onglets.length) % onglets.length];
    choisirOnglet(suivant.dataset.onglet, { focus: true });
  });

  /* ================================================================ Actions de l'en-tête */

  async function copierLien() {
    const lien = RACINE;
    try {
      await navigator.clipboard.writeText(lien);
      toast(`Lien du formulaire copié : ${lien}`, 'succes');
    } catch {
      window.prompt('Copiez le lien du formulaire :', lien);
    }
  }

  $('copier-lien').addEventListener('click', copierLien);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-copier-lien]')) copierLien();
  });

  // Téléchargement par fetch : une session expirée ramène à la connexion au lieu d'afficher du JSON brut.
  $('exporter').addEventListener('click', async (e) => {
    e.preventDefault();
    const lien = e.currentTarget;
    if (lien.getAttribute('aria-busy') === 'true') return;
    lien.setAttribute('aria-busy', 'true');
    toast('Préparation du fichier Excel.', 'info', 2500);
    try {
      const reponse = await fetch(lien.href, { headers: entetesSession() });
      if (reponse.status === 401) {
        retourConnexion();
        return;
      }
      if (!reponse.ok) throw new Error((await reponse.json().catch(() => ({}))).erreur || `Erreur ${reponse.status}`);
      const nom = /filename="([^"]+)"/.exec(reponse.headers.get('Content-Disposition') || '')?.[1] || 'statistiques-si-aof.xlsx';
      const url = URL.createObjectURL(await reponse.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: nom });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`Fichier téléchargé : ${nom}`, 'succes');
    } catch (err) {
      toast(err.message === 'Failed to fetch' ? 'Connexion impossible. Réessayez.' : err.message, 'erreur');
    } finally {
      lien.removeAttribute('aria-busy');
    }
  });

  $('deconnexion').addEventListener('click', async () => {
    try {
      await api('/api/admin/deconnexion', { method: 'POST' });
      retourConnexion();
    } catch (err) {
      toast(`Déconnexion impossible : ${err.message}`, 'erreur');
    }
  });

  /* ================================================================ Temps réel */

  // L'API ne garde pas de connexion ouverte : le tableau de bord lui demande toutes les 10 secondes les rapports
  // arrivés depuis le dernier connu, pour les annoncer, et la révision des données, qui change aussi après une
  // suppression ou une modification de la liste des personnes. Un onglet caché ne demande rien.
  const INTERVALLE_SUIVI = 10000;
  let minuterieSuivi;
  let suiviEnCours = false;

  function annoncer(d) {
    surligner(etat.lignesSurligner, cleLigne(d.programme, d.unite_id));
    surligner(etat.unitesSurligner, d.unite_id);
    surligner(etat.programmesSurligner, d.programme);
    surligner(etat.rapportsSurligner, d.id);
    toast(`Rapport reçu : ${d.unite || libelle(d.programme)}${d.unite ? ` pour ${libelle(d.programme)}` : ''}, envoyé par ${d.coordinateur}.`, 'succes', 6000);
  }

  async function suivre() {
    clearTimeout(minuterieSuivi);
    if (suiviEnCours) return;
    suiviEnCours = true;
    try {
      if (!document.hidden && etat.dernierId === null) {
        await rafraichir(); // le premier chargement a échoué : on réessaie
      } else if (!document.hidden) {
        const { revision, rapports } = await api(`/api/admin/flux?apres=${etat.dernierId}`);
        majDirect('ok');
        for (const d of rapports) annoncer(d);
        if (rapports.length) etat.dernierId = rapports.at(-1).id;
        if (revision !== etat.revision) planifierRafraichissement();
      }
    } catch (err) {
      if (err.statut === 401) {
        retourConnexion();
        return;
      }
      majDirect('reconnexion');
    } finally {
      suiviEnCours = false;
    }
    minuterieSuivi = setTimeout(suivre, INTERVALLE_SUIVI);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) suivre();
  });

  /* ================================================================ Démarrage */

  const ongletInitial = window.location.hash.slice(1);
  choisirOnglet(onglets.some((o) => o.dataset.onglet === ongletInitial) ? ongletInitial : 'apercu');
  rafraichir().then(suivre);
  // Les durées relatives (« il y a 5 minutes ») restent justes sans recharger.
  setInterval(() => {
    if (!etat.donnees) return;
    rendreAppel();
    rendreUnites();
    rendreProgrammes();
    rendreTableVue();
  }, 60000);
})();
