//=============================================================================
// GP 360 v2 - DIAGNÓSTICO: "por que não funciona?" em linguagem simples
//   verificarInstalacao()  -> roda uma checklist e diz o que está OK, o que falta e como resolver
// Não altera dados. Rode pelo botão Executar (sem argumentos) e leia o Log de execução.
//=============================================================================

function verificarInstalacao() {
    const itens = [], ok = (t, d) => itens.push({ s: 'OK', t: t, d: d || '' }), av = (t, d) => itens.push({ s: 'ATENÇÃO', t: t, d: d || '' }), er = (t, d) => itens.push({ s: 'ERRO', t: t, d: d || '' });
    let dbOk = false;

    // 1) arquivos do projeto
    try { validarSchema_(); ok('Arquivos do projeto carregados e schema consistente'); }
    catch (e) { er('Schema inválido ou arquivos faltando', e.message); }

    // 2) base configurada
    const props = PropertiesService.getScriptProperties(), id = props.getProperty('DB_ID');
    if (!id) av('Base ainda não definida neste projeto', 'Rode usarBaseOficial() (usa a planilha ' + ID_BASE_OFICIAL + ').');
    else if (id !== ID_BASE_OFICIAL) av('O projeto aponta para OUTRA planilha', `DB_ID=${id}. A oficial é ${ID_BASE_OFICIAL}. Rode usarBaseOficial() para trocar.`);
    else ok('Projeto aponta para a planilha oficial');

    // 3) acesso à planilha e às abas
    let ss = null;
    try { ss = SpreadsheetApp.openById(id || ID_BASE_OFICIAL); ok('Planilha acessível: ' + ss.getName()); dbOk = true; }
    catch (e) { er('Não consegui abrir a planilha', 'A conta que está executando precisa ter acesso de EDITOR à planilha oficial. Detalhe: ' + e.message); }
    if (ss) {
        try {
            const abas = {}; ss.getSheets().forEach(sh => { const lc = sh.getLastColumn(); abas[sh.getName()] = { cab: lc > 0 ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [], linhas: Math.max(0, sh.getLastRow() - 1) }; });
            const r = compararComSchema_(abas);
            if (r.ausentes.length) er('Faltam abas', r.ausentes.join(', ') + '. Rode adotarOficial() (só cria o que falta, não altera as abas existentes).');
            else ok('Todas as abas do schema existem');
            r.parciais.forEach(x => (x.faltam.length ? er : av)(`Aba ${x.aba}: cabeçalho diferente do esperado`, `faltam [${x.faltam.join(', ')}] extras [${x.extras.join(', ')}]. Cabeçalhos devem ter exatamente os nomes do schema.`));
            if (r.sensiveis.length) av('Há colunas sensíveis na planilha', r.sensiveis.join(', ') + ' (o portal não as lê; avalie removê-las).');
        } catch (e) { er('Erro ao conferir as abas', e.message); }
    }

    // 4) leitura de dados e usuário atual
    if (dbOk) {
        try {
            const us = lerTabela_('usuarios'), lj = lerTabela_('lojas'), eu = emailDono_();
            ok(`usuarios: ${us.length} linha(s) · lojas: ${lj.length} linha(s)`);
            if (!lj.length) av('Aba lojas está vazia', 'Sem lojas não há regionais nem filtros. Rode migrarLojasEUsuarios() ou preencha a aba.');
            const eu_ = us.find(u => u.email === eu);
            if (!eu_) av('Seu e-mail (' + eu + ') não está em "usuarios"', 'Sem cadastro ativo você será barrado. Inclua perfil ADMIN e regionais TODAS.');
            else if (eu_.ativo !== true || !PERFIS.includes(eu_.perfil)) av('Seu cadastro existe mas está inativo ou com perfil inválido', `perfil="${eu_.perfil}" ativo=${eu_.ativo}. Perfis válidos: ${PERFIS.join(', ')}; ativo = SIM.`);
            else ok(PERFIS_GLOBAIS.includes(eu_.perfil) ? `Seu cadastro: ${eu_.perfil} — vê a REDE INTEIRA por perfil (as regionais do cadastro são só informativas)` : `Seu cadastro: ${eu_.perfil}, regionais: ${(eu_.regionais || []).join('; ') || '(vazio)'}`);
            ['indicadores_mensal', 'lancamentos'].forEach(t => { const n = lerTabela_(t).length; (n ? ok : av)(`${t}: ${n} linha(s)`, n ? '' : 'Vazia: a Visão Geral mostrará "não lançado"/zeros até você alimentar.'); });
        } catch (e) { er('Erro ao ler os dados', e.message + ' — geralmente é coluna obrigatória ausente/renomeada ou aba com nome diferente.'); }
    }

    // 5) cache e gatilho
    try { const dono = props.getProperty('OWNER_EMAIL'); if (!dono) av('Dono do cache não registrado', 'Rode instalarGatilhos() uma vez (sem ela o app funciona, só que mais lento).'); else ok('Dono do cache registrado: ' + dono); } catch (e) {}
    try { const t = ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'atualizarCache'); (t.length ? ok : av)(t.length ? 'Gatilho de atualização (10 min) ativo' : 'Gatilho de atualização não instalado', t.length ? '' : 'Rode instalarGatilhos().'); } catch (e) { av('Não consegui checar gatilhos', e.message); }
    try { cachePut_('GP360_TESTE', { x: 1 }); const v = cacheGet_('GP360_TESTE'); (v && v.x === 1 ? ok : av)('Cache funcionando', v ? '' : 'CacheService não devolveu o valor (o app funciona sem cache, mais lento).'); } catch (e) { av('Cache indisponível', e.message); }

    const icone = { OK: '✔', 'ATENÇÃO': '⚠', ERRO: '✘' };
    const linhas = itens.map(i => `${icone[i.s]} ${i.t}${i.d ? '\n     → ' + i.d : ''}`);
    const nErro = itens.filter(i => i.s === 'ERRO').length, nAv = itens.filter(i => i.s === 'ATENÇÃO').length;
    linhas.push('', nErro ? `RESULTADO: ${nErro} erro(s) a corrigir primeiro.` : nAv ? `RESULTADO: funciona, com ${nAv} ponto(s) de atenção.` : 'RESULTADO: tudo certo ✅');
    console.log(linhas.join('\n'));
    return { itens: itens, erros: nErro, atencoes: nAv };
}
