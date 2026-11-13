//=============================================================================
// GP 360 v2 - DADOS DE EXEMPLO (para ver o portal funcionando antes de alimentar a base real)
//   popularDadosDeExemplo()   -> grava dados FICTÍCIOS e marcados na base
//   limparDadosDeExemplo()    -> remove SOMENTE as linhas marcadas (os seus dados reais não são tocados)
//   simularUsuario(email)     -> (sem argumento = você) mostra no log o que aquele usuário enxergaria (perfil, regionais, filiais)
// Marcas de exemplo: ids "EX-...", e-mails "@exemplo.local", filiais 90001+, regionais/diretorias "EXEMPLO ...".
// Os usuários de exemplo não existem de verdade: só você (ADMIN) enxerga esses dados.
//=============================================================================

const EX_REGIONAIS = [
    { nome: 'EXEMPLO SUL', dir: 'EXEMPLO SP/RJ', filiais: [90001, 90002, 90003, 90004] },
    { nome: 'EXEMPLO CAMPINAS', dir: 'EXEMPLO SP/RJ', filiais: [90005, 90006, 90007, 90008] },
    { nome: 'EXEMPLO MINAS', dir: 'EXEMPLO MG/CO', filiais: [90009, 90010, 90011, 90012] }
];
const EX_COORDS = [
    { email: 'ana.exemplo@exemplo.local', nome: 'Ana (exemplo)', perfil: 'COORDENADOR', regionais: 'EXEMPLO SUL; EXEMPLO CAMPINAS' },
    { email: 'bruno.exemplo@exemplo.local', nome: 'Bruno (exemplo)', perfil: 'COORDENADOR', regionais: 'EXEMPLO MINAS' },
    { email: 'gerente.exemplo@exemplo.local', nome: 'Gerente RH (exemplo)', perfil: 'GERENTE_RH', regionais: 'EXEMPLO CAMPINAS; EXEMPLO MINAS' }
];

/** Gerador pseudo-aleatório determinístico (mesmo resultado sempre). */
function exRand_(semente) { let x = semente; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }
const exData_ = (a, m, d, h) => new Date(a, m - 1, d, h === undefined ? 12 : h, 0, 0);

/** Linhas de exemplo por tabela. mes = 'AAAA-MM' (mês corrente). Puro: não acessa planilha. */
function gerarExemplos_(hojeIso) {
    const [A, M, D] = hojeIso.split('-').map(Number);
    const mesAtual = `${A}-${String(M).padStart(2, '0')}`, mesAnt = mesAnterior_(mesAtual), pAnt = mesAnt.split('-').map(Number);
    const R = exRand_(42), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), r1 = (a, b) => Math.round((a + R() * (b - a)) * 10) / 10;
    const T = {};

    T.lojas = []; EX_REGIONAIS.forEach(rg => rg.filiais.forEach(f => T.lojas.push({ filial_id: f, nome: 'Loja Exemplo ' + (f - 90000), regional: rg.nome, diretoria: rg.dir, cidade: 'Cidade ' + (f - 90000), uf: 'SP', gerente_email: `gerente${f}@exemplo.local`, ativo: 'SIM' })));
    T.usuarios = EX_COORDS.map(u => ({ email: u.email, nome: u.nome, cargo: u.perfil === 'GERENTE_RH' ? 'Gerente RH' : 'Coordenador', diretoria: 'EXEMPLO', perfil: u.perfil, regionais: u.regionais, ativo: 'SIM', obs_acesso: 'EXEMPLO' }));

    // indicadores: valores FINAIS (não são médias): filial, regional e rede, nos dois últimos meses
    T.indicadores_mensal = [];
    [[mesAnt, -1], [mesAtual, 0]].forEach(([mes, off]) => {
        T.lojas.forEach(l => T.indicadores_mensal.push({ competencia: mes, nivel: 'FILIAL', filial_id: l.filial_id, regional: '', vendas_pct: r1(78, 108) + off, bh_horas: r1(0, 14), nps: r1(55, 85) + off, tx_deslig_pct: r1(1, 6), coleta_lixo: ri(0, 2), pcd_cota: ri(1, 4), pcd_gap: ri(-3, 2) }));
        EX_REGIONAIS.forEach(rg => T.indicadores_mensal.push({ competencia: mes, nivel: 'REGIONAL', filial_id: '', regional: rg.nome, vendas_pct: r1(85, 98) + off, bh_horas: r1(4, 10), nps: r1(62, 78) + off, tx_deslig_pct: r1(2, 4.5), coleta_lixo: ri(0, 2), pcd_cota: ri(8, 14), pcd_gap: ri(-6, 1) }));
        T.indicadores_mensal.push({ competencia: mes, nivel: 'REDE', filial_id: '', regional: 'EXEMPLO REDE', vendas_pct: 90 + off, bh_horas: 7.2, nps: 68 + off, tx_deslig_pct: 3.1, coleta_lixo: 1, pcd_cota: 36, pcd_gap: -9 });
    });

    // lançamentos (mês corrente e anterior) + despesas e antes/depois
    T.lancamentos = []; T.despesas = []; T.visitas_resultado = [];
    let n = 0;
    [[A, M, Math.max(D, 10)], [pAnt[0], pAnt[1], 28]].forEach(([ano, mes, maxDia], k) => {
        for (let i = 0; i < (k === 0 ? 30 : 18); i++) {
            const c = EX_COORDS[ri(0, 2)], tipo = R(), id = 'EX-L-' + String(++n).padStart(3, '0'), loja = T.lojas[ri(0, 11)];
            const destino = tipo < 0.7 ? 'FILIAL' : tipo < 0.85 ? 'REGIONAL' : 'AVULSO', dia = ri(1, Math.min(maxDia, 28));
            T.lancamentos.push({ id_lancamento: id, data_hora: exData_(ano, mes, dia, ri(8, 17)), coordenador_email: c.email, tipo_destino: destino, filial_id: destino === 'FILIAL' ? loja.filial_id : '',
                regional: destino === 'REGIONAL' ? loja.regional : '', motivo: ['Reunião regional', 'Treinamentos', 'Relatorios/Feedback/Acompanhamento', 'CSC', 'Apoio loja (sem gerente/Ferias)'][ri(0, 4)], motivo_meta: 'OUTROS', tipo_roteiro: R() < 0.7 ? 'PRESENCIAL' : 'VIRTUAL',
                horas: ri(1, 8), pessoas_impactadas: destino === 'AVULSO' ? 0 : ri(0, 20), km: destino === 'FILIAL' ? ri(10, 300) : 0, moedas: ri(0, 5), status_validacao: ['PENDENTE', 'APROVADO', 'APROVADO'][ri(0, 2)], observacoes: 'Registro de exemplo' });
            if (destino === 'FILIAL') {
                T.despesas.push({ id_lancamento: id, categoria: 'ALIMENTACAO', valor: ri(30, 90) });
                if (R() < 0.4) T.despesas.push({ id_lancamento: id, categoria: 'HOSPEDAGEM', valor: ri(150, 350) });
                T.visitas_resultado.push({ id_lancamento: id, indicador: ['VENDAS', 'NPS', 'BH'][ri(0, 2)], valor_pre: r1(60, 90), valor_pos: r1(65, 95) });
            }
        }
    });

    const fil = () => T.lojas[ri(0, 11)].filial_id, diasAtras = (d) => exData_(A, M, D - d);
    T.colaboradores = []; for (let i = 1; i <= 14; i++) T.colaboradores.push({ id: 'EX-C-' + String(i).padStart(3, '0'), nome: 'Colaborador Exemplo ' + i, filial_id: T.lojas[i % 12].filial_id, cargo: ['VENDEDOR', 'CAIXA', 'AUXILIAR'][i % 3], situacao: 'ATIVO', data_admissao: diasAtras(ri(3, 80)), atualizado_em: diasAtras(0) });
    T.agente_feedbacks = []; T.colaboradores.slice(0, 7).forEach(c => T.agente_feedbacks.push({ colaborador_id: c.id, filial_id: c.filial_id, marco: 15, realizado_em: diasAtras(ri(1, 20)) }));
    T.social_casos = []; for (let i = 1; i <= 8; i++) T.social_casos.push({ id_caso: 'EX-S-' + String(i).padStart(3, '0'), data_entrada: diasAtras(ri(1, 45)), filial_id: fil(), colaborador_id: 'EX-C-' + String(i).padStart(3, '0'), colaborador_nome: 'Colaborador Exemplo ' + i, classificacao: 'OUTROS', alcada: i % 2 ? 'GP' : 'EQUIPE_SS', status: ['ABERTO', 'EM_ACOMPANHAMENTO', 'ENCERRADO'][i % 3], data_retomada: diasAtras(-ri(1, 15)), responsavel_email: EX_COORDS[0].email, encerrado_em: i % 3 === 2 ? diasAtras(ri(1, 10)) : '' });
    T.apuracoes = []; T.apuracao_envolvidos = []; for (let i = 1; i <= 6; i++) { const id = 'EX-A-' + String(i).padStart(3, '0'); T.apuracoes.push({ id_apuracao: id, data_registro: diasAtras(ri(1, 40)), filial_id: fil(), origem: i % 2 ? 'CANAL' : 'INTERNA', etapa: ['RASCUNHO', 'ENVIADA', 'COMITE', 'CONCLUIDA'][i % 4], resultado: 'EM_ANALISE', responsavel_email: EX_COORDS[1].email, concluido_em: i % 4 === 3 ? diasAtras(ri(1, 8)) : '' }); T.apuracao_envolvidos.push({ id_apuracao: id, colaborador_id: 'EX-C-' + String(i).padStart(3, '0'), colaborador_nome: 'Colaborador Exemplo ' + i }); }
    T.retornos_sla = []; for (let i = 1; i <= 5; i++) T.retornos_sla.push({ id_retorno: 'EX-R-' + String(i).padStart(3, '0'), filial_id: fil(), gerente_email: 'gerente@exemplo.local', data_envio: diasAtras(ri(5, 20)), data_prazo: diasAtras(ri(-10, 8)), status: i % 2 ? 'PENDENTE' : 'RESPONDIDO' });
    T.desligamentos = []; for (let i = 1; i <= 4; i++) T.desligamentos.push({ id_desligamento: 'EX-D-' + String(i).padStart(3, '0'), data_registro: diasAtras(ri(1, 30)), filial_id: fil(), colaborador_id: 'EX-C-' + String(i).padStart(3, '0'), colaborador_nome: 'Colaborador Exemplo ' + i, cargo: 'VENDEDOR', status_regional: i % 2 ? 'PENDENTE' : 'APROVADO', status_diretoria: 'PENDENTE', coordenador_email: EX_COORDS[0].email });
    T.quadro_vagas = T.lojas.slice(0, 8).map(l => ({ data_ref: diasAtras(2), filial_id: l.filial_id, cargo: ['VENDEDOR', 'CAIXA'][ri(0, 1)], vagas_abertas: ri(1, 4) }));
    T.banco_horas = T.colaboradores.slice(0, 8).map(c => ({ data_ref: diasAtras(2), filial_id: c.filial_id, colaborador_id: c.id, colaborador_nome: c.nome, saldo_horas: r1(0, 14) }));
    return T;
}

function anexarLinhas_(ss, nome, objetos) {
    if (!objetos.length) return 0;
    const sh = ss.getSheetByName(nome);
    if (!sh) throw new Error(`Aba "${nome}" não existe na base. Rode criarBaseGP360() primeiro.`);
    return escreverPorCabecalho_(sh, nome, objetos, sh.getLastRow() + 1).gravadas;      // pelo cabeçalho real da planilha
}

/** É linha de exemplo? (marcas: EX-..., @exemplo.local, filial >= 90000, "EXEMPLO ...") */
function ehLinhaExemplo_(linha, nomesCol) {
    return linha.some((v, i) => {
        const s = String(v == null ? '' : v).trim(), c = nomesCol[i];
        if (!s) return false;
        if (/^EX-/i.test(s) || /@exemplo\.local$/i.test(s) || /^EXEMPLO\b/i.test(s)) return true;
        if (c === 'regionais' && /EXEMPLO\b/i.test(s)) return true;
        if (c === 'filial_id' && Number(s) >= 90000) return true;
        return false;
    });
}

function limparDadosDeExemplo() {
    const ss = SpreadsheetApp.openById(dbId_()), rel = {};
    Object.keys(TABELAS).forEach(nome => {
        const sh = ss.getSheetByName(nome); if (!sh || sh.getLastRow() < 2) return;
        const lc = sh.getLastColumn(), hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h).trim());
        const dados = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getValues();
        const manter = dados.filter(l => !ehLinhaExemplo_(l, hdr)), removidas = dados.length - manter.length;
        if (!removidas) return;
        sh.getRange(2, 1, dados.length, lc).clearContent();
        if (manter.length) sh.getRange(2, 1, manter.length, lc).setValues(manter);
        rel[nome] = removidas;
    });
    try { atualizarCache(); } catch (e) {}
    console.log('[GP360] Exemplos removidos: ' + JSON.stringify(rel));
    return rel;
}

function popularDadosDeExemplo() {
    validarSchema_();
    limparDadosDeExemplo();                                              // idempotente: nunca duplica
    const ss = SpreadsheetApp.openById(dbId_()), hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), T = gerarExemplos_(hoje), rel = {};
    Object.keys(T).forEach(nome => { rel[nome] = anexarLinhas_(ss, nome, T[nome]); });
    try { atualizarCache(); } catch (e) {}
    console.log('[GP360] Exemplos gravados: ' + JSON.stringify(rel) + '\nAbra o portal como ADMIN. Para apagar: limparDadosDeExemplo().');
    return rel;
}

/** Mostra no log o que um usuário enxergaria. Ex.: simularUsuario('ana.exemplo@exemplo.local') */
function simularUsuario(email) {
    email = email || Session.getEffectiveUser().getEmail();   // sem argumento (botão Executar): simula você mesmo
    const ctx = contextoUsuario_(String(email).toLowerCase().trim());
    const r = calcularResumo_(ctx, '', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), {});
    const resumo = { perfil: ctx.perfil, rede_inteira: ctx.global, regionais: r.escopo.regionais, filiais: r.escopo.filiais, paginas: paginasPermitidas_(ctx.perfil).map(p => p.id),
        competencia: r.competencia, acoes_no_mes: r.trabalho && r.trabalho.campo ? r.trabalho.campo.acoes : null, filtros: { diretorias: r.opcoes.diretorias.length, regionais: r.opcoes.regionais.length, coordenadores: r.opcoes.coordenadores.length } };
    console.log('[GP360] ' + email + ' => ' + JSON.stringify(resumo));
    return resumo;
}

/** Atalhos sem argumento (botão Executar). */
function simularAna() { return simularUsuario('ana.exemplo@exemplo.local'); }
function simularVoce() { return simularUsuario(); }
