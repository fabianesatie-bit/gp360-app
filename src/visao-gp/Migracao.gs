//=============================================================================
// GP 360 v2 - MIGRAÇÃO (base antiga -> base nova)
//   migrarLojasEUsuarios()   -> importa DADOS_LOJAS e DADOS_USUARIOS, limpando as regionais
// Só lê a base antiga (nunca altera). Escreve na base nova apenas se as abas estiverem vazias
// (ou com { sobrescrever: true }). Gera um RELATÓRIO do que foi corrigido, descartado ou ficou sem perfil.
//=============================================================================

const ID_BASE_ANTIGA = '1Nk0F5_tzevdbfmOTnpmhePdum6N22Ctf7g1N_ojuSjA';
const ADMINS_MIGRACAO = ['fabiane.satie@magazineluiza.com.br', 'lorena.castro@magazineluiza.com.br'];

const semAcento_ = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chaveCab_ = s => semAcento_(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** {nome-normalizado -> índice} do cabeçalho (aceita "Filial_ID", "filial id", "FILIAL ID"...). */
function mapaCab_(hdr) { const m = {}; hdr.forEach((h, i) => { const k = chaveCab_(h); if (k && !(k in m)) m[k] = i; }); return m; }
function pegar_(r, m, ...nomes) { for (const n of nomes) { const i = m[chaveCab_(n)]; if (i !== undefined) return r[i]; } return ''; }

/** Regra antiga: filial > 3000 => subtrai 3000. */
function filialLegada_(v) { const n = parseInt(String(v).replace(/\D/g, ''), 10); if (isNaN(n)) return null; return n > 3000 ? n - 3000 : n; }

/** Cargo/nível antigos -> perfil novo. null = não mapeado (fica INATIVO e entra no relatório). */
function perfilDeCargo_(cargo, nivel, email) {
    const c = semAcento_(cargo).toUpperCase(), n = semAcento_(nivel).toUpperCase();
    if (ADMINS_MIGRACAO.includes(email)) return 'ADMIN';
    if (c.includes('DIRETOR')) return 'DIRETOR_RH';
    if (c.includes('GERENTE DE LOJA')) return null;
    if (c.includes('GERENTE')) return 'GERENTE_RH';
    if (c.includes('COORDENAD')) return 'COORDENADOR';
    if (c.includes('COMPLIANCE')) return 'COMPLIANCE';
    if (c.includes('E-MAIL GERAL')) return 'COORDENADOR';   // caixa compartilhada da área: menor privilégio do time GP (regionais vêm do cadastro, ex.: Todas)
    if (n.includes('MASTER') || n.includes('ADMIN')) return 'ADMIN';
    return null;
}

/** Puro (testável): linhas antigas de lojas -> objetos novos + relatório. */
function transformarLojas_(rows, m) {
    const rel = { lojas: 0, filialAjustada3000: 0, semRegional: 0, duplicadas: 0 }, vistos = new Set(), out = [];
    rows.forEach(r => {
        const bruto = pegar_(r, m, 'Filial_ID'); const id = filialLegada_(bruto); if (id === null) return;
        if (parseInt(String(bruto).replace(/\D/g, ''), 10) > 3000) rel.filialAjustada3000++;
        if (vistos.has(id)) { rel.duplicadas++; return; } vistos.add(id);
        const regional = String(pegar_(r, m, 'Regional')).trim().toUpperCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
        if (!regional) rel.semRegional++;
        out.push({ filial_id: id, nome: String(pegar_(r, m, 'Nome_Fantasia', 'Nome')).trim(), regional: regional || 'SEM REGIONAL', diretoria: String(pegar_(r, m, 'Diretoria')).trim().toUpperCase(),
            cidade: String(pegar_(r, m, 'Cidade')).trim(), uf: String(pegar_(r, m, 'Estado', 'UF')).trim().toUpperCase(), gerente_email: String(pegar_(r, m, 'Gerente_Email')).trim().toLowerCase(), ativo: 'SIM' });
        rel.lojas++;
    });
    return { linhas: out, relatorio: rel };
}

/** Puro (testável): usuários antigos -> novos, com regionais limpas e canonizadas pelo cadastro de lojas. */
function transformarUsuarios_(rows, m, lojasNovas) {
    const canon = new Map(); lojasNovas.forEach(l => { const k = chaveReg_(l.regional); if (!canon.has(k)) canon.set(k, l.regional); });
    const rel = { usuarios: 0, ativos: 0, inativos: 0, semPerfil: [], regionaisCorrigidas: [], regionaisDescartadas: [], semRegional: [], duplicados: 0 };
    const vistos = new Set(), out = [];
    rows.forEach(r => {
        const email = String(pegar_(r, m, 'Email')).trim().toLowerCase(); if (!email) return;
        if (vistos.has(email)) { rel.duplicados++; return; } vistos.add(email);
        const cargo = String(pegar_(r, m, 'Cargo')).trim(), nivel = String(pegar_(r, m, 'Nivel_Acesso')).trim();
        const perfil = perfilDeCargo_(cargo, nivel, email);
        const brutas = String(pegar_(r, m, 'Regionais_Atendidas')).split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        const finais = [], vis = new Set();
        brutas.forEach(b => {
            const k = chaveReg_(b);
            if (k === 'TODAS') { if (!vis.has('TODAS')) { vis.add('TODAS'); finais.push('TODAS'); } return; }
            if (!canon.has(k)) { rel.regionaisDescartadas.push({ email: email, valor: b }); return; }
            if (vis.has(k)) return; vis.add(k);
            const nome = canon.get(k); if (nome !== b) rel.regionaisCorrigidas.push({ email: email, de: b, para: nome });
            finais.push(nome);
        });
        const global = perfil === 'ADMIN' || perfil === 'DIRETOR_RH' || finais.includes('TODAS');
        if (!perfil) rel.semPerfil.push({ email: email, cargo: cargo });
        if (perfil && !global && finais.length === 0) rel.semRegional.push({ email: email, perfil: perfil });
        const semAcesso = semAcento_(nivel).toUpperCase().includes('SEM ACESSO');
        const ativo = !!perfil && !semAcesso && (global || finais.length > 0);
        out.push({ email: email, nome: String(pegar_(r, m, 'Nome')).trim(), cargo: cargo, diretoria: String(pegar_(r, m, 'Diretoria_Principal', 'Diretoria')).trim(), perfil: perfil || '',
            regionais: global && !finais.length ? 'TODAS' : finais.join('; '), ativo: ativo ? 'SIM' : 'NAO', foto_url: String(pegar_(r, m, 'Foto')).trim(), obs_acesso: String(pegar_(r, m, 'Observações do acesso', 'Observacoes do acesso')).trim() });
        rel.usuarios++; ativo ? rel.ativos++ : rel.inativos++;
    });
    return { linhas: out, relatorio: rel };
}

function lerAbaAntiga_(ss, nome) {
    const sh = ss.getSheetByName(nome); if (!sh) throw new Error(`Aba "${nome}" não encontrada na base antiga.`);
    const v = sh.getDataRange().getValues(); if (v.length < 1) return { m: {}, rows: [] };
    return { m: mapaCab_(v[0]), rows: v.slice(1).filter(r => r.some(c => String(c).trim() !== '')) };
}

/** Horas inteiras (0..99) a partir de Date, "HH:MM", decimal ou número — mesma regra do portal antigo. */
function horasLegado_(v) {
    if (v === null || v === undefined || v === '') return 0;
    let h = 0;
    if (v instanceof Date) h = v.getHours() + v.getMinutes() / 60;
    else if (typeof v === 'number') h = v;
    else { const t = String(v).trim().replace(',', '.'), m = t.match(/^(\d{1,2}):(\d{2})/); if (m) h = parseInt(m[1], 10) + parseInt(m[2], 10) / 60; else { const n = parseFloat(t.replace(/[^0-9.-]/g, '')); h = isNaN(n) ? 0 : n; } }
    if (h < 0 || h > 1000) return 0;
    return Math.min(99, Math.round(h));
}

function motivoNovo_(txt) {
    const t = semAcento_(txt).toUpperCase();
    if (/VENDA/.test(t)) return 'VENDAS'; if (/TURNOVER|DESLIG/.test(t)) return 'TURNOVER'; if (/BANCO|\bBH\b/.test(t)) return 'BANCO_DE_HORAS'; if (/\bNPS\b/.test(t)) return 'NPS';
    if (/CLIMA/.test(t)) return 'CLIMA'; if (/RECRUT|SELE|VAGA|ENTREVISTA/.test(t)) return 'RECRUTAMENTO'; if (/SOCIAL|ASSIST/.test(t)) return 'SOCIAL'; if (/APURA/.test(t)) return 'APURACAO';
    return 'OUTROS';
}
const INDICADOR_DE_MOTIVO_ = { VENDAS: 'VENDAS', NPS: 'NPS', BANCO_DE_HORAS: 'BH' };
const DESPESAS_LEGADO_ = [['Alimentação', 'ALIMENTACAO'], ['Hospedagem', 'HOSPEDAGEM'], ['Aereo', 'AEREO'], ['Pedagio', 'PEDAGIO'], ['Estacionamento', 'ESTACIONAMENTO']];

/**
 * Entende o destino do portal antigo:
 *   "123" / "3123"                    -> FILIAL
 *   "REGIONAL - A" / "REGIONAL - A / B / C" -> REGIONAL (uma ou várias, na grafia oficial)
 *   "DIRETORIA - SUL"                 -> REGIONAL (todas as regionais daquela diretoria)
 *   "AVULSO ..." / sede / evento      -> AVULSO
 * Retorna { tipo, filial, regional, naoReconhecidas[] }.
 */
function resolverDestino_(destRaw, motU, lojas) {
    const filiais = new Set(lojas.map(l => l.filial_id)), regs = new Map(), porDir = new Map();
    lojas.forEach(l => { const k = chaveReg_(l.regional); if (!regs.has(k)) regs.set(k, l.regional); const d = chaveReg_(l.diretoria); if (d) { if (!porDir.has(d)) porDir.set(d, new Set()); porDir.get(d).add(k); } });
    const t = semAcento_(destRaw).trim();
    if (/^AVULSO/i.test(t) || /AVULSO|SEDE\/EVENTO/.test(motU)) return { tipo: 'AVULSO', filial: '', regional: '', naoReconhecidas: [] };
    const m = t.match(/^(REGIONAL|DIRETORIA)\s*-\s*(.+)$/i);
    if (!m) {
        const idF = filialLegada_(destRaw);
        if (idF !== null && filiais.has(idF)) return { tipo: 'FILIAL', filial: idF, regional: '', naoReconhecidas: [] };
        if (regs.has(chaveReg_(destRaw))) return { tipo: 'REGIONAL', filial: '', regional: regs.get(chaveReg_(destRaw)), naoReconhecidas: [] };
        return { tipo: 'AVULSO', filial: '', regional: '', naoReconhecidas: destRaw ? [String(destRaw).trim()] : [] };
    }
    const achadas = [], nao = [], ja = new Set(), add = k => { if (!ja.has(k)) { ja.add(k); achadas.push(regs.get(k)); } };
    m[2].split(/\s+\/\s+/).map(x => x.trim()).filter(Boolean).forEach(parte => {
        const k = chaveReg_(parte);
        if (m[1].toUpperCase() === 'REGIONAL') { if (regs.has(k)) add(k); else nao.push(parte); }
        else { const set = porDir.get(k); if (set) set.forEach(add); else nao.push(parte); }
    });
    return achadas.length ? { tipo: 'REGIONAL', filial: '', regional: achadas.join('; '), naoReconhecidas: nao } : { tipo: 'AVULSO', filial: '', regional: '', naoReconhecidas: nao.length ? [String(destRaw).trim()] : [] };
}

/**
 * Puro (testável): linhas antigas de DADOS_LANCAMENTOS -> lancamentos + despesas + visitas_resultado.
 * lojas = linhas da aba nova "lojas".  desde = 'AAAA-MM' (descarta anteriores).
 */
function transformarLancamentos_(rows, m, lojas, desde) {
    const rel = { lidas: rows.length, importadas: 0, antigas: 0, semData: 0, semEmail: 0, duplicadas: 0, destinos: { FILIAL: 0, REGIONAL: 0, AVULSO: 0 }, destinoNaoReconhecido: {}, destinoParcial: {},
        motivoOutros: 0, motivosEmOutros: {}, despesas: 0, antesDepois: 0, antesDepoisSemIndicador: 0 };
    const vistos = new Set(), L = [], Dp = [], V = [];
    rows.forEach((r, i) => {
        const dh = dataHoraIso_(pegar_(r, m, 'Data_Hora')) || dataHoraIso_(pegar_(r, m, 'Data_Ini'));
        if (!dh) { rel.semData++; return; }
        if (dh.substring(0, 7) < (desde || '0000-00')) { rel.antigas++; return; }
        const email = String(pegar_(r, m, 'Coordenador_Email')).trim().toLowerCase(); if (!email) { rel.semEmail++; return; }
        const id = String(pegar_(r, m, 'ID_Lancamento')).trim() || ('LEG-' + (i + 2)); if (vistos.has(id)) { rel.duplicadas++; return; } vistos.add(id);

        const destRaw = String(pegar_(r, m, 'Destino_Filial_Regional')).trim(), motivoRaw = String(pegar_(r, m, 'Motivo_Meta')).trim(), motU = semAcento_(motivoRaw).toUpperCase();
        const d = resolverDestino_(destRaw, motU, lojas); rel.destinos[d.tipo]++;
        if (d.tipo === 'AVULSO') { if (d.naoReconhecidas.length) rel.destinoNaoReconhecido[destRaw] = (rel.destinoNaoReconhecido[destRaw] || 0) + 1; }
        else if (d.naoReconhecidas.length) rel.destinoParcial[destRaw] = (rel.destinoParcial[destRaw] || 0) + 1;

        const mot = motivoNovo_(motivoRaw); if (mot === 'OUTROS') { rel.motivoOutros++; if (motivoRaw) rel.motivosEmOutros[motivoRaw] = (rel.motivosEmOutros[motivoRaw] || 0) + 1; }
        const rot = semAcento_(pegar_(r, m, 'Tipo_Roteiro')).toUpperCase(), roteiro = /PRESENCIAL|IN LOCO|INLOCO|VISITA/.test(rot) ? 'PRESENCIAL' : 'VIRTUAL';
        const st = semAcento_(pegar_(r, m, 'Status_Validacao_Especialista')).toUpperCase();
        const num = v => { const n = numeroPtBr_(v); return n === null ? '' : n; };
        L.push({ id_lancamento: id, data_hora: dh, coordenador_email: email, tipo_destino: d.tipo, filial_id: d.filial, regional: d.regional, motivo: motivoRaw.slice(0, 200), motivo_meta: mot, tipo_roteiro: roteiro,
            sub_tema: String(pegar_(r, m, 'Sub temas', 'Sub tema')).trim(), data_ini: dataIso_(pegar_(r, m, 'Data_Ini')) || '', data_fim: dataIso_(pegar_(r, m, 'Data_Fim')) || '',
            horas: horasLegado_(pegar_(r, m, 'Tempo Gasto')), pessoas_impactadas: num(pegar_(r, m, 'Pessoas Impactas')), km: num(pegar_(r, m, 'Qde_Km')), moedas: num(pegar_(r, m, 'Moedas_Geradas')),
            checklist_nota: num(pegar_(r, m, 'Checklist_Nota_Media')), status_validacao: /APROV/.test(st) ? 'APROVADO' : /RECUS|REPROV/.test(st) ? 'RECUSADO' : (st ? 'PENDENTE' : ''),
            observacoes: String(pegar_(r, m, 'Observacoes')).trim().slice(0, 500), link_evidencia: String(pegar_(r, m, 'Link_Evidencia')).trim() });
        rel.importadas++;
        DESPESAS_LEGADO_.forEach(([cab, cat]) => { const v = numeroPtBr_(pegar_(r, m, cab)); if (v) { Dp.push({ id_lancamento: id, categoria: cat, valor: v }); rel.despesas++; } });
        const ind = INDICADOR_DE_MOTIVO_[mot], a = numeroPtBr_(pegar_(r, m, 'Valor_Antes')), dd = numeroPtBr_(pegar_(r, m, 'Valor_Depois'));
        if (a !== null && dd !== null) { if (ind) { V.push({ id_lancamento: id, indicador: ind, valor_pre: a, valor_pos: dd }); rel.antesDepois++; } else rel.antesDepoisSemIndicador++; }
    });
    // relatório enxuto: só os 30 textos de motivo mais frequentes que caíram em OUTROS
    rel.motivosEmOutros = Object.fromEntries(Object.entries(rel.motivosEmOutros).sort((x, y) => y[1] - x[1]).slice(0, 30));
    return { lancamentos: L, despesas: Dp, visitas_resultado: V, relatorio: rel };
}

/** Converte 'yyyy-MM-dd[THH:mm:ss]' em Date no fuso do script (para a planilha exibir como data/hora de verdade). */
function paraDataSheet_(iso) {
    if (!iso) return '';
    return Utilities.parseDate(iso.length === 10 ? iso + 'T12:00:00' : iso, TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Grava objetos numa aba PELO NOME DO CABEÇALHO REAL da planilha (não pela ordem do schema), para que colunas
 * acrescentadas depois ou reordenadas continuem alinhadas. Valores que a validação da célula rejeitaria
 * (fora da lista, e-mail sem "@") são gravados vazios e contados em `limpos` (o Apps Script aborta a gravação inteira se um só falhar).
 */
function escreverPorCabecalho_(sh, nome, objetos, linhaInicial) {
    const def = TABELAS[nome], lc = sh.getLastColumn(), hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h).trim());
    const listas = lerListas_(), limpos = {}, porNome = {}; def.colunas.forEach(c => { porNome[c.n] = c; });
    const sujo = h => { limpos[h] = (limpos[h] || 0) + 1; return ''; };
    const matriz = objetos.map(o => hdr.map(h => {
        const c = porNome[h]; if (!c) return '';
        const v = o[h]; if (v === undefined || v === null || v === '') return '';
        if (c.lista && c.t !== 'lista' && !(listas[c.lista] || []).map(String).includes(String(v))) return sujo(h);
        if (c.t === 'email' && !String(v).includes('@')) return sujo(h);
        if ((c.t === 'data' || c.t === 'datahora') && typeof v === 'string') return paraDataSheet_(v);
        return v;
    }));
    for (let i = 0; i < matriz.length; i += 5000) { const bloco = matriz.slice(i, i + 5000); sh.getRange(linhaInicial + i, 1, bloco.length, hdr.length).setValues(bloco); }   // em blocos: planilhas grandes
    return { gravadas: matriz.length, limpos: limpos };
}

/** Substitui o conteúdo de uma aba nova (recusa se já houver dados e sobrescrever for falso). Retorna { gravadas, limpos }. */
function escreverTabelaNova_(ss, nome, objetos, sobrescrever) {
    const sh = ss.getSheetByName(nome);
    if (!sh) throw new Error(`Aba "${nome}" não existe na base nova. Rode criarBaseGP360() primeiro.`);
    const existentes = Math.max(0, sh.getLastRow() - 1);
    // a aba "usuarios" recém-criada tem 1 linha (o dono): aceitamos e substituímos apenas se for só ela
    if (existentes > 0 && !sobrescrever && !(nome === 'usuarios' && existentes === 1)) throw new Error(`Aba "${nome}" já tem ${existentes} linha(s). Use { sobrescrever: true } para substituir.`);
    if (existentes > 0) sh.getRange(2, 1, existentes, sh.getLastColumn()).clearContent();
    if (!objetos.length) return { gravadas: 0, limpos: {} };
    return escreverPorCabecalho_(sh, nome, objetos, 2);
}

/** RODE NO EDITOR (depois de criarBaseGP360). Mantém o dono atual como ADMIN se ele não vier na base antiga. */
function migrarLojasEUsuarios(opcoes) {
    opcoes = opcoes || {};
    const antiga = SpreadsheetApp.openById(opcoes.idBaseAntiga || ID_BASE_ANTIGA);
    const nova = SpreadsheetApp.openById(dbId_());

    const lo = lerAbaAntiga_(antiga, 'DADOS_LOJAS'), us = lerAbaAntiga_(antiga, 'DADOS_USUARIOS');
    const L = transformarLojas_(lo.rows, lo.m);
    const U = transformarUsuarios_(us.rows, us.m, L.linhas);

    const dono = emailDono_();
    if (dono && !U.linhas.some(u => u.email === dono)) U.linhas.unshift({ email: dono, nome: 'Administrador', cargo: 'Administrador', diretoria: 'Todas', perfil: 'ADMIN', regionais: 'TODAS', ativo: 'SIM', foto_url: '', obs_acesso: 'Mantido pelo setup' });

    const nl = escreverTabelaNova_(nova, 'lojas', L.linhas, opcoes.sobrescrever);
    const nu = escreverTabelaNova_(nova, 'usuarios', U.linhas, opcoes.sobrescrever);
    const rel = { lojasGravadas: nl.gravadas, usuariosGravados: nu.gravadas, valoresLimpos: { lojas: nl.limpos, usuarios: nu.limpos }, lojas: L.relatorio, usuarios: U.relatorio };
    console.log('[GP360] Migração concluída:\n' + JSON.stringify(rel, null, 1));
    return rel;
}

/** RODE NO EDITOR: importa lançamentos (e despesas / antes-depois) da base antiga. Opções: { desde: '2025-01', sobrescrever: false }. */
function migrarLancamentos(opcoes) {
    opcoes = opcoes || {};
    const antiga = SpreadsheetApp.openById(opcoes.idBaseAntiga || ID_BASE_ANTIGA), nova = SpreadsheetApp.openById(dbId_());
    const lo = lerAbaAntiga_(antiga, 'DADOS_LANCAMENTOS'), lojas = lerTabela_('lojas');
    if (!lojas.length) throw new Error('A aba "lojas" está vazia: rode migrarLojasEUsuarios() antes (preciso das filiais para reconhecer os destinos).');
    const T = transformarLancamentos_(lo.rows, lo.m, lojas, opcoes.desde || '2023-01');
    const w = { lancamentos: escreverTabelaNova_(nova, 'lancamentos', T.lancamentos, opcoes.sobrescrever), despesas: escreverTabelaNova_(nova, 'despesas', T.despesas, opcoes.sobrescrever), visitas_resultado: escreverTabelaNova_(nova, 'visitas_resultado', T.visitas_resultado, opcoes.sobrescrever) };
    const rel = { gravados: { lancamentos: w.lancamentos.gravadas, despesas: w.despesas.gravadas, visitas_resultado: w.visitas_resultado.gravadas }, valoresLimpos: { lancamentos: w.lancamentos.limpos, despesas: w.despesas.limpos, visitas_resultado: w.visitas_resultado.limpos }, relatorio: T.relatorio };
    try { atualizarCache(); } catch (e) {}
    console.log('[GP360] Lançamentos migrados:\n' + JSON.stringify(rel, null, 1));
    return rel;
}

/**
 * RODE NO EDITOR: cria o ESQUELETO de indicadores do mês (sem valores): uma linha FILIAL por loja ativa,
 * uma REGIONAL por regional e uma REDE. Você só preenche os números. Não duplica linhas que já existem.
 * Ex.: prepararIndicadoresDoMes('2026-10'); sem argumento usa o mês corrente.
 */
function prepararIndicadoresDoMes(competencia) {
    const mes = /^\d{4}-\d{2}$/.test(String(competencia || '')) ? competencia : Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
    const nova = SpreadsheetApp.openById(dbId_()), lojas = lerTabela_('lojas').filter(l => l.ativo !== false), jaTem = new Set(lerTabela_('indicadores_mensal').filter(r => r.competencia === mes).map(r => `${r.nivel}|${r.filial_id || ''}|${chaveReg_(r.regional)}`));
    const novos = [], add = (nivel, filial, regional) => { if (!jaTem.has(`${nivel}|${filial || ''}|${chaveReg_(regional)}`)) novos.push({ competencia: mes, nivel: nivel, filial_id: filial || '', regional: regional || '' }); };
    add('REDE', '', ''); Array.from(new Set(lojas.map(l => l.regional))).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')).forEach(r => add('REGIONAL', '', r)); lojas.forEach(l => add('FILIAL', l.filial_id, ''));
    const sh = nova.getSheetByName('indicadores_mensal');
    if (novos.length) escreverPorCabecalho_(sh, 'indicadores_mensal', novos, sh.getLastRow() + 1);
    console.log(`[GP360] Esqueleto de ${mes}: ${novos.length} linha(s) criada(s) (1 REDE, regionais, ${lojas.length} filiais). Preencha vendas_pct, bh_horas, nps, tx_deslig_pct, coleta_lixo, pcd_cota e pcd_gap.`);
    return { competencia: mes, criadas: novos.length };
}

/** Atalho SEM argumento (botão Executar): refaz a migração de lançamentos, SUBSTITUINDO lancamentos/despesas/visitas_resultado. */
function refazerMigracaoDeLancamentos() { return migrarLancamentos({ sobrescrever: true }); }
