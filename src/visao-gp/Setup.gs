//=============================================================================
// GP 360 v2 - SETUP DA BASE
//   criarBaseGP360()      -> cria a planilha NOVA, limpa e já configurada (rode 1x no editor)
//   configurarBase(ssId)  -> aplica a mesma estrutura em uma planilha em branco que você já criou
//   auditarBase()         -> confere abas/colunas e acusa colunas sensíveis ou fora do contrato
//=============================================================================

const NOME_BASE = 'Banco de Dados - Portal GP 360 (v2)';
/** Planilha OFICIAL do portal. As funções abaixo usam este ID quando rodadas pelo botão Executar (que não passa argumentos). */
const ID_BASE_OFICIAL = '1Mvb3rMFBvvKg2Rwb_ikbKTMNHBEY43X8To9KUhw5FQc';
const LINHAS_PADRAO = 2000;

function letraColuna_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function criarBaseGP360() {
    validarSchema_();
    const ss = SpreadsheetApp.create(NOME_BASE);
    configurarEstrutura_(ss);
    PropertiesService.getScriptProperties().setProperty('DB_ID', ss.getId());
    console.log('[GP360] Base criada: ' + ss.getUrl());
    return ss.getUrl();
}

function configurarBase(ssId) {
    validarSchema_();
    const ss = SpreadsheetApp.openById(ssId || ID_BASE_OFICIAL);
    configurarEstrutura_(ss);
    PropertiesService.getScriptProperties().setProperty('DB_ID', ss.getId());
    return ss.getUrl();
}

/**
 * ADOTAR uma planilha que já existe como base oficial: cria apenas as abas do schema que faltam
 * e NÃO altera nem apaga nenhuma aba existente (DADOS_*, etc.). Rode inspecionarPlanilha(id) antes.
 */
function adotarPlanilha(ssId) {
    validarSchema_();
    const ss = SpreadsheetApp.openById(ssId || ID_BASE_OFICIAL);
    const rel = configurarEstrutura_(ss, { adotar: true });
    PropertiesService.getScriptProperties().setProperty('DB_ID', ss.getId());
    console.log('[GP360] Planilha adotada: ' + ss.getUrl() + '\nAbas criadas: ' + (rel.abasCriadas.join(', ') || 'nenhuma') + '\nAbas preservadas (intactas): ' + rel.abasPreservadas.join(', '));
    return rel;
}

function configurarEstrutura_(ss, opcoes) {
    const adotar = !!(opcoes && opcoes.adotar);
    ss.setSpreadsheetTimeZone(TZ);
    ss.setSpreadsheetLocale('pt_BR');
    const originais = ss.getSheets(), existentes = new Set(originais.map(sh => sh.getName()));
    const criar = nome => !(adotar && existentes.has(nome));        // ao adotar, abas que já existem ficam INTACTAS

    // 1) _leia_me + config_listas primeiro (as validações dependem das listas)
    const nomesListas = Object.keys(LISTAS_PADRAO), novas = [];
    let leia = null;
    if (criar('_leia_me')) { leia = ss.insertSheet('_leia_me'); novas.push('_leia_me'); }
    if (criar('config_listas')) { montarConfigListas_(ss.insertSheet('config_listas'), nomesListas); novas.push('config_listas'); }

    // 2) uma aba por tabela do schema (só as que faltam, no modo adotar)
    Object.keys(TABELAS).forEach(nome => {
        if (!criar(nome)) return;
        montarTabela_(ss, ss.insertSheet(nome), TABELAS[nome], nomesListas); novas.push(nome);
    });

    // 3) usuário dono já entra como ADMIN com acesso a todas as regionais (só se a aba usuarios é nova)
    const dono = emailDono_();
    if (dono && novas.includes('usuarios')) {
        const sh = ss.getSheetByName('usuarios'), nomesCol = TABELAS.usuarios.colunas.map(x => x.n);
        const o = { email: dono, nome: 'Administrador', cargo: 'Administrador', diretoria: 'Todas', perfil: 'ADMIN', regionais: 'TODAS', ativo: 'SIM', obs_acesso: 'Criado pelo setup' };
        sh.getRange(2, 1, 1, nomesCol.length).setValues([nomesCol.map(n => o[n] === undefined ? '' : o[n])]);   // pela ordem do schema, não por posição
    }

    if (leia) { montarLeiaMe_(leia); ss.setActiveSheet(leia); ss.moveActiveSheet(1); }
    if (!adotar) originais.forEach(sh => ss.deleteSheet(sh));          // remove "Planilha1" (nunca ao adotar)
    return { abasCriadas: novas, abasPreservadas: adotar ? Array.from(existentes) : [] };
}

function emailDono_() { try { return Session.getEffectiveUser().getEmail().toLowerCase(); } catch (e) { return ''; } }

function montarConfigListas_(sh, nomesListas) {
    const maxLen = Math.max(...nomesListas.map(n => LISTAS_PADRAO[n].length));
    const matriz = [nomesListas];
    for (let i = 0; i < maxLen; i++) matriz.push(nomesListas.map(n => LISTAS_PADRAO[n][i] !== undefined ? LISTAS_PADRAO[n][i] : ''));
    sh.getRange(1, 1, matriz.length, nomesListas.length).setValues(matriz);
    estilizarCabecalho_(sh.getRange(1, 1, 1, nomesListas.length), '#475569');
    sh.setFrozenRows(1);
    sh.setTabColor('#475569');
    sh.getRange(1, 1, 1, nomesListas.length).protect().setWarningOnly(true).setDescription('Nomes das listas: não renomear (o portal e as validações usam esses nomes).');
    // reduz colunas/linhas sobrando
    enxugar_(sh, Math.max(matriz.length + 100, 150), nomesListas.length);
}

function estilizarCabecalho_(range, cor) {
    range.setFontWeight('bold').setFontColor('#ffffff').setBackground(cor).setHorizontalAlignment('left').setVerticalAlignment('middle');
}

function enxugar_(sh, linhas, colunas) {
    const mc = sh.getMaxColumns();
    if (mc > colunas) sh.deleteColumns(colunas + 1, mc - colunas);
    const mr = sh.getMaxRows();
    if (mr < linhas) sh.insertRowsAfter(mr, linhas - mr);
}

function montarTabela_(ss, sh, def, nomesListas) {
    const cols = def.colunas, n = cols.length, linhas = def.linhas || LINHAS_PADRAO;
    enxugar_(sh, linhas, n);
    const cab = sh.getRange(1, 1, 1, n);
    cab.setValues([cols.map(x => x.n)]);
    estilizarCabecalho_(cab, def.cor || '#334155');
    sh.setFrozenRows(1);
    sh.setTabColor(def.cor || '#334155');
    cab.protect().setWarningOnly(true).setDescription('Cabeçalho gerado pelo schema. Renomear quebra o portal.');
    // notas de ajuda no cabeçalho
    cols.forEach((x, i) => {
        const nota = [x.req ? 'Obrigatório.' : 'Opcional.', x.ajuda, x.lista ? 'Lista: ' + x.lista : '', x.ref ? 'Referência: ' + x.ref : ''].filter(Boolean).join(' ');
        sh.getRange(1, i + 1).setNote(nota);
    });
    cols.forEach((x, i) => formatarColuna_(ss, sh, x, i + 1, linhas, nomesListas));
}

/** Validação, formato e largura de UMA coluna (usado na criação da aba e ao acrescentar colunas novas). */
function formatarColuna_(ss, sh, x, j, linhas, nomesListas) {
    const corpo = r => sh.getRange(2, r, linhas - 1, 1);
    let regra = null;
    if (x.lista) {
        const k = nomesListas.indexOf(x.lista) + 1;
        const L = letraColuna_(k);
        regra = SpreadsheetApp.newDataValidation().requireValueInRange(ss.getRange(`config_listas!${L}2:${L}`), true).setAllowInvalid(false)
            .setHelpText('Escolha um valor da lista "' + x.lista + '" (aba config_listas).').build();
    } else if (x.ref) {
        const [rt, rc] = x.ref.split('.');
        const L = letraColuna_(TABELAS[rt].colunas.findIndex(y => y.n === rc) + 1);
        regra = SpreadsheetApp.newDataValidation().requireValueInRange(ss.getRange(`${rt}!${L}2:${L}`), true).setAllowInvalid(false)
            .setHelpText('Precisa existir em ' + x.ref + '.').build();
    } else if (x.t === 'email') {
        regra = SpreadsheetApp.newDataValidation().requireTextContains('@').setAllowInvalid(false).setHelpText('Informe um e-mail válido.').build();
    } else if (x.t === 'data' || x.t === 'datahora') {
        regra = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Informe uma data válida (dd/mm/aaaa).').build();
    } else if (x.t === 'int' || x.t === 'num') {
        regra = SpreadsheetApp.newDataValidation().requireNumberBetween(-1000000000, 1000000000).setAllowInvalid(false).setHelpText('Informe um número.').build();
    }
    if (regra) corpo(j).setDataValidation(regra);
    // formatos
    if (x.t === 'data') corpo(j).setNumberFormat('dd/MM/yyyy');
    else if (x.t === 'datahora') corpo(j).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    else if (x.t === 'mes') corpo(j).setNumberFormat('@');            // texto: AAAA-MM
    else if (x.t === 'int') corpo(j).setNumberFormat('0');
    else if (x.t === 'num') corpo(j).setNumberFormat('#,##0.00');
    else corpo(j).setNumberFormat('@');                               // texto puro: evita 0 à esquerda e datas automáticas em IDs
    sh.setColumnWidth(j, larguraColuna_(x));
}

/**
 * RODE NO EDITOR quando o schema ganhar colunas novas: acrescenta, AO FINAL de cada aba, as colunas que faltam
 * (com cabeçalho, nota, validação e formato). Não altera nem move dados existentes. Repetir não faz nada.
 */
function atualizarEstruturaDaBase() {
    validarSchema_();
    const ss = SpreadsheetApp.openById(dbId_()), nomesListas = Object.keys(LISTAS_PADRAO), rel = {};
    Object.keys(TABELAS).forEach(t => {
        const sh = ss.getSheetByName(t); if (!sh) return;
        const def = TABELAS[t], lc = sh.getLastColumn(), hdr = lc > 0 ? sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h).trim()) : [];
        const faltam = def.colunas.filter(x => !hdr.includes(x.n)); if (!faltam.length) return;
        const alvo = lc + faltam.length;
        if (sh.getMaxColumns() < alvo) sh.insertColumnsAfter(sh.getMaxColumns(), alvo - sh.getMaxColumns());
        const linhas = Math.max(sh.getMaxRows(), 2);
        faltam.forEach((x, i) => {
            const j = lc + 1 + i, cel = sh.getRange(1, j);
            cel.setValue(x.n); estilizarCabecalho_(cel, def.cor || '#334155');
            cel.setNote([x.req ? 'Obrigatório.' : 'Opcional.', x.ajuda, x.lista ? 'Lista: ' + x.lista : '', x.ref ? 'Referência: ' + x.ref : ''].filter(Boolean).join(' '));
            formatarColuna_(ss, sh, x, j, linhas, nomesListas);
        });
        rel[t] = faltam.map(x => x.n);
    });
    console.log('[GP360] Colunas acrescentadas: ' + (Object.keys(rel).length ? JSON.stringify(rel) : 'nenhuma (a estrutura já está atualizada)'));
    return rel;
}

function larguraColuna_(x) {
    if (/^(mensagem|observacoes|link_|foto_url)/.test(x.n)) return 260;
    if (/(email|nome|titulo)/.test(x.n)) return 200;
    if (x.t === 'data' || x.t === 'mes') return 110;
    if (x.t === 'datahora') return 150;
    if (x.t === 'int' || x.t === 'num') return 100;
    return 150;
}

function montarLeiaMe_(sh) {
    const linhas = [['GP 360 - Banco de Dados (v2)'], ['Gerado pelo schema versão ' + SCHEMA_VERSAO + '. Não renomeie abas nem cabeçalhos: o portal depende deles.'], [''],
        ['REGRAS'],
        ['1. Dados sensíveis (CPF, RG, salário, nascimento, raça, deficiência, telefone, observações confidenciais) NÃO entram nesta base. Colaborador = somente id e nome.'],
        ['2. Cada usuário só enxerga as regionais listadas em usuarios.regionais (TODAS = rede inteira).'],
        ['3. Selecione valores nas listas suspensas; as listas ficam na aba config_listas.'],
        ['4. IDs sempre como texto. Datas como dd/mm/aaaa. Competência como AAAA-MM.'],
        [''], ['ABA', 'PARA QUE SERVE', 'CHAVE']];
    Object.keys(TABELAS).forEach(t => linhas.push([t, TABELAS[t].desc, TABELAS[t].chave.join(' + ')]));
    linhas.push(['config_listas', 'Listas de apoio dos menus suspensos (cada coluna é uma lista).', '-']);
    const w = Math.max(...linhas.map(l => l.length));
    sh.getRange(1, 1, linhas.length, w).setValues(linhas.map(l => { const r = l.slice(); while (r.length < w) r.push(''); return r; }));
    sh.getRange(1, 1).setFontSize(16).setFontWeight('bold');
    sh.getRange(4, 1).setFontWeight('bold');
    sh.getRange(10, 1, 1, w).setFontWeight('bold').setBackground('#f1f5f9');
    sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 640); sh.setColumnWidth(3, 260);
    sh.setTabColor('#0086FF');
}

// ============================================================================
// AUDITORIA
// ============================================================================

/** Confere a planilha real contra o schema. Retorna {ok, problemas[]} e imprime no log. */
function auditarBase() {
    validarSchema_();
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID'));
    const problemas = [];
    ss.getSheets().forEach(sh => {
        const nome = sh.getName(), def = TABELAS[nome];
        const lc = sh.getLastColumn();
        if (lc < 1) return;
        const hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h).trim()).filter(Boolean);
        hdr.forEach(h => { if (ehColunaBloqueada_(h)) problemas.push(`🚫 ${nome}.${h}: coluna SENSÍVEL na base do portal. Remova-a.`); });
        if (!def) { if (!['config_listas', '_leia_me'].includes(nome)) problemas.push(`⚠️ aba "${nome}" fora do contrato (o portal ignora).`); return; }
        def.colunas.forEach(x => { if (!hdr.includes(x.n)) problemas.push(`${x.req ? '❌' : '⚠️'} ${nome}.${x.n}: coluna ${x.req ? 'obrigatória ' : ''}ausente.`); });
        hdr.forEach(h => { if (!def.colunas.some(x => x.n === h) && !ehColunaBloqueada_(h)) problemas.push(`⚠️ ${nome}.${h}: coluna fora do contrato (o portal ignora).`); });
    });
    Object.keys(TABELAS).forEach(t => { if (!ss.getSheetByName(t)) problemas.push(`❌ aba "${t}" não existe.`); });
    problemas.forEach(p => console.log(p));
    console.log(problemas.length ? `[GP360] ${problemas.length} ponto(s) de atenção.` : '[GP360] Base conforme o contrato. ✅');
    return { ok: !problemas.some(p => p.startsWith('❌') || p.startsWith('🚫')), problemas: problemas };
}


// ============================================================================
// INSPEÇÃO (somente leitura): o que a planilha tem x o que o portal espera
// ============================================================================

/** Puro (testável). abas = { nomeDaAba: { cab: [...], linhas: n } } -> relatório de aderência ao schema. */
function compararComSchema_(abas) {
    const rel = { aderentes: [], parciais: [], ausentes: [], fora: [], sensiveis: [], listas: {} };
    Object.keys(TABELAS).forEach(t => {
        const def = TABELAS[t], a = abas[t];
        if (!a) { rel.ausentes.push(t); return; }
        const cab = a.cab.map(h => String(h).trim()), faltam = def.colunas.filter(c => !cab.includes(c.n)).map(c => c.n), extras = cab.filter(h => h && !def.colunas.some(c => c.n === h));
        (faltam.length || extras.length ? rel.parciais : rel.aderentes).push({ aba: t, linhas: a.linhas, faltam: faltam, extras: extras });
    });
    Object.keys(abas).forEach(n => {
        if (!TABELAS[n]) rel.fora.push({ aba: n, linhas: abas[n].linhas, colunas: abas[n].cab.length });
        abas[n].cab.forEach(h => { if (ehColunaBloqueada_(h)) rel.sensiveis.push(`${n}.${h}`); });
    });
    return rel;
}

/** RODE NO EDITOR: lista abas, tamanhos e cabeçalhos e compara com o schema. Não altera nada. */
function inspecionarPlanilha(ssId) {
    const ss = SpreadsheetApp.openById(ssId || ID_BASE_OFICIAL), abas = {};
    ss.getSheets().forEach(sh => {
        const lc = sh.getLastColumn(), lr = sh.getLastRow();
        abas[sh.getName()] = { cab: lc > 0 ? sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h)) : [], linhas: Math.max(0, lr - 1) };
    });
    const rel = compararComSchema_(abas);
    const linhas = ['=== ABAS ENCONTRADAS ==='];
    Object.keys(abas).forEach(n => linhas.push(`• ${n}: ${abas[n].linhas} linha(s) × ${abas[n].cab.length} coluna(s) | ${abas[n].cab.slice(0, 12).join(' | ')}${abas[n].cab.length > 12 ? ' …' : ''}`));
    linhas.push('', '=== ADERÊNCIA AO SCHEMA ===', `Já conformes: ${rel.aderentes.map(x => x.aba).join(', ') || 'nenhuma'}`);
    rel.parciais.forEach(x => linhas.push(`Parcial: ${x.aba} — faltam [${x.faltam.join(', ')}] | extras [${x.extras.join(', ')}]`));
    linhas.push(`Faltam criar (adotarPlanilha cria): ${rel.ausentes.join(', ') || 'nenhuma'}`, `Abas fora do contrato (ficam intactas): ${rel.fora.map(x => x.aba).join(', ') || 'nenhuma'}`);
    if (rel.sensiveis.length) linhas.push('', '🚫 COLUNAS SENSÍVEIS ENCONTRADAS (o portal nunca as lê, mas avalie se devem ficar nesta planilha):', ...rel.sensiveis.map(x => '   - ' + x));
    console.log(linhas.join('\n'));
    return rel;
}

// ---- atalhos SEM argumento (para o botão Executar do editor) ----
/** Passo 1: aponta o portal para a planilha oficial e confere as abas/colunas. Não cria nem apaga nada. */
function usarBaseOficial() {
    validarSchema_();
    const ss = SpreadsheetApp.openById(ID_BASE_OFICIAL);
    PropertiesService.getScriptProperties().setProperty('DB_ID', ss.getId());
    console.log('[GP360] Base oficial definida: ' + ss.getUrl());
    return auditarBase();
}
function inspecionarOficial() { return inspecionarPlanilha(ID_BASE_OFICIAL); }
function adotarOficial() { return adotarPlanilha(ID_BASE_OFICIAL); }
