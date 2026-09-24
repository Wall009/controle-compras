const API_URL = "https://webhook.servidorwall.online/webhook/cc-api";
const SESSION_KEY = "cc_session_token";

function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }

let osData = [];
let pedidoData = [];
let fornecedorData = [];

// ===== ESTADO DE PAGINAÇÃO/ORDENAÇÃO =====
const estado = {
  os:         { pagina:1, tamanho:25, ordCampo:null, ordDir:1 },
  pedido:     { pagina:1, tamanho:25, ordCampo:null, ordDir:1 },
  fornecedor: { pagina:1, tamanho:25, ordCampo:null, ordDir:1 },
  recebimento:{ pagina:1, tamanho:25, ordCampo:null, ordDir:1 },
  solicitacao:{ pagina:1, tamanho:25, ordCampo:null, ordDir:1 },
  aprovacao:  { pagina:1, tamanho:25, ordCampo:null, ordDir:1 },
  documento:  { pagina:1, tamanho:25, ordCampo:null, ordDir:1 }
};
let recebimentoData = [];
let solicitacaoData = [], aprovacaoData = [], documentoData = [];
let processoCarregado = false;

// ===== AUTENTICAÇÃO =====
function getToken(){ return localStorage.getItem(SESSION_KEY); }
function setToken(t){ localStorage.setItem(SESSION_KEY, t); }
function limparToken(){ localStorage.removeItem(SESSION_KEY); }

function mostrarLogin(mostrar){
  document.getElementById('loginScreen').style.display = mostrar ? 'flex' : 'none';
}

function sair(){
  limparToken();
  mostrarLogin(true);
}

async function fazerLogin(){
  const erroBox = document.getElementById('loginErro');
  erroBox.style.display = 'none';
  const btn = document.getElementById('btnLogin');
  const username = document.getElementById('loginUsuario').value.trim();
  const senha = document.getElementById('loginSenha').value;
  if(!username || !senha){
    erroBox.textContent = 'Preencha usuário e senha.';
    erroBox.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try{
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'login', username, senha })
    });
    const data = await res.json();
    if(!res.ok){
      erroBox.textContent = data.erro || 'Usuário ou senha inválidos.';
      erroBox.style.display = 'block';
      return;
    }
    setToken(data.token);
    mostrarLogin(false);
    carregarDados();
  }catch(err){
    erroBox.textContent = 'Erro de conexão.';
    erroBox.style.display = 'block';
    console.error(err);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

// Wrapper de fetch autenticado; se a sessão expirou, volta pro login.
async function apiFetch(options, queryParams){
  const token = getToken();
  const headers = Object.assign({}, (options && options.headers) || {}, { 'x-session-token': token || '' });
  let url = API_URL;
  if(queryParams){
    const qs = new URLSearchParams(queryParams).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if(res.status === 401){
    limparToken();
    mostrarLogin(true);
    throw new Error('Sessão expirada');
  }
  return res;
}

// ===== HELPERS =====
function formatarData(iso){
  if(!iso) return '—';
  try{ return new Date(iso).toLocaleDateString('pt-BR'); }catch(e){ return iso; }
}

function formatarMoeda(v){
  const n = Number(v)||0;
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function badgeOS(status){
  const map = {
    ABERTA:['badge-aberta','Aberta'],
    FECHADA:['badge-fechada','Fechada'],
    CANCELADA:['badge-cancelada','Cancelada'],
    OUTRO_DEPARTAMENTO:['badge-outro','Outro depto.']
  };
  const [cls,label] = map[status] || ['badge-generic','—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function ordenar(tabela, campo, thEl){
  const e = estado[tabela];
  if(e.ordCampo === campo){ e.ordDir *= -1; } else { e.ordCampo = campo; e.ordDir = 1; }
  e.pagina = 1;
  thEl.parentElement.querySelectorAll('th.sortable').forEach(th=>th.classList.remove('asc','desc'));
  thEl.classList.add(e.ordDir===1 ? 'asc' : 'desc');
  const dispatch = {
    os: renderOS, pedido: renderPedidos, fornecedor: renderFornecedores, recebimento: renderRecebimentos,
    solicitacao: renderSolicitacoes, aprovacao: renderAprovacoes, documento: renderDocumentos
  };
  dispatch[tabela]();
}

function aplicarOrdenacao(lista, e){
  if(!e.ordCampo) return lista;
  const campo = e.ordCampo;
  return [...lista].sort((a,b)=>{
    const va = (a[campo]??'').toString().toLowerCase();
    const vb = (b[campo]??'').toString().toLowerCase();
    if(va < vb) return -1 * e.ordDir;
    if(va > vb) return 1 * e.ordDir;
    return 0;
  });
}

function renderPaginacao(containerId, tabela, totalItens){
  const e = estado[tabela];
  const totalPaginas = Math.max(1, Math.ceil(totalItens / e.tamanho));
  if(e.pagina > totalPaginas) e.pagina = totalPaginas;
  const container = document.getElementById(containerId);
  const nomesFuncao = {
    os:'renderOS', pedido:'renderPedidos', fornecedor:'renderFornecedores', recebimento:'renderRecebimentos',
    solicitacao:'renderSolicitacoes', aprovacao:'renderAprovacoes', documento:'renderDocumentos'
  };
  const funcaoRender = nomesFuncao[tabela];
  container.innerHTML = `
    <span>${totalItens} registro${totalItens===1?'':'s'} — página ${e.pagina} de ${totalPaginas}</span>
    <div class="pg-btns">
      <select onchange="estado.${tabela}.tamanho=parseInt(this.value);estado.${tabela}.pagina=1;${funcaoRender}()">
        ${[25,50,100,250].map(n=>`<option value="${n}" ${e.tamanho===n?'selected':''}>${n} por página</option>`).join('')}
      </select>
      <button ${e.pagina<=1?'disabled':''} onclick="estado.${tabela}.pagina--;${funcaoRender}()">‹ Anterior</button>
      <button ${e.pagina>=totalPaginas?'disabled':''} onclick="estado.${tabela}.pagina++;${funcaoRender}()">Próxima ›</button>
    </div>`;
}

function paginar(lista, e){
  const inicio = (e.pagina - 1) * e.tamanho;
  return lista.slice(inicio, inicio + e.tamanho);
}

// ===== RENDER: OS =====
function renderOS(){
  const search = document.getElementById('osSearch').value.trim().toLowerCase();
  const statusFiltro = document.getElementById('osStatusFilter').value;
  let filtrado = osData.filter(o=>{
    const matchSearch = !search || (o.numero_os||'').toLowerCase().includes(search);
    const matchStatus = !statusFiltro || o.status === statusFiltro;
    return matchSearch && matchStatus;
  });
  filtrado = aplicarOrdenacao(filtrado, estado.os);
  const pagina = paginar(filtrado, estado.os);

  const tbody = document.getElementById('osTableBody');
  document.getElementById('osEmpty').style.display = filtrado.length ? 'none' : 'block';
  tbody.innerHTML = pagina.map(o=>`
    <tr onclick='abrirModalOS(${JSON.stringify(o).replace(/'/g,"&#39;")})'>
      <td><strong>${o.numero_os||'—'}</strong></td>
      <td>${badgeOS(o.status)}</td>
      <td>${o.situacao||'—'}</td>
      <td>${o.setor_responsavel||'—'}</td>
      <td>${o.placa||'—'}</td>
      <td>${o.pedido_relacionado||'—'}</td>
      <td>${formatarMoeda(o.valor)}</td>
      <td>${formatarData(o.data_abertura)}</td>
    </tr>`).join('');
  renderPaginacao('osPagination', 'os', filtrado.length);
}

// ===== RENDER: PEDIDOS =====
function renderPedidos(){
  const search = document.getElementById('pedidoSearch').value.trim().toLowerCase();
  const setorFiltro = document.getElementById('pedidoSetorFilter').value;
  let filtrado = pedidoData.filter(p=>{
    const matchSearch = !search || (p.numero_pedido||'').toLowerCase().includes(search);
    const matchSetor = !setorFiltro || (p.setor_responsavel||'').toUpperCase().includes(setorFiltro);
    return matchSearch && matchSetor;
  });
  filtrado = aplicarOrdenacao(filtrado, estado.pedido);
  const pagina = paginar(filtrado, estado.pedido);

  const tbody = document.getElementById('pedidoTableBody');
  document.getElementById('pedidoEmpty').style.display = filtrado.length ? 'none' : 'block';
  tbody.innerHTML = pagina.map(p=>`
    <tr onclick='abrirModalPedido(${JSON.stringify(p).replace(/'/g,"&#39;")})'>
      <td><strong>${p.numero_pedido||'—'}</strong></td>
      <td>${p.setor_responsavel||'—'}</td>
      <td>${p.status_pedido||'—'}</td>
      <td>${p.item_pedido||'—'}</td>
      <td>${p.os_relacionada||'—'}</td>
      <td>${formatarMoeda(p.valor)}</td>
      <td>${formatarData(p.data_abertura)}</td>
    </tr>`).join('');
  renderPaginacao('pedidoPagination', 'pedido', filtrado.length);
}

// ===== RENDER: FORNECEDORES =====
function renderFornecedores(){
  const search = document.getElementById('fornecedorSearch').value.trim().toLowerCase();
  let filtrado = fornecedorData.filter(f=>{
    return !search || (f.razao_social||'').toLowerCase().includes(search) || (f.cnpj||'').toLowerCase().includes(search);
  });
  filtrado = aplicarOrdenacao(filtrado, estado.fornecedor);
  const pagina = paginar(filtrado, estado.fornecedor);

  const tbody = document.getElementById('fornecedorTableBody');
  document.getElementById('fornecedorEmpty').style.display = filtrado.length ? 'none' : 'block';
  tbody.innerHTML = pagina.map(f=>`
    <tr onclick='abrirModalFornecedor(${JSON.stringify(f).replace(/'/g,"&#39;")})'>
      <td><strong>${f.razao_social||'—'}</strong></td>
      <td>${f.cnpj||'—'}</td>
      <td>${f.categoria||'—'}</td>
      <td>${f.contato||'—'}</td>
      <td>${f.condicao_pagamento||'—'}</td>
    </tr>`).join('');
  renderPaginacao('fornecedorPagination', 'fornecedor', filtrado.length);
}

function simNao(v){ return v ? '<span class="badge badge-cancelada">Sim</span>' : '<span class="badge badge-fechada">Não</span>'; }

function renderRecebimentos(){
  const search = document.getElementById('recebimentoSearch').value.trim().toLowerCase();
  let filtrado = recebimentoData.filter(r=>{
    return !search || (r.numero_pedido||'').toLowerCase().includes(search) || (r.fornecedor||'').toLowerCase().includes(search);
  });
  filtrado = aplicarOrdenacao(filtrado, estado.recebimento);
  const pagina = paginar(filtrado, estado.recebimento);

  const tbody = document.getElementById('recebimentoTableBody');
  document.getElementById('recebimentoEmpty').style.display = filtrado.length ? 'none' : 'block';
  tbody.innerHTML = pagina.map(r=>`
    <tr onclick='abrirModalRecebimento(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
      <td><strong>${r.numero_pedido||'—'}</strong></td>
      <td>${r.numero_os||'—'}</td>
      <td>${r.fornecedor||'—'}</td>
      <td>${r.nf||'—'}</td>
      <td>${(r.quantidade_recebida||'—')}/${(r.quantidade_solicitada||'—')}</td>
      <td>${simNao(r.recebimento_parcial)}</td>
      <td>${simNao(r.divergencia)}</td>
      <td>${formatarData(r.data_recebimento)}</td>
    </tr>`).join('');
  renderPaginacao('recebimentoPagination', 'recebimento', filtrado.length);
}

// ===== PROCESSO (bot da Fernanda) — carregado sob demanda =====
function badgeGenerico(status){
  const s = (status||'').toString().toLowerCase();
  let cls = 'badge-generic';
  if(s.includes('conclu') || s.includes('aprovad') || s.includes('assinad')) cls = 'badge-fechada';
  else if(s.includes('pend') || s.includes('aguard')) cls = 'badge-aberta';
  else if(s.includes('cancel') || s.includes('reprovad')) cls = 'badge-cancelada';
  if(!status) return '—';
  return `<span class="badge ${cls}">${status}</span>`;
}

function mostrarTabProcesso(nome, btn){
  btn.parentElement.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('subtab-solicitacoes').style.display = nome==='solicitacoes' ? 'block':'none';
  document.getElementById('subtab-aprovacoes').style.display = nome==='aprovacoes' ? 'block':'none';
  document.getElementById('subtab-documentos').style.display = nome==='documentos' ? 'block':'none';
}

async function carregarProcesso(){
  try{
    const res = await apiFetch({}, { secao:'processo' });
    const data = await res.json();
    solicitacaoData = data.solicitacoesList || [];
    aprovacaoData = data.aprovacoesList || [];
    documentoData = data.documentosList || [];
    processoCarregado = true;
    renderSolicitacoes();
    renderAprovacoes();
    renderDocumentos();
  }catch(err){
    if(err.message !== 'Sessão expirada') console.error(err);
  }
}

function renderSolicitacoes(){
  const search = document.getElementById('solicitacaoSearch').value.trim().toLowerCase();
  let filtrado = solicitacaoData.filter(s=>{
    return !search || (s.pedido_numero||'').toLowerCase().includes(search) || (s.nome_solicitante||'').toLowerCase().includes(search);
  });
  filtrado = aplicarOrdenacao(filtrado, estado.solicitacao);
  const pagina = paginar(filtrado, estado.solicitacao);
  const tbody = document.getElementById('solicitacaoTableBody');
  document.getElementById('solicitacaoEmpty').style.display = filtrado.length ? 'none' : 'block';
  tbody.innerHTML = pagina.map(s=>`
    <tr>
      <td><strong>${s.pedido_numero||'—'}</strong></td>
      <td>${s.nome_solicitante||'—'}</td>
      <td>${badgeGenerico(s.status_geral)}</td>
      <td>${s.assinante1_nome||'—'} ${badgeGenerico(s.assinante1_status)}</td>
      <td>${s.assinante2_nome||'—'} ${badgeGenerico(s.assinante2_status)}</td>
      <td>${formatarData(s.criado_em)}</td>
    </tr>`).join('');
  renderPaginacao('solicitacaoPagination', 'solicitacao', filtrado.length);
}

function renderAprovacoes(){
  const search = document.getElementById('aprovacaoSearch').value.trim().toLowerCase();
  let filtrado = aprovacaoData.filter(a=> !search || (a.pedido_numero||'').toLowerCase().includes(search));
  filtrado = aplicarOrdenacao(filtrado, estado.aprovacao);
  const pagina = paginar(filtrado, estado.aprovacao);
  const tbody = document.getElementById('aprovacaoTableBody');
  document.getElementById('aprovacaoEmpty').style.display = filtrado.length ? 'none' : 'block';
  tbody.innerHTML = pagina.map(a=>`
    <tr>
      <td><strong>${a.pedido_numero||'—'}</strong></td>
      <td>${badgeGenerico(a.status)}</td>
      <td>${formatarData(a.criado_em)}</td>
      <td>${formatarData(a.decidido_em)}</td>
    </tr>`).join('');
  renderPaginacao('aprovacaoPagination', 'aprovacao', filtrado.length);
}

function renderDocumentos(){
  const search = document.getElementById('documentoSearch').value.trim().toLowerCase();
  let filtrado = documentoData.filter(d=>{
    return !search || (d.pedido_numero||'').toLowerCase().includes(search) || (d.tipo_documento||'').toLowerCase().includes(search);
  });
  filtrado = aplicarOrdenacao(filtrado, estado.documento);
  const pagina = paginar(filtrado, estado.documento);
  const tbody = document.getElementById('documentoTableBody');
  document.getElementById('documentoEmpty').style.display = filtrado.length ? 'none' : 'block';
  tbody.innerHTML = pagina.map(d=>`
    <tr>
      <td><strong>${d.pedido_numero||'—'}</strong></td>
      <td>${d.tipo_documento||'—'}</td>
      <td>${d.nome_arquivo||'—'}</td>
      <td>${d.enviado_por_nome||d.enviado_por_telefone||'—'}</td>
      <td>${formatarData(d.enviado_em)}</td>
    </tr>`).join('');
  renderPaginacao('documentoPagination', 'documento', filtrado.length);
}

async function carregarDados(mes){
  setText('lastUpdate', 'atualizando…');
  try{
    const res = await apiFetch({}, mes ? { mes } : null);
    const data = await res.json();

    setText('c_manutencao', data.cards.pedidos_manutencao ?? '–');
    setText('c_compras', data.cards.pedidos_compras ?? '–');
    setText('c_cartao', data.cards.pedidos_cartao ?? '–');
    setText('c_abertas', data.cards.os_abertas ?? '–');
    setText('c_fechadas', data.cards.os_fechadas ?? '–');
    setText('c_valor_os', formatarMoeda(data.cards.valor_os));
    setText('c_valor_pedidos', formatarMoeda(data.cards.valor_pedidos));
    setText('c_valor_cartao', formatarMoeda(data.cards.valor_cartao));

    osData = data.osList || [];
    pedidoData = data.pedidoList || [];
    fornecedorData = data.fornecedoresList || [];
    recebimentoData = data.recebimentosList || [];

    const atualizado = data.atualizado_em ? new Date(data.atualizado_em) : new Date();
    setText('lastUpdate', 'atualizado às ' + atualizado.toLocaleTimeString('pt-BR'));
  }catch(err){
    if(err.message !== 'Sessão expirada'){
      setText('lastUpdate', 'erro ao carregar');
      console.error(err);
    }
  }
}

// ===== MODAL: criar/editar OS, Pedido e Fornecedor =====
let modalTipo = null;   // 'os' | 'pedido' | 'fornecedor'
let modalModo = null;   // 'create' | 'update'
let modalIdFornecedor = null;

function campoHTML(label, id, valor, tipo, opcoes){
  valor = valor==null ? '' : valor;
  if(tipo==='select'){
    const opts = opcoes.map(o=>`<option value="${o}" ${o===valor?'selected':''}>${o||'—'}</option>`).join('');
    return `<div class="field"><label>${label}</label><select id="${id}">${opts}</select></div>`;
  }
  if(tipo==='textarea'){
    return `<div class="field"><label>${label}</label><textarea id="${id}">${valor}</textarea></div>`;
  }
  if(tipo==='date'){
    const v = valor ? String(valor).substring(0,10) : '';
    return `<div class="field"><label>${label}</label><input type="date" id="${id}" value="${v}"></div>`;
  }
  return `<div class="field"><label>${label}</label><input type="text" id="${id}" value="${valor}"></div>`;
}

function abrirModalOS(os){
  modalTipo = 'os';
  modalModo = os ? 'update' : 'create';
  document.getElementById('modalTitulo').textContent = os ? `Editar OS ${os.numero_os}` : 'Nova OS';
  document.getElementById('modalSub').textContent = os ? 'Altere os campos e salve.' : 'Preencha os dados da nova ordem de serviço.';
  document.getElementById('modalErro').style.display = 'none';
  const f = os || {};
  document.getElementById('modalForm').innerHTML = [
    campoHTML('Número da OS','f_numero_os', f.numero_os, 'text'),
    campoHTML('Status','f_status', f.status||'ABERTA', 'select', ['ABERTA','FECHADA','CANCELADA','OUTRO_DEPARTAMENTO']),
    campoHTML('Situação','f_situacao', f.situacao, 'text'),
    campoHTML('Setor Responsável','f_setor_responsavel', f.setor_responsavel, 'text'),
    campoHTML('Placa','f_placa', f.placa, 'text'),
    campoHTML('Pedido Relacionado','f_pedido_relacionado', f.pedido_relacionado, 'text'),
    campoHTML('Valor (R$)','f_valor', f.valor, 'text'),
    campoHTML('Data de Abertura','f_data_abertura', f.data_abertura, 'date'),
    campoHTML('Observação','f_observacao', f.observacao, 'textarea')
  ].join('');
  if(os){ document.getElementById('f_numero_os').disabled = true; }
  document.getElementById('modalOverlay').classList.add('open');
}

function abrirModalPedido(pedido){
  modalTipo = 'pedido';
  modalModo = pedido ? 'update' : 'create';
  document.getElementById('modalTitulo').textContent = pedido ? `Editar Pedido ${pedido.numero_pedido}` : 'Novo Pedido';
  document.getElementById('modalSub').textContent = pedido ? 'Altere os campos e salve.' : 'Preencha os dados do novo pedido de compra.';
  document.getElementById('modalErro').style.display = 'none';
  const f = pedido || {};
  document.getElementById('modalForm').innerHTML = [
    campoHTML('Número do Pedido','f_numero_pedido', f.numero_pedido, 'text'),
    campoHTML('Setor Responsável','f_setor_responsavel', f.setor_responsavel||'COMPRAS', 'select', ['COMPRAS','MANUTENÇÃO','SGI']),
    campoHTML('Status','f_status_pedido', f.status_pedido||'ABERTO', 'text'),
    campoHTML('Item do Pedido','f_item_pedido', f.item_pedido, 'textarea'),
    campoHTML('OS Relacionada','f_os_relacionada', f.os_relacionada, 'text'),
    campoHTML('Valor (R$)','f_valor_pedido', f.valor, 'text'),
    campoHTML('Data de Abertura','f_data_abertura', f.data_abertura, 'date')
  ].join('');
  if(pedido){ document.getElementById('f_numero_pedido').disabled = true; }
  document.getElementById('modalOverlay').classList.add('open');
}

function abrirModalFornecedor(fornecedor){
  modalTipo = 'fornecedor';
  modalModo = fornecedor ? 'update' : 'create';
  modalIdFornecedor = fornecedor ? fornecedor.id : null;
  document.getElementById('modalTitulo').textContent = fornecedor ? `Editar Fornecedor` : 'Novo Fornecedor';
  document.getElementById('modalSub').textContent = fornecedor ? 'Altere os campos e salve.' : 'Preencha os dados do novo fornecedor.';
  document.getElementById('modalErro').style.display = 'none';
  const f = fornecedor || {};
  document.getElementById('modalForm').innerHTML = [
    campoHTML('Razão Social','f_razao_social', f.razao_social, 'text'),
    campoHTML('Nome Fantasia','f_nome_fantasia', f.nome_fantasia, 'text'),
    campoHTML('CNPJ','f_cnpj', f.cnpj, 'text'),
    campoHTML('Categoria','f_categoria', f.categoria, 'text'),
    campoHTML('Contato','f_contato', f.contato, 'text'),
    campoHTML('Telefone','f_telefone', f.telefone, 'text'),
    campoHTML('E-mail','f_email', f.email, 'text'),
    campoHTML('Condição de Pagamento','f_condicao_pagamento', f.condicao_pagamento, 'text'),
    campoHTML('Observação','f_observacao', f.observacao, 'textarea')
  ].join('');
  document.getElementById('modalOverlay').classList.add('open');
}

let modalIdRecebimento = null;

function abrirModalRecebimento(recebimento){
  modalTipo = 'recebimento';
  modalModo = recebimento ? 'update' : 'create';
  modalIdRecebimento = recebimento ? recebimento.id : null;
  document.getElementById('modalTitulo').textContent = recebimento ? 'Editar Recebimento' : 'Novo Recebimento';
  document.getElementById('modalSub').textContent = recebimento ? 'Altere os campos e salve.' : 'Registre o recebimento de um pedido de compra.';
  document.getElementById('modalErro').style.display = 'none';
  const f = recebimento || {};
  document.getElementById('modalForm').innerHTML = [
    campoHTML('Número do Pedido','f_numero_pedido_r', f.numero_pedido, 'text'),
    campoHTML('Número da OS (opcional)','f_numero_os_r', f.numero_os, 'text'),
    campoHTML('Fornecedor','f_fornecedor', f.fornecedor, 'text'),
    campoHTML('NF','f_nf', f.nf, 'text'),
    campoHTML('Data de Recebimento','f_data_recebimento', f.data_recebimento, 'date'),
    campoHTML('Quantidade Solicitada','f_quantidade_solicitada', f.quantidade_solicitada, 'text'),
    campoHTML('Quantidade Recebida','f_quantidade_recebida', f.quantidade_recebida, 'text'),
    campoHTML('Recebimento Parcial?','f_recebimento_parcial', f.recebimento_parcial ? 'Sim' : 'Não', 'select', ['Não','Sim']),
    campoHTML('Divergência?','f_divergencia', f.divergencia ? 'Sim' : 'Não', 'select', ['Não','Sim']),
    campoHTML('Responsável','f_responsavel', f.responsavel, 'text'),
    campoHTML('Observação','f_observacao_r', f.observacao, 'textarea')
  ].join('');
  document.getElementById('modalOverlay').classList.add('open');
}

function fecharModal(){
  document.getElementById('modalOverlay').classList.remove('open');
}

async function salvarModal(){
  const erroBox = document.getElementById('modalErro');
  erroBox.style.display = 'none';
  const btn = document.getElementById('btnSalvarModal');

  let action, body;
  if(modalTipo === 'os'){
    action = modalModo === 'create' ? 'create_os' : 'update_os';
    body = {
      action,
      numero_os: document.getElementById('f_numero_os').value.trim(),
      status: document.getElementById('f_status').value,
      situacao: document.getElementById('f_situacao').value.trim(),
      setor_responsavel: document.getElementById('f_setor_responsavel').value.trim(),
      placa: document.getElementById('f_placa').value.trim(),
      pedido_relacionado: document.getElementById('f_pedido_relacionado').value.trim(),
      valor: parseFloat(document.getElementById('f_valor').value.replace(',','.')) || 0,
      data_abertura: document.getElementById('f_data_abertura').value || null,
      observacao: document.getElementById('f_observacao').value.trim()
    };
  } else if(modalTipo === 'pedido'){
    action = modalModo === 'create' ? 'create_pedido' : 'update_pedido';
    body = {
      action,
      numero_pedido: document.getElementById('f_numero_pedido').value.trim(),
      setor_responsavel: document.getElementById('f_setor_responsavel').value.trim(),
      status_pedido: document.getElementById('f_status_pedido').value.trim(),
      item_pedido: document.getElementById('f_item_pedido').value.trim(),
      os_relacionada: document.getElementById('f_os_relacionada').value.trim(),
      valor: parseFloat(document.getElementById('f_valor_pedido').value.replace(',','.')) || 0,
      data_abertura: document.getElementById('f_data_abertura').value || null
    };
  } else if(modalTipo === 'fornecedor'){
    action = modalModo === 'create' ? 'create_fornecedor' : 'update_fornecedor';
    body = {
      action,
      id: modalIdFornecedor,
      razao_social: document.getElementById('f_razao_social').value.trim(),
      nome_fantasia: document.getElementById('f_nome_fantasia').value.trim(),
      cnpj: document.getElementById('f_cnpj').value.trim(),
      categoria: document.getElementById('f_categoria').value.trim(),
      contato: document.getElementById('f_contato').value.trim(),
      telefone: document.getElementById('f_telefone').value.trim(),
      email: document.getElementById('f_email').value.trim(),
      condicao_pagamento: document.getElementById('f_condicao_pagamento').value.trim(),
      observacao: document.getElementById('f_observacao').value.trim()
    };
  } else {
    action = modalModo === 'create' ? 'create_recebimento' : 'update_recebimento';
    body = {
      action,
      id: modalIdRecebimento,
      numero_pedido: document.getElementById('f_numero_pedido_r').value.trim(),
      numero_os: document.getElementById('f_numero_os_r').value.trim(),
      fornecedor: document.getElementById('f_fornecedor').value.trim(),
      nf: document.getElementById('f_nf').value.trim(),
      data_recebimento: document.getElementById('f_data_recebimento').value || null,
      quantidade_solicitada: document.getElementById('f_quantidade_solicitada').value.trim(),
      quantidade_recebida: document.getElementById('f_quantidade_recebida').value.trim(),
      recebimento_parcial: document.getElementById('f_recebimento_parcial').value === 'Sim',
      divergencia: document.getElementById('f_divergencia').value === 'Sim',
      responsavel: document.getElementById('f_responsavel').value.trim(),
      observacao: document.getElementById('f_observacao_r').value.trim()
    };
  }

  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try{
    const res = await apiFetch({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(!res.ok){
      erroBox.textContent = data.erro || 'Não foi possível salvar.';
      erroBox.style.display = 'block';
      return;
    }
    fecharModal();
    await carregarDados();
    if(modalTipo==='os' && typeof renderOS==='function' && document.getElementById('osTableBody')) renderOS();
    if(modalTipo==='pedido' && typeof renderPedidos==='function' && document.getElementById('pedidoTableBody')) renderPedidos();
    if(modalTipo==='fornecedor' && typeof renderFornecedores==='function' && document.getElementById('fornecedorTableBody')) renderFornecedores();
    if(modalTipo==='recebimento' && typeof renderRecebimentos==='function' && document.getElementById('recebimentoTableBody')) renderRecebimentos();
  }catch(err){
    if(err.message !== 'Sessão expirada'){
      erroBox.textContent = 'Erro de conexão ao salvar.';
      erroBox.style.display = 'block';
      console.error(err);
    }
  }finally{
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}
