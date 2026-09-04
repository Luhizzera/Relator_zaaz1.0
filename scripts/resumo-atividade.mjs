// scripts/resumo-atividade.mjs
//
// Gera o par de arquivos da pasta Resumo_atividade/ a partir dos dados vivos
// do Supabase:
//   • Resumo-survey_os.xlsx          — a exportação bruta das OS
//   • Resumo_atividade_SurveyOS.docx — o resumo executivo, com os números
//                                      recalculados a cada execução
//
// Roda fora do navegador, então NÃO herda a sessão do app. Precisa de uma
// conta própria (ver AUTENTICAÇÃO abaixo): com a anon key sozinha o PostgREST
// responde como anônimo, a RLS de `ordens_manutencao` nega tudo e o relatório
// sairia vazio sem erro nenhum — por isso o script aborta se não autenticar.
//
// Uso:  node scripts/resumo-atividade.mjs [--saida <pasta>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle, HeadingLevel,
  Header, Footer, PageNumber, convertMillimetersToTwip,
} from 'docx';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── .env ────────────────────────────────────────────────────────────
// Parse manual em vez de `dotenv`: são quatro chaves e o projeto não tem a
// dependência — não vale acrescentá-la só por isto.
function lerEnv(arquivo) {
  const env = {};
  if (!fs.existsSync(arquivo)) return env;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = { ...lerEnv(path.join(RAIZ, '.env')), ...process.env };

/**
 * Higieniza o que veio de secret do GitHub. Ao contrário do `.env`, que já é
 * parseado linha a linha, um secret é texto colado à mão — e os três erros de
 * colagem abaixo são invisíveis na interface, porque ela mascara o valor:
 *
 *   1. o nome da variável junto:  VITE_SUPABASE_URL=https://…
 *   2. aspas em volta:            "https://…"
 *   3. espaço ou quebra de linha no fim
 *
 * Qualquer um deles fazia o script morrer com um erro que não dizia a causa.
 */
function limpar(nome, valor) {
  if (!valor) return valor;
  let v = String(valor).trim();
  if (v.startsWith(`${nome}=`)) v = v.slice(nome.length + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

const URL_SUPABASE = limpar('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL);
const ANON = limpar('VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY);
const EMAIL = limpar('RESUMO_EMAIL', env.RESUMO_EMAIL);
const SENHA = limpar('RESUMO_SENHA', env.RESUMO_SENHA);

function abortar(msg) {
  console.error('\n[resumo-atividade] ' + msg + '\n');
  process.exit(1);
}

// `--simular <arquivo.json>` gera os dois arquivos a partir de um dump local,
// sem tocar no Supabase. Serve pra conferir formatação e conta sem depender de
// credencial nem de rede — e foi como a geração foi verificada antes de existir
// uma conta de robô.
const idxSimular = process.argv.indexOf('--simular');
const ARQUIVO_SIMULADO = idxSimular > -1 ? process.argv[idxSimular + 1] : null;

if (!ARQUIVO_SIMULADO && (!URL_SUPABASE || !ANON)) abortar('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar no .env (ou nos secrets do GitHub).');

// Valida aqui em vez de deixar o supabase-js estourar lá dentro: o erro dele
// ("Invalid supabaseUrl") não diz de onde veio o valor nem o que ele recebeu,
// o que transforma um erro de colagem numa caça ao tesouro.
if (!ARQUIVO_SIMULADO && !/^https?:\/\//i.test(URL_SUPABASE)) {
  abortar(
    'VITE_SUPABASE_URL não parece uma URL — precisa começar com https://\n\n'
    + `Recebido: "${URL_SUPABASE.slice(0, 30)}${URL_SUPABASE.length > 30 ? '…' : ''}" (${URL_SUPABASE.length} caracteres)\n\n`
    + 'Se veio dos secrets do GitHub, cole SÓ o valor — sem o nome da variável\n'
    + 'antes do "=", sem aspas e sem quebra de linha. O correto se parece com:\n'
    + '  https://xxxxxxxxxxxx.supabase.co',
  );
}

// Dois formatos válidos: o JWT clássico (começa com "eyJ") e a chave
// publicável nova do Supabase ("sb_publishable_…"). Aceita os dois pra que
// uma migração de formato não derrube a rotina com erro enganoso.
if (!ARQUIVO_SIMULADO && !/^(eyJ|sb_)/.test(ANON)) {
  abortar(
    'VITE_SUPABASE_ANON_KEY não parece uma chave válida — deveria começar com "eyJ" ou "sb_".\n\n'
    + `Recebido: "${ANON.slice(0, 12)}…" (${ANON.length} caracteres)\n\n`
    + 'Cole só o valor, sem o nome da variável e sem aspas.',
  );
}
if (!ARQUIVO_SIMULADO && (!EMAIL || !SENHA)) {
  abortar(
    'Faltam as credenciais da conta de relatório.\n'
    + 'Acrescente ao .env (que já é ignorado pelo git):\n\n'
    + '  RESUMO_EMAIL=conta-relatorio@zaaztelecom.com.br\n'
    + '  RESUMO_SENHA=...\n\n'
    + 'Use uma conta de GESTOR dedicada a isto — a RLS exige gestor ou\n'
    + 'supervisor para enxergar todas as OS, e uma conta separada mantém o\n'
    + 'histórico do robô distinto do seu usuário.',
  );
}

// ── Domínio ─────────────────────────────────────────────────────────
// Espelham types/manutencao.ts. Duplicados aqui de propósito: este script
// roda em Node puro, sem o pipeline do Vite que resolve o alias `@/`.
const STATUS_LABEL = {
  aberta: 'Aberta', atribuida: 'Atribuída', recebida: 'Recebida',
  deslocamento: 'Em deslocamento', no_local: 'No local', em_execucao: 'Em execução',
  pausada: 'Pausada', finalizada: 'Finalizada', aprovada: 'Encerrada',
  reaberta: 'Retrabalho', cancelada: 'Cancelada', concluida: 'Concluída',
};
const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };

/** Mesma definição de "concluídas" do dashboard (ManutencaoDashboard.tsx). */
const ENCERRADOS = ['concluida', 'aprovada', 'finalizada'];
const FORA_DO_FLUXO = [...ENCERRADOS, 'cancelada'];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const porExtenso = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
/**
 * "Segunda-feira, 2 de setembro de 2026" — o dia da semana entra porque a
 * rotina roda em cadência fixa (seg/qua/sex) e o e-mail é o registro durável
 * de cada rodada. Com ele, pular uma quarta salta aos olhos na caixa de
 * entrada; só com a data numérica, não.
 */
const comDiaDaSemana = (d) => {
  const dia = DIAS[d.getDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${porExtenso(d)}`;
};

/** "1 ordem" / "3 ordens" — o "(s)" genérico empobrece um documento executivo. */
const plural = (n, singular, plural_) => `${n} ${n === 1 ? singular : plural_}`;

// ── Coleta ──────────────────────────────────────────────────────────
async function coletar() {
  const supabase = createClient(URL_SUPABASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email: EMAIL, password: SENHA });
  if (erroLogin) abortar(`Não foi possível autenticar como ${EMAIL}: ${erroLogin.message}`);

  const { data, error } = await supabase
    .from('ordens_manutencao')
    .select('*, tecnico:tecnico_id ( nome ), equipe:equipe_id ( nome )')
    .order('created_at', { ascending: false });
  if (error) abortar(`Falha ao ler as ordens: ${error.message}`);

  // Zero linhas com login OK quase sempre significa conta sem permissão de
  // gestor/supervisor — vale barrar aqui em vez de gerar um relatório vazio
  // que passaria por "mês sem atividade".
  if (!data || data.length === 0) {
    abortar(`A consulta voltou vazia. Confirme que ${EMAIL} tem papel de gestor ou supervisor.`);
  }

  await supabase.auth.signOut();
  return data.map((o) => ({
    numero: o.numero,
    status: o.status,
    prioridade: o.prioridade,
    solicitante: o.solicitante ?? '',
    uf: (o.uf ?? '').toUpperCase(),
    municipio: o.municipio ?? '',
    bairro: o.bairro ?? '',
    endereco: `${o.endereco ?? ''}${o.numero_endereco ? `, ${o.numero_endereco}` : ''}`,
    latitude: o.latitude,
    longitude: o.longitude,
    equipe: o.equipe?.nome ?? '',
    tecnico: o.tecnico?.nome ?? '',
    tecnicoId: o.tecnico_id,
    dataPrevista: o.data_prevista ? new Date(`${o.data_prevista}T00:00:00`) : null,
    createdAt: new Date(o.created_at),
  }));
}

// ── Métricas ────────────────────────────────────────────────────────
function apurar(ordens, agora) {
  const vencida = (o) => !!o.dataPrevista && o.dataPrevista < agora && !FORA_DO_FLUXO.includes(o.status);
  const dias = (o) => Math.floor((agora - o.createdAt) / 86400000);

  const porUf = {};
  for (const o of ordens) {
    const uf = o.uf || '—';
    porUf[uf] ??= { uf, total: 0, comTecnico: 0, encerradas: 0, semTecnico: [], cidades: new Set() };
    const r = porUf[uf];
    r.total += 1;
    if (o.tecnicoId) r.comTecnico += 1; else r.semTecnico.push(o);
    if (ENCERRADOS.includes(o.status)) r.encerradas += 1;
    if (o.municipio) r.cidades.add(o.municipio);
  }

  const regioes = Object.values(porUf)
    .map((r) => ({
      ...r,
      proporcao: r.total ? r.comTecnico / r.total : 0,
      situacao: r.comTecnico === 0 ? 'Parado' : (r.comTecnico / r.total >= 0.7 ? 'Operando' : 'Parcial'),
    }))
    .sort((a, b) => b.total - a.total);

  // O foco do panorama acompanha o problema em vez de ficar preso ao Paraná:
  // se a região travada mudar, o relatório aponta pra outra sozinho.
  const foco = [...regioes].sort((a, b) => b.semTecnico.length - a.semTecnico.length)[0];
  const esperas = foco.semTecnico.map(dias).sort((a, b) => a - b);
  const maisAntiga = foco.semTecnico.reduce((pior, o) => (!pior || o.createdAt < pior.createdAt ? o : pior), null);

  return {
    total: ordens.length,
    encerradas: ordens.filter((o) => ENCERRADOS.includes(o.status)).length,
    semTecnico: ordens.filter((o) => !o.tecnicoId).length,
    vencidas: ordens.filter(vencida).length,
    regioes,
    foco: {
      uf: foco.uf,
      semTecnico: foco.semTecnico.length,
      // Cidades DAS ORDENS SEM TÉCNICO, não da região inteira. Contar a região
      // produzia frases impossíveis ("6 ordens abertas em 9 cidades") assim que
      // parte do backlog era delegada.
      cidades: new Set(foco.semTecnico.map((o) => o.municipio).filter(Boolean)).size,
      // Distingue "região sem nenhum técnico cadastrado" de "região com técnico,
      // mas com fila sobrando" — a explicação do panorama muda por completo.
      semNenhumTecnico: foco.comTecnico === 0,
      esperaMedia: esperas.length ? (esperas.reduce((s, d) => s + d, 0) / esperas.length) : 0,
      maisAntigaDias: maisAntiga ? dias(maisAntiga) : 0,
      maisAntigaNumero: maisAntiga?.numero ?? '—',
      maisAntigaCidade: maisAntiga?.municipio ?? '—',
      vencidas: foco.semTecnico.filter(vencida).length,
      alta: foco.semTecnico.filter((o) => o.prioridade === 'alta' || o.prioridade === 'critica').length,
    },
  };
}

// ── Excel ───────────────────────────────────────────────────────────
async function gerarXlsx(ordens, destino) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SurveyOS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Ordens de Manutenção', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Mesmas colunas do botão Excel da tela de Ordens, pra planilha automática
  // e manual serem intercambiáveis.
  const colunas = [
    ['Número', 'numero', 16], ['Status', 'status', 20], ['Prioridade', 'prioridade', 12],
    ['Solicitante', 'solicitante', 22], ['UF', 'uf', 8], ['Cidade', 'cidade', 18],
    ['Bairro', 'bairro', 18], ['Endereço', 'endereco', 30], ['UTM', 'utm', 24],
    ['Equipe', 'equipe', 16], ['Técnico', 'tecnico', 20],
    ['Prazo', 'prazo', 14, 'date'], ['Abertura', 'abertura', 14, 'date'],
  ];
  ws.columns = colunas.map(([header, key, width, tipo]) => ({
    header, key, width, style: tipo === 'date' ? { numFmt: 'dd/mm/yyyy' } : undefined,
  }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F68' } };
  ws.getRow(1).alignment = { vertical: 'middle' };

  for (const o of ordens) {
    ws.addRow({
      numero: o.numero,
      status: STATUS_LABEL[o.status] ?? o.status,
      prioridade: PRIORIDADE_LABEL[o.prioridade] ?? o.prioridade,
      solicitante: o.solicitante,
      uf: o.uf,
      cidade: o.municipio,
      bairro: o.bairro,
      endereco: o.endereco,
      utm: o.latitude != null && o.longitude != null ? `${o.latitude.toFixed(6)}, ${o.longitude.toFixed(6)}` : '',
      equipe: o.equipe,
      tecnico: o.tecnico,
      prazo: o.dataPrevista,
      abertura: o.createdAt,
    });
  }

  await wb.xlsx.writeFile(destino);
}

// ── Word ────────────────────────────────────────────────────────────
const TEAL = '1F6F68', INK = '101618', SOFT = '37454A', MUTED = '667A80';
const OK = '1B7A4B', ALERTA = 'A32D46', ATENCAO = '9A6212', RULE = 'D6DEDF';
const WASH_ALERTA = 'F8E5E9';
const SERIF = 'Georgia', SANS = 'Calibri';
const LARGURA = 9638;

const borda = (cor = RULE) => ({
  top: { style: BorderStyle.SINGLE, size: 4, color: cor },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: cor },
  left: { style: BorderStyle.SINGLE, size: 4, color: cor },
  right: { style: BorderStyle.SINGLE, size: 4, color: cor },
});

const par = (children, opts = {}) => new Paragraph({
  children, spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: opts.line ?? 276 },
  alignment: opts.alignment, border: opts.border,
});
const run = (text, o = {}) => new TextRun({
  text, font: o.font ?? SANS, size: o.size ?? 20, bold: o.bold, color: o.color ?? INK,
});
const cel = (largura, filhos, o = {}) => new TableCell({
  width: { size: largura, type: WidthType.DXA },
  shading: o.fundo ? { type: ShadingType.CLEAR, fill: o.fundo, color: 'auto' } : undefined,
  borders: o.borders ?? borda(),
  margins: { top: 120, bottom: 120, left: 140, right: 140 },
  children: filhos,
});

function gerarDocx(m, agora, destino) {
  const q = [2410, 2410, 2409, 2409];
  const bloco = (largura, valor, rotulo, cor) => cel(largura, [
    par([new TextRun({ text: String(valor), font: SERIF, size: 44, bold: true, color: cor })], { after: 40, line: 240 }),
    par([new TextRun({ text: rotulo.toUpperCase(), font: SANS, size: 14, bold: true, color: MUTED, characterSpacing: 12 })], { after: 0, line: 200 }),
  ]);

  const placar = new Table({
    columnWidths: q, width: { size: LARGURA, type: WidthType.DXA },
    rows: [new TableRow({ children: [
      bloco(q[0], m.total, 'Ordens no período', INK),
      bloco(q[1], m.encerradas, 'Encerradas', OK),
      bloco(q[2], m.semTecnico, 'Sem técnico', ALERTA),
      bloco(q[3], m.vencidas, 'Prazo vencido', ALERTA),
    ] })],
  });

  // Larguras dividem o restante entre as regiões que existirem no período —
  // fixar três colunas quebraria se uma UF nova aparecesse.
  const rotuloLargura = 2438;
  const colUf = Math.floor((LARGURA - rotuloLargura) / m.regioes.length);
  const largRegioes = [rotuloLargura, ...m.regioes.map((_, i) => (i === m.regioes.length - 1
    ? LARGURA - rotuloLargura - colUf * (m.regioes.length - 1) : colUf))];

  const corSituacao = { Operando: OK, Parcial: ATENCAO, Parado: ALERTA };
  const linha = (rotulo, valores, destaque) => new TableRow({
    children: [
      cel(largRegioes[0], [par([run(rotulo, { size: 19, color: SOFT })], { after: 0 })]),
      ...valores.map((v, i) => cel(largRegioes[i + 1], [
        par([new TextRun({ text: String(v.texto), font: destaque ? SERIF : SANS, size: destaque ? 24 : 19, bold: true, color: v.cor ?? INK })],
          { after: 0, alignment: AlignmentType.CENTER }),
      ], { fundo: v.fundo })),
    ],
  });

  const tabela = new Table({
    columnWidths: largRegioes, width: { size: LARGURA, type: WidthType.DXA },
    rows: [
      new TableRow({ children: [
        cel(largRegioes[0], [par([run('', { size: 18 })], { after: 0 })], { fundo: TEAL }),
        ...m.regioes.map((r, i) => cel(largRegioes[i + 1], [
          par([new TextRun({ text: r.uf, font: SERIF, size: 24, bold: true, color: 'FFFFFF' })], { after: 0, alignment: AlignmentType.CENTER }),
        ], { fundo: TEAL })),
      ] }),
      linha('Situação', m.regioes.map((r) => ({
        texto: r.situacao, cor: corSituacao[r.situacao], fundo: r.situacao === 'Parado' ? WASH_ALERTA : undefined,
      }))),
      linha('Ordens no período', m.regioes.map((r) => ({ texto: r.total })), true),
      linha('Com técnico atribuído', m.regioes.map((r) => ({
        texto: r.comTecnico, cor: r.comTecnico === 0 ? ALERTA : OK, fundo: r.comTecnico === 0 ? WASH_ALERTA : undefined,
      })), true),
      linha('Encerradas', m.regioes.map((r) => ({
        texto: r.encerradas, cor: r.encerradas === 0 ? ALERTA : OK, fundo: r.encerradas === 0 ? WASH_ALERTA : undefined,
      })), true),
    ],
  });

  const f = m.foco;
  const fato = (largura, n, t) => cel(largura, [
    par([new TextRun({ text: n, font: SERIF, size: 30, bold: true, color: ALERTA })], { after: 30, line: 240 }),
    par([new TextRun({ text: t, font: SANS, size: 16, color: SOFT })], { after: 0, line: 220 }),
  ], { fundo: WASH_ALERTA, borders: borda('E9C4CD') });

  const fatos = new Table({
    columnWidths: q, width: { size: LARGURA, type: WidthType.DXA },
    rows: [new TableRow({ children: [
      fato(q[0], f.esperaMedia.toFixed(1).replace('.', ','), 'dias de espera, em média'),
      fato(q[1], String(f.maisAntigaDias), `dias da mais antiga (${f.maisAntigaNumero}, ${f.maisAntigaCidade})`),
      fato(q[2], String(f.vencidas), 'já com prazo vencido'),
      fato(q[3], String(f.alta), 'de prioridade alta'),
    ] })],
  });

  const caixa = (filhos, fundo) => new Table({
    columnWidths: [LARGURA], width: { size: LARGURA, type: WidthType.DXA },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: LARGURA, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: fundo, color: 'auto' },
      borders: borda(), margins: { top: 200, bottom: 200, left: 220, right: 220 }, children: filhos,
    })] })],
  });

  const operando = m.regioes.filter((r) => r.situacao === 'Operando');
  const paradas = m.regioes.filter((r) => r.situacao === 'Parado');
  const veredito = [
    `Das ${m.total} ordens avaliadas, ${m.encerradas} foram encerradas. `,
    operando.length
      ? `${operando.map((r) => `${r.uf} concluiu ${r.encerradas} das ${r.total} abertas na região`).join('; ')}. `
      : '',
    paradas.length
      ? `${paradas.map((r) => r.uf).join(' e ')} ${paradas.length > 1 ? 'não registram' : 'não registra'} técnico atribuído em nenhuma ordem, e por isso ${paradas.length > 1 ? 'seguem' : 'segue'} sem execução.`
      : 'Todas as regiões têm técnico atribuído em ao menos uma ordem.',
  ].join('');

  const doc = new Document({
    styles: { default: { document: { run: { font: SANS, size: 20, color: INK } } } },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838 },
        margin: {
          top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20),
          left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20),
        },
      } },
      headers: { default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } },
        children: [run('SurveyOS · Relatório de adoção', { size: 16, color: MUTED })],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], font: SANS, size: 16, color: MUTED })],
      })] }) },
      children: [
        par([new TextRun({ text: 'RELATÓRIO DE ADOÇÃO · SURVEYOS', font: SANS, size: 16, bold: true, color: TEAL, characterSpacing: 30 })], { after: 100 }),
        new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: 'Adoção do SurveyOS', font: SERIF, size: 52, bold: true, color: INK })] }),
        par([run(`Posição em ${porExtenso(agora)}   ·   ${m.total} ordens de serviço avaliadas   ·   Redes — ${m.regioes.map((r) => r.uf).join(', ')}`, { size: 18, color: MUTED })], {
          after: 260, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
        }),
        caixa([par([new TextRun({ text: veredito, font: SERIF, size: 24, color: INK })], { after: 0, line: 320 })], 'FFFFFF'),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        placar,
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 140 },
          children: [new TextRun({ text: 'O contraste entre as regiões', font: SERIF, size: 26, bold: true, color: INK })] }),
        par([run(m.regioes.map((r) => `${r.uf} tem técnico atribuído em ${r.comTecnico} das ${plural(r.total, 'ordem', 'ordens')}, com ${plural(r.encerradas, 'encerrada', 'encerradas')}`).join('. ') + '.', { color: SOFT })], { after: 200 }),
        tabela,
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 140 },
          children: [new TextRun({ text: `Panorama do ${f.uf} no período`, font: SERIF, size: 26, bold: true, color: INK })] }),
        par([run(`${plural(f.semTecnico, 'ordem está aberta', 'ordens estão abertas')} em ${plural(f.cidades, 'cidade', 'cidades')}, sem técnico atribuído. `
          + (f.semNenhumTecnico
            ? 'O registro foi realizado pelos técnicos de LA por meio do aplicativo; não há técnicos de rede cadastrados na região para delegação.'
            : 'A região já tem técnicos atuando, então o que resta é fila de delegação pendente, não falta de cadastro.'), { color: SOFT })], { after: 200 }),
        fatos,
      ],
    }],
  });

  return Packer.toBuffer(doc).then((buf) => fs.writeFileSync(destino, buf));
}

// ── Execução ────────────────────────────────────────────────────────
const argSaida = process.argv.indexOf('--saida');
const PASTA = argSaida > -1 ? path.resolve(process.argv[argSaida + 1]) : path.join(RAIZ, 'Resumo_atividade');

const agora = new Date();
console.log(`[resumo-atividade] ${agora.toISOString()} — iniciando`);

fs.mkdirSync(PASTA, { recursive: true });

const ordens = ARQUIVO_SIMULADO
  ? JSON.parse(fs.readFileSync(ARQUIVO_SIMULADO, 'utf8')).map((o) => ({
    ...o,
    dataPrevista: o.dataPrevista ? new Date(o.dataPrevista) : null,
    createdAt: new Date(o.createdAt),
  }))
  : await coletar();
console.log(`[resumo-atividade] ${ordens.length} ordens lidas${ARQUIVO_SIMULADO ? ' (simulação)' : ''}`);

const metricas = apurar(ordens, agora);

/**
 * Sufixo AAAAMMDD — a data em que o retrato foi tirado, que é a informação
 * que alguém procura ao abrir a pasta meses depois. Um contador sequencial
 * diria a ordem, mas não a época.
 *
 * Rodar duas vezes no mesmo dia SOBRESCREVE o arquivo daquele dia, de
 * propósito: o arquivo representa "o resumo do dia 02/09", não "a execução
 * das 8h03". Uma reexecução manual atualiza aquele retrato com dados mais
 * frescos, em vez de deixar dois arquivos do mesmo dia divergindo.
 *
 * Usa a data LOCAL, a mesma que aparece escrita no documento — no workflow o
 * fuso é fixado em America/Sao_Paulo pra que nome e conteúdo não discordem
 * quando a execução cai perto da virada do dia em UTC.
 *
 * A planilha leva o mesmo sufixo de propósito. Se só o .docx fosse datado, o
 * relatório de 02/09 ficaria ao lado de uma planilha sobrescrita e não haveria
 * como saber quais dados o geraram — que é justamente o ponto de datar.
 */
const carimbo = [
  agora.getFullYear(),
  String(agora.getMonth() + 1).padStart(2, '0'),
  String(agora.getDate()).padStart(2, '0'),
].join('');

const destinoXlsx = path.join(PASTA, `Resumo-survey_os_${carimbo}.xlsx`);
const destinoDocx = path.join(PASTA, `Resumo_atividade_SurveyOS_${carimbo}.docx`);

await gerarXlsx(ordens, destinoXlsx);
await gerarDocx(metricas, agora, destinoDocx);

console.log(`[resumo-atividade] ${carimbo} — ${metricas.total} OS · ${metricas.encerradas} encerradas · `
  + `${metricas.semTecnico} sem técnico · foco em ${metricas.foco.uf}`);
console.log(`[resumo-atividade] ${destinoXlsx}`);
console.log(`[resumo-atividade] ${destinoDocx}`);

// Publica os caminhos pro workflow: como o nome muda a cada execução, o passo
// de e-mail não tem como saber o que anexar sem isto.
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, [
    `carimbo=${carimbo}`,
    `data=${porExtenso(agora)}`,
    `dataCompleta=${comDiaDaSemana(agora)}`,
    `docx=${destinoDocx}`,
    `xlsx=${destinoXlsx}`,
    '',
  ].join('\n'));
}

// `--sumario <arquivo.html>` grava o corpo do e-mail. Fica aqui, e não no
// workflow, porque só este script conhece os números — o YAML teria que
// reparsear os arquivos gerados pra dizer a mesma coisa.
const idxSumario = process.argv.indexOf('--sumario');
if (idxSumario > -1) {
  const m = metricas;
  const f = m.foco;
  const linhaRegiao = (r) => `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e6ecec"><b>${r.uf}</b></td>
      <td style="padding:6px 12px;border-bottom:1px solid #e6ecec;color:${
  r.situacao === 'Parado' ? '#a32d46' : r.situacao === 'Operando' ? '#1b7a4b' : '#9a6212'}"><b>${r.situacao}</b></td>
      <td style="padding:6px 12px;border-bottom:1px solid #e6ecec;text-align:right">${r.total}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e6ecec;text-align:right">${r.comTecnico}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e6ecec;text-align:right">${r.encerradas}</td>
    </tr>`;

  // HTML de e-mail: tabela com estilo inline e sem CSS externo, que é o único
  // subconjunto que Outlook e Gmail renderizam de forma previsível.
  const html = `<div style="font-family:Segoe UI,Calibri,sans-serif;color:#101618;max-width:640px">
  <p style="font-size:11px;font-weight:700;letter-spacing:2px;color:#1f6f68;margin:0 0 4px">RELATÓRIO DE ADOÇÃO · SURVEYOS</p>
  <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 4px">Adoção do SurveyOS</h2>
  <p style="color:#667a80;font-size:13px;margin:0 0 16px">${comDiaDaSemana(agora)}</p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 18px">
    <b>${m.total}</b> ordens no período · <b style="color:#1b7a4b">${m.encerradas}</b> encerradas ·
    <b style="color:#a32d46">${m.semTecnico}</b> sem técnico · <b style="color:#a32d46">${m.vencidas}</b> com prazo vencido
  </p>
  <table style="border-collapse:collapse;font-size:13px;width:100%;margin-bottom:18px">
    <tr style="background:#1f6f68;color:#fff">
      <th style="padding:8px 12px;text-align:left">UF</th>
      <th style="padding:8px 12px;text-align:left">Situação</th>
      <th style="padding:8px 12px;text-align:right">Ordens</th>
      <th style="padding:8px 12px;text-align:right">Com técnico</th>
      <th style="padding:8px 12px;text-align:right">Encerradas</th>
    </tr>
    ${m.regioes.map(linhaRegiao).join('\n    ')}
  </table>
  <p style="font-size:14px;line-height:1.5;margin:0 0 18px">
    <b>Atenção em ${f.uf}:</b> ${plural(f.semTecnico, 'ordem aberta', 'ordens abertas')} em
    ${plural(f.cidades, 'cidade', 'cidades')} sem técnico atribuído, ${f.esperaMedia.toFixed(1).replace('.', ',')} dias
    de espera em média e ${plural(f.vencidas, 'já vencida', 'já vencidas')}.
  </p>
  <p style="color:#667a80;font-size:12px;margin:0">
    Planilha e documento completos em anexo. Gerado automaticamente pelo SurveyOS — não responda a este e-mail.
  </p>
</div>`;
  fs.writeFileSync(process.argv[idxSumario + 1], html, 'utf8');
}
