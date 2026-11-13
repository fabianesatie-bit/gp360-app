//=============================================================================
// GP 360 v2 - SCHEMA (fonte única da verdade)
// Este arquivo define as tabelas, colunas, tipos, listas, regras de acesso e páginas.
// Dele saem: a criação da planilha (Setup.gs), a leitura/validação (Dados.gs) e a documentação.
// REGRA DE OURO: dado sensível NÃO existe aqui. Se a coluna não está declarada, o portal nunca a lê.
//=============================================================================

const SCHEMA_VERSAO = 1;
const TZ = 'America/Sao_Paulo';

const PERFIS = ['ADMIN', 'DIRETOR_RH', 'GERENTE_RH', 'COORDENADOR', 'COMPLIANCE'];
/** Veem a rede inteira por definição do perfil (os demais só as regionais do cadastro; "TODAS" no cadastro também vale). */
const PERFIS_GLOBAIS = ['ADMIN', 'DIRETOR_RH'];
const GP = ['ADMIN', 'DIRETOR_RH', 'GERENTE_RH', 'COORDENADOR'];       // time de Gestão de Pessoas
const GP_COMP = GP.concat(['COMPLIANCE']);                              // + Compliance (somente o que envolve apurações)

/** Nomes de coluna proibidos em qualquer tabela do portal (verificado no Setup e na auditoria). */
const COLUNAS_BLOQUEADAS = [
    'cpf', 'rg', 'rg_orgao', 'salario', 'salario_complementar', 'salario_medio', 'data_nascimento', 'nascimento',
    'raca', 'cor', 'deficiencia', 'estado_civil', 'telefone', 'telefone_gerente', 'endereco', 'sindicato', 'sindicato_cnpj',
    'grau_instrucao', 'sexo', 'observacoes_social', 'observacoes_p_social', 'obs_social', 'observacoes_para_social', 'parecer_gp', 'parecer', 'denunciante'
];

// helper de coluna: K_(nome, tipo, opções)  | tipos: texto int num data datahora mes bool email lista
const K_ = (n, t, o) => Object.assign({ n: n, t: t || 'texto' }, o || {});

/**
 * escopo: como as linhas são filtradas pela REGIONAL do usuário
 *   global           -> todos veem
 *   regional         -> campo = nome da regional
 *   filial           -> campo = filial_id (a regional vem de "lojas")
 *   regionais_lista  -> campo = lista de regionais (aceita TODAS)
 *   indicador        -> indicadores: FILIAL pela filial, REGIONAL pela regional, REDE só para quem vê tudo
 *   destino          -> lançamentos (filial / regional / avulso; autor sempre vê o próprio)
 *   pai              -> herda a visibilidade da tabela-pai
 *   nenhum           -> só o servidor lê (nunca vai ao navegador)
 */
const TABELAS = {
    usuarios: {
        titulo: 'Usuários e acessos', cor: '#6b21a8', chave: ['email'], escopo: { tipo: 'regionais_lista', campo: 'regionais' }, perfis: GP,
        desc: 'Quem pode entrar e quais regionais enxerga. regionais = nomes separados por ";" ou TODAS. ADMIN e DIRETOR_RH veem a rede inteira.',
        colunas: [K_('email', 'email', { req: 1 }), K_('nome', 'texto', { req: 1 }), K_('cargo'), K_('diretoria'), K_('perfil', 'texto', { req: 1, lista: 'perfil' }),
            K_('regionais', 'lista', { req: 1, ajuda: 'Regionais separadas por ";" ou TODAS' }), K_('ativo', 'bool', { req: 1, lista: 'sim_nao' }),
            K_('foto_url'), K_('obs_acesso', 'texto', { interna: 1 })]
    },
    lojas: {
        titulo: 'Lojas', cor: '#0369a1', chave: ['filial_id'], escopo: { tipo: 'regional', campo: 'regional' }, perfis: GP_COMP,
        desc: 'Cadastro mestre de filiais. A regional daqui define quem enxerga cada filial.',
        colunas: [K_('filial_id', 'int', { req: 1, min0: 1 }), K_('nome', 'texto', { req: 1 }), K_('regional', 'texto', { req: 1 }), K_('diretoria'),
            K_('cidade'), K_('uf'), K_('gerente_email', 'email'), K_('ativo', 'bool', { lista: 'sim_nao' })]
    },
    colaboradores: {
        titulo: 'Colaboradores (somente id e nome)', cor: '#0369a1', chave: ['id'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP, linhas: 30000,
        desc: 'Apenas identificação funcional mínima. Sem CPF, RG, salário, nascimento, raça ou deficiência.',
        colunas: [K_('id', 'texto', { req: 1 }), K_('nome', 'texto', { req: 1 }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }), K_('cargo'),
            K_('situacao', 'texto', { lista: 'situacao_colaborador' }), K_('data_admissao', 'data'), K_('atualizado_em', 'data')]
    },
    indicadores_mensal: {
        titulo: 'Indicadores (valores finais, mensal)', cor: '#0f766e', chave: ['competencia', 'nivel'], escopo: { tipo: 'indicador' }, perfis: GP, linhas: 20000,
        desc: 'Valores FINAIS informados por você: o portal não calcula médias. nivel = FILIAL (preencha filial_id), REGIONAL (preencha regional) ou REDE (total da rede; só perfis que veem a rede inteira enxergam).',
        colunas: [K_('competencia', 'mes', { req: 1, ajuda: 'AAAA-MM' }), K_('nivel', 'texto', { req: 1, lista: 'nivel_indicador' }), K_('filial_id', 'int', { ref: 'lojas.filial_id', ajuda: 'Só quando nivel = FILIAL' }),
            K_('regional', 'texto', { ref: 'lojas.regional', ajuda: 'Só quando nivel = REGIONAL' }), K_('vendas_pct', 'num'), K_('bh_horas', 'num'), K_('nps', 'num'), K_('tx_deslig_pct', 'num'),
            K_('coleta_lixo', 'int'), K_('pcd_cota', 'int'), K_('pcd_gap', 'int', { ajuda: 'Negativo = faltam contratações para a cota' })]
    },
    lancamentos: {
        titulo: 'Lançamentos de campo', cor: '#b45309', chave: ['id_lancamento'], escopo: { tipo: 'destino' }, perfis: GP, linhas: 20000,
        desc: 'Roteiros, visitas e ações dos coordenadores. Despesas ficam em "despesas"; antes/depois em "visitas_resultado".',
        colunas: [K_('id_lancamento', 'texto', { req: 1 }), K_('data_hora', 'datahora', { req: 1 }), K_('coordenador_email', 'email', { req: 1 }),
            K_('tipo_destino', 'texto', { req: 1, lista: 'tipo_destino' }), K_('filial_id', 'int', { ref: 'lojas.filial_id' }), K_('regional', 'texto', { ajuda: 'Destino REGIONAL: uma ou mais regionais separadas por ";"' }),
            K_('motivo', 'texto', { ajuda: 'Texto original do motivo/ação (livre)' }), K_('motivo_meta', 'texto', { lista: 'motivo_meta', ajuda: 'Categoria (lista)' }), K_('tipo_roteiro', 'texto', { lista: 'tipo_roteiro' }), K_('sub_tema'),
            K_('data_ini', 'data'), K_('data_fim', 'data'), K_('horas', 'num'), K_('pessoas_impactadas', 'int'), K_('km', 'num'), K_('moedas', 'num'),
            K_('checklist_nota', 'num'), K_('status_validacao', 'texto', { lista: 'status_validacao' }), K_('observacoes'), K_('link_evidencia')]
    },
    despesas: {
        titulo: 'Despesas de viagem', cor: '#b45309', chave: ['id_lancamento', 'categoria'], escopo: { tipo: 'pai', tabela: 'lancamentos', fk: 'id_lancamento' }, perfis: GP,
        desc: 'Uma linha por categoria de despesa de cada lançamento.',
        colunas: [K_('id_lancamento', 'texto', { req: 1, ref: 'lancamentos.id_lancamento' }), K_('categoria', 'texto', { req: 1, lista: 'categoria_despesa' }), K_('valor', 'num', { req: 1 })]
    },
    visitas_resultado: {
        titulo: 'Resultado das visitas (antes/depois)', cor: '#b45309', chave: ['id_lancamento', 'indicador'], escopo: { tipo: 'pai', tabela: 'lancamentos', fk: 'id_lancamento' }, perfis: GP,
        desc: 'Indicador medido antes e depois da atuação de campo.',
        colunas: [K_('id_lancamento', 'texto', { req: 1, ref: 'lancamentos.id_lancamento' }), K_('indicador', 'texto', { req: 1, lista: 'indicador_visita' }), K_('valor_pre', 'num'), K_('valor_pos', 'num')]
    },
    social_casos: {
        titulo: 'Social - casos', cor: '#0f766e', chave: ['id_caso'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP,
        desc: 'Acompanhamento de casos. Sem observações confidenciais, parecer, telefone ou dado de saúde: só id, nome e andamento.',
        colunas: [K_('id_caso', 'texto', { req: 1 }), K_('data_entrada', 'data', { req: 1 }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }),
            K_('colaborador_id', 'texto', { ref: 'colaboradores.id' }), K_('colaborador_nome'), K_('classificacao', 'texto', { lista: 'classificacao_social' }),
            K_('alcada', 'texto', { lista: 'alcada_social' }), K_('status', 'texto', { req: 1, lista: 'status_social' }), K_('data_retomada', 'data'),
            K_('responsavel_email', 'email'), K_('encerrado_em', 'data')]
    },
    apuracoes: {
        titulo: 'Apurações', cor: '#6b21a8', chave: ['id_apuracao'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP_COMP,
        desc: 'Processos de apuração. Identidade de denunciante NÃO é registrada.',
        colunas: [K_('id_apuracao', 'texto', { req: 1 }), K_('data_registro', 'data', { req: 1 }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }),
            K_('origem', 'texto', { lista: 'origem_apuracao' }), K_('etapa', 'texto', { req: 1, lista: 'etapa_apuracao' }), K_('resultado', 'texto', { lista: 'resultado_apuracao' }),
            K_('data_agendamento', 'data'), K_('link_dossie'), K_('responsavel_email', 'email'), K_('concluido_em', 'data')]
    },
    apuracao_envolvidos: {
        titulo: 'Apurações - envolvidos (id e nome)', cor: '#6b21a8', chave: ['id_apuracao', 'colaborador_id'], escopo: { tipo: 'pai', tabela: 'apuracoes', fk: 'id_apuracao' }, perfis: GP_COMP,
        desc: 'Colaboradores envolvidos em cada apuração (somente id e nome).',
        colunas: [K_('id_apuracao', 'texto', { req: 1, ref: 'apuracoes.id_apuracao' }), K_('colaborador_id', 'texto', { req: 1 }), K_('colaborador_nome')]
    },
    retornos_sla: {
        titulo: 'Retornos de SLA (gerentes)', cor: '#6b21a8', chave: ['id_retorno'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP_COMP,
        desc: 'Retorno esperado do gerente da loja a um feedback/apuração.',
        colunas: [K_('id_retorno', 'texto', { req: 1 }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }), K_('gerente_email', 'email'), K_('data_envio', 'data'),
            K_('data_prazo', 'data'), K_('data_retorno', 'data'), K_('status', 'texto', { lista: 'status_sla' }), K_('link_evidencia')]
    },
    desligamentos: {
        titulo: 'Desligamentos / dossiês', cor: '#9f1239', chave: ['id_desligamento'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP,
        desc: 'Fluxo de aprovação de desligamentos. Justificativa em texto livre fica no dossiê (link), não na base.',
        colunas: [K_('id_desligamento', 'texto', { req: 1 }), K_('data_registro', 'data', { req: 1 }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }),
            K_('colaborador_id', 'texto'), K_('colaborador_nome'), K_('cargo'), K_('status_regional', 'texto', { lista: 'status_aprovacao' }),
            K_('status_diretoria', 'texto', { lista: 'status_aprovacao' }), K_('coordenador_email', 'email'), K_('link_dossie')]
    },
    agente_feedbacks: {
        titulo: 'Agente integrador - feedbacks realizados', cor: '#0369a1', chave: ['colaborador_id', 'marco'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP,
        desc: 'Marcos de 15/30/45 dias realizados. O que está pendente é calculado (admissão x feedbacks).',
        colunas: [K_('colaborador_id', 'texto', { req: 1, ref: 'colaboradores.id' }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }), K_('marco', 'int', { req: 1, lista: 'marco_agente' }), K_('realizado_em', 'data')]
    },
    quadro_vagas: {
        titulo: 'Quadro e vagas', cor: '#0f766e', chave: ['data_ref', 'filial_id', 'cargo'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP,
        desc: 'Vagas em aberto por cargo e filial.',
        colunas: [K_('data_ref', 'data', { req: 1 }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }), K_('cargo', 'texto', { req: 1 }), K_('vagas_abertas', 'int', { req: 1 })]
    },
    banco_horas: {
        titulo: 'Banco de horas por colaborador', cor: '#0f766e', chave: ['data_ref', 'colaborador_id'], escopo: { tipo: 'filial', campo: 'filial_id' }, perfis: GP, linhas: 30000,
        desc: 'Saldo de banco de horas (usar apenas colaboradores com saldo crítico).',
        colunas: [K_('data_ref', 'data', { req: 1 }), K_('filial_id', 'int', { req: 1, ref: 'lojas.filial_id' }), K_('colaborador_id', 'texto', { req: 1 }), K_('colaborador_nome'), K_('saldo_horas', 'num', { req: 1 })]
    },
    avisos: {
        titulo: 'Avisos', cor: '#475569', chave: ['id_aviso'], escopo: { tipo: 'regionais_lista', campo: 'regionais_alvo' }, perfis: PERFIS,
        desc: 'Comunicados por regional (TODAS = rede inteira).',
        colunas: [K_('id_aviso', 'texto', { req: 1 }), K_('titulo', 'texto', { req: 1 }), K_('mensagem'), K_('regionais_alvo', 'lista', { req: 1, ajuda: 'Regionais separadas por ";" ou TODAS' }),
            K_('inicio', 'data'), K_('fim', 'data'), K_('criado_por', 'email')]
    },
    log_acesso: {
        titulo: 'Log de uso do portal', cor: '#94a3b8', chave: ['data_hora', 'email'], escopo: { tipo: 'nenhum' }, perfis: [], linhas: 20000,
        desc: 'Auditoria de uso. Somente o servidor lê e grava.',
        colunas: [K_('data_hora', 'datahora', { req: 1 }), K_('email', 'email', { req: 1 }), K_('pagina'), K_('acao'), K_('detalhe')]
    }
};

/** Páginas do portal: o que cada uma carrega e quem pode abrir. */
const PAGINAS = {
    visaoGeral: { titulo: 'Visão Geral', perfis: GP, tabelas: [], endpoint: 'obterVisaoGeral', desc: 'Indicadores do mês e trabalho realizado, só em números (calculados no servidor).' },
    mural: { titulo: 'Mural de Ações', perfis: GP, tabelas: ['lojas', 'usuarios', 'lancamentos', 'visitas_resultado', 'despesas'] },
    social: { titulo: 'Social', perfis: GP, tabelas: ['lojas', 'social_casos'] },
    apuracoes: { titulo: 'Apurações', perfis: GP_COMP, tabelas: ['lojas', 'apuracoes', 'apuracao_envolvidos', 'retornos_sla'] },
    desligamentos: { titulo: 'Desligamentos', perfis: GP, tabelas: ['lojas', 'desligamentos'] },
    agente: { titulo: 'Agente Integrador', perfis: GP, tabelas: ['lojas', 'colaboradores', 'agente_feedbacks'] },
    avisos: { titulo: 'Avisos', perfis: PERFIS, tabelas: ['avisos'] }
};

/** Listas de apoio (viram a aba config_listas e os menus suspensos). */
const LISTAS_PADRAO = {
    perfil: PERFIS,
    sim_nao: ['SIM', 'NAO'],
    nivel_indicador: ['FILIAL', 'REGIONAL', 'REDE'],
    situacao_colaborador: ['ATIVO', 'FERIAS', 'AFASTADO', 'DESLIGADO'],
    tipo_destino: ['FILIAL', 'REGIONAL', 'AVULSO'],
    tipo_roteiro: ['PRESENCIAL', 'VIRTUAL'],
    motivo_meta: ['VENDAS', 'TURNOVER', 'BANCO_DE_HORAS', 'NPS', 'CLIMA', 'RECRUTAMENTO', 'SOCIAL', 'APURACAO', 'OUTROS'],
    status_validacao: ['PENDENTE', 'APROVADO', 'RECUSADO'],
    indicador_visita: ['VENDAS', 'NPS', 'BH'],
    categoria_despesa: ['ALIMENTACAO', 'HOSPEDAGEM', 'AEREO', 'PEDAGIO', 'ESTACIONAMENTO', 'OUTROS'],
    classificacao_social: ['OUTROS'],
    alcada_social: ['GP', 'EQUIPE_SS'],
    status_social: ['ABERTO', 'EM_ACOMPANHAMENTO', 'ENCERRADO'],
    origem_apuracao: ['CANAL', 'INTERNA'],
    etapa_apuracao: ['RASCUNHO', 'ENVIADA', 'COMITE', 'CONCLUIDA', 'CANCELADA'],
    resultado_apuracao: ['EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE', 'ARQUIVADO'],
    status_sla: ['PENDENTE', 'RESPONDIDO'],
    status_aprovacao: ['PENDENTE', 'APROVADO', 'RECUSADO'],
    marco_agente: ['15', '30', '45']
};

/** true se o nome (normalizado) é, começa com, termina com ou contém uma coluna bloqueada ("Data Nascimento", "Parecer de GP"...). */
function ehColunaBloqueada_(nome) {
    const n = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return COLUNAS_BLOQUEADAS.some(b => n === b || n.startsWith(b + '_') || n.endsWith('_' + b) || n.includes('_' + b + '_'));
}

/** Falha cedo se algum nome de coluna do schema for sensível ou inconsistente. */
function validarSchema_() {
    const erros = [];
    Object.keys(TABELAS).forEach(t => {
        const def = TABELAS[t], nomes = new Set();
        def.colunas.forEach(col => {
            if (ehColunaBloqueada_(col.n)) erros.push(`${t}.${col.n}: coluna proibida (dado sensível)`);
            if (nomes.has(col.n)) erros.push(`${t}.${col.n}: coluna duplicada`);
            nomes.add(col.n);
            if (col.lista && !LISTAS_PADRAO[col.lista]) erros.push(`${t}.${col.n}: lista "${col.lista}" não existe`);
            if (col.ref) { const [rt, rc] = col.ref.split('.'); if (!TABELAS[rt] || !TABELAS[rt].colunas.some(x => x.n === rc)) erros.push(`${t}.${col.n}: ref "${col.ref}" inválida`); }
        });
        def.chave.forEach(k => { if (!nomes.has(k)) erros.push(`${t}: chave "${k}" não é coluna`); });
        const e = def.escopo;
        if (e.campo && !nomes.has(e.campo)) erros.push(`${t}: escopo.campo "${e.campo}" não é coluna`);
        if (e.tipo === 'pai' && (!TABELAS[e.tabela] || !nomes.has(e.fk))) erros.push(`${t}: escopo pai inválido`);
    });
    Object.keys(PAGINAS).forEach(p => PAGINAS[p].tabelas.forEach(t => { if (!TABELAS[t]) erros.push(`página ${p}: tabela "${t}" não existe`); }));
    if (erros.length) throw new Error('Schema inválido:\n - ' + erros.join('\n - '));
    return true;
}
