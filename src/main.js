/* ===== Config ===== */
const START_CONFIG = {
  // "wednesday_intro_now" = abre já na Quarta com apresentações geradas
  // "tuesday_empty_then_intro" = abre na Terça sem eventos; próximo dia gera a estreia
  mode: "wednesday_intro_now"
};

const EXTERNAL_SCANDAL = {
  enabled: true,
  maxPerSeason: 2,
  dailyChance: 0.025,
  onlyUntilTopN: 5,
  targetMode: "uniform",
  popHitMin: 1.0,
  popHitMax: 2.2,
  alvoHitMin: 1.0,
  alvoHitMax: 2.2
};

const PUBLIC_COALITION = {
  enabled: true,
  chance: 0.55,
  minGapToTrigger: 6,
  maxBoost: 18,
  logIt: true
};

const POP_VOTE = {
  // pop 8 vs pop 2 => ~4x de diferença de votos (modelo exponencial)
  k: Math.log(4) / 6,
  // mistura: 0 = só popularidade, 1 = só o modelo antigo
  baseMix: 0.55
};

(() => {
  /* ===== Utils ===== */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndInt = (a, b) => Math.floor(rnd(a, b + 1));

  /* ===== Idades ===== */
  // Regra do elenco:
  // - ~80% entre 18 e 40
  // - ~20% com idades variadas (até 75)
  function generateAge() {
    if (Math.random() < 0.80) return rndInt(18, 40);

    // "variadas": puxa mais para acima de 40, mas ainda permite alguns 18..40
    if (Math.random() < 0.65) return rndInt(41, 75);
    return rndInt(18, 40);
  }

  function normalizeAge(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return clamp(Math.round(n), 18, 75);
  }

  function ensurePlayerAge(p) {
    if (!p) return;
    const a = normalizeAge(p.age);
    p.age = (a == null) ? generateAge() : a;
  }

  /* ===== Narrativa (schema + helpers) ===== */
  const NARRATIVE_SCHEMA_VERSION = 1;

  const simpleName = (p) => {
    const nick = String(p?.baseName ?? p?.nickname ?? '').trim();
    const first = String(p?.firstName ?? p?.name ?? '').trim();
    const last = String(p?.lastName ?? '').trim();
    const full = (first + (last ? ` ${last}` : '')).trim();
    return nick || full || 'Jogador';
  };

  function emptyNarrative(round = 1) {
    return {
      v: NARRATIVE_SCHEMA_VERSION,
      createdAtRound: round,
      timeline: [],
      // histórico por semana (pra diferenciar favorito relâmpago vs constante etc.)
      starHistory: [],
      plantHistory: [],
      relations: {},
      reputation: {
        strategist: 0,
        loyal: 0,
        villain: 0,
        underdog: 0,
        compBeast: 0,
        social: 0
      },
      momentum: 0,
      streaks: { win: 0, danger: 0 },
      themes: {},
      stats: {
        hohWins: 0,
        vetoWins: 0,
        nominations: 0,
        timesSaved: 0,
        votesCast: 0,
        votesReceived: 0,
        betrayalsDone: 0,
        betrayalsSuffered: 0,
        biggestMoveRound: null,
        rejectionPeak: null,
        rejectionRound: null
      }
    };
  }

  function initNarrativeForPlayer(p, round = 1) {
    if (!p) return;
    if (!p.narrative || typeof p.narrative !== 'object' || !Array.isArray(p.narrative.timeline)) {
      p.narrative = emptyNarrative(round);
      // intro mínimo
      pushTimelineEvent(p, {
        round,
        type: 'intro',
        text: `${simpleName(p)} entrou na casa com ${normalizeAge(p.age) ?? '—'} anos.`,
        refs: {},
        weight: 1
      });
    }
  }

  function getRelationObj(p, otherId) {
    if (!p) return null;
    initNarrativeForPlayer(p, 1);
    if (!p.narrative.relations) p.narrative.relations = {};
    if (!p.narrative.relations[otherId]) {
      p.narrative.relations[otherId] = {
        bond: 50,
        rivalry: 0,
        trust: 50,
        lastEventRound: null,
        tags: []
      };
    }
    return p.narrative.relations[otherId];
  }

  function clamp01to100(n) { return clamp(Number(n || 0), 0, 100); }

  function adjustRelation(pA, pB, { bondDelta = 0, rivalryDelta = 0, trustDelta = 0, round = 1, tag = null } = {}) {
    if (!pA || !pB) return;
    const r = getRelationObj(pA, pB.id);
    if (!r) return;
    r.bond = clamp01to100((r.bond ?? 50) + bondDelta);
    r.rivalry = clamp01to100((r.rivalry ?? 0) + rivalryDelta);
    r.trust = clamp01to100((r.trust ?? 50) + trustDelta);
    r.lastEventRound = round;
    if (tag) {
      r.tags = Array.isArray(r.tags) ? r.tags : [];
      if (!r.tags.includes(tag)) r.tags.push(tag);
      if (r.tags.length > 12) r.tags = r.tags.slice(-12);
    }
  }

  function pushTimelineEvent(p, event) {
    if (!p) return;
    initNarrativeForPlayer(p, event?.round ?? (state?.week ?? 1));
    const ev = {
      round: Number(event?.round ?? (state?.week ?? 1)),
      type: String(event?.type || 'misc'),
      text: String(event?.text || '').trim() || '—',
      refs: (event?.refs && typeof event.refs === 'object') ? event.refs : {},
      weight: clamp(Number(event?.weight ?? 1), 1, 3)
    };
    p.narrative.timeline.push(ev);
    // evita crescer infinito
    if (p.narrative.timeline.length > 250) p.narrative.timeline.splice(0, p.narrative.timeline.length - 250);
    return p.narrative.timeline.length - 1;
  }

  function setTimelineEventWeight(p, idx, weight) {
    if (!p || !p.narrative || !Array.isArray(p.narrative.timeline)) return;
    const i = Number(idx);
    if (!Number.isFinite(i) || i < 0 || i >= p.narrative.timeline.length) return;
    p.narrative.timeline[i].weight = clamp(Number(weight ?? p.narrative.timeline[i].weight ?? 1), 1, 3);
    if (p.narrative.timeline[i].weight >= 3) {
      const R = Number(p.narrative.timeline[i].round ?? state?.week ?? 1);
      if (p.narrative?.stats?.biggestMoveRound == null) p.narrative.stats.biggestMoveRound = R;
    }
  }

  function adjustReputation(p, deltas = {}) {
    if (!p) return;
    initNarrativeForPlayer(p, state?.week ?? 1);
    const rep = p.narrative.reputation;
    for (const k of Object.keys(rep || {})) {
      if (Object.prototype.hasOwnProperty.call(deltas, k)) rep[k] = clamp(Number(rep[k] ?? 0) + Number(deltas[k] ?? 0), -50, 50);
    }
  }

  function bumpMomentum(p, delta = 0) {
    if (!p) return;
    initNarrativeForPlayer(p, state?.week ?? 1);
    p.narrative.momentum = clamp(Number(p.narrative.momentum ?? 0) + Number(delta || 0), -5, 5);
  }


/* ===== Arquétipos BBB (scores por semana) ===== */
// Observação: isso NÃO substitui o arco narrativo antigo (reputation/themes).
// Aqui é uma leitura semanal mais "BBB" (vilão, perseguido, planta etc.).

const ARCHETYPE_POOLS = {
  perseguidor: ["Perseguido", "Mocinho", "Vítima", "Herói", "Injustiçado", "Sobrevivente"],
  vilao: ["Vilão", "Antagonista", "Manipulador", "Cobra", "Jogador Sujo"],
  planta: ["Planta", "Inexpressivo", "Invisível", "Figurante", "Encostado"],
  estrategista: ["Estrategista", "Jogador", "Cerebral", "Calculista", "Frio"],
  alivio: ["Alívio Cômico", "Bobo da Corte", "Meme", "Engraçado", "Figura"],
  palestrinha: ["Palestrinha", "Militante", "Educador", "Moralista", "Professor"],
  gala: ["Galã", "Musa", "Crush da Casa", "Queridinho", "Favorito"],
  casal: ["Casal", "Dupla", "Shippados", "Fechados", "Par"],
  pipoqueiro: ["Pipoqueiro", "Isento", "Em cima do muro", "Neutro"],
  justiceiro: ["Justiceiro", "Defensor", "Protetor", "Guardião"],
  sabio: ["Sábio", "Conselheiro", "Mentor", "Paz e Amor"],
  caotico: ["Caótico", "Imprevisível", "Agente do Caos", "Do nada"],
};

const ARCHETYPE_META = {
  perseguidor: { emoji: "🎯" },
  vilao: { emoji: "😈" },
  planta: { emoji: "🪴" },
  estrategista: { emoji: "♟️" },
  alivio: { emoji: "🤡" },
  palestrinha: { emoji: "📢" },
  gala: { emoji: "💘" },
  pipoqueiro: { emoji: "🍿" },
  justiceiro: { emoji: "⚖️" },
  sabio: { emoji: "🧠" },
  caotico: { emoji: "🌪️" },
};

function ensureArchetypeState(p) {
  if (!p) return;
  p.status = p.status || {};
  p.status.archetypeWeek = p.status.archetypeWeek || {};
}

function archLabelFor(id, seed) {
  const pool = ARCHETYPE_POOLS[id] || [String(id || 'Arquétipo')];
  // pickDet existe no arquivo e é determinístico.
  return pickDet(pool, String(seed || id), pool[0]);
}

function getWeekSnap(weekNumber) {
  const wk = Number(weekNumber || state.week || 1);
  const hist = Array.isArray(state.votesHistory) ? state.votesHistory : [];
  const found = hist.find(x => x && Number(x.week) === wk);
  if (found) return found;
  const w = state.weekState || {};
  return {
    week: wk,
    leaderId: w.leaderId ?? null,
    anjoId: w.anjoId ?? null,
    imuneId: w.imuneId ?? null,
    indicadoLiderId: w.indicadoLiderId ?? null,
    contragolpeId: w.contragolpeId ?? null,
    indicadosCasaIds: Array.isArray(w.indicadosCasaIds) ? w.indicadosCasaIds.slice() : [],
    houseVotes: Array.isArray(w.houseVotes) ? w.houseVotes.map(v => ({ fromId: v.fromId, toId: v.toId })) : [],
    tally: w.tally ? { ...w.tally } : {},
    paredaoIds: Array.isArray(w.paredaoIds) ? w.paredaoIds.slice() : [],
    publicoPerc: w.publicoPerc ? { ...w.publicoPerc } : {},
    eliminadoId: w.eliminadoId ?? null
  };
}

function voteMajorityTargetId(wSnap) {
  const tally = wSnap?.tally || {};
  let bestId = null;
  let best = -Infinity;
  for (const [id, v] of Object.entries(tally)) {
    const n = Number(v || 0);
    if (n > best) { best = n; bestId = id; }
  }
  return bestId;
}

function popAtWeek(p, wk) {
  const w = p?.status?.popWeek || {};
  const v = (w && w[String(wk)] != null) ? Number(w[String(wk)]) : null;
  if (Number.isFinite(v)) return v;
  return Number(p?.status?.pop ?? 0) || 0;
}

function countWeekEvents(p, wk) {
  try {
    initNarrativeForPlayer(p, wk);
    const t = Array.isArray(p?.narrative?.timeline) ? p.narrative.timeline : [];
    return t.filter(e => Number(e?.round) === Number(wk) && String(e?.type || '') !== 'intro').length;
  } catch { return 0; }
}

function socialStats(p) {
  const others = state.players.filter(o => o && o.id !== p.id && (o.status?.alive || (Number(o.status?.outWeek || 0) >= Number(state.week || 1))));
  if (!others.length) return { avg: 0.5, enemies: 0, rivals: 0, friends: 0, crush: 0, crushRec: 0 };

  let sum = 0;
  let enemies = 0, rivals = 0, friends = 0, crush = 0, crushRec = 0;

  for (const o of others) {
    const s = relGet(p.id, o.id);
    const cat = classifyRelationScore(s);
    if (cat === 'enemy') enemies++;
    else if (cat === 'rival') rivals++;
    else if (cat === 'friend') friends++;
    else if (cat === 'crush') crush++;

    // normaliza -5..+5 para 0..1
    sum += clamp((Number(s || 0) + 5) / 10, 0, 1);

    // crush recíproco
    if (cat === 'crush') {
      const s2 = relGet(o.id, p.id);
      if (classifyRelationScore(s2) === 'crush') crushRec++;
    }
  }

  return {
    avg: sum / others.length,
    enemies,
    rivals,
    friends,
    crush,
    crushRec
  };
}

// --- Vínculo: Dupla (romance/ship) ---
// Não é "personagem". É um badge relacional: "Dupla com X".
// Detecta melhor par com crush recíproco e sinal mínimo de estabilidade.
function computeDuplaBadge(p, wk) {
  try {
    if (!p || !state?.players?.length) return null;
    const outWeek = Number(p?.status?.outWeek ?? NaN);
    if (Number.isFinite(outWeek) && wk > outWeek) return null;

    // candidatos: crush recíproco
    let best = null;
    for (const o of state.players) {
      if (!o || String(o.id) === String(p.id)) continue;
      const oOut = Number(o?.status?.outWeek ?? NaN);
      if (Number.isFinite(oOut) && wk > oOut) continue;

      const a = classifyRelationScore(relGet(p.id, o.id)) === 'crush';
      const b = classifyRelationScore(relGet(o.id, p.id)) === 'crush';
      if (!a || !b) continue;

      const v = Number(relGet(p.id, o.id) || 0) + Number(relGet(o.id, p.id) || 0);
      if (!best || v > best.v) best = { o, v };
    }
    if (!best) return null;

    const partner = best.o;

    // estabilidade mínima: votos alinhados nesta semana OU vínculo muito forte
    const wSnap = getWeekSnap(wk) || {};
    const myVote = (wSnap.houseVotes || []).find(v => String(v?.fromId) === String(p.id));
    const theirVote = (wSnap.houseVotes || []).find(v => String(v?.fromId) === String(partner.id));
    const votedSame = (myVote && theirVote && String(myVote.toId || '') && String(myVote.toId) === String(theirVote.toId || '')) ? 1 : 0;

    // limiar: ou votam juntos, ou a soma de relação é bem alta
    if (!votedSame && best.v < 14) return null;

    return {
      type: 'dupla',
      withId: String(partner.id),
      withName: String(displayName(partner) || '').trim() || '—',
      emoji: '💞'
    };
  } catch {
    return null;
  }
}


// --- BBB: Combos canônicos (síntese real) + Arcos narrativos ---
// Importante: combo NÃO é o Top 3 reembalado.
// Ele só existe quando há consistência numa janela curta e bate com um dicionário fechado.

const BBB_COMBO_CANON = [
  // Estratégia & poder
  { id: 'manipulador_frio', dom: 'vilao', secs: ['estrategista'], emoji: '😈',
    title: (p)=>g(p,{M:'O Manipulador Frio',F:'A Manipuladora Fria',O:'E Manipuladore Frie'}),
    reason: 'Controla o jogo com frieza e influência.' },
  { id: 'ameaca_silenciosa', dom: 'estrategista', secs: ['planta'], emoji: '♟️',
    title: (p)=>'A Ameaça Silenciosa',
    reason: 'Pouco visível, mas perigosamente eficaz.' },
  { id: 'jogador_bastidores', dom: 'estrategista', secs: ['pipoqueiro'], emoji: '♟️',
    title: (p)=>'O Jogador de Bastidores',
    reason: 'Evita protagonismo, mas influencia o jogo.' },

  // Moral & discurso
  { id: 'moralista_isento', dom: 'palestrinha', secs: ['pipoqueiro'], emoji: '📢',
    title: (p)=>g(p,{M:'O Moralista Isento',F:'A Moralista Isenta',O:'E Moraliste Isente'}),
    reason: 'Discursa, mas raramente se compromete com o risco.' },
  { id: 'voz_consciencia', dom: 'palestrinha', secs: ['justiceiro'], emoji: '📢',
    title: (p)=>'A Voz da Consciência',
    reason: 'Toma posição e compra brigas por valores claros.' },
  { id: 'pregador_polarizador', dom: 'palestrinha', secs: ['vilao'], emoji: '📢',
    title: (p)=>g(p,{M:'O Pregador Polarizador',F:'A Pregadora Polarizadora',O:'E Pregadore Polarizadore'}),
    reason: 'Divide a casa com discurso e conflito.' },

  // Carisma & narrativa
  { id: 'alivio_inofensivo', dom: 'alivio', secs: ['planta'], emoji: '🤡',
    title: (p)=>'O Alívio Inofensivo',
    reason: 'Querido, mas pouco levado a sério no jogo.' },
  { id: 'queridinho_blindado', dom: 'alivio', secs: ['gala'], emoji: '🤡',
    title: (p)=>g(p,{M:'O Queridinho Blindado',F:'A Queridinha Blindada',O:'E Queridinhe Blindade'}),
    reason: 'Carisma e afeto funcionam como escudo.' },
  { id: 'meme_ambulante', dom: 'alivio', secs: ['caotico'], emoji: '🤡',
    title: (p)=>'O Meme Ambulante',
    reason: 'Imprevisível, carismático e difícil de ler.' },

  // Neutralidade & sobrevivência
  { id: 'sobrevivente_invisivel', dom: 'planta', secs: ['pipoqueiro'], emoji: '🪴',
    title: (p)=>'O Sobrevivente Invisível',
    reason: 'Passa ileso por não comprar briga.' },
  { id: 'linha_neutra', dom: 'pipoqueiro', secs: ['sabio'], emoji: '🍿',
    title: (p)=>'A Linha Neutra',
    reason: 'Ponderado e estável, sem se expor muito.' },

  // Conflito & justiça
  { id: 'protetor_em_risco', dom: 'justiceiro', secs: ['perseguidor'], emoji: '⚖️',
    title: (p)=>'O Protetor em Risco',
    reason: 'Defende os outros e vira alvo.' },
  { id: 'heroi_relutante', dom: 'perseguidor', secs: ['sabio'], emoji: '🎯',
    title: (p)=>g(p,{M:'O Herói Relutante',F:'A Heroína Relutante',O:'E Heróie Relutante'}),
    reason: 'Cresce sem buscar protagonismo.' },

  // Ruptura
  { id: 'agente_do_caos', dom: 'caotico', secs: ['vilao'], emoji: '🌪️',
    title: (p)=>'O Agente do Caos',
    reason: 'Quebra alianças e expectativas.' },
  { id: 'bomba_relogio', dom: 'caotico', secs: ['planta'], emoji: '🌪️',
    title: (p)=>'A Bomba-Relógio',
    reason: 'Invisível até explodir de repente.' },
];


function computeBBBCombo(p, wk, top3Current) {
  try {
    if (!p || !top3Current || !top3Current.length) return null;
    const domNow = String(top3Current[0]?.id || '');
    const domScore = Number(top3Current[0]?.score ?? 0);
    if (!domNow || !Number.isFinite(domScore) || domScore < 65) return null;

    const aw = p?.status?.archetypeWeek || {};
    const wks = [wk - 2, wk - 1, wk].filter(n => Number.isFinite(n) && n > 0);

    const doms = [];
    const secsPerWeek = [];

    for (const w of wks) {
      if (w === wk) {
        doms.push(domNow);
        const secs = top3Current.slice(1, 3).map(x => String(x?.id || '')).filter(Boolean);
        secsPerWeek.push(secs);
      } else {
        const snap = aw[String(w)];
        if (!snap || !snap.top3 || !snap.top3.length) continue;
        const d = String(snap.dominantId || snap.top3?.[0]?.id || '');
        if (d) doms.push(d);
        const secs = (snap.top3 || []).slice(1, 3).map(x => String(x?.id || '')).filter(Boolean);
        secsPerWeek.push(secs);
      }
    }

    if (doms.length < 2) return null;

    // dominante precisa aparecer >=2 vezes na janela
    const domCount = doms.filter(x => x === domNow).length;
    if (domCount < 2) return null;

    // algum secundário repetido (>=2) e presente nesta semana
    const secCounts = {};
    for (const arr of secsPerWeek) {
      for (const id of arr) secCounts[id] = (secCounts[id] || 0) + 1;
    }
    const currentSecs = top3Current.slice(1, 3).map(x => String(x?.id || '')).filter(Boolean);
    const repeated = currentSecs.filter(id => (secCounts[id] || 0) >= 2);
    if (!repeated.length) return null;

    // tenta casar com dicionário fechado (prioriza o secundário mais repetido)
    repeated.sort((a,b)=> (secCounts[b]||0) - (secCounts[a]||0));

    for (const secPick of repeated) {
      const canon = BBB_COMBO_CANON.find(c => c.dom === domNow && (c.secs || []).includes(secPick));
      if (canon) {
        const title = (typeof canon.title === 'function') ? canon.title(p) : String(canon.title || '');
        return {
          key: canon.id,
          id: canon.id,
          title,
          subtitle: String(canon.reason || ''),
          emoji: canon.emoji || (ARCHETYPE_META[domNow]?.emoji || '🎭'),
          dom: domNow,
          sec: secPick
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function bbbArcFromHistory(p, wk) {
  const map = p?.status?.archetypeWeek || {};
  const keys = Object.keys(map).map(Number).filter(n=>Number.isFinite(n) && n>0 && n<=wk).sort((a,b)=>a-b);
  if (keys.length < 2) return { id: "inicio", title: "Início de jornada", subtitle: "", emoji: "🎬" };

  // Janela um pouco maior para evitar que pequenas oscilações ou troca de dominante
  // por 1 semana gerem "Montanha-russa" pra todo mundo.
  const lastN = keys.slice(-6);
  const doms = lastN.map(k => map[String(k)]?.dominantId).filter(Boolean);
  const changes = doms.reduce((acc, cur, i) => acc + (i>0 && cur !== doms[i-1] ? 1 : 0), 0);
  const changeRate = changes / Math.max(1, doms.length - 1);

  // tendência de popularidade
  const deltas = lastN.slice(1).map((k,i) => {
    const prev = lastN[i];
    return popAtWeek(p, k) - popAtWeek(p, prev);
  });
  const avgDelta = deltas.reduce((a,b)=>a+b,0) / Math.max(1, deltas.length);
  const avgAbs = deltas.reduce((a,b)=>a+Math.abs(b),0) / Math.max(1, deltas.length);

  // heurísticas objetivas
  const up = avgDelta > 0.18;
  const down = avgDelta < -0.18;
  const stable = Math.abs(avgDelta) <= 0.10 && avgAbs <= 0.16;

  // "Volátil" agora exige evidência mais forte:
  // - ou variação alta de popularidade,
  // - ou troca de dominante MUITO frequente (quase toda semana) numa janela maior,
  // - ou ambos (moderados) ao mesmo tempo.
  // Nota: no simulador, variações semanais de popularidade podem ser relativamente altas
  // por causa dos bumps (ex.: -0.28/+0.28). Para não rotular TODO mundo como volátil,
  // "Montanha-russa" exige sinal mais forte.
  const volatile = (
    // oscilação muito alta por si só
    (avgAbs >= 0.70) ||
    // troca de dominante quase toda semana, numa janela cheia
    (changeRate >= 0.92 && doms.length >= 6) ||
    // combinação: oscilação alta + trocas frequentes
    (avgAbs >= 0.48 && changeRate >= 0.75)
  );

  // redenção: estava em queda e agora sobe (2 últimas semanas positivas)
  const last2 = deltas.slice(-2);
  const redemption = (deltas.length >= 3) && (deltas[0] < -0.15) && (last2.every(x => x > 0.12));

  if (redemption) return { id: "redencao", title: "Redenção", subtitle: "Virou o jogo e reconstruiu a imagem", emoji: "🌅" };
  if (up && !volatile) return { id: "ascensao", title: "Ascensão", subtitle: "Cresce e ganha espaço", emoji: "📈" };
  if (down && !volatile) return { id: "queda", title: "Queda", subtitle: "Perde força e vira pauta", emoji: "📉" };
  if (stable && changes <= 1) return { id: "estagnacao", title: "Estagnação", subtitle: "Sem grandes viradas", emoji: "🧊" };
  if (volatile) return { id: "montanha_russa", title: "Montanha-russa", subtitle: "Oscila e muda de leitura com frequência", emoji: "🎢" };

  return { id: "transformacao", title: "Transformação", subtitle: "Em ajuste de rota", emoji: "🔄" };
}

function snapshotComboAndArcForWeek(p, wk, top3) {
  if (!p?.status) return null;
  p.status.bbbNarrative = p.status.bbbNarrative || { history: [] };

  const combo = computeBBBCombo(p, wk, top3);
  const arc = bbbArcFromHistory(p, wk);

  // histórico de combos (sem duplicar semana)
  const hist = Array.isArray(p.status.bbbNarrative.history) ? p.status.bbbNarrative.history : [];
  const existing = hist.find(x => Number(x.week) === Number(wk));
  const row = {
    week: wk,
    comboKey: combo ? (combo.key || combo.id || '') : '',
    comboTitle: combo ? (combo.title || '') : '',
    comboSubtitle: combo ? (combo.subtitle || '') : '',
    comboEmoji: combo ? (combo.emoji || '🎭') : '🎭'
  };
  if (existing) Object.assign(existing, row); else hist.push(row);
  p.status.bbbNarrative.history = hist.slice(-40);

  p.status.bbbNarrative.currentCombo = row;
  p.status.bbbNarrative.arc = arc;

  return { combo, arc };
}

// Score (0..100) por arquétipo, por semana.
// Regras objetivas (em termos do simulador):
// - votos recebidos, indicações, paredão, variação de pop, ações de liderança/anjo, alinhamento com maioria,
// - volume de eventos na timeline, contagem de inimigos/rivais/amigos/crush.
function snapshotArchetypesForWeek(weekNumber) {
  const wk = Number(weekNumber || state.week || 1);
  const wSnap = getWeekSnap(wk);
  const aliveCount = (state.players || []).filter(p => p?.status?.alive).length || 1;

  const majorityTarget = voteMajorityTargetId(wSnap);

  for (const p of (state.players || [])) {
    ensureArchetypeState(p);

    // não cria leitura após a eliminação (semana em que já saiu)
    const outWeek = Number(p?.status?.outWeek ?? NaN);
    if (Number.isFinite(outWeek) && wk > outWeek) continue;

    const prevPop = popAtWeek(p, wk - 1);
    const curPop = popAtWeek(p, wk);
    const popDelta = curPop - prevPop;

    const votesTo = (wSnap.houseVotes || []).filter(v => String(v?.toId) === String(p.id)).length;
    const votesFrom = (wSnap.houseVotes || []).filter(v => String(v?.fromId) === String(p.id)).length;
    const votesRecN = clamp(votesTo / Math.max(1, aliveCount - 1), 0, 1);

    const nominated = (
      (String(wSnap.indicadoLiderId || '') === String(p.id) ? 1 : 0) +
      (String(wSnap.contragolpeId || '') === String(p.id) ? 1 : 0) +
      ((wSnap.indicadosCasaIds || []).map(String).includes(String(p.id)) ? 1 : 0)
    );
    const nomN = clamp(nominated / 3, 0, 1);

    const inParedao = (wSnap.paredaoIds || []).map(String).includes(String(p.id)) ? 1 : 0;
    const leaderWin = (String(wSnap.leaderId || '') === String(p.id)) ? 1 : 0;
    const anjoWin = (String(wSnap.anjoId || '') === String(p.id)) ? 1 : 0;
    const gaveImmunity = (anjoWin && wSnap.imuneId && String(wSnap.imuneId) !== String(p.id)) ? 1 : 0;

    const madeDecision = p?.status?.madeDecisionThisWeek ? 1 : 0;
    const didSomething = p?.status?.didSomethingThisWeek ? 1 : 0;

    const eventsThisWeek = countWeekEvents(p, wk);
    const activityN = clamp(eventsThisWeek / 4, 0, 1);

    const posDeltaN = clamp(popDelta / 1.0, 0, 1);
    const negDeltaN = clamp((-popDelta) / 1.0, 0, 1);
    const swingN = clamp(Math.abs(popDelta) / 1.2, 0, 1);
    const popLevelN = clamp((Number(p?.status?.pop ?? 0) + 0) / 10, 0, 1);

    const voteWithMajority = (votesFrom > 0 && majorityTarget && (wSnap.houseVotes || []).some(v => String(v.fromId)===String(p.id) && String(v.toId)===String(majorityTarget))) ? 1 : 0;
    const voteAgainstMajority = (votesFrom > 0 && majorityTarget && (wSnap.houseVotes || []).some(v => String(v.fromId)===String(p.id) && String(v.toId)!==String(majorityTarget))) ? 1 : 0;

    const soc = socialStats(p);
    const enemyN = clamp((soc.enemies + soc.rivals) / Math.max(1, aliveCount - 1), 0, 1);
    const friendN = clamp(soc.friends / Math.max(1, aliveCount - 1), 0, 1);
    const crushN = clamp(soc.crush / Math.max(1, aliveCount - 1), 0, 1);
    const crushRecN = clamp(soc.crushRec / Math.max(1, aliveCount - 1), 0, 1);

    const ex = clamp((Number(p?.attrs?.excentricidade ?? 0)) / 10, 0, 1);
    const calm = clamp((Number(p?.attrs?.serenidade ?? 5)) / 10, 0, 1);

    // helpers: score builder
    const S = (x) => clamp(Math.round(Number(x || 0)), 0, 100);

    const scores = {
      // 🎯 Perseguido: recebe votos/indicações, vai ao paredão e (muitas vezes) cresce com isso.
      perseguidor: S(100 * (0.42 * votesRecN + 0.22 * nomN + 0.18 * inParedao + 0.14 * posDeltaN + 0.04 * (1 - leaderWin))),

      // 😈 Vilão: toma decisões de jogo impopulares, tem atritos e perde pop.
      vilao: S(100 * (0.28 * madeDecision + 0.22 * leaderWin + 0.18 * enemyN + 0.18 * negDeltaN + 0.14 * voteAgainstMajority)),

      // 🪴 Planta: baixa ação/impacto, quase não aparece e não move pop.
      planta: S(100 * (0.40 * (1 - didSomething) + 0.20 * (1 - activityN) + 0.18 * (1 - swingN) + 0.12 * (1 - votesRecN) + 0.10 * (1 - nomN))),

      // ♟️ Estrategista: ganha poder, decide, e costuma votar alinhado à maioria.
      estrategista: S(100 * (0.24 * leaderWin + 0.14 * anjoWin + 0.22 * madeDecision + 0.22 * voteWithMajority + 0.18 * (1 - votesRecN))),

      // 🤡 Alívio cômico: excentricidade alta + popularidade razoável, sem ser o motor estratégico.
      alivio: S(100 * (0.30 * ex + 0.26 * popLevelN + 0.18 * (1 - madeDecision) + 0.16 * swingN + 0.10 * friendN)),

      // 📢 Palestrinha: polariza (oscila pop) e entra em atrito (muitos rivais/inimigos).
      palestrinha: S(100 * (0.34 * enemyN + 0.30 * swingN + 0.18 * activityN + 0.18 * (1 - calm))),

      // 💘 Galã/Musa: muito crush + pop e laços sociais.
      gala: S(100 * (0.34 * crushN + 0.24 * crushRecN + 0.22 * popLevelN + 0.20 * soc.avg)),

      // 🍿 Pipoqueiro: vota com a maioria, evita conflito e não se compromete.
      pipoqueiro: S(100 * (0.50 * voteWithMajority + 0.20 * (1 - enemyN) + 0.20 * (1 - madeDecision) + 0.10 * (1 - swingN))),

      // ⚖️ Justiceiro: usa poder para proteger (anjo -> imune) e compra briga (contra rivais).
      justiceiro: S(100 * (0.45 * gaveImmunity + 0.30 * enemyN + 0.25 * posDeltaN)),

      // 🧠 Sábio: social/trust estável (avg alta), pouca treta, e pouca exposição em votos.
      sabio: S(100 * (0.40 * soc.avg + 0.25 * calm + 0.20 * (1 - enemyN) + 0.15 * (1 - votesRecN))),

      // 🌪️ Caótico: vota fora da maioria, excentricidade e oscilação.
      caotico: S(100 * (0.38 * voteAgainstMajority + 0.26 * ex + 0.22 * swingN + 0.14 * activityN)),
    };

    // top3
    const top = Object.entries(scores)
      .map(([id, v]) => ({ id, v }))
      .sort((a,b)=>b.v-a.v);

    const top3 = top.slice(0, 3).map((x, i) => ({
      id: x.id,
      score: x.v,
      label: archLabelFor(x.id, `${p.id}|${wk}|${x.id}|${i}`),
      emoji: ARCHETYPE_META[x.id]?.emoji || "🎭"
    }));

    const dom = top3[0] || { id: 'planta', score: 0, label: '—', emoji: '🎭' };

    const extraBBB = snapshotComboAndArcForWeek(p, wk, top3) || {};
    const comboBBB = extraBBB.combo || {};
    const arcBBB = extraBBB.arc || {};

    const duplaBadge = computeDuplaBadge(p, wk);


    p.status.archetypeWeek[String(wk)] = {
      week: wk,
      comboKey: comboBBB.key || '',
      comboTitle: comboBBB.title || '',
      comboSubtitle: comboBBB.subtitle || '',
      comboEmoji: comboBBB.emoji || '🎭',
      duplaWithId: duplaBadge ? String(duplaBadge.withId || '') : '',
      duplaWithName: duplaBadge ? String(duplaBadge.withName || '') : '',
      duplaEmoji: duplaBadge ? String(duplaBadge.emoji || '💞') : '',
      arcId: arcBBB.id || '',
      arcTitle: arcBBB.title || '',
      arcSubtitle: arcBBB.subtitle || '',
      arcEmoji: arcBBB.emoji || '🎬',
      dominantId: dom.id,
      dominantLabel: dom.label,
      dominantEmoji: dom.emoji,
      top3,
      scores
    };
  }
}
// ===== Títulos únicos de temporada (pós-jogo) =====
function getLastArchetypeSnapForPlayer(p) {
  try {
    const aw = p?.status?.archetypeWeek || {};
    let bestWk = null;
    for (const k of Object.keys(aw)) {
      const n = Number(k);
      if (!Number.isFinite(n)) continue;
      if (bestWk == null || n > bestWk) bestWk = n;
    }
    if (bestWk == null) return null;
    return aw[String(bestWk)] || null;
  } catch { return null; }
}

function classifyTier(score0to100) {
  const s = Number(score0to100 || 0);
  if (s >= 90) return { id: "dominante_abs", label: "dominante absoluto" };
  if (s >= 70) return { id: "traco_forte", label: "traço forte" };
  if (s >= 50) return { id: "traco_presente", label: "traço presente" };
  return { id: "residual", label: "traço residual" };
}


function computeSeasonTitles() {
  // Executa apenas quando a temporada encerra
  if (!state?.gameOver) return;
  if (!state?.players?.length) return;

  const byId = new Map((state.players || []).map(p => [String(p.id), p]));

  const winnerId = state?.final?.winnerId ?? null;
  const secondId = state?.final?.secondId ?? null;
  const thirdId = state?.final?.thirdId ?? null;
  const finalists = [winnerId, secondId, thirdId].filter(Boolean).map(String);

  // IDs eliminados (ordem em que saíram)
  const elim = (state.elimOrder || []).map(String).filter(Boolean);
  const firstBootId = elim.length ? elim[0] : null;
  const barredId = elim.length ? elim[elim.length - 1] : null; // eliminado imediatamente antes da final

  const numWeeks = Number(state?.week ?? 1);

  const weeksFor = (p) => {
    const aw = p?.status?.archetypeWeek || {};
    const w = Object.keys(aw).map(Number).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);
    return w;
  };

  const snapAt = (p, wk) => {
    try { return p?.status?.archetypeWeek?.[String(wk)] || null; } catch { return null; }
  };

  const lastSnap = (p) => getLastArchetypeSnapForPlayer(p);

  const pickBlend = (snap) => ((snap?.top3 || []).slice(0,3).map(x => x?.label).filter(Boolean));
  const hasIn = (txt, parts=[]) => {
    const s = String(txt || "").toLowerCase();
    return parts.some(p => s.includes(String(p).toLowerCase()));
  };

  const popSeries = (p) => {
    const w = weeksFor(p);
    const arr = [];
    for (const wk of w) {
      const v = popAtWeek(p, wk);
      if (Number.isFinite(v)) arr.push({ wk, v });
    }
    return arr;
  };

  const popStats = (p) => {
    const ser = popSeries(p);
    if (!ser.length) return { avg: 0, start: 0, end: 0, growth: 0, range: 0, swing: 0 };
    const vals = ser.map(x => x.v);
    const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
    const start = vals[0];
    const end = vals[vals.length-1];
    const growth = end - start;
    const minv = Math.min(...vals);
    const maxv = Math.max(...vals);
    const range = maxv - minv;
    // swing: soma de variações absolutas normalizada
    let swing = 0;
    for (let i=1;i<vals.length;i++) swing += Math.abs(vals[i]-vals[i-1]);
    swing = vals.length>1 ? (swing/(vals.length-1)) : 0;
    return { avg, start, end, growth, range, swing, n: vals.length };
  };

  const dominantChanges = (p) => {
    const w = weeksFor(p);
    let prev = null, changes = 0;
    for (const wk of w) {
      const s = snapAt(p, wk);
      const cur = String(s?.dominantId || "");
      if (!cur) continue;
      if (prev != null && cur !== prev) changes += 1;
      prev = cur;
    }
    return { changes, weeks: w.length };
  };

  const chaosSum = (p) => {
    const w = weeksFor(p);
    let sum = 0;
    for (const wk of w) {
      const s = snapAt(p, wk);
      const v = Number(s?.scores?.caotico ?? 0);
      if (Number.isFinite(v)) sum += v;
    }
    return { sum, weeks: w.length, avg: (w.length? sum/w.length : 0) };
  };

  const activityCount = (p) => {
    const tl = p?.narrative?.timeline;
    return Array.isArray(tl) ? tl.length : 0;
  };

  const mkMain = (p, payload) => {
    const snap = lastSnap(p) || {};
    const blend = pickBlend(snap);
    const dom = String(snap?.dominantLabel || "");
    p.status = p.status || {};
    p.status.seasonTitle = {
      emoji: payload.emoji || "🏷️",
      title: payload.title || "",
      reason: payload.reason || "",
      blend,
      dominant: dom,
      arc: String(snap?.arcTitle || "")
    };
  };

  const addAccolade = (p, payload) => {
    p.status = p.status || {};
    p.status.seasonAccolades = Array.isArray(p.status.seasonAccolades) ? p.status.seasonAccolades : [];
    p.status.seasonAccolades.push({
      emoji: payload.emoji || "🏷️",
      title: payload.title || "",
      reason: payload.reason || ""
    });
  };

  // Limpa títulos antigos para evitar vazamento entre sims
  for (const p of (state.players || [])) {
    if (p?.status) {
      delete p.status.seasonTitle;
      delete p.status.seasonAccolades;
    }
  }

  // ===== Catálogo de títulos principais (por categoria) =====

  const titleForWinner = (p) => {
    const snap = lastSnap(p) || {};
    const blend = pickBlend(snap).join(" · ");
    const dom = String(snap?.dominantId || "");
    const arc = String(snap?.arcTitle || "");
    const ps = popStats(p);

    const Campeao = g(p,{M:"Campeão",F:"Campeã",O:"Campeãe"});
    const Queridinho = g(p,{M:"Queridinho",F:"Queridinha",O:"Queridinhe"});
    const Ultimo = g(p,{M:"Último",F:"Última",O:"Últime"});

    if (hasIn(arc, ["reden"])) return { emoji:"🏆", title:`${Campeao} da Redenção`, reason:"Virou o jogo e terminou no topo." };
    if (dom === "strategist" || hasIn(blend, ["Estrategista","Jogador"])) {
      if (hasIn(blend, ["Vilão","Antagonista","Cobra","Manipulador"])) return { emoji:"🏆", title:"Estrategista Supremo", reason:"Controlou o jogo com frieza e precisão." };
      if (ps.swing <= 0.6 && ps.range <= 2.0) return { emoji:"🏆", title:"Jogo Sem Erros", reason:"Leitura estável, sem grandes quedas." };
      return { emoji:"🏆", title:"Mente Estratégica", reason:"Venceu por leitura e consistência." };
    }
    if (dom === "perseguido" || hasIn(blend, ["Perseguido","Vítima","Injustiçado","Mocinho"])) return { emoji:"🏆", title:`${Campeao} Improvável`, reason:"Sobreviveu à pressão e cresceu quando importava." };
    if (dom === "justiceiro" || hasIn(blend, ["Justiceiro","Defensor","Protetor"])) return { emoji:"🏆", title:"Justiceiro Coroado", reason:"Transformou valor em voto." };
    if (dom === "sage" || hasIn(blend, ["Sábio","Conselheiro","Paz e Amor","Mentor"])) return { emoji:"🏆", title:"Mestre do Jogo", reason:"Chegou longe com calma, leitura e confiança." };
    if (dom === "galamusa" || hasIn(blend, ["Galã","Musa","Crush","Querido"])) return { emoji:"🏆", title:"Ícone da Temporada", reason:"Carisma e torcida fizeram a diferença." };
    if (dom === "comic" || hasIn(blend, ["Bobo da Corte","Alívio Cômico","Meme"])) return { emoji:"🏆", title:`${Queridinho} do Público`, reason:"Virou história, virou torcida e fechou a conta." };
    if (dom === "chaotic" || hasIn(blend, ["Caótico","Imprevisível","Do nada"])) return { emoji:"🏆", title:"Caos Vitorioso", reason:"Imprevisível, mas efetivo no momento certo." };
    if (hasIn(String(snap?.comboTitle||""), ["Casal","Romance"])) return { emoji:"🏆", title:"Final Feliz", reason:"Jogou em dupla e chegou no topo." };

    if (ps.growth >= 2.2) return { emoji:"🏆", title:`${Campeao} da Virada`, reason:"Terminou em alta depois de uma mudança clara de leitura." };
    if (ps.avg >= 6.8) return { emoji:"🏆", title:"Favorito Consagrado", reason:"Fechou a temporada em alta com o público." };
    if (ps.range <= 1.6 && ps.swing <= 0.6) return { emoji:"🏆", title:"Campeão da Persistência", reason:"Constância e sobrevivência até o fim." };
    return { emoji:"🏆", title:`${Ultimo} em Pé`, reason:"Chegou ao fim com a melhor leitura do jogo." };
  };

  const titleForFinalist = (p, place) => {
    const snap = lastSnap(p) || {};
    const blend = pickBlend(snap).join(" · ");
    const dom = String(snap?.dominantId || "");
    const arc = String(snap?.arcTitle || "");
    const ps = popStats(p);

    const Campeao = g(p,{M:"Campeão",F:"Campeã",O:"Campeãe"});
    const Quase = g(p,{M:"Quase Campeão",F:"Quase Campeã",O:"Quase Campeãe"});

    if (place === 2 && ps.avg >= 6.8 && Math.abs(ps.growth) <= 1.2) return { emoji:"🥈", title:"Vice Incontestável", reason:"Chegou muito forte e perdeu por pouco." };
    if (place === 2 && ps.avg >= 6.6 && ps.growth >= 1.8) return { emoji:"🥈", title:Quase, reason:"Cresceu no fim e bateu na trave." };
    if (hasIn(arc, ["queda"])) return { emoji: place===2 ? "🥈" : "🥉", title:"Ameaça Final", reason:"Chegou forte, mas caiu na reta decisiva." };
    if (dom === "strategist" || hasIn(blend, ["Estrategista","Jogador"])) return { emoji: place===2 ? "🥈" : "🥉", title:"Finalista Estratégico", reason:"Jogou com cabeça e quase levou." };
    if (dom === "vilao" || hasIn(blend, ["Vilão","Antagonista","Cobra","Manipulador"])) return { emoji: place===2 ? "🥈" : "🥉", title:"Vilão de Elite", reason:"A casa temeu. O público decidiu." };
    if (dom === "perseguido" || hasIn(blend, ["Perseguido","Vítima","Injustiçado"])) return { emoji: place===2 ? "🥈" : "🥉", title:"Finalista Resiliente", reason:"Foi alvo, resistiu e chegou até o fim." };
    if (dom === "sage" || hasIn(blend, ["Sábio","Conselheiro","Mentor"])) return { emoji: place===2 ? "🥈" : "🥉", title:"O Conselho do Pódio", reason:"Estabilidade e influência até o fim." };
    if (dom === "galamusa" || hasIn(blend, ["Galã","Musa","Crush"])) return { emoji: place===2 ? "🥈" : "🥉", title:"Coração da Temporada", reason:"Carisma e conexões levaram longe." };
    if (dom === "comic" || hasIn(blend, ["Bobo da Corte","Alívio Cômico","Meme"])) return { emoji: place===2 ? "🥈" : "🥉", title:"O Show do Pódio", reason:"Fez a temporada acontecer." };
    if (hasIn(String(snap?.comboTitle||""), ["Casal","Romance"])) return { emoji: place===2 ? "🥈" : "🥉", title:"Dupla Final", reason:"A leitura em dupla sustentou o caminho." };
    if (ps.avg >= 6.6) return { emoji: place===2 ? "🥈" : "🥉", title:"Querido Até o Fim", reason:"Chegou no pódio com força de torcida." };
    return { emoji: place===2 ? "🥈" : "🥉", title:"Finalista", reason:"Fechou a temporada entre os melhores." };
  };

  const titleForBarred = (p) => {
    const snap = lastSnap(p) || {};
    const blend = pickBlend(snap).join(" · ");
    const dom = String(snap?.dominantId || "");
    const arc = String(snap?.arcTitle || "");
    const ps = popStats(p);

    const Vilo = g(p,{M:"Vilão",F:"Vilã",O:"Vilãe"});

    if (hasIn(arc, ["explodiu no fim","ascen","reden"])) return { emoji:"🚫", title:"Sonho Interrompido", reason:"Cresceu na reta final, mas caiu na porta." };
    if (ps.avg >= 6.8) return { emoji:"🚫", title:"Queda do Favorito", reason:"Chegou como favorito e caiu no último corte." };
    if (dom === "strategist" || hasIn(blend, ["Estrategista","Jogador"])) return { emoji:"🚫", title:"Xeque-mate Antes da Final", reason:"Faltou só uma rodada para fechar a conta." };
    if (dom === "vilao" || hasIn(blend, ["Vilão","Antagonista"])) return { emoji:"🚫", title:`${Vilo} Punid${g(p,{M:"o",F:"a",O:"e"})} na Porta`, reason:"A leitura virou no último instante." };
    if (dom === "perseguido" || hasIn(blend, ["Perseguido","Injustiçado"])) return { emoji:"🚫", title:"A Grande Injustiça", reason:"Saiu quando já tinha torcida e narrativa." };
    if (hasIn(String(snap?.comboTitle||""), ["Casal","Romance"])) return { emoji:"🚫", title:"Romance Barrado", reason:"A história não chegou ao último capítulo." };
    if (dom === "comic" || hasIn(blend, ["Bobo da Corte","Meme"])) return { emoji:"🚫", title:"O Último Plot Twist", reason:"Parecia escapar sempre, até não escapar." };
    return { emoji:"🚫", title:"O Último Corte", reason:"Bateu na trave da final." };
  };

  const titleForFirstBoot = (p) => {
    const snap = lastSnap(p) || {};
    const blend = pickBlend(snap).join(" · ");
    const dom = String(snap?.dominantId || "");
    const ps = popStats(p);

    const Primeiro = g(p,{M:"Primeiro",F:"Primeira",O:"Primeire"});
    const Vilo = g(p,{M:"Vilão",F:"Vilã",O:"Vilãe"});

    if (dom === "vilao" || hasIn(blend, ["Vilão","Antagonista"])) return { emoji:"❌", title:"Aposta Errada", reason:`Entrou como ${Vilo} e caiu cedo.` };
    if (dom === "chaotic" || hasIn(blend, ["Caótico","Imprevisível"])) return { emoji:"❌", title:"Movimento Prematuro", reason:"O primeiro choque da temporada." };
    if (dom === "planta" || hasIn(blend, ["Planta","Figurante","Invisível"])) return { emoji:"❌", title:`${Primeiro} Sacrifício`, reason:"A casa escolheu o caminho mais fácil." };
    if (dom === "perseguido" || hasIn(blend, ["Perseguido","Vítima"])) return { emoji:"❌", title:"Não Teve Chance", reason:"Virou alvo antes de construir base." };
    if (dom === "galamusa" || hasIn(blend, ["Galã","Musa","Crush"])) return { emoji:"❌", title:"Promessa Que Não Andou", reason:"Chamou atenção, mas não virou história." };
    if (hasIn(String(snap?.comboTitle||""), ["Casal","Romance"])) return { emoji:"❌", title:"Ship Cancelado", reason:"Nem deu tempo de virar enredo." };
    // fallback: se teve pop muito baixa logo no começo
    if (ps.avg <= 4.2) return { emoji:"❌", title:"Saída Relâmpago", reason:"O jogo começou cobrando caro." };
    return { emoji:"❌", title:"Primeira Baixa", reason:"O começo da temporada cobrou seu preço." };
  };

  // ===== Atribuição dos títulos principais (únicos por categoria) =====
  if (winnerId && byId.get(String(winnerId))) mkMain(byId.get(String(winnerId)), titleForWinner(byId.get(String(winnerId))));
  if (secondId && byId.get(String(secondId))) mkMain(byId.get(String(secondId)), titleForFinalist(byId.get(String(secondId)), 2));
  if (thirdId && byId.get(String(thirdId))) mkMain(byId.get(String(thirdId)), titleForFinalist(byId.get(String(thirdId)), 3));

  if (barredId && !finalists.includes(String(barredId)) && byId.get(String(barredId))) {
    mkMain(byId.get(String(barredId)), titleForBarred(byId.get(String(barredId))));
  }

  if (firstBootId && byId.get(String(firstBootId))) {
    mkMain(byId.get(String(firstBootId)), titleForFirstBoot(byId.get(String(firstBootId))));
  }

  // ===== Accolades raros (1 por temporada cada) =====
  // 1) Agente do Caos da Temporada (maior média de "caotico" e pelo menos 3 semanas)
  let bestChaos = null;
  for (const p of (state.players || [])) {
    const cs = chaosSum(p);
    if (cs.weeks < 3) continue;
    if (bestChaos == null || cs.avg > bestChaos.avg) bestChaos = { id: p.id, avg: cs.avg, sum: cs.sum, weeks: cs.weeks };
  }
  if (bestChaos && bestChaos.avg >= 65) {
    const p = byId.get(String(bestChaos.id));
    addAccolade(p, { emoji:"🌪️", title:"Agente do Caos da Temporada", reason:"Movimentos imprevisíveis e impacto recorrente." });
  }

  // 2) Rosto da Temporada (maior presença na timeline, mínimo de 8 eventos)
  let bestFace = null;
  for (const p of (state.players || [])) {
    const n = activityCount(p);
    if (bestFace == null || n > bestFace.n) bestFace = { id: p.id, n };
  }
  if (bestFace && bestFace.n >= 8) {
    const p = byId.get(String(bestFace.id));
    addAccolade(p, { emoji:"🎭", title:"Rosto da Temporada", reason:"Esteve no centro dos acontecimentos com mais frequência." });
  }

  // 3) Símbolo da Temporada (maior crescimento + média alta)
  let bestSymbol = null;
  for (const p of (state.players || [])) {
    const ps = popStats(p);
    const score = (ps.growth * 1.2) + (ps.avg * 0.6);
    if (bestSymbol == null || score > bestSymbol.score) bestSymbol = { id: p.id, score, ps };
  }
  if (bestSymbol && bestSymbol.ps && (bestSymbol.ps.growth >= 1.8 || bestSymbol.ps.avg >= 6.8)) {
    const p = byId.get(String(bestSymbol.id));
    addAccolade(p, { emoji:"🧿", title:"Símbolo da Temporada", reason:"Representou a narrativa central na percepção do público." });
  }
}

  function tagTheme(p, themeId, scoreDelta = 1, round = 1, timelineIndex = null) {
    if (!p) return;
    initNarrativeForPlayer(p, round);
    const t = p.narrative.themes || (p.narrative.themes = {});
    const id = String(themeId || '').trim();
    if (!id) return;
    if (!t[id]) t[id] = { score: 0, firstRound: round, lastRound: round, examples: [] };
    t[id].score = clamp(Number(t[id].score ?? 0) + Number(scoreDelta || 0), 0, 999);
    t[id].lastRound = round;
    if (timelineIndex != null) {
      t[id].examples = Array.isArray(t[id].examples) ? t[id].examples : [];
      if (!t[id].examples.includes(timelineIndex)) t[id].examples.push(timelineIndex);
      if (t[id].examples.length > 12) t[id].examples = t[id].examples.slice(-12);
    }
  }

  function applyNarrativeEvent({ type, actorId, targetId = null, round, meta = {} } = {}) {
    const actor = state.players.find(x => x.id === actorId);
    if (!actor) return;
    const target = targetId ? state.players.find(x => x.id === targetId) : null;
    const R = Number(round ?? state.week ?? 1);

    initNarrativeForPlayer(actor, R);
    if (target) initNarrativeForPlayer(target, R);

    const A = actor;
    const B = target;
    // Para textos narrativos, evita emojis de status (★/👹/🪴 etc.)
    const aName = simpleName(A);
    const bName = B ? simpleName(B) : '';

    const makeText = () => {
      switch (type) {
        case 'win_hoh': return `${aName} virou Líder na semana ${R}.`;
        case 'win_veto': return `${aName} ganhou a Prova do Anjo na semana ${R}.`;
        case 'nomination': return B ? `${aName} colocou ${bName} no Paredão.` : `${aName} indicou alguém ao Paredão.`;
        case 'house_target': return `${aName} virou alvo da casa e recebeu muitos votos.`;
        case 'close_call': return `${aName} se salvou no detalhe no Paredão.`;
        case 'pop_surge': return `${aName} subiu de popularidade e ganhou destaque.`;
        case 'pop_drop': return `${aName} perdeu popularidade e virou pauta.`;
        case 'danger': return `${aName} ficou em risco no Paredão.`;
        case 'save': return B ? `${aName} salvou ${bName} do Paredão.` : `${aName} escapou do Paredão.`;
        case 'vote_cast': return B ? `${aName} votou em ${bName}.` : `${aName} votou.`;
        case 'vote_received': return B ? `${aName} recebeu voto de ${bName}.` : `${aName} recebeu voto.`;
        case 'betrayal': return B ? `${aName} traiu ${bName} no voto.` : `${aName} fez uma traição.`;
        case 'friendship': return B ? `${aName} fortaleceu uma amizade com ${bName}.` : `${aName} criou um laço forte na casa.`;
        case 'friendship_betrayed': return B ? `${aName} rompeu a amizade com ${bName}.` : `${aName} quebrou um laço importante.`;
        case 'vulnerability': return B ? `${aName} se abriu com ${bName} e mostrou vulnerabilidade.` : `${aName} mostrou vulnerabilidade e ganhou empatia.`;
        case 'monster_punished': return B ? `${aName} caiu no Monstro junto com ${bName}.` : `${aName} foi colocado(a) no Monstro.`;
        case 'monster_sent': return B ? `${aName} colocou ${bName} no Monstro.` : `${aName} colocou alguém no Monstro.`;
        case 'conflict': return B ? `${aName} teve uma treta com ${bName}.` : `${aName} se envolveu em treta.`;
        case 'reconciliation': return B ? `${aName} fez as pazes com ${bName}.` : `${aName} fez as pazes com alguém.`;
        case 'eviction_survived': return `${aName} sobreviveu ao Paredão.`;
        case 'eliminated': return `${aName} foi eliminad${g(A,{M:'o',F:'a',O:'e'})} na semana ${R}.`;
        default: return meta?.text ? String(meta.text) : `${aName} viveu um momento importante no jogo.`;
      }
    };

    const weight = clamp(Number(meta?.weight ?? 1), 1, 3);
    const refs = Object.assign({}, meta?.refs || {});
    if (B) refs.targetId = B.id;

    const idxA = pushTimelineEvent(A, { round: R, type, text: makeText(), refs, weight });

    // relations + rep + themes + momentum
    if (B) {
      if (type === 'bond' || type === 'alliance_form' || type === 'save' || type === 'reconciliation' || type === 'friendship' || type === 'vulnerability') {
        adjustRelation(A, B, { bondDelta: 8, trustDelta: 6, rivalryDelta: -4, round: R, tag: type });
        adjustRelation(B, A, { bondDelta: 6, trustDelta: 5, rivalryDelta: -3, round: R, tag: type });
      }
      if (type === 'conflict' || type === 'nomination') {
        adjustRelation(A, B, { rivalryDelta: 12, trustDelta: -6, bondDelta: -4, round: R, tag: type });
        adjustRelation(B, A, { rivalryDelta: 10, trustDelta: -5, bondDelta: -3, round: R, tag: type });
      }
      if (type === 'betrayal') {
        adjustRelation(A, B, { rivalryDelta: 10, trustDelta: -16, bondDelta: -8, round: R, tag: type });
        adjustRelation(B, A, { rivalryDelta: 12, trustDelta: -20, bondDelta: -10, round: R, tag: type });
      }

      if (type === 'friendship') {
        adjustRelation(A, B, { bondDelta: 14, trustDelta: 10, rivalryDelta: -6, round: R, tag: 'friendship' });
        adjustRelation(B, A, { bondDelta: 12, trustDelta: 9, rivalryDelta: -5, round: R, tag: 'friendship' });
      }

      if (type === 'friendship_betrayed') {
        adjustRelation(A, B, { rivalryDelta: 14, trustDelta: -22, bondDelta: -14, round: R, tag: 'friendship_betrayed' });
        adjustRelation(B, A, { rivalryDelta: 16, trustDelta: -26, bondDelta: -16, round: R, tag: 'friendship_betrayed' });
      }

      if (type === 'vulnerability') {
        adjustRelation(A, B, { bondDelta: 10, trustDelta: 12, rivalryDelta: -4, round: R, tag: 'vulnerability' });
        adjustRelation(B, A, { bondDelta: 6, trustDelta: 8, rivalryDelta: -2, round: R, tag: 'vulnerability' });
      }
    }

    // stats
    const st = A.narrative.stats;
    if (type === 'win_hoh') st.hohWins += 1;
    if (type === 'win_veto') st.vetoWins += 1;
    if (type === 'nomination') st.nominations += 1;
    if (type === 'save') st.timesSaved += 1;
    if (type === 'vote_cast') st.votesCast += 1;
    if (type === 'vote_received') st.votesReceived += 1;
    if (type === 'betrayal') st.betrayalsDone += 1;
    if (type === 'friendship_betrayed') st.betrayalsDone += 1;
    if (type === 'eliminated') {
      // guarda pico de rejeição (% no paredão) se disponível
      try {
        const perc = (meta?.refs?.publicoPerc && typeof meta.refs.publicoPerc === 'object') ? meta.refs.publicoPerc : null;
        const v = perc ? Number(perc[String(A.id)] ?? 0) : NaN;
        if (Number.isFinite(v)) {
          const cur = Number(A.narrative.stats.rejectionPeak ?? -1);
          if (!Number.isFinite(cur) || v > cur) {
            A.narrative.stats.rejectionPeak = v;
            A.narrative.stats.rejectionRound = R;
          }
        }
      } catch { /* ignora */ }
    }

    // rep + momentum + themes
    if (type === 'win_hoh') { adjustReputation(A, { compBeast: 2, strategist: 1 }); bumpMomentum(A, 1); A.narrative.streaks.win = (A.narrative.streaks.win || 0) + 1; }
    if (type === 'win_veto') { adjustReputation(A, { compBeast: 1, social: 1 }); bumpMomentum(A, 1); A.narrative.streaks.win = (A.narrative.streaks.win || 0) + 1; }

    if (type === 'danger') { adjustReputation(A, { underdog: 1 }); bumpMomentum(A, -1); A.narrative.streaks.danger = (A.narrative.streaks.danger || 0) + 1; tagTheme(A, 'survivor', 1, R, idxA); }
    if (type === 'eviction_survived') { adjustReputation(A, { underdog: 2 }); bumpMomentum(A, 1); tagTheme(A, 'survivor', 2, R, idxA); }

    if (type === 'betrayal') {
      adjustReputation(A, { villain: 2, strategist: 1, loyal: -2 });
      bumpMomentum(A, 1);
      tagTheme(A, 'betrayer', 2, R, idxA);
      if (B) {
        adjustReputation(B, { underdog: 1 });
        bumpMomentum(B, -1);
        B.narrative.stats.betrayalsSuffered = (B.narrative.stats.betrayalsSuffered || 0) + 1;
      }
    }

    if (type === 'friendship') {
      adjustReputation(A, { social: 2, loyal: 1 });
      bumpMomentum(A, 1);
      tagTheme(A, 'unbreakable_bond', 2, R, idxA);
      if (B) {
        adjustReputation(B, { social: 1, loyal: 1 });
        bumpMomentum(B, 1);
        tagTheme(B, 'unbreakable_bond', 1, R, null);
      }
    }

    if (type === 'friendship_betrayed') {
      adjustReputation(A, { villain: 2, strategist: 1, loyal: -3 });
      bumpMomentum(A, 1);
      tagTheme(A, 'heartbreak', 3, R, idxA);
      if (B) {
        adjustReputation(B, { underdog: 1, loyal: 1 });
        bumpMomentum(B, -1);
        tagTheme(B, 'heartbreak', 2, R, null);
        B.narrative.stats.betrayalsSuffered = (B.narrative.stats.betrayalsSuffered || 0) + 1;
      }
    }

    if (type === 'vulnerability') {
      adjustReputation(A, { social: 1, loyal: 1, underdog: 1 });
      bumpMomentum(A, 1);
      tagTheme(A, 'vulnerability', 2, R, idxA);
      if (B) {
        adjustReputation(B, { social: 1, loyal: 1 });
        bumpMomentum(B, 1);
      }
    }

    if (type === 'monster_punished') {
      adjustReputation(A, { underdog: 1 });
      bumpMomentum(A, -1);
      tagTheme(A, 'monster', 2, R, idxA);
    }

    if (type === 'monster_sent') {
      adjustReputation(A, { strategist: 1, villain: 1 });
      bumpMomentum(A, 0);
      tagTheme(A, 'monster_sender', 1, R, idxA);
    }

    if (type === 'conflict') { adjustReputation(A, { villain: 1 }); bumpMomentum(A, 0); tagTheme(A, 'rivalry', 1, R, idxA); }
    if (type === 'reconciliation') { adjustReputation(A, { social: 1, loyal: 1 }); bumpMomentum(A, 1); }
    if (type === 'nomination') { adjustReputation(A, { strategist: 1 }); bumpMomentum(A, 0); }
    if (type === 'eliminated') { bumpMomentum(A, -3); }

    // biggestMoveRound: movimentos weight 3
    if (weight >= 3) {
      const cur = A.narrative.stats.biggestMoveRound;
      if (cur == null) A.narrative.stats.biggestMoveRound = R;
    }

    return idxA;
  }


  // Títulos de arco narrativo: pools em português + seleção determinística (variedade sem ficar aleatório a cada render)
  const ARC_TITLE_POOLS = {
    survivor: [
      "O Resistente",
      "Sempre por um Fio",
      "A Fênix do Jogo",
      "Escapista",
      "Sobreviveu no Detalhe",
      "O Indestrutível",
      "O Que Nunca Cai"
    ],
    strategist: [
      "O Articulador",
      "Xadrezista",
      "Jogando nas Sombras",
      "Mente do Jogo",
      "O Arquiteto do Jogo",
      "O Que Puxa os Fios"
    ],
    villain: [
      "O Vilão da Temporada",
      "Figura Polêmica",
      "Jogando com Fogo",
      "O Queimado",
      "Jogo Sujo",
      "Sem Medo do Cancelamento"
    ],
    comp: [
      "Trator",
      "Imparável",
      "Máquina de Vitórias",
      "Dono das Provas",
      "Competidor Nato",
      "Sequência Perigosa"
    ],
    social: [
      "Camaleão Social",
      "Centro da Casa",
      "Todo Mundo Gosta",
      "Socialmente Blindado",
      "O Bom de Conversa",
      "Costurando Alianças"
    ],

    // ⭐ Torcida (favorito é sobre fandom, não só popularidade)
    fav_long: [
      "Queridinho do Público",
      "Fandom Blindado",
      "Favoritão da Temporada",
      "Intocável",
      "O Nome da Torcida"
    ],
    fav_flash: [
      "Febre Relâmpago",
      "Hype do Dia",
      "Assunto do Twitter",
      "Brilho Passageiro"
    ],
    fav_late: [
      "Virada Popular",
      "Cresceu na Hora Certa",
      "Caminho de Campeão",
      "Explodiu no Fim"
    ],
    fav_fallen: [
      "Perdeu a Torcida",
      "Do Céu ao Paredão",
      "Caiu em Desgraça",
      "Fandom Virou"
    ],
    fav_mixed: [
      "Fandom Intermitente",
      "Amado e Odiado",
      "Divide Torcidas",
      "Efeito Montanha-Russa"
    ],

    plant: [
      "Planta Decorativa",
      "Turista da Casa",
      "Sempre Fora do Foco",
      "Passou em Branco",
      "Vivo(a) no Modo Avião"
    ],

    rejected: [
      "Rejeição Pesada",
      "O Alvo do Brasil",
      "Cancelado(a)",
      "Saiu Rejeitado(a)",
      "O Nome Que a Casa Queria Fora"
    ],
    chaos: [
      "Imprevisível",
      "Bomba-Relógio",
      "Sempre no Olho do Furacão",
      "Uma Semana de Cada Vez"
    ],
    isolated: [
      "Lobo Solitário",
      "Sozinho no Jogo",
      "Fora do Grupo",
      "Jogo Solitário"
    ],
    neutral: [
      "Figura Imprevisível",
      "Jogador(a) em Construção",
      "Peça Solta do Jogo"
    ]
  };

  // Subtítulos: explicam o porquê do arquétipo (curto, direto, reaproveitável)
  const ARC_SUBTITLE_POOLS = {
    survivor: [
      "viveu no limite e achou brechas para continuar",
      "sobreviveu quando parecia impossível",
      "fez do risco um combustível"
    ],
    strategist: [
      "mexeu as peças sem precisar aparecer",
      "transformou informação em voto",
      "controlou o tabuleiro por trás"
    ],
    villain: [
      "colecionou atritos e não recuou",
      "jogou pesado mesmo sob pressão",
      "virou assunto por polêmica e conflito"
    ],
    comp: [
      "acumulou vitórias e intimidou rivais",
      "usou prova como escudo e espada",
      "fez o jogo girar na força"
    ],
    social: [
      "costurou relações e escapou de mira",
      "ganhou espaço pelo carisma",
      "sobreviveu pela rede social"
    ],
    plant: [
      "passou despercebido(a) por tempo demais",
      "existiu mais como coadjuvante",
      "ficou fora dos centros de decisão"
    ],
    rejected: [
      "virou alvo claro do público",
      "enfrentou rejeição alta e desgaste",
      "pagou o preço da narrativa negativa"
    ],
    chaos: [
      "criou instabilidade a cada semana",
      "ninguém sabia de que lado estava",
      "virou faísca de enredos"
    ],
    isolated: [
      "jogou sem base fixa",
      "ficou de fora dos blocos principais",
      "andou sozinho(a) por necessidade"
    ],
    fav_long: [
      "manteve torcida consistente",
      "foi protegido(a) pelo fandom",
      "teve blindagem de público"
    ],
    fav_flash: [
      "explodiu em hype e sumiu rápido",
      "teve um pico curto de torcida",
      "foi febre por um instante"
    ],
    fav_late: [
      "cresceu na reta final",
      "virou favorito(a) tarde",
      "ganhou força quando importava"
    ],
    fav_fallen: [
      "perdeu a torcida no caminho",
      "caiu no julgamento do público",
      "desgastou a própria imagem"
    ],
    fav_mixed: [
      "dividiu a torcida",
      "foi amado(a) e odiado(a) ao mesmo tempo",
      "viveu a montanha russa do público"
    ],
    neutral: [
      "teve uma trajetória com picos pontuais",
      "oscilou entre sombra e destaque",
      "foi peça útil, mas não central"
    ]
  };

  const hashStr = (str) => {
    // hash simples e estável (djb2)
    let h = 5381;
    const s = String(str ?? '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return h >>> 0;
  };

  const pickDet = (arr, seed, fallback='') => {
    if (!Array.isArray(arr) || !arr.length) return fallback;
    const idx = hashStr(seed) % arr.length;
    return arr[idx];
  };

  const pickArcTitle = (p, totalRounds) => {
    const n = p?.narrative || {};
    const rep = n.reputation || {};
    const themes = n.themes || {};
    const stats = n.stats || {};
    const id = String(p?.id ?? '');

    // sinais fortes fora de reputação: ⭐ torcida, planta e rejeição
    const favKind = (typeof favoriteKindFromHistory === 'function') ? favoriteKindFromHistory(p, totalRounds) : null;
    const isPlant = !!(p?.status?.planta && Number(p?.status?.plantStreak ?? 0) >= 2);
    const rejectionPct = Number(stats?.rejectionPeak ?? NaN);

    const score = (k) => Number(rep?.[k] ?? 0);

    // Eixos (prioridade pelo impacto narrativo)
    const axes = [];

    // (0) arcos mais "especiais" (aparecem pouco, mas quando aparecem definem tudo)
    if (Number.isFinite(rejectionPct) && rejectionPct >= 55) axes.push('rejected');
    if (favKind) axes.push(favKind);
    if (isPlant) axes.push('plant');

    if (score('underdog') >= 7 || Number(themes?.survivor?.score ?? 0) >= 2 || Number(n?.streaks?.danger ?? 0) >= 2) axes.push('survivor');
    if (score('social') >= 7) axes.push('social');
    if (score('compBeast') >= 7 || Number(n?.streaks?.win ?? 0) >= 2) axes.push('comp');
    if (score('strategist') >= 7) axes.push('strategist');
    if (score('villain') >= 7 || Number(themes?.collapse?.score ?? 0) >= 2) axes.push('villain');
    if (Number(themes?.lone_wolf?.score ?? 0) >= 2) axes.push('isolated');
    if (Number(themes?.chaos?.score ?? 0) >= 2) axes.push('chaos');

    // fallback: pilar mais alto (entre os 6 básicos)
    if (!axes.length) {
      const pillars = [
        { id: 'strategist', v: score('strategist') },
        { id: 'underdog', v: score('underdog') },
        { id: 'compBeast', v: score('compBeast') },
        { id: 'villain', v: score('villain') },
        { id: 'loyal', v: score('loyal') },
        { id: 'social', v: score('social') }
      ].sort((a,b)=>b.v-a.v);
      const top = pillars[0]?.id;
      axes.push(top === 'compBeast' ? 'comp' : (top === 'underdog' ? 'survivor' : (top || 'neutral')));
    }

    const main = axes[0] || 'neutral';

    // Modificadores (subtítulo) — só se acrescentar algo claro
    const mods = [];
    if (main !== 'comp' && (score('compBeast') >= 6 || Number(n?.streaks?.win ?? 0) >= 2)) mods.push('comp');
    if (main !== 'survivor' && (score('underdog') >= 6 || Number(n?.streaks?.danger ?? 0) >= 2)) mods.push('survivor');
    if (main !== 'villain' && (score('villain') >= 6 || Number(stats?.betrayalsDone ?? 0) >= 2)) mods.push('villain');
    if (main !== 'strategist' && (score('strategist') >= 6)) mods.push('strategist');
    if (main !== 'social' && (score('social') >= 6)) mods.push('social');
    if (Number(themes?.lone_wolf?.score ?? 0) >= 2) mods.push('isolated');

    // Escolhe um modificador "mais diferente" do eixo principal
    const secondary = mods.find(m => m && m !== main) || null;

    const title = pickDet(ARC_TITLE_POOLS[main] || ARC_TITLE_POOLS.neutral, `${id}|${main}|title`, "Figura Imprevisível");
    const baseSub = pickDet(ARC_SUBTITLE_POOLS[main] || ARC_SUBTITLE_POOLS.neutral, `${id}|${main}|subtitle`, "teve uma trajetória com picos pontuais");
    const secSub = secondary
      ? pickDet(ARC_SUBTITLE_POOLS[secondary] || ARC_SUBTITLE_POOLS.neutral, `${id}|${main}|${secondary}|subtitle`, '')
      : '';

    const subtitle = secSub ? `${baseSub}. Também: ${secSub}.` : `${baseSub}.`;

    return { title, subtitle: subtitle || null, axis: main, secondary };
  };

  function buildPlayerArc(playerId, totalRounds) {
    const p = state.players.find(x => x.id === playerId);
    if (!p || !p.narrative) return null;
    const total = Math.max(1, Number(totalRounds || state.week || 1));
    const tline = (p.narrative.timeline || []).slice();

        const phases = [
      { id: 'Início', a: 1, b: Math.ceil(total * 0.25) },
      { id: 'Meio', a: Math.ceil(total * 0.25) + 1, b: Math.ceil(total * 0.50) },
      { id: 'Fim', a: Math.ceil(total * 0.50) + 1, b: Math.ceil(total * 0.75) },
      { id: 'Reta final', a: Math.ceil(total * 0.75) + 1, b: total }
    ];

    const escapeRegExp = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripSelfName = (txt) => {
      const name = simpleName(p);
      const re = new RegExp('^' + escapeRegExp(name) + '\\s+', 'i');
      return String(txt || '').replace(re, '').trim();
    };

    const listUniqueTargets = (evs) => {
      const ids = [];
      for (const e of evs) {
        const tid = e?.refs?.targetId;
        if (tid && !ids.includes(tid)) ids.push(tid);
        if (ids.length >= 2) break;
      }
      return ids.map((id) => {
        const q = state.players.find(x => x.id === id);
        return q ? simpleName(q) : 'alguém';
      });
    };

    const pickPhaseLine = (ph) => {
      // Se a pessoa já tinha saído antes do começo da fase, não faz sentido forçar narrativa.
      const outWeek = Number(p?.status?.outWeek ?? NaN);
      if (Number.isFinite(outWeek) && ph.a > outWeek) return `Na fase ${ph.id}, não participou.`;

      const evs = tline.filter(e => e.round >= ph.a && e.round <= ph.b);
      if (!evs.length) return `Na fase ${ph.id}, sem grandes viradas.`;

      const types = {};
      for (const e of evs) types[e.type] = (types[e.type] || 0) + 1;

      const parts = [];
      if (types.win_hoh) parts.push('conquistou a Liderança');
      if (types.win_veto) parts.push('levou o Anjo');
      if (types.nomination) {
        const tgs = listUniqueTargets(evs.filter(e => e.type === 'nomination'));
        if (tgs.length) parts.push(`mirou ${tgs.join(' e ')} no Paredão`);
        else parts.push('fez uma indicação ao Paredão');
      }
      if (types.conflict) parts.push('se envolveu em treta');
      if (types.betrayal) parts.push('quebrou confiança no voto');
      if (types.friendship) parts.push('firmou uma amizade forte');
      if (types.friendship_betrayed) parts.push('viveu uma amizade traída');
      if (types.vulnerability) parts.push('mostrou vulnerabilidade');
      if (types.monster_punished) parts.push('sofreu o Monstro');
      if (types.monster_sent) parts.push('aplicou o Monstro');
      if (types.danger) parts.push('ficou em risco');
      if (types.eviction_survived) parts.push('sobreviveu ao Paredão');

      // Se tudo ficou genérico, usa o evento mais pesado e remove o nome do próprio jogador.
      const top = evs.slice().sort((a,b) => (b.weight - a.weight) || (b.round - a.round))[0];
      if (!parts.length) return stripSelfName(top?.text || '');

      // Monta uma frase coerente (sem repetir o nome do jogador)
      if (parts.length === 1) return `Nesta fase, ${parts[0]}.`;
      if (parts.length === 2) return `Nesta fase, ${parts[0]} e ${parts[1]}.`;
      return `Nesta fase, ${parts.slice(0,2).join(', ')} e ${parts[2]}.`;
    };

    const rep = p.narrative.reputation || {};
    const themePairs = Object.entries(p.narrative.themes || {}).map(([id, v]) => ({ id, score: Number(v?.score ?? 0) }));
    themePairs.sort((a,b)=>b.score-a.score);

    // Título/subtítulo do arco: usa o seletor determinístico baseado em reputação/themes
    // (evita ReferenceError caso um wrapper não exista)
    const arcTitle = pickArcTitle(p, total);
    const title = arcTitle?.title;
    const subtitle = arcTitle?.subtitle;

    // relacionamentos (a partir do schema novo; fallback: relGet)
    const rels = state.players
      .filter(o => o.id !== p.id)
      .map(o => {
        const r = p.narrative.relations?.[o.id];
        const bond = (r && Number.isFinite(r.bond)) ? r.bond : clamp((relGet(p.id, o.id) + 5) * 10, 0, 100);
        const rivalry = (r && Number.isFinite(r.rivalry)) ? r.rivalry : clamp(((-relGet(p.id, o.id)) + 5) * 10, 0, 100);
        const trust = (r && Number.isFinite(r.trust)) ? r.trust : 50;
        return { o, bond, rivalry, trust };
      });

    const closestAlly = rels.slice().sort((a,b)=>b.bond-a.bond)[0] || null;
    const biggestRival = rels.slice().sort((a,b)=>b.rivalry-a.rivalry)[0] || null;

        // Momentos marcantes: evita repetição e tenta variar tipo (prova, treta, risco, movimento)
    const sorted = tline
      .slice()
      .sort((a,b)=> (b.weight - a.weight) || (b.round - a.round));

    const typeBucket = (t) => {
      if (t === 'win_hoh' || t === 'win_veto') return 'win';
      if (t === 'conflict' || t === 'betrayal' || t === 'friendship_betrayed') return 'heat';
      if (t === 'friendship') return 'bond';
      if (t === 'vulnerability') return 'vuln';
      if (t === 'monster_punished' || t === 'monster_sent') return 'monster';
      if (t === 'eviction_survived' || t === 'danger') return 'risk';
      if (t === 'nomination') return 'move';
      return 'other';
    };

    const definingMoments = [];
    const seen = new Set();
    const usedBuckets = new Set();

    for (const e of sorted) {
      const key = `${e.type}|${String(e.refs?.targetId ?? '')}|${e.round}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const bucket = typeBucket(e.type);
      // primeiro passe: prioriza buckets ainda não usados
      if (!usedBuckets.has(bucket) || definingMoments.length < 3) {
        definingMoments.push(Object.assign({}, e, { text: stripSelfName(e.text) }));
        usedBuckets.add(bucket);
      } else if (definingMoments.length < 6) {
        definingMoments.push(Object.assign({}, e, { text: stripSelfName(e.text) }));
      }

      if (definingMoments.length >= 6) break;
    }

        const logline = (() => {
      const avgBond = rels.length ? (rels.reduce((sum,x)=>sum+x.bond,0) / rels.length) : 0;
      const socialStatus = avgBond >= 65 ? 'muito bem conectad' : (avgBond >= 52 ? 'bem conectad' : 'mais isolad');

      // Ajuste simples de gênero (o/a/e) para palavras que terminam em "ad"
      const sufG = g(p, { M: 'o', F: 'a', O: 'e' });
      const socialTxt = socialStatus + sufG;

      const mainConflict = (rep.underdog ?? 0) > 6
        ? 'muita pressão'
        : ((rep.villain ?? 0) > 6 ? 'muitos atritos' : 'um jogo instável');

      const identity = title.toLowerCase();

      const key = definingMoments[0]?.text ? String(definingMoments[0].text) : null;
      const keyMoment = key ? key.replace(/\.$/, '') : `um momento forte na semana ${p.narrative.stats.biggestMoveRound ?? '—'}`;

      return `Começou ${socialTxt}, enfrentou ${mainConflict} e se consolidou como ${identity}, com destaque para ${keyMoment.toLowerCase()}.`;
    })();
    return {
      playerId: p.id,
      title,
      subtitle,
      logline,
      arcBeats: phases.map(ph => ({ phase: ph.id, text: pickPhaseLine(ph) })),
      definingMoments,
      relationships: {
        closestAlly: closestAlly ? { id: closestAlly.o.id, name: displayName(closestAlly.o), bond: Math.round(closestAlly.bond) } : null,
        biggestRival: biggestRival ? { id: biggestRival.o.id, name: displayName(biggestRival.o), rivalry: Math.round(biggestRival.rivalry) } : null
      },
      statsSummary: Object.assign({}, p.narrative.stats),
      themeSummary: themePairs.slice(0, 6).map(t => ({ themeId: t.id, score: t.score }))
    };
  }

  function buildSeasonArcs(totalRounds) {
    const total = Number(totalRounds || state.week || 1);
    return state.players.map(p => buildPlayerArc(p.id, total)).filter(Boolean);
  }

  function applyNarrativeFromWeekStateDiff(prevWS, ws, meta) {
    if (!prevWS || !ws) return;
    const round = Number(meta?.week ?? state.week ?? 1);

    // vitórias
    if (!prevWS.leaderId && ws.leaderId) applyNarrativeEvent({ type: 'win_hoh', actorId: ws.leaderId, round });
    if (!prevWS.anjoId && ws.anjoId) applyNarrativeEvent({ type: 'win_veto', actorId: ws.anjoId, round });
    // indicações (com pesos dinâmicos)
    ws._narrNomIdx = ws._narrNomIdx || {};
    const repeatCount = (actor, targetId) => {
      try {
        const tl = actor?.narrative?.timeline || [];
        const R = round;
        return tl.filter(e => e?.type === 'nomination' && String(e?.refs?.targetId) === String(targetId) && (R - Number(e.round || R)) <= 6).length;
      } catch { return 0; }
    };

    if (!prevWS.indicadoLiderId && ws.indicadoLiderId && ws.leaderId) {
      const actor = state.players.find(p => p.id === ws.leaderId);
      const rep = actor ? repeatCount(actor, ws.indicadoLiderId) : 0;
      const w = rep >= 1 ? 1 : 2;
      const idx = applyNarrativeEvent({ type: 'nomination', actorId: ws.leaderId, targetId: ws.indicadoLiderId, round, meta: { weight: w, refs: { nominationKind: 'lider', repeat: rep } } });
      if (idx != null) ws._narrNomIdx[String(ws.indicadoLiderId)] = { actorId: ws.leaderId, idx, kind: 'lider' };
    }

    if (!prevWS.contragolpeId && ws.contragolpeId) {
      const actorId = ws.indicadoLiderId || ws.leaderId;
      if (actorId) {
        const actor = state.players.find(p => p.id === actorId);
        const rep = actor ? repeatCount(actor, ws.contragolpeId) : 0;
        const w = rep >= 1 ? 1 : 2;
        const idx = applyNarrativeEvent({ type: 'nomination', actorId, targetId: ws.contragolpeId, round, meta: { weight: w, refs: { nominationKind: 'contragolpe', repeat: rep } } });
        if (idx != null) ws._narrNomIdx[String(ws.contragolpeId)] = { actorId, idx, kind: 'contragolpe' };
      }
    }

    // votos da casa: conta como "receber voto" + "votar" e detecta traição/rompimento
    const prevVotes = Array.isArray(prevWS.houseVotes) ? prevWS.houseVotes : [];
    const nowVotes = Array.isArray(ws.houseVotes) ? ws.houseVotes : [];
    if (nowVotes.length > prevVotes.length) {
      const added = nowVotes.slice(prevVotes.length);
      for (const v of added) {
        if (!v) continue;
        if (v.voterId && v.targetId) {
          applyNarrativeEvent({ type: 'vote_cast', actorId: v.voterId, targetId: v.targetId, round, meta: { weight: 1 } });
          applyNarrativeEvent({ type: 'vote_received', actorId: v.targetId, targetId: v.voterId, round, meta: { weight: 1 } });

          // rompeu com aliado: voto contra alguém com laço forte
          try {
            const voter = state.players.find(p => p.id === v.voterId);
            const target = state.players.find(p => p.id === v.targetId);
            if (voter && target) {
              const r = voter.narrative?.relations?.[target.id] || getRelationObj(voter, target.id);
              const bond = Number(r?.bond ?? 50);
              const trust = Number(r?.trust ?? 50);
              const key = `${voter.id}->${target.id}`;
              ws._narrBreaks = ws._narrBreaks || {};
              if (!ws._narrBreaks[key] && bond >= 72 && trust >= 60) {
                ws._narrBreaks[key] = true;
                applyNarrativeEvent({ type: 'betrayal', actorId: voter.id, targetId: target.id, round, meta: { weight: 2, refs: { why: 'voto_contra_aliado' } } });

                // Quando era um laço muito forte, trata como "amizade traída" (momento maior).
                if (bond >= 82 && trust >= 68) {
                  applyNarrativeEvent({ type: 'friendship_betrayed', actorId: voter.id, targetId: target.id, round, meta: { weight: 3, refs: { why: 'voto_contra_aliado_forte' } } });
                }
              }
            }
          } catch { /* ignora */ }
        }
      }

      // "virou alvo da casa" (quando alguém concentra muitos votos)
      try {
        ws._narrTargeted = Array.isArray(ws._narrTargeted) ? ws._narrTargeted : [];
        const tally = {};
        for (const v of nowVotes) {
          const tid = String(v?.targetId || '');
          if (!tid) continue;
          tally[tid] = (tally[tid] || 0) + 1;
        }
        const aliveN = alivePlayers().length;
        const threshold = Math.max(2, Math.ceil(aliveN * 0.25));
        let max = 0, maxId = null;
        for (const [id, n] of Object.entries(tally)) {
          if (n > max) { max = n; maxId = id; }
        }
        if (maxId && max >= threshold && !ws._narrTargeted.includes(maxId)) {
          ws._narrTargeted.push(maxId);
          applyNarrativeEvent({ type: 'house_target', actorId: maxId, round, meta: { weight: 2, refs: { votes: max } } });
        }
      } catch { /* ignora */ }
    }

    // paredão (risco)

    // paredão (risco)
    const prevP = new Set((prevWS.paredaoIds || []).map(String));
    const nowP = (ws.paredaoIds || []).map(String);
    for (const id of nowP) {
      if (!prevP.has(id)) {
        // Inclui o paredão completo como contexto para UI/"Momentos marcantes".
        applyNarrativeEvent({
          type: 'danger',
          actorId: id,
          round,
          meta: { weight: 2, refs: { paredaoIds: nowP.slice() } }
        });
      }
    }

    // treta do dia
    if (!prevWS.bigFight && ws.bigFight && ws.bigFight.aggressorId && ws.bigFight.targetId) {
      applyNarrativeEvent({ type: 'conflict', actorId: ws.bigFight.aggressorId, targetId: ws.bigFight.targetId, round, meta: { weight: 2 } });
    }
    // eliminação
    if (!prevWS.eliminadoId && ws.eliminadoId) {
      const outId = ws.eliminadoId;

      // (A) Indicação que elimina: sobe peso pra 3 e marca como maior movimento
      try {
        const key = String(outId);
        const info = ws._narrNomIdx?.[key] || null;
        if (info && info.actorId) {
          const actor = state.players.find(p => p.id === info.actorId);
          if (actor && Number.isFinite(info.idx)) {
            setTimelineEventWeight(actor, info.idx, 3);
            adjustReputation(actor, { strategist: 2 });
            bumpMomentum(actor, 1);
            tagTheme(actor, 'mastermind', 2, round, info.idx);
          }
        }
      } catch { /* ignora */ }

      applyNarrativeEvent({ type: 'eliminated', actorId: outId, round, meta: { weight: 3, refs: { publicoPerc: ws.publicoPerc || {} } } });

      // quem estava no paredão e não saiu, sobreviveu (e pode ter "se salvado no detalhe")
      const perc = (ws.publicoPerc && typeof ws.publicoPerc === 'object') ? ws.publicoPerc : {};
      for (const id of (ws.paredaoIds || [])) {
        if (String(id) === String(outId)) continue;

        const survId = String(id);
        applyNarrativeEvent({ type: 'eviction_survived', actorId: survId, round, meta: { weight: 2, refs: { paredaoIds: (ws.paredaoIds || []).slice() } } });

        const pRej = Number(perc[survId] ?? 0);
        if (pRej >= 35) {
          applyNarrativeEvent({ type: 'close_call', actorId: survId, round, meta: { weight: 2, refs: { rej: pRej, paredaoIds: (ws.paredaoIds || []).slice() } } });
        }
      }

      // (B) Popularidade: detecta quem subiu/quem caiu mais na semana
      try {
        const popStart = (ws.popStart && typeof ws.popStart === 'object') ? ws.popStart : {};
        const alive = alivePlayers();
        const deltas = alive.map(p => ({ p, d: Number(p.status?.pop ?? 5) - Number(popStart[p.id] ?? p.status?.popPrev ?? 5) }));
        deltas.sort((a,b)=>b.d-a.d);
        const top = deltas[0];
        const bot = deltas[deltas.length - 1];
        if (top && top.d >= 1.2) applyNarrativeEvent({ type: 'pop_surge', actorId: top.p.id, round, meta: { weight: 2, refs: { delta: Number(top.d.toFixed(2)) } } });
        if (bot && bot.d <= -1.2) applyNarrativeEvent({ type: 'pop_drop', actorId: bot.p.id, round, meta: { weight: 2, refs: { delta: Number(bot.d.toFixed(2)) } } });
      } catch { /* ignora */ }
    }

  }

  function generateNarrativeTweets({ max = 2, ctx = null, ws = null } = {}) {
    const alive = alivePlayers();
    state.narrative = state.narrative || {};
    const meta = state.narrative.tweetMeta || (state.narrative.tweetMeta = { recentTones: [], recentTopics: [], lastByPlayer: {} });

    // Guardrails contextuais:
    // - Na final (gameOver), evitamos tweets genéricos de narrativa porque o bloco de final já injeta tweets próprios.
    if (state.gameOver) return [];

    // Mapeia "dia" para quais tópicos fazem sentido.
    // Obs: o simulador trabalha por semana + chave de dia (ctx.key). Aqui queremos evitar:
    // - tweets de prova fora do dia de prova
    // - tweets de eliminação fora do dia de eliminação
    // - tweets de paredão fora do dia de formação
    const dayKey = ctx?.key || null;
    // Obs: ws.eliminadoId é resetado após a eliminação (resetWeekState),
    // então também aceitamos o "lastEvent" como fonte de verdade.
    const lastElimId = (state.lastEvent && state.lastEvent.type === 'elimination') ? state.lastEvent.eliminatedId : null;
    const hasElimToday = !!(dayKey === 'ter' && (ws?.eliminadoId != null || lastElimId != null));
    const hasParedaoToday = !!(dayKey === 'dom' && (ws?.paredaoIds || []).length === 3);

    // allowedTopics = null significa "não filtra".
    let allowedTopics = null;
    if (hasElimToday) {
      allowedTopics = new Set(['eliminated','escape','close_call','pop_surge','pop_drop','betrayal','house_target']);
    } else if (hasParedaoToday) {
      allowedTopics = new Set(['target','house_target']);
    } else {
      // Em dias comuns, só deixa temas de "clima" (pop surge/drop) OU treta (betrayal) se tiverem acontecido,
      // mas em volume menor.
      allowedTopics = new Set(['pop_surge','pop_drop','betrayal','house_target']);
    }

    const pushHistory = (topic, tone, playerId) => {
      meta.recentTones.push(tone);
      meta.recentTopics.push(topic);
      if (meta.recentTones.length > 24) meta.recentTones = meta.recentTones.slice(-24);
      if (meta.recentTopics.length > 24) meta.recentTopics = meta.recentTopics.slice(-24);
      if (playerId) meta.lastByPlayer[playerId] = state.week;
    };

    const tonePenalty = (tone) => meta.recentTones.slice(-8).includes(tone) ? 2 : 0;
    const topicPenalty = (topic) => meta.recentTopics.slice(-6).includes(topic) ? 1 : 0;
    const render = (tpl, facts) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (facts[k] ?? ''));

    const TONES = ['fofoca','debochado','narrador','analitico','torcida','dramatico','cansado','conspiracao'];

    const templates = {
      eliminated: {
        fofoca: [
          "E foi isso: {out} saiu. A casa vai sentir? 👀",
          "Acabou pra {out}. Agora quero ver como a casa reorganiza tudo."
        ],
        narrador: [
          "Na semana {round}, {out} deixou a casa e o jogo virou página.",
          "Com a saída de {out}, a temporada entra em outra fase."
        ],
        dramatico: [
          "A porta fechou pra {out}. E a sensação é de que nada vai ser igual.",
          "Um capítulo se encerra: {out} foi eliminado(a)."
        ],
        analitico: [
          "A eliminação de {out} muda alianças e abre espaço pra novos protagonistas.",
          "Saída importante: {out} era peça do tabuleiro e o jogo vai se redesenhar."
        ],
        torcida: [
          "Foi isso, {out} saiu! Bora ver quem assume o protagonismo agora!",
          "Tchau, {out}. Agora é foco na reta decisiva!"
        ],
        debochado: [
          "Falaram tanto… e no fim quem saiu foi {out}. BBB é isso 😭",
          "{out} saiu e o enredo ganhou um plot. Vamos."
        ]
      },
      target: {
        fofoca: [
          "Vocês viram? {actor} botou {target} no Paredão{again}. Climinha 👀",
          "{actor} mirou em {target}{again}. Isso aí já virou ranço."
        ],
        debochado: [
          "{actor}: 'não é pessoal'. Também {actor}: {target} no Paredão{again} 😬",
          "Paz na casa? {actor} disse não e mandou {target} pro Paredão{again}."
        ],
        narrador: [
          "Na semana {round}, {actor} desenhou o Paredão mirando {target}{again}.",
          "E assim {actor} escolheu o confronto direto com {target}{again}."
        ],
        analitico: [
          "Movimento objetivo: {actor} mira {target} pra reduzir ameaça no jogo{detail}.",
          "Indicação com lógica: {target} vinha crescendo e virou alvo natural{detail}."
        ],
        torcida: [
          "{actor} teve coragem e foi pra cima de {target}{again}. Vamo ver se sustenta!",
          "Se era pra mexer no jogo, {actor} mexeu: {target} no Paredão{again}."
        ],
        conspiracao: [
          "Tem coisa aí: {actor} bateu o martelo em {target}{again} muito rápido… 👀",
          "Do nada {actor} mirou {target}{again}. Alguém soprou isso?"
        ]
      },
      escape: {
        fofoca: [
          "Gente… {actor} escapou de novo. Já é a {count}ª vez no aperto 👀",
          "{actor} ficou! A casa jura que vai, mas {actor} segue voltando."
        ],
        narrador: [
          "Quando parecia o fim, {actor} virou a página e ficou.",
          "O Paredão veio forte, mas {actor} atravessou mais uma vez."
        ],
        analitico: [
          "Sobrevivência importante: {actor} ganha fôlego e reposiciona o jogo.",
          "{actor} sobreviver fortalece a narrativa de resistência no programa."
        ],
        debochado: [
          "Falaram que {actor} ia sair… e {actor} ficou. De novo. 😌",
          "{actor} já tá morando no Paredão e não paga aluguel."
        ],
        dramatico: [
          "O jogo tentou engolir {actor}. Mas hoje não.",
          "{actor} ficou por pouco… e isso muda tudo."
        ],
        torcida: [
          "ISSO! {actor} ficou! Agora é virar o jogo! 🙌",
          "O Brasil não largou {actor}! Bora crescer!"
        ]
      },
      house_target: {
        fofoca: [
          "{actor} virou o alvo do dia: {votes} votos! A casa fechou questão? 👀",
          "Do nada, {actor} recebeu {votes} votos… alguém explica essa combinação?"
        ],
        analitico: [
          "{actor} concentrou votos ({votes}). Sinal de que a casa tenta unificar alvo.",
          "Quando a casa junta {votes} votos em alguém, costuma ser recado claro: {actor} virou pauta."
        ],
        narrador: [
          "A casa falou alto: {actor} recebeu {votes} votos e entrou no radar.",
          "Com {votes} votos, {actor} passou de coadjuvante a foco."
        ],
        conspiracao: [
          "{votes} votos em {actor}… isso tem cara de acordo feito no escuro.",
          "Quando aparece {votes} votos assim, eu só penso: quem combinou?"
        ]
      },
      betrayal: {
        fofoca: [
          "{actor} votou em {target} e o ranço ficou explícito. Era aliado, hein 👀",
          "Traição no voto: {actor} largou {target} na hora H."
        ],
        analitico: [
          "Rompimento claro: {actor} quebra laço com {target} pra reposicionar alianças.",
          "{actor} sinaliza jogo próprio ao votar em {target}."
        ],
        debochado: [
          "Lealdade? {actor} não conhece. Votou em {target} e seguiu a vida 😬",
          "Acordo com {actor} dura até a próxima conversa. Pergunta pro {target}."
        ],
        narrador: [
          "Uma linha foi cruzada: {actor} votou em {target} e mudou a dinâmica.",
          "No momento decisivo, {actor} escolheu cortar {target}."
        ]
      },
      pop_surge: {
        fofoca: [
          "{actor} tá subindo lá fora! Popularidade +{delta}. O público acordou? 👀",
          "Atenção: {actor} cresceu +{delta} de popularidade na semana."
        ],
        analitico: [
          "Tendência de alta: {actor} ganhou +{delta} de popularidade e pode influenciar votos.",
          "{actor} cresce +{delta} e vira peça mais perigosa no jogo."
        ],
        torcida: [
          "É SOBRE ISSO: {actor} subiu +{delta}! O público tá vendo!",
          "{actor} em alta +{delta}. Vamo manter!"
        ]
      },
      pop_drop: {
        fofoca: [
          "{actor} despencou lá fora ({delta}). O ranço pegou? 😬",
          "O povo virou? {actor} caiu {delta} de popularidade…"
        ],
        analitico: [
          "Queda de imagem: {actor} perde {delta} e entra em zona de risco social.",
          "A perda ({delta}) indica que {actor} pode virar alvo fácil."
        ],
        debochado: [
          "{actor} achou que tava arrasando… {delta} de popularidade depois 😭",
          "A internet: 'não'. {actor}: {delta}."
        ]
      },
      close_call: {
        fofoca: [
          "{actor} se salvou no detalhe! Quase saiu e ficou por pouco 👀",
          "Foi por um triz: {actor} escapou e agora deve vir com sangue nos olhos."
        ],
        dramatico: [
          "{actor} encarou o abismo… e voltou. Isso é arco de campeão.",
          "Um detalhe separou {actor} da eliminação. Agora o jogo muda."
        ],
        analitico: [
          "Ficou por pouco: {actor} deve ganhar força de reação após um susto desses.",
          "Sobrevivência apertada costuma reorganizar alianças. {actor} tem janela pra virar o jogo."
        ]
      }

      ,
      underdog: {
        fofoca: [
          "{actor} tá virando especialista em sobreviver. Já escapou {count} vez(es) 👀",
          "Toda semana tentam… e {actor} continua. Esse arco tá ficando perigoso."
        ],
        narrador: [
          "{actor} atravessa pressão atrás de pressão e segue no jogo. Isso constrói trajetória.",
          "O enredo de {actor} é resistência: cai, levanta e continua."
        ],
        analitico: [
          "Sobrevivência repetida fortalece {actor}: ameaça social cresce quando a casa falha em eliminar.",
          "{actor} acumulou sustos ({count} sobrevivências) e agora pode capitalizar isso."
        ],
        torcida: [
          "É isso! {actor} não desiste nunca. Vamo! 🙌",
          "{actor} tá vivo(a) e isso é tudo. Bora virar!"
        ],
        debochado: [
          "{actor} já devia ter cartão fidelidade do Paredão 😭",
          "A casa: 'agora vai'. {actor}: 'kkkk fiquei' 😌"
        ]
      },
      betrayer: {
        fofoca: [
          "Olha… {actor} largou {target} sem piscar. Isso foi recado 👀",
          "A palavra 'lealdade' não mora com {actor}. Pergunta pro {target}."
        ],
        narrador: [
          "Uma ponte caiu: {actor} deixou {target} pra trás e o jogo sentiu.",
          "No voto, {actor} escolheu o próprio caminho e queimou {target}."
        ],
        analitico: [
          "{actor} faz corte estratégico ao romper com {target}. Risco: virar alvo depois.",
          "Quando {actor} vota contra {target}, manda sinal: alianças são descartáveis."
        ],
        debochado: [
          "{actor} prometeu e… votou em {target}. Nem disfarçou 😬",
          "Acordo com {actor} dura até acabar a conversa. {target} que o diga."
        ]
      },
      comp_run: {
        fofoca: [
          "{actor} tá embalad{X} nas provas. Sequência de {streak} semana(s) em alta 😤",
          "Quando {actor} começa a ganhar, a casa inteira fica nervosa."
        ],
        narrador: [
          "{actor} encontrou ritmo nas provas e passou a ditar o tom da semana.",
          "A temporada muda quando alguém engata vitórias. {actor} tá nesse caminho."
        ],
        analitico: [
          "Vitórias dão poder e proteção: {actor} entra em zona de controle (streak {streak}).",
          "Com desempenho alto em provas, {actor} reduz chances de ser alvo direto."
        ],
        torcida: [
          "SEGURA! {actor} tá gigante nas provas! 🙌",
          "{actor} no modo máquina. Vamo dominar!"
        ],
        debochado: [
          "A casa querendo derrubar e {actor} só ganhando prova 😭",
          "{actor} acordou e lembrou que prova existe."
        ]
      },
      social_hub: {
        fofoca: [
          "{actor} tá bem com todo mundo… e isso sempre dá medo 👀",
          "Se você não tá no papo de {actor}, você tá por fora do jogo."
        ],
        narrador: [
          "{actor} costura relações e vira ponto de encontro da casa.",
          "No silêncio, {actor} vai juntando peças e ganhando espaço."
        ],
        analitico: [
          "Jogo social forte: {actor} cria amortecedor contra votos e ganha informação.",
          "{actor} tende a influenciar decisões por estar no centro das conversas."
        ],
        debochado: [
          "{actor} conversa, sorri… e decide o voto. Clássico 😬",
          "Tem gente que vence prova. {actor} vence conversa."
        ]
      },
      mastermind: {
        narrador: [
          "{actor} tá jogando xadrez enquanto a casa joga dominó.",
          "O jogo de {actor} é de construção: peça por peça, semana por semana."
        ],
        analitico: [
          "{actor} mostra leitura de jogo e timing. Se continuar assim, vira favorit{X} de estratégia.",
          "Quando {actor} movimenta, a casa responde. Isso é influência real."
        ],
        fofoca: [
          "Eu não duvido que {actor} esteja puxando muita coisa por trás 👀",
          "Todo mundo acha que manda… mas olha quem tá sempre no centro: {actor}."
        ]
      },
      growth: {
        narrador: [
          "{actor} cresceu no jogo. De coadjuvante pra nome falado.",
          "A curva de {actor} é de ascensão: cada semana mais forte."
        ],
        analitico: [
          "{actor} está em alta e isso muda como a casa enxerga suas chances.",
          "Quando o momento vira, o jogo muda. {actor} tá aproveitando."
        ],
        torcida: [
          "{actor} ACORDOU! Agora sim! 🙌",
          "Era questão de tempo. {actor} tá crescendo!"
        ]
      },
      collapse: {
        narrador: [
          "{actor} perdeu tração e agora precisa reagir rápido.",
          "O jogo apertou e {actor} tá sentindo o peso."
        ],
        analitico: [
          "{actor} entra em fase de queda: risco aumenta quando a casa percebe fraqueza.",
          "Sequência ruim costuma virar bola de neve. {actor} precisa reposicionar."
        ],
        debochado: [
          "{actor} começou a semana confiante e terminou derretid{X} 😭",
          "A autoconfiança de {actor} foi morar no confessionário."
        ]
      }

    };

    const candidates = [];

    // Candidato especial: eliminação do dia (mesmo que o eliminado não esteja vivo)
    if (hasElimToday) {
      const outId = (ws?.eliminadoId != null) ? ws.eliminadoId : lastElimId;
      const out = state.players.find(x => String(x.id) === String(outId));
      if (out) {
        candidates.push({ p: out, recent: { round: state.week, type: 'eliminated', weight: 3, refs: { outId: out.id } }, base: 3, kind: 'eliminated' });
      }
    }

    for (const p of alive) {
      initNarrativeForPlayer(p, state.week);
      const tl = p.narrative.timeline || [];
      const recent = tl.slice().reverse().find(e => (state.week - Number(e.round || state.week)) <= 1 && Number(e.weight || 1) >= 2);
      if (recent) candidates.push({ p, recent, base: Number(recent.weight || 1) });

      const danger = Number(p.narrative.streaks?.danger || 0);
      const survCount = tl.filter(e => e.type === 'eviction_survived').length;
      if (danger >= 2 && survCount >= 1) candidates.push({ p, recent: null, kind: 'escape', base: 2 });

// Candidatos "evergreen" de arco (não dependem do dia específico)
const rep = p.narrative.reputation || {};
const betrayalCount = tl.filter(e => e.type === 'betrayal').length;
const winCount = Number(p.narrative.stats?.hohWins || 0) + Number(p.narrative.stats?.vetoWins || 0);
const winStreak = Number(p.narrative.streaks?.win || 0);
const mom = Number(p.narrative.momentum || 0);

if ((rep.underdog || 0) >= 6 || (danger >= 2 && survCount >= 1)) candidates.push({ p, recent: null, kind: 'underdog', base: 2.2, evergreen: true });
if (betrayalCount >= 2 || (rep.villain || 0) >= 6) candidates.push({ p, recent: null, kind: 'betrayer', base: 2.1, evergreen: true });
if (winStreak >= 2 || winCount >= 3 || (rep.compBeast || 0) >= 6) candidates.push({ p, recent: null, kind: 'comp_run', base: 2.0, evergreen: true });
if ((rep.social || 0) >= 6) candidates.push({ p, recent: null, kind: 'social_hub', base: 1.9, evergreen: true });
if ((rep.strategist || 0) >= 7) candidates.push({ p, recent: null, kind: 'mastermind', base: 1.8, evergreen: true });
if (mom >= 3) candidates.push({ p, recent: null, kind: 'growth', base: 1.7, evergreen: true });
if (mom <= -3) candidates.push({ p, recent: null, kind: 'collapse', base: 1.7, evergreen: true });
    }

    const topicMap = (t) => {
      if (t === 'nomination') return 'target';
      if (t === 'eviction_survived') return 'escape';
      if (t === 'danger' || t === 'close_call') return 'close_call';
      if (t === 'house_target') return 'house_target';
      if (t === 'betrayal') return 'betrayal';
      if (t === 'pop_surge') return 'pop_surge';
      if (t === 'pop_drop') return 'pop_drop';
      if (t === 'eliminated') return 'eliminated';
      return null;
    };

    const pickTone = (topic) => {
      const options = [];
      for (const tone of TONES) {
        const pool = templates[topic]?.[tone];
        if (!pool || !pool.length) continue;
        let s = 10;
        s -= tonePenalty(tone);
        s -= topicPenalty(topic);
        if (meta.recentTones.slice(-2).includes(tone)) s -= 2;
        options.push({ tone, s });
      }
      options.sort((a,b)=>b.s-a.s);
      return options[0]?.tone || 'narrador';
    };

    const buildFacts = (p, recent, topic) => {
      const actor = fmtName(p);
      const facts = { actor, round: String(state.week), again: '', detail: '' };
      const tl = p.narrative.timeline || [];

      if (topic === 'eliminated') {
        // Aqui p é o eliminado (pode não estar vivo)
        facts.out = actor;
      }

      if (topic === 'target') {
        const tid = recent?.refs?.targetId;
        const t = tid ? state.players.find(x => x.id === tid) : null;
        facts.target = t ? fmtName(t) : 'alguém';
        const rep = Number(recent?.refs?.repeat ?? 0);
        facts.again = rep >= 1 ? ' de novo' : '';
        facts.detail = rep >= 2 ? ' (já virou padrão)' : '';
      }

      if (topic === 'escape') {
        const surv = tl.filter(e => e.type === 'eviction_survived').length;
        facts.count = String(Math.max(1, surv));
      }

      if (topic === 'house_target') facts.votes = String(recent?.refs?.votes ?? 'muitos');

      if (topic === 'betrayal') {
        const tid = recent?.refs?.targetId;
        const t = tid ? state.players.find(x => x.id === tid) : null;
        facts.target = t ? fmtName(t) : 'alguém';
      }

      if (topic === 'pop_surge' || topic === 'pop_drop') {
        const d = recent?.refs?.delta;
        facts.delta = (d != null) ? String(d) : '';
      }

      if (topic === 'underdog') {
        const surv = tl.filter(e => e.type === 'eviction_survived').length;
        facts.count = String(Math.max(1, surv));
      }

      if (topic === 'betrayer') {
        const last = tl.slice().reverse().find(e => e.type === 'betrayal');
        const tid = last?.refs?.targetId;
        const t = tid ? state.players.find(x => x.id === tid) : null;
        facts.target = t ? fmtName(t) : 'alguém';
      }

      if (topic === 'comp_run') {
        facts.streak = String(Number(p.narrative.streaks?.win || 1));
        facts.X = suf(p);
      }

      if (topic === 'social_hub' || topic === 'mastermind' || topic === 'growth' || topic === 'collapse') {
        facts.X = suf(p);
      }

      return facts;
    };

    const norm = candidates.map(c => {
      const topic = c.kind ? c.kind : topicMap(c.recent?.type);
      return topic ? { ...c, topic } : null;
    }).filter(Boolean);

    // Filtro contextual por dia (prova/eliminação/paredão etc.)
    const normFiltered = allowedTopics ? norm.filter(x => allowedTopics.has(x.topic)) : norm;

    normFiltered.sort((a,b)=>b.base-a.base);

    const picked = [];
    const usedPlayers = new Set();

    const tryPick = (c) => {
      if (!c) return false;
      if (picked.length >= max) return false;
      if (usedPlayers.has(c.p.id)) return false;
      const last = meta.lastByPlayer?.[c.p.id];
      if (last != null && (state.week - last) <= 0) return false;

      const tone = pickTone(c.topic);
      const pool = templates[c.topic]?.[tone] || [];
      if (!pool.length) return false;

      const tpl = pickOne(pool);
      const facts = buildFacts(c.p, c.recent, c.topic);
      const txt = render(tpl, facts).trim();
      if (!txt) return false;

      picked.push({ text: txt, topic: c.topic, tone, playerId: c.p.id });
      usedPlayers.add(c.p.id);
      pushHistory(c.topic, tone, c.p.id);
      return true;
    };

    // 1) Garante pelo menos 1 tweet "evergreen" de arco por dia, quando existir candidato.
    const arcPool = normFiltered.filter(x => x.evergreen).slice().sort((a,b)=>b.base-a.base);
    const eventPool = normFiltered.filter(x => !x.evergreen);

    if (max >= 1) {
      for (const c of arcPool) { if (tryPick(c)) break; }
    }

    // 2) Preenche o restante com os melhores (evento ou arco), respeitando diversidade.
    for (const c of [...eventPool, ...arcPool]) {
      if (picked.length >= max) break;
      tryPick(c);
    }

    return picked.map(x => x.text);
  }

// compat: util simples usado por algumas dinâmicas (ex.: Sincerão)
  function randomPick(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[rndInt(0, arr.length - 1)];
  }

  const SPECIAL_FIGHT_REASONS = [
    "vantagem injusta",
"exclusão social",
"traição no jogo",
"fofoca exposta",
"ciúme",
"desequilíbrio nas tarefas",
"crítica à aparência",
"crítica a comportamento",
"quebra de confiança",
"disputa de liderança",
"discriminação",
"alegação de fingimento",
"reação a provocações",
"disputa de atenção",
"desrespeito a crenças",
"falsa moralidade",
"trapaça em provas",
"egoísmo com comida/bebida",
"inveja explícita",
"manipulação emocional",
"humilhação pública",
"desleixo na limpeza",
"barulho excessivo",
"uso indevido de objetos pessoais",
"comida roubada",
"banheiro sujo",
"comida estragada",
"falta de água",
"ronco perturbadoe",
"uso do ofurô",
"andar de sunga branca",
"espaço pessoal desrespeitado",
"hábitos de higiene questionáveis",
"falta de reciprocidade",
"piadas ofensivas",
"comportamento na cozinha",
"acúmulo de louça",
"cocô escorrendo na parede",
"divisão de tarefas",
"desperdício de recursos"
  ];

  const pickOne = (arr, fallback='') => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : fallback);
  const pickMany = (arr, n) => {
    if (!Array.isArray(arr) || n <= 0) return [];
    const a = arr.slice();
    // Fisher-Yates parcial: embaralha só o necessário
    for (let i = 0; i < n && i < a.length; i++) {
      const j = i + Math.floor(Math.random() * (a.length - i));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    a.length = Math.min(n, a.length);
    return a;
  };

  /* ===== Quartos (tags) ===== */
  const ROOM_PAIRS = [
    // Elementos Naturais e Fenômenos
    'Neve ❄️ x Fogueira 🔥',           // Neve é branca/clara, Fogueira brilha no escuro
    'Alvorada 🌅 x Crepúsculo 🌇',     // O nascer do sol vs o cair da noite
    'Geleira 🧊 x Vulcão 🌋',          // O gelo claro vs o magma/pedra escura
    'Sol ☀️ x Lua 🌙',                 // O brilho do dia vs a noite
    'Cristal 💎 x Ferro ⛓️',           // Transparência vs metal pesado
    'Diamante 💍 x Carvão ⚫',         // Brilho puro vs preto profundo
    'Nuvem ☁️ x Abismo 🕳️',            // (Extra sugerido pela lógica)

    // Espaços e Arquitetura
    'Catedral ⛪ x Labirinto 🌀',      // Tetos altos e luz vs corredores sombrios
    'Ateliê 🎨 x Laboratório 🧪',      // Luz natural para pintar vs luz controlada/fria
    'Torre 🏰 x Catacumba 💀',         // O ponto mais alto vs o subterrâneo
    'Balão 🎈 x Túnel 🚇',             // O céu aberto vs o confinamento escuro
    'Praia 🏖️ x Montanha ⛰️',          // Areia clara vs sombras de pedra/pinheiros
    'Refúgio 🏡 x Masmorra ⛓️‍💥',        // (Ajustado para o sentido de proteção clara)

    // Conceitos e Sociedade
    'Sonho 💭 x Realidade 🧱',         // O etéreo vs o "pé no chão" pesado
    'Pureza 🤍 x Corrupção 🖤',        // O branco imaculado vs a mancha escura
    'Sagrado 👼 x Profano 😈',         // Luz divina vs sombras mundanas
    'Nobreza 👑 x Favela 🏘️',          // Ouro/Luz vs concreto/noite
    'Coroa 👸 x Chão de Fábrica 🏭',   // Brilho do poder vs fuligem do trabalho
    'Trono 🪑 x Trincheira 💂',        // O alto comando vs a lama da guerra
    'Vintage 📻 x Cyber 🤖',           // Tons pastéis vs neon sobre fundo preto

    // Comportamento e Estilo
    'Alegria 😊 x Melancolia 😢',      // Expressão aberta vs introspecção
    'Carnaval 🎭 x Retiro 🧘',          // Cores vibrantes vs silêncio e penumbra
    'Poesia 📜 x Prosa ✍️',            // A leveza das rimas vs o peso do texto
    'Minimalista ⚪ x Barroco ⚜️',     // Espaço vazio/claro vs excesso e sombras
    'Paz 🕊️ x Caos 💥',                // Ordem clara vs desordem densa
    'Digital 💻 x Analógico 📼',       // Telas claras vs fita magnética/vinil escuro
    'Barbie 🎀 x Oppenheimer ☢️',
    'Beehive 🐝 x Little Monster ⚡',
    'Twink ✨ x Daddy 🧔',
    'Passivos 🍑 x Ativos 🍆',
    'Golden Retriever 🦮 x Black Cat 🐈‍⬛',
    'Pop 🎤 x Punk 🎸',
    'Clean Girl 🧴 x Emo 🖤',
    'Clean Girl 🧴 x Emo 🖤',
    'Terapia 🛋️ x Surto 🤯',
    'Herdeiro 💰 x CLT 📝',
    'Anapuru 🛖 x Cariri 🌵',
	 'Bingo 👵 x Coven 🌙',
    'Faria Lima 👔 x Santa Cecília 🎨',
    'Rosa 🩷 x Azul 💙',
    'Yang ⚫ x Yin ⚪',
    'Nordeste ☀️ x Sul ❄️',
    'Bakunin 🏴 x Marx 🚩',
    'Frida 🌺 x Tarsila 🖼️',

    'Igreja ⛪ x Terreiro 🕯️',
    'Fazenda 🚜 x Praia 🌊',
      
    'Realidade 👓 x Fantasia 🦄',
    'Utopia 🌈 x Distopia 🌪️',
    'Listrado 🦓 x Bolinhas 🐆',
    
    // Outros pares ajustados pelo contraste:
    'Selva 🍃 x Metrópole 🏙️',         // Se considerar a metrópole como "asfalto/noite"
    'Brinquedoteca 🧸 x Escritório 💼', 
    'Magia 🪄 x Ciência 🔬',           // O brilho do feitiço vs o rigor do metal
    'Cosmos 🌌 x Submundo 👹',          // Estrelas no vazio vs as profundezas da terra
	  // Novos pares sugeridos:
    'Supernova 💥 x Buraco Negro 🕳️',
    'Vagalume 💡 x Morcego 🦇',
    'Renascimento 🎨 x Idade das Trevas 🏰',
    'Mármore 🏛️ x Obsidiana 🗿',
    'Olimpo ⚡ x Hades 🔱',
    'Vogue 👠 x Underground ⛓️',
    'Disco 🕺 x Techno 🎧',
    'Vapor 💨 x Alcatrão 🛢️',
    'Aurora Boreal 🎇 x Eclipse 🌑',
	  // Memes, Brasil e Caos
    'Cacto 🌵 x Lollipop 🍭',           // O brilho do deserto vs o quarto colorido/sombrio
    'Calma 🧊 x Calabreso 👺',         
    'Xepa 🥘 x VIP 🥂',
    'São João 🌽 x Natal 🎄',
    'Guaraná 🥤 x Café ☕',
    'Garantido 🔴 x Caprichoso 🔵',
	  'Samba 🥁 x Rock 🤘',
    'Jedis 🟦 x Siths 🟥',
    'Glinda 💖 x Elphaba 💚',
	  'Iara 🧜‍♀️ x Boto 🐬',
    'Curupira 🪵 x Caipora 🐗',
    'Valhala ⚔️ x Helheim ❄️',
	  'Quetzalcóatl 🐍 x Tezcatlipoca 🐆',
    'Oásis 🌴 x Deserto 🏜️',
    'Sakura 🌸 x Katana ⚔️',
    'Machu Picchu ⛰️ x Xibalba 💀',
	  'País das Maravilhas 🍄 x Oz 🌪️',
    'Fábrica de Chocolate 🍬 x Castelo do Drácula 🧛',
    'Pequeno Príncipe 🌹 x Duna 🏜️',
    'Terra do Nunca 🧚 x Terra Média 🏔️',
    'Star Trek 🖖 x Alien 👽',
    'Mary Poppins ☂️ x Pennywise 🤡',
	  'Avatar 🌳 x Mad Max ⛓️',
	  'Leblon ☕ x Pantanal 🐆',
    'Marrocos 🕌 x Índia 🐘',
    'Greenville 🌵 x Avilan 🏰',
    'Santana do Agreste 🌵 x Serro Azul ⛲',
    'Boate Love 🌃 x Confeitaria 🍰',
    'Lixão 🏠 x Mansão 💎',
    'Cinderela 👠 x Fantasma da Ópera 🎭',
    'Detetive 🔍 x Assassino 🔪',
	  'Razão 🧠 x Emoção ❤️',
	  'Esmeralda 🐍 x Rubi 🍷',
  'Violeta 👾 x Lima 🔋',
  'Marfim 🦴 x Ônix 🌑',
  'Gelo 🧊 x Brasa 🔥',
  'Rosa Choque 🎀 x Petróleo 🛢️',
  'Pérola 🐚 x Grafite ⚙️',
  'Turquesa 🌊 x Coral 🪸',
    'Nárnia 🦁 x Westeros ⚔️',
    'Lótus 🪷 x Lama 🌑',
	  'Branco ⚪️ x Preto⚫️',
    'Dragão 🐉 x Tigre 🐅',
    'Nilo 💧 x Pirâmide ⚰️',
    'Esparta 🛡️ x Atenas 📜',
    'Piratas 🏴‍☠️ x Marinha ⚓',
    'Saara 🐪 x Antártida 🧊',
    'França 🍷 x Inglaterra ☕',
    'Samurai ⚔️ x Ninja 👤',
    'Olimpo ⚡ x Hades 🔱',
    'Fênix 🔥 x Leviatã 🌊',
    'Uirapuru 🐦 x Urutau 👻',
    'Brasília 🏛️ x Ouro Preto ⛪',
    'Fofoca 🗣️ x Segredo 🤫',
    'Rio de Janeiro 🏖️ x São Paulo ☁️',
    'Crente 😇 x Sadomaso ⛓️',
	  'Nicole Bahls 🦜 x Inês Brasil 🐆',
	  // Ícones das Novelas (Luz vs. Sombra)
    'Nina 🍚 x Carminha 💎',            // O lixo/simplicidade vs. a riqueza/falsidade
    'Maria do Carmo 🧺 x Nazaré 🦊',    // A mãe sofredora/batalhadora vs. a raposa loura
    'Ruth 👼 x Raquel 🍷',              // A gêmea boa/doce vs. a gêmea má/sedutora
    'Flora 🌻 x Donatela 🖤',           // A "santinha" falsa vs. a "vilã" injustiçada
    'Bebel 👗 x Olavo 💼',              // "Catitinha" vs. "Cueca de seda"
    'Jade 🕌 x Maysa 🍸',               // A dança/sol do Marrocos vs. a melancolia/luxo de SP
    'Helena ☕ x Branca Letícia 😈',    // A paz do café da manhã vs. o caos da discórdia
	  // Estéticas de Design e Decoração
    'Escandinavo 🪵 x Industrial 🧱',    // Madeira clara/branco vs. Ferro/tijolo escuro
    'Provençal 🌸 x Gótico 🕸️',          // Flores e tons pastel vs. Veludo e preto
    'Zen 🧘 x Cyberpunk ⚡',             // Bambu e luz natural vs. Neon e metal
    'Náutico ⚓ x Taberna 🍺',            // Azul e branco vs. Madeira escura e penumbra
    'Algodão ☁️ x Veludo 🍷',             // Leveza branca vs. Densidade bordô
    'Boho 🧶 x Brutalista 🗿',            // Tecidos crus vs. Concreto exposto
    'Safari 🦒 x Caverna 🔦',            // Tons de areia vs. Pedras escuras
    'Aquarela 🎨 x Grafite 👨‍🎨',          // Transparência vs. Traços fortes e escuros
    'Palha 🧺 x Ébano 🪵',                // Fibra natural clara vs. Madeira nobre preta
    'Holográfico 💿 x Fosco ⚫',          // Brilho furtacor vs. Ausência de reflexo
    
    // Brasil e Regionalismo Decorativo
    'Rendado 🧶 x Cordel 📜',            // Branco da renda vs. Preto e branco da xilogravura
    'Casarão 🏛️ x Sobrado 🏡',
    'Varanda 🍃 x Sótão 📦',   
    'Jardim de Inverno 🌿 x Adega 🍷',   // Plantas e claridade vs. Subterrâneo e vinho
    'Rede 🧶 x Poltrona 🛋️'
];

  function ensureRoomsState() {
    state.rooms = state.rooms || { pair: null, colors: { A: null, B: null }, assigned: false };
    state.rooms.colors = state.rooms.colors || { A: null, B: null };
    if (state.rooms.assigned === undefined) state.rooms.assigned = false;
  }

  function splitRoomPair(pair) {
    const s = String(pair || '').split(' x ');
    return [String(s[0] || 'Quarto A').trim(), String(s[1] || 'Quarto B').trim()];
  }

  function roomSideLabel(side) {
    ensureRoomsState();
    const [a, b] = splitRoomPair(state.rooms.pair || 'Quarto A x Quarto B');
    return side === 'A' ? a : b;
  }

  function pickRoomColors(pair) {
    const [a, b] = splitRoomPair(pair);
    const k = (x) => String(x).toLowerCase();

    const LIGHT = {
      'sol': '#fff0a6',
      'praia': '#bfe8ff',
      'geleira': '#d9f2ff',
      'doce': '#ffe0f0',
      'herói': '#dfffe3',
      'catedral': '#efe7ff',
      'diamante': '#e8fbff',
      'sagrado': '#fff1c9',
      'cristal': '#e8f6ff',
      'alvorada': '#ffe7c7',
      'poesia': '#efeaff',
      'barroco': '#ffe6cc',
      'balão': '#f3e8ff',
      'neve': '#eaf6ff',
      'cosmos': '#e8dcff',
      'vanguarda': '#d9f2ff',
      'ciência': '#d9f2ff'
    };
    const DARK = {
      'lua': '#171a2b',
      'montanha': '#1b2328',
      'cyber': '#12141b',
      'vulcão': '#2b1414',
      'labirinto': '#10131c',
      'favela': '#1a1a1a',
      'carvão': '#0f0f12',
      'azedo': '#1b2a12',
      'vilão': '#2a0f1c',
      'realidade': '#16181e',
      'boate': '#180f2a',
      'retiro': '#0f1c16',
      'laboratório': '#0e1320',
      'escritório': '#101820',
      'despojo': '#121212',
      'segredo': '#0b0c10',
      'profano': '#2a130f',
      'ferro': '#101418',
      'chão de fábrica': '#131313',
      'caça': '#1a2415',
      'fortaleza': '#121417',
      'magia': '#140f22',
      'improviso': '#1b0f14',
      'paixão': '#2a0f0f',
      'circo': '#2a180f',
      'ruína': '#141414',
      'corrupção': '#2a0f1a',
      'melancolia': '#0f1320',
      'ermo': '#0f1411',
      'exibido': '#2a1230',
      'xadrez': '#0f1216',
      'pop': '#2a0f28',
      'crepúsculo': '#10101a',
      'prosa': '#10151a',
      'trincheira': '#1a1a1f',
      'vazio': '#0b0c10',
      'túnel': '#0f1014',
      'submundo': '#0b0c10',
      'estratégia': '#10131c',
      'razão': '#10131c'
    };

    const pickTok = (name, map) => {
      const kk = k(name);
      for (const tok in map) {
        if (kk.includes(tok)) return map[tok];
      }
      return null;
    };

    const aL = pickTok(a, LIGHT);
    const bL = pickTok(b, LIGHT);
    const aD = pickTok(a, DARK);
    const bD = pickTok(b, DARK);

    const light = aL || bL || '#e8f6ff';
    const dark = bD || aD || '#1a1d27';
    return { A: light, B: dark };
  }

  function applyRoomCssVars() {
    ensureRoomsState();
    const root = document.documentElement;
    const A = state.rooms.colors?.A || '#e8f6ff';
    const B = state.rooms.colors?.B || '#1a1d27';
    root.style.setProperty('--roomA-bg', A);
    root.style.setProperty('--roomA-br', A);
    root.style.setProperty('--roomA-tx', '#001018');
    root.style.setProperty('--roomB-bg', B);
    root.style.setProperty('--roomB-br', B);
    root.style.setProperty('--roomB-tx', '#e8e8ea');
  }

  function seedRoomAffinity() {
    const alive = alivePlayers();
    if (alive.length < 2) return;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const A = alive[i];
        const B = alive[j];
        if (!A?.status?.room || !B?.status?.room) continue;
        if (A.status.room === B.status.room) relAdd(A.id, B.id, 0.12);
        else relAdd(A.id, B.id, -0.08);
      }
    }
  }

  function assignRoomsDay1(meta) {
    ensureRoomsState();
    if (state.rooms.assigned) {
      applyRoomCssVars();
      return;
    }
    const alive = alivePlayers();
    if (alive.length < 2) return;

    state.rooms.pair = pickOne(ROOM_PAIRS);
    state.rooms.colors = pickRoomColors(state.rooms.pair);

    const shuffled = alive.slice().sort(() => Math.random() - 0.5);
    const half = Math.floor(shuffled.length / 2);
    shuffled.forEach((p, i) => { p.status.room = (i < half) ? 'A' : 'B'; });
    state.rooms.assigned = true;

    applyRoomCssVars();

    const [a, b] = splitRoomPair(state.rooms.pair);
   dayAdd(`
  <div class="bigSetupBox">

    <div class="setupText">
      🛏️ Os jogadores se distribuem pela casa, avaliam os espaços e escolhem onde dormir. 🛏️
    </div>

    <div class="setupNote">
      Esses quartos podem determinar amizades e rivalidades da temporada.
    </div>
    <div class="setupRoomsRow">
      <div class="setupRoom light">
       <strong>${escapeHtml(a)}</strong>
      </div>

      <div class="setupRoom dark">
        <strong>${escapeHtml(b)}</strong>
      </div>
    </div>

  </div>
`);


    seedRoomAffinity();
  }

  function maybeRebalanceRooms(meta) {
    ensureRoomsState();
    if (!state.rooms.assigned) return;
    const alive = alivePlayers();
    const A = alive.filter(p => p.status.room === 'A');
    const B = alive.filter(p => p.status.room === 'B');
    if (A.length === B.length) return;

    const from = A.length > B.length ? 'A' : 'B';
    const to = from === 'A' ? 'B' : 'A';

    if (Math.random() >= 0.10) return;

    const pool = alive.filter(p => p.status.room === from);
    if (!pool.length) return;
    const mover = pickOne(pool);
    mover.status.room = to;

    const fromLabel = roomSideLabel(from);
    const toLabel = roomSideLabel(to);
    dayAdd(`
  <div class="dayCard evNeu">
    <span style="flex:1; min-width:0;">
      <strong>🛏️ 🔁 🛏️ ${escapeHtml(displayName(mover))}</strong>: troca de quarto (${escapeHtml(fromLabel)} → ${escapeHtml(toLabel)}).
    </span>
  </div>
`);
   
  }

  function inSameRoom(aId, bId) {
    const A = state.players.find(p => p.id === aId);
    const B = state.players.find(p => p.id === bId);
    const ra = A?.status?.room;
    const rb = B?.status?.room;
    return !!(ra && rb && ra === rb);
  }

  // Evento especial de convivência: briga grande que mexe bastante em popularidade e rejeição.
  // Chance fixa: 5% por dia.
  function maybeSpecialFightEvent(ctx) {
    const alive = alivePlayers();
    if (alive.length < 2) return false;
    if (Math.random() >= 0.02) return false;

    const reason = pickOne(SPECIAL_FIGHT_REASONS);
    const n = rndInt(2, Math.min(5, alive.length));
    const group = pickMany(alive, n);

    // Papéis: 1 agressor, 1 alvo, resto envolvidos/plateia
    const aggressor = group[0];
    const target = group[1];
    const others = group.slice(2);

    // Impactos fortes
    bump(aggressor, { pop: -rnd(1.2, 2.2), alvo: rnd(0.2, 0.7) });
    applyRejection(aggressor, +rnd(1.4, 2.8));

    bump(target, { pop: +rnd(0.8, 1.8), alvo: -rnd(0.1, 0.4) });
    applyRejection(target, -rnd(0.2, 0.9));

    others.forEach((p) => {
      bump(p, { pop: rnd(-0.6, 0.6), alvo: rnd(-0.2, 0.3) });
      applyRejection(p, rnd(-0.2, 0.9));
    });

    // Relações: a briga deixa marcas
relAdd(aggressor.id, target.id, -rndInt(8, 16));
    relAdd(target.id, aggressor.id, -rndInt(3, 9));

    others.forEach((p) => {
      relAdd(p.id, aggressor.id, -rndInt(2, 8));
      relAdd(aggressor.id, p.id, -rndInt(1, 6));
      relAdd(p.id, target.id, rndInt(-2, 4));
    });

    // Sinaliza para a narrativa do dia (Xuitter)
    state.weekState = state.weekState || {};
    state.weekState.bigFight = {
      reason,
      ids: group.map(p => p.id),
      aggressorId: aggressor.id,
      targetId: target.id
    };

    // Log visual grande
    const namesArr = group.map((p) => escapeHtml(displayName(p)));

let who;
if (namesArr.length === 2) {
  who = `${namesArr[0]} e ${namesArr[1]}`;
} else {
  who = `${namesArr.slice(0, -1).join(", ")} e ${namesArr[namesArr.length - 1]}`;
}

dayAdd(
  `<div class="bigFightBox">🔥 🔥 ${who} brigam por <strong>${escapeHtml(reason)}</strong> 🔥 🔥</div>`
);

    return true;
  }

  // Momento de vulnerabilidade: alguém se abre e ganha empatia.
  // Chance: 2% por dia.
  function maybeVulnerabilityMoment(ctx) {
    const alive = alivePlayers();
    if (alive.length < 2) return false;
    if (Math.random() >= 0.02) return false;

    // Escolhe quem vai se abrir (puxa mais para quem está em risco/rejeição)
    const weighted = alive.map((p) => {
      const w = 1 + (p.attrs.rejeicao ?? 0) * 0.35 + (p.status.alvo ?? 0) * 0.25 + (p.status.strikes ?? 0) * 0.35;
      return { p, w: Math.max(0.1, w) };
    });
    const who = pickWeighted(weighted);
    const others = alive.filter((p) => p.id !== who.id);
    if (!others.length) return false;

    // Listener: tende a ser alguém com boa relação
    const listener = others
      .slice()
      .sort((a, b) => relGet(who.id, b.id) - relGet(who.id, a.id))[0];

    bump(who, { pop: rnd(0.25, 0.55), alvo: -rnd(0.05, 0.20) });
    applyRejection(who, -rnd(0.25, 0.75));
    if (listener) {
      bump(listener, { pop: rnd(0.05, 0.20) });
      relAdd(who.id, listener.id, +rnd(0.6, 1.2), "intimo");
      relAdd(listener.id, who.id, +rnd(0.3, 0.8), "intimo");
    }

    dayAdd(`
      <div class="dayCard evNeu">
        <span style="flex:1; min-width:0;">🥺 <strong>${escapeHtml(displayName(who))}</strong> se abre${listener ? ` com <strong>${escapeHtml(displayName(listener))}</strong>` : ''} e mostra vulnerabilidade.</span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
      </div>
    `);

    try {
      applyNarrativeEvent({ type: 'vulnerability', actorId: who.id, targetId: listener?.id, round: state.week, meta: { weight: 2 } });
    } catch { /* ignora */ }

    return true;
  }

  // Amizade inquebrável: um laço vira "marca" do jogo.
  // Chance: 2% por dia.
  function maybeUnbreakableFriendship(ctx) {
    const alive = alivePlayers();
    if (alive.length < 2) return false;
    if (Math.random() >= 0.02) return false;

    // Pega pares com relação alta
    const pairs = [];
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const A = alive[i], B = alive[j];
        const s = (relGet(A.id, B.id) + relGet(B.id, A.id)) / 2;
        if (s >= 2.8) pairs.push({ A, B, s });
      }
    }
    if (!pairs.length) return false;
    pairs.sort((a, b) => b.s - a.s);
    const pick = pairs[0];

    bump(pick.A, { pop: rnd(0.10, 0.30) });
    bump(pick.B, { pop: rnd(0.10, 0.30) });
    relAdd(pick.A.id, pick.B.id, +rnd(0.7, 1.4), "intimo");
    relAdd(pick.B.id, pick.A.id, +rnd(0.7, 1.4), "intimo");

    dayAdd(`
      <div class="dayCard evNeu">
        <span style="flex:1; min-width:0;">🤝 <strong>${escapeHtml(displayName(pick.A))}</strong> e <strong>${escapeHtml(displayName(pick.B))}</strong> firmam uma amizade que parece inquebrável.</span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
      </div>
    `);

    try {
      applyNarrativeEvent({ type: 'friendship', actorId: pick.A.id, targetId: pick.B.id, round: state.week, meta: { weight: 2 } });
      applyNarrativeEvent({ type: 'friendship', actorId: pick.B.id, targetId: pick.A.id, round: state.week, meta: { weight: 2 } });
    } catch { /* ignora */ }

    return true;
  }

  const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  // ===== Linguagem inclusiva / concordancia de genero =====
  // g(p,{M:'vencedor',F:'vencedora',O:'vencedore'})
  function g(p, forms) {
    if (!forms) return '';
    const key = (p && p.gender) ? p.gender : 'O';
    return forms[key] ?? forms.O ?? '';
  }

  // Template simples para concordância de gênero dentro de strings.
  // Uso:
  // - {a:masc|fem|neutro} -> escolhe pelo gênero do participante A
  // - {b:masc|fem|neutro} -> escolhe pelo gênero do participante B
  // - {ab:masc|fem|neutro} -> escolhe pelo gênero de A (para pares, use neutro quando preferir)
  function genderizeText(text, a, b) {
    let s = String(text ?? '');
    const rep = (who, formsStr) => {
      const parts = String(formsStr || '').split('|');
      const m = parts[0] ?? '';
      const f = parts[1] ?? parts[0] ?? '';
      const o = parts[2] ?? parts[1] ?? parts[0] ?? '';
      return g(who, { M: m, F: f, O: o });
    };
    s = s.replace(/\{a:([^}]+)\}/g, (_, forms) => rep(a, forms));
    s = s.replace(/\{b:([^}]+)\}/g, (_, forms) => rep(b, forms));
    s = s.replace(/\{ab:([^}]+)\}/g, (_, forms) => rep(a, forms));
    return s;
  }

  // pronome sujeito para citar participantes no formato (He/She/They)
  function pronounTag(p) {
    const key = (p && p.gender) ? p.gender : 'O';
    const pr = key === 'M' ? 'He' : (key === 'F' ? 'She' : 'They');
    return `(${pr})`;
  }

function statusLabel(p) {
  if (!p || !p.status || p.status.alive) return "";

  const tag = p.status.elimTag;

  if (tag === "expulso") {
    return g(p, { M: "Expulso", F: "Expulsa", O: "Expulse" });
  }

  if (tag === "desistente") {
    return "Desistente";
  }

  return g(p, { M: "Eliminado", F: "Eliminada", O: "Eliminade" });
}

  // artigo definido para construcoes do tipo: foi ${art(p)} ${g(...)}
  function art(p) {
    const key = (p && p.gender) ? p.gender : 'O';
    return key === 'M' ? 'o' : 'a';
  }

  const pickWeighted = (items) => {
    const total = items.reduce((s, x) => s + Math.max(0, x.w), 0);
    if (total <= 0) return items[Math.floor(Math.random() * items.length)].item;
    let r = Math.random() * total;
    for (const x of items) {
      r -= Math.max(0, x.w);
      if (r <= 0) return x.item;
    }
    return items[items.length - 1].item;
  };

  // ===== Sexualidade (atributo oculto) =====
  // gayScore: 0..10 (M/F). 0=hetero (crush so em genero oposto e n-b). 10=gay (crush so no mesmo genero e n-b).
  // Distribuicao enviesada: 0..3 >=50% e 8..10 <=10%.
  function sampleGayScore() {
    const weights = [
      { item: 0,  w: 18 },
      { item: 1,  w: 14 },
      { item: 2,  w: 10 },
      { item: 3,  w:  8 },
      { item: 4,  w:  6 },
      { item: 5,  w:  5 },
      { item: 6,  w:  4 },
      { item: 7,  w:  3 },
      { item: 8,  w:  2 },
      { item: 9,  w: 1.5 },
      { item: 10, w: 1.5 }
    ];
    return pickWeighted(weights);
  }

  function gayScoreOf(p) {
    const g = p?.gender;
    if (g !== 'M' && g !== 'F') return null;
    const v = p?.secret?.gayScore;
    if (!Number.isFinite(v)) return 0;
    return clamp(v, 0, 10);
  }

  // 0..1: compatibilidade de atração considerando sexualidade
  function sexuality01(source, target) {
    if (!source || !target) return 1;
    const sg = source.gender;
    const tg = target.gender;
    // n-b nao entra na logica: sempre conta como permitido
    if (sg === 'O' || tg === 'O') return 1;
    if (sg !== 'M' && sg !== 'F') return 1;
    if (tg !== 'M' && tg !== 'F') return 1;

    const gay = (gayScoreOf(source) ?? 0) / 10; // 0..1
    const same = (sg === tg);
    return same ? gay : (1 - gay);
  }

  // 0..1: afinidade por idade (quanto mais distante, mais difícil virar crush)
  function ageAffinity01(source, target) {
    const a = normalizeAge(source?.age);
    const b = normalizeAge(target?.age);
    if (a == null || b == null) return 1;
    const d = Math.abs(a - b);
    // degraus simples e previsíveis (sem bloquear totalmente)
    if (d <= 3) return 1.00;
    if (d <= 8) return 0.85;
    if (d <= 15) return 0.60;
    if (d <= 25) return 0.35;
    return 0.20;
  }

  // 0..1: atração total (sexualidade x idade)
  function attraction01(source, target) {
    return clamp(sexuality01(source, target) * ageAffinity01(source, target), 0, 1);
  }

  // Regra de permissão: baseada apenas na sexualidade.
  // (A idade entra como dificuldade, não como bloqueio.)
  function crushAllowed(source, target) {
    return sexuality01(source, target) > 0.02;
  }

  function sexualityEmoji(p) {
    const g = p?.gender;
    if (g !== 'M' && g !== 'F') return '';
    const s = gayScoreOf(p);
    if (s == null) return '';
    if (s <= 3) return '⚤';
    if (s >= 8) return '🏳️‍🌈';
    return '';
  }

  // ===== Emojis sociais (baseado em relacoes entre jogadores ainda na casa) =====
  function socialEmojiString(p) {
  if (!p || !p.id || !p.status?.alive) return "";

  const alive = alivePlayers();
  const aliveSet = new Set(alive.map(x => x.id));

  let friends = 0;                 // p -> outros (amigos que p tem)
  let rivals = 0;                  // p -> outros (desafetos que p tem)
  let incomingEnemies = 0;         // outros -> p (quem considera p inimigo)
  let hasReciprocalCrush = false;

  // 1) Contagens baseadas em p -> outros (friends/rivals) e crush recíproco
  const relsOut = state.relations?.[p.id] || {};
  for (const otherId in relsOut) {
    if (!aliveSet.has(otherId)) continue;
    if (otherId === p.id) continue;

    const scoreOut = relGet(p.id, otherId);

    if (scoreOut >= 0.5) friends += 1;
    if (scoreOut <= -1.0) rivals += 1;

    // Crush recíproco (p -> other e other -> p)
    if (scoreOut >= CRUSH_T) {
      const back = relGet(otherId, p.id);
      if (back >= CRUSH_T) hasReciprocalCrush = true;
    }
  }

  // 2) Cobras: contagem baseada em outros -> p
  for (const o of alive) {
    if (o.id === p.id) continue;
    const scoreToP = relGet(o.id, p.id);
    if (scoreToP <= -4.5) incomingEnemies += 1;
  }

  const out = [];

  // 💞 Crush recíproco
  if (hasReciprocalCrush) out.push("💞");

  // 🐍 Inimigos que miram p (uma cobra por pessoa, com limite visual)
  if (incomingEnemies > 0) out.push("🐍".repeat(Math.min(incomingEnemies, 6)));

  // 🥰 Amigo da galera (3+ amigos, 0 rivais)
  if (friends >= 3 && rivals === 0) out.push("🥰");

  // 🎯 Alvo possível (3+ desafetos, 0 amigos)
  if (rivals >= 3 && friends === 0) out.push("🎯");

  // 🎭 Polêmico (2+ amigos e 2+ desafetos ao mesmo tempo)
  if (friends >= 2 && rivals >= 2) out.push("🎭");

  // 🫥 Planta / Neutro (sem amigos e sem rivais)
  if (friends === 0 && rivals === 0) out.push("🫥");

  return out.join("");
}



  /* ===== Storage / Calendar ===== */
  const LS_KEY = "bbb_sim_mvp_v11_calendar_intro_party";

  // 0=Qua, 1=Qui, 2=Sex, 3=Sáb, 4=Dom, 5=Seg, 6=Ter
  const WEEK_DAYS = [
    { key: "qua", name: "Quarta", notes: "Convivência + Festa (eventos de festa)" },
    { key: "qui", name: "Quinta", notes: "Convivência + Prova do Líder" },
    { key: "sex", name: "Sexta", notes: "Convivência + Big Fone" },
    { key: "sab", name: "Sábado", notes: "Convivência + Prova do Anjo + Festa do Patrocinador" },
    { key: "dom", name: "Domingo", notes: "Convivência + Imunidade do Anjo + Indicação do Líder + Contragolpe + Votos da casa + Paredão" },
    { key: "seg", name: "Segunda", notes: "Convivência" },
    { key: "ter", name: "Terça", notes: "Convivência + Eliminação" }
  ];

  /* ===== State ===== */
  const defaultState = () => ({
    rooms: { pair: null, colors: { A: null, B: null }, assigned: false },
    setupDone: false,
    week: 1,
    dayIndex: 0,
    gameOver: false,
    lastEvent: null,
    publicFavoriteIds: [],
    players: [],
    log: [],
    elimOrder: [],
    scandal: { count: 0, usedPlayerIds: [] },
    final: { winnerId: null, secondId: null, thirdId: null },
    elimHistory: [],
    votesHistory: [],
    relations: {},
    crushRevealed: {},
    crushReciprocalBonus: {},
    alliances: [],
    // Camada narrativa (não altera regras; só interpreta os dados do jogo)
    narrative: {
      // key: "w<week>-<dayKey>" -> { html, ts, picks }
      daily: {},
      // snapshot antes do dia simulado (playerId -> métricas)
      prevSnap: {}
    },
    weekState: {
      leaderId: null,
      lastLeaderId: null,
      anjoId: null,
      imuneId: null,
      indicadoLiderId: null,
      contragolpeId: null,
      indicadosCasaIds: [],
      houseVotes: [],
      tally: {},
      paredaoIds: [],
      publicoPerc: {},
      eliminadoId: null,
      fandomCoalition: null,
      vipIds: [],
      xepaIds: []
    }
  });

  let state = load() ?? defaultState();

  // UI state: aba Popularidade
  let popTabSelectedIds = null; // Set<string>
  let popTabSearchTerm = "";
  let logFilter = "all";

  
  // Sorting unificado da tabela Casa: controlado por select e por clique no header.
  const casaSortState = { key: 'name', dir: 'asc' };

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.players)) return null;

      parsed.week = Math.max(1, parseInt(parsed.week || 1, 10));
      parsed.dayIndex = clamp(parseInt(parsed.dayIndex ?? 0, 10), 0, 6);

      // setupDone: novo fluxo (tela inicial "Defina o elenco")
      if (parsed.setupDone === undefined || parsed.setupDone === null) {
        parsed.setupDone = Array.isArray(parsed.log) && parsed.log.length > 0;
      }

      parsed.elimOrder = Array.isArray(parsed.elimOrder) ? parsed.elimOrder : [];

      parsed.elimHistory = Array.isArray(parsed.elimHistory) ? parsed.elimHistory : [];
      parsed.votesHistory = Array.isArray(parsed.votesHistory) ? parsed.votesHistory : [];

      parsed.final = parsed.final || { winnerId: null, secondId: null, thirdId: null };
      parsed.weekState = parsed.weekState || defaultState().weekState;
      parsed.weekState.lastLeaderId = parsed.weekState.lastLeaderId ?? null;
// garante que arrays existam
parsed.weekState.paredaoIds = Array.isArray(parsed.weekState.paredaoIds) ? parsed.weekState.paredaoIds : [];
parsed.weekState.indicadosCasaIds = Array.isArray(parsed.weekState.indicadosCasaIds) ? parsed.weekState.indicadosCasaIds : [];
parsed.weekState.vipIds = Array.isArray(parsed.weekState.vipIds) ? parsed.weekState.vipIds : [];
parsed.weekState.xepaIds = Array.isArray(parsed.weekState.xepaIds) ? parsed.weekState.xepaIds : [];

      parsed.relations = parsed.relations || {};
      parsed.crushRevealed = parsed.crushRevealed || {};
      parsed.crushReciprocalBonus = parsed.crushReciprocalBonus || {};
      parsed.log = Array.isArray(parsed.log) ? parsed.log : [];
      parsed.gameOver = !!parsed.gameOver;
      // migrate favorito do público: publicFavoriteId (legado) -> publicFavoriteIds (array)
      if (Array.isArray(parsed.publicFavoriteIds)) {
        parsed.publicFavoriteIds = parsed.publicFavoriteIds.filter(Boolean);
      } else {
        parsed.publicFavoriteIds = [];
      }
      if (parsed.publicFavoriteIds.length === 0 && parsed.publicFavoriteId) {
        parsed.publicFavoriteIds = [parsed.publicFavoriteId];
      }
      // fallback: se havia flags nos jogadores
      if (parsed.publicFavoriteIds.length === 0) {
        const flagged = (parsed.players || []).filter((p)=>p?.status?.favPublic).map((p)=>p.id).filter(Boolean);
        if (flagged.length) parsed.publicFavoriteIds = flagged;
      }
      parsed.publicFavoriteId = null; // limpa legado
      parsed.elimHistory = Array.isArray(parsed.elimHistory) ? parsed.elimHistory : [];
      parsed.alliances = Array.isArray(parsed.alliances) ? parsed.alliances : [];

      // camada narrativa (migração)
      parsed.narrative = parsed.narrative || { daily: {}, prevSnap: {} };
      parsed.narrative.daily = (parsed.narrative && typeof parsed.narrative.daily === 'object' && parsed.narrative.daily) ? parsed.narrative.daily : {};
      parsed.narrative.prevSnap = (parsed.narrative && typeof parsed.narrative.prevSnap === 'object' && parsed.narrative.prevSnap) ? parsed.narrative.prevSnap : {};

      // quartos (migração)
      parsed.rooms = parsed.rooms || { pair: null, colors: { A: null, B: null }, assigned: false };
      parsed.rooms.colors = parsed.rooms.colors || { A: null, B: null };
      if (parsed.rooms.assigned === undefined) parsed.rooms.assigned = false;

      parsed.scandal = parsed.scandal || { count: 0, usedPlayerIds: [] };
      parsed.scandal.count = Math.max(0, parseInt(parsed.scandal.count || 0, 10));
      parsed.scandal.usedPlayerIds = Array.isArray(parsed.scandal.usedPlayerIds) ? parsed.scandal.usedPlayerIds : [];


      parsed.players.forEach((p) => {
        // migrate name -> firstName/lastName (compat)
        if ((p.firstName === undefined || p.firstName === null) && typeof p.name === "string") {
          const parts = p.name.trim().split(/\s+/).filter(Boolean);
          p.firstName = parts.shift() || "Sem";
          p.lastName = parts.join(" ") || "";
        }
        if (p.firstName === undefined || p.firstName === null) p.firstName = "Sem";
        if (p.lastName === undefined || p.lastName === null) p.lastName = "";
        if (!p.gender) p.gender = "O"; // M, F, O
        // idade (novo): backfill para saves antigos
        ensurePlayerAge(p);
        if (p.nickname === undefined || p.nickname === null) p.nickname = "";
        if (p._autoNick === undefined || p._autoNick === null) p._autoNick = "";
        if (p.baseName === undefined || p.baseName === null) p.baseName = "";

        // Define um nome base estável para usar em UI (apelido manual > apelido auto > primeiro nome)
        const manualNick = String(p.nickname || "").trim();
        if (manualNick) {
          p._autoNick = "";
          p.baseName = manualNick;
        } else {
          if (!String(p._autoNick || "").trim()) resolveDisplayName(p); // pode gerar _autoNick
          p.baseName = String(p._autoNick || "").trim() || String(p.firstName ?? p.name ?? "").trim();
        }
p.attrs = p.attrs || { provas: 5, estrategia: 5, social: 5, emocional: 5, conflito: 5, rejeicao: 0, excentricidade: 0, serenidade: 5 };
        if (p.attrs.excentricidade === undefined || p.attrs.excentricidade === null) p.attrs.excentricidade = 0;
        if (p.attrs.serenidade === undefined || p.attrs.serenidade === null) p.attrs.serenidade = 5;
        p.status = p.status || { alive: true, pop: 5, alvo: 0, strikes: 0, leaderCount: 0, anjoCount: 0, paredaoCount: 0, popWeek: {}, favPublic: false, favPermanent: false };
        p.status.popWeek = p.status.popWeek || {};
        if (p.status.favPublic === undefined) p.status.favPublic = false;
        if (p.status.favPermanent === undefined) p.status.favPermanent = false;
        if (p.status.leaderCount === undefined || p.status.leaderCount === null) p.status.leaderCount = 0;
        if (p.status.anjoCount === undefined || p.status.anjoCount === null) p.status.anjoCount = 0;
        if (p.status.paredaoCount === undefined || p.status.paredaoCount === null) p.status.paredaoCount = (p.status.strikes ?? 0);
        if (p.status.room === undefined) p.status.room = null;
        if (p.status.weeksSinceWin === undefined) p.status.weeksSinceWin = 0;
        if (p.status.weeksSinceParedao === undefined) p.status.weeksSinceParedao = 0;
        if (p.status.weeksSinceEvent === undefined) p.status.weeksSinceEvent = 0;
        if (p.status.popPrev === undefined) p.status.popPrev = Number(p.status.pop ?? 5.0);
        if (p.status.popStableStreak === undefined) p.status.popStableStreak = 0;
        if (p.status.decisionStreak === undefined) p.status.decisionStreak = 0;
        if (p.status.didSomethingThisWeek === undefined) p.status.didSomethingThisWeek = false;
        if (p.status.madeDecisionThisWeek === undefined) p.status.madeDecisionThisWeek = false;
        if (p.status.wonSomethingThisWeek === undefined) p.status.wonSomethingThisWeek = false;
        if (p.status.planta === undefined) p.status.planta = false;
        if (p.status.plantStreak === undefined) p.status.plantStreak = 0;
        // narrativa: contadores simples para status mutável
        if (p.status.narr === undefined || p.status.narr === null) {
          p.status.narr = { invisDays: 0, pressureDays: 0, lastLabel: "" };
        } else {
          p.status.narr.invisDays = Math.max(0, parseInt(p.status.narr.invisDays ?? 0, 10));
          p.status.narr.pressureDays = Math.max(0, parseInt(p.status.narr.pressureDays ?? 0, 10));
          p.status.narr.lastLabel = String(p.status.narr.lastLabel ?? "");
        }
      });

      return parsed;
    } catch {
      return null;
    }
  }

  function save() {
    // legacy name mirror (compat)
    state.players.slice().sort((a,b)=> (a.name||"").localeCompare((b.name||""),"pt-BR",{sensitivity:"base"})).forEach((p) => {
      const full = (String(p.firstName ?? p.name ?? "").trim() + " " + String(p.lastName ?? "").trim()).trim();
      p.name = full || p.name || "Sem nome";
    });
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function alivePlayers() {
    return state.players.filter((p) => p.status.alive);
  }

  function isTop4() {
    return alivePlayers().length <= 4;
  }

  function resetWeekState() {
    const prevLeaderId = state.weekState?.leaderId ?? null;
    state.weekState = {
      leaderId: null,
      lastLeaderId: prevLeaderId,
      anjoId: null,
      imuneId: null,
      bigFone: {
        triggered: false,
        answeredById: null,
        effectKey: null, // "self_paredao" | "put_paredao" | "self_imune" | "give_imune"
        noVoteId: null,  // se alguém foi direto ao paredão pelo Big Fone, não recebe votos
        extraParedaoId: null,
        immuneIds: []
      },
      indicadoLiderId: null,
      contragolpeId: null,
      indicadosCasaIds: [],
      houseVotes: [],
      tally: {},
      paredaoIds: [],
      publicoPerc: {},
      eliminadoId: null,
      fandomCoalition: null,
      vipIds: [],
      xepaIds: [],
      popStart: Object.fromEntries((state.players||[]).map(p=>[p.id, Number(p.status?.pop ?? 5.0)])),
      _narrNomIdx: {},
      _narrTargeted: []
    };
  }

  function makePlayer(firstName = "Jogador", lastName = "", gender = "O") {
    const p = {
      id: (window.crypto?.randomUUID?.() ?? ("id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16))),
      firstName,
      lastName,
      gender, // "M" | "F" | "O"
      age: generateAge(),
      nickname: "", // apelido manual (opcional)
      _autoNick: "", // apelido gerado (estável)
      attrs: {
        provas: rndInt(1, 10),
        estrategia: rndInt(1, 10),
        social: rndInt(1, 10),
        emocional: rndInt(1, 10),
        conflito: rndInt(1, 10),
        rejeicao: 0,
        excentricidade: rndInt(0, 10),
        serenidade: rndInt(1, 10)
      },
      status: { alive: true, pop: 5.0, alvo: 0.0, strikes: 0, leaderCount: 0, anjoCount: 0, paredaoCount: 0, popWeek: {}, favPublic: false, favPermanent: false, room: null, weeksSinceWin: 0, weeksSinceParedao: 0, weeksSinceEvent: 0, popPrev: 5.0, popStableStreak: 0, decisionStreak: 0, didSomethingThisWeek: false, madeDecisionThisWeek: false, wonSomethingThisWeek: false, planta: false, plantStreak: 0, excluido: false, excluidoStreak: 0, narr: { invisDays: 0, pressureDays: 0, lastLabel: "" } },
      flags: { betrayedBy: [], overplayed: false, isolated: false, confrontedLeader: false, voteExposed: false },
      secret: { gayScore: (gender === 'M' || gender === 'F') ? sampleGayScore() : null }
    };
    ensurePlayerAge(p);
    return p;
  }

  const FIRST_NAMES = {
    M: ["João","Lucas","Pedro","Gabriel","Rafael","Matheus", "Cosmo", "Cosme","Felipe","Bruno","Diego", "Raimundo", "André","Thiago","Victor","Daniel","Eduardo","Caio","Henrique","Guilherme","Leonardo","Marcos","Igor","Vinícius","Renan","Alex","Fábio","Samuel","Arthur","Murilo","Rodrigo","Leandro","Cristiano","Douglas","Jefferson","Alan","Wesley","Otávio","Nicolas","Davi","Ramon","Yuri","Heitor","Bernardo","Luan","Kauã","Enzo","Ícaro","Apolo", "Bento", "Caleb", "Dante", "Elias", "Fausto", "Gael", "Hélio", "Isaac", "Jonas", "Kael", "Levi", "Mael", "Noah", "Otto", "Pietro", "Quirino", "Ravi", "Silas", "Téo", "Uriel", "Valentim", "Xavier", "Zion", "Thales", "Dom", "Zeca", "Iago", "Kenji", "Malik", "Amir", "Siddhartha", "Bjorn", "Lars", "Dimitri", "Mateo", "Kwan", "Zayn", "Otto", "Hugo", "Estevão", "Zoran", "Akar", "Thorfinn", "Soren", "Milan", "Klaus", "Kleber", "Jean", "Alberto", "Maximiliano", "Gilberto", "Pyong", "Hadson", "Nizam", "Luigi", "Maycon", "Junior", "Elieser", "Jonas", "Adrilles", "Cézar", "Ilmar", "Mahmoud", "Alistair", "Viggo", "Soren", "Kenji", "Malik", "Zayn", "Dimitri", "Lars", "Hamza", "Hiroshi" ],
    F: ["Maria","Ana","Ana Paula","Ana Clara","Ana Maria","Edvânia", "Leidiane", "Josefa","Raimunda", "Beatriz","Juliana","Mariana","Camila","Fernanda","Gabriela","Larissa","Renata","Patrícia","Daniela","Carolina","Aline","Bruna","Natália","Vanessa","Paula","Jéssica","Priscila","Simone","Adriana","Flávia","Bianca","Tatiane","Luana","Raquel","Débora","Michele","Sandra","Elisa","Helena","Sofia","Clara","Laura","Amanda","Isabela","Letícia","Joana","Rita","Lúcia","Márcia","Tereza","Milena","Yara", "Aurora", "Bela", "Cecília", "Dora", "Eloá", "Flora", "Gaia", "Hilda", "Íris", "Jade", "Kiara", "Luna", "Maya", "Nina", "Olívia", "Pérola", "Quitéria", "Rosa", "Soraia", "Tarsila", "Ursula", "Valentina", "Ximena", "Zoe", "Aisha", "Malika", "Yasmin", "Inez", "Maite", "Nala", "Zahra", "Araci", "Indira", "Kira", "Amélie", "Svetlana", "Yoko", "Freya", "Astrid", "Elena", "Zuleica", "Ayana", "Selene", "Dafne", "Ingrid", "Amara", "Sabrina", "Grazielli", "Iris", "Ieda", "Emilly", "Vivian", "Gleici", "Thelma", "Juliette", "Karoline", "Giovanna", "Alane", "Deniziane", "Raquele", "Wanessa", "Yasmin", "Domitila", "Kamilla", "Andressa", "Fabiana", "Anamara", "Francine", "Gyselle", "Amélie", "Aisha", "Svetlana", "Yoko", "Ingrid", "Zahra", "Freya", "Indira", "Chiara", "Nala"],
    O: ["Alex","Ariel","Luca","Noa","Dani","Sam","Chris","Kim","Taylor","Ariel", "Robin", "Morgan", "Jordan", "Casey", "Sky", "Charlie", "Dakota", "Sasha", "Ren", "Mika", "Manu", "Val", "Jundi", "Derya", "Bia", "Ali", "Guri", "Lumi", "Jade", "River", "Phoenix", "Sol", "Blue", "Íris", "Paz", "Zion", "Noam", "Arin", "Kiran", "Akira"]
  };
  const SURNAMES = ["Silva","Santos","Oliveira","Pereira","Do Brás", "Renault", "Do Vigor", "Costa","Rodrigues","Alves","Lima","Gomes","Ribeiro","Carvalho","Araujo","Rocha","Martins","Lopes","Soares","Fernandes","Vieira","Barros","Freitas","Nogueira","Teixeira","Guedes","Pacheco","Farias","Cunha","Batista","Rangel","Macedo","Tavares","Moreira","Montenegro","Figueiredo","Amaral","Peixoto","Vasconcelos","Antunes","Neves","Torres","Braga","Abreu","Correia","Paiva","Seixas","Fonseca","Lacerda","Valente","Portela","Azevedo","Siqueira","Bittencourt","Magalhães","Guimarães","Mattos","Pimentel","Salgado","Rezende","Barreto","Coelho","Rios","Toledo","Beltrão","Medeiros","Dantas","Queiroz","Caldas","Camargo","Ferraz","Brandão","Franco","Nascimento","Assunção","Coutinho","Lins","Sarmento","Albuquerque","Mendonça","Viana","Drumond","Seabra","Loyola","Arruda","Pires","Falcão","Goulart","Azeredo","Leal","Maciel","Sampaio","Bezerra","Cardoso","Rabelo","Furtado","Quintana","Abranches","Pinheiro","Mascarenhas","Godoy","Maluf","Tanaka", "Nakamura", "Sato", "Yamamoto", "Haddad", "Mansur", "Said", "Bakir", "Fontes", "Prado", "Vargas", "Luz", "Moraes", "Duarte", "Cavalcanti", "Brito", "Villa-Lobos", "Kruger", "Schmidt", "Hoffman", "Garrido", "Ortega", "Castillo", "Bernardi", "Rossi", "Ferrari", "Fontana", "Abravanel", "Zanin", "Xavier", "Tupinambá", "Guajajara", "Pankararu", "Kovalski", "Novak", "Popov", "O'Connor", "Sullivan", "Müller", "Dubois", "Lefebvre", "Ricci", "Bianchi", "Hwang", "Chen", "Gupta", "Singh", "Hernandez", "Flores", "Siqueiros", "Tavares", "Moniz", "Massafera", "Stefanelli", "Damasceno", "Freire", "Conká", "Picon", "Viggiano", "Scarpeline", "Gagliano", "Khouri", "Grostein", "Gasparotto", "Werneck", "Stagliano", "Brum", "Naccache", "Mader", "Zular", "Henneberg", "Eirado", "Pizane", "Nogueira", "Azevedo", "Mello", "Kovalski", "Popov", "Sullivan", "Müller", "Dubois", "Ricci", "Hwang", "Chen", "Gupta", "Sanção"];

  // ===== Apelidos =====
  // Regra:
  // - Se tiver nickname manual -> usa
  // - Senão: 2% chance de "free nickname" (não vinculado ao nome)
  // - Senão: 55% chance de apelido derivado do primeiro nome (Sam/Samu/Samuca etc.)
  // - Senão: usa o primeiro nome
  const FREE_NICKNAMES = [
    "Juju","Gigi","Bia","Nati","Pri","Malu","Nina","Lelê","Duda","Cacá",
    "Gui","Lipe","Vini","Rafa","Nico","Zeca","Tavinho","Jota","Dudu","Beto",
    "Kiko","Tico","Tutu","Tata","Cris","Dani","Carol","Fê","Lari","Jess"
  ];

  const NICKNAME_OVERRIDES = {
    // Masculinos (Existentes + Novos)
    "samuel": ["Sam", "Samu", "Samuca", "Muca"],
    "joao": ["Jão", "Joca", "Joãozinho", "Jancho"],
    "lucas": ["Lu", "Luquinhas", "Lukinhas", "Luke"],
    "pedro": ["Pe", "Pedrinho", "Pedrão", "Pepê"],
    "gabriel": ["Gabi", "Biel", "Gabs", "Gabo"],
    "rafael": ["Rafa", "Rafinha", "Fael", "Rafão"],
    "matheus": ["Math", "Teus", "Theu", "Mati"],
    "felipe": ["Lipe", "Fê", "Felipinho", "Flip"],
    "bruno": ["Bru", "Bruninho", "Brunão"],
    "diego": ["Di", "Diguinho", "Dieguito", "Didi"],
    "andre": ["Dedé", "Andrezinho", "Dé"],
    "thiago": ["Thi", "Titi", "Thigão", "Thiguinho"],
    "victor": ["Vitinho", "Vitu", "Vic", "Vivi"],
    "daniel": ["Dani", "Dan", "Danilinho", "Dadá"],
    "eduardo": ["Edu", "Dudu", "Du", "Duda"],
    "caio": ["Cai", "Caião", "Caititico"],
    "henrique": ["Rique", "Henri", "Quinho", "Ique"],
    "guilherme": ["Gui", "Guizinho", "Guiga", "Guilherminho"],
    "leonardo": ["Léo", "Leozin", "Leon"],
    "marcos": ["Marcão", "Marquinhos", "Maco"],
    "igor": ["Ig", "Igão", "Iguinho"],
    "vinicius": ["Vini", "Vinão", "Vininho", "Vina"],
    "renan": ["Rê", "Renanzinho", "Nanzinho"],
    "arthur": ["Tu", "Tutu", "Thur", "Arturzinho"],
    "murilo": ["Muri", "Muzão", "Murilinho", "Milo"],
    "rodrigo": ["Rod", "Rodriguinho", "Digo", "Digão"],
    "leandro": ["Lê", "Léo", "Leandrinho"],
    "cristiano": ["Cris", "Tiano", "Crisinho"],
    "douglas": ["Doug", "Dô", "Douglinha"],
    "jefferson": ["Jeff", "Jefinho", "Jé"],
    "alan": ["Al", "Lanzinho", "Alanziho"],
    "wesley": ["Wes", "Weslão", "Ley"],
    "otavio": ["Tavinho", "Tavi", "Tavão"],
    "nicolas": ["Nico", "Niquinho", "Nick"],
    "davi": ["Davizinho", "Dadinho", "Dave"],
    "ramon": ["Ram", "Ramonzin", "Moncho"],
    "yuri": ["Yu", "Yuzinho", "Yurizão"],
    "heitor": ["Heitinho", "Heitorzão", "Tô"],
    "bernardo": ["Bê", "Nardo", "Bernard", "Beê"],
    "luan": ["Lua", "Luanzin", "Lulu"],
    "kaua": ["Kau", "Kaka", "Kauaninho"],
    "enzo": ["Enzinho", "Zô", "Enzito"],
    "icaro": ["Ica", "Icarinho", "Ica"],
    "gael": ["Gaelzinho", "Gaelito", "Gá"],
    "ravi": ["Ravizinho", "Vi"],
    "noah": ["Nozinho", "Nô"],
    "valentim": ["Valen", "Tim", "Valenzinho"],
    "bento": ["Bentinho", "Ben"],
    "isaac": ["Zac", "Isacão", "Zaca"],
    "kleber": ["Klebinho", "Klebs", "Binho"],
    "gilberto": ["Gil", "Giba", "Gilbertinho"],
    "raimundo": ["Rai", "Mundinho"],

    // Femininos (Existentes + Novos)
    "maria": ["Mari", "Mabi", "Mia", "Mariazinha"],
    "ana": ["Aninha", "Anoca", "Ani", "Nana"],
    "beatriz": ["Bia", "Bibi", "Triz", "Bea"],
    "juliana": ["Juju", "Ju", "Juli", "Julinha"],
    "mariana": ["Mari", "Marih", "Nana", "Marianinha"],
    "camila": ["Cami", "Mila", "Camilinha", "Mimi"],
    "fernanda": ["Fê", "Nanda", "Nandinha", "Fofão"],
    "gabriela": ["Gabi", "Bela", "Gabs", "Gabizinha"],
    "larissa": ["Lari", "Lá", "Laris"],
    "renata": ["Rê", "Nata", "Renatinha", "Renatin"],
    "patricia": ["Paty", "Pati", "Patricinha", "Pa"],
    "daniela": ["Dani", "Dany", "Danizinha"],
    "carolina": ["Carol", "Cacau", "Lina", "Carolzinha"],
    "aline": ["Ali", "Lili", "Alininha"],
    "bruna": ["Bru", "Bruninha", "Bruninha", "Brunão"],
    "natalia": ["Nati", "Naná", "Nath", "Natinha"],
    "vanessa": ["Vane", "Nessa", "Vanessinha", "Vavá"],
    "paula": ["Paulinha", "Pau", "Paulita"],
    "jessica": ["Jess", "Jé", "Jessy", "Jequinha"],
    "priscila": ["Pri", "Prizinha", "Pris"],
    "simone": ["Si", "Sisi", "Mone"],
    "adriana": ["Dri", "Drica", "Didi", "Adrianinha"],
    "flavia": ["Flavinha", "Flá", "Flavita"],
    "bianca": ["Bia", "Bibi", "Bibi", "Bianquinha"],
    "tatiane": ["Tati", "Tata", "Tatinha"],
    "luana": ["Lua", "Lu", "Luaninha"],
    "raquel": ["Quel", "Kel", "Raquelzinha"],
    "debora": ["Debs", "Dê", "Debinha"],
    "michele": ["Mi", "Mimi", "Chel", "Michelly"],
    "sandra": ["Sandrinha", "San", "Sandi"],
    "elisa": ["Li", "Eli", "Elisinha", "Lis"],
    "helena": ["Lena", "Lê", "Helê", "Leninha"],
    "sofia": ["Sô", "Fifi", "Sofi", "Sofinha"],
    "clara": ["Clá", "Clarinha", "Clarin"],
    "laura": ["Lau", "Laurinha", "Laurita"],
    "amanda": ["Mandi", "Amandinha", "Amandita"],
    "isabela": ["Isa", "Bel", "Isabelinha", "Bela"],
    "leticia": ["Let", "Lelê", "Leticinha", "Le"],
    "joana": ["Jô", "Jo", "Joaninha"],
    "rita": ["Ri", "Ritinha", "Ritoca"],
    "lucia": ["Lu", "Lucinha", "Lulu"],
    "marcia": ["Marci", "Má", "Marcinha"],
    "tereza": ["Tê", "Terezinha", "Tetê", "Teza"],
    "milena": ["Mi", "Mile", "Mileninha", "Mimi"],
    "yara": ["Ya", "Yazinha", "Yarinha"],
    "aurora": ["Rora", "Auri", "Aurorinha"],
    "maya": ["May", "Mayzinha"],
    "zoe": ["Zozô", "Zoinha"],
    "valentina": ["Valen", "Tina", "Valentininha"],
    "juliette": ["Ju", "Juju", "Juzinha"],
    "yasmin": ["Yas", "Min", "Yazinha"],  
    "edvania": ["Ed", "Dinha", "Eddy"],
    "raimunda": ["Rai", "Mundinha"],
    "giovanna": ["Gio", "Gigi", "Gioninha"],

    // Neutros
    "alex": ["Al", "Alex", "Leco"],
    "ariel": ["Ari", "Arielzinho"],
    "luca": ["Lu", "Luquinhas"],
    "sam": ["Sammy", "Suca"],
    "taylor": ["Tay", "Taytay"],
    "sasha": ["Sasá", "Shura"],
    "charlie": ["Char", "Chucky"],
    "jordan": ["Jô", "Jordy"],
    "mika": ["Mimi", "Miki"]
};

  function normalizeNameKey(s) {
    return String(s ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim();
  }

  function resolveNicknameForFirstName(firstName) {
    const key = normalizeNameKey(firstName);
    const arr = NICKNAME_OVERRIDES[key];
    if (arr && arr.length) return pickOne(arr);
    return "";
  }

  function resolveDisplayName(p) {
    if (!p) return "";
    const manual = String(p.nickname ?? "").trim();
    if (manual) { p._autoNick = ""; return manual; }

    // se já tem um apelido gerado, mantém estável
    const stable = String(p._autoNick ?? "").trim();
    if (stable) return stable;

    const first = String(p.firstName ?? p.name ?? "").trim();

    // chance pequena de apelido livre (não vinculado ao nome)
    if (Math.random() < 0.02) {
      const free = pickOne(FREE_NICKNAMES);
      const chosenFree = (free || first);
      p._autoNick = chosenFree;
      return chosenFree;
    }

    // se o nome tem apelidos "naturais", usa com chance de 1/3
    const derived = resolveNicknameForFirstName(first);
    const chosen = (derived && Math.random() < (1/3)) ? derived : first;

    p._autoNick = chosen;
    return chosen;
  }



  function randomSurname() {
    return SURNAMES[rndInt(0, SURNAMES.length - 1)];
  }

  function randomFirstName(gender = "O") {
    const list = FIRST_NAMES[gender] || FIRST_NAMES.O;
    return list[rndInt(0, list.length - 1)];
  }

  function fullNameKey(firstName, lastName) {
    return (String(firstName || "").trim() + " " + String(lastName || "").trim()).trim().toLowerCase();
  }

  function randomPersonName(gender = "O") {
    const firstName = randomFirstName(gender);
    const lastName = randomSurname();
    const exists = new Set(state.players.map(p => fullNameKey(p.firstName ?? p.name, p.lastName ?? "")));
    let key = fullNameKey(firstName, lastName);
    if (!exists.has(key)) return { firstName, lastName };
    let i = 2;
    while (exists.has(fullNameKey(firstName, lastName + " " + i))) i++;
    return { firstName, lastName: lastName + " " + i };
  }

  function generateBalancedCast(size) {
    const N = clamp(parseInt(size || 20, 10), 3, 40);
    let men = Math.floor(N / 2);
    let women = Math.floor(N / 2);
    let other = N - men - women; // 0 ou 1 quando N ímpar

    // chance de ter 1 "Outro" mesmo com N par (substitui um M ou F)
    if (N % 2 === 0 && Math.random() < 0.35) {
      other = 1;
      if (Math.random() < 0.5) men = Math.max(0, men - 1);
      else women = Math.max(0, women - 1);
    }

    // se N ímpar, decide se o "extra" vira Outro ou mantém M/F
    if (N % 2 === 1) {
      if (Math.random() < 0.45) {
        other = 1;
      } else {
        other = 0;
        if (Math.random() < 0.5) men += 1;
        else women += 1;
      }
    }

    const out = [];
    for (let i = 0; i < men; i++) {
      const nm = randomPersonName("M");
      out.push(makePlayer(nm.firstName, nm.lastName, "M"));
    }
    for (let i = 0; i < women; i++) {
      const nm = randomPersonName("F");
      out.push(makePlayer(nm.firstName, nm.lastName, "F"));
    }
    for (let i = 0; i < other; i++) {
      const nm = randomPersonName("O");
      out.push(makePlayer(nm.firstName, nm.lastName, "O"));
    }

    // embaralha
    out.sort(() => Math.random() - 0.5);
    return out;
  }

function currentFavorites() {
    const ids = Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : [];
    const out = ids
      .map((id) => state.players.find((x) => x.id === id))
      .filter((p) => p && p.status.alive);
    return out;
  }

  function syncFavFlags() {
    // Garante que favoritos permanentes permaneçam marcados até o fim do jogo.
    state.publicFavoriteIds = Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : [];

    // Injeta permanentes na lista (apenas vivos).
    for (const x of state.players) {
      if (!x?.id || !x?.status) continue;
      if (x.status.favPermanent && x.status.alive && !state.publicFavoriteIds.includes(x.id)) {
        state.publicFavoriteIds.push(x.id);
      }
    }

    const set = new Set(state.publicFavoriteIds);
    for (const x of state.players) {
      if (!x?.status) continue;
      const isPermAlive = !!(x.status.favPermanent && x.status.alive);
      x.status.favPublic = isPermAlive || set.has(x.id);
    }
  }

  // Registra ⭐ por semana no schema narrativo (para títulos/arc mais inteligentes)
  function recordStarHistory(p, round, on) {
    if (!p) return;
    const R = Number(round ?? state.week ?? 1);
    initNarrativeForPlayer(p, R);
    p.narrative.starHistory = Array.isArray(p.narrative.starHistory) ? p.narrative.starHistory : [];
    const prev = p.narrative.starHistory[p.narrative.starHistory.length - 1];
    if (prev && Number(prev.round) === R && !!prev.on === !!on) return;
    p.narrative.starHistory.push({ round: R, on: !!on });
    if (p.narrative.starHistory.length > 120) p.narrative.starHistory = p.narrative.starHistory.slice(-120);

    // timeline leve (não precisa sempre, mas ajuda no arco final)
    if (on) {
      pushTimelineEvent(p, { round: R, type: 'fav_on', text: `${simpleName(p)} ganhou torcida e virou favorito do público.`, refs: {}, weight: 2 });
      tagTheme(p, 'public_favorite', 2, R, p.narrative.timeline.length - 1);
      adjustReputation(p, { social: 1 });
    } else {
      pushTimelineEvent(p, { round: R, type: 'fav_off', text: `${simpleName(p)} perdeu força de torcida e deixou de ser favorito.`, refs: {}, weight: 1 });
      tagTheme(p, 'public_favorite', -1, R, p.narrative.timeline.length - 1);
    }
  }

  // Classifica padrão de ⭐ (relâmpago/constante/no fim/caiu/intermitente)
  function favoriteKindFromHistory(p, totalRounds) {
    const n = p?.narrative;
    const hist = Array.isArray(n?.starHistory) ? n.starHistory : [];
    if (!hist.length) return null;

    const total = Math.max(1, Number(totalRounds ?? state.week ?? 1));
    const onSet = new Set(hist.filter(x => x && x.on).map(x => Number(x.round)));
    const rounds = [];
    for (let r = 1; r <= total; r++) rounds.push(r);

    const hasStar = (r) => onSet.has(r);
    const starCount = rounds.filter(hasStar).length;
    if (!starCount) return null;

    const maxStreak = (() => {
      let best = 0, cur = 0;
      for (const r of rounds) {
        if (hasStar(r)) { cur++; best = Math.max(best, cur); } else cur = 0;
      }
      return best;
    })();

    const earlyW = Math.min(3, total);
    const endW = Math.min(3, total);
    const starEarly = rounds.slice(0, earlyW).filter(hasStar).length;
    const starEnd = rounds.slice(-endW).filter(hasStar).length;

    if (maxStreak >= 3) return 'fav_long';
    if (starEnd >= 2 && starEarly === 0) return 'fav_late';
    if (starEarly >= 2 && starEnd === 0) return 'fav_fallen';
    if (starCount === 1) return 'fav_flash';
    return 'fav_mixed';
  }

  function clearPublicFavorites() {
    // limpa, mas preserva favoritos permanentes (vivos)
    const perm = (state.players || []).filter(p => p?.status?.alive && p?.status?.favPermanent).map(p => p.id).filter(Boolean);
    state.publicFavoriteIds = perm;
    syncFavFlags();
  }

  function addPublicFavorite(p) {
    if (!p || !p.id) return;
    state.publicFavoriteIds = Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : [];
    if (!state.publicFavoriteIds.includes(p.id)) state.publicFavoriteIds.push(p.id);

    // 1% de chance de virar favorito permanente (até o fim do jogo), ao ganhar a ⭐.
    // Só roda quando o jogador está virando favorito agora (não spam).
    p.status = p.status || {};
    if (!p.status.favPermanent && Math.random() < 0.01) {
      p.status.favPermanent = true;
      // registra no arco narrativo
      try {
        const R = Number(state.week ?? 1);
        pushTimelineEvent(p, { round: R, type: 'fav_perm', text: `${simpleName(p)} virou favorito permanente do público.`, refs: {}, weight: 3 });
        tagTheme(p, 'public_favorite', 3, R, p.narrative?.timeline?.length ? (p.narrative.timeline.length - 1) : null);
      } catch { /* ignora */ }
    }

    syncFavFlags();
    // registra ⭐ (torcida) no histórico narrativo
    try { recordStarHistory(p, state.week, true); } catch { /* ignora */ }
  }

  function removePublicFavorite(pOrId) {
    const id = typeof pOrId === "string" ? pOrId : (pOrId?.id || null);
    if (!id) return;

    // Não remove favoritos permanentes (se ainda estiverem vivos).
    try {
      const pCheck = state.players.find(x => x.id === id);
      if (pCheck?.status?.alive && pCheck?.status?.favPermanent) {
        // garante que está na lista
        state.publicFavoriteIds = Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : [];
        if (!state.publicFavoriteIds.includes(id)) state.publicFavoriteIds.push(id);
        syncFavFlags();
        return;
      }
    } catch { /* ignora */ }

    state.publicFavoriteIds = Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : [];
    state.publicFavoriteIds = state.publicFavoriteIds.filter((x) => x !== id);
    syncFavFlags();
    // registra perda de ⭐ no histórico narrativo
    try {
      const p = state.players.find(x => x.id === id);
      if (p) recordStarHistory(p, state.week, false);
    } catch { /* ignora */ }
  }

  function isPublicFavorite(p) {
    return !!(p && p.status && p.status.favPublic);
  }

  function dislikesFavorite(p) {
    const favs = currentFavorites();
    if (!favs.length || !p || !p.status.alive) return false;
    // se a pessoa tiver relação bem negativa com QUALQUER favorito, tende a ser mais punida
    return favs.some((fav) => fav.id !== p.id && relGet(p.id, fav.id) <= -1.2);
  }

  // ===== Favorito do público fora da eliminação =====
  // Chance dinâmica (0..baseMax) de alguém virar favorito em eventos (ex.: Festa, Sincerão).
  // - baseMax: limite máximo da probabilidade (ex.: 0.05 = 5%)
  // - pickN: quantos candidatos aleatórios testar (evita sempre escolher o mais "ótimo")
  // - weightsFn: função que retorna 0..1 para cada participante (quanto maior, maior a chance)
  // - maxFavorites: limite de favoritos simultâneos (para não inflar demais)
  function maybeAddPublicFavoriteFromEvent(meta, opts) {
    const alive = (typeof alivePlayers === "function") ? alivePlayers() : [];
    if (!alive || alive.length < 3) return false;

    const favs = (typeof currentFavorites === "function") ? currentFavorites() : [];
    const maxFavorites = clamp(Number(opts?.maxFavorites ?? 2), 0, 10);
    if (favs.length >= maxFavorites) return false;

    const baseMax = clamp(Number(opts?.baseMax ?? 0.05), 0, 0.15);
    const pickN = clamp(Number(opts?.pickN ?? 4), 1, Math.min(10, alive.length));
    const weightsFn = (typeof opts?.weightsFn === "function") ? opts.weightsFn : (() => 0);

    // pool aleatório (pra não ser determinístico)
    const pool = alive.slice().sort(() => Math.random() - 0.5).slice(0, pickN);
    pool.sort(() => Math.random() - 0.5);

    for (const p of pool) {
      if (!p || !p.status?.alive) continue;
      if (isPublicFavorite(p)) continue;

      const w01 = clamp(Number(weightsFn(p) ?? 0), 0, 1);
      const chance = clamp(baseMax * w01, 0, baseMax);

      if (Math.random() < chance) {
        addPublicFavorite(p);

	        // feedback no feed do dia (texto customizável por evento)
	        const msgFn = (typeof opts?.messageFn === "function") ? opts.messageFn : null;
	        const defaultMsg = `<strong>Favorito do público</strong>: <strong>${escapeHtml(displayName(p))}</strong> ganha força e vira ${g(p, { M: "o favorito", F: "a favorita", O: "a favorite" })}.`;
	        const msgHtml = msgFn ? String(msgFn(p) || "") : defaultMsg;
	        if (typeof dayAdd === "function" && msgHtml) {
	          dayAdd(`
	            <div class="dayCard evNeu">
	              <span style="flex:1; min-width:0;">
	                ${msgHtml}
	              </span>
	              <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("misto")}</span>
	            </div>
	          `);
	        }

        return true;
      }
    }

    return false;
  }

  function displayName(p) {
    const base = p ? resolveDisplayName(p) : "";
    const fav = (p && isPublicFavorite(p)) ? " ★" : "";
    const plant = (p && p.status && p.status.planta) ? " 🪴" : "";
    const monstro = (p && p.status && Number(p.status.monstroDaysLeft ?? 0) > 0) ? " 👹" : "";
    const excl = (p && p.status && p.status.excluido) ? " 🥺" : "";
    return p ? (base + fav + plant + monstro + excl) : "";
  }

  function isMonstro(p) {
    return !!(p && p.status && Number(p.status.monstroDaysLeft ?? 0) > 0);
  }

  // Nome completo (sem estrela)
  function fullName(p) {
    if (!p) return "";
    return (String(p.firstName ?? p.name ?? "").trim() + " " + String(p.lastName ?? "").trim()).trim();
  }

  // Nome curto para eventos: só o primeiro nome, a não ser que exista duplicado.
  function shortNameForEvents(p) {
    return resolveDisplayName(p);
  }

  // Troca nomes completos por nomes curtos em textos de evento (para não mostrar sobrenome sempre).
  function formatNamesInText(s) {
    let out = String(s ?? "");
    // ordena por tamanho do nome completo (maiores primeiro) para evitar substituições parciais
    const players = state.players.slice().filter(Boolean)
      .map((p) => ({ full: fullName(p), short: shortNameForEvents(p) }))
      .filter((x) => x.full && x.short && x.full !== x.short)
      .sort((a, b) => b.full.length - a.full.length);

    for (const x of players) {
      // substitui ocorrência "palavra a palavra" (case sensitive) e também versões escapadas simples
      out = out.split(x.full).join(x.short);
    }
    return out;
  }

  // Rejeição dinâmica (0..10). Favorito recebe metade do efeito; rivais do favorito recebem dobro.
  function applyRejection(p, delta) {
    if (!p || !p.attrs) return;
    let d = Number(delta || 0);
    if (!Number.isFinite(d) || d === 0) return;

    // multipliers
    if (p?.status?.planta && d > 0) d *= 0.70;

    if (isPublicFavorite(p)) d *= 0.5;
    else if (dislikesFavorite(p)) d *= 2.0;

    p.attrs.rejeicao = clamp(Number(p.attrs.rejeicao ?? 0) + d, 0, 10);
  }

  function bump(p, delta) {
    if (!p) return;

    const d = { ...delta };

    if (p?.status?.planta) {
      // negativos internos atenuados
      if (d.alvo !== undefined && d.alvo > 0) d.alvo *= 0.65;
      if (d.strikes !== undefined && d.strikes > 0) d.strikes *= 0.75;
    }

    if (d.alvo !== undefined) p.status.alvo = clamp(p.status.alvo + d.alvo, 0, 10);
if (d.strikes !== undefined) {
  p.status.strikes = Math.max(0, p.status.strikes + d.strikes);

  // paredãoCount deve contar "quantas vezes foi ao paredão" (inteiro)
  const incParedao = (d.strikes > 0) ? 1 : 0;
  p.status.paredaoCount = Math.max(0, (p.status.paredaoCount ?? 0) + incParedao);
}


    if (d.pop !== undefined) {
      const ex = clamp(Number(p.attrs?.excentricidade ?? 0), 0, 10);
      const mult = 1 + ex / 10;
      let dPop = d.pop * mult;

      // Favorito do público: ganha dobro quando sobe e perde metade quando cai
      if (isPublicFavorite(p)) {
        if (dPop > 0) dPop *= 2.0;
        if (dPop < 0) dPop *= 0.5;
      } else if (dPop < 0 && dislikesFavorite(p)) {
        // quem não gosta do favorito tende a ser mais punido pelo público
        dPop *= 2.0;
      }

      p.status.pop = clamp(p.status.pop + dPop, 0, 10);

      // teto "fama vira alvo"
      if (p.status.pop > 8.9 && Math.random() < 0.22) {
        const hit = rnd(0.15, 0.55);
        p.status.pop = clamp(p.status.pop - hit, 0, 10);
        p.status.alvo = clamp(p.status.alvo + hit * 0.6, 0, 10);
      }
    }
  }

  /* ===== Logging ===== */
  function dayCtx() {
    const d = WEEK_DAYS[state.dayIndex] || WEEK_DAYS[0];
    const isSponsorPartyDay = (d.key === "sab");
    // A festa do líder não acontece na primeira quarta-feira (estreia).
    // A partir da semana 2, a quarta vira dia de festa do líder.
    const isLeaderPartyDay = (d.key === "qua" && state.week >= 2);

    const festa = (isLeaderPartyDay || isSponsorPartyDay);
    const festaType = isLeaderPartyDay ? "lider" : (isSponsorPartyDay ? "patrocinador" : null);
    const tension = d.key === "seg" || d.key === "ter";

    // Perfil narrativo do dia (ritmo semanal)
    // - estratégia explícita: sexta–domingo
    // - pressão emocional: segunda–terça
    // - leveza/convivência: quarta (festa) e quinta (pós-líder)
    const dayProfileByKey = {
      qua: { catMults: { strategy: 0.05, emotional: 0.35, conflict: 1.20, social: 1.25, romance: 1.35, attention: 1.25, neutral: 0.95, housefun: 1.80 }, mood: { tension: 0.55, paranoia: 0.35, leveza: 0.75 } },
      qui: { catMults: { strategy: 0.20, emotional: 0.35, conflict: 0.85, social: 1.05, romance: 0.85, attention: 1.05, neutral: 1.15, housefun: 1.35 }, mood: { tension: 0.35, paranoia: 0.40, leveza: 0.45 } },
      sex: { catMults: { strategy: 1.10, emotional: 0.55, conflict: 1.15, social: 1.00, romance: 0.95, attention: 1.00, neutral: 0.90, housefun: 1.10 }, mood: { tension: 0.55, paranoia: 0.55, leveza: 0.35 } },
      sab: { catMults: { strategy: 1.20, emotional: 0.55, conflict: 1.20, social: 1.05, romance: 1.15, attention: 1.05, neutral: 0.85, housefun: 1.50 }, mood: { tension: 0.55, paranoia: 0.55, leveza: 0.55 } },
      dom: { catMults: { strategy: 1.35, emotional: 0.65, conflict: 1.35, social: 0.85, romance: 0.85, attention: 1.10, neutral: 0.75, housefun: 0.75 }, mood: { tension: 0.75, paranoia: 0.65, leveza: 0.20 } },
      seg: { catMults: { strategy: 0.12, emotional: 1.55, conflict: 1.35, social: 0.70, romance: 0.55, attention: 0.85, neutral: 0.70, housefun: 0.50 }, mood: { tension: 0.90, paranoia: 0.70, leveza: 0.10 } },
      ter: { catMults: { strategy: 0.10, emotional: 1.65, conflict: 1.25, social: 0.75, romance: 0.55, attention: 0.85, neutral: 0.65, housefun: 0.40 }, mood: { tension: 0.95, paranoia: 0.75, leveza: 0.10 } }
    };
    const prof = dayProfileByKey[d.key] || { catMults: {}, mood: { tension: tension ? 0.8 : 0.4, paranoia: 0.4, leveza: festa ? 0.6 : 0.35 } };
    const catMults = prof.catMults || {};
    const mood = prof.mood || { tension: tension ? 0.8 : 0.4, paranoia: 0.4, leveza: festa ? 0.6 : 0.35 };
    const sponsor = (festaType === "patrocinador") ? ensureSponsorPartyObj() : null;
    // Persiste um "clima" simples (o dia seguinte herda um pouco do anterior)
    state.dayMood = state.dayMood || { tension: 0.4, paranoia: 0.35, leveza: 0.35 };
    // Reforça o impacto do dia (calendário) sem perder totalmente a "ressaca" do dia anterior.
    state.dayMood = {
      tension: clamp(0.35 * Number(state.dayMood.tension ?? 0) + 0.65 * Number(mood.tension ?? 0), 0, 1),
      paranoia: clamp(0.45 * Number(state.dayMood.paranoia ?? 0) + 0.55 * Number(mood.paranoia ?? 0), 0, 1),
      leveza: clamp(0.35 * Number(state.dayMood.leveza ?? 0) + 0.65 * Number(mood.leveza ?? 0), 0, 1)
    };

    return { ...d, festa, festaType, sponsor, tension, mood: state.dayMood, catMults };
  }

  function pushLog(who, msg, meta) {
    const ctx = meta?.ctx || dayCtx();
    const week = meta?.week ?? state.week;
    const dayName = meta?.dayName ?? ctx.name;
    state.log.push({ t: Date.now(), who, msg, week, dayName });
  }

function markEliminated(p) {
  if (!p) return;

  // garante estrutura
  p.status = p.status || {};

  // se já estiver eliminado, não faz nada
  if (p.status.alive === false) return;

  // marca eliminação
  p.status.alive = false;

  // guarda semana em que saiu (para travar preenchimento depois)
  p.status.outWeek = state.week;

  if (!state.elimOrder.includes(p.id)) state.elimOrder.push(p.id);
}

  function hasDayLog(week, dayName, who) {
    return state.log.some((e) => e.who === who && e.week === week && e.dayName === dayName);
  }

  /* ===== buffers (Convivência vs Jogo) ===== */
  let dayBuffer = [];
  let pendingAdvance = null;
  let gameBuffer = [];
  function dayAdd(line) {
    const s = String(line ?? "");
    const trimmed = s.trim();

    // Se for APENAS a linha de VT, anexa no último card ao invés de criar um novo.
    const isVtOnly =
      trimmed.startsWith('<span class="vtLine"') &&
      trimmed.endsWith("</span>") &&
      // evita capturar spans maiores ou wrappers acidentais
      !trimmed.includes("</span>\n");

    if (isVtOnly && dayBuffer.length) {
      const i = dayBuffer.length - 1;
      const last = String(dayBuffer[i] ?? "");

      // Só tenta anexar se o último item for um dayCard "normal"
      if (last.includes('class="dayCard') && last.trim().endsWith("</div>")) {
        dayBuffer[i] = last.replace(
          /<\/div>\s*$/,
          `<div style="margin-top:6px;">${s}</div></div>`
        );
        return;
      }
    }

    // Se já for um card/bloco especial, não embrulha.
    if (
      s.includes('class="dayCard') ||
      s.includes('class="bigFightBox') ||
      s.includes('class="bigFoneBox') ||
      trimmed.startsWith("<div")
    ) {
      dayBuffer.push(s);
      return;
    }

    // Padrão: evento neutro em formato de card.
    dayBuffer.push(`<div class="dayCard evNeu">${s}</div>`);
  }
  function gameAdd(line) {
    gameBuffer.push(line);
  }
  function flushDayBlocks(meta) {
    if (dayBuffer.length) pushLog("Dia", dayBuffer.join(""), meta);
    if (gameBuffer.length) pushLog("Jogo", gameBuffer.join(""), meta);
    dayBuffer = [];
    gameBuffer = [];
  }

  /* ===== vt ===== */
  function vtToEmojis(vtText) {
    const t = String(vtText || "").toLowerCase();
    if (t.includes("muito positivo")) return "🔥😍📈";
    if (t.includes("positivo")) return "😊✨📈";
    if (t.includes("muito negativo")) return "🚫😡📉";
    if (t.includes("negativo")) return "😒💥📉";
    if (t.includes("misto") || t.includes("divide") || t.includes("depende") || t.includes("polariza") || t.includes("armad") || t.includes("panelinh")) return "😬🤝⚖️";
    if (t.includes("neutro") || t.includes("pouco") || t.includes("morno") || t.includes("sem enredo") || t.includes("não engatou")) return "😶🫥";
    return "👀";
  }

  /* ===== Relações (mínimo necessário) ===== */
  function relGet(aId, bId) {
    if (!aId || !bId || aId === bId) return 0;
    return clamp(state.relations[aId]?.[bId] ?? 0, -5, 5);
  }

  const REL_POS_MULT = 2.5;
  const REL_NEG_MULT = 0.5;
  const CRUSH_T = 5.0;

  function crushKey(aId, bId) {
    return `${aId}|${bId}`;
  }
  function pairKey(aId, bId) {
    return [aId, bId].sort().join("|");
  }
// ===== Texto variado (BBB vibes) =====
// (usa o pickOne utilitário já existente no arquivo)

// Use displayName(A/B) já escapado pra montar as frases
const TEXTS = {
  crushReveal: [
    (A, B) => `sente atração por <strong>${B}</strong>❣️`,
    (A, B) => `vive reparando em <strong>${B}</strong> e já virou pauta na casa 👀`,
    (A, B) => `não disfarça quando <strong>${B}</strong> aparece 😏`,
    (A, B) => `tá claramente caidinho por <strong>${B}</strong>`,
    (A, B) => `tá no modo “olhar de canto” sempre que <strong>${B}</strong> chega 💘`
  ],
  crushReciprocal: [
    (A, B) => `se pegam na casa❣️`,
    (A, B) => `vão pro edredom e a casa inteira comenta 🛌❣️`,
    (A, B) => `assumem o clima e viram casal do momento 💞`,
    (A, B) => `dormem juntinhos 👀💞`,
    (A, B) => `não desgrudam 😏💘`,
    (A, B) => `trocam chamego sem medo`
  ]
};

// ===== CRUSH =====
function maybeRevealCrush(aId, bId, prevScore, nextScore) {
  if (state.gameOver) return;
  if (!aId || !bId || aId === bId) return;
  if (!(prevScore < CRUSH_T && nextScore >= CRUSH_T)) return;

  const key = crushKey(aId, bId);
  if (state.crushRevealed[key]) return;

  const A = state.players.find((p) => p.id === aId);
  const B = state.players.find((p) => p.id === bId);
  if (!A || !B || !A.status.alive || !B.status.alive) return;

  if (Math.random() > 0.85) return;

  state.crushRevealed[key] = true;

  const AName = escapeHtml(displayName(A));
  const BName = escapeHtml(displayName(B));
  const msg = pickOne(TEXTS.crushReveal)(AName, BName);

  A.status.didSomethingThisWeek = true;
  B.status.didSomethingThisWeek = true;

  dayAdd(`
    <div class="dayCard evCrush">
      <span style="flex:1; min-width:0;">
        💘 <strong>${AName}</strong>: ${msg}
      </span>
      <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
    </div>
  `);
}

function maybeReciprocalCrushBonus(aId, bId) {
  if (state.gameOver) return;
  if (!aId || !bId || aId === bId) return;

  const aScore = relGet(aId, bId);
  const bScore = relGet(bId, aId);
  if (aScore < CRUSH_T || bScore < CRUSH_T) return;

  const key = pairKey(aId, bId);
  if (state.crushReciprocalBonus[key]) return;

  const A = state.players.find((p) => p.id === aId);
  const B = state.players.find((p) => p.id === bId);
  if (!A || !B || !A.status.alive || !B.status.alive) return;

  bump(A, { pop: 0.25 });
  bump(B, { pop: 0.25 });
  state.crushReciprocalBonus[key] = true;

  const AName = escapeHtml(displayName(A));
  const BName = escapeHtml(displayName(B));
  const msg = pickOne(TEXTS.crushReciprocal)(AName, BName);

  A.status.didSomethingThisWeek = true;
  B.status.didSomethingThisWeek = true;

  dayAdd(`
    <div class="dayCard evCrush">
      <span style="flex:1; min-width:0;">
        💞 <strong>${AName} e ${BName}</strong>: ${msg}
      </span>
      <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
    </div>
  `);
}

// ===== RELAÇÕES =====
function relAdd(aId, bId, d, scope = "intimo") {
  if (!aId || !bId || aId === bId) return;
  if (typeof d !== "number" || d === 0) return;

  const vipIds = Array.isArray(state.weekState?.vipIds) ? state.weekState.vipIds : [];
  const xepaIds = Array.isArray(state.weekState?.xepaIds) ? state.weekState.xepaIds : [];
  const isVip = (id) => vipIds.includes(id);
  const isXepa = (id) => xepaIds.includes(id);

  const adjustRelDelta = (sourceId, targetId, delta) => {
    let out = delta;
    if (!out) return out;

    const sameRoomFlag = inSameRoom(sourceId, targetId);
    if (out > 0) {
      out *= sameRoomFlag ? 1.18 : 0.95;
    } else {
      out *= sameRoomFlag ? 0.85 : 1.05;
    }

    if (out < 0) {
      if (isVip(sourceId)) out *= 0.75;
      if (isVip(targetId)) out *= 1.10;
      if (isXepa(targetId)) out *= 0.90;
    } else {
      if (isXepa(sourceId)) out *= 1.15;
      if (isVip(targetId)) out *= 0.85;
      if (isXepa(targetId)) out *= 1.10;
    }

    return out;
  };

  const applyPair = (xId, yId, delta) => {
    if (!xId || !yId || xId === yId) return;
    if (typeof delta !== "number" || delta === 0) return;

    state.relations[xId] = state.relations[xId] || {};
    state.relations[yId] = state.relations[yId] || {};

    const x0 = state.relations[xId][yId] ?? 0;
    const y0 = state.relations[yId][xId] ?? 0;

    let mult = delta < 0 ? REL_NEG_MULT : REL_POS_MULT;

    if (delta < 0) {
      const X = state.players.find((p) => p.id === xId);
      const Y = state.players.find((p) => p.id === yId);
      const sx = clamp(Number(X?.attrs?.serenidade ?? 5), 0, 10);
      const sy = clamp(Number(Y?.attrs?.serenidade ?? 5), 0, 10);
      mult *= 1 + (((10 - sx) + (10 - sy)) / 20) * 0.8;
    }

    if (delta > 0) {
      const X = state.players.find((p) => p.id === xId);
      const Y = state.players.find((p) => p.id === yId);
      mult *= clamp(0.15 + 0.85 * attraction01(X, Y), 0, 1);
    }

    const dx = adjustRelDelta(xId, yId, delta * mult);
    const dy = adjustRelDelta(yId, xId, delta * mult * 0.7);

    let x1 = clamp(x0 + dx, -5, 5);
    let y1 = clamp(y0 + dy, -5, 5);

    if (delta > 0) {
      const X = state.players.find((p) => p.id === xId);
      const Y = state.players.find((p) => p.id === yId);
      if (!crushAllowed(X, Y) && x1 >= CRUSH_T) x1 = CRUSH_T - 0.01;
      if (!crushAllowed(Y, X) && y1 >= CRUSH_T) y1 = CRUSH_T - 0.01;
    }

    state.relations[xId][yId] = x1;
    state.relations[yId][xId] = y1;

    if (delta > 0) maybeRevealCrush(xId, yId, x0, x1);
    maybeReciprocalCrushBonus(xId, yId);
  };

  if (scope === "coletivo") {
    const delta = d * 0.15;
    const alive = alivePlayers().map((p) => p.id);
    const involved = [aId, bId];
    const others = alive.filter((id) => !involved.includes(id));

    for (const src of involved) {
      for (const tgt of others) {
        applyPair(src, tgt, delta);
      }
    }

    applyPair(aId, bId, delta);
    return;
  }

  applyPair(aId, bId, d);
}

/* ===== Convivência ===== */
function toneFromEvent(e) {
  const aPop = e.deltaA?.pop ?? 0;
  const bPop = e.deltaB?.pop ?? 0;
  const net = aPop + bPop;
  if (net > 0.05) return "pos";
  if (net < -0.05) return "neg";
  return "neu";
}

function applyEventBlock(e) {
  if (e.a) bump(e.a, e.deltaA || {});
  if (e.b) bump(e.b, e.deltaB || {});

  const scope = e.scope || "coletivo";
  const scopeEmoji = scope === "intimo" ? "🤫" : "📢";

  if (typeof e.relDelta === "number" && e.a && e.b) {
    relAdd(e.a.id, e.b.id, e.relDelta, scope);
  }

  const tone = e.tone || toneFromEvent(e);
  const cls = tone === "pos" ? "evPos" : tone === "neg" ? "evNeg" : "evNeu";

  // Bônus de público para Monstro em eventos positivos
  if (tone === "pos") {
    const bonus = 0.22;
    if (e.a && isMonstro(e.a)) bump(e.a, { pop: +bonus });
    if (e.b && isMonstro(e.b)) bump(e.b, { pop: +bonus });
  }


  const peopleTxt = genderizeText(formatNamesInText(e.people), e.a, e.b);
  const descTxt = genderizeText(formatNamesInText(e.desc), e.a, e.b);

  const rejBase =
    tone === "neg" ? rnd(0.18, 0.45) :
    tone === "pos" ? -rnd(0.08, 0.20) :
    0;

  if (rejBase !== 0) {
    applyRejection(e.a, rejBase);
    applyRejection(e.b, rejBase * 0.8);
  }

  const vtTxt = vtToEmojis(e.vt);
const partyCls = e.theme === "party" ? (" party " + partyStyleClass()) : "";

  dayAdd(`
    <div class="dayCard ${cls}${partyCls}">
      <span style="flex:1; min-width:0;">
        <strong>${escapeHtml(peopleTxt)}</strong>: ${escapeHtml(descTxt)}.
      </span>
      <span style="white-space:nowrap; display:flex; align-items:center; gap:8px;">
        <span title="${escapeHtml(scope)}">${scopeEmoji}</span>
        <span class="vtLine" style="margin:0;">${vtTxt}</span>
      </span>
    </div>
  `);
}


  // ===== Gerador de eventos (sem internal/house) =====

  function pickOther(p, alive) {
    const others = alive.filter((x) => x.id !== p.id);
    if (!others.length) return null;

    const weighted = others.map((o) => {
      const r = relGet(p.id, o.id);
      const closeness = Math.abs(r) * 0.5;
      const base = 1.0 + closeness;
      return { item: o, w: clamp(base + rnd(0, 1.2), 0.2, 10) };
    });

    return pickWeighted(weighted);
  }

  // Preferência por "duplas estratégicas":
  // - tende a escolher alvos com estratégia alta
  // - mantém um pouco de efeito de "closeness" para não ficar robótico
  function pickOtherStrategic(p, alive) {
    const others = alive.filter((x) => x.id !== p.id);
    if (!others.length) return null;

    const pE = clamp(Number(p?.attrs?.estrategia ?? 0), 0, 10);
    const weighted = others.map((o) => {
      const r = relGet(p.id, o.id);
      const closeness = Math.abs(r) * 0.35; // menos dependente de relação do que o pickOther normal
      const oE = clamp(Number(o?.attrs?.estrategia ?? 0), 0, 10);

      // 1.0..~3.5 (quanto mais estratégia em ambos, mais "química de jogo")
      const stratAffinity = 1.0 + ((pE + oE) / 20) * 2.5;

      // leve ruído para variar pares
      const noise = rnd(0, 1.1);

      return { item: o, w: clamp(stratAffinity + closeness + noise, 0.2, 12) };
    });

    return pickWeighted(weighted);
  }


  const EVENT_TEXTS = {
  neutral: {
    desc: [
      "some do jogo completamente ☁️",
      "vira planta decorativa 🪴",
      "fica no modo avião ✈️",
      "faz figuração no episódio 🎭",
      "existe sem deixar marca 🌫️",
      "mantém presença neutra demais 🧊",
      "assiste tudo de camarote 🍿",
      "não compra briga nenhuma 🤷",
      "não cria laço algum 🪨",
      "passa {a:despercebido|despercebida|despercebide} geral 👻",
      "entrega um dia morno 🌡️",
      "vive sem conflitos nem alianças 😶",
      "não serve nem pra irritar 😴",
      "evita tudo que rende VT 🚪",
      "sobrevive sem jogar 💤",
      "parece já {a:eliminado|eliminada|eliminade} 🫥",
      "fica em silêncio absoluto 🤐",
      "ocupa espaço sem impacto 🧍",
      "não vira assunto de ninguém 🗒️",
      "vira só cenário hoje 🖼️"
    ],
    vt: [
      "neutro, sem enredo",
      "pouco VT, passou batido",
      "morno, não engatou",
      "neutro, presença baixa"
    ]
  },

  // Cotidiano leve/engraçado (não-estratégico)
  housefun: {
    desc: [
      "faz uma receita e dá tudo errado na cozinha 🍳",
      "derruba coisa no chão e vira piada interna 😂",
      "se perde numa dança e todo mundo ri 🕺",
      "faz imitação de alguém da casa e gera caos leve 🎭",
      "inventa uma brincadeira boba e a casa entra na onda 🎲",
      "conta uma história absurda e ninguém sabe se é verdade 🤥",
      "faz um comentário aleatório que vira bordão do dia 🗯️",
      "tenta limpar a casa e começa uma confusão de organização 🧼",
      "erra o nome de alguém e rende risada desconfortável 😅",
      "vira meme por um momento sem querer 📸",
      "fica cantando baixinho e incomoda e diverte ao mesmo tempo 🎶",
      "inventa apelidos e espalha pela casa 🏷️",
      "faz careta na câmera e chama atenção da edição 📺",
      "se empolga num jogo de cartas improvisado ♠️",
      "se atrapalha carregando prato e quase derruba tudo 🥣",
      "faz piada ruim e insiste até alguém rir 🤡",
      "se fantasia com coisas aleatórias e vira cena pronta 🧦",
      "puxa uma brincadeira de 'verdade ou consequência' improvisada 🎤",
      "se mete numa coreografia improvisada e paga mico 🪩",
      "ri de nervoso e contagia o resto da casa 😬"
    ],
    vt: [
      "positivo, leve e engraçado",
      "positivo, meme do dia",
      "misto, vergonha alheia",
      "positivo, respiro na casa"
    ],
    scope: "coletivo"
  },

  social: {
  desc: [
    "fazem resenha e criam conexão 💬",
    "criam afinidade naturalmente ✨",
    "riem juntos e se aproximam 😄",
    "conversam e viram parceria 🤝",
    "ficam colados o dia todo 👥",
    "mantêm clima leve e cúmplice 🌈",
    "começam uma amizade 🧵",
    "trocam confidências no quarto 🛏️",
    "se entendem sem esforço 🤍",
    "viram companhia constante 👀",
    "se defendem mutuamente 🛡️",
    "mostram afinidade pra casa 👁️",
    "fazem papo bobo virar laço 🤪",
    "passam tempo demais juntos ⏳",
    "agem como dupla antiga 🧩",
    "se alinham no silêncio 👂",
    "geram comentários pela casa 🗣️",
    "viram fofoca inocente rapidinho 🫢",
    "fazem cochichos circularem 🐍",
    "viram assunto do dia 📢"
  ],
  vt: [
    "positivo, rende torcida",
    "positivo, VT fofo",
    "positivo, recorte fácil",
    "positivo, carisma em alta"
  ],
  scope: "intimo"
},

 conflict: {
  desc: [
    "começam treta pequena ⚡",
    "trocam farpas do nada 🌵",
    "entram em discussão desnecessária 🍽️",
    "causam um bate-boca generalizado 🔊",
    "se recusam a ceder numa discussão 🧱",
    "brigam por conta de ego 🎈",
    "fazem o clima da casa azedar 🍋",
    "discutem por besteira 🤦",
    "elevam o tom numa discussão 📢",
    "trocam acusações na cara 🎯",
    "instalam um climão pesado 😬",
    "dizem coisas que não voltam 💥",
    "tentam conversar e acabam brigando 🧨",
    "reabrem treta velha 👻",
    "trazem ressentimento à tona 🪨",
    "lançam olhares atravessados 👀",
    "levam tudo pro lado pessoal 💣",
    "usam comentários como munição 🧨",
    "deixam fofoca alimentar uma briga 🐍",
    "inflamam tudo com versões distorcidas 🔥"
  ],
  bigDesc: [
    "protagonizam um barraco gigantesco 🔥",
    "fazem a treta dividir a casa 🧨",
    "viram marco pesado da convivência 🧱",
    "tem um choque de personalidades 💥"
  ],
  vt: [
    "negativo, treta rende e pesa",
    "negativo, público escolhe lado",
    "muito negativo, climão",
    "negativo, pode virar rejeição"
  ],
  scope: "coletivo"
},

  strategy: {
    descSmart: [
      "lê bem o jogo ♟️",
      "faz jogada silenciosa 🧠",
      "planta ideia certeira 🌱",
      "articula voto com cuidado 🤫",
      "mexe peças invisivelmente 🎭",
      "pensa à frente 📊",
      "coleta informação valiosa 👂",
      "faz movimento limpo e eficiente 🪡",
      "se posiciona melhor 🧩",
      "faz jogo fino 🧠",
      "testa lealdades discretamente 👁️",
      "atua sem se expor 🛡️",
      "acerta o timing ⏳",
      "controla a narrativa discretamente 🧵",
      "pega a hora certa 🕰️",
      "usa fofoca como termômetro 🐍",
      "ouve mais do que fala 👂",
      "deixa outros se queimarem 🔥",
      "joga com paciência 🐍",
      "calcula riscos com frieza 🎯"
    ],
    descMessy: [
      "fala demais de jogo 🚨",
      "passa recibo ao vivo 📝",
      "tenta articular e se enrola 🌀",
      "quer bancar gênio 🤡",
      "deixa o jogo aberto demais 👣",
      "mistura versões e confunde 🕸️",
      "se contradiz na mesma frase 🧩",
      "deixa ansiedade entregar tudo 😬",
      "promete demais pra geral 💳",
      "confunde aliados com papo torto 🤯",
      "deixa estratégia virar fofoca 🐍",
      "vaza o plano rápido 💨",
      "fala com gente demais 📢",
      "vê comentários voltarem distorcidos 🔄",
      "vira alvo por falar demais 🎯",
      "faz a jogada sair pela culatra 🪤",
      "deixa fofoca expor o plano 🧨",
      "perde confiança de geral 🚫",
      "perde o controle da narrativa 📉",
      "tenta explicar e piora 🧯"
    ],
    vt: [
      "misto, inteligente mas pode soar armado",
      "misto, mexeu no radar",
      "misto, leitura de jogo",
      "misto, movimentou a casa"
    ],
    scope: "intimo"
  },

  emotional: {
    meltdown: [
      "desaba emocionalmente 😢",
      "chora sem segurar 🌊",
      "sente a pressão esmagar 💔",
      "vive uma crise forte 📺",
      "pensa em desistir 🚪",
      "se isola totalmente 🫥",
      "expõe fragilidade 🫀",
      "carrega um dia pesado 🧠",
      "faz um desabafo intenso 😭",
      "perde o chão 🌪️",
      "deixa emoção dominar 🎭",
      "entra num silêncio gritante 🤐",
      "sente saudade bater forte 🌧️",
      "vive um colapso emocional 💥",
      "não aguenta a carga 🪨",
      "chora sozinho no quarto 🛏️",
      "fica com olhar perdido 👁️",
      "fica em frangalhos 🧩",
      "se sente {a:excluído|excluída|excluíde} 😞",
      "sente o peso do jogo ⚖️"
    ],
    rise: [
      "se recompõe 🦁",
      "volta mais forte 📈",
      "ganha apoio da casa 🫂",
      "se levanta após queda ⚓",
      "muda a postura 🧭",
      "transforma dor em foco 🔥",
      "retoma o controle 🧠",
      "mostra resiliência 🛡️",
      "reage bem 🌱",
      "estabiliza o emocional 🧩",
      "recupera confiança 💪",
      "segura firme 🎯",
      "respira e volta 🫧",
      "cresce com a pressão 🧗",
      "mostra superação clara 🌤️",
      "se fortalece por dentro 🪵",
      "não se deixa quebrar 🧱",
      "muda a energia visivelmente ✨",
      "surpreende a casa 👀",
      "volta diferente hoje 🔄"
    ],
    vt: [
      "positivo, rende empatia",
      "misto, divide opiniões",
      "positivo, arco emocional",
      "misto, intensidade alta"
    ],
    scope: "coletivo"
  },

  romance: {
  desc: [
    "deixam clima no ar 💘",
    "trocam olhares constantes 👁️",
    "flertam sem disfarçar 🌹",
    "fazem chamego suspeito 🍯",
    "trocam toques frequentes 🫶",
    "não desgrudam nem um minuto 👀",
    "mostram química visível 😌",
    "fazem romance despontar 🌙",
    "forçam proximidade exagerada 😏",
    "soltam risadinhas entregadoras 🤭",
    "sentam colados no sofá 🛋️",
    "mantêm conversa só entre eles 🫣",
    "vivem um climinha constante 💞",
    "aceleram a intimidade ⏩",
    "viram proteção mútua 🛡️",
    "criam tensão romântica 🔥",
    "chegam no quase beijo 👄",
    "fazem o mundo sumir ao redor 🌌",
    "viram comentário pela casa 🗣️",
    "viram fofoca rápida 🐍"
  ],
  vt: [
    "positivo, casal rende",
    "positivo, recorte romântico",
    "positivo, torcida nasce",
    "misto, romance muda prioridades"
  ],
  scope: "intimo"
},

  attention: {
    pos: [
      "ganha destaque ⭐",
      "cresce na edição 🔝",
      "marca presença forte ✨",
      "aparece bem hoje 🎥",
      "assume protagonismo natural 🧭",
      "mantém carisma em alta 😄",
      "crava um momento certeiro 🎯",
      "sabe aparecer 📸",
      "vira queridinho da edição 📺",
      "entrega um VT bom 🎬",
      "chama atenção positivamente 🌟",
      "mostra crescimento claro 📈",
      "vira presença marcante 🧲",
      "faz o nome circular 🗣️",
      "brilha no momento 💫",
      "cresce no jogo 🎮",
      "vira assunto positivo 🗨️",
      "ganha aplausos 👏",
      "vira referência do dia 📌",
      "atrai olhares pra si 👁️"
    ],
    neg: [
      "força protagonismo 🤡",
      "quer aparecer demais 🍭",
      "exagera na cena 🎬",
      "soa artificial 🔊",
      "faz um monólogo constrangedor 🪞",
      "aparece pelo motivo errado ❌",
      "gera carisma questionável 😬",
      "irrita pelo excesso 🧨",
      "vira teatral demais 🎭",
      "faz falação vazia 🗣️",
      "busca VT a qualquer custo 📺",
      "força narrativa própria 🧵",
      "pega mal geral 🚫",
      "gera rejeição na casa 😒",
      "vira piada interna 🤡",
      "vira chacota nos comentários 😂",
      "alimenta fofoca e rejeição 🐍",
      "se expõe sem necessidade 👀",
      "tenta roubar a cena 🎪",
      "vira alvo fácil 🎯"
    ],
    vtPos: [
      "positivo, melhora presença",
      "positivo, rende recorte",
      "positivo, cresce na edição"
    ],
    vtNeg: [
      "negativo, leitura de forçado",
      "negativo, pegou mal",
      "negativo, vira alvo",
      "muito negativo, irrita a casa"
    ],
    scope: "coletivo"
  }
};


  function genEventForPlayer(p, ctx, alive) {
    let other = pickOther(p, alive);

    const festaBoost = ctx.festa ? 1.35 : 1.0;
    const tensionBoost = ctx.tension ? 1.15 : 1.0;

    const mood = ctx?.mood || { tension: ctx.tension ? 0.85 : 0.45, paranoia: 0.45, leveza: ctx.festa ? 0.65 : 0.35 };
    const mults = ctx?.catMults || {};

    const wNeutral0 = 1.6 + p.attrs.rejeicao * 0.05;
    const wSocial0 = p.attrs.social * 0.9;
    const wConflict0 = p.attrs.conflito * 0.95 * festaBoost * tensionBoost * (1.0 + 0.40 * (mood.tension ?? 0));
    const wStrategy0 = p.attrs.estrategia * 0.9 * (ctx.festa ? 0.9 : 1.0) * (0.55 + 0.80 * (mood.paranoia ?? 0));
    const wEmo0 = (10 - p.attrs.emocional) * 0.75 * (1.0 + 0.55 * (mood.tension ?? 0));
    const wRomance0 = (p.attrs.social * 0.6 + p.attrs.emocional * 0.25) * (ctx.festa ? 1.4 : 0.9) * (0.65 + 0.70 * (mood.leveza ?? 0));
    const wAttention0 = (p.attrs.social * 0.55 + p.attrs.estrategia * 0.25 + p.attrs.emocional * 0.1) * (ctx.festa ? 1.35 : 1.0);
    // Mais peso pra eventos leves: festa + leveza do dia contam mais.
    const wHouseFun0 = (0.55 + p.attrs.social * 0.08 + (ctx.festa ? 0.75 : 0) + (mood.leveza ?? 0) * 1.2);

    const wNeutral = wNeutral0 * (mults.neutral ?? 1);
    const wSocial = wSocial0 * (mults.social ?? 1);
    const wConflict = wConflict0 * (mults.conflict ?? 1);
    const wStrategy = wStrategy0 * (mults.strategy ?? 1);
    const wEmo = wEmo0 * (mults.emotional ?? 1);
    const wRomance = wRomance0 * (mults.romance ?? 1);
    const wAttention = wAttention0 * (mults.attention ?? 1);
    const wHouseFun = wHouseFun0 * (mults.housefun ?? 1);

    const cat = pickWeighted([
      { item: "neutral", w: wNeutral },
      { item: "social", w: wSocial },
      { item: "conflict", w: wConflict },
      { item: "strategy", w: wStrategy },
      { item: "emotional", w: wEmo },
      { item: "romance", w: wRomance },
      { item: "attention", w: wAttention },
      { item: "housefun", w: wHouseFun }
    ]);

    
    // Se cair em "strategy", tende a parear com gente estratégica também
    if (cat === "strategy") {
      const picked = pickOtherStrategic(p, alive);
      if (picked) other = picked;
    }
const POP_EVENT_MULT = 1.65;
    const popDelta = (x) => clamp(x * POP_EVENT_MULT, -3.6, 3.6);
    const alvoDelta = (x) => clamp(x, -2.2, 2.2);
    const theme = ctx.festa ? "party" : "default";

    if (cat === "neutral") {
      const dPop = -0.07 - (p.status.pop > 7.8 ? 0.05 : 0);
      return {
        eid: "neutral",
        theme,
        people: p.name,
        desc: pickOne(EVENT_TEXTS.neutral.desc),
        vt: pickOne(EVENT_TEXTS.neutral.vt),
        a: p,
        b: null,
        deltaA: { pop: popDelta(dPop) },
        deltaB: null,
        relDelta: 0
      };
    }

    if (cat === "housefun") {
      // evento leve e engraçado (não-estratégico): varia entre solo e dupla
      const duo = (other && Math.random() < 0.45);
      const dPopA = popDelta(0.08 + (ctx.festa ? 0.06 : 0) + rnd(-0.10, 0.12));
      const dPopB = duo ? popDelta(0.05 + (ctx.festa ? 0.05 : 0) + rnd(-0.10, 0.10)) : 0;
      const dRel = duo ? clamp(0.35 + rnd(-0.15, 0.25), 0.05, 0.9) : 0;
      return {
        eid: duo ? "housefun_duo" : "housefun_solo",
        theme,
        people: duo ? `${p.name} e ${other.name}` : p.name,
        desc: pickOne(EVENT_TEXTS.housefun.desc),
        vt: pickOne(EVENT_TEXTS.housefun.vt),
        scope: duo ? "coletivo" : "coletivo",
        a: p,
        b: duo ? other : null,
        deltaA: { pop: dPopA, alvo: alvoDelta(-0.10 + rnd(-0.10, 0.08)) },
        deltaB: duo ? { pop: dPopB, alvo: alvoDelta(-0.06 + rnd(-0.10, 0.08)) } : null,
        relDelta: dRel
      };
    }

    if (cat === "social" && other) {
      const kindness = (p.attrs.social + other.attrs.social) / 2;
      const dRel = clamp(0.8 + kindness * 0.06 + rnd(-0.3, 0.35), 0.3, 1.4);
      const dPopA = popDelta(0.1 + p.attrs.social * 0.03 - p.attrs.rejeicao * 0.02 + rnd(-0.08, 0.12));
      const dPopB = popDelta(0.07 + other.attrs.social * 0.03 - other.attrs.rejeicao * 0.02 + rnd(-0.08, 0.12));
      return {
        eid: "social",
        theme,
        people: `${p.name} e ${other.name}`,
        desc: pickOne(EVENT_TEXTS.social.desc),
        vt: pickOne(EVENT_TEXTS.social.vt),
        scope: EVENT_TEXTS.social.scope,
        a: p,
        b: other,
        deltaA: { pop: dPopA, alvo: alvoDelta(-0.10 + rnd(-0.08, 0.10)) },
        deltaB: { pop: dPopB, alvo: alvoDelta(-0.06 + rnd(-0.08, 0.10)) },
        relDelta: dRel
      };
    }

    if (cat === "conflict" && other) {
      const heat = (p.attrs.conflito + other.attrs.conflito) / 2;
      const escalated = (heat > 6.2 && (p.attrs.emocional < 6 || other.attrs.emocional < 6)) || (ctx.festa && heat > 5.2);
      const dPopA = popDelta(-0.15 + rnd(-0.12, 0.12));
      const dPopB = popDelta(-0.15 + rnd(-0.12, 0.12));
      const dAlvoA = alvoDelta(0.35 + rnd(-0.10, 0.18));
      const dAlvoB = alvoDelta(0.35 + rnd(-0.10, 0.18));
      const dRel = -clamp(1.0 + heat * 0.08 + rnd(-0.35, 0.25), 0.6, 2.0);
      return {
        eid: escalated ? "conflict_big" : "conflict",
        theme,
        people: `${p.name} e ${other.name}`,
        desc: escalated ? pickOne(EVENT_TEXTS.conflict.bigDesc) : pickOne(EVENT_TEXTS.conflict.desc),
        vt: pickOne(EVENT_TEXTS.conflict.vt),
        scope: EVENT_TEXTS.conflict.scope,
        a: p,
        b: other,
        deltaA: { pop: dPopA, alvo: dAlvoA },
        deltaB: { pop: dPopB, alvo: dAlvoB },
        relDelta: dRel
      };
    }

    if (cat === "strategy" && other) {
      const pE = clamp(Number(p?.attrs?.estrategia ?? 0), 0, 10);
      const oE = clamp(Number(other?.attrs?.estrategia ?? 0), 0, 10);
      const synergy = clamp((pE + oE) / 20, 0, 1);
      // Quanto mais "estratégia" em ambos, maior a chance de o evento ser positivo/competente.
      const smartChance = clamp(0.25 + 0.75 * synergy, 0.10, 0.95);
      const smart = Math.random() < smartChance;
      const dPopA = popDelta((smart ? 0.12 : -0.05) + rnd(-0.12, 0.12));
      const dAlvoA = alvoDelta((smart ? 0.22 : 0.08) + rnd(-0.10, 0.12));
      return {
        eid: smart ? "strategy_smart" : "strategy_messy",
        theme,
        people: `${p.name} (com ${other.name})`,
        desc: smart ? pickOne(EVENT_TEXTS.strategy.descSmart) : pickOne(EVENT_TEXTS.strategy.descMessy),
        vt: pickOne(EVENT_TEXTS.strategy.vt),
        scope: EVENT_TEXTS.strategy.scope,
        a: p,
        b: other,
        deltaA: { pop: dPopA, alvo: dAlvoA },
        deltaB: { pop: popDelta(rnd(-0.05, 0.08)), alvo: alvoDelta(rnd(-0.05, 0.12)) },
        relDelta: smart ? 0.4 : -0.2
      };
    }

    if (cat === "emotional") {
      const meltdown = p.attrs.emocional < 5.0;
      const dPop = popDelta((meltdown ? 0.10 : 0.18) + rnd(-0.12, 0.12));
      const dAlvo = alvoDelta((meltdown ? 0.10 : -0.10) + rnd(-0.12, 0.12));
      return {
        eid: meltdown ? "emotional_meltdown" : "emotional_rise",
        theme,
        people: p.name,
        desc: meltdown ? pickOne(EVENT_TEXTS.emotional.meltdown) : pickOne(EVENT_TEXTS.emotional.rise),
        vt: pickOne(EVENT_TEXTS.emotional.vt),
        scope: EVENT_TEXTS.emotional.scope,
        a: p,
        b: null,
        deltaA: { pop: dPop, alvo: dAlvo },
        deltaB: null,
        relDelta: 0
      };
    }

    if (cat === "romance" && other) {
      const chemistry = (p.attrs.social + other.attrs.social + p.attrs.emocional + other.attrs.emocional) / 4;
      const dRel = clamp(0.7 + chemistry * 0.07 + rnd(-0.25, 0.35), 0.4, 1.8);
      const dPopA = popDelta(0.14 + (ctx.festa ? 0.08 : 0) + rnd(-0.12, 0.12));
      const dPopB = popDelta(0.14 + (ctx.festa ? 0.08 : 0) + rnd(-0.12, 0.12));
      return {
        eid: "romance",
        theme,
        people: `${p.name} e ${other.name}`,
        desc: pickOne(EVENT_TEXTS.romance.desc),
        vt: pickOne(EVENT_TEXTS.romance.vt),
        scope: EVENT_TEXTS.romance.scope,
        a: p,
        b: other,
        deltaA: { pop: dPopA, alvo: alvoDelta(rnd(-0.05, 0.18)) },
        deltaB: { pop: dPopB, alvo: alvoDelta(rnd(-0.05, 0.18)) },
        relDelta: dRel
      };
    }

    // attention
    const score = rnd(-2.2, 2.2);
    const dPop = clamp(score * 0.55, -2.8, 2.8);
    const dAlvo = clamp((score < 0 ? 0.6 : 0.15) + rnd(-0.1, 0.2), 0, 1.2);
    const pos = score > 0;
    return {
      eid: pos ? "attention_pos" : "attention_neg",
      theme,
      people: p.name,
      desc: pos ? pickOne(EVENT_TEXTS.attention.pos) : pickOne(EVENT_TEXTS.attention.neg),
      vt: pos ? pickOne(EVENT_TEXTS.attention.vtPos) : pickOne(EVENT_TEXTS.attention.vtNeg),
      scope: EVENT_TEXTS.attention.scope,
      a: p,
      b: null,
      deltaA: { pop: dPop, alvo: dAlvo },
      deltaB: null,
      relDelta: 0
    };
  }
// ===== FESTA: tema semanal + emojis + banner =====
const PARTY_BASES = [
  "Circo", "Fundo do Mar", "Velho Oeste", "Espaço", "Roma", "Egito",
  "Floresta Encantada", "Cangaço", "Oficina", "Laboratório", "Parque de Diversões",
  "Cassino", "Piquenique", "Aeroporto", "Biblioteca", "Construção",
  "Fundo do Quintal", "Navio Pirata", "Metrô", "Castelo", "Vila Italiana", "Templo Asteca",
  "Festa de Debutante", "Acampamento", "Estúdio de TV", "Hospital", "Cozinha",
  "Fazenda de Chocolate", "Polo Norte", "Jardim"
];

const PARTY_STYLES = [
  "Anos 80", "Gótica", "Cyberpunk", "Neon", "Barbiecore", "Zumbi", "Disco", "Minimalista", "Punk Rock",
  "Barroco", "Steampunk", "do K-Pop", "Vintage", "Holográfica", "Safari", "do Hip-Hop", "do Caos", "Naval",
  "Folclorista", "Oriental Futurista", "Heavy Metal", "em Preto e Branco", "Psicadélica", "Militar",
  "com Glitter", "Boho Chic", "Infantil", "Pin-up", "Grunge", "Surrealista"
];

const PARTY_BASE_EMOJI = {
  "Circo": "🎪",
  "Fundo do Mar": "🌊",
  "Velho Oeste": "🤠",
  "Espaço": "🪐",
  "Roma": "🏛️",
  "Egito": "🏺",
  "Floresta Encantada": "🧚",
  "Cangaço": "🏜️",
  "Oficina": "🔧",
  "Laboratório": "🧪",
  "Parque de Diversões": "🎡",
  "Cassino": "🎰",
  "Piquenique": "🧺",
  "Aeroporto": "✈️",
  "Biblioteca": "📚",
  "Construção": "🚧",
  "Fundo do Quintal": "🏡",
  "Navio Pirata": "🏴‍☠️",
  "Metrô": "🚇",
  "Castelo": "🏰",
  "Vila Italiana": "🍝",
  "Templo Asteca": "🗿",
  "Festa de Debutante": "👑",
  "Acampamento": "🏕️",
  "Estúdio de TV": "📺",
  "Hospital": "🏥",
  "Cozinha": "🍳",
  "Fazenda de Chocolate": "🍫",
  "Polo Norte": "❄️",
  "Jardim": "🌿"
};

const PARTY_STYLE_EMOJI = {
  "Anos 80": "📼",
  "Gótica": "🦇",
  "Cyberpunk": "🤖",
  "Neon": "💡",
  "Barbiecore": "🎀",
  "Zumbi": "🧟",
  "Disco": "🪩",
  "Minimalista": "⬜",
  "Punk Rock": "🎸",
  "Barroco": "🎻",
  "Steampunk": "⚙️",
  "do K-Pop": "🎤",
  "Vintage": "📻",
  "Holográfica": "🌈",
  "Safari": "🦁",
  "do Hip-Hop": "🎧",
  "do Caos": "💥",
  "Naval": "⚓",
  "Folclorista": "🪘",
  "Oriental Futurista": "🧧",
  "Heavy Metal": "🤘",
  "em Preto e Branco": "⚫",
  "Psicadélica": "🍄",
  "Militar": "🪖",
  "com Glitter": "✨",
  "Boho Chic": "🪬",
  "Infantil": "🧸",
  "Pin-up": "💄",
  "Grunge": "🖤",
  "Surrealista": "🌀"
};
	
const SHOWS_BBB = [
    "Lady Gaga",
    "Beyoncé",
    "Dua Lipa",
    "Katy Perry",
    "Rihanna",
    "Britney Spears",
    "Miley Cyrus",
    "Anitta",
    "Ludmilla",
    "Pabllo Vittar",
    "Lia Clark",
    "Tati Quebra Barraco",
    "Gretchen",
    "Valesca Popozuda",
    "MC Joãozinho da VT",
    "Banda Uó",
    "Gloria Groove",
    "Joelma",
    "Xuxa",
    "É o Tchan",
    "NX Zero",
    "Calcinha Preta",
    "Mamonas Assassinas Cover",
    "Rouge",
    "Restart",
    "Backstreet Boys",
    "Coldplay",
    "Sobrinho do Boninho e sua Banda de Garagem",
    "DJ de Casamento que só toca Evidências",
    "Grupo de Pagode do Zelador do Projac",
    "Cover oficial do Roberto Carlos",
    "Banda de Fanfarra de Taubaté",
    "Coral de Estagiários da Globoplay",
    "Dupla Sertaneja que só canta música triste",
    "Mágico de festa infantil que erra os truques",
    "Apresentação de slides do Tadeu Schmidt",
    "Trio elétrico de uma pessoa só",
    "Vovó do TikTok fazendo dancinha",
    "Bonecos Gigantes de Olinda dos participantes",
    "Vocalista de churrascaria com teclado Cassio",
    "Os Robôs do BBB dançando funk",
    "Banda Marcial da Polícia Militar",
    "Madonna",
    "Bruce o Artista",
    "Taylor Swift, mas ela cancelou e veio Paula Fernandes",
    "Lana Del Rey",
    "Doja Cat",
    "Flordelis",
    "Rupaul",
    "Shakira",
    "Rosalía",
    "Bruno Mars",
    "Adele",
    "MC Pipokinha",
    "Inês Brasil",
    "MC Carol de Niterói",
    "DJ Kavis",
    "Bonde do Tigrão",
    "Latino",
    "Kelly Key",
    "Felipe Dylon",
    "MC Bin Laden",
    "Carreta Furacão",
    "Gaby Amarantos",
    "Luísa Sonza",
    "Raça Negra",
    "Skank",
    "Angra",
    "Molejo",
    "Massacration",
    "Grupo Revelação",
    "Falamansa",
    "Quarteto de cordas tocando funk proibidão",
    "Cantor de Ópera que só canta temas de reality",
    "Grupo de sósias do Tadeu Schmidt",
    "Banda de Axé Gospel",
    "Trio de berranteiros do Pantanal",
    "Apresentação de Karatê da academia do bairro",
    "DJ de churrascaria que fala por cima das músicas",
    "Cover do Elvis que esqueceu a letra",
    "Ex participante de BBB que lançou um single",
    "Banda de Pífano tocando techno",
    "Coral de Dubladores da Globo",
    "Animador de plateia do Domingão",
    "Dupla Sertaneja Universitária de primeiro semestre",
    "Percursionista que toca apenas baldes de tinta",
    "O próprio Boninho fazendo um set de DJ",
    "Tecladista de churrascaria com ritmo de pisadinha",
    // NOVAS ADIÇÕES
    "Ratos de Porão",
    "Wanessa Camargo",
    "Manu Gavassi",
    "Karol Conká",
    "Projota",
    "Naiara Azevedo",
    "Rodriguinho",
    "Gabi Martins",
    "Edinéia Macedo",
    "Stefany Absoluta",
    "MC Loma e as Gêmeas Lacração",
    "Tulla Luana cantando no chuveiro",
    "Vyni cantando músicas da Broadway",
    "Juliette",
    "Rodolffo e sua dupla",
    "Pocah",
    "Babu Santana e sua banda",
    "Fiuk",
    "Tiago Abravanel",
    "Arthur Aguiar",
    "Karaokê",
    "Drag queens",
    "Músicas de elevador",
    "Ximbica",
    "Maria Bethânia",
    "Drones",
    "Influencers que fazem dancinha",
    "Carreta Furacão",
    "Horrores",
    "Manoel Gomes Caneta Azul"
];

// ===== FESTA DO PATROCINADOR (Sábado) =====
// Patrocinadores fictícios/paródias. Cores inspiradas nas marcas originais.
const SPONSOR_BRANDS = [
  { name: "Cola-Cola", color: "#F40009", emoji: "🥤" },
  { name: "Guaraná Antártica", color: "#007A3D", emoji: "🧉" },
  { name: "PepsiColaço", color: "#004B93", emoji: "🥤" },
  { name: "Red Touro", color: "#DB0A40", emoji: "🐂" },
  { name: "Monsterzinho", color: "#00A651", emoji: "👾" },

  { name: "McDonuts", color: "#FFC72C", emoji: "🍔" },
  { name: "Burger Príncipe", color: "#D62300", emoji: "👑" },
  { name: "SubJeito", color: "#009B3A", emoji: "🥪" },
  { name: "KFC (Kilo de Frango Caseiro)", color: "#E4002B", emoji: "🍗" },
  { name: "Habibis", color: "#E30613", emoji: "🥙" },

  { name: "iComida", color: "#EA1D2C", emoji: "🍽️" },
  { name: "iFome", color: "#EA1D2C", emoji: "🍽️" },
  { name: "UberEatsNada", color: "#06C167", emoji: "🛵" },
  { name: "99Fome", color: "#FFB100", emoji: "🛵" },
  { name: "RappiDois", color: "#FF441F", emoji: "🛵" },

  { name: "Amazoom", color: "#FF9900", emoji: "📦" },
  { name: "Mercado Líder", color: "#FFE600", emoji: "🛒" },
  { name: "Shopeepe", color: "#EE4D2D", emoji: "🛍️" },
  { name: "AliExpresso", color: "#FF4747", emoji: "🛍️" },
  { name: "Magaluja", color: "#0086FF", emoji: "🛒" },

  { name: "Clarão", color: "#E60000", emoji: "📶" },
  { name: "VivoMortinho", color: "#660099", emoji: "📶" },
  { name: "MortoTIM", color: "#002E6D", emoji: "📶" },
  { name: "OiSumido", color: "#D5007F", emoji: "📶" },
  { name: "NetNada", color: "#E2001A", emoji: "📶" },

  { name: "Banco do Brasel", color: "#F9D616", emoji: "🏦" },
  { name: "Caixa Preta", color: "#005CA9", emoji: "🏦" },
  { name: "Nubranquinho", color: "#8A05BE", emoji: "🏦" },
  { name: "Itauzinho", color: "#EC7000", emoji: "🏦" },
  { name: "PicPayzinho", color: "#11C76F", emoji: "🏦" },

  { name: "NaturaSus", color: "#2E7D32", emoji: "🧴" },
  { name: "O Boticário", color: "#006B3F", emoji: "🧴" },
  { name: "Avonha", color: "#E71D73", emoji: "💄" },
  { name: "Jequitiquê", color: "#C9A227", emoji: "✨" },
  { name: "Quem Disse Berenice?", color: "#C6007E", emoji: "💄" },

  { name: "RexNada", color: "#0072CE", emoji: "🧼" },
  { name: "DoveNada", color: "#1A5DA8", emoji: "🧼" },
  { name: "Colgato", color: "#D52B1E", emoji: "🪥" },
  { name: "Sorriso Amarelo", color: "#F57C00", emoji: "😁" },
  { name: "NeveNeve", color: "#2F80ED", emoji: "🧻" },

  { name: "Netflixxx", color: "#E50914", emoji: "📺" },
  { name: "Amazin Prime", color: "#00A8E1", emoji: "📺" },
  { name: "Globoplayboy", color: "#FF0033", emoji: "📺" },
  { name: "Disnhei+", color: "#113CCF", emoji: "✨" },
  { name: "HBO GoEmbora", color: "#6F2DBD", emoji: "📺" },

  { name: "OnlyFãs", color: "#00AFF0", emoji: "💙" },
  { name: "OnlyCasa", color: "#00AFF0", emoji: "🏠" },
  { name: "Privacyzada", color: "#111111", emoji: "🔒" },
  { name: "FansSó", color: "#111111", emoji: "🔒" },
  { name: "Close Friends Premium", color: "#00A651", emoji: "🟢" },

  { name: "TikTeko", color: "#25F4EE", emoji: "🎵" },
  { name: "InstaGrama", color: "#C13584", emoji: "📸" },
  { name: "FaceBookado", color: "#1877F2", emoji: "👥" },
  { name: "Xuiter", color: "#111111", emoji: "🗯️" },
  { name: "ZapZap", color: "#25D366", emoji: "💬" },

  { name: "Casas Bahiazinha", color: "#0033A0", emoji: "🛋️" },
  { name: "Ponto Friozinho", color: "#00B0F0", emoji: "❄️" },
  { name: "Lojas Americanas 2", color: "#E30613", emoji: "🏬" },
  { name: "Pernambucanas", color: "#E2001A", emoji: "🏬" },
  { name: "Havan’t", color: "#0033A0", emoji: "🏬" }
];

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { r, g, b };
}

function hexToRgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  const alpha = clamp(Number(a ?? 1), 0, 1);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Patrocinador ÚNICO por semana (semana nova = patrocinador novo)
function ensureSponsorPartyObj() {
  state.weekState = state.weekState || {};

  if (state.weekState.sponsorPartyWeek !== state.week) {
    state.weekState.sponsorPartyWeek = state.week;
    state.weekState.sponsorPartyObj = null;
  }
  if (state.weekState.sponsorPartyObj) return state.weekState.sponsorPartyObj;

  state.usedSponsorParties = state.usedSponsorParties || {};

  let candidates = (SPONSOR_BRANDS || []).filter(s => s && !state.usedSponsorParties[String(s.name)]);
  if (!candidates.length) {
    state.usedSponsorParties = {};
    candidates = (SPONSOR_BRANDS || []).slice();
  }

  const chosen = pickOne(candidates);
  state.weekState.sponsorPartyObj = chosen;
  state.usedSponsorParties[String(chosen.name)] = true;

  return chosen;
}

function sponsorPartyBannerHtml() {
  const s = ensureSponsorPartyObj();
  const sName = s?.name ? String(s.name) : "Patrocinador";
  const sColor = s?.color || "#EEC052";
  const sEmoji = s?.emoji || "🛍️";

  const title = `${sEmoji} ${sEmoji} ${sEmoji} Festa do Patrocinador: ${sName} ${sEmoji} ${sEmoji} ${sEmoji}`;
  const subtitle = "Tema: produtos do patrocinador";

  return `
    <div class="dayCard party sponsorParty" style="
      background: linear-gradient(135deg, ${hexToRgba(sColor, 0.28)}, rgba(255,255,255,0.06));
      border: 1px solid ${hexToRgba(sColor, 0.30)};
    ">
      <span style="flex:1; min-width:0; font-size:22px; font-weight:900; line-height:1.2; text-align:center;">
        ${escapeHtml(title)}
        <div style="margin-top:4px; font-weight:600; font-size:11px; opacity:.9;">
          ${escapeHtml(subtitle)}
        </div>
      </span>
    </div>
  `;
}


function getLeaderForParty() {
  const leaderId = state?.weekState?.leaderId ?? state?.weekState?.lastLeaderId ?? null;
  if (!leaderId) return null;
  return state.players.find(p => p.id === leaderId) || null;
}

// Tema UNICO por semana (semana nova = tema novo)
function ensurePartyThemeObj() {
  state.weekState = state.weekState || {};

  if (state.weekState.partyThemeWeek !== state.week) {
    state.weekState.partyThemeWeek = state.week;
    state.weekState.partyThemeObj = null;
  }

  if (state.weekState.partyThemeObj) return state.weekState.partyThemeObj;
state.partyUsedCombos = state.partyUsedCombos || {};

  let tries = 0;
let base, style, key;

do {
  base = pickOne(PARTY_BASES);
  style = pickOne(PARTY_STYLES);
  key = `${base}__${style}`;
  tries++;
  // evita loop infinito quando acabar combinacao
} while (state.partyUsedCombos[key] && tries < 200);

state.partyUsedCombos[key] = true;
state.weekState.partyThemeObj = { base, style };
return state.weekState.partyThemeObj;
}
function slugifyPartyStyle(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")                       // vira hifen
    .replace(/(^-|-$)/g, "");                          // limpa bordas
}

function partyStyleClass() {
  const theme = ensurePartyThemeObj();
  const slug = slugifyPartyStyle(theme.style);
  return slug ? `party-style-${slug}` : "";
}
function partyBannerHtml() {
  const leader = getLeaderForParty();
  const leaderName = leader ? displayName(leader) : "Líder";

  const theme = ensurePartyThemeObj();
  const baseEmoji = PARTY_BASE_EMOJI[theme.base] || "🎉";
  const styleEmoji = PARTY_STYLE_EMOJI[theme.style] || "✨";

  // garante 1 show por semana
  state.weekState = state.weekState || {};
  state.weekState.partyShowWeek = state.weekState.partyShowWeek ?? null;
  state.weekState.partyShow = state.weekState.partyShow ?? null;

 if (state.weekState.partyShowWeek !== state.week) {
  state.weekState.partyShowWeek = state.week;

  // histórico de shows já usados
  state.partyUsedShows = state.partyUsedShows || {};

  // candidatos = shows ainda não usados
  let candidates = (SHOWS_BBB || []).filter(s => s && !state.partyUsedShows[String(s)]);

  // se acabou, reseta e começa de novo
  if (!candidates.length) {
    state.partyUsedShows = {};
    candidates = (SHOWS_BBB || []).slice();
  }

  const chosen = pickOne(candidates);
  state.weekState.partyShow = chosen;

  // marca como usado
  state.partyUsedShows[String(chosen)] = true;
}


  const showName = state.weekState.partyShow;
  const showLine = showName ? `SHOW DE ${showName}` : null;

  const title = `${baseEmoji} ${baseEmoji} ${baseEmoji} Festa de ${leaderName} ${styleEmoji} ${styleEmoji} ${styleEmoji}`;
  const subtitle = `Tema: ${theme.base} · ${theme.style}`;

  const styleCls = partyStyleClass();

  return `
    <div class="dayCard party ${styleCls}">
      <span style="flex:1; min-width:0; font-size:22px; font-weight:900; line-height:1.2; text-align:center;">
        ${escapeHtml(title)}

        <div style="margin-top:4px; font-weight:600; font-size:11px; opacity:.9;">
          ${escapeHtml(subtitle)}
        </div>

        ${showLine ? `
          <div style="margin:6px auto 0; width:60%; border-top:1px solid rgba(255,255,255,.25);"></div>
          <div style="margin-top:4px; font-size:12px; font-weight:800; letter-spacing:.6px; text-transform: uppercase;">
            ${escapeHtml(showLine)}
          </div>
        ` : ""}
      </span>
    </div>
  `;
}


// ===== Saídas especiais: expulso / desistente =====

function elimTagLabel(tag) {
  if (tag === "expulso") return "EXPULSO";
  if (tag === "desistente") return "DESISTENTE";
  return String(tag || "ELIMINADO").toUpperCase();
}

// Se você já tiver uma função central de eliminação, você pode substituir
// o corpo desta função por uma chamada tipo eliminatePlayer(p, tag).
function forceExitPlayer(p, tag, reason) {
  if (!p || !p.status?.alive) return false;

 // usa o mesmo pipeline de eliminação normal
markEliminated(p); // grava outWeek + elimOrder

// marca o tipo de saída
p.status.eliminated = true;
p.status.elimTag = tag; // "expulso" / "desistente"

// conta como eliminado desta semana na aba Votações
state.weekState = state.weekState || {};
state.weekState.eliminadoId = p.id;

// snapshot imediato para a aba Votações registrar esta semana
snapshotVotesForWeek(state.week);

  // Se quem saiu era o líder da semana, promove o próximo do ranking da prova
  if (state.weekState?.leaderId && p.id === state.weekState.leaderId) {
    const rankedIds = Array.isArray(state.weekState.leaderRankedIds)
      ? state.weekState.leaderRankedIds
      : [];

    const nextId = rankedIds.find((id) => {
      if (!id || id === p.id) return false;
      const pp = state.players.find((x) => x.id === id);
      return pp && pp.status?.alive;
    });

    if (nextId) {
      state.weekState.leaderId = nextId;

      const newLeader = state.players.find((x) => x.id === nextId);
      if (newLeader) {
        gameLine(displayName(newLeader), "assume a liderança após a saída do líder", "leader");
        if (typeof defineVipXepa === "function") defineVipXepa(nextId);
      }
    } else {
      state.weekState.leaderId = null;
    }
  }


  // Opcional: zera algumas coisas pra não “voltar” por bug
  // p.status.pop = Math.max(0, p.status.pop ?? 0);

  // UI do dia
  dayAdd(`
    <div class="dayCard evNeg">
      <span style="flex:1; min-width:0;">
        🚪 <strong>${escapeHtml(displayName(p))}</strong>: saiu do jogo <strong>${escapeHtml(elimTagLabel(tag))}</strong>. ${escapeHtml(reason || "")}
      </span>
      <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("negativo")}</span>
    </div>
  `);

  // Linha do jogo (se existir gameLine)
  if (typeof gameLine === "function") {
    gameLine(displayName(p), `saiu do jogo (${tag}). ${reason || ""}`, "neu");
  }

  return true;
}

// Probabilidade linear: serenidade 0 => 1%, 10 => 0%
function quitChanceFromSerenity(ser) {
  const s = clamp(Number(ser ?? 5), 0, 10);
  return (1 - s / 10) * 0.001;
}


function maybeExpulsionByAggression(ctx) {
  if (state.gameOver) return false;

  const alive = alivePlayers();
  if (alive.length < 3) return false;

  // 1% por dia (só tenta se houver candidato)
  const TRIGGER_P = 0.005;

  const candidates = [];

  for (const a of alive) {
    const aConfl = clamp(Number(a.attrs?.conflito ?? 5), 0, 10);
    const aSer = clamp(Number(a.attrs?.serenidade ?? 5), 0, 10);

    // precisa de “perfil de risco” mínimo
    if (aConfl < 6.5 || aSer > 4.5) continue;

    // procura um inimigo forte
    let worst = null;
    let worstRel = 0;

    for (const b of alive) {
      if (b.id === a.id) continue;
      const r = relGet(a.id, b.id);
      if (r < worstRel) {
        worstRel = r;
        worst = b;
      }
    }

    if (worst && worstRel <= -4.0) {
      // peso por conflito e “ódio”
      const w = clamp((aConfl - aSer) + Math.abs(worstRel) * 0.9 + (ctx?.tension ? 1.0 : 0), 0.2, 12);
      candidates.push({ a, b: worst, w });
    }
  }

  if (!candidates.length) return false;
  if (Math.random() >= TRIGGER_P) return false;

  const picked = pickWeighted(candidates.map((c) => ({ item: c, w: c.w })));
  if (!picked) return false;

  const DOUBLE_P = 0.25;

if (Math.random() < DOUBLE_P) {
  const okA = forceExitPlayer(
    picked.a,
    "expulso",
    `A briga com ${displayName(picked.b)} 👊 escalou e a produção expulsou os dois. 🧨`
  );

  // só tenta expulsar o segundo se ainda estiver na casa
  const okB = (picked.b?.status?.alive)
    ? forceExitPlayer(
        picked.b,
        "expulso",
        `A briga com ${displayName(picked.a)} 👊 escalou e a produção expulsou os dois. 🧨`
      )
    : false;

  // se pelo menos um saiu, consideramos que o evento aconteceu
  return !!(okA || okB);
}

// caso normal: só um expulso
const ok = forceExitPlayer(
  picked.a,
  "expulso",
  `Após um conflito com ${displayName(picked.b)} 👊, a produção interveio. 🧨`
);

// Pequeno efeito no alvo (opcional)
if (ok && picked.b?.status?.alive) {
  bump(picked.b, { pop: -0.15 });
}

return ok;
}


function maybeExpulsionByHarassment(ctx) {
  if (state.gameOver) return false;

  const alive = alivePlayers();
  if (alive.length < 3) return false;

  const TRIGGER_P = 0.005;

  const candidates = [];

  for (const a of alive) {
    const aSer = clamp(Number(a.attrs?.serenidade ?? 5), 0, 10);

    // procura alguém por quem a tenha crush
    const targets = [];
    for (const b of alive) {
      if (b.id === a.id) continue;
      const r = relGet(a.id, b.id);
      if (r >= CRUSH_T) targets.push(b);
    }
    if (!targets.length) continue;

    // escolhe um alvo dentre os crushes
    const b = targets[Math.floor(Math.random() * targets.length)];

    // peso: menor serenidade = mais risco
let w = clamp((10 - aSer) * 1.2 + (ctx?.festa ? 0.6 : 0), 0.2, 12);

// viés de gênero: homens muito mais prováveis (~80%)
const gender = a.attrs?.genero || a.gender || a.sex; // ajuste se o campo tiver outro nome

if (gender === "masc" || gender === "male" || gender === "M") {
  w *= 2.2; // homem → puxa forte
} else {
  w *= 0.55; // mulher / nb → bem menos provável
}

candidates.push({ a, b, w });

  }

  if (!candidates.length) return false;
  if (Math.random() >= TRIGGER_P) return false;

  const picked = pickWeighted(candidates.map((c) => ({ item: c, w: c.w })));
  if (!picked) return false;

  const ok = forceExitPlayer(
    picked.a,
    "expulso",
    `🤢 Comportamento inadequado com ${displayName(picked.b)} levou à expulsão.🚓`
  );

  // efeito no alvo (opcional)
  if (ok && picked.b?.status?.alive) {
    bump(picked.b, { pop: -0.10 });
  }

  return ok;
}


function maybeQuitEvent(ctx) {
  if (state.gameOver) return false;

  const alive = alivePlayers();
if (alive.length <= 4) return false;

  // tenta em ordem aleatória
  const shuffled = alive.slice().sort(() => Math.random() - 0.5);

  for (const p of shuffled) {
    const ser = clamp(Number(p.attrs?.serenidade ?? 5), 0, 10);
    const pQuit = quitChanceFromSerenity(ser) * 0.3;

    if (Math.random() < pQuit) {
      return forceExitPlayer(
        p,
        "desistente",
        `🤯 Não aguentou a pressão e decidiu sair  🚨.`
      );
    }
  }

  return false;
}

  // ===== BÔNUS DE POPULARIDADE: "excluídos da casa" =====
  // Regra:
  // - Se não tem amigos (0 vínculos >= +0.5)
  // - E tem desafeto com 3+ pessoas (vínculos <= -1.0, seja p->outros ou outros->p)
  // - No máximo 20% do elenco vivo "excluído" por vez (os com menos boas relações)
  // Então ganha um bônus de popularidade (o público tende a comprar a narrativa do "excluído").
  function applyExclusionPopularityBoost(ctx) {
    if (state.gameOver) return;

    const alive = alivePlayers();
    if (!alive || alive.length < 3) return;

    const aliveSet = new Set(alive.map((x) => x.id));

    // 1) calcula métricas sociais
    const social = [];
    for (const p of alive) {
      if (!p || !p.id || !p.status?.alive) continue;

      let friendsOut = 0;        // p -> outros (amizades)
      let friendsIn = 0;         // outros -> p (amizades recebidas)
      let rivalsOut = 0;         // p -> outros (desafetos)
      let rivalsIn = 0;          // outros -> p (desafetos recebidos)

      const relsOut = state.relations?.[p.id] || {};
      for (const otherId in relsOut) {
        if (!aliveSet.has(otherId)) continue;
        if (otherId === p.id) continue;

        const scoreOut = relGet(p.id, otherId);
        if (scoreOut >= 0.5) friendsOut += 1;
        if (scoreOut <= -1.0) rivalsOut += 1;
      }

      for (const o of alive) {
        if (!o?.id || o.id === p.id) continue;
        const scoreToP = relGet(o.id, p.id);
        if (scoreToP >= 0.5) friendsIn += 1;
        if (scoreToP <= -1.0) rivalsIn += 1;
      }

      const friends = Math.max(friendsOut, friendsIn);
      const rivals = Math.max(rivalsOut, rivalsIn);
      const goodLinks = friendsOut + friendsIn;
      const isCandidate = (friends === 0 && rivals >= 3);

      social.push({ p, friends, rivals, goodLinks, isCandidate });
    }

    // 2) escolhe no máximo 20% do elenco vivo (arredonda pra baixo)
    // Ex.: 20 vivos => 4 excluídos; 5 vivos => 1 excluído.
    const maxExcluded = Math.max(0, Math.floor(alive.length * 0.20));

    // se o limite for 0, ninguém pode ficar marcado como excluído
    if (maxExcluded === 0) {
      for (const p of alive) {
        if (!p?.status) continue;
        p.status.excluido = false;
        p.status.excluidoStreak = 0;
      }
      return;
    }

    // escolhe até o limite (os com menos boas relações; em empate, mais desafetos)
    const chosen = social
      .filter((x) => x.isCandidate)
      .sort((a, b) => {
        if (a.goodLinks !== b.goodLinks) return a.goodLinks - b.goodLinks;
        if (a.rivals !== b.rivals) return b.rivals - a.rivals;
        return (a.p.status?.pop ?? 0) - (b.p.status?.pop ?? 0); // desempate leve
      })
      .slice(0, maxExcluded);

    const chosenIds = new Set(chosen.map((x) => x.p.id));
    const boosted = [];
    const isolatedNotes = [];

    // 3) atualiza estado + aplica bônus apenas nos escolhidos
    for (const s of social) {
      const p = s.p;
      p.status = p.status || {};
      const nowExcluded = chosenIds.has(p.id);
      const wasExcluded = !!p.status.excluido;

      if (nowExcluded) {
        p.status.excluido = true;
        p.status.excluidoStreak = (p.status.excluidoStreak ?? 0) + 1;
      } else {
        p.status.excluido = false;
        p.status.excluidoStreak = 0;
      }

      if (!nowExcluded) continue;

      // evento de isolamento (não floodar): quando entra no estado ou a cada 3 dias seguidos
      if (!wasExcluded || (p.status.excluidoStreak % 3 === 0)) {
        isolatedNotes.push(p);
      }

      const intensity = clamp((s.rivals - 2) / 6, 0, 1); // 3->~0.16, 8->1
      const base = 0.12 + 0.18 * intensity;
      const extra = (ctx?.tension ? 0.05 : 0);
      const dPop = base + extra + rnd(-0.03, 0.06);

      bump(p, { pop: dPop });
      boosted.push({ p, dPop });
    }

    if (!boosted.length) return;

    // Card único no feed do dia (pra não floodar)
    const items = boosted
      .slice(0, 6)
      .map((x) => `<strong>${escapeHtml(displayName(x.p))}</strong>`)
      .join(", ");

    dayAdd(`
      <div class="dayCard evNeu">
        <span style="flex:1; min-width:0;">
          🚪 Narrativa de <strong>exclusão</strong>: ${items}.
          <span style="opacity:.88;">O público costuma comprar o enredo do "isolado".</span>
        </span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("misto")}</span>
      </div>
    `);

    if (isolatedNotes.length) {
      const names = isolatedNotes.slice(0, 6)
        .map((p) => `<strong>${escapeHtml(displayName(p))}</strong>`)
        .join(", ");
      const verb = isolatedNotes.length === 1 ? "está" : "estão";
      const end = isolatedNotes.length === 1 ? "isolado" : "isolados";
      dayAdd(`
        <div class="dayCard evNeu">
          <span style="flex:1; min-width:0;">🥺 ${names} ${verb} cada vez mais ${end} na casa.</span>
          <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("misto")}</span>
        </div>
      `);
    }
  }




  // ===== Eventos com gatilho (confrontos/reações) =====
  function maybeTriggeredConfrontations(ctx, alive) {
    state.weekState = state.weekState || {};
    state.weekState.triggered = state.weekState.triggered || {};

    // 1) Sobrevivente do paredão confronta quem indicou (quarta/quinta)
    if (!state.weekState.triggered.returnedVsLeader && (ctx.key === 'qua' || ctx.key === 'qui')) {
      const leaderId = state.weekState.leaderId;
      const indicadoId = state.weekState.indicadoLiderId;
      const surv = Array.isArray(state.weekState.lastParedaoSurvivorIds) ? state.weekState.lastParedaoSurvivorIds : [];

      if (leaderId && indicadoId && surv.includes(indicadoId)) {
        const leader = alive.find(p => p.id === leaderId) || state.players.find(p => p.id === leaderId);
        const survP = alive.find(p => p.id === indicadoId) || state.players.find(p => p.id === indicadoId);

        if (leader && survP && Math.random() < (ctx.key === 'qua' ? 0.55 : 0.35)) {
          state.weekState.triggered.returnedVsLeader = true;
          survP.flags = survP.flags || {};
          survP.flags.confrontedLeader = true;
          applyEventBlock({
            eid: "trigger_returned_vs_leader",
            theme: ctx.festa ? 'party' : 'default',
            people: `${survP.name} e ${leader.name}`,
            desc: `volta do paredão com sangue nos olhos e cobra {a:ele|ela|elu} na cara por ter indicado`,
            vt: "negativo, confronto com peso",
            scope: "coletivo",
            a: survP,
            b: leader,
            deltaA: { pop: 0.22, alvo: 0.18 },
            deltaB: { pop: -0.10, alvo: 0.28 },
            relDelta: -1.10
          });
          return true;
        }
      }
    }

    // 2) "Voto descoberto" (segunda/terça)
    if (!state.weekState.triggered.voteExposed && (ctx.key === 'seg' || ctx.key === 'ter')) {
      const votes = Array.isArray(state.weekState.lastCasaVotes) ? state.weekState.lastCasaVotes : [];
      if (votes.length) {
        const pairs = votes
          .map(v => ({ from: alive.find(p => p.id === v.fromId), to: alive.find(p => p.id === v.toId) }))
          .filter(x => x.from && x.to && x.from.id !== x.to.id);

        if (pairs.length && Math.random() < (ctx.key === 'seg' ? 0.38 : 0.28)) {
          const pick = pairs[Math.floor(Math.random() * pairs.length)];
          state.weekState.triggered.voteExposed = true;
          pick.to.flags = pick.to.flags || {};
          pick.to.flags.voteExposed = true;
          applyEventBlock({
            eid: "trigger_vote_exposed",
            theme: 'default',
            people: `${pick.to.name} e ${pick.from.name}`,
            desc: `descobre um voto e vai tirar satisfações com {b:cara de pau|cara de pau|cara de pau}`,
            vt: "muito negativo, clima pesado",
            scope: "coletivo",
            a: pick.to,
            b: pick.from,
            deltaA: { pop: -0.05, alvo: 0.38 },
            deltaB: { pop: -0.10, alvo: 0.32 },
            relDelta: -1.25
          });
          return true;
        }
      }
    }

    return false;
  }

  /* ===== Sequências narrativas curtas (mini-arcos do dia) =====
     Ideia: 1–2 cadeias por dia (2–3 eventos), para dar sensação de roteiro.
     Não substitui o gerador atual: apenas preenche uma fila (state.eventQueue)
     que é consumida antes dos eventos randômicos.
  */

  const SEQ_SEEDS_BY_DAY = {
    // semana começa na quarta
    qua: [
      { p: "housefun", w: 3.2 },
      { p: "social", w: 2.4 },
      { p: "romance", w: 1.1 },
      { p: "attention", w: 1.2 },
      { p: "emotional", w: 0.8 }
    ],
    qui: [
      { p: "social", w: 2.6 },
      { p: "attention", w: 2.2 },
      { p: "housefun", w: 1.6 },
      { p: "strategy", w: 0.7 },
      { p: "conflict", w: 0.7 }
    ],
    sex: [
      { p: "strategy", w: 2.6 },
      { p: "conflict", w: 1.6 },
      { p: "attention", w: 1.2 },
      { p: "housefun", w: 1.0 },
      { p: "social", w: 0.9 }
    ],
    sab: [
      { p: "strategy", w: 2.4 },
      { p: "social", w: 1.8 },
      { p: "housefun", w: 1.8 },
      { p: "conflict", w: 1.1 },
      { p: "romance", w: 1.0 }
    ],
    dom: [
      { p: "conflict", w: 2.8 },
      { p: "emotional", w: 2.0 },
      { p: "strategy", w: 1.2 },
      { p: "attention", w: 0.9 },
      { p: "housefun", w: 0.6 }
    ],
    seg: [
      { p: "emotional", w: 2.8 },
      { p: "conflict", w: 2.4 },
      { p: "attention", w: 1.1 },
      { p: "strategy", w: 0.9 },
      { p: "housefun", w: 0.5 }
    ],
    ter: [
      { p: "emotional", w: 2.4 },
      { p: "attention", w: 1.8 },
      { p: "neutral", w: 1.2 },
      { p: "social", w: 1.0 },
      { p: "housefun", w: 0.6 }
    ]
  };

  // Follow-ups por "prefixo" de eid
  const SEQ_FOLLOW_UPS = {
    housefun: [
      { p: "social", w: 1.6 },
      { p: "attention", w: 1.4 },
      { p: "conflict", w: 0.9 }
    ],
    social: [
      { p: "attention", w: 1.4 },
      { p: "romance", w: 1.0 },
      { p: "strategy", w: 0.9 },
      { p: "conflict", w: 0.8 }
    ],
    romance: [
      { p: "attention", w: 1.6 },
      { p: "social", w: 1.0 },
      { p: "conflict", w: 0.6 }
    ],
    strategy: [
      { p: "strategy", w: 1.0 },
      { p: "conflict", w: 1.4 },
      { p: "attention", w: 1.0 },
      { p: "emotional", w: 0.8 }
    ],
    conflict: [
      { p: "emotional", w: 1.8 },
      { p: "attention", w: 1.2 },
      { p: "social", w: 0.6 }
    ],
    emotional: [
      { p: "attention", w: 1.6 },
      { p: "social", w: 1.0 },
      { p: "neutral", w: 0.8 }
    ],
    attention: [
      { p: "social", w: 1.2 },
      { p: "conflict", w: 1.0 },
      { p: "emotional", w: 1.0 },
      { p: "housefun", w: 0.9 }
    ],
    neutral: [
      { p: "social", w: 1.2 },
      { p: "attention", w: 1.0 },
      { p: "emotional", w: 0.9 }
    ]
  };

  function seqPrefixFromEid(eid) {
    const s = String(eid || "");
    if (s.startsWith("housefun")) return "housefun";
    if (s.startsWith("strategy")) return "strategy";
    if (s.startsWith("conflict")) return "conflict";
    if (s.startsWith("emotional")) return "emotional";
    if (s.startsWith("attention")) return "attention";
    if (s.startsWith("romance")) return "romance";
    if (s.startsWith("social")) return "social";
    if (s.startsWith("neutral")) return "neutral";
    if (s.startsWith("trigger_")) return "conflict"; // gatilhos geralmente são tensos
    return "neutral";
  }

  function pickNarrativeActor(alive, ctx) {
    const mood = ctx?.mood || { tension: ctx.tension ? 0.85 : 0.45, paranoia: 0.45, leveza: ctx.festa ? 0.65 : 0.35 };
    return pickWeighted(
      alive.map((p) => {
        const base = 0.35 + p.attrs.social * 0.04 + p.attrs.conflito * 0.03 + p.attrs.estrategia * 0.02;
        const tensionBias = (mood.tension ?? 0) * (0.04 * p.attrs.conflito);
        const festaBias = (ctx.festa ? 0.08 * p.attrs.social : 0);
        return { item: p, w: clamp(base + tensionBias + festaBias, 0.05, 2.5) };
      })
    );
  }

  function genEventTry(p, ctx, alive, wantPrefix, wantOtherId = null) {
    const tries = 10;
    for (let i = 0; i < tries; i++) {
      const ev = genEventForPlayer(p, ctx, alive);
      const pref = seqPrefixFromEid(ev?.eid);
      if (pref !== wantPrefix) continue;
      if (wantOtherId) {
        if (!ev?.b || ev.b.id !== wantOtherId) continue;
      }
      return ev;
    }
    return null;
  }

  function buildDailySequence(ctx, alive) {
    const seedPrefs = SEQ_SEEDS_BY_DAY[ctx.key] || SEQ_SEEDS_BY_DAY.qua;
    const seedPrefix = pickWeighted(seedPrefs.map((x) => ({ item: x.p, w: x.w })));
    const A = pickNarrativeActor(alive, ctx) || pickOne(alive);
    if (!A) return [];

    const seed = genEventTry(A, ctx, alive, seedPrefix);
    if (!seed) return [];

    const seq = [seed];
    const B = seed?.b || pickOther(A, alive);
    const maxSteps = clamp(2 + (ctx.festa ? 1 : 0) + (ctx.key === "seg" ? 1 : 0), 2, 3);

    for (let step = 1; step < maxSteps; step++) {
      const last = seq[seq.length - 1];
      const lastPref = seqPrefixFromEid(last?.eid);
      const nextOptions = (SEQ_FOLLOW_UPS[lastPref] || []).map((x) => ({ item: x.p, w: x.w }));
      if (!nextOptions.length) break;
      const nextPref = pickWeighted(nextOptions);

      // tenta manter os mesmos protagonistas sempre que o evento for de dupla
      const duoPref = (nextPref === "social" || nextPref === "romance" || nextPref === "conflict" || nextPref === "strategy" || nextPref === "housefun");
      const wantOtherId = (duoPref && B) ? B.id : null;

      // alterna o foco: às vezes A reage, às vezes B reage
      const actor = (B && Math.random() < 0.35) ? B : A;
      const ev = genEventTry(actor, ctx, alive, nextPref, wantOtherId);
      if (!ev) break;
      seq.push(ev);
    }

    return seq;
  }

  function enqueueDailySequences(ctx, alive, cap) {
    state.eventQueue = Array.isArray(state.eventQueue) ? state.eventQueue : [];
    state.eventQueue.length = 0;
    if (!alive?.length) return;

    // 1 sequência sempre; 2 em dias mais "de episódio" (festa, domingo, segunda)
    const want = clamp(1 + (ctx.festa ? 1 : 0) + (ctx.key === "dom" ? 1 : 0) + (ctx.key === "seg" ? 1 : 0), 1, 2);
    const hardMax = clamp(Math.floor(cap / 2), 1, 3); // não toma o dia inteiro
    const seqCount = Math.min(want, hardMax);

    for (let i = 0; i < seqCount; i++) {
      if (state.eventQueue.length >= cap - 1) break;
      const seq = buildDailySequence(ctx, alive);
      for (const ev of seq) {
        if (state.eventQueue.length >= cap - 1) break;
        state.eventQueue.push(ev);
      }
    }
  }

  function generateDayEvents(ctx) {
    const alive = alivePlayers();
    if (!alive.length) return;
	  
	 if (alive.length === 3) {
  runFinalThreeNostalgia(ctx, alive);
  return; // se quiser misturar com eventos normais, apague este return
}
// Saídas especiais (podem encerrar o dia)
if (maybeExpulsionByAggression(ctx)) return;
if (maybeExpulsionByHarassment(ctx)) return;
if (maybeQuitEvent(ctx)) return;

   if (ctx.festa) {
  if (ctx.festaType === "patrocinador") dayAdd(sponsorPartyBannerHtml());
  else dayAdd(partyBannerHtml());
}

    // 1 evento de gatilho por dia (quando aplicável)
    maybeTriggeredConfrontations(ctx, alive);

    if (typeof maybeSpecialFightEvent === "function") {
      maybeSpecialFightEvent(ctx);
    }

    // Eventos adicionais para enriquecer jornada
    if (typeof maybeVulnerabilityMoment === "function") {
      maybeVulnerabilityMoment(ctx);
    }
    if (typeof maybeUnbreakableFriendship === "function") {
      maybeUnbreakableFriendship(ctx);
    }

    const cap = clamp(Math.round(rnd(2, 5) + (ctx.festa ? 1 : 0) + (ctx.tension ? 1 : 0)), 2, 6);

    // Mini-arcos do dia: enfileira 1–2 sequências (2–3 eventos) antes do aleatório
    enqueueDailySequences(ctx, alive, cap);

    const candidates = alive
      .map((p) => {
        const base = 0.28 + p.attrs.social * 0.03 + p.attrs.conflito * 0.02 + p.attrs.estrategia * 0.015 - p.attrs.rejeicao * 0.01;
        const boost = (ctx.festa ? 0.12 : 0) + (ctx.tension ? 0.06 : 0);
        return { p, chance: clamp(base + boost, 0.10, 0.85) };
      })
      .sort((a, b) => b.chance - a.chance);

    let made = 0;

    // Consome fila narrativa primeiro
    while (state.eventQueue && state.eventQueue.length && made < cap) {
      const ev = state.eventQueue.shift();
      if (ev) {
        applyEventBlock(ev);
        made++;
      }
    }
    for (const c of candidates) {
      if (made >= cap) break;
      if (Math.random() < c.chance) {
        applyEventBlock(genEventForPlayer(c.p, ctx, alive));
        made++;
      }
    }

    // Bônus de popularidade para quem está sendo excluído na casa
    applyExclusionPopularityBoost(ctx);


    alive.forEach((p) => {
      const fatigue = 0.010 + p.status.pop * 0.007;
      bump(p, { pop: -fatigue + rnd(-0.01, 0.01) });
    });
  }


/* ===== Provas (Líder/Anjo) ===== */
const PROVA_TIPOS = [
  { key: "res", label: "Resistência", mode: "prova" },
  { key: "hab", label: "Pontuação e Habilidade", mode: "prova+estrategia" },
  { key: "agi", label: "Agilidade e Velocidade", mode: "prova+serenidade" },
  { key: "sorte", label: "Eliminação por sorte", mode: "sorte" }
];

const PROVA_MOD_ONDE = [
  "Em cima de um monte de grãos de feijão.",
  "Dentro de uma piscina de geleca colorida.",
  "Debaixo de uma cascata de chocolate (falso).",
  "Enquanto um manequim assustador te encara.",
  "No meio de um campo cheio de galinhas de borracha.",
  "Segurando uma bacia com água na cabeça.",
  "Dentro de um cilindro giratório transparente.",
  "Usando luvas de boxe gigantes.",
  "Com um pé só.",
  "Em frente a um ventilador industrial.",
  "Dentro de uma gaiola com penas voando.",
  "Pendurado de cabeça para baixo (em segurança).",
  "Com as pernas presas num saco de dormir.",
  "No escuro total, com apenas uma lanterna de cabeça.",
  "Equilibrado em um tronco que rola sobre bolinhas.",
  "Vestindo um pijama inflável de dinossauro.",
  "Com um capacete cheio de mel (sim, mel).",
  "No meio de um labirinto de espelhos.",
  "Sentado numa cadeira de balanço desgovernada.",
  "Atrás de uma cortina de fios de barbante."
];

const PROVA_MOD_OQUE = [
  "Enfileirar copos de shot sem usar as mãos.",
  "Imitar o som de um animal em pânico.",
  "Contar os grãos de arroz em um pote de 1kg.",
  "Equilibrar uma colher com um ovo na boca.",
  "Recitar o hino nacional ao contrário.",
  "Montar um quebra-cabeça de 10 peças.",
  "Passar um anel de um barbante para o outro sem soltar.",
  "Desenhar o retrato do apresentador com os olhos vendados.",
  "Cantar uma música de ninar com voz de ópera.",
  "Jogar uma partida de jogo da velha contra si mesmo.",
  "Classificar uma pilha de meias por cor no escuro.",
  "Resolver uma conta de matemática simples... mas gritando.",
  "Encher um balão até estourar usando apenas o nariz.",
  "Encontrar uma agulha num palheiro (de verdade, mas com palha de plástico).",
  "Soletrar \"PAREDÃO\" com letras de macarrão.",
  "Fazer uma ligação telefônica e pedir uma pizza... em latim.",
  "Imitar a pose da Vitória de Samotrácia.",
  "Traduzir uma frase do português para o português... com sotaque russo.",
  "Empilhar biscoitos cream cracker no seu próprio cotovelo.",
  "Bravejar como um personagem de novela dos anos 80."
];

const PROVA_MOD_RES = [
  "e o ÚLTIMO HERÓI a desistir leva a vitória.",
  "e o ÚLTIMO SOFREDOR a cair leva a vitória.",
  "AGUENTE MAIS QUE SEUS INIMIGOS, pois quem ceder primeiro vai direto para o paredão.",
  "em uma GUERRA DE ATURAÇÃO. Soltou? Morreu.",
  "É UMA BATALHA DE EXAUSTÃO! O último organismo consciente vence.",
  "O TEMPO É SEU ALGOZ. Desistir é humano, permanecer é divino.",
  "CADA SEGUNDO É UMA ETERNIDADE. Quem quebrar a pose perde tudo."
];

const PROVA_MOD_HAB = [
  "e CADA ACERTO VALE UM PONTO DE GLÓRIA. Quem somar mais, vence.",
  "EFICIÊNCIA É TUDO. Serão contados os itens/concluídas as etapas no tempo limite.",
  "em uma CONTAGEM PRECISA. O resultado mais próximo leva a vantagem.",
  "PONTOS POR ESTILO E PRECISÃO. A plateia virtual também julga!",
  "CADA ETAPA COMPLETA É UM DEGRAU PARA A IMUNIDADE. Errou, perde um.",
  "É UM BALANÇO ENTRE VELOCIDADE E QUALIDADE. A nota final decide."
];

const PROVA_MOD_AGI = [
  "RÁPIDO COMO UM GATO ASSUSTADO! O primeiro a finalizar grita 'É TETRA!' e ganha.",
  "e CONTRA O RELÓGIO. Apertem os cintos, o mais veloz vence.",
  "CORRA, SEUS LENTOS! A bandeira checada primeiro garante a imunidade.",
  "A CORRIDA CONTRA A GRAVIDADE E O RIDÍCULO. O primeiro a cruzar a linha vence.",
  "SPRINT FINAL! O cronômetro não perdoa. Mais rápido leva o prêmio.",
  "VELOCIDADE É SAGRADA. O último a terminar automaticamente perde."
];

const PROVA_MOD_SORTE = [
  "e O PIOR A CADA RODADA CAI FORA em uma roleta russa de vergonha.",
  "SORTE OU AZAR? Quem não cumprir a meta exata na hora exata é eliminado.",
  "em um MATA-MATA IMPLACÁVEL. O perdedor da rodada dá tchauzinho.",
  "CADA ERRO É UM PASSAPORTE PARA A SAÍDA. Sobreviva às rodadas.",
  "A ROULETTE DO DESTINO GIRA. A seta para, e alguém se ferra.",
  "ELIMINAÇÃO POR CONSENSO DO AZAR. O mais azarão em cada etapa é cortado."
];



function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildProvaDesc(tipoKey) {
  const onde = pickOne(PROVA_MOD_ONDE);
  const oque = pickOne(PROVA_MOD_OQUE);
  const como =
    tipoKey === "res" ? pickOne(PROVA_MOD_RES) :
    tipoKey === "hab" ? pickOne(PROVA_MOD_HAB) :
    tipoKey === "agi" ? pickOne(PROVA_MOD_AGI) :
    pickOne(PROVA_MOD_SORTE);
  return `${onde} ${oque}. ${como}`;
}

function scoreProva(p, mode) {
  const a = p.attrs;
  const noise = rnd(-2.5, 2.5);
  if (mode === "prova") return a.provas * 1.0 + noise;
  if (mode === "prova+estrategia") return a.provas * 1.0 + a.estrategia * 0.85 + noise;
  if (mode === "prova+serenidade") return a.provas * 1.0 + a.serenidade * 0.85 + noise;
  return rnd(0, 1000); // sorte
}

function runProva(roleLabel, pool, roleTypeClass) {
  const tipo = pickOne(PROVA_TIPOS);
  const desc = buildProvaDesc(tipo.key);

  // Cada linha vira um "card" (bloco) para não colar tudo no log.
  const card = (cls, html) => `<div class="gameCard ${cls}">${html}</div>`;

  // Ranking: do último ao primeiro (o último da lista é o vencedor)
  let ranked;
  if (tipo.mode === "sorte") {
    ranked = shuffle([...pool]);
  } else {
    ranked = [...pool]
      .map((p) => ({ p, s: scoreProva(p, tipo.mode) }))
      .sort((a, b) => a.s - b.s)
      .map((x) => x.p);
  }

  const winner = ranked[ranked.length - 1];

  // Log formatado
  const head = `<span class="${roleTypeClass}"><strong>Prova do ${escapeHtml(roleLabel)}</strong></span>: <br/> <span class="small">${escapeHtml(tipo.label)}</span> <br/> <span class="small">${escapeHtml(desc)}</span>`;

  gameAdd(card(roleTypeClass, head));

  // Posições: do último ao primeiro
  for (let i = 0; i < ranked.length; i++) {
    const pos = i + 1;
    const p = ranked[i];
    const placeFromBottom = ranked.length - i; // 1 = último, N = primeiro
    // Ex.: "1. Jogador" (último) ... "N. Jogador" (primeiro)
    let extra = "";
    const top4 = (typeof isTop4 === "function") ? isTop4() : false;
    if (roleLabel === "Líder" && !top4 && state?.weekState?.lastLeaderId && p.id === state.weekState.lastLeaderId) {
      extra = " (vetado)";
    }
    gameAdd(card('gameNeu', `${placeFromBottom}. ${escapeHtml(p.name)}${extra}`));
  }

  gameAdd(card(roleTypeClass, `<span class="${roleTypeClass}"><strong>${escapeHtml(winner.name)}</strong></span> vence a prova e vira <strong>${escapeHtml(roleLabel)}</strong>.`));

  return { winner, tipo, desc, ranked };
}

  

  /* ===== Jogo (linhas) ===== */
  function gameLine(names, desc /* ...rest */) {
    const rest = Array.prototype.slice.call(arguments, 2);

    // aceita chamadas antigas e novas
    const validTypes = new Set(["leader", "anjo", "imune", "paredao", "neu"]);
    let type = "neu";
    if (rest.length) {
      const last = rest[rest.length - 1];
      if (typeof last === "string" && validTypes.has(last)) type = last;
    }

    const cls =
      type === "leader" ? "gameLeader" :
      type === "anjo" ? "gameAnjo" :
      type === "imune" ? "gameImune" :
      type === "paredao" ? "gameParedao" :
      "gameNeu";

    const namesTxt = formatNamesInText(names);
    const descTxt = formatNamesInText(desc);

    const line = `
      <div class="gameCard ${cls}">
        <span class="gameCardText">
          <strong>${escapeHtml(namesTxt)}</strong>: ${escapeHtml(descTxt)}.
        </span>
      </div>
    `;

    gameAdd(line);
  }

function defineVipXepa(leaderId) {
    const alive = alivePlayers();
    if (!leaderId || !alive.length) {
      state.weekState.vipIds = [];
      state.weekState.xepaIds = [];
      return;
    }

    const vipSize = 1 + Math.ceil(alive.length / 4);

    // Lider sempre entra no VIP
    const vip = [leaderId];

    // Escolhas por afinidade (relacao do lider)
    const others = alive
      .filter((p) => p.id !== leaderId)
      .sort((a, b) => relGet(leaderId, b.id) - relGet(leaderId, a.id));

    for (let i = 0; i < vipSize - 1 && i < others.length; i++) vip.push(others[i].id);

    const vipSet = new Set(vip);
    const xepa = alive.filter((p) => !vipSet.has(p.id)).map((p) => p.id);

    state.weekState.vipIds = vip;
    state.weekState.xepaIds = xepa;


    // Ajuste social imediato: quem entra no VIP tende a gostar mais do líder;
    // quem fica na Xepa tende a gostar menos do líder.
    vip.forEach((id) => {
      if (id !== leaderId) relAdd(id, leaderId, 0.35);
    });
    xepa.forEach((id) => {
      if (id !== leaderId) relAdd(id, leaderId, -0.35);
    });

    // Log
    const leader = state.players.find((p) => p.id === leaderId);
    const vipNames = vip
      .map((id) => state.players.find((p) => p.id === id))
      .filter((p) => p && p.status.alive)
      .map((p) => shortNameForEvents(p));

    if (leader && vipNames.length) {
      gameLine(
        leader.name,
        `define o VIP da semana (${vip.length} pessoas)`,
        `VIP: ${vipNames.join(", ")}`,
        "o restante da casa vai para a Xepa",
        "misto",
        "leader"
      );
    }
  }

function doLeader() {
  const alive = alivePlayers();
  if (alive.length < 4) return;

  // Regra: líder da semana anterior NÃO joga a Prova do Líder (exceto no Top 4).
  const bannedId = (!isTop4()) ? (state.weekState.lastLeaderId ?? null) : null;
  let pool = alive;
  if (bannedId) {
    pool = alive.filter((p) => p.id !== bannedId);
    const bannedP = state.players.find((p) => p.id === bannedId);
    if (bannedP) {
      // Usa gameLine para manter o mesmo layout em cards do restante do log.
      gameLine(bannedP.name, "não participa da Prova do Líder", "foi líder na semana anterior", "fica de fora desta rodada", "neutro", "leader");
    }
  }
  if (pool.length < 2) pool = alive;

const { winner: leader, ranked } = runProva("Líder", pool, "gameLeader");
  if (!leader) return;
	    // Guarda ranking da prova do líder (para promoção se o líder sair)
  state.weekState.leaderRankedIds = Array.isArray(ranked) ? ranked.map(p => p.id) : [];
  state.weekState.leaderRunnerUpId = Array.isArray(ranked) ? (ranked.find(p => p && p.id !== leader.id)?.id || null) : null;

  state.weekState.leaderId = leader.id;
    leader.status.wonSomethingThisWeek = true;
  leader.status.leaderCount = (leader.status.leaderCount ?? 0) + 1;
  bump(leader, { pop: +0.55, alvo: -0.35 });

  defineVipXepa(leader.id);
}

  /* ===== Big Fone (Sexta) ===== */
  function bigFoneEnabled() {
    // só até restarem 7 jogadores no jogo
    return alivePlayers().length > 7;
  }

  function pickBigFoneAttender(alive) {
    // qualquer um pode atender, mas quem é melhor em provas tem mais chance
    // peso mínimo 1.0; peso máximo ~3.0
    const weighted = alive.map((p) => {
      const provas = clamp(Number(p?.attrs?.provas ?? 5), 1, 10);
      const w = 1.0 + (provas - 1) / 4.5;
      return { item: p, w: Math.max(0.1, w) };
    });
    return pickWeighted(weighted);
  }

  
  function bigFoneCard(atendeuName, resultTitle, resultDesc) {
    const n = escapeHtml(atendeuName || "");
    const rt = resultTitle ? escapeHtml(resultTitle) : "";
    const rd = resultDesc ? resultDesc : ""; // resultDesc já pode vir com <strong>
    return `
      <div class="bigFoneBox">
        <div class="bfStack">
          <span style="font-size:22px; font-weight:900; line-height:1.2;">
  ☎️ RIIING!!! RIIING!!! ☎️
</span>
          <div class="bfSmall">(Big Fone toca!)</div>
          <div class="bfWho"><strong>${n}</strong> corre e atende.</div>
          <div class="bfDivider"></div>
          ${rt ? `<div class="bfResTitle">${rt}</div>` : ``}
          ${rd ? `<div class="bfResDesc">${rd}</div>` : ``}
        </div>
      </div>
    `;
  }

function doBigFone(meta) {
    if (!bigFoneEnabled()) return;

    // garante estado do Big Fone na semana
    state.weekState = state.weekState || {};
    state.weekState.bigFone = state.weekState.bigFone || {};
    if (!Array.isArray(state.weekState.bigFone.immuneIds)) state.weekState.bigFone.immuneIds = [];

    // só tenta uma vez por semana
    if (state.weekState?.bigFone?.triggered) return;

    if (Math.random() >= 0.30) {
      // não tocou
      return;
    }

    const alive = alivePlayers();
    if (!alive.length) return;

    const atendeu = pickBigFoneAttender(alive);
    if (!atendeu) return;

    // resultado do Big Fone (card único no fim)
    let bfResultTitle = "";
    let bfResultDesc = "";

    // marca como ocorrido
    state.weekState.bigFone.triggered = true;
    state.weekState.bigFone.answeredById = atendeu.id;

    // conta como evento/decisão (ajuda planta)
    atendeu.status.didSomethingThisWeek = true;
    atendeu.status.madeDecisionThisWeek = true;

    // 1/4 de chance para cada efeito
    const effects = ["self_paredao", "put_paredao", "self_imune", "give_imune"];
    const effectKey = effects[rndInt(0, effects.length - 1)];
    state.weekState.bigFone.effectKey = effectKey;

    const leaderId = state.weekState.leaderId;
    const leader = leaderId ? state.players.find((p) => p.id === leaderId) : null;

    if (effectKey === "self_paredao") {
      state.weekState.bigFone.noVoteId = atendeu.id;
      state.weekState.bigFone.extraParedaoId = atendeu.id;
      bump(atendeu, { alvo: +1.1, pop: -0.22 });

      gameLine(atendeu.name, "atende o Big Fone e vai direto ao paredão", "não pode receber votos da casa", "o jogo acelera", "misto", "paredao");
      bfResultTitle = "Atenção, você está no paredão";
      bfResultDesc = `${escapeHtml(shortNameForEvents(atendeu))} está no paredão!`;
    }

    if (effectKey === "put_paredao") {
      // não pode ser o líder
      const candidates = alive
        .filter((p) => (leaderId ? p.id !== leaderId : true))
        .filter((p) => p.id !== atendeu.id);

      if (candidates.length) {
        // escolhe alguém "conveniente": alvo alto + relação ruim com quem atendeu
        candidates.sort((a, b) => {
          const sa = (a.status.alvo || 0) * 0.7 + (a.attrs.rejeicao || 0) * 0.35 + (-relGet(atendeu.id, a.id)) * 0.6 + rnd(-0.8, 0.8);
          const sb = (b.status.alvo || 0) * 0.7 + (b.attrs.rejeicao || 0) * 0.35 + (-relGet(atendeu.id, b.id)) * 0.6 + rnd(-0.8, 0.8);
          return sb - sa;
        });

        const alvo = candidates[0];
        state.weekState.bigFone.extraParedaoId = alvo.id;
        bump(alvo, { alvo: +0.9, pop: -0.18 });

        gameLine(`${atendeu.name} coloca ${alvo.name}`, "por ter atendido o Big Fone", leader ? "não podia ser o líder" : "regra aplicada", "pode virar paredão quádruplo", "misto", "paredao");
        bfResultTitle = "Atenção, coloque alguém no paredão imediatamente";
        bfResultDesc = `${escapeHtml(shortNameForEvents(atendeu))} escolhe ${escapeHtml(shortNameForEvents(alvo))} para o paredão!`;
      }
    }

    if (effectKey === "self_imune") {
      state.weekState.bigFone.immuneIds = Array.from(new Set([...(state.weekState.bigFone.immuneIds || []), atendeu.id]));
      bump(atendeu, { alvo: -0.9, pop: +0.22 });

      gameLine(atendeu.name, "atendeu o Big Fone e fica imune", "ganha respiro na semana", "muda o alvo da casa", "positivo", "imune");
      bfResultTitle = "Você está imune nesta semana";
      bfResultDesc = `${escapeHtml(shortNameForEvents(atendeu))} fica imune!`;
    }

    if (effectKey === "give_imune") {
      const candidates = alive.filter((p) => p.id !== atendeu.id);
      if (candidates.length) {
        // tende a imunizar aliado
        candidates.sort((a, b) => {
          const sa = relGet(atendeu.id, a.id) * 1.1 + (a.attrs.social || 0) * 0.12 + rnd(-0.8, 0.8);
          const sb = relGet(atendeu.id, b.id) * 1.1 + (b.attrs.social || 0) * 0.12 + rnd(-0.8, 0.8);
          return sb - sa;
        });

        const alvo = candidates[0];
        state.weekState.bigFone.immuneIds = Array.from(new Set([...(state.weekState.bigFone.immuneIds || []), alvo.id]));
        bump(alvo, { alvo: -0.75, pop: +0.18 });

        gameLine(`${atendeu.name} imuniza ${alvo.name}`, "por ter atendido o Big Fone", "aliança ganha força", "voto da casa se reorganiza", "positivo", "imune");
        bfResultTitle = "Atenção, imunize alguém imediatamente";
        bfResultDesc = `${escapeHtml(shortNameForEvents(atendeu))} imuniza ${escapeHtml(shortNameForEvents(alvo))}!`;
      }
    }

    // Renderiza um único card do Big Fone (formato compacto)
    dayAdd(bigFoneCard(shortNameForEvents(atendeu), bfResultTitle, bfResultDesc));
}

function doAnjo() {
  const alive = alivePlayers();
  const leaderId = state.weekState.leaderId;
  const pool = alive.filter((p) => p.id !== leaderId);
  if (!pool.length) return;

  const { winner: anjo } = runProva("Anjo", pool, "gameAnjo");

  state.weekState.anjoId = anjo.id;
    anjo.status.wonSomethingThisWeek = true;
  anjo.status.anjoCount = (anjo.status.anjoCount ?? 0) + 1;
  bump(anjo, { pop: +0.40, alvo: -0.20 });

}


  function chooseAnjoImmunity(anjo, candidates) {
    // Regra: o Anjo tende a imunizar alguém próximo dele que seja desafeto do Líder.
    // Fallbacks: (1) próximo do Anjo (2) qualquer candidato.
    const leaderId = state?.weekState?.leaderId ?? null;

    // "Próximo" = relação positiva com o Anjo.
    const closeToAnjo = candidates.filter((p) => relGet(anjo.id, p.id) >= 0.8);

    // "Desafeto do líder" = relação negativa do líder com a pessoa.
    const leaderDesafeto = leaderId ? closeToAnjo.filter((p) => relGet(leaderId, p.id) <= -0.7) : [];

    const pool = (leaderDesafeto.length ? leaderDesafeto : (closeToAnjo.length ? closeToAnjo : candidates));

    const weighted = pool.map((p) => {
      const relA = relGet(anjo.id, p.id); // quanto o Anjo gosta
      const relL = leaderId ? relGet(leaderId, p.id) : 0; // quanto o Líder gosta (negativo = desafeto)

      // Pessoas em risco costumam ser salvas, mas a proximidade e o "desafeto do líder" pesam mais.
      const risk = p.status.alvo * 1.0 + p.attrs.rejeicao * 0.7 + p.attrs.conflito * 0.4;
      const likable = p.attrs.social * 0.25 + p.status.pop * 0.25;

      const closeness = clamp((relA + 5) / 10, 0, 1); // 0..1
      const antiLeader = leaderId ? clamp((-relL + 5) / 10, 0, 1) : 0.5; // 0..1 (mais alto = mais desafeto)

      const noise = rnd(-0.8, 0.8);
      const score = (closeness * 2.1) + (antiLeader * 1.6) + (risk * 0.55) + (likable * 0.20) + noise;
      return { item: p, w: clamp(score + 0.8, 0.2, 30) };
    });

    return pickWeighted(weighted);
  }

  function doImune() {
    const alive = alivePlayers();
    const anjo = state.players.find((p) => p.id === state.weekState.anjoId);
    const leaderId = state.weekState.leaderId;
    if (!anjo) return;

    const bf = state.weekState?.bigFone || {};
    const bfImm = Array.isArray(bf.immuneIds) ? bf.immuneIds : [];
    const candidates = alive.filter((p) =>
      p.id !== anjo.id &&
      p.id !== leaderId &&
      p.id !== bf.noVoteId &&
      p.id !== bf.extraParedaoId &&
      !bfImm.includes(p.id)
    );
    if (!candidates.length) return;

    const imune = chooseAnjoImmunity(anjo, candidates);
    state.weekState.imuneId = imune.id;
    imune.status.wonSomethingThisWeek = true;
    bump(imune, { pop: +0.32, alvo: -0.45 });

    // quem é imunizado tende a gostar bem mais do anjo (+50%)
    state.relations[imune.id] = state.relations[imune.id] || {};
    const r0 = relGet(imune.id, anjo.id);
    state.relations[imune.id][anjo.id] = clamp(r0 * 1.5, -5, 5);


    gameLine(`${anjo.name} decide imunizar ${imune.name}`, "imunização do anjo", "alívio para quem recebe", "muda o mapa de votos", "misto", "imune");
  }


  /* ===== Monstro (Sábado) ===== */
  const MONSTRO_FRIEND_T = 1.8; // acima disso, é "amigo" do anjo

  const MONSTRO_FANTASIAS = [
    "frango assado",
    "bule de chá",
    "bebê gigante",
    "cacto espinhoso",
    "vaso de flor",
    "cuca",
    "monstro das neves",
    "cone de trânsito",
    "abacaxi com óculos escuros",
    "sapo cururu",
    "gráfico de estatística",
    "pirulito colorido",
    "vaca leiteira",
    "extraterrestre de papel alumínio",
    "saco de lixo",
    "palhaço triste",
    "relógio cuco",
    "pamonha de piracicaba",
    "cobra coral",
    "medusa de macarrão de piscina",
    "pinguim de geladeira",
    "televisão de tubo",
    "lata de sardinha",
    "espantalho de palha",
    "garrafa de refrigerante",
    "múmia de papel higiênico",
    "brigadeiro gigante",
    "rolo de macarrão",
    "saco de batatas",
    "chave de fenda",
    "caixa de som",
    "controle remoto",
    "pneu de carro",
    "salsicha com molho",
    "pote de geleia",
    "ovo frito",
    "sanduíche de presunto",
    "cenoura gigante",
    "lápis de cor",
    "lâmpada acesa",
    "grávida de taubaté",
    "pastor de calcinha",
    "sister hong",
    "et de varginha",
    "louro josé",
    "canário pistola",
    "churrasqueira a controle remoto",
    "boneco de posto",
    "filtro de barro",
    "botijão de gás com capinha",
    "caneta azul",
    "menino do acre",
    "galloway do tiktok",
    "vendedor de rede",
    "carro do ovo",
    "x-burguer de chinelo",
    "nuvem de algodão doce",
    "chupa-cabra de pelúcia",
    "chupa-cu de goianinha",
    "pombo correio",
    "patriota do caminhão",
    "calça de shopping"
];
const MONSTRO_ACOES = [
    "dançar o tcha tcha tcha",
    "caminhar em marcha soldado",
    "ficar parado em cima de um pedestal",
    "fingir que está remando em um barquinho",
    "abanar o líder",
    "cacarejar sem parar",
    "bater pratos de cozinha",
    "fazer polichinelos",
    "limpar o vidro",
    "tocar uma buzina",
    "gritar eu amo o bbb",
    "ficar dentro de uma caixa",
    "desfilar em uma passarela",
    "caçar borboletas imaginárias",
    "fazer pose de fisiculturista",
    "girar uma manivela",
    "pular corda invisível",
    "dar tchauzinho para o espelho",
    "imitar o som de um despertador",
    "fazer reverência para todos",
    "equilibrar um prato vazio na cabeça",
    "gritar o nome de todos os participantes",
    "fazer mímica de lavar roupa no chão",
    "imitar um macaco pedindo banana",
    "pular em um pé só em volta da piscina",
    "tocar uma flauta imaginária",
    "fazer quadradinho de oito",
    "rodopiar",
    "fazer embaixadinhas com uma bola invisível",
    "latir para quem passar pela porta",
    "fazer sombra de coelhinho na parede",
    "nadar no seco no gramado",
    "pedir autógrafo para os móveis da casa",
    "contar os degraus da escada em voz alta",
    "girar como um pião até o sinal parar",
    "tentar ler a mão dos outros participantes",
    "cantar o hino nacional em ritmo de samba",
    "fazer caretas para a câmera principal",
    "bater palmas no ritmo de um metrônomo",
    "simular uma luta de boxe com o ar",
    "fingir que são robôs com defeito",
    "andar de costas pela sala",
    // NOVAS ADIÇÕES ENGRAÇADAS
    "gritar que o brasil está vendo",
    "fazer o passinho",
    "fingir que está em um terremoto toda vez que alguém rir",
    "oferecer consultoria de imagem para as almofadas",
    "narrar a vida de um inseto em tempo real",
    "fazer o quadradinho de oito em slow motion",
    "tentar convencer uma planta a votar em alguém",
    "imitar uma conexão de internet discada",
    "correr atrás da própria sombra perguntando 'quem é você?'",
    "fazer um tutorial de maquiagem usando apenas ar",
    "reagir a tudo com um 'olha o gás!'",
    "pedir desculpas para a porta toda vez que passar por ela",
    "encenar um parto de uma bola de basquete",
    "procurar um sinal de wi-fi inexistente com um garfo",
    "tentar ensinar etiqueta para a lixeira",
    "fazer a coreografia de 'caneta azul' com emoção",
    "fingir que é um comentarista de bbb dentro do próprio bbb",
    "pedir um pix para a câmera",
    "declarar amor eterno para o eletrodoméstico mais próximo",
    "fazer mímica de quem está comendo uma melancia gigante"
];
	  
const MONSTRO_RECORRENCIAS = [
    "a cada 3 horas, inclusive de madrugada",
    "sempre que tocar um apito agudo",
    "toda vez que a luz da sala piscar em vermelho",
    "quando soar uma sirene de navio",
    "ao sinal de um choro de bebê vindo dos alto-falantes",
    "sempre que o líder entrar na cozinha",
    "a cada 45 minutos durante o dia",
    "toda vez que alguém abrir a geladeira",
    "quando tocar o sinal de 'atenção' da produção",
    "sempre que houver manutenção externa",
    "ao som de uma risada maligna",
    "quando a música de suspense começar a tocar",
    "toda vez que um participante levar uma punição (estalecada)",
    "sempre que o cronômetro da sala zerar",
    "quando a campainha tocar três vezes",
    "a cada mudança de turno na casa",
    "sempre que alguém falar a palavra 'estratégia'",
    "toda vez que o big fone tocar (mesmo que seja trote)",
    "quando as luzes do jardim se acenderem",
    "ao som de um despertador de metal antigo",
    "sempre que o bbb estiver em modo 'feed'",
    "quando a voz do boss anunciar algo",
    "toda vez que a porta do confessionário abrir",
    "sempre que a televisão da sala mostrar um QR Code"
];
	  
	  
function pickMonstroPunishment() {
  const fantasia = (MONSTRO_FANTASIAS[rndInt(0, MONSTRO_FANTASIAS.length - 1)] || "").toLowerCase();
  const acao = (MONSTRO_ACOES[rndInt(0, MONSTRO_ACOES.length - 1)] || "").toLowerCase();
  const recorrencia = (MONSTRO_RECORRENCIAS[rndInt(0, MONSTRO_RECORRENCIAS.length - 1)] || "").toLowerCase();
  
  return { fantasia, acao, recorrencia };
}

  function applyMonstroDayEffects(meta, monstroIds) {
    const alive = alivePlayers();
    const aliveIds = alive.map((p) => p.id);

    const mons = (monstroIds || [])
      .map((id) => state.players.find((p) => p.id === id))
      .filter((p) => p && !p.status.eliminated && Number(p.status.monstroDaysLeft ?? 0) > 0);

    if (!mons.length) return;
    const monSet = new Set(mons.map((p) => p.id));

    // Isolamento: perde um pouco de relação com o resto
    for (const m of mons) {
      for (const oId of aliveIds) {
        if (oId === m.id) continue;
        if (monSet.has(oId)) continue;
        relAdd(m.id, oId, -0.12, "coletivo");
      }
    }

    // Conexão: ganha bastante relação entre si
    if (mons.length >= 2) {
      for (let i = 0; i < mons.length; i++) {
        for (let j = i + 1; j < mons.length; j++) {
          relAdd(mons[i].id, mons[j].id, +0.55, "intimo");
        }
      }
    }
  }

  function tickMonstroDaily(meta) {
    const mons = alivePlayers().filter((p) => Number(p.status.monstroDaysLeft ?? 0) > 0);
    if (!mons.length) return;

    applyMonstroDayEffects(meta, mons.map((p) => p.id));

    // decrementa no fim do dia
    for (const m of mons) {
      m.status.monstroDaysLeft = Math.max(0, Number(m.status.monstroDaysLeft ?? 0) - 1);
      if (m.status.monstroDaysLeft === 0) delete m.status.monstroDaysLeft;
    }
  }

  function pickMonstroTargets(anjo, alive) {
    const others = alive.filter((p) => p.id !== anjo.id);
    const nonFriends = others.filter((p) => relGet(anjo.id, p.id) < MONSTRO_FRIEND_T);

    function pickTwoRandom(arr) {
      const a = arr.slice().sort(() => Math.random() - 0.5);
      return a.slice(0, 2);
    }

    if (nonFriends.length >= 2) return pickTwoRandom(nonFriends);

    // se só tem amigos, pega os 2 menos próximos
    return others
      .slice()
      .sort((A, B) => relGet(anjo.id, A.id) - relGet(anjo.id, B.id))
      .slice(0, 2);
  }

  function doMonstro(meta) {
    const anjo = state.players.find((p) => p.id === state.weekState.anjoId);
    if (!anjo || anjo.status.eliminated) return;

    const alive = alivePlayers();
    if (alive.length < 5) return;

    const targets = pickMonstroTargets(anjo, alive).filter(Boolean);
    if (targets.length < 2) return;

    state.weekState.monstroIds = targets.map((p) => p.id);

    // marca 3 dias de castigo
    for (const t of targets) {
      t.status.monstroDaysLeft = 3;
      // escolhidos passam a gostar um pouco menos do anjo
      relAdd(t.id, anjo.id, -0.35, "intimo");
    }

    // monstros ganham bastante relação entre si ao serem escolhidos
    relAdd(targets[0].id, targets[1].id, +0.9, "intimo");

    const pun = pickMonstroPunishment();
    const line1 = (`${anjo.name} coloca ${targets[0].name} e ${targets[1].name} no monstro`);
    const line2 = (`os monstros terão que ${pun.acao} com fantasia de ${pun.fantasia} ${pun.recorrencia}.`);

    gameAdd(`
      <div class="gameCard gameNeu" style="flex-direction:column; align-items:flex-start; gap:6px;">
        <div style="font-size:14px; font-weight:900;">${escapeHtml(line1)}</div>
        <div style="font-size:12px; opacity:.92;">${escapeHtml(line2)}</div>
      </div>
    `);

    // Linha do tempo (arco): registra o Monstro como evento grande.
    try {
      applyNarrativeEvent({ type: 'monster_sent', actorId: anjo.id, targetId: targets[0].id, round: state.week, meta: { weight: 2, refs: { pun, targetId: targets[0].id } } });
      applyNarrativeEvent({ type: 'monster_punished', actorId: targets[0].id, targetId: targets[1].id, round: state.week, meta: { weight: 2, refs: { pun, targetId: targets[1].id } } });
      applyNarrativeEvent({ type: 'monster_punished', actorId: targets[1].id, targetId: targets[0].id, round: state.week, meta: { weight: 2, refs: { pun, targetId: targets[0].id } } });
    } catch { /* ignora */ }

    // sábado já conta como dia 1 do castigo
    applyMonstroDayEffects(meta, targets.map((p) => p.id));
    for (const t of targets) {
      t.status.monstroDaysLeft = Math.max(0, Number(t.status.monstroDaysLeft ?? 0) - 1);
      if (t.status.monstroDaysLeft === 0) delete t.status.monstroDaysLeft;
    }
  }

  function leaderTargetScore(leader, p) {
  const threat = p.attrs.provas * 0.7 + p.attrs.estrategia * 0.6 + p.status.pop * 0.8;
  const easyVote = p.attrs.rejeicao * 0.6 + p.attrs.conflito * 0.5 + p.status.alvo * 0.8;

  const rel = relGet(leader.id, p.id); // -5..+5 no seu jogo
  const protectFriend = rel * 1.2;     // ↑ aumente pra proteger mais
  const targetEnemy = (-rel) * 1.5;    // ↑ aumente pra mirar mais em rival

  const noise = rnd(-1.5, 1.5) - leader.attrs.estrategia * 0.25;

  return (threat * 0.65 + easyVote * 0.35)
    + targetEnemy
    - protectFriend
    + noise;
}
function doIndica() {
  const alive = alivePlayers();
  const leader = state.players.find((p) => p.id === state.weekState.leaderId);
  if (!leader) return;

  const bf = state.weekState?.bigFone || {};
  const imuneId = state.weekState.imuneId;
  const bfImm = Array.isArray(bf.immuneIds) ? bf.immuneIds : [];

  let candidates = alive.filter((p) =>
    p.id !== leader.id &&
    p.id !== imuneId &&
    p.id !== bf.noVoteId &&
    p.id !== bf.extraParedaoId &&
    !bfImm.includes(p.id)
  );
  if (!candidates.length) return;

  // --- BLOQUEIO SOFT DE ALIADOS (evita indicar aliado forte se houver opção) ---
  const FRIEND_T = 3.0; // ajuste: 2.5 (mais permissivo) a 3.5 (mais protetor)

  const nonClose = candidates.filter((p) => relGet(leader.id, p.id) < FRIEND_T);

  // Só aplica se ainda sobra alguém pra indicar.
  // Isso evita o caso "todo mundo é aliado" ou elenco pequeno.
  if (nonClose.length > 0) {
    candidates = nonClose;
  }
  // --- fim do bloqueio soft ---

  candidates.sort((a, b) => leaderTargetScore(leader, b) - leaderTargetScore(leader, a));
  const indicado = candidates[0];

  state.weekState.indicadoLiderId = indicado.id;
  leader.status.madeDecisionThisWeek = true;
  leader.status.didSomethingThisWeek = true;
  bump(indicado, { pop: -0.28, alvo: +1.0 });

  // indicado tende a ficar ressentido com o líder: corta o carinho pela metade
  state.relations[indicado.id] = state.relations[indicado.id] || {};
  const r0 = relGet(indicado.id, leader.id);
  state.relations[indicado.id][leader.id] = clamp(r0 * 0.5, -5, 5);

  gameLine(`${leader.name} indica ${indicado.name}`, "indicação do líder coloca o nome no paredão", "a tensão sobe", "a casa recalcula votos", "misto", "paredao");
}



  function contragolpeTargetScore(indicado, p) {
    // quanto mais negativo o vínculo, maior a chance de puxar (desafeto)
    const rel = relGet(indicado.id, p.id);
    const hostility = (-rel) * 2.0;
    const convenience = p.status.alvo * 0.7 + p.attrs.rejeicao * 0.5 + p.attrs.conflito * 0.4;
    const threat = p.attrs.provas * 0.25 + p.attrs.estrategia * 0.25 + p.status.pop * 0.25;
    const noise = rnd(-1.0, 1.0);
    return hostility * 1.2 + convenience * 0.5 + threat * 0.15 + noise;
  }

  function doContragolpe() {
    const alive = alivePlayers();
    const leaderId = state.weekState.leaderId;
    const imuneId = state.weekState.imuneId;
    const indicado = state.players.find((p) => p.id === state.weekState.indicadoLiderId);
    if (!indicado) return;

    // Regra nova só até o Top 5 (isto é, aplica quando tem mais de 5 na casa)
    if (alive.length <= 4) return;

    const bf = state.weekState?.bigFone || {};
    const bfImm = Array.isArray(bf.immuneIds) ? bf.immuneIds : [];
    const candidates = alive.filter((p) =>
      p.id !== leaderId &&
      p.id !== imuneId &&
      p.id !== indicado.id &&
      p.id !== bf.noVoteId &&
      p.id !== bf.extraParedaoId &&
      !bfImm.includes(p.id)
    );
    if (!candidates.length) return;

    candidates.sort((a, b) => contragolpeTargetScore(indicado, b) - contragolpeTargetScore(indicado, a));
    const puxado = candidates[0];

    state.weekState.contragolpeId = puxado.id;
    bump(puxado, { pop: -0.22, alvo: +0.85 });

    // quem é puxado tende a piorar a relação com quem puxou
    state.relations[puxado.id] = state.relations[puxado.id] || {};
    const r0 = relGet(puxado.id, indicado.id);
    state.relations[puxado.id][indicado.id] = clamp(r0 - 0.6, -5, 5);

    gameLine(`${indicado.name} puxa ${puxado.name}`, "contragolpe: o indicado escolhe alguém para ir junto", "o clima piora e vira briga de narrativa", "muda a mira da casa", "misto", "paredao");
  }

  function chooseVote(voter, candidates) {
    const weighted = candidates.map((c) => {
      const dislike = c.status.alvo * 1.1 + c.attrs.rejeicao * 0.9 + c.attrs.conflito * 0.8;
      const shield = c.attrs.social * 0.7 + c.status.pop * 0.6;
      const threat = c.attrs.provas * 0.45 + c.attrs.estrategia * 0.35 + c.status.pop * 0.5;
      const r = relGet(voter.id, c.id);
      const relShield = r * 0.45;
      const noise = rnd(-1.2, 1.2);
      const score = (dislike - shield) * 0.8 + threat * 0.35 - relShield + noise;
      return { item: c, w: clamp(score + 5, 0.2, 30) };
    });
    return pickWeighted(weighted);
  }

  function leaderBreakTie(leader, tiedIds) {
    const tiedPlayers = tiedIds.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
    tiedPlayers.sort((a, b) => leaderTargetScore(leader, b) - leaderTargetScore(leader, a));
    return tiedPlayers[0] || null;
  }

  function doCasa() {
    const alive = alivePlayers();
    const leaderId = state.weekState.leaderId;
    const imuneId = state.weekState.imuneId;
    const indicadoLiderId = state.weekState.indicadoLiderId;
    const contragolpeId = state.weekState.contragolpeId;
    const leader = state.players.find((p) => p.id === leaderId);
    if (!leader) return;

    const voters = alive.filter((p) => p.id !== leaderId);
    const votes = [];
    const tally = new Map();

    // ===== VOTO EM BLOCOS (médio): quase sempre 2 blocos claros, mas alguns votam sozinhos =====
    const PROB_FOLLOW_BLOCK = 0.78;
    const PROB_SOLO_BASE = 0.22;
    const REL_MIN_JOIN = 0.35;

    const bf = state.weekState?.bigFone || {};
    const bfImm = Array.isArray(bf.immuneIds) ? bf.immuneIds : [];
    const protectedIds = new Set([
      leaderId,
      indicadoLiderId,
      contragolpeId,
      imuneId,
      bf.noVoteId,
      bf.extraParedaoId,
      ...bfImm
    ].filter(Boolean));

    function pickWhips() {
      const cand = voters.filter((p)=>p.status.alive);
      if (cand.length <= 2) return cand.slice(0,2).map((p)=>p.id);

      const scored = cand.map((p)=>{
        const s = (p.attrs.social ?? 5) * 1.1 + (p.attrs.estrategia ?? 5) * 0.9 + (p.attrs.conflito ?? 5) * 0.35 + (p.status.pop ?? 5) * 0.25;
        return { p, s };
      }).sort((a,b)=>b.s-a.s);

      const whipA = scored[0].p;

      const rest = scored.slice(1).map((x)=>x.p);
      rest.sort((a,b)=>{
        // preferir alguém com relação fraca/negativa com o whipA (forma dois lados)
        const ra = relGet(whipA.id, a.id);
        const rb = relGet(whipA.id, b.id);
        return ra - rb;
      });

      const whipB = rest[0] || scored[1].p;
      return [whipA.id, whipB.id];
    }

    const whipIds = pickWhips();
    const whipA = state.players.find((p)=>p.id===whipIds[0]) || null;
    const whipB = state.players.find((p)=>p.id===whipIds[1]) || null;

    const blockOf = {}; // voterId -> 0/1
    const blocks = [[], []];

    if (whipA) { blockOf[whipA.id] = 0; blocks[0].push(whipA); }
    if (whipB && (!whipA || whipB.id !== whipA.id)) { blockOf[whipB.id] = 1; blocks[1].push(whipB); }

    // atribui membros a quem eles mais confiam
    for (const v of voters) {
      if (!v || !v.status.alive) continue;
      if (blockOf[v.id] !== undefined) continue;

      // alguns são "independentes"
      const indep = ((v.attrs.estrategia ?? 5) >= 8 && Math.random() < 0.55) || ((v.attrs.social ?? 5) <= 3 && Math.random() < 0.45);
      if (indep) continue;

      const ra = whipA ? relGet(v.id, whipA.id) : -999;
      const rb = whipB ? relGet(v.id, whipB.id) : -999;
      const best = ra >= rb ? 0 : 1;
      const bestScore = Math.max(ra, rb);
      if (bestScore >= REL_MIN_JOIN) {
        blockOf[v.id] = best;
        blocks[best].push(v);
      }
    }

    // se um bloco ficou pequeno, puxa alguns neutros pra manter 2 lados
    function fillSmallBlock() {
      if (!whipA || !whipB) return;
      const a = blocks[0].length;
      const b = blocks[1].length;
      if (a >= 3 && b >= 3) return;

      const small = a <= b ? 0 : 1;
      const whip = small === 0 ? whipA : whipB;
      const need = Math.max(0, 3 - blocks[small].length);
      if (!need) return;

      const pool = voters.filter((v)=>v.status.alive && blockOf[v.id] === undefined);
      pool.sort((x,y)=> relGet(y.id, whip.id) - relGet(x.id, whip.id));
      for (const v of pool) {
        if (blocks[small].length >= 3) break;
        if (relGet(v.id, whip.id) >= 0.15) {
          blockOf[v.id] = small;
          blocks[small].push(v);
        }
      }
    }
    fillSmallBlock();

    function validCandidates(forVoter) {
      return alive.filter((c) => !protectedIds.has(c.id) && c.id !== forVoter.id);
    }

    function blockTarget(members) {
      let best = null;
      let bestScore = -1e9;

      for (const cand of alive) {
        if (protectedIds.has(cand.id)) continue;
        // alvo de bloco não mira em alguém do próprio bloco
        if (members.some((m)=>m.id===cand.id)) continue;

        let score = 0;
        for (const m of members) {
          const r = relGet(m.id, cand.id);
          score += (-r) * 1.25;
          score += (cand.status.alvo || 0) * 0.10;
          score += (10 - (cand.status.pop || 0)) * 0.06;
        }
        score += (cand.attrs.rejeicao || 0) * 0.08;

        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
      return best;
    }

    const bt = [null, null];
    if (blocks[0].length) bt[0] = blockTarget(blocks[0]);
    if (blocks[1].length) bt[1] = blockTarget(blocks[1]);

    const reveal = Math.random() < 0.65;
    if (reveal && (blocks[0].length >= 3 || blocks[1].length >= 3)) {
      const nameA = whipA ? shortNameForEvents(whipA) : "Bloco A";
      const nameB = whipB ? shortNameForEvents(whipB) : "Bloco B";
      const tgtA = bt[0] ? shortNameForEvents(bt[0]) : "—";
      const tgtB = bt[1] ? shortNameForEvents(bt[1]) : "—";
      gameAdd(`
  <div class="gameCard gameParedao">
    <div class="gcTitle"><strong>Clima de votação</strong></div>
    <div class="gcLine">
      <strong>${escapeHtml(nameA)}</strong> tenta puxar votos em <strong>${escapeHtml(tgtA)}</strong>. Enquanto <strong>${escapeHtml(nameB)}</strong> tenta puxar votos em <strong>${escapeHtml(tgtB)}</strong>.
    </div>
  </div>
`);
    }

    const shuffled = voters.slice().sort(() => Math.random() - 0.5);

    for (const voter of shuffled) {
      const candidates = validCandidates(voter);
      if (!candidates.length) continue;

      let chosen = null;
      const b = blockOf[voter.id];

      const isVip = !!(state.weekState.vipIds && state.weekState.vipIds.includes(voter.id));
      const isXepa = !!(state.weekState.xepaIds && state.weekState.xepaIds.includes(voter.id));

      const soloChance = PROB_SOLO_BASE + (isXepa ? 0.08 : 0) - (isVip ? 0.06 : 0);
      const followChance = PROB_FOLLOW_BLOCK + (isVip ? 0.10 : 0) - (isXepa ? 0.04 : 0);

      if (b !== undefined && bt[b] && Math.random() > soloChance && Math.random() < followChance) {
        const targetId = bt[b].id;
        if (candidates.some((c)=>c.id===targetId)) chosen = bt[b];
      }

      if (!chosen) chosen = chooseVote(voter, candidates);

      votes.push({ fromId: voter.id, toId: chosen.id });
      tally.set(chosen.id, (tally.get(chosen.id) || 0) + 1);
    }

    const counts = Array.from(tally.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);

    // Guarda votos da casa (para possíveis eventos de "voto descoberto" em seg/ter)
    state.weekState = state.weekState || {};
    state.weekState.lastCasaVotes = votes.slice();

    function pickNom(excludeIds, slotLabel) {
      const remaining = counts.filter((x) => !excludeIds.has(x.id));
      if (!remaining.length) return null;
      const max = remaining[0].count;
      const tiedIds = remaining.filter((x) => x.count === max).map((x) => x.id);
      if (tiedIds.length === 1) return state.players.find((p) => p.id === tiedIds[0]) || null;

     const chosen = leaderBreakTie(leader, tiedIds);
const tiedNames = tiedIds
  .map((id) => state.players.find((p) => p.id === id)?.name)
  .filter(Boolean)
  .join(", ");

// guarda para exibir depois da contagem
state.weekState.houseTieBreak = {
  leaderId: leader?.id,
  slotLabel,
  tiedNames,
  chosenName: chosen?.name || "—"
};

return chosen;
									

    }

    const useContragolpe = !!contragolpeId;

    const nom1 = pickNom(new Set(), useContragolpe ? "indicação da casa" : "1ª indicação da casa");
    let nom2 = null;
    if (!useContragolpe) {
      const ex2 = new Set();
      if (nom1) ex2.add(nom1.id);
      nom2 = pickNom(ex2, "2ª indicação da casa");
    }

    state.weekState.indicadosCasaIds = [nom1?.id, nom2?.id].filter(Boolean);

    state.weekState.houseVotes = votes;
    state.weekState.tally = Object.fromEntries(Array.from(tally.entries()));

    const set = new Map();
    const ind = state.players.find((p) => p.id === indicadoLiderId);
    const pux = state.players.find((p) => p.id === contragolpeId);
    if (ind) set.set(ind.id, ind);
    if (pux) set.set(pux.id, pux);
    if (nom1) set.set(nom1.id, nom1);
    if (nom2) set.set(nom2.id, nom2);

    // Big Fone pode adicionar um nome extra ao paredão (sexta)
    if (bf.extraParedaoId) {
      const extra = state.players.find((p) => p.id === bf.extraParedaoId);
      if (extra && extra.status.alive) set.set(extra.id, extra);
    }

    const desiredSize = bf.extraParedaoId ? 4 : 3;

    // fallback se por algum motivo não fechou o tamanho esperado
    if (set.size < desiredSize) {
      for (const p of alive) {
        if (p.id === leaderId) continue;
        if (!set.has(p.id)) set.set(p.id, p);
        if (set.size === desiredSize) break;
      }
    }

    const paredao = Array.from(set.values()).slice(0, desiredSize);
    state.weekState.paredaoIds = paredao.map((p) => p.id);
    paredao.forEach((p) => bump(p, { strikes: +1 }));

    const voteLines = votes
      .map((v) => {
        const fromP = state.players.find((p) => p.id === v.fromId);
        const toP = state.players.find((p) => p.id === v.toId);
        const from = fromP ? shortNameForEvents(fromP) : "??";
        const to = toP ? shortNameForEvents(toP) : "??";
        return `${escapeHtml(from)} → <strong>${escapeHtml(to)}</strong>`;
      })
      .join("<br>");

    const tallyLine = counts
      .slice(0, 10)
      .map((x) => {
        const pp = state.players.find((p) => p.id === x.id);
        return `<strong>${escapeHtml(pp ? shortNameForEvents(pp) : "??")}</strong>: ${x.count}`;
      })
      .join(" • ");

gameAdd(`<div class="gameCard gameNeu"><strong>Votação da casa</strong>: <br/> ${voteLines || "—"}</div>`);
gameAdd(`<div class="gameCard gameNeu"><strong>Contagem</strong>: ${tallyLine || "—"}</div>`);

// desempate do líder (após a contagem)
if (state.weekState.houseTieBreak && state.weekState.houseTieBreak.tiedNames) {
  const tb = state.weekState.houseTieBreak;
  const l = tb.leaderId ? state.players.find((p) => p.id === tb.leaderId) : leader;
  if (l) {
    gameLine(
  null,
  `👑 Votação da casa empatou, ${escapeHtml(shortNameForEvents(l))} como líder desempata, escolhendo ${escapeHtml(tb.chosenName)} para o paredão!`,
  "decisão fecha a indicação",
  "expõe alvo e mexe no clima",
  "misto",
  "paredao"
);
  }
}

    const names = paredao.map((p) => p.name).join(", ");
    gameLine(names, "paredão formado", "a tensão sobe", "alianças e blocos ficam expostos", "misto", "paredao");
  }

  function undoParedaoStrike(p) {
    if (!p || !p.status) return;
    if (p.status.strikes !== undefined) p.status.strikes = Math.max(0, (p.status.strikes || 0) - 1);
    if (p.status.paredaoCount !== undefined) p.status.paredaoCount = Math.max(0, (p.status.paredaoCount || 0) - 1);
  }

  function doBateVoltaIfNeeded() {
  const ids = Array.isArray(state.weekState.paredaoIds) ? [...state.weekState.paredaoIds] : [];
  if (ids.length !== 4) return;

  const indicadoLiderId = state.weekState.indicadoLiderId;

  // Regra: indicado pelo líder não participa
  const participants = ids.filter((id) => id && id !== indicadoLiderId);
  if (participants.length < 2) return;

  // prova de sorte pura
  const winnerId = participants[rndInt(0, participants.length - 1)];
  const winner = state.players.find((p) => p.id === winnerId);
  if (!winner) return;

  // remove vencedor do paredão (domingo termina com 3)
  state.weekState.paredaoIds = ids.filter((id) => id !== winnerId);
  undoParedaoStrike(winner);

  const indicado = indicadoLiderId ? state.players.find((p) => p.id === indicadoLiderId) : null;

  const partNames = participants
    .map((id) => state.players.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => shortNameForEvents(p))
    .join(", ");

  const indicadoTxt = indicado
    ? `${escapeHtml(shortNameForEvents(indicado))} (indicação do líder) não participa`
    : "Indicado do líder não participa";

  const partsTxt = partNames ? escapeHtml(partNames) : "—";
  const winnerTxt = escapeHtml(shortNameForEvents(winner));

  // 1 único card com tudo
  gameAdd(`
    <div class="gameCard gameNeu">
      <div style="font-weight:900; font-size:16px; margin-bottom:6px;">
       🔄 Bate e Volta 🔄
      </div>

      <div style="margin-bottom:6px;">
        Prova de bate e volta logo após a votação da casa.
      </div>
      <div style="margin-bottom:6px; opacity:.92;">
        <strong>Regra:</strong> ${indicadoTxt}
      </div>

      <div style="margin-bottom:6px; opacity:.92;">
        <strong>Participantes:</strong> ${partsTxt}
      </div>
      <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.12);">
        <span style="fonte-size:14px">🙌 <strong>${winnerTxt}</strong> vence e escapa do paredão. 🙌</span>
        <div style="opacity:.9; margin-top:4px;">Agora o domingo termina com 3 nomes.</div>
      </div>
    </div>
  `);
}

function publicoElimPerc(paredao) {
    // Modelo: voto para ELIMINAR. Popularidade maior => menos votos.
    // Queremos que pop 8 vs pop 2 gere ~4x mais votos para quem tem pop 2.
    const k = POP_VOTE.k;

    // 1) score base (como antes, mas comprimido)
    const base = paredao.map((p) => {
      const risk = p.attrs.rejeicao * 1.5 + p.attrs.conflito * 0.9 + p.status.alvo * 1.0 + (10 - p.attrs.emocional) * 0.25 + (10 - p.status.pop) * 0.7;
      const shield = p.attrs.social * 1.0 + p.status.pop * 1.5 + p.attrs.estrategia * 0.1;
      const raw = clamp(risk - shield + 8 + rnd(-1.2, 1.8), 0.4, 60);
      return { id: p.id, p, raw };
    });

    // 2) peso por popularidade (exponencial no eixo (10 - pop))
    //    pop baixo => exp(k*(10-pop)) alto.
    base.forEach((x) => {
      const pop = clamp(x.p.status.pop ?? 0, 0, 10);
      const popWeight = Math.exp(k * (10 - pop));
      // mistura com o score base (para manter rejeição/alvo relevantes)
      const mixed = (1 - POP_VOTE.baseMix) * popWeight + POP_VOTE.baseMix * (x.raw / 10);
      x.w = Math.max(0.05, mixed);
    });

    // Favorito no paredão: votos contra ele caem pela metade
    for (const x of base) {
      if (isPublicFavorite(x.p)) x.w *= 0.5;
    }


    // 3) Coalizão de torcidas (se dois são amigos fortes, as torcidas tendem a mirar no terceiro)
    //    Aqui é explícito e só afeta paredão.
    if (PUBLIC_COALITION.enabled && base.length === 3) {
      const [a, b, c] = base.map((x) => x.p);
      const relAB = relGet(a.id, b.id);
      const relAC = relGet(a.id, c.id);
      const relBC = relGet(b.id, c.id);

      const pairs = [
        { p1: a, p2: b, outsider: c, rel: relAB },
        { p1: a, p2: c, outsider: b, rel: relAC },
        { p1: b, p2: c, outsider: a, rel: relBC }
      ].sort((x, y) => y.rel - x.rel);

      const best = pairs[0];
      if (best.rel >= 0.65) {
        const popGap = Math.abs((best.p1.status.pop ?? 0) - (best.p2.status.pop ?? 0));
        const outsiderPop = best.outsider.status.pop ?? 0;
        // gatilho: amizade forte + outsider bem mais fraco ou cenário provável de "duas torcidas contra uma"
        const should = popGap <= 5 && ((best.p1.status.pop ?? 0) + (best.p2.status.pop ?? 0)) - outsiderPop >= PUBLIC_COALITION.minGapToTrigger;
      
if (PUBLIC_COALITION.enabled && base.length === 3) {
  const ctx = (typeof dayCtx === "function") ? dayCtx() : null;

  const [a, b, c] = base.map((x) => x.p);
  const relAB = relGet(a.id, b.id);
  const relAC = relGet(a.id, c.id);
  const relBC = relGet(b.id, c.id);

  const pairs = [
    { p1: a, p2: b, outsider: c, rel: relAB },
    { p1: a, p2: c, outsider: b, rel: relAC },
    { p1: b, p2: c, outsider: a, rel: relBC }
  ].sort((x, y) => y.rel - x.rel);

  const best = pairs[0];

  if (best.rel >= 0.65) {
    const p1Pop0 = clamp(best.p1.status.pop ?? 0, 0, 10);
    const p2Pop0 = clamp(best.p2.status.pop ?? 0, 0, 10);
    const outsiderPop0 = clamp(best.outsider.status.pop ?? 0, 0, 10);

    const popGap = Math.abs(p1Pop0 - p2Pop0);

    // gatilho: amizade forte + outsider bem mais fraco ou cenário provável de "duas torcidas contra uma"
    const should =
      popGap <= 5 &&
      (p1Pop0 + p2Pop0) - outsiderPop0 >= PUBLIC_COALITION.minGapToTrigger;

    if (should && Math.random() < PUBLIC_COALITION.chance) {
      // --- intensidades (0..1) para escalar o efeito ---
      const relFactor = clamp((best.rel - 0.65) / 0.35, 0, 1);

      const outsiderRej0 = clamp(best.outsider.attrs?.rejeicao ?? 0, 0, 10);
      const duoPopAvg = (p1Pop0 + p2Pop0) / 2;

      const rejFactor = outsiderRej0 / 10;     // rejeição alta puxa coalizão
      const threatFactor = duoPopAvg / 10;     // duo popular puxa coalizão

      const baseBoost = (PUBLIC_COALITION.maxBoost / 100);

      const boost =
        baseBoost *
        relFactor *
        (1 + 0.9 * rejFactor + 0.5 * threatFactor);

      // aplica: aumenta votos no outsider, reduz nos dois amigos
      for (const x of base) {
        if (x.p.id === best.outsider.id) x.w *= (1 + boost);
        if (x.p.id === best.p1.id || x.p.id === best.p2.id) x.w *= (1 - boost * 0.60);
      }

      // --- contra-ataque: torcida do outsider mira no menos popular do duo ---
      const targetCounter = (p1Pop0 <= p2Pop0) ? best.p1 : best.p2;
      const counterBoost = clamp(boost * 0.45, 0, 0.35);

      for (const x of base) {
        if (x.p.id === targetCounter.id) x.w *= (1 + counterBoost);
        if (x.p.id === best.outsider.id) x.w *= (1 - counterBoost * 0.25);
      }

      if (PUBLIC_COALITION.logIt && typeof gameAdd === "function") {
        
    // Fallback: nunca deixar o Xuitter sem comentários
    if (pinned.length === 0 && others.length === 0) {
      addTweet(tweet(pickOne(TEMPLATES.analyst)), true);
    }
const html = `
          <div class="gameCard gameNeu" style="padding:6px 8px;font-size:12px;line-height:1.35;opacity:.95;">
            <div>
              Torcidas de <strong>${escapeHtml(displayName(best.p1))}</strong> e
              <strong>${escapeHtml(displayName(best.p2))}</strong> se alinham e puxam votos em
              <strong>${escapeHtml(displayName(best.outsider))}</strong>.
            </div>
            <div style="margin-top:4px;opacity:.92;">
              Contra-ataque: torcida de <strong>${escapeHtml(displayName(best.outsider))}</strong> mira em
              <strong>${escapeHtml(displayName(targetCounter))}</strong>.
            </div>
          </div>
        `;
        gameAdd(html);
      }
    }
  }
}
      }
    }

    const sum = base.reduce((s, x) => s + x.w, 0) || 1;
    const perc = {};
    base.forEach((x) => (perc[x.id] = (x.w / sum) * 100));

    // arredondamento estável
    const ids = Object.keys(perc);
    const rounded = ids.map((id) => ({ id, p: Math.round(perc[id] * 100) / 100 }));
    const total = rounded.reduce((s, x) => s + x.p, 0);
    const diff = Math.round((100 - total) * 100) / 100;
    rounded.sort((a, b) => b.p - a.p);
    if (rounded.length) rounded[0].p = Math.round((rounded[0].p + diff) * 100) / 100;

    const out = {};
    rounded.forEach((x) => (out[x.id] = x.p));
    return out;
  }

  // Final (Top 3): porcentagens do público para o vencedor
  
	
	function publicoWinPerc(final3) {
  // Modelo: voto para VENCER.
  // Agora: Popularidade puxa forte e Rejeição derruba forte (comparação direta).
  const raw = final3.map((p) => {
    const like =
      (p.attrs.social ?? 0) * 1.2 +
      (p.status.pop ?? 0) * 2.0 +
      (p.attrs.emocional ?? 0) * 0.4 +
      (p.attrs.estrategia ?? 0) * 0.2;

    const penalty =
      (p.attrs.rejeicao ?? 0) * 0.25 +
      (p.attrs.conflito ?? 0) * 0.20 +
      (p.status.alvo ?? 0) * 0.10;

    // Mantém um tempero do "like" para não virar só número seco,
    // mas com pouco peso na final.
    const baseScore = clamp(like - penalty + 10 + rnd(-0.6, 1.2), 0.4, 60);

    // Normaliza para 0..1
    const popNorm = clamp(p.status.pop ?? 0, 0, 10) / 10;
    const rejNorm = clamp(p.attrs.rejeicao ?? 0, 0, 10) / 10;

    // Ajuste fino (mude aqui se quiser mais/menos punição)
    const A = 2.4; // força da popularidade (maior = pop pesa mais)
    const B = 5.2; // força da rejeição (maior = rejeição derruba mais)

    // Peso principal: pop puxa, rejeição derruba multiplicando direto.
    // +0.01 evita zero absoluto quando pop = 0.
	let wCore = Math.pow(popNorm + 0.01, A) * Math.pow(Math.max(0.0001, 1 - rejNorm), B);

    // Mistura leve com o baseScore (mantém alguma nuance)
    // Se quiser ainda mais "só pop vs rej", diminua baseMix para 0.05 ou 0.
    const mix = clamp(POP_VOTE?.baseMix ?? 0.10, 0, 0.50);
    const wMixed = (1 - mix) * wCore + mix * (baseScore / 60);

    // Piso para nunca zerar totalmente
    let w = Math.max(0.01, wMixed);

    // Se o favorito chega na final, a narrativa pode virar um pouco contra
    if (isPublicFavorite(p)) w *= 2.5;

    // Penalidade leve para planta na final
    w *= finalVoteWeight(p);


    return { id: p.id, w };
  });

  const sum = raw.reduce((s, x) => s + x.w, 0) || 1;
  const perc = {};
  raw.forEach((x) => (perc[x.id] = (x.w / sum) * 100));

  const ids = raw.map((x) => x.id);
  let rounded = ids.map((id) => ({ id, p: Math.round(perc[id] * 100) / 100 }));
  const total = rounded.reduce((s, x) => s + x.p, 0);
  const diff = Math.round((100 - total) * 100) / 100;
  rounded.sort((a, b) => b.p - a.p);
  if (rounded.length) rounded[0].p = Math.round((rounded[0].p + diff) * 100) / 100;

  const out = {};
  rounded.forEach((x) => (out[x.id] = x.p));
  return out;
}


  function maxPercId(perc) {
    let bestId = null;
    let best = -Infinity;
    for (const [id, v] of Object.entries(perc)) {
      if (v > best) {
        best = v;
        bestId = id;
      }
    }
    return bestId;
  }

  

  function snapshotVotesForWeek(weekNumber) {
    state.votesHistory = Array.isArray(state.votesHistory) ? state.votesHistory : [];
    const w = state.weekState || {};
    const snap = {
      week: weekNumber,
      leaderId: w.leaderId ?? null,
      anjoId: w.anjoId ?? null,
      imuneId: w.imuneId ?? null,
      indicadoLiderId: w.indicadoLiderId ?? null,
      contragolpeId: w.contragolpeId ?? null,
      indicadosCasaIds: Array.isArray(w.indicadosCasaIds) ? w.indicadosCasaIds.slice() : [],
      houseVotes: Array.isArray(w.houseVotes) ? w.houseVotes.map(v => ({ fromId: v.fromId, toId: v.toId })) : [],
      tally: w.tally ? { ...w.tally } : {},
      paredaoIds: Array.isArray(w.paredaoIds) ? w.paredaoIds.slice() : [],
      publicoPerc: w.publicoPerc ? { ...w.publicoPerc } : {},
      eliminadoId: w.eliminadoId ?? null
    };

    const i = state.votesHistory.findIndex(x => x && x.week === weekNumber);
    if (i >= 0) state.votesHistory[i] = snap;
    else state.votesHistory.push(snap);
  }

function snapshotPopForWeek(weekNumber) {
    for (const p of state.players) {
      p.status.popWeek = p.status.popWeek || {};
        if (p.status.favPublic === undefined) p.status.favPublic = false;
        if (p.status.leaderCount === undefined || p.status.leaderCount === null) p.status.leaderCount = 0;
        if (p.status.anjoCount === undefined || p.status.anjoCount === null) p.status.anjoCount = 0;
        if (p.status.paredaoCount === undefined || p.status.paredaoCount === null) p.status.paredaoCount = (p.status.strikes ?? 0);
        if (p.status.room === undefined) p.status.room = null;
      p.status.popWeek[String(weekNumber)] = Math.round((p.status.pop ?? 0) * 100) / 100;
    }
  }

  function doPublicoElim(opts = { advanceWeek: true, resetDayToWednesday: true, deferAdvance: false }) {
  const paredao = (state.weekState.paredaoIds || [])
    .map((id) => state.players.find((p) => p.id === id))
    .filter(Boolean);

  // todos que vão ao Bate e Volta aparecem no episódio
  paredao.forEach(p => { p.status.didSomethingThisWeek = true; });

  if (paredao.length !== 3) return;

  const perc = publicoElimPerc(paredao);
  state.weekState.publicoPerc = perc;

  const elimId = maxPercId(perc);
  const eliminado = state.players.find((p) => p.id === elimId);
  if (!eliminado) return;

  state.weekState.eliminadoId = eliminado.id;
  markEliminated(eliminado);

  // se o favorito sai, perde a coroa
  if (isPublicFavorite(eliminado)) removePublicFavorite(eliminado);

  // quem ficou ganha leve boost
  paredao
    .filter((p) => p.id !== eliminado.id)
    .forEach((p) => bump(p, { pop: 0.32, alvo: -0.10 }));

  // ---------- Favorito do público (mensagem vai para dentro do card) ----------
  let favoriteMsgHtml = "";
  const survivors = paredao.filter((p) => p.id !== eliminado.id);

  // Marca sobreviventes do paredão (para eventos de reação/confronto na semana seguinte)
  state.weekState = state.weekState || {};
  state.weekState.lastParedaoSurvivorIds = survivors.map(s => s.id);
  survivors.forEach((s) => {
    s.status = s.status || {};
    s.status.returnedFromParedao = true;
    s.status.returnedFromParedaoWeek = state.week;
  });

  // processa em ordem aleatória para evitar vieses
  survivors.sort(() => Math.random() - 0.5);

  for (const s of survivors) {
    if (Math.random() < 0.25) {
      addPublicFavorite(s);
      favoriteMsgHtml = `<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,.12); color:#fbe2d6;">
        <strong>${escapeHtml(displayName(s))}</strong> ganha força e vira ${g(s, { M: "o favorito", F: "a favorita", O: "a favorite" })} da semana.
      </div>`;
      break;
    }
  }

  // ---------- história de despedida: quem mais/menos gostava ----------
  const aliveOthers = state.players.filter((p) => p && p.status && p.status.alive && p.id !== eliminado.id);

  let bestFriend = null;
  let worstEnemy = null;

  if (aliveOthers.length) {
    // quem MAIS gostava da eliminada: maior relGet(p -> eliminada)
    bestFriend = aliveOthers
      .slice()
      .sort((a, b) => (relGet(b.id, eliminado.id) - relGet(a.id, eliminado.id)) + rnd(-0.05, 0.05))[0];

    // quem MENOS gostava: menor relGet(p -> eliminada)
    worstEnemy = aliveOthers
      .slice()
      .sort((a, b) => (relGet(a.id, eliminado.id) - relGet(b.id, eliminado.id)) + rnd(-0.05, 0.05))[0];

    // evita ser a mesma pessoa nos dois papéis, se possível
    if (bestFriend && worstEnemy && bestFriend.id === worstEnemy.id && aliveOthers.length >= 2) {
      worstEnemy = aliveOthers
        .filter((x) => x.id !== bestFriend.id)
        .sort((a, b) => (relGet(a.id, eliminado.id) - relGet(b.id, eliminado.id)) + rnd(-0.05, 0.05))[0] || worstEnemy;
    }
  }

  const bestName = bestFriend ? escapeHtml(shortNameForEvents(bestFriend)) : "alguém";
  const worstName = worstEnemy ? escapeHtml(shortNameForEvents(worstEnemy)) : "alguém";

  // ---------- montar linhas de porcentagem ----------
  const ordered = paredao
    .map((p) => ({ p, v: perc[p.id] ?? 0 }))
    .sort((a, b) => b.v - a.v);

  const elimPerc = ordered.find((x) => x.p.id === eliminado.id)?.v ?? (perc[eliminado.id] ?? 0);
  const others = ordered.filter((x) => x.p.id !== eliminado.id);

  // Ex: "Aline: 29.26% • Eduardo: 27.53%"
  const othersLine = others
    .map((x) => `${escapeHtml(x.p.name)}: ${fmt2(x.v)}%`)
    .join(" • ");

  // ---------- logging/histórico ----------
  const ctx = dayCtx();
  state.elimHistory.push({
    week: state.week,
    dayName: ctx.name,
    eliminatedId: eliminado.id,
    percById: perc,
    paredaoIds: paredao.map((p) => p.id)
  });

  // snapshot da semana para a aba Votações
  snapshotVotesForWeek(state.week);

  // ---------- card único (título + subtítulo + texto) ----------
  gameAdd(`
    <div class="gameCard gameParedao" style="flex-direction:column; align-items:flex-start; gap:6px;">
      <div style="font-size:14px; font-weight:900; letter-spacing:.3px;">
        Encerra a votação
      </div>

      <div style="font-size:12px; opacity:.92;">
        Alguém dá adeus ao sonho de ganhar o programa
      </div>

      <div style="margin-top:6px; font-size:14px; font-weight:900;">
        Quem sai hoje é <span style="color:#fff">${escapeHtml(eliminado.name)}</span> com ${fmt2(elimPerc)}% dos votos.
      </div>

      <div style="font-size:12px; opacity:.92;">
        ${othersLine || "—"}
      </div>

      <div style="margin-top:6px; font-size:12px; opacity:.95; line-height:1.35;">
        ${escapeHtml(shortNameForEvents(eliminado))} se despede dos amigos. <strong>${bestName}</strong> chora e acompanha até a porta.
        <br>
        <strong>${worstName}</strong> celebra a eliminação.
      </div>

      ${favoriteMsgHtml}
    </div>
  `);
  // Planta: atualiza métrica semanal + chance de virar/deixar de ser
  endOfWeekPlantSystem(meta);


  // Mantém snapshots e fluxo original do jogo
  snapshotPopForWeek(state.week);
  // Arquétipos BBB: snapshot semanal
  try { snapshotArchetypesForWeek(state.week); } catch { /* ignora */ }
  try { computeSeasonTitles(); } catch { /* ignora */ }
  snapshotArchetypesForWeek(state.week);
  // Guarda o evento de eliminação para o 🦜 Xuitter (sem depender de weekState, que é resetado)
  state.lastEvent = {
    type: "elimination",
    week: state.week,
    eliminatedId: eliminado.id,
    publicoPerc: { ...perc },
    ts: Date.now(),
    shown: false
  };

  // Invalida cache do Xuitter imediatamente após uma eliminação.
  // Motivo: o feed é cacheado por (semana+dia) e, se já tiver sido renderizado antes,
  // a eliminação pode não aparecer até o usuário avançar o dia.
  try {
    state.narrative = state.narrative || {};
    state.narrative.daily = {}; // simples e seguro
  } catch { /* ignora */ }
  resetWeekState();

  if (opts.advanceWeek) {
    if (opts.deferAdvance) {
      pendingAdvance = { weekDelta: 1, resetDayToWednesday: !!opts.resetDayToWednesday };
    } else {
      state.week += 1;
      if (opts.resetDayToWednesday) state.dayIndex = 0;
    }
  }
}

  // Top 4: prova que define o finalista + paredão dos 3
  function doFinalProva() {
    const alive = alivePlayers();
    if (alive.length !== 4) return;

    const { winner: finalista, ranked } = runProva("Reta Final", alive, "gameLeader");
if (!finalista) return;


    state.weekState.leaderId = finalista.id;
    bump(finalista, { pop: +0.60, alvo: -0.35 });

    const paredao = alive.filter((p) => p.id !== finalista.id);
    state.weekState.paredaoIds = paredao.map((p) => p.id);
    paredao.forEach((p) => bump(p, { strikes: +1 }));

    gameLine(
      finalista.name,
      "venceu a prova da reta final e virou finalista",
      "ganha alívio e confiança",
      "os outros três vão ao paredão",
      "muda o favoritismo e acelera narrativa de final",
      "leader"
    );
  }

  // Top 3: votação final e encerra temporada
 
function doPublicoWin() {
  const alive = alivePlayers();

  if (alive.length <= 0) return;

  // helpers internos
  const getPlayerById = (id) => (state.players || []).find((x) => x.id === id) || null;

  const findElimPercent = (playerId) => {
    const hist = Array.isArray(state.votesHistory) ? state.votesHistory : [];
    // procura do fim pro começo (mais recente primeiro)
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (!h || h.eliminadoId !== playerId) continue;

      // alguns saves guardam mapa em h.perc, outros em h.publicoPerc
      const percMap = h.publicoPerc || h.perc || null;
      if (percMap && percMap[playerId] != null) return Number(percMap[playerId]) || 0;
      return 0;
    }
    return null; // não achou (ex: expulso/desistente ou semana sem snapshot)
  };

  const renderRestRanking = (finalistIdsSet) => {
    const order = Array.isArray(state.elimOrder) ? state.elimOrder.slice() : [];
    if (!order.length) return "";

    // elimOrder normalmente é: primeiro eliminado -> ... -> último eliminado
    // para ranking final, a gente quer: último eliminado = 4º, etc
    const ids = order.slice().reverse().filter((id) => id && !finalistIdsSet.has(id));
    if (!ids.length) return "";

    let pos = 4;
    const lines = ids.map((id) => {
      const p = getPlayerById(id);
      if (!p) return "";

      const nm = escapeHtml(p.name || displayName(p) || "—");

      const tag = String(p.status?.elimTag || "").trim().toLowerCase();
      const isExpulso = tag === "expulso";
      const isDesistente = tag === "desistente";

      if (isExpulso) {
        return `<div style="font-size:12px; color:#fff; opacity:.92;">${pos++}º ${nm} <span style="opacity:.9;">(Expulso)</span></div>`;
      }
      if (isDesistente) {
        return `<div style="font-size:12px; color:#fff; opacity:.92;">${pos++}º ${nm} <span style="opacity:.9;">(Desistente)</span></div>`;
      }

      const perc = findElimPercent(id);
      if (perc == null) {
        return `<div style="font-size:12px; color:#fff; opacity:.92;">${pos++}º ${nm}</div>`;
      }

      return `<div style="font-size:12px; color:#fff; opacity:.92;">${pos++}º ${nm} <span style="opacity:.9;">(saiu com ${fmt2(perc)}% dos votos)</span></div>`;
    }).filter(Boolean);

    if (!lines.length) return "";

    return `
      <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,.18); width:100%;">
        <div style="font-size:12px; font-weight:800; letter-spacing:.2px; color:#fff; opacity:.9; margin-bottom:6px;">
          RANKING DA TEMPORADA
        </div>
        ${lines.join("")}
      </div>
    `;
  };

  // ===== 1 jogador =====
  if (alive.length === 1) {
    const only = alive[0];

    state.final.winnerId = only.id;
    state.final.secondId = null;
    state.final.thirdId = null;

    state.gameOver = true;
    snapshotPopForWeek(state.week);
  // Arquétipos BBB: snapshot semanal
  try { snapshotArchetypesForWeek(state.week); } catch { /* ignora */ }
  try { computeSeasonTitles(); } catch { /* ignora */ }

    const winnerLabel = g(only, { M: "Vencedor", F: "Vencedora", O: "Vencedore" });

    const finalists = new Set([only.id]);
    const restHtml = renderRestRanking(finalists);

    const html = `
      <div class="gameCard gameLeader" style="flex-direction:column; align-items:flex-start; gap:6px;">
        <div style="font-size:14px; font-weight:800; letter-spacing:.4px; color:#ffd84d;">
          RESULTADO FINAL
        </div>
        <div style="font-size:16px; font-weight:900; color:#ffd84d;">
          ${winnerLabel}: <strong>${escapeHtml(only.name)}</strong> (por tabela)
        </div>
        ${restHtml}
      </div>
    `;
    gameAdd(html);
    return;
  }

  // ===== 2 jogadores =====
  if (alive.length === 2) {
    const perc = publicoWinPerc(alive);
    const sorted = alive
      .map((p) => ({ p, v: perc[p.id] ?? 0 }))
      .sort((a, b) => b.v - a.v);

    const winner = sorted[0];
    const second = sorted[1];

    state.final.winnerId = winner?.p.id ?? null;
    state.final.secondId = second?.p.id ?? null;
    state.final.thirdId = null;

    state.gameOver = true;
    snapshotPopForWeek(state.week);
  // Arquétipos BBB: snapshot semanal
  try { snapshotArchetypesForWeek(state.week); } catch { /* ignora */ }
  try { computeSeasonTitles(); } catch { /* ignora */ }

    const winnerLabel = g(winner.p, { M: "Vencedor", F: "Vencedora", O: "Vencedore" });

    const finalists = new Set([winner.p.id, second.p.id]);
    const restHtml = renderRestRanking(finalists);

    const html = `
      <div class="gameCard gameLeader" style="flex-direction:column; align-items:flex-start; gap:6px;">
        <div style="font-size:14px; font-weight:800; letter-spacing:.4px; color:#ffd84d;">
          RESULTADO FINAL
        </div>

        <div style="font-size:16px; font-weight:900; color:#ffd84d;">
          ${winnerLabel}: <strong>${escapeHtml(winner.p.name)}</strong> (${fmt2(winner.v)}%)
        </div>

        <div style="font-size:13px; color:#fff;">
          2º ${escapeHtml(second.p.name)} (${fmt2(second.v)}%)
        </div>

        ${restHtml}
      </div>
    `;
    gameAdd(html);
    return;
  }

  // ===== 3 jogadores =====
  if (alive.length !== 3) return;

  const perc = publicoWinPerc(alive);
  const sorted = alive
    .map((p) => ({ p, v: perc[p.id] ?? 0 }))
    .sort((a, b) => b.v - a.v);

  const winner = sorted[0];
  const second = sorted[1];
  const third = sorted[2];

  state.final.winnerId = winner?.p.id ?? null;
  state.final.secondId = second?.p.id ?? null;
  state.final.thirdId = third?.p.id ?? null;

  state.gameOver = true;
  snapshotPopForWeek(state.week);
  // Arquétipos BBB: snapshot semanal
  try { snapshotArchetypesForWeek(state.week); } catch { /* ignora */ }
  try { computeSeasonTitles(); } catch { /* ignora */ }

  const winnerLabel = g(winner.p, { M: "Vencedor", F: "Vencedora", O: "Vencedore" });

  const finalists = new Set([winner.p.id, second.p.id, third.p.id]);
  const restHtml = renderRestRanking(finalists);

  const html = `
    <div class="gameCard gameLeader" style="flex-direction:column; align-items:flex-start; gap:6px;">
      <div style="font-size:14px; font-weight:800; letter-spacing:.4px; color:#ffd84d;">
        RESULTADO FINAL
      </div>

      <div style="font-size:16px; font-weight:900; color:#ffd84d;">
        ${winnerLabel}: <strong>${escapeHtml(winner.p.name)}</strong> (${fmt2(winner.v)}%)
      </div>

      <div style="font-size:13px; color:#fff;">
        2º ${escapeHtml(second.p.name)} (${fmt2(second.v)}%)
      </div>

      <div style="font-size:13px; color:#fff;">
        3º ${escapeHtml(third.p.name)} (${fmt2(third.v)}%)
      </div>

      ${restHtml}
    </div>
  `;

  gameAdd(html);
}


// Frases curtas (máx. 12 palavras) pra variar a introdução
const INTRO_PREMIERE_LINES = [
  "Portas abertas. Olhares se cruzam. Ninguém quer parecer fraco.",
  "Chegou a hora. Sorrisos, tensão e muita leitura de energia.",
  "A casa acorda. O elenco entra testando limites e alianças.",
  "Primeiro passo: conhecer, medir, desconfiar. O jogo começou.",
  "Clima elétrico. Todo mundo procurando espaço e atenção.",
  "A estreia começa. Carisma em alta, cautela também.",
  "Entram rindo, mas os olhos denunciam cálculo.",
  "Chegada oficial. Primeiras impressões viram sentença silenciosa.",
];

const INTRO_SPOTLIGHT_LINES = [
  "chega comunicativo e domina as primeiras rodas.",
  "entra confiante e puxa assunto sem esforço.",
  "aparece afiado e vira referência imediata.",
  "se posiciona bem e chama atenção no olhar.",
  "fala pouco, mas passa presença forte.",
  "chega engraçado e ganha risadas rápido.",
  "entra observando tudo e deixa o clima tenso.",
  "se solta cedo e vira assunto na casa.",
];

const INTRO_BOND_LINES = [
  "encaixam papo fácil e já viram dupla provável.",
  "se entendem rápido e trocam sinais de parceria.",
  "conectam na hora e combinam jogo sem falar muito.",
  "batem química e começam grudados pela casa.",
  "acham pontos em comum e firmam primeira aliança.",
  "trocam confidências cedo e viram referência um pro outro.",
];

const INTRO_CLASH_LINES = [
  "trocam olhares tortos e o clima pesa na hora.",
  "se estranham de cara e a conversa morre rápido.",
  "rola tensão imediata e ninguém disfarça bem.",
  "uma frase atravessa e vira incômodo instantâneo.",
  "bate insegurança e o silêncio vira recado.",
  "a energia não encaixa e o quarto comenta depois.",
];

function runIntroEvents(meta) {
  const alive = alivePlayers();
  if (!alive.length) return;

  // 1) Estreia (box especial)
  dayAdd(`
    <div class="bigSetupBox">
      <div class="setupTitle">🧿🧿🧿 <strong>Estreia</strong> 🧿🧿🧿</div>
      <div class="setupText">${pickOne(INTRO_PREMIERE_LINES)}</div>
    </div>
  `);

  // 2) Divisão de quartos (box já estilizado no assignRoomsDay1)
  assignRoomsDay1(meta);

  // 3) Apresentações / primeiras impressões (cards especiais)
  const pickN = Math.max(4, Math.min(6, Math.round(4 + Math.random() * 2)));
  const pool = alive.slice().sort(() => Math.random() - 0.5).slice(0, pickN);

  pool.forEach((p) => {
    const popGain = 0.25 + Math.random() * 0.25;
    bump(p, { pop: popGain, alvo: -0.05 });

    const PName = escapeHtml(displayName(p));
    const msg = pickOne(INTRO_SPOTLIGHT_LINES);

    dayAdd(`
      <div class="dayCard evSpotlight">
        <span style="flex:1; min-width:0;">
          ✨ <strong>${PName}</strong>: ${msg}
        </span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
      </div>
    `);
  });

  // 4) Laço inicial (evBond)
  const a = alive[Math.floor(Math.random() * alive.length)];
  const bPool = alive.filter((x) => x.id !== a?.id);
  const b = bPool.length ? bPool[Math.floor(Math.random() * bPool.length)] : null;

  if (a && b) {
    relAdd(a.id, b.id, 0.6);
    bump(a, { pop: 0.12 });
    bump(b, { pop: 0.10 });

    const AName = escapeHtml(displayName(a));
    const BName = escapeHtml(displayName(b));
    const msg = pickOne(INTRO_BOND_LINES);

    dayAdd(`
      <div class="dayCard evBond">
        <span style="flex:1; min-width:0;">
          🤝 <strong>${AName} e ${BName}</strong>: ${msg}
        </span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
      </div>
    `);
  }

  // 5) Atrito inicial (evClash)
  const c = alive[Math.floor(Math.random() * alive.length)];
  const dPool = alive.filter((x) => x.id !== c?.id);
  const d = dPool.length ? dPool[Math.floor(Math.random() * dPool.length)] : null;

  if (c && d) {
    relAdd(c.id, d.id, -0.5);
    bump(c, { alvo: 0.10 });
    bump(d, { alvo: 0.08 });

    const CName = escapeHtml(displayName(c));
    const DName = escapeHtml(displayName(d));
    const msg = pickOne(INTRO_CLASH_LINES);

    dayAdd(`
      <div class="dayCard evClash">
        <span style="flex:1; min-width:0;">
          ⚡ <strong>${CName} e ${DName}</strong>: ${msg}
        </span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("misto")}</span>
      </div>
    `);
  }

  // 6) Convivência extra (opcional)
  generateDayEvents(meta.ctx);
}

	  
function runFinalThreeNostalgia(ctx, alive) {
  // 2 ou 3 cards por dia no final 3
  const n = Math.random() < 0.5 ? 2 : 3;

  const pool = alive.slice();
  // shuffle simples
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const picks = pool.slice(0, n);

  const LINES = [
    "sentou na area externa e relembrou tudo que viveu na temporada",
    "falou sobre o que faria com o premio",
    "falou sobre como quer que publico lembre da edição",
    "bateu saudade dos aliados que cairam pelo caminho",
    "comentou sobre como vai ser la fora",
    "se pergunta se ganhou muitos seguidores",
    "fala da saudade da família",
    "ensaia mentalmente o discurso de final",
    "olhou a casa em silencio e diz que parece um sonho estar tao perto da final",
    "sentiu nostalgia ao lembrar as festas",
    "lembra das grandes tretas da temporada",
    "conversa sobre planos pos-casa e promete nao mudar quem é",
    "desabafou sobre pressao"
  ];

  picks.forEach((p) => {
    const desc = pickOne(LINES);

    dayAdd(`
      <div class="dayCard evNeu">
        <span style="flex:1; min-width:0;">
          🏁 <strong>${escapeHtml(displayName(p))}</strong>: ${escapeHtml(desc)}.
        </span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
      </div>
    `);

    // impacto leve: nostalgia costuma render bem, mas sem explodir
    bump(p, { pop: rnd(0.08, 0.22), alvo: rnd(-0.06, 0.04) });
  });

  // opcional: um micro-boost de convivência entre o trio (leve e positivo)
  if (alive.length === 3 && Math.random() < 0.35) {
    const a = alive[0], b = alive[1], c = alive[2];
    relAdd(a.id, b.id, rnd(0.05, 0.12), "coletivo");
    relAdd(a.id, c.id, rnd(0.05, 0.12), "coletivo");
    relAdd(b.id, c.id, rnd(0.05, 0.12), "coletivo");
  }
}
function runIntroPings(meta) {
  // 2 ou 3 por dia
  const n = Math.random() < 0.5 ? 2 : 3;

  // memória do que já apareceu na semana 1
  state.introPingShown = state.introPingShown || {};

  const alive = alivePlayers().filter(p => p?.status?.alive);

  // só mostra quem ainda não foi “pingado”
  const pool = alive.filter(p => !state.introPingShown[p.id]);
  if (!pool.length) return;

  // embaralha simples
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }

  const picks = pool.slice(0, n);

  picks.forEach((p) => {
    state.introPingShown[p.id] = true;

    const desc = pickOne([
      "conta sua história no sofá e deixa a casa ouvindo em silêncio",
      "fala da sua trajetória e já tenta conquistar o público",
      "se abre sobre família e propósito e ganha um VT forte",
      "diz o que veio fazer no jogo e promete não fugir de treta",
      "faz uma apresentação carismática e vira assunto no quarto"
    ]);

    dayAdd(`
      <div class="dayCard evPos">
        <span style="flex:1; min-width:0;">
          <strong>${escapeHtml(displayName(p))}</strong>: ${escapeHtml(desc)}.
        </span>
        <span class="vtLine" style="margin:0; white-space:nowrap;">${vtToEmojis("positivo")}</span>
      </div>
    `);

    // impacto leve (opcional)
    bump(p, { pop: rnd(0.10, 0.25) });
  });
}
async function loadPresetJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Não foi possível carregar o elenco.");
  }
  return await res.json();
}

	function validateImportedState(obj) {
  if (!obj || typeof obj !== "object") return null;

  // Aceita imports que venham como { state: {...} } ou direto {...}
  const s = (obj && obj.state && typeof obj.state === "object") ? obj.state : obj;

  // Campos mínimos
  if (!Array.isArray(s.players)) return null;

  // Fallbacks pra não quebrar o app
  if (!Array.isArray(s.log)) s.log = [];
  if (!s.final || typeof s.final !== "object") s.final = { winnerId: null, secondId: null, thirdId: null };
  if (typeof s.week !== "number") s.week = 1;
  if (typeof s.dayIndex !== "number") s.dayIndex = 0;
  if (typeof s.gameOver !== "boolean") s.gameOver = false;

  // Week state
  if (!s.weekState || typeof s.weekState !== "object") s.weekState = null;

  // Rooms
  if (!s.rooms || typeof s.rooms !== "object") s.rooms = { assigned: false, a: null, b: null, map: {} };

  // Normaliza players minimamente
  s.players = s.players.map((p, idx) => {
    const out = p && typeof p === "object" ? p : {};
    if (!out.id) out.id = `p_${idx}_${Math.random().toString(16).slice(2)}`;
    if (!out.status || typeof out.status !== "object") out.status = { alive: true };
    if (typeof out.status.alive !== "boolean") out.status.alive = true;
    if (!out.attrs || typeof out.attrs !== "object") out.attrs = {};
    if (!out.firstName && !out.name) out.name = out.name || "Participante";
    // Idade (novo): backfill para imports/presets antigos
    ensurePlayerAge(out);
    return out;
  });

  // Garante apelido base (pra não sumir na UI)
  (s.players || []).forEach((p) => {
    if (!p.baseName || !String(p.baseName).trim()) {
      // respeita nickname manual se existir
      const manual = String(p.nickname || "").trim();
      p.baseName = manual || String(p.firstName ?? p.name ?? "").trim();
    }
  });

  return s;
}

/* ===== Boot Start ===== */
function bootStart() {
  if (state.gameOver) return;

  // Quartos
  ensureRoomsState();
  if (state.rooms?.assigned) applyRoomCssVars();

  // Se já existe log, a temporada já começou: não mexe em week/dayIndex.
  // Só garante weekState coerente e corrige quartos se necessário.
  if (state.log.length > 0) {
    if (!state.weekState) resetWeekState();
    ensureRoomsState();
    applyRoomCssVars();

    // Save antigo: se não havia quartos atribuídos, atribui uma vez sem registrar no histórico.
    if (!state.rooms?.assigned && alivePlayers().length > 0) {
      const ctx = dayCtx();
      const meta = { ctx, week: state.week, dayName: ctx.name };
      dayBuffer = [];
      gameBuffer = [];
      assignRoomsDay1(meta);
      dayBuffer = [];
      gameBuffer = [];
      ensureRoomsState();
      applyRoomCssVars();
    }

    save();
    render();
    return;
  }

  // Temporada nova (log vazio)
  resetWeekState();

  if (START_CONFIG.mode === "tuesday_empty_then_intro") {
    state.week = 1;
    state.dayIndex = 6; // Terça
    save();
    render();
    return;
  }

  // Padrão: começa na Quarta e mostra a Estreia (não avança o dia aqui)
  state.week = 1;
  state.dayIndex = 0; // Quarta

  ensureRoomsState();
  applyRoomCssVars();

  const ctx = dayCtx();
  const meta = { ctx, week: 1, dayName: ctx.name };

  dayBuffer = [];
  gameBuffer = [];

  maybeRebalanceRooms(meta);

  // Intro já inclui quartos + eventos iniciais (não duplicar quartos aqui)
  runIntroEvents(meta);

  flushDayBlocks(meta);

  save();
  render();
}


  function simulateDay() {
    if (state.gameOver) return;

    const beforeDayIndex = state.dayIndex;
    const aliveN = alivePlayers().length;

    // limpa flags diárias que não devem vazar para o próximo dia
    if (state.weekState && state.weekState.bigFight) delete state.weekState.bigFight;

    const ctxFrozen = dayCtx();
    const weekFrozen = state.week;
    const meta = { ctx: ctxFrozen, week: weekFrozen, dayName: ctxFrozen.name };

    dayBuffer = [];
    gameBuffer = [];

    // snapshot para comentário diário (antes de qualquer alteração do dia)
    state.narrative = state.narrative || { daily: {}, prevSnap: {} };
    state.narrative.prevSnap = captureNarrativeSnapshot();

    // snapshot do weekState para atualizar narrativa por diffs
    const prevWeekState = JSON.parse(JSON.stringify(state.weekState || {}));

    ensureRoomsState();
    applyRoomCssVars();
    maybeRebalanceRooms(meta);

    // Modo Terça vazio -> ao avançar pra Quarta, gera a estreia uma vez
    if (START_CONFIG.mode === "tuesday_empty_then_intro" && weekFrozen === 1 && ctxFrozen.key === "qua") {
      if (!hasDayLog(1, ctxFrozen.name, "Dia")) {
        runIntroEvents(meta);
        flushDayBlocks(meta);

        save();
        render();

        if (!state.gameOver && state.dayIndex === beforeDayIndex) {
          state.dayIndex = (state.dayIndex + 1) % 7;
        }
        save();
        return;
      }
    }

    // 1) convivência
   if (weekFrozen === 1) {
  runIntroPings(meta);
}
    // efeitos do Monstro (isolamento e laço entre monstros)
    tickMonstroDaily(meta);

    generateDayEvents(ctxFrozen);

	    // Favorito do público pode surgir durante a Festa (Quarta) a partir da semana 2.
	    // Chance máxima 5%, modulada por Social e Emocional.
	    if (ctxFrozen?.festa && typeof maybeAddPublicFavoriteFromEvent === "function") {
	      maybeAddPublicFavoriteFromEvent(meta, {
	        baseMax: 0.15,
	        pickN: 4,
	        maxFavorites: 2,
		        messageFn: (p) => {
		          const nm = `<strong>${escapeHtml(displayName(p))}</strong>`;
		          const fav = g(p, { M: "favorito", F: "favorita", O: "favorite" });
		          return `${nm} chama a atenção na festa e vira ${fav} do público!`;
		        },
	        weightsFn: (p) => {
	          const social = clamp(Number(p?.attrs?.social ?? 0), 0, 10) / 10;
	          const emocional = clamp(Number(p?.attrs?.emocional ?? 0), 0, 10) / 10;
	          const pop = clamp(Number(p?.status?.pop ?? 0), 0, 10) / 10;
	          // social puxa mais; emocional ajuda; pop dá um empurrão leve
	          const w = (0.70 * social + 0.30 * emocional);
	          return clamp(w * (0.85 + 0.15 * pop), 0, 1);
	        }
	      });
	    }

    // 2) agenda fixa (com final Top 4 / Top 3)
    const isTop4 = aliveN === 4;
    const isTop3 = aliveN === 3;
    const top6 = aliveN <= 6 && aliveN > 4;

	// SEGUNDA: Sincerão (foco do dia)
if (ctxFrozen.key === "seg") {
  runSincerao(meta);
}


    // QUINTA: líder ou prova final (Top4)
    if (ctxFrozen.key === "qui") {
      if (isTop4) {
        doFinalProva();
      } else if (aliveN > 3) {
        doLeader();
      }
    }

    // SEXTA: Big Fone (30% de chance; até Top 7)
    if (ctxFrozen.key === "sex") {
      doBigFone(meta);
    }

// SÁBADO: Anjo + Monstro + Festa do Patrocinador
    if (ctxFrozen.key === "sab") {
      if (!top6 && aliveN > 6) doAnjo();
      // Sábado: Anjo coloca 2 pessoas no Monstro
      if (!top6 && aliveN > 6 && state.weekState.anjoId) doMonstro(meta);
    }

// DOMINGO:
    // - no Top4: eliminação do paredão dos 3 (forma Top3)
    // - fora do Top4: segue formação normal
    if (ctxFrozen.key === "dom") {
      if (isTop4) {
        doPublicoElim({ advanceWeek: false, resetDayToWednesday: false });
      } else {
        if (!state.weekState.leaderId && aliveN > 3) doLeader();
        if (!top6 && aliveN > 6) doImune();
        if (aliveN > 3) {
          doIndica();
          doContragolpe();
          doCasa();
          // Se o Big Fone gerou 4 nomes no paredão, rola Bate e Volta (sorte)
          doBateVoltaIfNeeded();
        }
      }
    }

    // TERÇA: final no Top3, ou eliminação normal nas outras semanas
    if (ctxFrozen.key === "ter") {
      if (isTop3) {
        doPublicoWin();
      } else if (!isTop4) {
        // Garantia: se por algum motivo o paredão não foi formado no domingo, forma aqui para não quebrar o calendário
        if ((state.weekState.paredaoIds || []).length !== 3) {
          if (!state.weekState.leaderId && aliveN > 3) doLeader();
          // imunidade só faz sentido quando existe a mecânica
          if (!top6 && aliveN > 6 && !state.weekState.imuneId) doImune();
          if (!state.weekState.indicadoLiderId && aliveN > 3) doIndica();
          doContragolpe();
          if ((state.weekState.paredaoIds || []).length !== 3 && aliveN > 3) doCasa();
        }
        doPublicoElim({ advanceWeek: true, resetDayToWednesday: true, deferAdvance: true });
      }
    }

    // decay do favorito (10% por dia)
    const favs = currentFavorites();
    if (favs.length) {
      const lost = [];
      favs.forEach((f) => {
        if (Math.random() < 0.10) {
          removePublicFavorite(f);
          lost.push(f);
        }
      });
      if (lost.length) {
        const names = lost.map((x) => escapeHtml(displayName(x))).join(", ");
        dayAdd(`
  <div class="dayCard evNeu">
    <span style="flex:1; min-width:0;">
      <strong>Favorito do público</strong>: a maré vira e o favoritismo esfria para ${names}.
    </span>
    <span class="vtLine" style="margin:0; white-space:nowrap;">
      ${vtToEmojis("misto")}
    </span>
  </div>
`);
      }
    }

    // Atualiza o estado narrativo (timeline/reputação/temas)
    try { applyNarrativeFromWeekStateDiff(prevWeekState, state.weekState, meta); } catch (e) { console.error(e); }

    // Atualiza narrativa (timeline/reputação/temas) a partir do que aconteceu hoje
    try { applyNarrativeFromWeekStateDiff(prevWeekState, state.weekState, meta); } catch (e) { /* silencioso */ }

    flushDayBlocks(meta);

    // gera comentário diário BBB-style (mostrado na sidebar)
    try { buildDailyComment(meta); } catch {}

    save();
    render(); // mostra o dia que acabou de simular

    // aplica avanço de semana/dia (depois de renderizar o dia simulado)
    if (pendingAdvance) {
      state.week += pendingAdvance.weekDelta || 1;
      if (pendingAdvance.resetDayToWednesday) state.dayIndex = 0;
      pendingAdvance = null;
      save();
      return;
    }

    // avança o dia se ninguém resetou dayIndex para quarta
    if (!state.gameOver && state.dayIndex === beforeDayIndex) {
      state.dayIndex = (state.dayIndex + 1) % 7;
    }

    save();
  }
function runSincerao(meta) {
const alive = (typeof alivePlayers === "function") ? alivePlayers() : [];
  if (alive.length <= 4) return; // não tem Sincerão no top 4

  const type = randomPick(["DISCURSO", "SAI_FICA", "ALVO", "TOP3"]);

  const labels = {
    DISCURSO: "Discurso com réplica e tréplica",
    SAI_FICA: "Quem sai / quem fica",
    ALVO: "Escolher alvo",
    TOP3: "Top 3"
  };

  // Sincerão entra no card de Jogo (não no de Convivência)
 gameAdd(
  `<div class="gameCard gameSinceraoHead gameNeu">
     <div class="gameSinceraoTitle">Sincerão</div>
     <div class="gameSinceraoSub">${escapeHtml(labels[type] || "Dinâmica")}</div>
   </div>`
);

  const order = alive.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }

  for (const p of order) {
    if (!p || !p.status?.alive) continue;
    applySinceraoAction(p, type);
  }

	  // Chance (0..5%) de alguém ganhar favoritismo no Sincerão
	  // Conflito + emocional aumentam levemente a probabilidade.
	  if (typeof maybeAddPublicFavoriteFromEvent === "function") {
	    maybeAddPublicFavoriteFromEvent(meta, {
	      baseMax: 0.15,
	      pickN: 3,
	      maxFavorites: 2,
		      messageFn: (p) => {
		        const nm = `<strong>${escapeHtml(displayName(p))}</strong>`;
		        const fav = g(p, { M: "favorito", F: "favorita", O: "favorite" });
		        return `${nm} não teve medo do conflito e vira ${fav} do público.`;
		      },
	      weightsFn: (p) => {
	        const conflito = clamp(Number(p?.attrs?.conflito ?? 0), 0, 10) / 10;
	        const emocional = clamp(Number(p?.attrs?.emocional ?? 0), 0, 10) / 10;
	        // emocional pesa um pouco mais pra não virar só "treta"
	        return clamp(0.40 * conflito + 0.60 * emocional, 0, 1);
	      }
	    });
	  }
}

function sinceraoMultiplier(p) {
  let mult = 1;
  const e = Number(p?.attrs?.estrategia ?? 5);
  const c = Number(p?.attrs?.conflito ?? 5);
  const x = Number(p?.attrs?.excentricidade ?? 0);

  if (e >= 7) mult += 0.15;
  if (c >= 7) mult += 0.15;
  if (x >= 7) mult += 0.10;

  // planta sofre mais no sincerão
  if (p?.status?.planta) mult -= 0.15;

  return clamp(mult, 0.6, 1.4);
}

function pickSomeoneNotSelf(p) {
  const alive = alivePlayers().filter((x) => x && x.id !== p.id);
  return alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
}

function pickLeastLiked(p) {
  const alive = alivePlayers().filter((x) => x && x.id !== p.id);
  if (!alive.length) return null;
  alive.sort((a, b) => (relGet(p.id, a.id) - relGet(p.id, b.id)) + rnd(-0.3, 0.3));
  return alive[0];
}

function pickMostLiked(p) {
  const alive = alivePlayers().filter((x) => x && x.id !== p.id);
  if (!alive.length) return null;
  alive.sort((a, b) => (relGet(p.id, b.id) - relGet(p.id, a.id)) + rnd(-0.3, 0.3));
  return alive[0];
}

function pickTopFriends(p, n) {
  const alive = alivePlayers().filter((x) => x && x.id !== p.id);
  alive.sort((a, b) => (relGet(p.id, b.id) - relGet(p.id, a.id)) + rnd(-0.2, 0.2));
  return alive.slice(0, Math.max(0, n));
}

function sinceraoPopDeltaByTarget(target, whenTargetPopularDelta, whenTargetLowDelta) {
  const popT = Number(target?.status?.pop ?? target?.status?.pop ?? 0);
  return (popT > 5 ? whenTargetPopularDelta : whenTargetLowDelta);
}

function sinceraoLogGame(names, desc, type = "neu") {
  // Loga no card de Jogo usando o layout padrão de gameLine.
  if (typeof gameLine === "function") {
    gameLine(names, desc, type);
  } else {
    gameAdd(`<div class="gameCard gameNeu"><span class="gameCardText"><strong>${escapeHtml(formatNamesInText(names))}</strong>: ${escapeHtml(formatNamesInText(desc))}.</span></div>`);
  }
}

function sinceraoDiscurso(p) {
  const target = pickSomeoneNotSelf(p);
  if (!target) return;

  p.status.didSomethingThisWeek = true;
  p.status.madeDecisionThisWeek = true;
  p.status.didStrategyMoveThisWeek = true;
  p.status.hadConflictThisWeek = true;

  target.status.didSomethingThisWeek = true;
  target.status.hadConflictThisWeek = true;

  sinceraoLogGame(displayName(p), `fala mal de ${displayName(target)}`, "neu");

  // relação: alvo passa a gostar menos do autor
  relAdd(target.id, p.id, -0.8 * sinceraoMultiplier(p));

  // pop: falar de popular pega mal; falar de impopular rende
  const popDelta = sinceraoPopDeltaByTarget(target, -0.25, +0.20);
  bump(p, { pop: popDelta * sinceraoMultiplier(p) });

  maybeTriggerFight(p, target);
}

function sinceraoSaiFica(p) {
  const sair = pickLeastLiked(p);
  const ficar = pickMostLiked(p);
  if (!sair || !ficar) return;

  p.status.didSomethingThisWeek = true;
  p.status.madeDecisionThisWeek = true;
  p.status.didStrategyMoveThisWeek = true;

  sair.status.didSomethingThisWeek = true;
  ficar.status.didSomethingThisWeek = true;

  sinceraoLogGame(displayName(p), `escolhe ${displayName(sair)} para sair e ${displayName(ficar)} para ficar`, "neu");

  // relação: quem fica gosta mais; quem sai gosta menos
  relAdd(ficar.id, p.id, +0.9 * sinceraoMultiplier(p));
  relAdd(sair.id, p.id, -0.9 * sinceraoMultiplier(p));

  // pop: sair (bater em popular pega mal; bater em impopular rende)
  bump(p, { pop: sinceraoPopDeltaByTarget(sair, -0.25, +0.20) * sinceraoMultiplier(p) });

  // pop: ficar (proteger popular rende; proteger impopular pega mal)
  bump(p, { pop: sinceraoPopDeltaByTarget(ficar, +0.20, -0.15) * sinceraoMultiplier(p) });

  maybeTriggerFight(p, sair);
}

function sinceraoAlvo(p) {
  const target = pickSomeoneNotSelf(p);
  if (!target) return;

  p.status.didSomethingThisWeek = true;
  p.status.madeDecisionThisWeek = true;
  p.status.didStrategyMoveThisWeek = true;
  p.status.hadConflictThisWeek = true;

  target.status.didSomethingThisWeek = true;
  target.status.hadConflictThisWeek = true;

  sinceraoLogGame(displayName(p), `marca ${displayName(target)} como alvo`, "paredao");

  // relação: alvo passa a gostar menos
  relAdd(target.id, p.id, -1.0 * sinceraoMultiplier(p));

  // pop
  bump(p, { pop: sinceraoPopDeltaByTarget(target, -0.30, +0.25) * sinceraoMultiplier(p) });

  maybeTriggerFight(p, target);
}

function sinceraoTop3(p) {
  const top = pickTopFriends(p, 2);
  const sair = pickLeastLiked(p);
  if (top.length < 2 || !sair) return;

  p.status.didSomethingThisWeek = true;
  p.status.madeDecisionThisWeek = true;
  p.status.didStrategyMoveThisWeek = true;

  top[0].status.didSomethingThisWeek = true;
  top[1].status.didSomethingThisWeek = true;
  sair.status.didSomethingThisWeek = true;
  sair.status.hadConflictThisWeek = true;

  sinceraoLogGame(displayName(p), `coloca ${displayName(top[0])} e ${displayName(top[1])} no top 3 e escolhe ${displayName(sair)} para sair`, "neu");

  for (const t of top) {
    // relação: top gosta mais
    relAdd(t.id, p.id, +0.8 * sinceraoMultiplier(p));
    // pop: puxar popular pro top rende; puxar impopular pega mal
    bump(p, { pop: sinceraoPopDeltaByTarget(t, +0.15, -0.10) * sinceraoMultiplier(p) });
  }

  // relação: quem sai gosta menos
  relAdd(sair.id, p.id, -1.1 * sinceraoMultiplier(p));

  // pop: bater em popular pega mal; bater em impopular rende
  bump(p, { pop: sinceraoPopDeltaByTarget(sair, -0.30, +0.25) * sinceraoMultiplier(p) });

  maybeTriggerFight(p, sair);
}

function applySinceraoAction(p, type) {
  if (type === "DISCURSO") return sinceraoDiscurso(p);
  if (type === "SAI_FICA") return sinceraoSaiFica(p);
  if (type === "ALVO") return sinceraoAlvo(p);
  if (type === "TOP3") return sinceraoTop3(p);
}

function pickFightReason(a, b) {
  const likeAB = relGet(a.id, b.id);
  const likeBA = relGet(b.id, a.id);
  const like = Math.min(likeAB, likeBA);

  if (like < 0) {
    return randomPick([
      "por não ter sido avisado antes da crítica pública",
      "por se sentir exposto desnecessariamente na frente da casa",
      "por achar que o tom usado foi debochado ou desrespeitoso",
      "por acreditar que a crítica foi exagerada para aparecer no programa",
      "por ter sido escolhido como alvo enquanto esperava ser protegido"
    ]);
  }

  return randomPick([
    "por perceber que não é prioridade na aliança",
    "por achar que seguiu a opinião do grupo",
    "por sentir que foi atacado em efeito manada",
    "por ter ficado em silêncio quando poderia defendê-lo",
    "por se sentir usado estrategicamente"
  ]);
}

function maybeTriggerFight(a, b) {
  const base = 0.10;
  const ca = Number(a?.attrs?.conflito ?? 5);
  const cb = Number(b?.attrs?.conflito ?? 5);
  const xa = Number(a?.attrs?.excentricidade ?? 0);
  const xb = Number(b?.attrs?.excentricidade ?? 0);

  // conflituosos/excêntricos estouram mais fácil
  const extra = (ca >= 7 ? 0.04 : 0) + (cb >= 7 ? 0.04 : 0) + (xa >= 7 ? 0.03 : 0) + (xb >= 7 ? 0.03 : 0);
  const pFight = clamp(base + extra, 0, 0.22);

  if (Math.random() > pFight) return;

  const reason = pickFightReason(a, b);

  // Só briga gera card em Convivência, e sem VT line
gameAdd(
  `<div class="gameCard gameBigFight">
     <span class="gameCardText">🔥 🔥 <strong>${escapeHtml(b.name)}</strong> briga com <strong>${escapeHtml(a.name)}</strong> por ${escapeHtml(reason)}.🔥 🔥</span>
   </div>`
);

  // pode dar muito bem ou muito mal
const sign = Math.random() < 0.5 ? -1 : +1;
const impact = sign * (0.55 + rnd(0.05, 0.25));

// chance de gerar rejeição
let rejDelta = 0;

// só faz sentido rejeição quando o impacto é negativo
if (impact < 0 && Math.random() < 0.5) {
  bump(a, { rejeicao: rnd(0.4, 0.8) });
}
if (impact < 0 && Math.random() < 0.5) {
  bump(b, { rejeicao: rnd(0.4, 0.8) });
}

bump(a, { pop: impact, rejeicao: rejDelta });
bump(b, { pop: impact, rejeicao: rejDelta });

  a.status.didSomethingThisWeek = true;
  b.status.didSomethingThisWeek = true;
  a.status.hadConflictThisWeek = true;
  b.status.hadConflictThisWeek = true;
}

  /* ===== Planta (métrica semanal + estado) ===== */
  const PLANT = {
    popTaxPerWeek: 0.08,
    becomeStartScore: 2.8,
    becomeSlope: 0.18,
    becomeCap: 0.55,
    leaveBaseScore: 2.2,
    leaveSlope: 0.22,
    leaveDidBonus: 0.15,
    leaveDecBonus: 0.12,
    leaveCap: 0.70
  };

  function ensurePlantStatus(p) {
    if (!p) return;
    p.status = p.status || {};
    if (p.status.weeksSinceWin === undefined) p.status.weeksSinceWin = 0;
    if (p.status.weeksSinceParedao === undefined) p.status.weeksSinceParedao = 0;
    if (p.status.weeksSinceEvent === undefined) p.status.weeksSinceEvent = 0;
    if (p.status.popPrev === undefined) p.status.popPrev = Number(p.status.pop ?? 5.0);
    if (p.status.popStableStreak === undefined) p.status.popStableStreak = 0;
    if (p.status.decisionStreak === undefined) p.status.decisionStreak = 0;
    if (p.status.didSomethingThisWeek === undefined) p.status.didSomethingThisWeek = false;
    if (p.status.madeDecisionThisWeek === undefined) p.status.madeDecisionThisWeek = false;
    if (p.status.wonSomethingThisWeek === undefined) p.status.wonSomethingThisWeek = false;
    if (p.status.planta === undefined) p.status.planta = false;
    if (p.status.plantStreak === undefined) p.status.plantStreak = 0;
  }

  function plantScore(p) {
    ensurePlantStatus(p);
    const wsWin = p.status.weeksSinceWin ?? 0;
    const wsPar = p.status.weeksSinceParedao ?? 0;
    const wsEvt = p.status.weeksSinceEvent ?? 0;
    const stable = p.status.popStableStreak ?? 0;
    const wsDec = p.status.decisionStreak ?? 0;

    return (
      clamp(wsWin, 0, 6) * 0.25 +
      clamp(wsPar, 0, 6) * 0.20 +
      clamp(wsEvt, 0, 6) * 0.30 +
      clamp(stable, 0, 6) * 0.15 +
      clamp(wsDec, 0, 6) * 0.10
    );
  }

  function plantTurnChances(p) {
  const s = plantScore(p);

  // ─────────────────────────────
  // AINDA MAIS PLANTAS (bem menos bonzinho)
  // ─────────────────────────────
  const becomeStart = PLANT.becomeStartScore - 1.1;       // bem mais cedo
  const becomeSlope = PLANT.becomeSlope * 3.8;            // bem mais rápido
  const becomeCap   = Math.min(0.98, PLANT.becomeCap + 0.55);

  const did = !!p.status.didSomethingThisWeek;
  const decided = !!p.status.madeDecisionThisWeek;

  // se você marcar isso na semana, ótimo; se não marcar, cai no default e ainda funciona
  const hadConflict = !!p.status.hadConflictThisWeek;
  const didStrategy = !!p.status.didStrategyMoveThisWeek;

  // semana "morna" aumenta chance de virar planta
  const lowConflictWeek = !hadConflict;
  const lowStratWeek = !(decided || didStrategy);

  const bonusBecome =
    (lowConflictWeek ? 0.14 : 0) +
    (lowStratWeek ? 0.20 : 0);

  const pBecome =
    p.status.planta
      ? 0
      : clamp((s - becomeStart) * becomeSlope + bonusBecome, 0, becomeCap);

  const pLeave =
    p.status.planta
      ? clamp(
          (PLANT.leaveBaseScore - s) * PLANT.leaveSlope +
            (did ? PLANT.leaveDidBonus : 0) +
            (decided ? PLANT.leaveDecBonus : 0),
          0,
          PLANT.leaveCap
        )
      : 0;

  return { pBecome, pLeave, score: s };
}


  function updateWeekCounters(p) {
  ensurePlantStatus(p);

  p.status.weeksSinceWin = (p.status.weeksSinceWin ?? 0) + 1;
  p.status.weeksSinceEvent = (p.status.weeksSinceEvent ?? 0) + 1;
  p.status.decisionStreak = (p.status.decisionStreak ?? 0) + 1;

  if (p.status.wonSomethingThisWeek) p.status.weeksSinceWin = 0;
  if (p.status.didSomethingThisWeek) p.status.weeksSinceEvent = 0;
  if (p.status.madeDecisionThisWeek) p.status.decisionStreak = 0;

  // Só estar no Paredão conta (receber votos NÃO conta)
  const inParedao = (state.weekState?.paredaoIds || []).includes(p.id);

  p.status.weeksSinceParedao = (p.status.weeksSinceParedao ?? 0) + 1;
  if (inParedao) p.status.weeksSinceParedao = 0;

  const popNow = Number(p.status.pop ?? 0);
  const popPrev = Number(p.status.popPrev ?? popNow);
  const delta = Math.abs(popNow - popPrev);

  p.status.popStableStreak = (p.status.popStableStreak ?? 0) + 1;
  if (delta > 0.20) p.status.popStableStreak = 0;
  p.status.popPrev = popNow;

  // reseta flag de vitória semanal
  p.status.wonSomethingThisWeek = false;
}

  function applyPlantPopTax(p) {
    ensurePlantStatus(p);
    if (!p.status.planta) return;
    bump(p, { pop: -PLANT.popTaxPerWeek });
  }

  /* ===== Camada narrativa (comentário diário) =====
     - Não altera regras do simulador.
     - Só lê: pop, rejeição, alvo, paredão, vitórias, eliminações.
  */
  function narrativeKey(meta) {
    const w = meta?.week ?? state.week;
    const k = meta?.ctx?.key ?? dayCtx().key;
    return `w${w}-${k}`;
  }

  function captureNarrativeSnapshot() {
    const snap = {};
    state.players.forEach((p) => {
      if (!p || !p.id) return;
      snap[p.id] = {
        alive: !!p.status?.alive,
        pop: Number(p.status?.pop ?? 0),
        rej: Number(p.attrs?.rejeicao ?? 0),
        alvo: Number(p.status?.alvo ?? 0),
        strikes: Number(p.status?.strikes ?? 0),
        leaderCount: Number(p.status?.leaderCount ?? 0),
        anjoCount: Number(p.status?.anjoCount ?? 0),
        paredaoCount: Number(p.status?.paredaoCount ?? 0)
      };
    });
    return snap;
  }

  function fmtSigned(n) {
    const v = Number(n || 0);
    const s = (v > 0 ? "+" : v < 0 ? "" : "");
    return `${s}${fmt2(v)}`;
  }

  function computeNarrativeLabel(p, d, after) {
    const narr = p.status?.narr || { invisDays: 0, pressureDays: 0, lastLabel: "" };

    const visScore =
      Math.abs(d.pop) * 1.2 +
      Math.abs(d.rej) * 1.1 +
      Math.abs(d.alvo) * 0.8 +
      (d.strikes !== 0 ? 1.6 : 0);

    if (visScore < 0.18) narr.invisDays = (narr.invisDays || 0) + 1;
    else narr.invisDays = 0;

    const underPressure =
      after.rej >= 6.5 ||
      after.alvo >= 6.5 ||
      d.rej >= 0.8 ||
      d.strikes > 0;

    if (underPressure) narr.pressureDays = (narr.pressureDays || 0) + 1;
    else narr.pressureDays = 0;

    let label = "estável";
    if (!p.status?.alive) label = "fora do jogo";
    else if (d.strikes > 0 || after.rej >= 7.2) label = "sob pressão";
    else if (underPressure && narr.pressureDays >= 2) label = "em desgaste";
    else if (d.pop >= 0.45 && d.rej <= 0.25) label = "em ascensão";
    else if (narr.invisDays >= 3 && after.rej < 4.0) label = "invisível perigoso";
    else if (narr.invisDays >= 2 && after.pop >= 7.0 && after.rej < 3.2) label = "confortável demais";

    narr.lastLabel = label;
    p.status.narr = narr;
    return label;
  }

  
const XUITTER_NARRATIVE_VERSION = 18;

function buildDailyComment(meta) {
    const key = narrativeKey(meta);
    const prev = state.narrative?.prevSnap || {};
    const alive = alivePlayers();

    const rows = alive.map((p) => {
      const before = prev[p.id] || { pop: Number(p.status.pop ?? 0), rej: Number(p.attrs.rejeicao ?? 0), alvo: Number(p.status.alvo ?? 0), strikes: Number(p.status.strikes ?? 0) };
      const after = { pop: Number(p.status.pop ?? 0), rej: Number(p.attrs.rejeicao ?? 0), alvo: Number(p.status.alvo ?? 0), strikes: Number(p.status.strikes ?? 0) };
      const d = { pop: after.pop - before.pop, rej: after.rej - before.rej, alvo: after.alvo - before.alvo, strikes: after.strikes - before.strikes };
      const label = computeNarrativeLabel(p, d, after);
      return { p, before, after, d, label };
    });

    const byPop = rows.slice().sort((a,b)=> (b.after.pop - a.after.pop));
    const byRej = rows.slice().sort((a,b)=> (b.after.rej - a.after.rej));
    const byUp = rows.slice().sort((a,b)=> (b.d.pop - a.d.pop));
    const byDown = rows.slice().sort((a,b)=> (a.d.pop - b.d.pop));
    const byInvis = rows.slice().sort((a,b)=> ((b.p.status?.narr?.invisDays ?? 0) - (a.p.status?.narr?.invisDays ?? 0)));

    const topPopRow = byPop[0] || null;
    const topRejRow = byRej[0] || null;
    const up = byUp[0] || null;
    const down = byDown[0] || null;
    const invis = byInvis[0] || null;

    const ctx = meta?.ctx || dayCtx();
    const ws = state.weekState || {};

    // ===== "Xuitter" helpers =====
    function userHandle() {
      const pools = [];
      try { pools.push(...(Object.values(FIRST_NAMES || {}).flat())); } catch(e) {}
      try { pools.push(...(SURNAMES || [])); } catch(e) {}
      try { pools.push(...(FREE_NICKNAMES || [])); } catch(e) {}
      if (!pools.length) pools.push('User');

      const pick = () => String(pools[rndInt(0, pools.length - 1)] || 'User').replace(/\s+/g, '');
      const base = pick();
      const addSecond = Math.random() < 0.18 ? pick() : '';
      const sep = Math.random() < 0.35 ? '_' : '';
      const num = String(rndInt(10, 999));
      const name = addSecond ? (base + sep + addSecond) : base;
      return `${name}${num}`;
    }

    const suf = (p) => (p?.gender === 'F' ? 'a' : (p?.gender === 'M' ? 'o' : 'e'));
    const fmtName = (p) => `${escapeHtml(displayName(p))}`;

    const TEMPLATES = {
      headline_elim: [
        `Hoje foi dia de eliminação e eu tô em choque 😳 {OUT} saiu!`,
        `Eliminação mexeu com a casa toda. {OUT} já era.`,
        `Tchau tchau {OUT}. O jogo virou agora.`,
      ],
      headline_paredao: [
        `Paredão montado: {A}, {B} e {C}. Quero ver o caos 😬`,
        `Esse paredão tem ENREDO: {A}, {B} e {C}.`,
        `Eu não tava preparado pra esse paredão: {A}, {B} e {C}.`,
      ],
      headline_lider: [
        `{L} virou líder e agora o povo vai tremer 😌`,
        `Liderança de {L}. Hoje a casa se ajeita na marra.`,
        `Quem diria… {L} no comando. Quero ver as consequências.`,
      ],
      headline_anjo: [
        `{A} é anjo. Isso muda mais do que parece.`,
        `Anjo de {A}. Pequeno poder, grande efeito.`,
        `{A} ganhou anjo e tá com o jogo na mão por um instante.`,
      ],

      first_day: [
        `COMEÇOU! 😭🔥 Já quero edição icônica. Bora ver quem entrega!`,
        `Primeiro dia e eu já tô viciad{X} 😍🍿 Quem vai virar lenda?`,
        `Elenco novo, caos novo 😈✨ Quero TRETAS, provas e alianças!`,
        `Hoje é dia de julgar todo mundo em 10 segundos 😌👀`,
        `Que a edição seja histórica e o entretenimento venha 🙏🎬🔥`,
      ],
      bigfone: [
        `ATENDERAM O BIG FONEEEEE 😱📞`,
        `📞📞📞 BIG FONE ATENDIDO! Agora eu quero só ver... 😬🍿`,
        `MEU DEUS o Big Fone tocou e alguém atendeu 😭📞`,
        `Big Fone nunca é coisa boa… 😳📞`,
        `Isso aqui é o motivo de eu assistir BBB: BIG FONE! 😈📞`,
      ],
      bigfone_react: [
        `Coragem de atender, viu 😮‍💨📞`,
        `Atender Big Fone é 50% coragem e 50% caos 😭📞`,
        `Eu teria deixado tocar até cansar 😅📞`,
        `Já imagino a bomba vindo… 💣📞`,
        `Se isso não render, eu vou reclamar 😤📞`,
      ],
      party_headline: [
        `Hoje é dia de FESTA! 🎉🍾 Quero ver quem vai entregar caos e fofoca 👀`,
        `Festa na casa hoje 😍✨ E eu só quero entretenimento!`,
        `Dia de festa: bebida, música e climão 🤭🍹`,
      ],
      party_theme_love: [
        `A produção acertou MUITO nesse tema 😍🎨`,
        `Que festa linda, tô obcecad{X} 😭✨`,
        `Finalmente um tema decente! 👏🎉`,
      ],
      party_theme_hate: [
        `Gente… que tema nada a ver 😒`,
        `Essa decoração parece improvisada 🥴`,
        `A produção já fez melhor, viu 😬`,
      ],
      party_show_love: [
        `QUE SHOW foi esse??? 🔥🎤`,
        `Eu queria estar aí AGORA 😭🎶`,
        `A atração entregou tudo, sem defeitos 😍`,
      ],
      party_show_hate: [
        `Show fraquinho… tô com sono 😴`,
        `Ninguém animou com essa atração 🫠`,
        `Podia ter sido melhor, né 😬`,
      ],
      party_dance_love: [
        `{N} nasceu pra pista 😂💃`,
        `Eu não consigo parar de ver {N} dançando 😍🕺`,
        `{N} tá com energia de finalista hoje 🔥💃`,
      ],
      party_dance_cringe: [
        `Alguém tira {N} da pista 🥴💃`,
        `{N} dançando me dá vergonha alheia 😭`,
        `Eu amo que {N} nem liga e dança assim mesmo 😂`,
      ],
      party_gossip: [
        `A conversa no cantinho entre {A} e {B} 👀👀`,
        `Tem fofoca pesada sendo cozinhada nessa festa 🤭🍿`,
        `Depois dessa festa, nada vai ficar igual… 😬`,
      ],
      party_romance: [
        `{SHIP} ganhou força na festa 😍🍷`,
        `Eu vi o clima entre {A} e {B} e fiquei MALUCA 😭💘 {SHIP}`,
        `Festa é isso: ship nasce do nada 🤭💞 {SHIP}`,
      ],

      crush_unrec: [
        `Gente… {A} tá com crush em {B} né? 👀💭`,
        `Eu vi a carinha de {A} olhando {B}… shippei 😭💘`,
        `{A} iludid{X} com {B}? ai ai 😬💭`,
        `Isso tá muito novela: {A} x {B} 👀📺`,
        `Se {B} corresponder eu surt0 😭💘`,
      ],
      couple: [
        `EU SABIAAAAAA 😍💘 {A} e {B}! {SHIP} nasceu!`,
        `Gente o casal veio aí 😭💞 {A} + {B} = {SHIP}`,
        `Não aguento, tô 100% {SHIP} 😍✨`,
        `{SHIP} é real e eu não tô bem 😭💘`,
        `Finalmente um casal pra eu passar pano sem culpa 😌💞 {SHIP}`,
      ],
      couple_anti: [
        `Aff, casal já? 😒💤`,
        `Casal no BBB sempre dá ruim… só observando 👀😬`,
        `Não shippo. Desculpa {SHIP} 😶`,
        `Isso vai atrapalhar o jogo, tenho certeza 😩`,
      ],
      pop_leader: [
        `{N} segue sendo a maioral! 😍✨`,
        `Ou {N} nasceu pra esse jogo ou eu não sei mais nada 😍🫶`,
        `Toda rodada eu gosto mais de {N}, não tem jeito 😭❤️`,
        `{N} tá confortável demais… parece dona da casa 👑`,
        `Se fosse hoje, {N} levava fácil 😮‍💨👏`,
        `{N} não faz esforço e mesmo assim brilha ✨😌`,
        `{N} tá jogando bonito, viu 😍🔥`,
        `Quem não gosta de {N} tá assistindo errado 🤷😅`,
        `Eu queria ter metade da calma de {N} 😌🧘`,
        `{N} é o tipo de pessoa que cresce no caos 😈✨`,
      ],
      fandom_created: [
        `Já tô vendo o fandom de {N} se organizando 😂⭐`,
        `Nasceu a torcida de {N} e eu tô com medo 😬⭐`,
        `Pronto… agora {N} virou intocável pra muita gente 😅⭐`,
        `Fandom de {N} já tá fazendo mutirão, certeza 😂📲`,
        `Daqui a pouco não pode criticar {N} que o fandom vem 😮‍💨⭐`,
      ],
      hater_popularity: [
        `Não entendo esse hype todo em {N} 🤔`,
        `{N} popular por quê, exatamente? 😶`,
        `O que {N} fez além de existir? 🙃`,
        `Vocês se emocionam fácil… {N} nem entrega tudo isso 😅`,
        `Pra mim {N} tá superestimado(a) 😬`,
        `Eu juro que tento gostar de {N}, mas não desce 🥴`,
      ],
      hater_fandom: [
        `Já começou o fandom de {N} 😒`,
        `Torcida cega de {N} é complicado 🙄`,
        `Virou intocável agora? {N} pode tudo? 😅`,
        `O problema nem é {N}… é a torcida 😩`,
        `Qualquer coisa que {N} faz vira “genial” pra fã 😂`,
      ],
      rej_leader: [
        `Tá ficando difícil defender {N}… 😬`,
        `Mais um dia e o nome de {N} aparece. Não é coincidência 👀`,
        `{N} tá se queimando aos poucos e ninguém quer ver 🧯`,
        `Eu sinto que {N} tá com data marcada 😬🗓️`,
        `A casa tá pegando ranço de {N}, é isso? 🥴`,
        `{N} vive no alvo. Desgasta demais 🎯`,
        `Se cair de novo, não sei se segura 😵‍💫`,
        `{N} tá colecionando problema 🧨`,
        `Hoje foi mais um aviso pra {N} ⚠️`,
        `Não vejo a hora de {N} sair 😩🧹`,
      ],
      up: [
        `{N} cresceu na hora certa. Boa 😮‍💨👏`,
        `Do nada {N} em alta. O jogo é rápido demais 🚀`,
        `{N} finalmente apareceu. Era questão de tempo ⏳✨`,
        `Hoje foi dia de {N} ganhar moral 😌📈`,
        `{N} entendeu o timing e subiu 🎯🔥`,
        `A semana começou a sorrir pra {N} 😁🍀`,
        `{N} tava quiet{X} e agora tá gigante 👀💥`,
        `Eu disse… {N} ia reagir 😏`,
        `{N} virou assunto sem nem fazer alarde 👑`,
        `A casa vai ter que respeitar {N} agora 🗣️💪`,
      ],
      down: [
        `{N} saiu menor hoje. Dá pra sentir 😬`,
        `Não foi um dia bom pra {N} 😕`,
        `{N} tá perdendo chão aos poucos 🫠`,
        `O jogo apertou e {N} sentiu 😵`,
        `Mais um tombo pra {N}… 🧱`,
        `{N} tá acumulando desgaste e isso cobra 📉`,
        `Essa semana não tá conversando com {N} 🥶`,
        `{N} tá ficando com cara de alvo fixo 🎯`,
        `{N} escapou de um jeito estranho… mas caiu na narrativa 🤔`,
        `O clima virou contra {N} 🌪️`,
      ],
      invis: [
        `Alguém lembra que {N} tá na casa? 👀😂`,
        `{N} segue fora do radar… isso nunca é à toa 🕵️‍♂️`,
        `Enquanto brigam, {N} passa liso 🫥`,
        `Silêncio estratégico ou planta? {N} me intriga 🪴🤔`,
        `{N} tá invisível demais e isso é perigoso 😶‍🌫️`,
        `Quando perceberem {N}, já foi 😬`,
        `Ninguém cita {N}. Eu ficaria com medo 😳`,
        `{N} tá fazendo o jogo perfeito do silêncio 🤫✨`,
        `Discret{X} até demais: {N} 👀`,
        `{N} tá confortável nesse sumiço 😌`,
      ],
      fight_hype: [
        `🔥🔥 TRETA! {A} x {B} FOI TUDO 😂🍿`,
        `Gente, eu vivo por uma briga assim 🤯🔥`,
        `Finalmente movimento! Essa treta entregou TUDO 🧨🍿`,
        `Eu assistiria essa briga em looping 😂🔥`,
        `A produção nem precisou editar: foi cinema 🎬🔥`,
      ],
      fight_tired: [
        `Aff… briga por nada, preguiça 😒`,
        `Eu odeio treta. Que clima pesado 🥴`,
        `Vergonha alheia total… pra quê isso? 😩`,
        `Isso aí é baixaria, zero paciência 🙄`,
        `Queria só uma convivência em paz hoje 🕊️😮‍💨`,
      ],
      fight_teamA: [
        `Tô fechado com {A}! {A} falou o que tinha que falar 💅🔥`,
        `{A} AMASSOU. {B} que lute 😌👏`,
        `{A} foi certeir{X}. Eu aplaudi daqui 👏🔥`,
        `{A} não baixou a cabeça e eu respeito 💪✨`,
      ],
      fight_teamB: [
        `Não encosta em {B}! {B} tá cert{X} demais 😤🔥`,
        `{B} segurou a bronca e ainda saiu por cima 😮‍💨👏`,
        `{B} respondeu na lata. Adorei 😌🔥`,
        `{B} foi gigante nessa. Respeito 💪✨`,
      ],

      endgame_hype: [
        `Reta final chegando e eu tô tremendo 😭🔥`,
        `Top 5 é quando o jogo fica REAL de verdade 😬🍿`,
        `Agora não tem mais espaço pra erro… reta final é cruel 😮‍💨`,
        `Se o seu fav não acordar AGORA, já era 😭⚠️`,
        `Chegou na reta final? Então merece respeito 💪✨`,
        `Meu coração não aguenta mais uma eliminação 😭`,
      ],
      top3_favorites: [
        `Top 3 formado e eu já escolhi meu campeão: {FAV} 🏆😍`,
        `Se {FAV} não ganhar eu vou surtar 😭🏆`,
        `Meu fav no top 3… eu mereci essa alegria 😭✨ {FAV}`,
        `Top 3 perfeito? Pra mim sim 😌🔥 (time {FAV})`,
        `A edição pode acabar hoje que eu já tô em luto 😭 (time {FAV})`,
      ],
      final_win: [
        `ACABOUUUU 😭🏆 {WIN} CAMPEÃ(O)!`,
        `{WIN} mereceu DEMAIS! 🏆🔥`,
        `EU GRITEI AQUI 😭 {WIN} campeão do povo!!! 🏆✨`,
        `Parabéns {WIN}! Que trajetória 😮‍💨👏🏆`,
      ],
      final_robbed: [
        `Desculpa, mas {RUN} jogou mais… 🫠`,
        `Foi legal, mas eu achava que {RUN} merecia 😭`,
        `Nada contra {WIN}, mas {RUN} era meu campeão 😤`,
        `Injustiça! {RUN} carregou essa edição 😡`,
      ],
      final_farewell: [
        `Vou sentir saudade dessa edição 😭✨`,
        `Até ano que vem… já tô com abstinência 😭`,
        `Foi uma montanha-russa. Obrigado BBB simulado 😭🫶`,
        `Agora é esperar a próxima edição… saudades já 🥹`,
      ],
      elim_celebrate: [
        `FINALMENTE {OUT} SAIU!!! 😍🎉`,
        `TCHAU {OUT}!!! era pra ter saído faz tempo 😭👋`,
        `{OUT} fora! agora sim dá pra respirar 😮‍💨✨`,
        `O bem venceu hoje 😌✨ {OUT} saiu!`,
      ],
      elim_rage: [
        `NÃO ACREDITO que {OUT} saiu 😭💔`,
        `ROUBADO! {OUT} não merecia sair 😡`,
        `Depois dessa eu nunca mais assisto (mentira) 😤 {OUT} saiu!`,
        `Que ódio 😭 {OUT} merecia ficar muito mais!`,
      ],
      analyst: [
        `Não é só prova, é posicionamento.`,
        `O jogo tá se desenhando e tem gente que não percebe.`,
        `Reparem quem some quando a casa pega fogo.`,
        `Quem tá confortável agora pode pagar depois.`,
        `O meio da casa é o lugar mais perigoso.`,
        `Tem arco se formando e eu tô vendo tudo.`,
      ]

    };


    const fill = (tpl, vars) =>
      String(tpl)
        .replaceAll('{N}', vars.N ?? '')
        .replaceAll('{X}', vars.X ?? 'o')
        .replaceAll('{L}', vars.L ?? '')
        .replaceAll('{A}', vars.A ?? '')
        .replaceAll('{B}', vars.B ?? '')
        .replaceAll('{C}', vars.C ?? '')
        .replaceAll('{OUT}', vars.OUT ?? '')
        .replaceAll('{WIN}', vars.WIN ?? '')
        .replaceAll('{RUN}', vars.RUN ?? '')
        .replaceAll('{FAV}', vars.FAV ?? '')
        .replaceAll('{SHIP}', vars.SHIP ?? '');


    function tweet(text) {
      return { u: userHandle(), t: text };
    }

    const pinned = [];
    const others = [];
    const addTweet = (t, pin=false) => { (pin ? pinned : others).push(t); };

    const shipTag = (p1, p2) => {
      const a = String(displayName(p1) || '').trim().replace(/\s+/g,'');
      const b = String(displayName(p2) || '').trim().replace(/\s+/g,'');
      const a3 = a.slice(0,3) || 'AAA';
      const b3 = b.slice(0,3) || 'BBB';
      return `#${a3}${b3}`;
    };

    const mutualCrushPairs = () => {
      const alive = alivePlayers();
      const pairs = [];
      for (let i=0;i<alive.length;i++){
        for (let j=i+1;j<alive.length;j++){
          const A = alive[i], B = alive[j];
          const ab = classifyRelationScore(relGet(A.id,B.id));
          const ba = classifyRelationScore(relGet(B.id,A.id));
          if (ab === 'crush' && ba === 'crush') pairs.push([A,B]);
        }
      }
      return pairs;
    };

    const unilateralCrushPairs = () => {
      const alive = alivePlayers();
      const pairs = [];
      for (let i=0;i<alive.length;i++){
        for (let j=0;j<alive.length;j++){
          if (i===j) continue;
          const A = alive[i], B = alive[j];
          const ab = classifyRelationScore(relGet(A.id,B.id));
          const ba = classifyRelationScore(relGet(B.id,A.id));
          if (ab === 'crush' && ba !== 'crush') pairs.push([A,B]);
        }
      }
      return pairs;
    };

    // 1) Headline do dia
    
// Se uma eliminação acabou de acontecer, mostra reação mesmo que o jogo já tenha avançado o dia/semana.
// IMPORTANTE: só marca shown=true se realmente conseguiu postar.
if (state.lastEvent && state.lastEvent.type === "elimination" && !state.lastEvent.shown) {
  const le = state.lastEvent;

  // normaliza IDs (evita mismatch 12 vs "12")
  const elimId = String(le.eliminatedId ?? "");
  const out = state.players.find(x => String(x.id) === elimId);

  let posted = false;

  if (out) {
    addTweet(tweet(fill(pickOne(TEMPLATES.headline_elim), { OUT: fmtName(out) })), true);
    posted = true;

    // porcentagem do eliminado: tenta pegar por chave string
    const percMap = le.publicoPerc || {};
    const outKey = String(out.id);
    const outPercRaw = (percMap[outKey] != null) ? percMap[outKey] : percMap[out.id];
    const outPerc = (typeof outPercRaw === "number") ? outPercRaw : (outPercRaw != null ? Number(outPercRaw) : null);

    // heurísticas
    const hadStar = !!out?.status?.star || !!out?.status?.favPublic;
    const highRej =
      (out?.attrs?.rejeicao ?? out?.status?.alvo ?? 0) >= 7 ||
      (out?.status?.paredaoCount ?? 0) >= 2;

    // eliminação apertada: diferença < 3pp entre maior e segunda maior (do map inteiro do paredão)
    let close = false;
    try {
      const vals = Object.values(percMap)
        .map(Number)
        .filter(v => Number.isFinite(v))
        .sort((a, b) => b - a);

      if (vals.length >= 2 && (vals[0] - vals[1]) < 3) close = true;
    } catch (e) {}

    // rejeição alta / recorde: >= 70%
    const record = (typeof outPerc === "number") && outPerc >= 70;

    if (highRej) addTweet(tweet(pickOne(TEMPLATES.elim_foitarde)), true);
    if (hadStar) addTweet(tweet(pickOne(TEMPLATES.elim_robbed)), true);
    if (close) addTweet(tweet(pickOne(TEMPLATES.elim_close)), true);
    if (record) addTweet(tweet(pickOne(TEMPLATES.elim_record)), true);

    if (!highRej && !hadStar && !record) {
      addTweet(tweet(pickOne(TEMPLATES.elim_saudade)), true);
    }
  }

  // Só marca como mostrado se realmente postou algo.
  if (posted) state.lastEvent.shown = true;

}

if (state.week === 1 && state.dayIndex === 0) {
      addTweet(tweet(fill(pickOne(TEMPLATES.first_day), { X: 'o' })));
    } else if (ctx.key === 'ter' && ws.eliminadoId) {
      const out = state.players.find(x=>x.id===ws.eliminadoId);
      if (out) {
        // Headline de eliminação sempre fixo
        addTweet(tweet(fill(pickOne(TEMPLATES.headline_elim), { OUT: fmtName(out) })), true);

        // Reações fixas (pra não sumirem no corte): uma comemora e uma reclama
        addTweet(tweet(fill(pickOne(TEMPLATES.elim_celebrate), { OUT: fmtName(out) })), true);
        addTweet(tweet(fill(pickOne(TEMPLATES.elim_rage), { OUT: fmtName(out) })), true);

        // Reação extra opcional (varia o tom)
        if (Math.random() < 0.55) {
          addTweet(tweet(fill(pickOne(Math.random() < 0.5 ? TEMPLATES.elim_rage : TEMPLATES.elim_celebrate), { OUT: fmtName(out) })));
        }
      }
    } else if (ctx.key === 'dom' && (ws.paredaoIds || []).length === 3) {
      const ps = (ws.paredaoIds||[]).map(id => state.players.find(x=>x.id===id)).filter(Boolean);
      if (ps.length === 3) addTweet(tweet(fill(pickOne(TEMPLATES.headline_paredao), { A: fmtName(ps[0]), B: fmtName(ps[1]), C: fmtName(ps[2]) })), true);
    } else if (ctx.key === 'qui' && ws.leaderId) {
      const l = state.players.find(x=>x.id===ws.leaderId);
      if (l) addTweet(tweet(fill(pickOne(TEMPLATES.headline_lider), { L: fmtName(l) })), true);
    } else if (ctx.key === 'sex' && ws.anjoId) {
      const a = state.players.find(x=>x.id===ws.anjoId);
      if (a) addTweet(tweet(fill(pickOne(TEMPLATES.headline_anjo), { A: fmtName(a) })), true);
    } else {
      addTweet(tweet(pickOne(TEMPLATES.analyst)));
    }

    // 1.5) Se teve Big Fight hoje, injeta comentários de treta
    if (ws.bigFight && ws.bigFight.aggressorId && ws.bigFight.targetId) {
      const A = state.players.find(x => x.id === ws.bigFight.aggressorId);
      const B = state.players.find(x => x.id === ws.bigFight.targetId);
      if (A && B) {
        const aName = fmtName(A);
        const bName = fmtName(B);
        // hype ou ranço (mistura)
        addTweet(tweet(fill(pickOne(Math.random() < 0.65 ? TEMPLATES.fight_hype : TEMPLATES.fight_tired), { A: aName, B: bName })));
        // torcida (um dos lados)
        const team = Math.random() < 0.5 ? 'A' : 'B';
        if (team === 'A') {
          addTweet(tweet(fill(pickOne(TEMPLATES.fight_teamA), { A: aName, B: bName, X: suf(A) })));
        } else {
          addTweet(tweet(fill(pickOne(TEMPLATES.fight_teamB), { A: aName, B: bName, X: suf(B) })));
        }
      }
    }

    
    // 1.6) Se teve Big Fone e alguém atendeu, comentários específicos
    if (ws.bigFone?.triggered && ws.bigFone?.answeredById) {
      const bfP = state.players.find(x => x.id === ws.bigFone.answeredById);
      if (bfP) {
        addTweet(tweet(pickOne(TEMPLATES.bigfone)));
        addTweet(tweet(pickOne(TEMPLATES.bigfone_react)));
      }
    }

    
    // 1.65) Festa (Quarta): comentários sobre tema, show, dança e fofoca
    // Não rola na Semana 1. A partir da Semana 2, sempre que for dia marcado como festa.
    const isPartyDay = (!state.gameOver) && (state.week > 1) && !!ctx?.festa;
    if (isPartyDay) {
      // headline de festa sempre "fixo" pra não sumir
      addTweet(tweet(fill(pickOne(TEMPLATES.party_headline), { X: 'o' })), true);

      // mistura de opiniões (tema e show)
      addTweet(tweet(fill(pickOne(Math.random() < 0.6 ? TEMPLATES.party_theme_love : TEMPLATES.party_theme_hate), { X: 'o' })));
      if (Math.random() < 0.75) {
        addTweet(tweet(fill(pickOne(Math.random() < 0.6 ? TEMPLATES.party_show_love : TEMPLATES.party_show_hate), { X: 'o' })));
      }

      // destaque aleatório: dança (elogio ou cringe)
      const aliveP = alivePlayers();
      if (aliveP.length) {
        const dancer = aliveP[rndInt(0, aliveP.length - 1)];
        addTweet(tweet(fill(pickOne(Math.random() < 0.6 ? TEMPLATES.party_dance_love : TEMPLATES.party_dance_cringe), { N: fmtName(dancer) })));
      }

      // fofoca: dois nomes aleatórios
      if (Math.random() < 0.85) {
        const aliveP2 = alivePlayers();
        if (aliveP2.length >= 2) {
          const a = aliveP2[rndInt(0, aliveP2.length - 1)];
          let b = aliveP2[rndInt(0, aliveP2.length - 1)];
          if (b.id === a.id && aliveP2.length >= 2) b = aliveP2[(aliveP2.indexOf(a) + 1) % aliveP2.length];
          addTweet(tweet(fill(pickOne(TEMPLATES.party_gossip), { A: fmtName(a), B: fmtName(b) })));
        } else {
          addTweet(tweet(pickOne(TEMPLATES.party_gossip)));
        }
      }

      // romance na festa se tiver casal ativo (crush recíproco)
      const couplesNow = mutualCrushPairs();
      if (couplesNow.length && Math.random() < 0.55) {
        const [A,B] = couplesNow[rndInt(0, couplesNow.length - 1)];
        const tag = shipTag(A,B);
        addTweet(tweet(fill(pickOne(TEMPLATES.party_romance), { A: fmtName(A), B: fmtName(B), SHIP: tag })));
      }
    }

// 1.7) Shippagem: casal formado (crush recíproco) e crush unilateral
    // Só comenta casal novo quando ele aparece pela primeira vez
    const couples = mutualCrushPairs();
    const snap = state.narrative?.prevSnap || {};
    const coupleKey = couples.map(p=>[p[0].id,p[1].id].sort().join('-')).sort().join('|');
    const prevCoupleKey = snap.coupleKey || '';
    if (couples.length && coupleKey !== prevCoupleKey) {
      const [A,B] = couples[rndInt(0, couples.length-1)];
      const tag = shipTag(A,B);
      addTweet(tweet(fill(pickOne(TEMPLATES.couple), { A: fmtName(A), B: fmtName(B), SHIP: tag })));
      if (Math.random() < 0.35) {
        addTweet(tweet(fill(pickOne(TEMPLATES.couple_anti), { SHIP: tag })));
      }
      snap.coupleKey = coupleKey;
    } else {
      // crush unilateral: aparece de vez em quando pra não encher
      const unis = unilateralCrushPairs();
      if (unis.length && Math.random() < 0.22) {
        const [A,B] = unis[rndInt(0, unis.length-1)];
        addTweet(tweet(fill(pickOne(TEMPLATES.crush_unrec), { A: fmtName(A), B: fmtName(B), X: suf(A) })));
      }
    }
    state.narrative = state.narrative || { daily: {}, prevSnap: {} };
    state.narrative.prevSnap = snap;
    // 1.8) Reta final / Top 3 / Final
    const aliveNow = alivePlayers();
    const aliveNowN = aliveNow.length;

    if (state.gameOver) {
      // Final: usa os IDs calculados no resultado final (não depende da ordem do array de vivos)
      const winnerId = state.final?.winnerId ?? null;
      const runnerId = state.final?.secondId ?? null;
      const winner = winnerId ? (state.players.find(x => x.id === winnerId) || null) : null;
      const runner = runnerId ? (state.players.find(x => x.id === runnerId) || null) : null;

      if (winner) {
        addTweet(tweet(fill(pickOne(TEMPLATES.final_win), { WIN: fmtName(winner) })), true);
      }
      if (winner && runner && Math.random() < 0.6) {
        addTweet(tweet(fill(pickOne(TEMPLATES.final_robbed), { WIN: fmtName(winner), RUN: fmtName(runner) })));
      }
      // despedida sempre aparece
      addTweet(tweet(pickOne(TEMPLATES.final_farewell)), true);
    } else {
      if (aliveNowN <= 5) {
        addTweet(tweet(pickOne(TEMPLATES.endgame_hype)), true);
      }
      if (aliveNowN === 3) {
        const fav = aliveNow[rndInt(0, aliveNow.length - 1)];
        if (fav) addTweet(tweet(fill(pickOne(TEMPLATES.top3_favorites), { FAV: fmtName(fav) })));
      }
    }



    // (Extra) Quando alguém ganha ★ (favorito do público), o Xuitter reage com fandom + contra-narrativa
    state.narrative = state.narrative || {};
    state.narrative.seenFavIds = Array.isArray(state.narrative.seenFavIds) ? state.narrative.seenFavIds : [];
    const curFavs = aliveNow.filter((p) => isPublicFavorite(p));
    const newFavs = curFavs.filter((p) => !state.narrative.seenFavIds.includes(p.id));
    if (newFavs.length) {
      const p = newFavs[rndInt(0, newFavs.length - 1)];
      addTweet(tweet(fill(pickOne(TEMPLATES.fandom_created), { N: fmtName(p) })));
      if (Math.random() < 0.40) {
        addTweet(tweet(fill(pickOne(TEMPLATES.hater_fandom), { N: fmtName(p) })));
      }
      // marca como visto (evita repetir todo dia)
      newFavs.forEach((x) => { if (!state.narrative.seenFavIds.includes(x.id)) state.narrative.seenFavIds.push(x.id); });
    }

    // 2) Top pop vs top rejeição
    const topPop = topPopRow?.p || null;
    const topRej = topRejRow?.p || null;

    if (topRej && Number(topRej.attrs?.rejeicao ?? 0) >= 6.0) {
      addTweet(tweet(fill(pickOne(TEMPLATES.rej_leader), { N: fmtName(topRej) })));
    } else if (topPop) {
      addTweet(tweet(fill(pickOne(TEMPLATES.pop_leader), { N: fmtName(topPop) })));
      // contra-narrativa: sempre tem alguém que não compra o hype
      if (Math.random() < 0.42) {
        addTweet(tweet(fill(pickOne(TEMPLATES.hater_popularity), { N: fmtName(topPop) })));
      }
      // se {N} tiver ★, rola ranço do fandom também
      if (isPublicFavorite(topPop) && Math.random() < 0.35) {
        addTweet(tweet(fill(pickOne(TEMPLATES.hater_fandom), { N: fmtName(topPop) })));
      }
    }

    // 3) Em alta / Em baixa (momentum)
    if (up?.p && up.d.pop > 0.25 && up.p.id !== topPop?.id) {
      addTweet(tweet(fill(pickOne(TEMPLATES.up), { N: fmtName(up.p), X: suf(up.p) })));
    }
    if (down?.p && down.d.pop < -0.25 && down.p.id !== topRej?.id) {
      addTweet(tweet(fill(pickOne(TEMPLATES.down), { N: fmtName(down.p), X: suf(down.p) })));
    }

    // 4) Fora do radar
    if (invis?.p && (invis.p.status?.narr?.invisDays ?? 0) >= 3) {
      addTweet(tweet(fill(pickOne(TEMPLATES.invis), { N: fmtName(invis.p), X: suf(invis.p) })));
    }

    // 4.5) Tweets narrativos (variedade de tons + detalhe de timeline)
    try {
      const texts = generateNarrativeTweets({ max: 2, ctx, ws });
      for (const t of texts) addTweet(tweet(t));
    } catch (e) { /* ignora */ }

    // 5) Ajusta quantidade (3 a 6) sem repetição demais
    let maxT = rndInt(3, 6);
// Em dias grandes, deixa o feed mais cheio (sem cortar os pins)
if (state.gameOver) {
  maxT = rndInt(6, 10);
} else if (ctx.key === 'ter' && ws.eliminadoId) {
  maxT = rndInt(6, 10);
} else {
  const aliveCount = alivePlayers().length;
  if (aliveCount <= 3) maxT = rndInt(5, 9);
  else if (aliveCount <= 5) maxT = rndInt(4, 8);
}
if (typeof isPartyDay !== 'undefined' && isPartyDay) {
  maxT = Math.max(maxT, rndInt(5, 9));
}

    let tweets = pinned.concat(others);

    // Limite: mantém todos os pins e corta só o restante
    if (tweets.length > maxT) {
      const keepPins = pinned.length;
      const remain = maxT - keepPins;
      const trimmed = remain > 0 ? others.slice(0, remain) : [];
      tweets = pinned.concat(trimmed);
    }

// Fallback: nunca deixar o Xuitter vazio
    if (!tweets || !tweets.length) {
      try { tweets = [tweet(pickOne(TEMPLATES.analyst))]; } catch(e) { tweets = [{u:"User", t:"Sem comentários hoje."}]; }
    }

const html = tweets.map((x) => `
      <div class="tweet">
        <div class="twUser">${escapeHtml(x.u)}</div>
        <div class="twText">${x.t}</div>
      </div>
    `).join('');

    state.narrative = state.narrative || { daily: {}, prevSnap: {} };
    state.narrative.daily[key] = { html, ts: Date.now(), v: XUITTER_NARRATIVE_VERSION };
  }


  function updatePlantStateEndOfWeek(p) {
    ensurePlantStatus(p);

    const prev = !!p.status.planta;
    const { pBecome, pLeave } = plantTurnChances(p);

    let changed = false;

    if (!p.status.planta) {
      if (Math.random() < pBecome) {
        p.status.planta = true;
        p.status.plantStreak = 1;
        changed = true;
      }
    } else {
      if (Math.random() < pLeave) {
        p.status.planta = false;
        p.status.plantStreak = 0;
        changed = true;
      } else {
        p.status.plantStreak = (p.status.plantStreak ?? 0) + 1;
      }
    }

    // reseta flags semanais
    p.status.didSomethingThisWeek = false;
    p.status.madeDecisionThisWeek = false;

    // narrativa: registrar mudança de status de planta
    try {
      const R = Number(state.week ?? 1);
      initNarrativeForPlayer(p, R);
      p.narrative.plantHistory = Array.isArray(p.narrative.plantHistory) ? p.narrative.plantHistory : [];
      p.narrative.plantHistory.push({ round: R, on: !!p.status.planta });
      if (p.narrative.plantHistory.length > 120) p.narrative.plantHistory = p.narrative.plantHistory.slice(-120);

      if (changed && !prev && p.status.planta) {
        pushTimelineEvent(p, { round: R, type: 'plant_on', text: `${simpleName(p)} virou planta e passou despercebid${g(p,{M:'o',F:'a',O:'e'})}.`, refs: {}, weight: 2 });
        tagTheme(p, 'planta', 2, R, p.narrative.timeline.length - 1);
      }
      if (changed && prev && !p.status.planta) {
        pushTimelineEvent(p, { round: R, type: 'plant_off', text: `${simpleName(p)} deixou de ser planta e voltou pro jogo.`, refs: {}, weight: 2 });
        tagTheme(p, 'phoenix', 1, R, p.narrative.timeline.length - 1);
      }
    } catch { /* ignora */ }

    return { changed, prev, now: !!p.status.planta };
  }

  function finalVoteWeight(p) {
    ensurePlantStatus(p);
    let w = 1;
   const ps = Number(p.status?.plantStreak ?? 0);

  if (p.status?.planta) {
    // penalidade base mais forte
    w *= 0.75;

    // penaliza mais quanto mais semanas planta (capado)
    const streakPenalty = Math.min(0.30, ps * 0.05); // até -30%
    w *= (1 - streakPenalty);
  }

  return w;
  }

  function endOfWeekPlantSystem(meta) {
    const alive = alivePlayers();
    if (!alive.length) return;

    const changes = [];

    // 1) contadores
    alive.forEach(updateWeekCounters);

    // 2) taxa de pop do público (planta)
    alive.forEach(applyPlantPopTax);

    // 3) transição de estado
    alive.forEach((p) => {
      const r = updatePlantStateEndOfWeek(p);
      if (r?.changed) changes.push({ p, prev: r.prev, now: r.now });
    });

    if (changes.length) {
      const lines = changes
        .map(({ p, prev, now }) => {
          const nm = escapeHtml(displayName(p));
          return now && !prev
            ? `🪴 <strong>${nm}</strong> aparenta ser planta.`
            : (!now && prev ? `🪴 <strong>${nm}</strong> deixa de ser planta.` : null);
        })
        .filter(Boolean);

      if (lines.length) {
        gameAdd(`
          <div class="gameCard gameNeu" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <div style="font-size:12px; font-weight:900; letter-spacing:.2px;">Métrica semanal</div>
            <div style="font-size:12px; opacity:.92; line-height:1.35;">${lines.join('<br>')}</div>
          </div>
        `);
      }
    }
  }


  /* ===== UI ===== */
  const $ = (id) => document.getElementById(id);

  let activeDrawerPlayerId = null;

  function closeDrawer() {
    activeDrawerPlayerId = null;
    const d = $("playerDrawer");
    const b = $("drawerBackdrop");
    if (d) { d.style.display = "none"; d.setAttribute("aria-hidden", "true"); }
    if (b) b.style.display = "none";
  }

  function openDrawer(p) {
    if (!p) return;
    activeDrawerPlayerId = p.id;

    const title = $("drawerTitle");
    const sub = $("drawerSub");
    const body = $("drawerBody");
    const d = $("playerDrawer");
    const b = $("drawerBackdrop");

    if (title) title.textContent = displayName(p);
    if (sub) sub.textContent = p.status.alive ? "Na casa" : statusLabel(p);

    if (body) {
      const tags = tagsForPlayer(p);
      const tagsHtml = (tags.length ? tags : [{ t: p.status.alive ? "Na casa" : statusLabel(p), cls: p.status.alive ? "" : "elim" }])
        .map((x) => `<span class="tag ${x.cls || ""}">${escapeHtml(x.t)}</span>`)
        .join(" ");

      const attrs = p.attrs || {};
      const status = p.status || {};

      // Popularidade: SEMANA 1 -> ÚLTIMA (mas para na semana em que saiu)
      const lastWeek = getGlobalLastPopWeek();
      const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);
      const series = popSeriesForPlayer(p, lastWeek);

      const bars = weeks.map((w, i) => {
        const v = series[i];
        const vv = (v == null) ? null : clamp(Number(v), 0, 10);
        const aliveCell = (p?.status?.outWeek && w > Number(p.status.outWeek)) ? false : true;
        return `
          <div class="miniBarRow" style="opacity:${aliveCell ? 1 : 0.55};">
            <span class="lbl">S${w}</span>
            <span class="miniBar"><i style="width:${vv == null ? 0 : (vv/10)*100}%"></i></span>
            <span class="val">${vv == null ? '—' : fmt2(vv)}</span>
          </div>
        `;
      }).join("");

      const playerChart = renderPopLineChartSvg({
        weeks,
        seriesList: [{ label: displayName(p), series }],
        width: 760,
        height: 210,
        showLegend: false
      });

      // Histórico (eventos em que apareceu)
      const appears = state.log
        .filter((e) => (e?.msg || "").toLowerCase().includes(String(p.name || "").toLowerCase()))
        .slice(-18)
        .reverse();
      const histHtml = appears.length
        ? appears.map((e) => {
            const t = e.week && e.dayName ? `Semana ${e.week} • ${e.dayName}` : (e.who || "—");
            return `<div class="histItem"><strong>${escapeHtml(t)}</strong><br>${e.msg}</div>`;
          }).join("")
        : `<div class="small">—</div>`;

      // Relações principais
      const others = state.players.filter((o) => o.id !== p.id);
      const rels = others
        .map((o) => ({ o, s: relGet(p.id, o.id) }))
        .sort((a, b) => b.s - a.s);

      const topAllies = rels.filter((x) => x.s >= 1.2).slice(0, 4).map((x) => displayName(x.o)).join(", ") || "—";
      const topRivals = rels.filter((x) => x.s <= -1.2).slice(0, 4).map((x) => displayName(x.o)).join(", ") || "—";

      body.innerHTML = `
        <div class="drawerCard" style="margin-bottom:10px;">
          <div class="t">Tags</div>
          <div class="c">${tagsHtml}</div>
        </div>

        <div class="drawerGrid">
          <div class="drawerCard">
            <div class="t">Status</div>
            <div class="c">
              <div><span class="small">Pop</span> <strong>${fmt2(status.pop ?? 0)}</strong></div>
              <div><span class="small">Alvo</span> <strong>${fmt2(status.alvo ?? 0)}</strong></div>
              <div><span class="small">Strikes</span> <strong>${status.strikes ?? 0}</strong></div>
            </div>
          </div>
          <div class="drawerCard">
            <div class="t">Atributos</div>
            <div class="c">
              <div><span class="small">Provas</span> <strong>${attrs.provas ?? 0}</strong></div>
              <div><span class="small">Estratégia</span> <strong>${attrs.estrategia ?? 0}</strong></div>
              <div><span class="small">Social</span> <strong>${attrs.social ?? 0}</strong></div>
              <div><span class="small">Rejeição</span> <strong>${attrs.rejeicao ?? 0}</strong></div>
            </div>
          </div>
          <div class="drawerCard">
            <div class="t">Relações principais</div>
            <div class="c">
              <div><span class="small">Aliados</span><br>${escapeHtml(topAllies)}</div>
              <div style="margin-top:8px;"><span class="small">Rivais</span><br>${escapeHtml(topRivals)}</div>
            </div>
          </div>
          <div class="drawerCard">
            <div class="t">Evolução de popularidade</div>
            <div class="c">
              <div class="chartWrap" style="padding:0; margin:2px 0 10px 0;">${playerChart}</div>
              <div class="miniBars">${bars}</div>
            </div>
          </div>
        </div>

        ${(() => {
  try {
    // Garante que os dados narrativos e de arquétipos da semana estejam prontos
    initNarrativeForPlayer(p, state.week);
    const arc = buildPlayerArc(p.id, state.week);

    // Snapshot de arquétipos BBB (última semana válida do jogador)
    const map = p?.status?.archetypeWeek || {};
    const keys = Object.keys(map).map(Number).filter(n => Number.isFinite(n) && n > 0);
    const outW = Number(p?.status?.outWeek ?? NaN);
    const lim = Number.isFinite(outW) ? Math.min(outW, Number(state.week || 1)) : Number(state.week || 1);
    const wk = keys.filter(n => n <= lim).sort((a, b) => b - a)[0];
    const snap = (wk != null) ? map[String(wk)] : null;

    const hasArc = !!arc;
    const hasSnap = !!(snap && Array.isArray(snap.top3) && snap.top3.length);

    if (!hasArc && !hasSnap) return '';

    const tierLabel = (score) => {
      const s = Number(score ?? 0);
      if (s >= 90) return 'dominante absoluto';
      if (s >= 70) return 'traço forte';
      if (s >= 50) return 'traço presente';
      return 'traço residual';
    };

    // --- Arco (macro) ---
    const titleLine = hasArc ? `${arc.emoji || '🎬'} ${arc.title || 'Arco narrativo'}` : '🎬 Arco narrativo';
    const subtitleLine = hasArc && arc.subtitle ? arc.subtitle : '';
    const logline = hasArc && arc.logline ? arc.logline : '';

    // Beats por fase (dedup por texto para evitar repetição tipo "sofreu o Monstro" em tudo)
    const beats = hasArc ? (arc.arcBeats || []) : [];
    const seenBeat = new Set();
    const beatsHtml = beats
      .map(b => {
        const phase = String(b?.phase || '').trim();
        const text = String(b?.text || '').trim();
        if (!phase || !text) return '';
        const key = text.toLowerCase();
        if (seenBeat.has(key)) return '';
        seenBeat.add(key);
        return `<div class="small" style="margin-top:8px;"><strong>${escapeHtml(phase)}:</strong> ${escapeHtml(text)}</div>`;
      })
      .filter(Boolean)
      .join('');

    // Momentos marcantes (com contexto básico)
    const playersById = Object.fromEntries(state.players.map(pp => [String(pp.id), pp]));
    const relLabel = (otherId) => {
      const r = p?.narrative?.relations?.[otherId];
      if (!r) return null;
      const bond = Number(r.bond ?? 0);
      const rivalry = Number(r.rivalry ?? 0);
      const tags = Array.isArray(r.tags) ? r.tags : [];
      if (tags.includes('crush') || tags.includes('peguete')) return 'Peguete';
      if (rivalry >= 65) return 'Rival';
      if (bond >= 65 && rivalry <= 35) return 'Aliado';
      return null;
    };
    const weekLabel = (round) => `Semana ${round}`;
    const fmtMoment = (e) => {
      const base = String(e?.text || '').trim();
      const round = Number(e?.round || state.week || 1);

      const isRisk = (e?.type === 'danger' || e?.type === 'eviction_survived' || e?.type === 'close_call');
      const paredaoIds = Array.isArray(e?.refs?.paredaoIds) ? e.refs.paredaoIds.map(String) : null;

      let extra = '';

      if (isRisk && paredaoIds && paredaoIds.length >= 3) {
        const selfId = String(arc?.playerId ?? p?.id ?? '');
        const others = paredaoIds.filter(id => id && id !== selfId)
          .map(id => playersById[String(id)])
          .filter(Boolean);
        if (others.length) {
          const parts = others.slice(0, 2).map((q) => {
            const nm = simpleName(q);
            const lab = relLabel(q.id);
            return lab ? `${nm} (${lab})` : nm;
          });
          extra = ` (com ${parts.join(' e ')})`;
        }
      } else {
        const tid = e?.refs?.targetId != null ? String(e.refs.targetId) : null;
        const target = tid ? playersById[tid] : null;
        if (target) {
          const nm = simpleName(target);
          const lab = relLabel(target.id);
          const has = base.toLowerCase().includes(nm.toLowerCase());
          if (!has) extra = lab ? ` (${lab}: ${nm})` : ` (${nm})`;
        }
      }

      return `${weekLabel(round)}: ${base.replace(/\.$/, '')}${extra}.`;
    };

    const moments = hasArc ? (arc.definingMoments || []).slice(0, 6) : [];
    const momentsHtml = moments.length
      ? `<div style="margin-top:12px;">
          <div class="small" style="font-weight:900;">Momentos que sustentam essa leitura</div>
          <ul class="small" style="margin:6px 0 0 18px;">
            ${moments.map(e => `<li>${escapeHtml(fmtMoment(e))}</li>`).join('')}
          </ul>
        </div>`
      : '';

    // --- Leitura editorial (micro) ---
    let editorialHtml = '';
    if (hasSnap) {
      const dom = snap.top3[0] || {};
      const domTitle = `${dom.emoji || '🎭'} ${dom.label || dom.id || 'Arquétipo'}`;

      const traits = snap.top3.slice(1, 3).map((x) => `${x.emoji || '🎭'} ${x.label || x.id}`).join(' · ');
      const traitsLine = traits ? `Arquétipos secundários: ${traits}` : '';

      const comboTitle = snap.comboTitle ? `${snap.comboEmoji || '🎭'} ${snap.comboTitle}` : '';
      const comboSub = snap.comboSubtitle || '';
      const duplaLine = snap.duplaWithId ? `${snap.duplaEmoji || '💞'} Dupla com ${snap.duplaWithName || '—'}` : '';
      const arcTitle = snap.arcTitle ? `${snap.arcEmoji || '🎢'} ${snap.arcTitle}` : '';
      const arcSub = snap.arcSubtitle || '';

      const top3Rows = snap.top3.map((x) => {
        const s = Number(x.score ?? 0);
        const tier = tierLabel(s);
        return `<div class="small" style="margin-top:8px; display:flex; justify-content:space-between; gap:10px;">
          <div style="font-weight:900;">${escapeHtml(`${x.emoji || '🎭'} ${x.label || x.id}`)}</div>
          <div style="opacity:.85;">${escapeHtml(`${tier} · ${s}`)}</div>
        </div>`;
      }).join('');

      editorialHtml = `
        <div style="margin-top:12px;">
          <div class="small" style="font-weight:900;">Leitura editorial (semana ${wk})</div>
          <div style="margin-top:6px; font-weight:900;">${escapeHtml(domTitle)}</div>
          ${traitsLine ? `<div class="small" style="margin-top:4px; opacity:.9;">${escapeHtml(traitsLine)}</div>` : ''}
          ${comboTitle ? `<div class="small" style="margin-top:8px; font-weight:900;">Personagem</div>
            <div class="small" style="margin-top:2px; opacity:.95;">${escapeHtml(comboTitle)}</div>
            ${comboSub ? `<div class="small" style="margin-top:2px; opacity:.85;">${escapeHtml(comboSub)}</div>` : ''}` : ''}
          ${duplaLine ? `<div class="small" style="margin-top:6px; opacity:.92;">${escapeHtml(duplaLine)}</div>` : ''}
          ${arcTitle ? `<div class="small" style="margin-top:8px; font-weight:900;">Arco BBB (leitura)</div>
            <div class="small" style="margin-top:2px; opacity:.95;">${escapeHtml(arcTitle)}</div>
            ${arcSub ? `<div class="small" style="margin-top:2px; opacity:.85;">${escapeHtml(arcSub)}</div>` : ''}` : ''}
          <div class="small" style="margin-top:10px; opacity:.9;">Top 3</div>
          ${top3Rows}
          <div class="small" style="margin-top:10px; opacity:.75;">Obs: isso é uma leitura automática do comportamento no simulador e pode mudar a cada semana.</div>
        </div>
      `;
    }

    // Blending: arco manda, editorial explica

const st = p?.status?.seasonTitle || null;
const seasonTitleHtml = st ? `
  <div style="margin-bottom:10px; padding:10px 12px; border:1px solid rgba(255,255,255,.18); border-radius:12px; background:rgba(255,255,255,.06);">
    <div style="font-size:12px; font-weight:900; letter-spacing:.2px; opacity:.9;">TÍTULO DA TEMPORADA</div>
    <div style="margin-top:4px; font-size:15px; font-weight:900;">
      ${escapeHtml(st.emoji || "🏷️")} ${escapeHtml(st.title || "")}
    </div>
    ${st.reason ? `<div class="small" style="margin-top:4px; opacity:.92;">${escapeHtml(st.reason)}</div>` : ''}
    ${(st.dominant || (st.blend||[]).length) ? `
      <div class="small" style="margin-top:8px; opacity:.9;">
        ${escapeHtml(st.dominant || "")}${(st.blend||[]).length ? ` · ${escapeHtml((st.blend||[]).slice(0,3).join(" · "))}` : ''}
      </div>
    ` : ''}
  </div>
` : '';

const acc = Array.isArray(p?.status?.seasonAccolades) ? p.status.seasonAccolades : [];
const seasonAccHtml = acc.length ? `
  <div style="margin-bottom:10px; padding:10px 12px; border:1px solid rgba(255,255,255,.14); border-radius:12px; background:rgba(255,255,255,.04);">
    <div style="font-size:12px; font-weight:900; letter-spacing:.2px; opacity:.85;">DESTAQUES DA TEMPORADA</div>
    <div style="margin-top:6px; display:flex; flex-direction:column; gap:6px;">
      ${acc.slice(0,3).map(a => `
        <div>
          <div style="font-weight:900;">${escapeHtml(a.emoji || "🏷️")} ${escapeHtml(a.title || "")}</div>
          ${a.reason ? `<div class="small" style="opacity:.9;">${escapeHtml(a.reason)}</div>` : ``}
        </div>
      `).join("")}
    </div>
  </div>
` : '';
    const arcBody = hasArc ? `
      <div style="font-weight:900;">${escapeHtml(titleLine)}</div>
      ${subtitleLine ? `<div class="small" style="margin-top:2px; font-weight:800; opacity:.9;">${escapeHtml(subtitleLine)}</div>` : ''}
      ${logline ? `<div class="small" style="margin-top:6px; opacity:.92;">${escapeHtml(logline)}</div>` : ''}
      ${beatsHtml ? `<div style="margin-top:10px;">${beatsHtml}</div>` : ''}
    ` : `<div style="font-weight:900;">${escapeHtml(titleLine)}</div>`;

    return `
      <div class="drawerCard" style="margin-top:10px;">
        <div class="t">Narrativa BBB</div>
        <div class="c">
          ${seasonTitleHtml}
          ${seasonAccHtml}
          ${arcBody}
          ${editorialHtml}
          ${momentsHtml}
        </div>
      </div>
    `;
  } catch (e) {
    try { console.error('[Narrativa BBB] erro ao gerar narrativa estruturada', e); } catch {}
    const msg = (e && (e.message || e.toString)) ? (e.message || String(e)) : 'erro desconhecido';
    return `
      <div class="drawerCard" style="margin-top:10px;">
        <div class="t">Narrativa BBB</div>
        <div class="c">
          <div class="small" style="opacity:.9;">Falha ao gerar a narrativa estruturada. Abra o console para ver detalhes.</div>
          <div class="small" style="margin-top:6px; opacity:.7;">${escapeHtml(msg)}</div>
        </div>
      </div>
    `;
  }
})()}        <div class="drawerCard" style="margin-top:10px;">
          <div class="t">Histórico (eventos em que apareceu)</div>
          <div class="c">${histHtml}</div>
        </div>
      `;
    }

    if (d) { d.style.display = "block"; d.setAttribute("aria-hidden", "false"); }
    if (b) b.style.display = "block";
  }

  // Tabs
  document.querySelectorAll(".tabBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".menuPanel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const id = btn.getAttribute("data-tab");
      const panel = document.getElementById(id);
      if (panel) panel.classList.add("active");
          // Atualiza painéis sem apagar o feed do dia
      const dayBlock = $("todayBlock");
      const prevFeed = dayBlock ? dayBlock.innerHTML : null;
      render();
      if (dayBlock && prevFeed != null) dayBlock.innerHTML = prevFeed;
    });
  });

  // Casa: busca/ordenação
  $("playerSearch")?.addEventListener("input", () => render());
  $('playerSort')?.addEventListener('change', () => {
    const sel = document.getElementById('playerSort');
    const { key, dir } = parseCasaSortValue(sel?.value || 'name_asc');
    setCasaSort(key, dir);
    syncCasaHeaderSortUI();
    render();
  });

  // Histórico: filtros
  $("histSearch")?.addEventListener("input", () => render());
  $("histWho")?.addEventListener("change", () => render());

  // Drawer
  $("drawerClose")?.addEventListener("click", closeDrawer);
  $("drawerBackdrop")?.addEventListener("click", closeDrawer);

  function openIO(text = "") {
    const box = $("io");
    const ta = $("ioText");
    if (!box || !ta) return;
    box.style.display = "block";
    ta.value = text;
  }
  function closeIO() {
    const box = $("io");
    const ta = $("ioText");
    if (!box || !ta) return;
    box.style.display = "none";
    ta.value = "";
  }

  // Drawer
  $("drawerClose")?.addEventListener("click", closeDrawer);
  $("drawerBackdrop")?.addEventListener("click", closeDrawer);

  // Filtros da Casa
  $("playerSearch")?.addEventListener("input", () => render());
  $('playerSort')?.addEventListener('change', () => {
    const sel = document.getElementById('playerSort');
    const { key, dir } = parseCasaSortValue(sel?.value || 'name_asc');
    setCasaSort(key, dir);
    syncCasaHeaderSortUI();
    render();
  });

  // Filtros do Histórico
  $("histSearch")?.addEventListener("input", () => render());
  $("histWho")?.addEventListener("change", () => render());

  function hardResetWithSample() {
    state = defaultState();
    popTabSelectedIds = null;
    popTabSearchTerm = "";
    const size = parseInt($("castSize")?.value || "12", 8) || 32;
    state.players = generateBalancedCast(size);

    // Backfill gayScore (atributo oculto)
    for (const p of (state.players || [])) {
      if (!p) continue;
      ensurePlayerAge(p);
      initNarrativeForPlayer(p, 1);
      if (!p.secret) p.secret = {};
      if ((p.gender === 'M' || p.gender === 'F') && !Number.isFinite(p.secret.gayScore)) {
        p.secret.gayScore = sampleGayScore();
      }
    }
    pushLog("Sistema", `Temporada resetada com elenco aleatório (${size}).`);
    resetWeekState();
    pendingAdvance = null;
    bootStart();
    save();
    closeDrawer();
    render();
  }

  $("btnNextTop")?.addEventListener("click", () => simulateDay());

  function resetSeasonKeepingCast({ keepSetupDone = true } = {}) {
    // mantém elenco + configurações atuais, mas zera progresso da temporada
    const cast = (state.players || []).map((p) => {
      // preserva identidade e attrs/secret, reseta status
      const np = JSON.parse(JSON.stringify(p));
      np.status = {
        alive: true,
        pop: 5.0,
        alvo: 0.0,
        strikes: 0,
        leaderCount: 0,
        anjoCount: 0,
        paredaoCount: 0,
        popWeek: {},
        favPublic: false,
        room: null,
        weeksSinceWin: 0,
        weeksSinceParedao: 0,
        weeksSinceEvent: 0,
        popPrev: 5.0,
        popStableStreak: 0,
        decisionStreak: 0,
        didSomethingThisWeek: false,
        madeDecisionThisWeek: false,
        wonSomethingThisWeek: false,
        planta: false,
        plantStreak: 0,
        excluido: false,
        excluidoStreak: 0
      };
      // reinicia narrativa para uma temporada nova
      np.narrative = emptyNarrative(1);
      // limpeza de marcações de eliminação antigas
      if (np.status) delete np.status.outWeek;
      return np;
    });

    // recria state base e reanexa elenco
    const fresh = defaultState();
    fresh.players = cast;
    fresh.setupDone = keepSetupDone ? true : false;

    // preserva dados de quartos (opcional)
    fresh.rooms = { pair: null, colors: { A: null, B: null }, assigned: false };

    state = fresh;
    popTabSelectedIds = null;
    popTabSearchTerm = "";
    pendingAdvance = null;
    // limpa buffers de intro
    state.introPingShown = {};
    resetWeekState();
    save();
  }

  function enterSetupMode() {
    document.body.classList.add("setupMode");

    // força Config como painel visível
    document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".menuPanel").forEach((p) => p.classList.remove("active"));
    const cfgBtn = document.querySelector('.tabBtn[data-tab="tabConfig"]');
    const cfgPanel = document.getElementById("tabConfig");
    if (cfgBtn) cfgBtn.classList.add("active");
    if (cfgPanel) cfgPanel.classList.add("active");

    render();
  }

  function exitSetupMode() {
    document.body.classList.remove("setupMode");
    render();
  }

  function startSeasonFromSetup() {
    const aliveN = (state.players || []).length;
    if (aliveN < 3) {
      alert("Adicione pelo menos 3 participantes para iniciar a temporada.");
      return;
    }
    resetSeasonKeepingCast({ keepSetupDone: true });
    bootStart();
    save();
    exitSetupMode();
    render();
  }

  function restartSeasonSameCast() {
    if (!state.setupDone) {
      // se ainda não começou, só inicia
      startSeasonFromSetup();
      return;
    }
    resetSeasonKeepingCast({ keepSetupDone: true });
    bootStart();
    save();
    render();
  }

  function goToNewSeasonSetup() {
    // volta para a tela inicial (mantém elenco/config atuais para edição)
    resetSeasonKeepingCast({ keepSetupDone: false });
    state.setupDone = false;
    save();
    enterSetupMode();
  }

  $("btnRestartTop")?.addEventListener("click", restartSeasonSameCast);
  $("btnRestartConfig")?.addEventListener("click", restartSeasonSameCast);

  $("btnNewSeasonTop")?.addEventListener("click", goToNewSeasonSetup);
  $("btnNewSeasonConfig")?.addEventListener("click", goToNewSeasonSetup);

  $("btnStartSeason")?.addEventListener("click", startSeasonFromSetup);

$("btnClearLogTop")?.addEventListener("click", () => {
    state.log = [];
    save();
    render();
  });

  $("logAll")?.addEventListener("click", () => {
    logFilter = "all";
    render();
  });
  $("logGame")?.addEventListener("click", () => {
    logFilter = "game";
    render();
  });
  $("logDay")?.addEventListener("click", () => {
    logFilter = "day";
    render();
  });

  $("btnClearLog")?.addEventListener("click", () => {
    state.log = [];
    save();
    render();
  });

  $("btnExport")?.addEventListener("click", () => openIO(JSON.stringify(state, null, 2)));
  $("btnImport")?.addEventListener("click", () => openIO(""));
  $("btnCloseIO")?.addEventListener("click", closeIO);

  $("btnDoImport")?.addEventListener("click", () => {
  const txt = $("ioText")?.value?.trim() || "";
  if (!txt) return;

  try {
    const obj = JSON.parse(txt);
    const parsed = validateImportedState(obj);
    if (!parsed) throw new Error("JSON inválido.");

    state = parsed;
    pendingAdvance = null;

    save();
    render();

  } catch (e) {
    alert(e.message || "Erro ao importar.");
  }
});
$("btnLoadPreset")?.addEventListener("click", async () => {
  const sel = $("presetSelect");
  const path = sel?.value || "";
  if (!path) return;

  try {
    const obj = await loadPresetJson(path);
    const parsed = validateImportedState(obj);
    if (!parsed) throw new Error("Elenco inválido.");

    state = parsed;
    pendingAdvance = null;

    save();
    render();
  } catch (e) {
    alert(e.message || "Erro ao carregar elenco.");
  }
});


  $("btnAdd")?.addEventListener("click", () => {
    if (state.gameOver) return;
    const g = ($("addGender")?.value || "O");
    const nm = randomPersonName(g);
    state.players.push(makePlayer(nm.firstName, nm.lastName, g));
    save();
    render();
  });

  $("btnAddRandom")?.addEventListener("click", () => {
    if (state.gameOver) return;
    const g = ($("addGender")?.value || "O");
    const nm = randomPersonName(g);
    state.players.push(makePlayer(nm.firstName, nm.lastName, g));
    save();
    render();
  });

  $("btnAddRandom5")?.addEventListener("click", () => {
    if (state.gameOver) return;
    for (let i = 0; i < 5; i++) {
      const g = ($("addGender")?.value || "O");
      const nm = randomPersonName(g);
      state.players.push(makePlayer(nm.firstName, nm.lastName, g));
    }
    save();
    render();
  });

  $("btnSeed")?.addEventListener("click", () => {
  if (state.gameOver) return;

  // Exemplo rápido: 12 participantes (6 homens, 6 mulheres) + chance pequena de 1 "Outro"
  state.players = [];
  state.elimOrder = [];
  state.log = [];
  state.elimHistory = [];
  state.relations = {};
  state.crushRevealed = {};
  state.crushReciprocalBonus = {};
  state.week = 1;
  state.dayIndex = 0;
  state.gameOver = false;
  state.publicFavoriteIds = [];
  state.players.forEach((p)=>{ if(p.status){ p.status.favPublic=false; p.status.favPermanent=false; } });
  pendingAdvance = null;
  resetWeekState();

  const baseSize = 12;
  const cast = generateBalancedCast(baseSize, { allowOther: true, otherChance: 0.20 });
  cast.forEach((x) => state.players.push(makePlayer(x.firstName, x.lastName, x.gender)));

  pushLog("Sistema", `Elenco exemplo (${baseSize}) criado.`);
  state.setupDone = false;
  save();
  enterSetupMode();
  render();
});

$("btnGenCast")?.addEventListener("click", () => {
    if (state.gameOver) return;
    const size = parseInt($("castSize")?.value || "20", 10) || 20;
    state.players = generateBalancedCast(size);

    // zera progresso (mas não inicia a temporada automaticamente)
    state.elimOrder = [];
    state.log = [];
    state.elimHistory = [];
    state.relations = {};
    state.crushRevealed = {};
    state.crushReciprocalBonus = {};
    state.week = 1;
    state.dayIndex = 0;
    state.gameOver = false;
    state.publicFavoriteIds = [];
    state.players.forEach((p)=>{ if(p.status){ p.status.favPublic=false; p.status.favPermanent=false; } });

    resetWeekState();
    pushLog("Sistema", `Elenco aleatório (${size}) criado.`);
    pendingAdvance = null;

    state.setupDone = false;
    save();
    enterSetupMode();
    render();
  });

  function randomizeAllPlayers() {
    if (state.gameOver) return;
    state.players.slice().sort((a,b)=> (a.name||"").localeCompare((b.name||""),"pt-BR",{sensitivity:"base"})).forEach((p) => {
      if (!p.status.alive) return;
      p.attrs.provas = rndInt(1, 10);
      p.attrs.estrategia = rndInt(1, 10);
      p.attrs.social = rndInt(1, 10);
      p.attrs.emocional = rndInt(1, 10);
      p.attrs.conflito = rndInt(1, 10);
      p.attrs.rejeicao = 0;
      p.attrs.excentricidade = rndInt(0, 10);
      p.attrs.serenidade = rndInt(1, 10);
    });
    save();
    render();
  }
  $("btnRandomize")?.addEventListener("click", randomizeAllPlayers);

  function classifyRelationScore(s) {
    if (s >= CRUSH_T) return "crush";
    if (s >= 0.5) return "friend";
    if (s <= -4.0) return "enemy";
    if (s <= -1.0) return "rival";
    return "neutral";
  }

  function popHistoryLabel(p, maxWeeks = 6) {
    // Mostra SEMANA 1 -> ÚLTIMA SEMANA (mas para na semana em que saiu)
    const w = p?.status?.popWeek || {};
    const outWeek = Number(p?.status?.outWeek || 0) || null;

    const globalLast = getGlobalLastPopWeek();
    const last = outWeek ? Math.min(outWeek, globalLast) : globalLast;
    if (!Number.isFinite(last) || last <= 0) return "—";

    const parts = [];
    for (let wk = 1; wk <= last; wk++) {
      const vRaw = (w[String(wk)] != null) ? Number(w[String(wk)]) : null;
      const v = Number.isFinite(vRaw) ? vRaw : null;
      parts.push(`S${wk}:${v == null ? '—' : fmt2(v)}`);
    }

    // Se ficar MUITO longo, reduz visualmente (mas continua sendo todas as semanas)
    // Render: a UI quebra linha automaticamente na célula.
    if (parts.length > 18) {
      // Exibe tudo, mas com separador mais curto para não virar um bloco gigante
      return parts.join(" ");
    }
    return parts.join(" • ");
  }

  function getGlobalLastPopWeek() {
    let last = 0;
    for (const p of (state.players || [])) {
      const w = p?.status?.popWeek || {};
      for (const k of Object.keys(w)) {
        const n = parseInt(k, 10);
        if (Number.isFinite(n)) last = Math.max(last, n);
      }
    }
    // fallback: em saves sem snapshot, usa a semana atual
    last = Math.max(last, Number(state.week || 1));
    return last;
  }

  function popSeriesForPlayer(p, lastWeek) {
    const w = p?.status?.popWeek || {};
    const outWeek = Number(p?.status?.outWeek || 0) || null;
    const last = outWeek ? Math.min(outWeek, lastWeek) : lastWeek;
    const series = [];
    for (let wk = 1; wk <= lastWeek; wk++) {
      if (wk > last) { series.push(null); continue; }
      const vRaw = (w[String(wk)] != null) ? Number(w[String(wk)]) : null;
      if (Number.isFinite(vRaw)) { series.push(clamp(vRaw, 0, 10)); continue; }

      // se ainda não tem snapshot dessa semana, mas é a semana atual e o jogador está na casa, usa pop atual
      if (wk === Number(state.week || 1) && p?.status?.alive) {
        const cur = Number(p?.status?.pop ?? 0);
        series.push(Number.isFinite(cur) ? clamp(cur, 0, 10) : null);
        continue;
      }
      series.push(null);
    }
    return series;
  }

  function hueForKey(key) {
    const s = String(key ?? '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h) % 360;
  }

  function renderPopLineChartSvg({ weeks, seriesList, height = 220, width = 860, showLegend = false }) {
  const padL = 34, padR = 16, padT = 14, padB = 28;
  const W = Math.max(width, 620);
  const H = Math.max(height, 200);
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const xFor = (i) => padL + (weeks.length <= 1 ? 0 : (i / (weeks.length - 1)) * iw);
  const yFor = (v) => padT + (1 - (v / 10)) * ih;

  // cores automáticas com mais variedade (coloridas, acinzentadas, claras e escuras)
  const autoColor = (idx) => {
    // Golden angle distribui melhor os tons e evita cores muito parecidas conforme cresce
    const golden = 137.50776405003785;
    const hue = (idx * golden) % 360;

    // estilos alternados pra variar saturação (vivo vs cinza) e luminosidade (claro vs escuro)
    // ajuste livre: mexa nesses valores pra mais contraste ou mais “pastel”
    const styles = [
      { s: 90, l: 54 }, // vivo, médio
      { s: 70, l: 44 }, // vivo, escuro
      { s: 78, l: 70 }, // vivo, claro
      { s: 28, l: 56 }, // acinzentado, médio
      { s: 22, l: 40 }, // acinzentado, escuro
      { s: 32, l: 76 }, // acinzentado, claro
      { s: 95, l: 40 }, // vivo, bem escuro
      { s: 18, l: 68 }, // bem “dusty”, claro
    ];

    const st = styles[idx % styles.length];
    return `hsl(${hue} ${st.s}% ${st.l}%)`;
  };

  // linhas de grade (0, 5, 10)
  const grid = [0, 5, 10].map((v) => {
    const y = yFor(v);
    return `<g class="chartAxis"><line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="currentColor" stroke-width="1" /></g>
            <text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="chartLabel" fill="currentColor">${v}</text>`;
  }).join('');

  // labels de semana (poucos para não poluir)
  const step = Math.ceil(weeks.length / 10);
  const xlabels = weeks.map((wk, i) => {
    if (i % step !== 0 && i !== weeks.length - 1) return '';
    const x = xFor(i);
    return `<text x="${x}" y="${H - 10}" text-anchor="middle" class="chartLabel" fill="currentColor">S${wk}</text>`;
  }).join('');

  const paths = seriesList.map((s, idx) => {
    const color = s?.color ? String(s.color) : autoColor(idx);

    // gera paths quebrando nos nulls
    let d = '';
    let penDown = false;
    for (let i = 0; i < s.series.length; i++) {
      const v = s.series[i];
      if (v == null || !Number.isFinite(v)) { penDown = false; continue; }
      const x = xFor(i);
      const y = yFor(v);
      if (!penDown) { d += `M ${x} ${y} `; penDown = true; }
      else { d += `L ${x} ${y} `; }
    }

    const name = escapeHtml(String(s.label || '—'));
    const path = `<path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />`;
    const legend = showLegend ? `<span class="it" style="color:${color}"><span class="dot"></span>${name}</span>` : '';
    return { path, legend };
  });

  const svg = `
    <svg class="chartSvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" rx="14" ry="14" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" />
      ${grid}
      ${paths.map(p => p.path).join('')}
      ${xlabels}
    </svg>
  `;

  const legendHtml = showLegend
    ? `<div class="chartLegend">${paths.map(p => p.legend).join('')}</div>`
    : '';

  return svg + legendHtml;
}


  function ensurePopTabSelection() {
    if (popTabSelectedIds && popTabSelectedIds.size) return;
    popTabSelectedIds = new Set((state.players || []).map((p) => String(p.id)));
  }

  function renderPopularityTab() {
  const chartEl = $("popTabChart");
  const listEl = $("popTabList");
  const hintEl = $("popTabHint");
  if (!chartEl || !listEl) return;

  ensurePopTabSelection();

  const lastWeek = getGlobalLastPopWeek();
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);

  const playersSorted = (state.players || []).slice().sort((a, b) =>
    String(displayName(a) || '').localeCompare(String(displayName(b) || ''), 'pt-BR', { sensitivity: 'base' })
  );

  // mesma regra nova das cores (varia saturação e luminosidade)
  const autoColorFromKey = (key) => {
    // tenta manter consistência por jogador usando o hueForKey existente
    const hue = hueForKey(String(key));

    const styles = [
      { s: 90, l: 54 }, // vivo, médio
      { s: 70, l: 44 }, // vivo, escuro
      { s: 78, l: 70 }, // vivo, claro
      { s: 28, l: 56 }, // acinzentado, médio
      { s: 22, l: 40 }, // acinzentado, escuro
      { s: 32, l: 76 }, // acinzentado, claro
      { s: 95, l: 40 }, // vivo, bem escuro
      { s: 18, l: 68 }, // bem “dusty”, claro
    ];

    // escolhe o estilo de forma estável por jogador:
    // usa o próprio hue como base pra distribuir nos estilos
    const idx = Math.round(hue) % styles.length;
    const st = styles[idx];

    return `hsl(${hue} ${st.s}% ${st.l}%)`;
  };

  // Controls wiring (idempotent)
  const sIn = $("popTabSearch");
  if (sIn && !sIn.__wired) {
    sIn.__wired = true;
    sIn.addEventListener('input', () => {
      popTabSearchTerm = String(sIn.value || '').trim().toLowerCase();
      renderPopularityTab();
    });
  }
  if (sIn && sIn.value !== (popTabSearchTerm || '')) sIn.value = popTabSearchTerm || '';

  const btnAll = $("popTabAll");
  if (btnAll && !btnAll.__wired) {
    btnAll.__wired = true;
    btnAll.addEventListener('click', () => {
      popTabSelectedIds = new Set((state.players || []).map((p) => String(p.id)));
      renderPopularityTab();
    });
  }
  const btnNone = $("popTabNone");
  if (btnNone && !btnNone.__wired) {
    btnNone.__wired = true;
    btnNone.addEventListener('click', () => {
      popTabSelectedIds = new Set();
      renderPopularityTab();
    });
  }

  // Player list (checkboxes)
  const q = String(popTabSearchTerm || '').trim();
  const filtered = q
    ? playersSorted.filter((p) => String(displayName(p) || '').toLowerCase().includes(q))
    : playersSorted;

  listEl.innerHTML = '';
  filtered.forEach((p) => {
    const id = String(p.id);
    const color = autoColorFromKey(id);

    const row = document.createElement('label');
    row.className = 'popPick';
    row.style.color = color;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = popTabSelectedIds.has(id);
    cb.addEventListener('change', () => {
      if (cb.checked) popTabSelectedIds.add(id);
      else popTabSelectedIds.delete(id);
      renderPopularityTab();
    });

    const dot = document.createElement('span');
    dot.className = 'dot';

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = displayName(p);

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(nm);
    listEl.appendChild(row);
  });

  const selected = playersSorted.filter((p) => popTabSelectedIds.has(String(p.id)));
  const seriesList = selected.map((p) => {
    const id = String(p.id);
    return {
      label: displayName(p),
      series: popSeriesForPlayer(p, lastWeek),
      color: autoColorFromKey(id)
    };
  });

  const showLegend = seriesList.length <= 24;
  chartEl.innerHTML = seriesList.length
    ? renderPopLineChartSvg({
        weeks,
        seriesList,
        width: Math.max(920, 40 + weeks.length * 36),
        height: 260,
        showLegend
      }) + (!showLegend ? `<div class="small" style="margin-top:10px; opacity:.85;">Legenda escondida porque há muitas linhas. Filtre para ver a legenda.</div>` : '')
    : `<div class="small" style="padding:10px; opacity:.85;">Selecione pelo menos 1 participante para ver o gráfico.</div>`;

  if (hintEl) {
    const total = playersSorted.length;
    const selN = seriesList.length;
    hintEl.textContent = `${selN}/${total} selecionados • Semanas: S1 → S${lastWeek}`;
  }
}

  function roleClassForPlayer(p) {
    const ws = state.weekState;
    const isParedao = ws.paredaoIds.includes(p.id);
    const isLeader = ws.leaderId === p.id;
    const isAnjo = ws.anjoId === p.id;
    const isImune = ws.imuneId === p.id;
    if (isParedao && p.status.alive) return " role-paredao";
    if (isLeader && p.status.alive) return " role-leader";
    if (isAnjo && p.status.alive) return " role-anjo";
    if (isImune && p.status.alive) return " role-imune";
    return "";
  }

  function rankLabelForPlayer(p) {
    // Rank numérico real (p.status.rank) é recalculado em toda renderização.
    const r = Number.isFinite(p?.status?.rank) ? p.status.rank : null;
    if (r == null) {
      // fallback antigo
      if (state.gameOver && state.final?.winnerId) {
        if (state.final.winnerId === p.id) return "1º";
        if (state.final.secondId === p.id) return "2º";
        if (state.final.thirdId === p.id) return "3º";
      }
      return "—";
    }
    return `${r}º`;
  }

  function tagsForPlayer(p) {
    const ws = state.weekState;
    const tags = [];

    if (state.gameOver && state.final?.winnerId) {
      if (state.final.winnerId === p.id) tags.push({ t: "👑 Vencedor", cls: "win" });
      else if (state.final.secondId === p.id) tags.push({ t: "🥈 2º lugar", cls: "win" });
      else if (state.final.thirdId === p.id) tags.push({ t: "🥉 3º lugar", cls: "win" });
    }

    const isFinal4Mode = alivePlayers().length === 4;

    if (ws.leaderId === p.id && p.status.alive && !state.gameOver) tags.push({ t: isFinal4Mode ? "Finalista" : "👑 Líder", cls: "leader" });
    if (ws.anjoId === p.id && p.status.alive) tags.push({ t: "😇 Anjo", cls: "anjo" });
    if (ws.imuneId === p.id && p.status.alive) tags.push({ t: "🛡️ Imune", cls: "imune" });

    // VIP/Xepa (resetam a cada novo lider)
    if ((ws.vipIds || []).includes(p.id) && p.status.alive) tags.push({ t: "💰 VIP", cls: "vip" });
    if ((ws.xepaIds || []).includes(p.id) && p.status.alive) tags.push({ t: "🍽️ Xepa", cls: "xepa" });


    // Quarto (tag)
    ensureRoomsState();
    if (state.rooms?.pair && p.status?.room && p.status.alive) {
      const [a, b] = splitRoomPair(state.rooms.pair);
      const label = p.status.room === 'A' ? a : b;
      tags.push({ t: label, cls: (p.status.room === 'A') ? 'roomA' : 'roomB' });
    }

    // Emoji de sexualidade (atributo oculto; so mostra indicador)
    {
      const em = sexualityEmoji(p);
      if (em && p.status.alive) tags.push({ t: em, cls: 'sex' });
    }

    

    // Emojis de relacao (sempre calculados apenas com jogadores ainda ativos)
    {
      const e2 = socialEmojiString(p);
      if (e2 && p.status.alive) tags.push({ t: e2, cls: 'emo' });
    }

    // Arquétipo BBB dominante (última semana disponível)
    try {
      if (p.status?.alive && p.status?.archetypeWeek) {
        const keys = Object.keys(p.status.archetypeWeek).map(Number).filter(n=>Number.isFinite(n) && n>0);
        const outW = Number(p.status?.outWeek ?? NaN);
        const lim = Number.isFinite(outW) ? Math.min(outW, Number(state.week||1)) : Number(state.week||1);
        const wk = keys.filter(n=>n<=lim).sort((a,b)=>b-a)[0];
        const snap = (wk != null) ? p.status.archetypeWeek[String(wk)] : null;
        if (snap && snap.dominantLabel) {
          const emo = (snap.comboTitle ? (snap.comboEmoji || snap.dominantEmoji || '🎭') : (snap.dominantEmoji || '🎭'));
          const lab = snap.comboTitle ? snap.comboTitle : snap.dominantLabel;
          tags.push({ t: `${emo} ${lab}`, cls: 'arch' });
        }
      }
    } catch { /* ignora */ }


// Planta (tag)
    if (p.status?.planta && p.status.alive) tags.push({ t: "🪴", cls: 'plant' });

    // Excluído (tag)
    if (p.status?.excluido && p.status.alive) tags.push({ t: "🥺", cls: 'emo' });

if (ws.indicadoLiderId === p.id && p.status.alive) tags.push({ t: "☝️ Indicação do Líder", cls: "paredao" });
    if (ws.contragolpeId === p.id && p.status.alive) tags.push({ t: "⚔️ Contragolpe", cls: "paredao" });
    if ((ws.indicadosCasaIds || []).includes(p.id) && p.status.alive) tags.push({ t: "🗳️ Indicação da Casa", cls: "paredao" });
    if (ws.paredaoIds.includes(p.id) && p.status.alive) tags.push({ t: "🧿 Paredão", cls: "paredao" });

    if (!p.status.alive) tags.push({ t: statusLabel(p), cls: "elim" });

    return tags;
  }

  function listSortedPlayers() {
    // sempre em ordem alfabética (nome completo)
    return state.players
      .slice()
      .sort((a, b) => (a.name || "").localeCompare((b.name || ""), "pt-BR", { sensitivity: "base" }));
  }

  // Rank numérico real: 1 = melhor no momento.
  // - Jogadores vivos ocupam as primeiras posições por desempenho atual (pop desc, rejeição asc).
  // - Eliminados vêm depois, do mais recente para o mais antigo.
  function recomputeRanks() {
    const alive = state.players.filter(p => p.status.alive);
    const out = state.players.filter(p => !p.status.alive);

    alive.sort((a, b) => {
      const pa = a.status.pop ?? 0;
      const pb = b.status.pop ?? 0;
      if (pb !== pa) return pb - pa;
      const ra = a.attrs.rejeicao ?? 0;
      const rb = b.attrs.rejeicao ?? 0;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare((b.name || ''), 'pt-BR', { sensitivity: 'base' });
    });

    // elimOrder: 0 = primeiro eliminado (pior), último = mais recente (melhor entre eliminados)
    const elimIndex = new Map();
    (state.elimOrder || []).forEach((id, idx) => elimIndex.set(id, idx));
    const elimCount = (state.elimOrder || []).length;

    out.sort((a, b) => {
      const ia = elimIndex.has(a.id) ? elimIndex.get(a.id) : -1;
      const ib = elimIndex.has(b.id) ? elimIndex.get(b.id) : -1;
      // mais recente primeiro
      if (ia !== ib) return ib - ia;
      return (a.name || '').localeCompare((b.name || ''), 'pt-BR', { sensitivity: 'base' });
    });

    let r = 1;
    alive.forEach(p => { p.status.rank = r++; });

    // Eliminados: continuam numerados após os vivos
    out.forEach(p => {
      p.status.rank = r++;
    });

    // Se acabou o jogo e existe final definida, trava top 3 como 1/2/3
    if (state.gameOver && state.final?.winnerId) {
      const w = state.players.find(p => p.id === state.final.winnerId);
      const s = state.players.find(p => p.id === state.final.secondId);
      const t = state.players.find(p => p.id === state.final.thirdId);
      if (w) w.status.rank = 1;
      if (s) s.status.rank = 2;
      if (t) t.status.rank = 3;
    }
  }

  function parseCasaSortValue(v) {
    const val = String(v || 'name_asc');
    const m = val.match(/^([a-z_]+)_(asc|desc)$/);
    if (!m) return { key: 'name', dir: 'asc' };
    return { key: m[1], dir: m[2] };
  }

  function casaSortValueFor(key, dir) {
    return `${key}_${dir}`;
  }

  function compareCasaPlayers(a, b, key, dir) {
    let va = 0, vb = 0;
    const d = (dir === 'asc') ? 1 : -1;

    if (key === 'name') {
      const na = (a.name || '');
      const nb = (b.name || '');
      return d * na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
    }

    if (key === 'rank') {
      va = a.status.rank ?? 999;
      vb = b.status.rank ?? 999;
    } else if (key === 'pop') {
      va = a.status.pop ?? 0;
      vb = b.status.pop ?? 0;
    } else if (key === 'rej') {
      va = a.attrs.rejeicao ?? 0;
      vb = b.attrs.rejeicao ?? 0;
    } else if (key === 'leader') {
      va = a.status.leaderCount ?? 0;
      vb = b.status.leaderCount ?? 0;
    } else if (key === 'anjo') {
      va = a.status.anjoCount ?? 0;
      vb = b.status.anjoCount ?? 0;
    } else if (key === 'paredao') {
      va = a.status.paredaoCount ?? a.status.strikes ?? 0;
      vb = b.status.paredaoCount ?? b.status.strikes ?? 0;
    } else if (key === 'alvo') {
      va = a.status.alvo ?? 0;
      vb = b.status.alvo ?? 0;
    }

    if (va < vb) return -1 * d;
    if (va > vb) return 1 * d;
    // desempate por nome
    return (a.name || '').localeCompare((b.name || ''), 'pt-BR', { sensitivity: 'base' });
  }


  function setCasaSort(key, dir) {
    if (!key) return;
    casaSortState.key = key;
    casaSortState.dir = (dir === 'desc') ? 'desc' : 'asc';
  }

  function toggleCasaSort(key, defaultDir) {
    if (!key) return;
    if (casaSortState.key === key) {
      casaSortState.dir = (casaSortState.dir === 'desc') ? 'asc' : 'desc';
    } else {
      casaSortState.key = key;
      casaSortState.dir = (defaultDir === 'desc') ? 'desc' : 'asc';
    }
  }

  function syncCasaHeaderSortUI() {
    const table = document.getElementById('casaTable');
    if (!table) return;
    const ths = table.querySelectorAll('thead th[data-sort]');
    ths.forEach(th => {
      th.classList.remove('asc','desc');
      if (casaSortState.key && th.dataset.sort === casaSortState.key) th.classList.add(casaSortState.dir);
    });
  }

  function setupCasaHeaderSorting() {
    const table = document.getElementById('casaTable');
    if (!table) return;
    const ths = table.querySelectorAll('thead th[data-sort]');
    ths.forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        // Direção padrão: números desc, nome/rank asc
        const defaultDir = (key === 'name' || key === 'rank') ? 'asc' : 'desc';
        toggleCasaSort(key, defaultDir);

        // mantém o select sincronizado com o estado
        const sel = document.getElementById('playerSort');
        if (sel) {
          const v = casaSortValueFor(casaSortState.key, casaSortState.dir);
          if ([...sel.options].some(o => o.value === v)) sel.value = v;
        }
        render();
      });
    });
  }

  function playerCard(p) {
    const card = document.createElement("div");
    card.className = "card" + roleClassForPlayer(p) + (p.status.alive ? "" : " eliminated");

    const top = document.createElement("div");
    top.className = "topline";

    const nameWrap = document.createElement("div");
    nameWrap.className = "row";
    nameWrap.style.gap = "8px";

    const first = document.createElement("input");
    first.className = "name";
    first.placeholder = "Nome";
    first.value = p.firstName ?? p.name ?? "";
    first.disabled = !p.status.alive || state.gameOver;


    const nick = document.createElement("input");
    nick.className = "nick";
    nick.placeholder = "Apelido (opcional)";
    nick.value = p.nickname ?? "";
    nick.disabled = !p.status.alive || state.gameOver;

    const last = document.createElement("input");
    last.className = "surname";
    last.placeholder = "Sobrenome";
    last.setAttribute("list", "surnameList");
    last.value = p.lastName ?? "";
    last.disabled = !p.status.alive || state.gameOver;

    const gender = document.createElement("select");
    gender.className = "genderSel";
    gender.innerHTML = `
      <option value="M">Homem</option>
      <option value="F">Mulher</option>
      <option value="O">Outro</option>
    `;
    gender.value = p.gender || "O";
    gender.disabled = !p.status.alive || state.gameOver;

    const age = document.createElement("input");
    age.className = "age";
    age.type = "number";
    age.min = "18";
    age.max = "75";
    age.step = "1";
    age.placeholder = "Idade";
    age.value = String(normalizeAge(p.age) ?? "");
    age.disabled = !p.status.alive || state.gameOver;

    // salvar sem render a cada tecla
    first.addEventListener("input", () => {
      p.firstName = first.value.trim() || "Sem";
      save();
    });
    last.addEventListener("input", () => {
      p.lastName = last.value.trim();
      save();
    });
    gender.addEventListener("change", () => {
      p.gender = gender.value;
      save();
      render();
    });

    age.addEventListener("input", () => {
      const v = normalizeAge(age.value);
      if (v == null) return;
      p.age = v;
      save();
    });
    age.addEventListener("blur", () => {
      ensurePlayerAge(p);
      age.value = String(normalizeAge(p.age) ?? "");
      render();
    });
    age.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); age.blur(); }});

    // render quando termina
    first.addEventListener("blur", () => { if (!String(p.nickname ?? "").trim()) p._autoNick = ""; render(); });
    nick.addEventListener("blur", () => render());
    last.addEventListener("blur", () => render());
    first.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); first.blur(); }});
    nick.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nick.blur(); }});
    last.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); last.blur(); }});

    nameWrap.appendChild(first);
    nameWrap.appendChild(nick);
    nameWrap.appendChild(last);
    nameWrap.appendChild(gender);
    nameWrap.appendChild(age);

    const badgeWrap = document.createElement("div");
    badgeWrap.className = "badges";
    const tags = tagsForPlayer(p);
    const badges = (tags.length ? tags.map(t => t.t) : [p.status.alive ? "Na casa" : statusLabel(p)]);
    badges.forEach((b) => {
      const s = document.createElement("span");
      s.className = "badge";
      s.textContent = b;
      badgeWrap.appendChild(s);
    });

    top.appendChild(nameWrap);
    top.appendChild(badgeWrap);

    const attrs = document.createElement("div");
    attrs.className = "attrs";

    const fields = [
      ["provas", "Provas"],
      ["estrategia", "Estratégia"],
      ["social", "Social"],
      ["emocional", "Emocional"],
      ["conflito", "Conflito"],
      ["serenidade", "Serenidade"],
      ["rejeicao", "Rejeição"],
      ["excentricidade", "Excentricidade"]
    ];

    fields.forEach(([key, label]) => {
      const lab = document.createElement("label");
      lab.textContent = label;

      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.max = "10";
      inp.step = "1";
      inp.value = String(p.attrs?.[key] ?? 0);
      inp.disabled = !p.status.alive || state.gameOver;

      inp.addEventListener("input", () => {
        if (!p.attrs) p.attrs = {};
        p.attrs[key] = clamp(parseInt(inp.value || "0", 10), 0, 10);
        save();
      });
      inp.addEventListener("change", () => render());

      lab.appendChild(inp);
      attrs.appendChild(lab);
    });

    const statusLine = document.createElement("div");
    statusLine.className = "row";
    statusLine.innerHTML = `
      <span class="badge">Pop: ${fmt2(p.status.pop ?? 0)}</span>
      <span class="badge">Alvo: ${fmt2(p.status.alvo ?? 0)}</span>
      <span class="badge">Paredões: ${p.status.strikes ?? 0}</span>
    `;

    const actions = document.createElement("div");
    actions.className = "row";

    const btnToggle = document.createElement("button");
    btnToggle.className = "ghost";
    btnToggle.textContent = p.status.alive ? "Eliminar" : "Recolocar";
    btnToggle.disabled = state.gameOver;
    btnToggle.addEventListener("click", () => {
      if (state.gameOver) return;
      if (p.status.alive) {
        markEliminated(p);
        pushLog("Sistema", `<strong>${escapeHtml(displayName(p))}</strong> saiu manualmente.`);
      } else {
        p.status.alive = true;
		delete p.status.outWeek;
        state.elimOrder = state.elimOrder.filter((id) => id !== p.id);
        pushLog("Sistema", `<strong>${escapeHtml(displayName(p))}</strong> voltou para a casa.`);
      }
      resetWeekState();
      save();
      render();
    });

    const btnRemove = document.createElement("button");
    btnRemove.className = "danger";
    btnRemove.textContent = "Remover";
    btnRemove.disabled = state.gameOver;
    btnRemove.addEventListener("click", () => {
      if (state.gameOver) return;
      state.players = state.players.filter((x) => x.id !== p.id);
      state.elimOrder = state.elimOrder.filter((id) => id !== p.id);
      resetWeekState();
      save();
      render();
    });

    actions.appendChild(btnToggle);
    actions.appendChild(btnRemove);

    card.appendChild(top);
    card.appendChild(attrs);
    card.appendChild(statusLine);
    card.appendChild(actions);

    return card;
  }

  /* ===== Render ===== */
  function render() {
    const alive = alivePlayers();
    const aliveN = alive.length;
    const ctx = dayCtx();
    const activeTab = document.querySelector('.tabBtn.active')?.dataset?.tab || document.querySelector('.menuPanel.active')?.id || 'tabCasa';

    // select do Histórico (participantes)
    const histWho = $("histWho");
    if (histWho) {
      const cur = histWho.value || "";
      histWho.innerHTML = `<option value="">Filtrar por participante…</option>` +
        state.players
          .slice()
          .sort((a,b) => (a.name || "").localeCompare(b.name || ""))
          .map((p) => `<option value="${p.id}">${escapeHtml(displayName(p))}</option>`)
          .join("");
      histWho.value = cur;
    }

    if ($("todayBadge")) $("todayBadge").textContent = state.gameOver ? "Final" : `🗓️ Semana ${state.week} • ${ctx.name}`;
    if ($("topMeta")) $("topMeta").textContent = `🧿 ${aliveN}/${state.players.length} na casa`;
    if ($("sideMeta")) $("sideMeta").textContent = `🧿 ${aliveN}/${state.players.length}`;

    // Comentário diário (BBB-style)
    const cbox = $("dailyComment");
    if (cbox) {
      const k = narrativeKey({ ctx: ctx, week: state.week });
      let entry = state.narrative?.daily?.[k] || null;
      // Se existe um evento recente importante (ex: eliminação) ainda não exibido,
      // força a reconstrução do feed para não ficar preso no cache.
      if (state.lastEvent && state.lastEvent.type === 'elimination' && state.lastEvent.shown === false) {
        entry = null;
      }
      // Invalida cache quando a lógica muda (evita mostrar comentários antigos)
      if (!entry || entry.v !== XUITTER_NARRATIVE_VERSION) {
        try { buildDailyComment({ ctx: ctx, week: state.week, dayName: ctx.name }); } catch (e) { console.error(e); state.narrative = state.narrative || {}; state.narrative.lastXuitterError = String(e && e.message ? e.message : e); }
        entry = state.narrative?.daily?.[k] || null;
      }
      const header = `<div class="twHeader">🦜 Xuitter</div>`;
      const body = (entry && typeof entry.html === 'string') ? entry.html : `<span class="muted">Sem comentários ainda para hoje.</span>${state?.narrative?.lastXuitterError ? `<div class="small muted" style="margin-top:6px;">⚠️ Xuitter erro: ${escapeHtml(state.narrative.lastXuitterError)}</div>` : ''}`;
      cbox.innerHTML = header + body;
    }

    // todayBlock (filtrado por semana + dia atuais)
    const dayBlock = $("todayBlock");
    if (dayBlock) {
      const lastDay = [...state.log].reverse().find((x) => x.who === "Dia" && x.week === state.week && x.dayName === ctx.name) || null;
      const lastGame = [...state.log].reverse().find((x) => x.who === "Jogo" && x.week === state.week && x.dayName === ctx.name) || null;
      const dayHtml = lastDay ? lastDay.msg : `<span class="small">—</span>`;
      const gameHtml = lastGame ? lastGame.msg : `<span class="small">—</span>`;

      dayBlock.innerHTML = `
        <div class="blockSection">
          <div class="blockHeader">Convivência</div>
          <div class="blockContent">${dayHtml}</div>
        </div>
        <div class="blockSection gameHighlight">
          <div class="blockHeader">Jogo</div>
          <div class="blockContent">${gameHtml}</div>
        </div>
      `;
    }

    // Sidebar
    const side = $("sidePlayers");
    if (side) {
      side.innerHTML = "";
      const alive = listSortedPlayers().filter((p) => p.status.alive);
      alive.forEach((p) => {
        const wrap = document.createElement("div");
        wrap.className = "sideItem";

        const nm = document.createElement("div");
        nm.className = "nm";

        const nameSpan = document.createElement("span");

        const fullName = ((String(p.firstName ?? p.name ?? "").trim() + " " + String(p.lastName ?? "").trim()).trim());
        const nick = String(p.baseName ?? p.nickname ?? "").trim();

        const labelCore = (nick && fullName && nick !== fullName)
          ? `${nick} (${fullName})`
          : (nick || fullName);

        const fav = (p && isPublicFavorite(p)) ? " ★" : "";
        const plant = (p && p.status && p.status.planta) ? " 🪴" : "";
        const monstro = (p && p.status && Number(p.status.monstroDaysLeft ?? 0) > 0) ? " 👹" : "";
        const excl = (p && p.status && p.status.excluido) ? " 🥺" : "";

        const ageTxt = (normalizeAge(p.age) != null) ? ` • ${normalizeAge(p.age)} anos` : '';
        nameSpan.textContent = labelCore + ageTxt + fav + plant + monstro + excl;

const statusSpan = document.createElement("span");
        statusSpan.className = "tag";
        statusSpan.textContent = "na casa";

        nm.appendChild(nameSpan);
        nm.appendChild(statusSpan);

        const tg = document.createElement("div");
        tg.className = "tg";
        const tags = tagsForPlayer(p).slice(0, 6);
        tags.forEach((x) => {
          const t = document.createElement("span");
          t.className = `tag ${x.cls || ""}`;
          t.textContent = x.t;
          tg.appendChild(t);
        });

        // métricas compactas (uma linha): 😍 Pop X | 🤮 Rej Y
        const bars = document.createElement("div");
        bars.className = "sideMetricsLine";
        bars.innerHTML = `
          <span class="m pop"><span class="ic" aria-hidden="true">😍</span><span class="tx">Pop ${fmt2(p.status.pop ?? 0)}</span></span>
          <span class="sep" aria-hidden="true">|</span>
          <span class="m rej"><span class="ic" aria-hidden="true">🤮</span><span class="tx">Rej ${fmt2(p.attrs.rejeicao ?? 0)}</span></span>
        `;

        wrap.appendChild(nm);
        if (tg.childNodes.length) wrap.appendChild(tg);
        wrap.appendChild(bars);

        wrap.addEventListener("click", () => openDrawer(p));
        side.appendChild(wrap);
      });
    }

    if (activeTab === "tabCasa") {
    // Casa: lista com histórico
    const list = $("playersList");
    if (list) {
      const q = (($("playerSearch")?.value || "").trim().toLowerCase());

      // Rank precisa estar sempre atualizado antes de qualquer ordenação.
      recomputeRanks();

      // Estado unificado: select + header
      // (o header mantém o select em sync; o select atualiza o estado)
      const sel = $("playerSort");
      if (sel) {
        const v = casaSortValueFor(casaSortState.key, casaSortState.dir);
        if (sel.value !== v && [...sel.options].some(o => o.value === v)) sel.value = v;
      }

      let ordered = state.players.slice();
      if (q) ordered = ordered.filter((p) => (p.name || "").toLowerCase().includes(q));

      ordered.sort((a, b) => compareCasaPlayers(a, b, casaSortState.key, casaSortState.dir));

      syncCasaHeaderSortUI();

      list.innerHTML = "";
      ordered.forEach((p) => {
        const tr = document.createElement("tr");
        const isAlive = (p.status && p.status.alive !== false);
        if (!isAlive) tr.className = "mutedRow";
        tr.style.cursor = "pointer";
        tr.addEventListener("click", () => openDrawer(p));

        const tdRank = document.createElement("td");
        tdRank.className = "rankCell";
        tdRank.textContent = rankLabelForPlayer(p);

        const tdName = document.createElement("td");
        tdName.className = "nameCell";
        tdName.textContent = displayName(p);

        const tdPersonagem = document.createElement("td");
        tdPersonagem.className = "charCell";
        const _snapP = getLastArchetypeSnapForPlayer(p);
        const _personagemP = _snapP ? ((_snapP.comboTitle ? `${_snapP.comboEmoji || '🎭'} ${_snapP.comboTitle}` : `${_snapP.dominantEmoji || '🎭'} ${_snapP.dominantLabel || ''}`).trim()) : '—';
        const _duplaP = _snapP && _snapP.duplaWithId ? `${_snapP.duplaEmoji || '💞'} Dupla com ${_snapP.duplaWithName || '—'}` : '';
        tdPersonagem.innerHTML = `<div>${escapeHtml(_personagemP)}</div>${_duplaP ? `<div class="small" style="margin-top:2px; opacity:.9;">${escapeHtml(_duplaP)}</div>` : ''}`;

        const tdPop = document.createElement("td");
        tdPop.className = "popCell";
        tdPop.textContent = fmt2(p.status.pop ?? 0);

        const tdRej = document.createElement("td");
        tdRej.className = "rejCell";
        tdRej.textContent = fmt2(p.attrs.rejeicao ?? 0);

        const tdHist = document.createElement("td");
        tdHist.className = "histCell";
        tdHist.textContent = popHistoryLabel(p, 7);

        const tdTags = document.createElement("td");
        const wrap = document.createElement("div");
        wrap.className = "tagsCell";

        const tags = tagsForPlayer(p);
        if (!tags.length) {
          const t = document.createElement("span");
          t.className = "tag";
          t.textContent = p.status.alive ? "Na casa" : statusLabel(p);
          wrap.appendChild(t);
        } else {
          tags.forEach((x) => {
            const t = document.createElement("span");
            t.className = `tag ${x.cls || ""}`;
            t.textContent = x.t;
            wrap.appendChild(t);
          });
        }

        tdTags.appendChild(wrap);
        tr.appendChild(tdRank);
        tr.appendChild(tdName);
        tr.appendChild(tdPersonagem);
        tr.appendChild(tdPop);
        tr.appendChild(tdRej);

        const tdLeader = document.createElement("td");
        tdLeader.textContent = String(p.status.leaderCount ?? 0);

        const tdAnjo = document.createElement("td");
        tdAnjo.textContent = String(p.status.anjoCount ?? 0);

        const tdParedao = document.createElement("td");
        tdParedao.textContent = String(p.status.paredaoCount ?? p.status.strikes ?? 0);

        tr.appendChild(tdLeader);
        tr.appendChild(tdAnjo);
        tr.appendChild(tdParedao);

tr.appendChild(tdHist);
tr.appendChild(tdTags);
list.appendChild(tr);

       
      });

      if (!ordered.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 10;
        td.className = "small";
        td.textContent = "—";
        tr.appendChild(td);
        list.appendChild(tr);
      }
    }

    // ===== Popularidade: gráfico de comparação (todos) =====
    const popCmp = $("popCompareChart");
    if (popCmp) {
      const lastWeek = getGlobalLastPopWeek();
      const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);

      // ordena para legend ficar mais útil: vivos primeiro, depois eliminados (mais recente -> mais antigo)
      const orderedForChart = (state.players || []).slice().sort((a, b) => {
        const aElim = (a?.status?.alive === false);
        const bElim = (b?.status?.alive === false);
        if (aElim !== bElim) return aElim ? 1 : -1;
        if (aElim && bElim) {
          const aw = Number(a?.status?.outWeek || 0);
          const bw = Number(b?.status?.outWeek || 0);
          if (aw !== bw) return bw - aw;
        }
        return String(displayName(a) || '').localeCompare(String(displayName(b) || ''), 'pt-BR', { sensitivity: 'base' });
      });

      const seriesList = orderedForChart.map((p) => ({
        label: displayName(p),
        series: popSeriesForPlayer(p, lastWeek)
      }));

      const showLegend = seriesList.length <= 18;
      popCmp.innerHTML = renderPopLineChartSvg({
        weeks,
        seriesList,
        width: Math.max(860, 40 + weeks.length * 32),
        height: 220,
        showLegend
      }) + (!showLegend ? `<div class="small" style="margin-top:10px; opacity:.85;">Legenda escondida porque há muitos jogadores. Clique em alguém na tabela para ver o gráfico individual.</div>` : "");
    }

    // Relações
    const relsBody = $("relsTable");
    if (relsBody) {
      relsBody.innerHTML = "";
      const baseList = state.players.slice().sort((a,b)=> (a.name||"").localeCompare((b.name||""),"pt-BR",{sensitivity:"base"}));
      const fmtNames = (arr) => (arr.length ? arr.map((x) => escapeHtml(displayName(x))).join(", ") : "—");

      baseList.forEach((p) => {
        const others = state.players.filter((o) => o.id !== p.id);
        const buckets = { allies: [], crush: [], friends: [], neutral: [], rivals: [], enemies: [] };

        others.forEach((o) => {
          const s = relGet(p.id, o.id);
          const cat = classifyRelationScore(s);
          if (cat === "crush") buckets.crush.push(o);
          else if (cat === "friend") buckets.friends.push(o);
          else if (cat === "neutral") buckets.neutral.push(o);
          else if (cat === "rival") buckets.rivals.push(o);
          else if (cat === "enemy") buckets.enemies.push(o);
        });

        buckets.crush.sort((a, b) => a.name.localeCompare(b.name));
        buckets.friends.sort((a, b) => relGet(p.id, b.id) - relGet(p.id, a.id));
        buckets.neutral.sort((a, b) => relGet(p.id, b.id) - relGet(p.id, a.id));
        buckets.rivals.sort((a, b) => relGet(p.id, a.id) - relGet(p.id, b.id));
        buckets.enemies.sort((a, b) => relGet(p.id, a.id) - relGet(p.id, b.id));

        const tr = document.createElement("tr");
        const isAlive = (p.status && p.status.alive !== false);
        if (!isAlive) tr.className = "mutedRow";

        const tdName = document.createElement("td");
        tdName.className = "nameCell";
        tdName.textContent = displayName(p);
        const tdCrush = document.createElement("td");
        tdCrush.innerHTML = fmtNames(buckets.crush);

        const tdFriends = document.createElement("td");
        tdFriends.innerHTML = fmtNames(buckets.friends);

        const tdNeutral = document.createElement("td");
        tdNeutral.innerHTML = fmtNames(buckets.neutral);

        const tdRivals = document.createElement("td");
        tdRivals.innerHTML = fmtNames(buckets.rivals);

        const tdEnemies = document.createElement("td");
        tdEnemies.innerHTML = fmtNames(buckets.enemies);

        tr.appendChild(tdName);
        tr.appendChild(tdCrush);
        tr.appendChild(tdFriends);
        tr.appendChild(tdNeutral);
        tr.appendChild(tdRivals);
        tr.appendChild(tdEnemies);

        relsBody.appendChild(tr);
      });

      if (!baseList.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 6;
        td.className = "small";
        td.textContent = "—";
        tr.appendChild(td);
        relsBody.appendChild(tr);
      }
    }


    }

    if (activeTab === "tabVotos") {
    // Votações
    const votesHead = $("votesHead");
    const votesBody = $("votesBody");
    if (votesHead && votesBody) {
      const weeks = (state.votesHistory || []).slice().sort((a,b)=> (a.week||0)-(b.week||0));

      votesHead.innerHTML = "";
      const trh = document.createElement("tr");
      const th0 = document.createElement("th");
      th0.textContent = "Participante";
      th0.style.width = "220px";
      trh.appendChild(th0);
      weeks.forEach((w) => {
        const th = document.createElement("th");
        th.textContent = `Sem ${w.week}`;
        trh.appendChild(th);
      });
      votesHead.appendChild(trh);

      votesBody.innerHTML = "";

      const orderedPlayers = state.players
  .slice()
  .sort((a, b) => {
    const aElim = (a.status?.alive === false) || (state.elimOrder || []).includes(a.id);
    const bElim = (b.status?.alive === false) || (state.elimOrder || []).includes(b.id);

    // 1) vivos sempre em cima
    if (aElim !== bElim) return aElim ? 1 : -1;

    // 2) entre eliminados: mais recente primeiro (fica em cima dos eliminados antigos)
    if (aElim && bElim) {
      // se tiver outWeek, usa isso (mais alto = mais recente)
      const aw = Number(a.status?.outWeek || 0);
      const bw = Number(b.status?.outWeek || 0);
      if (aw !== bw) return bw - aw;

      // fallback: usa elimOrder (mais pro final = mais recente)
      const ai = (state.elimOrder || []).indexOf(a.id);
      const bi = (state.elimOrder || []).indexOf(b.id);
      if (ai !== bi) return bi - ai;
    }

    // 3) entre vivos: mantém por nome
    return (a.name || "").localeCompare((b.name || ""), "pt-BR", { sensitivity: "base" });
  });


      const pById = (id) => state.players.find((x) => x.id === id) || null;
      const nm = (id) => pById(id)?.name || "—";

      orderedPlayers.forEach((p) => {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.innerHTML = `<strong>${escapeHtml(displayName(p))}</strong>${p.status?.alive ? '' : ' <span class="small">(fora)</span>'}`;
        tr.appendChild(tdName);

        weeks.forEach((w) => {
  const td = document.createElement("td");
  const cell = document.createElement("div");
  cell.className = "voteCell";

  const wNum = Number(w.week || 0);

  // Se o jogador saiu numa semana anterior, a célula vira só "-"
  if (p.status?.outWeek && wNum > p.status.outWeek) {
    td.textContent = "-";
    td.style.textAlign = "center";
    td.style.color = "var(--muted)";
    tr.appendChild(td);
    return;
  }

  // ... (o resto do seu código continua daqui pra baixo)


          if (p.id === w.leaderId) cell.insertAdjacentHTML('beforeend', `<span class="votePill leader">🏆 Líder</span>`);
          if (p.id === w.anjoId) cell.insertAdjacentHTML('beforeend', `<span class="votePill anjo">😇 Anjo</span>`);
          if (p.id === w.imuneId) cell.insertAdjacentHTML('beforeend', `<span class="votePill imune">🛡️ Imune</span>`);

          const onParedao = Array.isArray(w.paredaoIds) && w.paredaoIds.includes(p.id);
          if (onParedao) cell.insertAdjacentHTML('beforeend', `<span class="votePill paredao">🧱 Paredão</span>`);

          const out = (w.eliminadoId && p.id === w.eliminadoId);
          if (out) cell.insertAdjacentHTML('beforeend', `<span class="votePill out">❌ Eliminado</span>`);

          const votesReceived = Number(w.tally?.[p.id] ?? 0);
          cell.insertAdjacentHTML('beforeend', `<div class="voteLine">🗳️ Votos recebidos: <strong>${votesReceived}</strong></div>`);

          const myVote = (w.houseVotes || []).find(v => v.fromId === p.id) || null;
          const votedTo = myVote?.toId || null;
          const votedLineCls = (votedTo && votedTo === w.indicadoLiderId) ? 'voteLine voteLineYellow' : 'voteLine';
          const votedLabel = votedTo ? nm(votedTo) : '—';
          cell.insertAdjacentHTML('beforeend', `<div class="${votedLineCls}">👉 Votou em: <strong>${escapeHtml(votedLabel)}</strong></div>`);

          if (w.indicadoLiderId && p.id === w.indicadoLiderId) cell.insertAdjacentHTML('beforeend', `<div class="voteLine">🎯 Indicado do Líder</div>`);
          if (w.contragolpeId && p.id === w.contragolpeId) cell.insertAdjacentHTML('beforeend', `<div class="voteLine">🪝 Contragolpe</div>`);
          if (Array.isArray(w.indicadosCasaIds) && w.indicadosCasaIds.includes(p.id)) cell.insertAdjacentHTML('beforeend', `<div class="voteLine">🏠 Indicado da casa</div>`);

          if (onParedao) {
            const pv = w.publicoPerc?.[p.id];
            cell.insertAdjacentHTML('beforeend', `<div class="voteLine">📊 Público: <strong>${typeof pv==='number' ? fmt2(pv) : '—'}%</strong></div>`);
          }

          td.appendChild(cell);
          tr.appendChild(td);
        });

        votesBody.appendChild(tr);
      });

      if (!weeks.length) {
        votesHead.innerHTML = '<tr><th>Participante</th><th>Semanas</th></tr>';
        votesBody.innerHTML = '<tr><td class="small" colspan="2">Sem dados ainda. A tabela é preenchida quando uma semana termina (na eliminação).</td></tr>';
      }
    }
    }

    if (activeTab === "tabPopularidade") {
      renderPopularityTab();
    }

    if (activeTab === "tabElims") {
    // Eliminações
    const elimBody = $("elimTable");
    if (elimBody) {
      elimBody.innerHTML = "";
      const rows = (state.elimHistory || []).slice().reverse();
      rows.forEach((r) => {
        const tr = document.createElement("tr");

        const tdW = document.createElement("td");
        tdW.textContent = `S${r.week}`;

        const tdD = document.createElement("td");
        tdD.textContent = r.dayName || "—";

        const elimP = state.players.find((p) => p.id === r.eliminatedId);
        const tdE = document.createElement("td");
        tdE.textContent = elimP ? elimP.name : "—";

        const tdP = document.createElement("td");
        const parts = (r.paredaoIds || []).map((id) => {
          const p = state.players.find((x) => x.id === id);
          const pct = r.percById?.[id] ?? 0;
          const mark = id === r.eliminatedId ? " (saiu)" : "";
          return `${p ? p.name : "?"}: ${fmt2(pct)}%${mark}`;
        });
        tdP.textContent = parts.join(" • ");

        tr.appendChild(tdW);
        tr.appendChild(tdD);
        tr.appendChild(tdE);
        tr.appendChild(tdP);
        elimBody.appendChild(tr);
      });

      if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "small";
        td.textContent = "—";
        tr.appendChild(td);
        elimBody.appendChild(tr);
      }
    }
    }

    if (activeTab === "tabHistorico") {
    // Histórico (Log)
    const logEl = $("log");
    if (logEl) {
      logEl.innerHTML = "";
      let entries = state.log.slice().reverse();
      if (logFilter === "game") entries = entries.filter((e) => e.who === "Jogo");
      if (logFilter === "day") entries = entries.filter((e) => e.who === "Dia");

      const txt = (($("histSearch")?.value || "").trim().toLowerCase());
      const pid = $("histWho")?.value || "";
      if (pid) {
        const p = state.players.find((x) => x.id === pid);
        if (p) entries = entries.filter((e) => (e.msg || "").toLowerCase().includes(String(p.name || "").toLowerCase()));
      }
      if (txt) entries = entries.filter((e) => (e.msg || "").toLowerCase().includes(txt) || (e.dayName || "").toLowerCase().includes(txt));

      entries.forEach((entry) => {
        const p = document.createElement("p");
        const title = entry.week && entry.dayName ? `Semana ${entry.week} • ${entry.dayName}` : entry.who;
        p.innerHTML = `<strong>${escapeHtml(title)}</strong><br>${entry.msg}`;
        logEl.appendChild(p);
      });
    }

    }

    if (activeTab === "tabConfig") {
    // Config: cards editáveis (nome + atributos)
    const cfgGrid = $("configPlayersGrid");
    if (cfgGrid) {
      cfgGrid.innerHTML = "";
      state.players.slice().sort((a,b)=> (a.name||"").localeCompare((b.name||""),"pt-BR",{sensitivity:"base"})).forEach((p) => cfgGrid.appendChild(playerCard(p)));
    }
    }

    if ($("meta")) $("meta").textContent = `${aliveN}/${state.players.length} ainda na casa`;
    if ($("btnNextTop")) $("btnNextTop").disabled = state.gameOver;
  }
  /* ===== init ===== */
  if (state.players.length === 0) {
    const size = 1;
    state.players = generateBalancedCast(size);
    state.setupDone = false;
    save();
  }

  setupCasaHeaderSorting();

  if (state.setupDone) {
    bootStart();
  } else {
    enterSetupMode();
  }

  render();
})();
