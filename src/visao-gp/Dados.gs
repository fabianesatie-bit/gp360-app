//=============================================================================
// GP 360 v2 - CAMADA DE DADOS
//  - lê cada aba POR NOME DE COLUNA (reordenar/inserir colunas não quebra nada)
//  - lê só as colunas declaradas no schema (qualquer coluna extra, sensível ou não, nunca chega ao portal)
//  - converte números/datas PT-BR, cache gzip em chunks, filtro por REGIONAL do usuário (falha fechada)
//=============================================================================

function doGet() {
    return HtmlService.createHtmlOutputFromFile('Index').setTitle('GP 360 - Portal')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function dbId_() {
    const id = PropertiesService.getScriptProperties().getProperty('DB_ID');
    if (!id) throw new Error('Banco de dados não configurado. Rode criarBaseGP360() ou configurarBase(id).');
    return id;
}

// ---------------------------------------------------------------------------
// CONVERSÃO DE TIPOS
// ---------------------------------------------------------------------------

/** "89,9" -> 89.9 | "1.234,56" -> 1234.56 | "12%" -> 12 | "R$ 10" -> 10 | vazio/inválido -> null */
function numeroPtBr_(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) return null;
    let s = String(v).trim().replace(/[R$%\s]/g, '');
    if (!s || s === '-') return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return isFinite(n) ? n : null;
}

function dataIso_(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
}

function dataHoraIso_(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
    const s = String(v).trim();
    let m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/);
    if (m) return `${m[1]}T${m[2]}${m[3] || ':00'}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '0').padStart(2, '0')}:${m[5] || '00'}:${m[6] || '00'}`;
    const d = dataIso_(v);
    return d ? d + 'T00:00:00' : null;
}

function mesIso_(v) {
    if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM');
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
    const d = dataIso_(v);
    return d ? d.substring(0, 7) : null;
}

function coagir_(v, tipo) {
    const vazio = v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    if (vazio) return tipo === 'lista' ? [] : null;
    switch (tipo) {
        case 'int': { const n = numeroPtBr_(v); return n === null ? null : Math.trunc(n); }
        case 'num': return numeroPtBr_(v);
        case 'data': return dataIso_(v);
        case 'datahora': return dataHoraIso_(v);
        case 'mes': return mesIso_(v);
        case 'bool': return v === true || ['SIM', 'S', 'TRUE', '1', 'X', 'VERDADEIRO'].includes(String(v).trim().toUpperCase());
        case 'email': return String(v).trim().toLowerCase();
        case 'lista': return String(v).split(/[;,]/).map(s => s.trim()).filter(Boolean);
        default: return String(v).trim();
    }
}

/** Chave de comparação de regional: sem acento, caixa alta, espaços normalizados. */
function chaveReg_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim(); }

// ---------------------------------------------------------------------------
// LEITURA DA PLANILHA
// ---------------------------------------------------------------------------

function lerTabela_(nome) {
    const def = TABELAS[nome];
    if (!def) throw new Error('Tabela desconhecida: ' + nome);
    const sh = SpreadsheetApp.openById(dbId_()).getSheetByName(nome);
    if (!sh) throw new Error(`Aba "${nome}" não encontrada no banco de dados.`);
    const lc = sh.getLastColumn(), lr = sh.getLastRow();
    if (lc < 1) throw new Error(`Aba "${nome}" está vazia (sem cabeçalho).`);
    const hdr = sh.getRange(1, 1, 1, lc).getValues()[0];
    const idx = {};
    hdr.forEach((h, i) => { const k = String(h).trim(); if (k && !(k in idx)) idx[k] = i; });

    const ausentes = def.colunas.filter(x => x.req && !(x.n in idx)).map(x => x.n);
    if (ausentes.length) throw new Error(`Aba "${nome}": coluna(s) obrigatória(s) ausente(s): ${ausentes.join(', ')}.`);
    if (lr < 2) return [];

    const cols = def.colunas.filter(x => x.n in idx);
    const maxC = Math.max.apply(null, cols.map(x => idx[x.n])) + 1;
    const dados = sh.getRange(2, 1, lr - 1, maxC).getValues();
    const out = [];
    for (let i = 0; i < dados.length; i++) {
        const r = dados[i], o = {};
        for (let j = 0; j < cols.length; j++) o[cols[j].n] = coagir_(r[idx[cols[j].n]], cols[j].t);
        if (def.chave.some(k => o[k] === null || o[k] === undefined || o[k] === '')) continue;   // linha vazia/incompleta
        def.colunas.forEach(x => { if (!(x.n in o)) o[x.n] = x.t === 'lista' ? [] : null; });
        out.push(o);
    }
    return out;
}

function lerListas_() {
    const sh = SpreadsheetApp.openById(dbId_()).getSheetByName('config_listas');
    if (!sh) return LISTAS_PADRAO;
    const lc = sh.getLastColumn(), lr = sh.getLastRow();
    if (lc < 1 || lr < 1) return {};
    const v = sh.getRange(1, 1, lr, lc).getValues(), out = {};
    for (let j = 0; j < lc; j++) {
        const nome = String(v[0][j] || '').trim(); if (!nome) continue;
        out[nome] = []; for (let i = 1; i < v.length; i++) if (String(v[i][j]).trim() !== '') out[nome].push(String(v[i][j]).trim());
    }
    return out;
}

// ---------------------------------------------------------------------------
// CACHE (gzip + base64, chunks de 90 KB) + gatilho
// ---------------------------------------------------------------------------

const CACHE_TTL = 21600;
const CHUNK = 90000;
const chaveCache_ = nome => `GP360_v${SCHEMA_VERSAO}_${nome}`;

function cachePut_(key, obj) {
    const gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json', 'c.json'));
    const b64 = Utilities.base64Encode(gz.getBytes()), n = Math.ceil(b64.length / CHUNK), parts = {};
    for (let i = 0; i < n; i++) parts[key + '_' + i] = b64.substr(i * CHUNK, CHUNK);
    parts[key + '_n'] = String(n);
    CacheService.getScriptCache().putAll(parts, CACHE_TTL);
}

function cacheGet_(key) {
    const c = CacheService.getScriptCache(), n = Number(c.get(key + '_n'));
    if (!n) return null;
    const keys = []; for (let i = 0; i < n; i++) keys.push(key + '_' + i);
    const got = c.getAll(keys); let b64 = '';
    for (let i = 0; i < n; i++) { if (got[keys[i]] == null) return null; b64 += got[keys[i]]; }
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip', 'c.gz')).getDataAsString());
}

/** Só a identidade do dono grava cache (evita cache "envenenado" por execução sem permissão). */
function podeGravarCache_() {
    try {
        const dono = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
        return !!dono && Session.getEffectiveUser().getEmail().toLowerCase() === dono.toLowerCase();
    } catch (e) { return false; }
}

function obterTabela_(nome) {
    const key = chaveCache_(nome);
    const hit = cacheGet_(key);
    if (hit) return hit;
    const dados = lerTabela_(nome);
    if (podeGravarCache_()) { try { cachePut_(key, dados); } catch (e) { console.warn('cache ' + nome + ': ' + e.message); } }
    return dados;
}

function obterListas_() {
    const key = chaveCache_('_listas'), hit = cacheGet_(key);
    if (hit) return hit;
    const l = lerListas_();
    if (podeGravarCache_()) { try { cachePut_(key, l); } catch (e) {} }
    return l;
}

/** GATILHO (10 em 10 min): relê tudo e renova o cache. */
function atualizarCache() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return;
    try {
        validarSchema_();
        Object.keys(TABELAS).forEach(t => { if (TABELAS[t].escopo.tipo !== 'nenhum') cachePut_(chaveCache_(t), lerTabela_(t)); });
        cachePut_(chaveCache_('_listas'), lerListas_());
        console.log('[GP360] Cache renovado.');
    } finally { lock.releaseLock(); }
}

/** RODAR UMA VEZ pelo dono: registra o dono, cria o gatilho e aquece o cache. */
function instalarGatilhos() {
    PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', Session.getEffectiveUser().getEmail());
    ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'atualizarCache') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('atualizarCache').timeBased().everyMinutes(10).create();
    atualizarCache();
}

// ---------------------------------------------------------------------------
// ACESSO: contexto do usuário e filtro por REGIONAL
// ---------------------------------------------------------------------------

class AcessoNegado extends Error { }

function emailAtivo_() { try { return Session.getActiveUser().getEmail().toLowerCase().trim(); } catch (e) { return ''; } }

/** Resolve quem é o usuário e o que ele pode ver. Falha fechada: sem cadastro ativo ou sem regional => negado. */
function contextoUsuario_(email) {
    const u = obterTabela_('usuarios').find(x => x.email === email);
    if (!email || !u) throw new AcessoNegado(`Conta (${email || 'desconhecida'}) sem cadastro no portal. Solicite acesso ao GP.`);
    if (u.ativo !== true) throw new AcessoNegado('Seu acesso está inativo. Solicite reativação ao GP.');
    if (!PERFIS.includes(u.perfil)) throw new AcessoNegado('Perfil de acesso inválido no cadastro. Procure o GP.');
    const regs = new Set((u.regionais || []).map(chaveReg_));
    const global = PERFIS_GLOBAIS.includes(u.perfil) || regs.has('TODAS');
    if (!global && regs.size === 0) throw new AcessoNegado('Seu cadastro não tem regional autorizada. Solicite liberação ao GP.');

    const lojaReg = new Map(), filiais = new Set();
    obterTabela_('lojas').forEach(l => {
        const r = chaveReg_(l.regional);
        lojaReg.set(l.filial_id, r);
        if (global || regs.has(r)) filiais.add(l.filial_id);
    });
    return { email: email, nome: u.nome, perfil: u.perfil, global: global, regs: regs, filiais: filiais, lojaReg: lojaReg };
}

function visiveis_(nome, ctx, memo) {
    if (memo[nome]) return memo[nome];
    const def = TABELAS[nome], e = def.escopo, rows = obterTabela_(nome);
    let out;
    switch (e.tipo) {
        case 'global': out = rows; break;
        case 'nenhum': out = []; break;
        case 'regional': out = ctx.global ? rows : rows.filter(r => ctx.regs.has(chaveReg_(r[e.campo]))); break;
        case 'filial': out = ctx.global ? rows : rows.filter(r => ctx.filiais.has(r[e.campo])); break;
        case 'regionais_lista':
            out = ctx.global ? rows : rows.filter(r => (r[e.campo] || []).some(x => { const k = chaveReg_(x); return k === 'TODAS' || ctx.regs.has(k); }));
            break;
        case 'indicador':
            out = ctx.global ? rows : rows.filter(r => r.nivel === 'FILIAL' ? ctx.filiais.has(r.filial_id) : r.nivel === 'REGIONAL' ? ctx.regs.has(chaveReg_(r.regional)) : false);
            break;
        case 'destino':
            out = ctx.global ? rows : rows.filter(r => {
                if (r.coordenador_email === ctx.email) return true;                       // o autor sempre vê o próprio lançamento
                if (r.tipo_destino === 'FILIAL') return ctx.filiais.has(r.filial_id);
                if (r.tipo_destino === 'REGIONAL') return regionaisDe_(r.regional).some(k => ctx.regs.has(k));       // pode cobrir várias regionais ("A; B; C")
                return false;                                                             // AVULSO: só o autor
            });
            break;
        case 'pai': {
            const ids = new Set(visiveis_(e.tabela, ctx, memo).map(p => p[e.fk]));
            out = rows.filter(r => ids.has(r[e.fk]));
            break;
        }
        default: out = [];                                                                // tipo desconhecido => nega
    }
    memo[nome] = out;
    return out;
}

/** "RIBEIRÃO PRETO; BAURU" -> ['RIBEIRAO PRETO', 'BAURU'] (chaves normalizadas). */
function regionaisDe_(v) { return String(v || '').split(/[;]/).map(chaveReg_).filter(Boolean); }

/** Remove colunas internas antes de enviar ao navegador. */
function projetar_(nome, rows) {
    const ocultas = TABELAS[nome].colunas.filter(x => x.interna).map(x => x.n);
    if (!ocultas.length) return rows;
    return rows.map(r => { const o = Object.assign({}, r); ocultas.forEach(k => delete o[k]); return o; });
}

// ---------------------------------------------------------------------------
// API PARA AS PÁGINAS
// ---------------------------------------------------------------------------

function paginasPermitidas_(perfil) {
    return Object.keys(PAGINAS).filter(p => PAGINAS[p].perfis.includes(perfil)).map(p => ({ id: p, titulo: PAGINAS[p].titulo }));
}

function resumoContexto_(ctx) {
    return { email: ctx.email, nome: ctx.nome, perfil: ctx.perfil, global: ctx.global, regionais: ctx.global ? ['TODAS'] : Array.from(ctx.regs), paginas: paginasPermitidas_(ctx.perfil) };
}

function respostaErro_(e) {
    if (e instanceof AcessoNegado) return JSON.stringify({ sucesso: false, acessoNegado: true, erro: e.message });
    console.error('[GP360] ' + (e && e.stack || e));
    return JSON.stringify({ sucesso: false, erro: 'Erro ao carregar os dados: ' + (e && e.message || e) });
}

/** Menu/identidade: chamado ao abrir o portal. */
function obterContexto() {
    try { return JSON.stringify({ sucesso: true, contexto: resumoContexto_(contextoUsuario_(emailAtivo_())) }); }
    catch (e) { return respostaErro_(e); }
}

/** Dados de UMA página, já filtrados pela regional do usuário. */
function obterDadosPagina(pagina) {
    console.time('obterDadosPagina:' + pagina);
    try {
        const p = PAGINAS[pagina];
        if (!p) throw new AcessoNegado('Página inexistente.');
        const ctx = contextoUsuario_(emailAtivo_());
        if (!p.perfis.includes(ctx.perfil)) throw new AcessoNegado('Seu perfil não tem acesso a esta página.');
        const memo = {}, tabelas = {};
        p.tabelas.forEach(t => { if (TABELAS[t].perfis.includes(ctx.perfil)) tabelas[t] = projetar_(t, visiveis_(t, ctx, memo)); });
        return JSON.stringify({ sucesso: true, pagina: pagina, titulo: p.titulo, contexto: resumoContexto_(ctx), tabelas: tabelas, listas: obterListas_() });
    } catch (e) { return respostaErro_(e); }
    finally { console.timeEnd('obterDadosPagina:' + pagina); }
}

// ---------------------------------------------------------------------------
// TELEMETRIA (lote vindo do navegador)
// ---------------------------------------------------------------------------

function limparCelula_(v) {
    const s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').slice(0, 200);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function registrarEventos(lote) {
    if (!Array.isArray(lote) || !lote.length) return;
    const email = emailAtivo_();
    if (!email) return;
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
        const sh = SpreadsheetApp.openById(dbId_()).getSheetByName('log_acesso');
        const linhas = lote.slice(0, 200).map(e => [new Date(Number(e && e.t) || Date.now()), email, limparCelula_(e && e.p), limparCelula_(e && e.a), limparCelula_(e && e.d)]);
        sh.getRange(sh.getLastRow() + 1, 1, linhas.length, 5).setValues(linhas);
    } catch (e) { console.error('log_acesso: ' + e.message); }
    finally { try { lock.releaseLock(); } catch (e) {} }
}
