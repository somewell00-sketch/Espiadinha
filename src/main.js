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

  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
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

  // 0..1: quao permitido e virar crush/romance com esse alvo, do ponto de vista do source
  function attraction01(source, target) {
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

  function crushAllowed(source, target) {
    return attraction01(source, target) > 0.02;
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
    { key: "sex", name: "Sexta", notes: "Convivência + Prova do Anjo" },
    { key: "sab", name: "Sábado", notes: "Convivência" },
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
        p.status = p.status || { alive: true, pop: 5, alvo: 0, strikes: 0, leaderCount: 0, anjoCount: 0, paredaoCount: 0, popWeek: {}, favPublic: false };
        p.status.popWeek = p.status.popWeek || {};
        if (p.status.favPublic === undefined) p.status.favPublic = false;
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
      xepaIds: []
    };
  }

  function makePlayer(firstName = "Jogador", lastName = "", gender = "O") {
    return {
      id: (window.crypto?.randomUUID?.() ?? ("id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16))),
      firstName,
      lastName,
      gender, // "M" | "F" | "O"
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
      status: { alive: true, pop: 5.0, alvo: 0.0, strikes: 0, leaderCount: 0, anjoCount: 0, paredaoCount: 0, popWeek: {}, favPublic: false, room: null, weeksSinceWin: 0, weeksSinceParedao: 0, weeksSinceEvent: 0, popPrev: 5.0, popStableStreak: 0, decisionStreak: 0, didSomethingThisWeek: false, madeDecisionThisWeek: false, wonSomethingThisWeek: false, planta: false, plantStreak: 0, excluido: false, excluidoStreak: 0, narr: { invisDays: 0, pressureDays: 0, lastLabel: "" } },
      secret: { gayScore: (gender === 'M' || gender === 'F') ? sampleGayScore() : null }
    };
  }

  const FIRST_NAMES = {
    M: ["João","Lucas","Pedro","Gabriel","Rafael","Matheus","Felipe","Bruno","Diego","André","Thiago","Victor","Daniel","Eduardo","Caio","Henrique","Guilherme","Leonardo","Marcos","Igor","Vinícius","Renan","Alex","Fábio","Samuel","Arthur","Murilo","Rodrigo","Leandro","Cristiano","Douglas","Jefferson","Alan","Wesley","Otávio","Nicolas","Davi","Ramon","Yuri","Heitor","Bernardo","Luan","Kauã","Enzo","Ícaro"],
    F: ["Maria","Ana","Beatriz","Juliana","Mariana","Camila","Fernanda","Gabriela","Larissa","Renata","Patrícia","Daniela","Carolina","Aline","Bruna","Natália","Vanessa","Paula","Jéssica","Priscila","Simone","Adriana","Flávia","Bianca","Tatiane","Luana","Raquel","Débora","Michele","Sandra","Elisa","Helena","Sofia","Clara","Laura","Amanda","Isabela","Letícia","Joana","Rita","Lúcia","Márcia","Tereza","Milena","Yara"],
    O: ["Alex","Ariel","Luca","Noa","Dani","Sam","Chris","Kim","Taylor","Ariel"]
  };
  const SURNAMES = ["Silva","Santos","Oliveira","Pereira","Costa","Rodrigues","Alves","Lima","Gomes","Ribeiro","Carvalho","Araujo","Rocha","Martins","Lopes","Soares","Fernandes","Vieira","Barros","Freitas","Nogueira","Teixeira","Guedes","Pacheco","Farias","Cunha","Batista","Rangel","Macedo","Tavares","Moreira","Montenegro","Figueiredo","Amaral","Peixoto","Vasconcelos","Antunes","Neves","Torres","Braga","Abreu","Correia","Paiva","Seixas","Fonseca","Lacerda","Valente","Portela","Azevedo","Siqueira","Bittencourt","Magalhães","Guimarães","Mattos","Pimentel","Salgado","Rezende","Barreto","Coelho","Rios","Toledo","Beltrão","Medeiros","Dantas","Queiroz","Caldas","Camargo","Ferraz","Brandão","Franco","Nascimento","Assunção","Coutinho","Lins","Sarmento","Albuquerque","Mendonça","Viana","Drumond","Seabra","Loyola","Arruda","Pires","Falcão","Goulart","Azeredo","Leal","Maciel","Sampaio","Bezerra","Cardoso","Rabelo","Furtado","Quintana","Abranches","Pinheiro","Mascarenhas","Godoy","Maluf","Tanaka"];

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
    "samuel": ["Sam","Samu","Samuca"],
    "joao": ["Jão","Joca"],
    "lucas": ["Lu","Luquinhas"],
    "pedro": ["Pe","Pedrinho"],
    "gabriel": ["Gabi","Biel"],
    "rafael": ["Rafa","Rafinha"],
    "matheus": ["Math","Teus"],
    "felipe": ["Lipe","Fê"],
    "bruno": ["Bru","Bruninho"],
    "diego": ["Di","Diguinho"],
    "andre": ["Dedé","Andrezinho"],
    "thiago": ["Thi","Titi"],
    "victor": ["Vitinho","Vitu"],
    "daniel": ["Dani","Dan"],
    "eduardo": ["Edu","Dudu"],
    "caio": ["Cai","Caião"],
    "henrique": ["Rique","Henri"],
    "guilherme": ["Gui","Guizinho"],
    "leonardo": ["Léo","Leozin"],
    "marcos": ["Marcão","Marquinhos"],
    "igor": ["Ig","Igão"],
    "vinicius": ["Vini","Vinão"],
    "renan": ["Rê","Renanzinho"],
    "arthur": ["Tu","Tutu"],
    "murilo": ["Muri","Muzão"],
    "rodrigo": ["Rod","Rodriguinho"],
    "leandro": ["Lê","Léo"],
    "cristiano": ["Cris","Tiano"],
    "douglas": ["Doug","Dô"],
    "jefferson": ["Jeff","Jefinho"],
    "alan": ["Al","Lanzinho"],
    "wesley": ["Wes","Weslão"],
    "otavio": ["Tavinho","Tavi"],
    "nicolas": ["Nico","Niquinho"],
    "davi": ["Davi","Davizinho"],
    "ramon": ["Ram","Ramonzin"],
    "yuri": ["Yu","Yuzinho"],
    "heitor": ["Heitinho","Heitorzão"],
    "bernardo": ["Bê","Nardo"],
    "luan": ["Lua","Luanzin"],
    "kaua": ["Kauã","Kaka"],
    "enzo": ["Enzinho","Zô"],
    "icaro": ["Ica","Icarinho"],

    "maria": ["Mari","Mabi"],
    "ana": ["Aninha","Anoca"],
    "beatriz": ["Bia","Bibi"],
    "juliana": ["Juju","Ju"],
    "mariana": ["Mari","Marih"],
    "camila": ["Cami","Mila"],
    "fernanda": ["Fê","Nanda"],
    "gabriela": ["Gabi","Bela"],
    "larissa": ["Lari","Lá"],
    "renata": ["Rê","Nata"],
    "patricia": ["Paty","Pati"],
    "daniela": ["Dani","Dany"],
    "carolina": ["Carol","Cacau"],
    "aline": ["Ali","Lili"],
    "bruna": ["Bru","Bruninha"],
    "natalia": ["Nati","Naná"],
    "vanessa": ["Vane","Nessa"],
    "paula": ["Paulinha","Pau"],
    "jessica": ["Jess","Jé"],
    "priscila": ["Pri","Prizinha"],
    "simone": ["Si","Sisi"],
    "adriana": ["Dri","Drica"],
    "flavia": ["Flavinha","Flá"],
    "bianca": ["Bia","Bibi"],
    "tatiane": ["Tati","Tata"],
    "luana": ["Lua","Lu"],
    "raquel": ["Quel","Kel"],
    "debora": ["Debs","Dê"],
    "michele": ["Mi","Mimi"],
    "sandra": ["Sandrinha","San"],
    "elisa": ["Li","Eli"],
    "helena": ["Lena","Lê"],
    "sofia": ["Sô","Fifi"],
    "clara": ["Clá","Clarinha"],
    "laura": ["Lau","Laurinha"],
    "amanda": ["Mandi","Amandinha"],
    "isabela": ["Isa","Bel"],
    "leticia": ["Let","Lelê"],
    "joana": ["Jô","Jo"],
    "rita": ["Ri","Ritinha"],
    "lucia": ["Lu","Lucinha"],
    "marcia": ["Marci","Má"],
    "tereza": ["Tê","Terezinha"],
    "milena": ["Mi","Mile"],
    "yara": ["Ya","Yazinha"]
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
    const set = new Set(Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : []);
    for (const x of state.players) {
      if (x.status) x.status.favPublic = set.has(x.id);
    }
  }

  function clearPublicFavorites() {
    state.publicFavoriteIds = [];
    syncFavFlags();
  }

  function addPublicFavorite(p) {
    if (!p || !p.id) return;
    state.publicFavoriteIds = Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : [];
    if (!state.publicFavoriteIds.includes(p.id)) state.publicFavoriteIds.push(p.id);
    syncFavFlags();
  }

  function removePublicFavorite(pOrId) {
    const id = typeof pOrId === "string" ? pOrId : (pOrId?.id || null);
    if (!id) return;
    state.publicFavoriteIds = Array.isArray(state.publicFavoriteIds) ? state.publicFavoriteIds : [];
    state.publicFavoriteIds = state.publicFavoriteIds.filter((x) => x !== id);
    syncFavFlags();
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
    const festa = /festa/i.test(String(d.notes || "")) || (d.key === "qua");
    const tension = d.key === "seg" || d.key === "ter";
    return { ...d, festa, tension };
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


  const peopleTxt = formatNamesInText(e.people);
  const descTxt = formatNamesInText(e.desc);

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
      "passa despercebido geral 👻",
      "entrega um dia morno 🌡️",
      "vive sem conflitos nem alianças 😶",
      "não serve nem pra irritar 😴",
      "evita tudo que rende VT 🚪",
      "sobrevive sem jogar 💤",
      "parece já eliminado 🫥",
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
      "se sente excluído 😞",
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

    const wNeutral = 1.6 + p.attrs.rejeicao * 0.05;
    const wSocial = p.attrs.social * 0.9;
    const wConflict = p.attrs.conflito * 0.95 * festaBoost * tensionBoost;
    const wStrategy = p.attrs.estrategia * 0.9 * (ctx.festa ? 0.9 : 1.0);
    const wEmo = (10 - p.attrs.emocional) * 0.75 * (ctx.tension ? 1.1 : 1.0);
    const wRomance = (p.attrs.social * 0.6 + p.attrs.emocional * 0.25) * (ctx.festa ? 1.4 : 0.9);
    const wAttention = (p.attrs.social * 0.55 + p.attrs.estrategia * 0.25 + p.attrs.emocional * 0.1) * (ctx.festa ? 1.35 : 1.0);

    const cat = pickWeighted([
      { item: "neutral", w: wNeutral },
      { item: "social", w: wSocial },
      { item: "conflict", w: wConflict },
      { item: "strategy", w: wStrategy },
      { item: "emotional", w: wEmo },
      { item: "romance", w: wRomance },
      { item: "attention", w: wAttention }
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

    if (cat === "social" && other) {
      const kindness = (p.attrs.social + other.attrs.social) / 2;
      const dRel = clamp(0.8 + kindness * 0.06 + rnd(-0.3, 0.35), 0.3, 1.4);
      const dPopA = popDelta(0.1 + p.attrs.social * 0.03 - p.attrs.rejeicao * 0.02 + rnd(-0.08, 0.12));
      const dPopB = popDelta(0.07 + other.attrs.social * 0.03 - other.attrs.rejeicao * 0.02 + rnd(-0.08, 0.12));
      return {
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
  // - No máximo 3 "excluídos" por vez (os 3 com menos boas relações)
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

    // 2) escolhe no máximo 3 candidatos (os com menos boas relações; em empate, mais desafetos)
    const chosen = social
      .filter((x) => x.isCandidate)
      .sort((a, b) => {
        if (a.goodLinks !== b.goodLinks) return a.goodLinks - b.goodLinks;
        if (a.rivals !== b.rivals) return b.rivals - a.rivals;
        return (a.p.status?.pop ?? 0) - (b.p.status?.pop ?? 0); // desempate leve
      })
      .slice(0, 3);

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
  dayAdd(partyBannerHtml());
}

    if (typeof maybeSpecialFightEvent === "function") {
      maybeSpecialFightEvent(ctx);
    }

    const cap = clamp(Math.round(rnd(2, 5) + (ctx.festa ? 1 : 0) + (ctx.tension ? 1 : 0)), 2, 6);

    const candidates = alive
      .map((p) => {
        const base = 0.28 + p.attrs.social * 0.03 + p.attrs.conflito * 0.02 + p.attrs.estrategia * 0.015 - p.attrs.rejeicao * 0.01;
        const boost = (ctx.festa ? 0.12 : 0) + (ctx.tension ? 0.06 : 0);
        return { p, chance: clamp(base + boost, 0.10, 0.85) };
      })
      .sort((a, b) => b.chance - a.chance);

    let made = 0;
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

  /* ===== Big Fone (Sábado) ===== */
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
    const weighted = candidates.map((p) => {
      const risk = p.status.alvo * 1.0 + p.attrs.rejeicao * 0.9 + p.attrs.conflito * 0.6;
      const likable = p.attrs.social * 0.4 + p.status.pop * 0.4;
      const noise = rnd(-1.0, 1.0);
      const score = risk * 0.95 + likable * 0.25 + noise;
      return { item: p, w: clamp(score + 1.5, 0.2, 30) };
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
    "loureiro josé",
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
    const noise = rnd(-1.5, 1.5) - leader.attrs.estrategia * 0.25;
    return threat * 0.65 + easyVote * 0.35 + noise;
  }

  function doIndica() {
    const alive = alivePlayers();
    const leader = state.players.find((p) => p.id === state.weekState.leaderId);
    if (!leader) return;

    const bf = state.weekState?.bigFone || {};
    const imuneId = state.weekState.imuneId;
    const bfImm = Array.isArray(bf.immuneIds) ? bf.immuneIds : [];

    const candidates = alive.filter((p) =>
      p.id !== leader.id &&
      p.id !== imuneId &&
      p.id !== bf.noVoteId &&
      p.id !== bf.extraParedaoId &&
      !bfImm.includes(p.id)
    );
    if (!candidates.length) return;

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

    // Big Fone pode adicionar um nome extra ao paredão (sábado)
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
  "batem química e começam colados pela casa.",
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

    // SEXTA: anjo (não existe no Top6/Top4)
    if (ctxFrozen.key === "sex") {
      if (!top6 && aliveN > 6) doAnjo();
    }

    // SÁBADO: Big Fone (30% de chance; até Top 7)
    if (ctxFrozen.key === "sab") {
      doBigFone(meta);
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
    const isPartyDay = Boolean(ctx?.festa) || /festa/i.test(String(ctx?.notes || "")) || /festa/i.test(String(ctx?.name || ""));
    if (!state.gameOver && isPartyDay && state.week > 1) {
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

const html = tweets.map((x) => `
      <div class="tweet">
        <div class="twUser">${escapeHtml(x.u)}</div>
        <div class="twText">${x.t}</div>
      </div>
    `).join('');

    state.narrative = state.narrative || { daily: {}, prevSnap: {} };
    state.narrative.daily[key] = { html, ts: Date.now() };
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

      // Pop por semana como mini barras
      const weeks = Object.keys(status.popWeek || {}).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)).sort((a,b)=>a-b);
      const bars = (weeks.length ? weeks : [state.week]).slice(-10).map((w) => {
        const v = clamp(Number(status.popWeek?.[w] ?? status.pop ?? 0), 0, 10);
        return `<div><span class="lbl">S${w}</span><span class="bar"><i style="width:${(v/10)*100}%"></i></span><span class="val">${fmt2(v)}</span></div>`;
      }).join("");

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
            <div class="c"><div class="miniBars">${bars}</div></div>
          </div>
        </div>

        <div class="drawerCard" style="margin-top:10px;">
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
    const size = parseInt($("castSize")?.value || "12", 8) || 32;
    state.players = generateBalancedCast(size);

    // Backfill gayScore (atributo oculto)
    for (const p of (state.players || [])) {
      if (!p) continue;
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
  state.players.forEach((p)=>{ if(p.status) p.status.favPublic=false; });
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
    state.players.forEach((p)=>{ if(p.status) p.status.favPublic=false; });

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
    const w = p.status.popWeek || {};
    const keys = Object.keys(w)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!keys.length) return "—";
    const tail = keys.slice(-maxWeeks);
    return tail.map((k) => `S${k}:${fmt2(w[String(k)] ?? 0)}`).join(" • ");
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
      const entry = state.narrative?.daily?.[k] || null;
      const header = `<div class="twHeader">🦜 Xuitter</div>`;
      const body = entry?.html || `<span class="muted">Sem comentários ainda para hoje.</span>`;
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

        nameSpan.textContent = labelCore + fav + plant + monstro + excl;

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
        if (!p.status.alive) tr.className = "mutedRow";
        tr.style.cursor = "pointer";
        tr.addEventListener("click", () => openDrawer(p));

        const tdRank = document.createElement("td");
        tdRank.className = "rankCell";
        tdRank.textContent = rankLabelForPlayer(p);

        const tdName = document.createElement("td");
        tdName.className = "nameCell";
        tdName.textContent = displayName(p);

        const tdPop = document.createElement("td");
        tdPop.className = "popCell";
        tdPop.textContent = fmt2(p.status.pop ?? 0);

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
        tr.appendChild(tdPop);

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
        td.colSpan = 8;
        td.className = "small";
        td.textContent = "—";
        tr.appendChild(td);
        list.appendChild(tr);
      }
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
        if (!p.status.alive) tr.className = "mutedRow";

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