//=============================================================================
// GP 360 v2 - VISÃO GERAL (resumo do mês, só números)
// Tudo é calculado no servidor, já dentro do escopo (regionais) do usuário.
// Nenhuma linha de colaborador/caso vai para o navegador: só contagens e médias.
// Cada grupo só aparece se o PERFIL do usuário pode ver a tabela que o alimenta.
//=============================================================================

const AGENTE_JANELA_DIAS = 90;     // só cobra feedback 15/30/45d de quem foi admitido nos últimos 90 dias
const BH_CRITICO_HORAS = 5;        // saldo a partir do qual o banco de horas é "crítico"

const round2_ = n => (n === null || n === undefined || isNaN(n)) ? null : Math.round(n * 100) / 100;
const media_ = a => { const v = a.filter(x => x !== null && x !== undefined && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const soma_ = a => a.reduce((s, x) => s + (x || 0), 0);

/** Chave de agrupamento de textos de motivo: ignora caixa, acento e pontuação ("Reunião regional" == "Reunião Regional"). */
function chaveMotivo_(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function mesAnterior_(m) { const p = m.split('-').map(Number); return p[1] === 1 ? `${p[0] - 1}-12` : `${p[0]}-${String(p[1] - 1).padStart(2, '0')}`; }
function diasEntre_(isoA, isoB) { return Math.round((Date.parse(isoB + 'T12:00:00Z') - Date.parse(isoA + 'T12:00:00Z')) / 86400000); }
function podeVer_(ctx, tabela) { return TABELAS[tabela].perfis.includes(ctx.perfil); }

/** Campos de indicador exibidos. São os VALORES FINAIS lançados na base: nada é calculado/ponderado aqui. */
const IND_CAMPOS = ['vendas_pct', 'nps', 'tx_deslig_pct', 'bh_horas', 'coleta_lixo', 'pcd_cota', 'pcd_gap'];
function pickInd_(r) { if (!r) return null; const o = {}; IND_CAMPOS.forEach(k => { o[k] = r[k]; }); return o; }

/**
 * Calcula o resumo do mês para um usuário.
 * @param ctx  contexto de contextoUsuario_
 * @param competencia 'AAAA-MM' (opcional; padrão = último mês com dados até hoje)
 * @param hoje 'AAAA-MM-DD' (injetável para teste)
 * @param filtros { diretoria, regional, coordenador(e-mail) } — só ESTREITAM o escopo; nunca ampliam o que o usuário já pode ver
 */
function calcularResumo_(ctx, competencia, hoje, filtros) {
    const memo = {}, F = filtros || {};
    const lojasEscopo = visiveis_('lojas', ctx, memo);
    const usuariosVis = podeVer_(ctx, 'usuarios') ? visiveis_('usuarios', ctx, memo) : [];

    // opções dos filtros (sempre do escopo completo do usuário, antes de filtrar)
    const parRegDir = new Map();
    lojasEscopo.forEach(l => parRegDir.set(chaveReg_(l.regional) + '|' + chaveReg_(l.diretoria), { regional: String(l.regional), diretoria: String(l.diretoria || '') }));
    const opcoes = {
        diretorias: Array.from(new Set(lojasEscopo.map(l => String(l.diretoria || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        regionais: Array.from(parRegDir.values()).sort((a, b) => a.regional.localeCompare(b.regional, 'pt-BR')),
        coordenadores: usuariosVis.filter(u => (u.perfil === 'COORDENADOR' || u.perfil === 'GERENTE_RH') && u.ativo === true)
            .map(u => ({ email: u.email, nome: u.nome, regionais: u.regionais })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    };

    // aplica filtros sobre as lojas do escopo
    const dirK = F.diretoria ? chaveReg_(F.diretoria) : '', regK = F.regional ? chaveReg_(F.regional) : '', coordEmail = F.coordenador ? String(F.coordenador).toLowerCase().trim() : '';
    let lojas = lojasEscopo;
    if (dirK) lojas = lojas.filter(l => chaveReg_(l.diretoria) === dirK);
    if (regK) lojas = lojas.filter(l => chaveReg_(l.regional) === regK);
    if (coordEmail) {
        const u = usuariosVis.find(x => x.email === coordEmail), regsU = u ? (u.regionais || []).map(chaveReg_) : null;
        if (!u) lojas = []; else if (!regsU.includes('TODAS')) lojas = lojas.filter(l => regsU.includes(chaveReg_(l.regional)));
    }
    const filtrado = !!(dirK || regK || coordEmail);
    const filialOk = new Set(lojas.map(l => l.filial_id)), regsOk = new Set(lojas.map(l => chaveReg_(l.regional)));
    const soCoord = !!coordEmail && !dirK && !regK;   // só coordenador: conta TODO o trabalho dele dentro do escopo (inclusive fora da regional)

    const filtrar_ = (t, rows) => {
        if (!filtrado) return rows;
        const e = TABELAS[t].escopo;
        if (e.tipo === 'filial') return rows.filter(r => filialOk.has(r[e.campo]));
        if (e.tipo === 'indicador') return rows.filter(r => r.nivel === 'FILIAL' ? filialOk.has(r.filial_id) : r.nivel === 'REGIONAL' ? regsOk.has(chaveReg_(r.regional)) : false);
        if (e.tipo === 'destino') return rows.filter(r => {
            if (coordEmail && r.coordenador_email !== coordEmail) return false;
            if (soCoord) return true;
            return r.tipo_destino === 'FILIAL' ? filialOk.has(r.filial_id) : r.tipo_destino === 'REGIONAL' ? regionaisDe_(r.regional).some(k => regsOk.has(k)) : false;
        });
        return rows;
    };
    const vis = t => podeVer_(ctx, t) ? filtrar_(t, visiveis_(t, ctx, memo)) : null;

    const regDisp = new Map(), filialReg = new Map();
    lojas.forEach(l => { regDisp.set(chaveReg_(l.regional), String(l.regional)); filialReg.set(l.filial_id, chaveReg_(l.regional)); });

    const ind = vis('indicadores_mensal'), lanc = vis('lancamentos');
    const mesDe = iso => iso ? iso.substring(0, 7) : null;

    // competências disponíveis (até o mês corrente)
    const mesHoje = hoje.substring(0, 7), set = new Set();
    (ind || []).forEach(r => set.add(r.competencia)); (lanc || []).forEach(r => set.add(mesDe(r.data_hora)));
    const disponiveis = Array.from(set).filter(m => m && m <= mesHoje).sort().reverse();
    const mes = (competencia && /^\d{4}-\d{2}$/.test(competencia)) ? competencia : (disponiveis[0] || mesHoje);
    const ant = mesAnterior_(mes);
    if (!disponiveis.includes(mes)) disponiveis.unshift(mes);

    const out = { competencia: mes, competenciaAnterior: ant, competencias: disponiveis, opcoes: opcoes,
        filtros: { diretoria: F.diretoria || '', regional: F.regional || '', coordenador: coordEmail },
        escopo: { global: ctx.global && !filtrado, filtrado: filtrado, regionais: ctx.global && !filtrado ? ['TODAS'] : Array.from(regDisp.values()).sort(), filiais: lojas.length }, hoje: hoje };

    // ---- indicadores (valores finais por REDE / REGIONAL / FILIAL, exatamente como lançados)
    if (ind) {
        const nivel = (n, m) => ind.filter(r => r.nivel === n && r.competencia === m);
        const regRow = (k, m) => nivel('REGIONAL', m).find(r => chaveReg_(r.regional) === k);
        const rede = nivel('REDE', mes)[0] || null, redeAnt = nivel('REDE', ant)[0] || null;
        const regionais = Array.from(regDisp.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([k, nome]) => ({ regional: nome, atual: pickInd_(regRow(k, mes)), anterior: pickInd_(regRow(k, ant)) }));
        const lojaPorId = new Map(lojas.map(l => [l.filial_id, l]));
        const fAt = new Map(nivel('FILIAL', mes).map(r => [r.filial_id, r])), fAn = new Map(nivel('FILIAL', ant).map(r => [r.filial_id, r]));
        const porFilial = [];
        fAt.forEach((r, id) => { const l = lojaPorId.get(id); if (l) porFilial.push({ filial_id: id, nome: l.nome, regional: l.regional, atual: pickInd_(r), anterior: pickInd_(fAn.get(id)) }); });
        porFilial.sort((a, b) => a.filial_id - b.filial_id);
        out.indicadores = { rede: (rede || redeAnt) ? { atual: pickInd_(rede), anterior: pickInd_(redeAnt) } : null, regionais: regionais, porFilial: porFilial, filiaisSemIndicador: lojas.filter(l => !fAt.has(l.filial_id)).length };
    }

    // ---- trabalho realizado
    const trab = {};
    if (lanc) {
        const dm = lanc.filter(r => mesDe(r.data_hora) === mes);
        const visitas = new Set(), filVisit = new Set();
        dm.forEach(r => { if (r.tipo_roteiro === 'PRESENCIAL' && r.tipo_destino === 'FILIAL' && r.filial_id !== null) { visitas.add(`${r.coordenador_email}|${r.filial_id}|${r.data_hora.substring(0, 10)}`); filVisit.add(r.filial_id); } });
        trab.campo = { acoes: dm.length, visitas: visitas.size, filiais_visitadas: filVisit.size, horas: round2_(soma_(dm.map(r => r.horas))), km: round2_(soma_(dm.map(r => r.km))),
            pessoas_impactadas: soma_(dm.map(r => r.pessoas_impactadas)), moedas: round2_(soma_(dm.map(r => r.moedas))), validacao_pendente: dm.filter(r => r.status_validacao === 'PENDENTE').length };
        // por tipo de ação (texto do motivo, variações agrupadas; rótulo = a grafia mais usada)
        const gm = new Map();
        dm.forEach(r => {
            const rot = String(r.motivo || '').trim() || 'Sem motivo informado', k = chaveMotivo_(rot) || 'sem motivo';
            if (!gm.has(k)) gm.set(k, { v: new Map(), acoes: 0, horas: 0, pessoas: 0 });
            const x = gm.get(k); x.v.set(rot, (x.v.get(rot) || 0) + 1); x.acoes++; x.horas += r.horas || 0; x.pessoas += r.pessoas_impactadas || 0;
        });
        const itens = Array.from(gm.values()).map(x => ({ motivo: Array.from(x.v.entries()).sort((a, b) => b[1] - a[1])[0][0], acoes: x.acoes, horas: round2_(x.horas), pessoas: x.pessoas }))
            .sort((a, b) => b.acoes - a.acoes || a.motivo.localeCompare(b.motivo, 'pt-BR'));
        out.porMotivo = { itens: itens.slice(0, 15), outros: itens.slice(15).reduce((t, x) => t + x.acoes, 0), distintos: itens.length };
        // por coordenador
        const nomes = new Map((vis('usuarios') || []).map(u => [u.email, u.nome])), g = new Map();
        dm.forEach(r => { const k = r.coordenador_email; if (!g.has(k)) g.set(k, { email: k, nome: nomes.get(k) || k.split('@')[0], acoes: 0, visitas: new Set(), horas: 0, km: 0 }); const x = g.get(k); x.acoes++; x.horas += r.horas || 0; x.km += r.km || 0;
            if (r.tipo_roteiro === 'PRESENCIAL' && r.tipo_destino === 'FILIAL') x.visitas.add(`${r.filial_id}|${r.data_hora.substring(0, 10)}`); });
        out.porCoordenador = Array.from(g.values()).map(x => ({ email: x.email, nome: x.nome, acoes: x.acoes, visitas: x.visitas.size, horas: round2_(x.horas), km: round2_(x.km) })).sort((a, b) => b.acoes - a.acoes).slice(0, 100);
        // por regional (ações e visitas)
        const pr = new Map(); const reg = k => { if (!pr.has(k)) pr.set(k, { regional: regDisp.get(k) || k, acoes: 0, visitas: new Set() }); return pr.get(k); };
        dm.forEach(r => {
            const ks = r.tipo_destino === 'FILIAL' ? [filialReg.get(r.filial_id)] : r.tipo_destino === 'REGIONAL' ? regionaisDe_(r.regional).filter(k => regDisp.has(k)) : [];   // ação em várias regionais conta em cada uma
            ks.filter(Boolean).forEach(k => { const x = reg(k); x.acoes++;
                if (r.tipo_roteiro === 'PRESENCIAL' && r.tipo_destino === 'FILIAL') x.visitas.add(`${r.coordenador_email}|${r.filial_id}|${r.data_hora.substring(0, 10)}`); });
        });
        out._campoPorRegional = pr;
    }
    const social = vis('social_casos');
    if (social) trab.social = { novos: social.filter(r => mesDe(r.data_entrada) === mes).length, abertos: social.filter(r => r.status !== 'ENCERRADO').length, encerrados: social.filter(r => mesDe(r.encerrado_em) === mes).length };
    const apur = vis('apuracoes');
    if (apur) {
        const sla = vis('retornos_sla') || [];
        trab.apuracoes = { novas: apur.filter(r => mesDe(r.data_registro) === mes).length, em_aberto: apur.filter(r => !['CONCLUIDA', 'CANCELADA'].includes(r.etapa)).length,
            em_comite: apur.filter(r => r.etapa === 'COMITE').length, concluidas: apur.filter(r => mesDe(r.concluido_em) === mes).length,
            sla_pendentes: sla.filter(r => r.status === 'PENDENTE').length, sla_atrasados: sla.filter(r => r.status === 'PENDENTE' && r.data_prazo && r.data_prazo < hoje).length };
    }
    const desl = vis('desligamentos');
    if (desl) trab.desligamentos = { registrados: desl.filter(r => mesDe(r.data_registro) === mes).length, pendentes_aprovacao: desl.filter(r => r.status_regional === 'PENDENTE' || r.status_diretoria === 'PENDENTE').length };

    const fb = vis('agente_feedbacks'), colab = vis('colaboradores');
    if (fb && colab) {
        const feitos = new Set(fb.filter(r => r.realizado_em).map(r => `${r.colaborador_id}|${r.marco}`));
        let colabsAtraso = 0, marcosAtraso = 0;
        colab.forEach(cb => {
            if (!cb.data_admissao || (cb.situacao && cb.situacao !== 'ATIVO')) return;
            const dias = diasEntre_(cb.data_admissao, hoje);
            if (dias < 0 || dias > AGENTE_JANELA_DIAS) return;
            const falta = [15, 30, 45].filter(m => dias >= m && !feitos.has(`${cb.id}|${m}`)).length;
            if (falta) { colabsAtraso++; marcosAtraso += falta; }
        });
        trab.agente = { feedbacks_no_mes: fb.filter(r => mesDe(r.realizado_em) === mes).length, colaboradores_em_atraso: colabsAtraso, marcos_em_atraso: marcosAtraso };
    }
    const vagas = vis('quadro_vagas');
    if (vagas && vagas.length) {
        const ult = new Map(); vagas.filter(r => r.data_ref <= hoje).forEach(r => { const k = r.filial_id + '|' + r.cargo; if (!ult.has(k) || r.data_ref > ult.get(k).data_ref) ult.set(k, r); });
        trab.quadro = { vagas_abertas: soma_(Array.from(ult.values()).map(r => r.vagas_abertas)) };
    }
    const bh = vis('banco_horas');
    if (bh && bh.length) { const ult = bh.filter(r => r.data_ref <= hoje).reduce((m, r) => r.data_ref > m ? r.data_ref : m, ''); trab.banco_horas = { criticos: bh.filter(r => r.data_ref === ult && r.saldo_horas >= BH_CRITICO_HORAS).length, data_ref: ult || null }; }
    out.trabalho = trab;

    // ---- por regional: contagem de trabalho (os indicadores já vêm em out.indicadores.regionais)
    if (lanc) {
        const campo = out._campoPorRegional || new Map(), nFil = new Map();
        lojas.forEach(l => { const k = chaveReg_(l.regional); nFil.set(k, (nFil.get(k) || 0) + 1); });
        out.porRegional = Array.from(regDisp.entries()).map(([k, nome]) => { const c = campo.get(k); return { regional: nome, filiais: nFil.get(k) || 0, acoes: c ? c.acoes : 0, visitas: c ? c.visitas.size : 0 }; })
            .sort((a, b) => a.regional.localeCompare(b.regional, 'pt-BR'));
    }
    delete out._campoPorRegional;
    return out;
}

/** Endpoint da página Visão Geral. filtros = { diretoria, regional, coordenador } (opcionais; só estreitam o escopo). */
function obterVisaoGeral(competencia, filtros) {
    console.time('obterVisaoGeral');
    try {
        const ctx = contextoUsuario_(emailAtivo_());
        if (!PAGINAS.visaoGeral.perfis.includes(ctx.perfil)) throw new AcessoNegado('Seu perfil não tem acesso a esta página.');
        const hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), f = {};
        ['diretoria', 'regional', 'coordenador'].forEach(k => { if (filtros && typeof filtros[k] === 'string') f[k] = filtros[k].slice(0, 120); });
        return JSON.stringify({ sucesso: true, contexto: resumoContexto_(ctx), resumo: calcularResumo_(ctx, competencia, hoje, f) });
    } catch (e) { return respostaErro_(e); }
    finally { console.timeEnd('obterVisaoGeral'); }
}
