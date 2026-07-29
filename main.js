/* =========================================================================
   Kokiothashi — comportamento do site
   ------------------------------------------------------------------------
   CONFIGURAÇÃO: troque o número abaixo pelo WhatsApp da empresa.
   Formato: código do país + DDD + número, só dígitos.
   ========================================================================= */
const WHATSAPP = '5527992723742';   // ← TROQUE AQUI

const CALMO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- utilidades ---------- */
const $  = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const espera = (ms) => new Promise(r => setTimeout(r, CALMO ? 0 : ms));


/* =========================================================================
   1. Prancha de construção do hero
   Mede cada traço e devolve o comprimento para o CSS animar o dash.
   ========================================================================= */
function montarPrancha() {
  const prancha = $('.prancha');
  if (!prancha) return;

  $$('.traco', prancha).forEach(p => {
    const len = Math.ceil(p.getTotalLength());
    p.style.setProperty('--len', len);
  });

  requestAnimationFrame(() => prancha.classList.add('is-feita'));
}


/* =========================================================================
   2. Revelação por rolagem
   ========================================================================= */
function montarRevelacao() {
  const alvos = $$('[data-rev]');
  if (!alvos.length) return;

  if (CALMO || !('IntersectionObserver' in window)) {
    alvos.forEach(a => a.classList.add('is-vis'));
    return;
  }

  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-vis');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

  alvos.forEach(a => obs.observe(a));
}


/* =========================================================================
   3. Contadores de valor (seção hospedagem)
   ========================================================================= */
function montarContadores() {
  const alvos = $$('[data-conta]');
  if (!alvos.length) return;

  const formata = (n) => n.toLocaleString('pt-BR');

  const anima = (el) => {
    const fim = Number(el.dataset.conta);
    if (CALMO || fim === 0) { el.textContent = formata(fim); return; }

    const dur = 1250;
    const t0 = performance.now();

    const passo = (agora) => {
      const t = Math.min((agora - t0) / dur, 1);
      const suave = 1 - Math.pow(1 - t, 3);          // easeOutCubic
      el.textContent = formata(Math.round(fim * suave));
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  };

  if (!('IntersectionObserver' in window)) { alvos.forEach(anima); return; }

  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      anima(e.target);
      obs.unobserve(e.target);
    });
  }, { threshold: 0.6 });

  alvos.forEach(a => obs.observe(a));
}


/* =========================================================================
   4. Cabeçalho: sombra ao rolar + link da seção atual
   ========================================================================= */
function montarCabecalho() {
  const topo = $('.topo');
  const links = $$('.topo__nav a');
  const secoes = links
    .map(a => $(a.getAttribute('href')))
    .filter(Boolean);

  const aoRolar = () => {
    topo.classList.toggle('is-preso', window.scrollY > 8);
  };
  aoRolar();
  window.addEventListener('scroll', aoRolar, { passive: true });

  if (!secoes.length || !('IntersectionObserver' in window)) return;

  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(l => l.classList.toggle(
        'is-aqui', l.getAttribute('href') === '#' + e.target.id
      ));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  secoes.forEach(s => obs.observe(s));
}


/* =========================================================================
   5. Menu móvel
   ========================================================================= */
function montarMenu() {
  const botao = $('.topo__menu');
  const menu  = $('#nav-movel');
  if (!botao || !menu) return;

  const alternar = (abrir) => {
    const estado = abrir ?? botao.getAttribute('aria-expanded') === 'false';
    botao.setAttribute('aria-expanded', String(estado));
    botao.setAttribute('aria-label', estado ? 'Fechar menu' : 'Abrir menu');
    menu.hidden = !estado;
    menu.classList.toggle('is-aberto', estado);
  };

  botao.addEventListener('click', () => alternar());
  $$('a', menu).forEach(a => a.addEventListener('click', () => alternar(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') alternar(false);
  });

  // Acima de 860px o menu móvel some por CSS. Sem isto o estado ARIA ficaria
  // preso em "aberto" e o hambúrguer voltaria já em forma de X ao reduzir.
  const desktop = window.matchMedia('(min-width: 861px)');
  desktop.addEventListener('change', (e) => { if (e.matches) alternar(false); });
}


/* =========================================================================
   6. Chatbot → WhatsApp
   Coleta os insumos e monta o link com a mensagem já preenchida.
   ========================================================================= */
const ROTEIRO = [
  {
    chave: 'servico',
    fala: 'Oi! Sou o assistente da Kokiothashi. São três perguntas rápidas e o seu nome — depois eu te levo para o WhatsApp com tudo anotado.',
    segunda: 'Para começar: o que você precisa?',
    opcoes: ['Site institucional', 'Portfólio de serviços', 'Trocar meu site atual', 'Ainda não sei']
  },
  {
    chave: 'dominio',
    fala: 'Anotado. E o endereço do site — você já tem um domínio registrado?',
    opcoes: ['Já tenho', 'Ainda não tenho', 'Não sei dizer']
  },
  {
    chave: 'prazo',
    fala: 'Certo. Quando você gostaria de começar?',
    opcoes: ['O quanto antes', 'Ainda este mês', 'Só pesquisando por ora']
  },
  {
    chave: 'nome',
    fala: 'Perfeito. Por último: como podemos te chamar?',
    campo: 'Digite seu nome'
  }
];

const RESPOSTAS = {};
let passo = 0;
let chatIniciado = false;

const fluxo = $('#chat-fluxo');
const ops   = $('#chat-ops');
const chat  = $('#chat');
const bolha = $('.bolha');

/* ---------- rolagem do fluxo ----------
   O fluxo "gruda" no fundo enquanto o visitante não sobe para reler. Mensagem
   nova aparece sozinha, mas ninguém é puxado para baixo no meio de uma leitura.
   Só desgruda quando a rolagem vai para cima; volta a grudar ao alcançar o fim. */
const FOLGA_FUNDO = 24;
let grudado = true;
let ultimoTop = 0;

const noFundo = () => fluxo.scrollHeight - fluxo.scrollTop - fluxo.clientHeight <= FOLGA_FUNDO;

const rolar = (modo = 'smooth') => {
  if (!grudado) return;
  fluxo.scrollTo({ top: fluxo.scrollHeight, behavior: CALMO ? 'instant' : modo });
};

/* Tempo do "digitando" proporcional ao tamanho da fala, com piso e teto: uma
   frase curta não pode levar o mesmo que um parágrafo. */
const ritmo = (texto) => Math.min(1100, Math.max(380, texto.length * 13));

/* Na conversa o bot trata a pessoa pelo primeiro nome; no WhatsApp vai o nome
   completo, do jeito que foi digitado. "Obrigado, Ana Paula Ribeiro!" soa
   protocolar — mas o resumo que chega para a equipe precisa do nome inteiro. */
const primeiroNome = (nome) => {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
};

function balao(texto, quem = 'bot') {
  const d = document.createElement('div');
  d.className = `msg msg--${quem}`;
  d.textContent = texto;
  fluxo.appendChild(d);
  rolar();
  return d;
}

async function digitando(ms = 620) {
  const d = document.createElement('div');
  d.className = 'digita';
  d.innerHTML = '<i></i><i></i><i></i>';
  fluxo.appendChild(d);
  rolar();
  await espera(ms);
  d.remove();
}

function limparOpcoes() { ops.innerHTML = ''; }

function mostrarOpcoes(lista) {
  limparOpcoes();
  lista.forEach((texto, i) => {
    const b = document.createElement('button');
    b.className = 'op';
    b.type = 'button';
    b.textContent = texto;
    b.style.animationDelay = `${i * 48}ms`;
    b.addEventListener('click', () => responder(texto));
    ops.appendChild(b);
  });
}

function mostrarCampo(rotulo) {
  limparOpcoes();
  const form = document.createElement('form');
  form.className = 'chat__campo';
  form.innerHTML = `
    <input type="text" placeholder="${rotulo}" aria-label="${rotulo}" autocomplete="name" maxlength="60" required>
    <button type="submit" aria-label="Enviar">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>`;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('input', form).value.trim();
    if (v) responder(v);
  });
  ops.appendChild(form);
  setTimeout(() => $('input', form)?.focus({ preventScroll: true }), 260);
}

async function perguntar() {
  const p = ROTEIRO[passo];
  if (!p) return finalizar();

  limparOpcoes();
  await digitando(ritmo(p.fala));
  balao(p.fala);

  if (p.segunda) {
    await espera(160);
    await digitando(ritmo(p.segunda));
    balao(p.segunda);
  }

  // o bot termina de falar e só então oferece a escolha
  await espera(200);
  if (p.opcoes) mostrarOpcoes(p.opcoes);
  else mostrarCampo(p.campo);
}

async function responder(valor) {
  RESPOSTAS[ROTEIRO[passo].chave] = valor;
  limparOpcoes();
  balao(valor, 'eu');
  passo++;
  await espera(300);
  perguntar();
}

function montarMensagem() {
  const l = [
    'Olá! Vim pelo site da Kokiothashi.',
    '',
    `Nome: ${RESPOSTAS.nome || '—'}`,
    `O que preciso: ${RESPOSTAS.servico || '—'}`,
    `Domínio: ${RESPOSTAS.dominio || '—'}`,
    `Quando começar: ${RESPOSTAS.prazo || '—'}`
  ];
  return l.join('\n');
}

function linkZap(texto) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto || 'Olá! Vim pelo site da Kokiothashi.')}`;
}

async function finalizar() {
  await digitando(760);
  const trato = primeiroNome(RESPOSTAS.nome);
  balao(trato ? `Obrigado, ${trato}! Montei o resumo.` : 'Pronto! Montei o resumo.');
  await espera(360);
  await digitando(620);

  const url = linkZap(montarMensagem());
  const bloco = document.createElement('div');
  bloco.className = 'msg msg--zap';
  bloco.innerHTML = `
    <p>É só tocar no botão: o WhatsApp abre com essas informações já escritas.
       Você só precisa apertar enviar.</p>
    <a class="btn btn--claro btn--sm" href="${url}" target="_blank" rel="noopener">
      Abrir conversa no WhatsApp
    </a>`;
  fluxo.appendChild(bloco);
  rolar();

  limparOpcoes();
  await espera(200);
  const reiniciar = document.createElement('button');
  reiniciar.className = 'op';
  reiniciar.type = 'button';
  reiniciar.textContent = 'Recomeçar';
  reiniciar.addEventListener('click', () => {
    passo = 0;
    Object.keys(RESPOSTAS).forEach(k => delete RESPOSTAS[k]);
    fluxo.innerHTML = '';
    grudado = true;
    ultimoTop = 0;
    perguntar();
  });
  ops.appendChild(reiniciar);
}

function abrirChat() {
  chat.hidden = false;
  bolha.classList.add('is-oculta');
  // a bolha só some visualmente (opacity/pointer-events); sem isto ela continua
  // acessível por Tab, mandando o foco para um botão invisível
  bolha.inert = true;
  if (!chatIniciado) { chatIniciado = true; perguntar(); }
  else rolar('instant');   // reabriu no meio da conversa: volta ao fim
  setTimeout(() => $('.chat__x')?.focus(), 120);
}

function fecharChat() {
  chat.hidden = true;
  bolha.classList.remove('is-oculta');
  bolha.inert = false;
  bolha.focus();
}

function montarChat() {
  if (!chat || !fluxo || !ops) return;

  fluxo.addEventListener('scroll', () => {
    const subiu = fluxo.scrollTop < ultimoTop - 1;
    ultimoTop = fluxo.scrollTop;
    if (subiu) grudado = noFundo();
    else if (noFundo()) grudado = true;
  }, { passive: true });

  /* As opções ficam no rodapé, fora do fluxo. Quando entram, o rodapé cresce e
     o fluxo encolhe pela mesma altura — sem reancorar aqui, a última mensagem
     fica escondida sob a borda. Reancora sem animação: o objetivo é a mensagem
     parecer parada enquanto a caixa muda de tamanho embaixo dela. */
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => rolar('instant')).observe(fluxo);
  }

  $$('[data-abrir-chat]').forEach(b => b.addEventListener('click', abrirChat));
  $$('[data-fechar-chat]').forEach(b => b.addEventListener('click', fecharChat));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !chat.hidden) fecharChat();
  });

  // links diretos de WhatsApp fora do chat
  $$('[data-zap]').forEach(a => {
    a.href = linkZap();
    a.target = '_blank';
    a.rel = 'noopener';
  });
}


/* =========================================================================
   7. Ano do rodapé
   ========================================================================= */
function montarAno() {
  const el = $('[data-ano]');
  if (el) el.textContent = new Date().getFullYear();
}


/* ---------- inicialização ---------- */
document.addEventListener('DOMContentLoaded', () => {
  montarPrancha();
  montarRevelacao();
  montarContadores();
  montarCabecalho();
  montarMenu();
  montarChat();
  montarAno();
});
