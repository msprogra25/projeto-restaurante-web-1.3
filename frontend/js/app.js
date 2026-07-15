/* ============================================================
   STATE & STORAGE
   ============================================================ */
const DEFAULT_MENU = [
  {id:"m1", nome:"Costela no Bafo", categoria:"Pratos", preco:38.90, desc:"8 horas na brasa, desmancha no garfo.", emoji:"🍖", opcoes:[{nome:"Sem cebola",valor:0},{nome:"Com cebola extra",valor:0}], imagem:"https://loremflickr.com/400/300/ribs,bbq?lock=101"},
  {id:"m2", nome:"Picanha na Chapa", categoria:"Pratos", preco:52.00, desc:"Com arroz, farofa e vinagrete.", emoji:"🥩", opcoes:[{nome:"Ponto mal passado",valor:0},{nome:"Ponto ao ponto",valor:0},{nome:"Ponto bem passado",valor:0}], imagem:"https://loremflickr.com/400/300/steak,brazilian?lock=102"},
  {id:"m3", nome:"X-Brasa Especial", categoria:"Lanches", preco:26.50, desc:"Blend 180g, queijo coalho e cebola caramelizada.", emoji:"🍔", opcoes:[{nome:"Sem cebola",valor:0},{nome:"Com cebola",valor:0},{nome:"Sem picles",valor:0},{nome:"Bacon extra",valor:5},{nome:"Queijo extra",valor:4}], imagem:"https://loremflickr.com/400/300/burger?lock=103"},
  {id:"m4", nome:"Coxinha da Casa", categoria:"Lanches", preco:9.50, desc:"Massa cremosa, frango desfiado.", emoji:"🍗", opcoes:[], imagem:"https://loremflickr.com/400/300/croquette,brazilianfood?lock=104"},
  {id:"m5", nome:"Caipirinha", categoria:"Bebidas", preco:16.00, desc:"Limão tahiti ou fruta da estação.", emoji:"🍹", opcoes:[{nome:"Sem gelo",valor:0},{nome:"Com gelo",valor:0},{nome:"Sem açúcar",valor:0},{nome:"Dose dupla",valor:8}], imagem:"https://loremflickr.com/400/300/caipirinha,cocktail?lock=105"},
  {id:"m6", nome:"Suco Natural", categoria:"Bebidas", preco:9.00, desc:"Peça o sabor no pedido.", emoji:"🥤", opcoes:[{nome:"Sem gelo",valor:0},{nome:"Com gelo",valor:0},{nome:"Sem açúcar",valor:0}], imagem:"https://loremflickr.com/400/300/juice,fruit?lock=106"},
  {id:"m7", nome:"Pudim de Leite", categoria:"Sobremesas", preco:12.00, desc:"Receita da vó, calda na medida.", emoji:"🍮", opcoes:[], imagem:"https://loremflickr.com/400/300/pudding,flan?lock=107"},
  {id:"m8", nome:"Brigadeirão Gelado", categoria:"Sobremesas", preco:14.00, desc:"Cremoso com raspas de chocolate.", emoji:"🍫", opcoes:[], imagem:"https://loremflickr.com/400/300/chocolate,dessert?lock=108"},
];
const DEFAULT_ADDONS = [
  {nome:"Sem cebola", categoria:"Todas", valor:0},
  {nome:"Com cebola", categoria:"Todas", valor:0},
  {nome:"Sem pimenta", categoria:"Todas", valor:0},
  {nome:"Sem gelo", categoria:"Bebidas", valor:0},
  {nome:"Com gelo", categoria:"Bebidas", valor:0},
  {nome:"Sem açúcar", categoria:"Bebidas", valor:0},
  {nome:"Dose dupla", categoria:"Bebidas", valor:8.00},
  {nome:"Ponto mal passado", categoria:"Pratos", valor:0},
  {nome:"Ponto ao ponto", categoria:"Pratos", valor:0},
  {nome:"Ponto bem passado", categoria:"Pratos", valor:0},
  {nome:"Sem picles", categoria:"Lanches", valor:0},
  {nome:"Bacon extra", categoria:"Lanches", valor:5.00},
  {nome:"Queijo extra", categoria:"Lanches", valor:4.00},
];

let menu = [];
let orders = [];
let addonsLibrary = [];
let categorias = []; // lista dinâmica de categorias
let cart = {};
let selectedCategory = "Todos";
let selectedPay = null;
let currentTrackingId = null;
let trackPoll = null;
let editingCatIndex = null; // índice da categoria em edição

let vendedorAccounts = [];
let motoAccounts = [];
let vendedorSession = null;
let motoSession = null;
let vendAuthView = 'login'; // 'login' | 'reset' | 'bootstrap'
let motoAuthView = 'login'; // 'login' | 'reset'
let miImageData = null;   // uploaded file, base64 dataURL
let editingItemId = null;
let emailConfig = { principal: "contato@brasa.com.br" };
let paymentConfig = { chavePix: "brasa@pagamento.com", mensagemCartao: "Pagamento na maquininha, na hora da entrega. Nenhum dado de cartão é coletado aqui." };
let emailLog = [];

/* Camada de armazenamento: usa window.storage (Claude) quando disponível;
   se o site estiver rodando fora do ambiente do Claude (ex: arquivo baixado
   e aberto direto no navegador) ou se a chamada travar/demorar, cai
   automaticamente para localStorage, para que contas, cardápio e
   adicionamentos continuem sendo salvos normalmente. */
const STORAGE_MODE = (typeof window.storage !== 'undefined' && window.storage) ? 'claude' : 'local';
function withTimeout(promise, ms){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')), ms))
  ]);
}
async function storeGet(key){
  if(STORAGE_MODE==='claude'){
    try{ return await withTimeout(window.storage.get(key, true), 4000); }
    catch(e){ /* cai para localStorage */ }
  }
  const raw = localStorage.getItem('brasa::'+key);
  if(raw===null) throw new Error('not found');
  return { key, value: raw };
}
async function storeSet(key, value){
  if(STORAGE_MODE==='claude'){
    try{ return await withTimeout(window.storage.set(key, value, true), 4000); }
    catch(e){ /* cai para localStorage */ }
  }
  localStorage.setItem('brasa::'+key, value);
  return { key, value };
}

function normOpt(o){
  if(typeof o === 'string') return {nome:o, valor:0};
  return {nome:o.nome, valor: (typeof o.valor==='number' && !isNaN(o.valor)) ? o.valor : 0, libId:o.libId};
}
// Resolve o nome/valor ATUAIS de uma opção vinculada a um item do cardápio.
// 1) Se ela tem libId (veio da biblioteca através do formulário), busca o
//    adicionamento por id — é a forma mais precisa de vincular.
// 2) Se não tem libId (ex: itens de exemplo/antigos, cadastrados antes de
//    existir esse vínculo), tentamos casar por NOME + categoria compatível
//    na biblioteca, para que editar um adicionamento também reflita nesses
//    itens mais antigos.
// 3) Se nada for encontrado, usa o valor gravado no próprio item (snapshot).
function resolveOpcao(o, itemCategoria){
  if(o.libId){
    const porId = addonsLibrary.find(a=>a.id===o.libId);
    if(porId) return {nome:porId.nome, valor:porId.valor};
  }
  const porNome = addonsLibrary.find(a=>
    a.nome.toLowerCase()===o.nome.toLowerCase() &&
    (!itemCategoria || a.categoria==='Todas' || a.categoria===itemCategoria)
  );
  if(porNome) return {nome:porNome.nome, valor:porNome.valor};
  return {nome:o.nome, valor:o.valor||0};
}
// Adicionamentos de um item agora são automáticos: todo item "herda" os
// adicionamentos da biblioteca que combinam com a categoria dele (ou os
// marcados como "Todas"). Não é mais preciso vincular manualmente no
// cadastro do produto — editar a biblioteca em "Adicionamentos" já reflete
// em tempo real em todos os itens daquela categoria.
function opcoesParaItem(item){
  return addonsLibrary
    .filter(a=>a.categoria==='Todas' || a.categoria===item.categoria)
    .map(a=>({nome:a.nome, valor:a.valor, libId:a.id}));
}
async function loadMenu(){
  try{
    const r = await storeGet('menu-items');
    menu = JSON.parse(r.value);
    let precisaCorrigir = false;
    menu.forEach(m=>{
      const original = JSON.stringify(m.opcoes||[]);
      m.opcoes = (m.opcoes||[]).map(normOpt);
      if(JSON.stringify(m.opcoes) !== original) precisaCorrigir = true;
      if(typeof m.imagem === 'undefined') { m.imagem = ''; precisaCorrigir = true; }
      // Autocorreção: se este é um item de exemplo (m1..m8) que ficou sem nenhuma opção
      // ou sem imagem por causa de dados antigos salvos, restaura os valores de fábrica dele.
      const def = DEFAULT_MENU.find(d=>d.id===m.id);
      if(def){
        if(m.opcoes.length===0 && def.opcoes.length>0){ m.opcoes = def.opcoes.map(o=>({...o})); precisaCorrigir = true; }
        if(!m.imagem && def.imagem){ m.imagem = def.imagem; precisaCorrigir = true; }
      }
    });
    if(precisaCorrigir) await saveMenu(); // conserta permanentemente dados salvos em formato antigo
  }
  catch(e){ menu = DEFAULT_MENU.map(m=>({...m, opcoes:(m.opcoes||[]).map(o=>({...o}))})); await storeSet('menu-items', JSON.stringify(menu)).catch(()=>{}); }
}
async function saveMenu(){ try{ await storeSet('menu-items', JSON.stringify(menu)); }catch(e){ toast('Erro ao salvar cardápio'); } }
async function loadOrders(){ try{ const r = await storeGet('orders-list'); orders = JSON.parse(r.value); } catch(e){ orders = []; } }
async function saveOrders(){ try{ await storeSet('orders-list', JSON.stringify(orders)); }catch(e){ toast('Erro ao salvar pedido'); } }
async function loadVendedorAccounts(){
  try{ const r = await storeGet('vendedor-accounts'); vendedorAccounts = JSON.parse(r.value); } catch(e){ vendedorAccounts = []; }
  // Migração: contas antigas salvas com senha em texto puro (versões anteriores)
  // são convertidas para hash automaticamente, uma única vez.
  let precisaMigrar = false;
  for(const acc of vendedorAccounts){
    if(!acc.senhaHash && acc.senha){
      acc.senhaHash = await hashPassword(acc.senha);
      delete acc.senha;
      precisaMigrar = true;
    }
  }
  // Garante uma conta padrão de acesso SOMENTE se nunca existiu nenhuma conta ainda
  // (primeiro uso do sistema). Antes essa checagem era "se vendedor@gmail.com não
  // existe", o que fazia a conta padrão voltar sozinha mesmo depois de ser excluída
  // de propósito — corrigido para checar se a lista está totalmente vazia.
  if(vendedorAccounts.length === 0){
    vendedorAccounts.push({nome:'Vendedor', email:'vendedor@gmail.com', senhaHash: await hashPassword('1234')});
    precisaMigrar = true;
  }
  if(precisaMigrar) await saveVendedorAccounts();
}
async function saveVendedorAccounts(){ try{ await storeSet('vendedor-accounts', JSON.stringify(vendedorAccounts)); }catch(e){ toast('Erro ao salvar conta'); } }
async function loadMotoAccounts(){ try{ const r = await storeGet('motoqueiro-accounts'); motoAccounts = JSON.parse(r.value); } catch(e){ motoAccounts = []; }
  let precisaMigrarMoto = false;
  for(const acc of motoAccounts){
    if(!acc.senhaHash && acc.senha){
      acc.senhaHash = await hashPassword(acc.senha);
      delete acc.senha;
      precisaMigrarMoto = true;
    }
  }
  if(precisaMigrarMoto) await saveMotoAccounts();
}
async function saveMotoAccounts(){ try{ await storeSet('motoqueiro-accounts', JSON.stringify(motoAccounts)); }catch(e){ toast('Erro ao salvar conta'); } }
async function loadEmailConfig(){
  try{ const r = await storeGet('email-config'); emailConfig = JSON.parse(r.value); }
  catch(e){ emailConfig = { principal: "contato@brasa.com.br" }; await storeSet('email-config', JSON.stringify(emailConfig)).catch(()=>{}); }
}
async function saveEmailConfig(){ try{ await storeSet('email-config', JSON.stringify(emailConfig)); }catch(e){ toast('Erro ao salvar e-mail principal'); } }
async function loadPaymentConfig(){
  try{ const r = await storeGet('payment-config'); paymentConfig = JSON.parse(r.value); }
  catch(e){
    paymentConfig = { chavePix: "brasa@pagamento.com", mensagemCartao: "Pagamento na maquininha, na hora da entrega. Nenhum dado de cartão é coletado aqui." };
    await storeSet('payment-config', JSON.stringify(paymentConfig)).catch(()=>{});
  }
}
async function savePaymentConfig(){ try{ await storeSet('payment-config', JSON.stringify(paymentConfig)); }catch(e){ toast('Erro ao salvar formas de pagamento'); } }
async function salvarPaymentConfig(){
  const chavePix = document.getElementById('pay-pix-input').value.trim();
  const mensagemCartao = document.getElementById('pay-cartao-input').value.trim();
  const errEl = document.getElementById('pay-config-error');
  if(!chavePix){ errEl.textContent = 'Informe a chave Pix.'; return; }
  if(!mensagemCartao){ errEl.textContent = 'Informe a mensagem do cartão.'; return; }
  errEl.textContent = '';
  paymentConfig = { chavePix, mensagemCartao };
  await savePaymentConfig();
  toast('Formas de pagamento atualizadas!');
}
async function loadEmailLog(){ try{ const r = await storeGet('email-log'); emailLog = JSON.parse(r.value); } catch(e){ emailLog = []; } }
async function saveEmailLog(){ try{ await storeSet('email-log', JSON.stringify(emailLog)); }catch(e){ toast('Erro ao salvar mensagem'); } }
async function logEmail(para, assunto, corpo){
  await loadEmailLog();
  emailLog.unshift({ id:'MSG'+Date.now(), de: emailConfig.principal, para, assunto, corpo, criadoEm: Date.now() });
  await saveEmailLog();
}
/* ============================================================
   CATEGORIAS: carregamento, salvamento e operações CRUD
   ============================================================ */
const DEFAULT_CATEGORIAS = ['Lanches', 'Pratos', 'Bebidas', 'Sobremesas'];
async function loadCategorias(){
  try{
    const r = await storeGet('categorias-list');
    categorias = JSON.parse(r.value);
    if(!Array.isArray(categorias) || categorias.length===0) throw new Error('empty');
  } catch(e){
    categorias = [...DEFAULT_CATEGORIAS];
    await storeSet('categorias-list', JSON.stringify(categorias)).catch(()=>{});
  }
}
async function saveCategorias(){
  try{ await storeSet('categorias-list', JSON.stringify(categorias)); }
  catch(e){ toast('Erro ao salvar categorias'); }
}
function populateCatSelects(){
  // Atualiza o <select> de categoria do item e do adicionamento com a lista dinâmica
  const opts = ['<option value="">— selecione —</option>', ...categorias.map(c=>`<option>${c}</option>`)].join('');
  const optsComTodas = ['<option>Todas</option>', ...categorias.map(c=>`<option>${c}</option>`)].join('');
  const miCat = document.getElementById('mi-categoria');
  const adCat = document.getElementById('addon-categoria');
  if(miCat){
    const prev = miCat.value;
    miCat.innerHTML = categorias.map(c=>`<option>${c}</option>`).join('');
    if(categorias.includes(prev)) miCat.value = prev;
  }
  if(adCat){
    const prev = adCat.value;
    adCat.innerHTML = optsComTodas;
    if(['Todas',...categorias].includes(prev)) adCat.value = prev;
  }
}
async function submitCategoria(){
  const nome = document.getElementById('cat-nome').value.trim();
  const errEl = document.getElementById('cat-error');
  if(!nome){ errEl.textContent = 'Informe o nome da categoria.'; return; }
  await loadCategorias();
  if(editingCatIndex !== null){
    // Modo edição: renomeia a categoria e atualiza itens/adicionamentos
    const nomeAntigo = categorias[editingCatIndex];
    if(nomeAntigo !== nome){
      // Verifica duplicidade
      if(categorias.some((c,i)=>c.toLowerCase()===nome.toLowerCase() && i!==editingCatIndex)){
        errEl.textContent = 'Já existe uma categoria com esse nome.'; return;
      }
      // Atualiza nome nos itens do cardápio
      await loadMenu();
      menu.forEach(m=>{ if(m.categoria===nomeAntigo) m.categoria=nome; });
      await saveMenu();
      // Atualiza nome nos adicionamentos
      await loadAddons();
      addonsLibrary.forEach(a=>{ if(a.categoria===nomeAntigo) a.categoria=nome; });
      await saveAddons();
      categorias[editingCatIndex] = nome;
      await saveCategorias();
      toast(`Categoria renomeada para "${nome}"! Cardápio e adicionamentos atualizados.`);
    } else {
      toast('Nenhuma alteração detectada.');
    }
  } else {
    // Modo criação
    if(categorias.some(c=>c.toLowerCase()===nome.toLowerCase())){
      errEl.textContent = 'Já existe uma categoria com esse nome.'; return;
    }
    categorias.push(nome);
    await saveCategorias();
    toast(`Categoria "${nome}" criada e salva!`);
  }
  errEl.textContent = '';
  cancelEditCategoria();
  populateCatSelects();
  renderCategorias();
  renderChips(); renderMenu();
}
function editCategoria(idx){
  editingCatIndex = idx;
  document.getElementById('cat-nome').value = categorias[idx];
  document.getElementById('cat-error').textContent = '';
  document.getElementById('cat-form-title').textContent = `Editando: "${categorias[idx]}"`;
  document.getElementById('cat-submit-btn').textContent = 'Salvar alterações';
  document.getElementById('cat-cancel-btn').style.display = 'block';
  document.getElementById('cat-nome').scrollIntoView({behavior:'smooth', block:'center'});
}
function cancelEditCategoria(){
  editingCatIndex = null;
  document.getElementById('cat-nome').value = '';
  document.getElementById('cat-form-title').textContent = 'Nova categoria';
  document.getElementById('cat-submit-btn').textContent = '+ Salvar categoria';
  document.getElementById('cat-cancel-btn').style.display = 'none';
}
async function removerCategoria(idx){
  await loadCategorias();
  const nome = categorias[idx];
  const itensNaCategoria = menu.filter(m=>m.categoria===nome).length;
  const aviso = itensNaCategoria>0 ? `\n⚠️ ${itensNaCategoria} item(s) do cardápio pertencem a esta categoria e ficarão sem categoria definida.` : '';
  const ok = window.confirm(`Excluir permanentemente a categoria "${nome}"?${aviso}\nEssa ação não pode ser desfeita.`);
  if(!ok) return;
  categorias.splice(idx, 1);
  await saveCategorias();
  if(editingCatIndex===idx) cancelEditCategoria();
  populateCatSelects();
  renderCategorias();
  renderChips(); renderMenu();
  toast(`Categoria "${nome}" excluída.`);
}
async function resetCategoriasToDefaults(){
  const ok = window.confirm('Isso vai restaurar as categorias padrão (Lanches, Pratos, Bebidas, Sobremesas). Continuar?');
  if(!ok) return;
  categorias = [...DEFAULT_CATEGORIAS];
  await saveCategorias();
  populateCatSelects();
  renderCategorias();
  renderChips(); renderMenu();
  toast('Categorias restauradas!');
}
function renderCategorias(){
  const el = document.getElementById('cat-list');
  if(!el) return;
  if(categorias.length===0){ el.innerHTML = `<div class="empty-state">Nenhuma categoria cadastrada.</div>`; return; }
  const corMapa = {Lanches:'var(--cat-lanches)',Pratos:'var(--cat-pratos)',Bebidas:'var(--cat-bebidas)',Sobremesas:'var(--cat-sobremesas)'};
  el.innerHTML = categorias.map((c,i)=>{
    const cor = corMapa[c]||'var(--gold)';
    const qtd = menu.filter(m=>m.categoria===c).length;
    return `<div class="acc-row" style="border-left:3px solid ${cor};">
      <span style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${cor};box-shadow:0 0 7px ${cor};flex:0 0 auto;"></span>
        <span><strong style="color:var(--cream);">${c}</strong> <span style="color:var(--cream-dim);font-size:.78rem;">(${qtd} item${qtd!==1?'s':''})</span></span>
      </span>
      <span class="acc-actions">
        <button class="btn btn-ghost btn-sm" onclick="editCategoria(${i})">✏️ Renomear</button>
        <button class="btn btn-red btn-sm" onclick="removerCategoria(${i})">🗑️ Excluir</button>
      </span>
    </div>`;
  }).join('');
}

async function loadAddons(){
  try{
    const r = await storeGet('addons-library');
    addonsLibrary = JSON.parse(r.value);
    let precisaCorrigir = false;
    addonsLibrary = addonsLibrary.map((a,i)=>{
      if(typeof a === 'string'){ precisaCorrigir = true; return {id:'ad'+Date.now()+i, nome:a, categoria:'Todas', valor:0}; }
      if(typeof a.categoria === 'undefined' || typeof a.valor === 'undefined' || typeof a.id === 'undefined'){
        precisaCorrigir = true;
        return {id:a.id||('ad'+Date.now()+i), nome:a.nome, categoria:a.categoria||'Todas', valor:a.valor||0};
      }
      return a;
    });
    if(precisaCorrigir) await saveAddons(); // conserta permanentemente dados salvos em formato antigo
    if(addonsLibrary.length===0){
      addonsLibrary = DEFAULT_ADDONS.map((a,i)=>({id:'ad'+Date.now()+i, ...a}));
      await saveAddons();
    }
  }
  catch(e){
    addonsLibrary = DEFAULT_ADDONS.map((a,i)=>({id:'ad'+Date.now()+i, ...a}));
    await storeSet('addons-library', JSON.stringify(addonsLibrary)).catch(()=>{});
  }
}
async function saveAddons(){ try{ await storeSet('addons-library', JSON.stringify(addonsLibrary)); }catch(e){ toast('Erro ao salvar adicionamentos'); } }

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function clearErr(id){ const el=document.getElementById(id); if(el) el.textContent=''; }
function money(v){ return 'R$ ' + v.toFixed(2).replace('.', ','); }
function genId(){ return 'BR' + Math.floor(1000+Math.random()*9000); }
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
/* ============================================================
   MODO CLARO / ESCURO (com ícone de sol/lua e preferência salva)
   ============================================================ */
async function loadTheme(){
  let tema = 'dark';
  try{ const r = await storeGet('tema-preferido'); tema = r.value; }
  catch(e){
    // Sem preferência salva ainda: respeita o tema do sistema operacional, se disponível.
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) tema = 'light';
  }
  aplicarTema(tema);
}
function aplicarTema(tema){
  if(tema==='light'){
    document.documentElement.setAttribute('data-theme','light');
    document.getElementById('theme-toggle-knob').textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-toggle-knob').textContent = '🌙';
  }
}
async function toggleTheme(){
  const atual = document.documentElement.getAttribute('data-theme')==='light' ? 'light' : 'dark';
  const novo = atual==='light' ? 'dark' : 'light';
  aplicarTema(novo);
  try{ await storeSet('tema-preferido', novo); }catch(e){ /* preferência de tema é só estética, ignora erro silenciosamente */ }
}

function genTempPassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p=''; for(let i=0;i<8;i++) p += chars[Math.floor(Math.random()*chars.length)];
  return p;
}

/* ============================================================
   HASH DE SENHA (Web Crypto API nativa do navegador — sem dependências externas)
   Nunca guardamos senha em texto puro. Usamos PBKDF2 com salt aleatório e
   100.000 iterações (padrão recomendado), gerando uma string no formato:
   "pbkdf2$<iterações>$<salt em hex>$<hash em hex>"
   ============================================================ */
const PBKDF2_ITERACOES = 100000;
function bufferParaHex(buffer){
  return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function hexParaBuffer(hex){
  const bytes = new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++) bytes[i] = parseInt(hex.substr(i*2,2),16);
  return bytes;
}
async function derivarHash(senha, saltBytes, iteracoes){
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', salt:saltBytes, iterations:iteracoes, hash:'SHA-256' },
    keyMaterial, 256
  );
  return bufferParaHex(bits);
}
// Gera o hash de uma senha nova (usado ao criar conta, trocar senha ou redefinir senha).
async function hashPassword(senha){
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await derivarHash(senha, saltBytes, PBKDF2_ITERACOES);
  return `pbkdf2$${PBKDF2_ITERACOES}$${bufferParaHex(saltBytes)}$${hashHex}`;
}
// Verifica se a senha digitada corresponde ao hash salvo.
async function verifyPassword(senhaDigitada, hashSalvo){
  if(!hashSalvo) return false;
  const partes = hashSalvo.split('$');
  if(partes.length !== 4 || partes[0] !== 'pbkdf2') return false;
  const iteracoes = parseInt(partes[1], 10);
  const saltBytes = hexParaBuffer(partes[2]);
  const hashEsperado = partes[3];
  const hashCalculado = await derivarHash(senhaDigitada, saltBytes, iteracoes);
  return hashCalculado === hashEsperado;
}

/* ============================================================
   ROLE SWITCHING
   ============================================================ */
document.querySelectorAll('.role-tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.role-tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const role = btn.dataset.role;
    document.getElementById('view-'+role).classList.add('active');
    document.getElementById('cart-fab').style.display = role==='cliente' ? 'flex' : 'none';
    if(role==='vendedor' && vendedorSession) renderVendedorOrders();
    if(role==='motoqueiro' && motoSession) renderMotoOrders();
  });
});

/* ============================================================
   CLIENTE: MENU
   ============================================================ */
function renderChips(){
  const cats = ["Todos", ...new Set(menu.map(m=>m.categoria))];
  const wrap = document.getElementById('chips');
  wrap.innerHTML = cats.map(c=>`<button class="chip ${c===selectedCategory?'active':''}" data-cat="${c}">${c}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach(ch=>{
    ch.addEventListener('click', ()=>{ selectedCategory = ch.dataset.cat; renderChips(); renderMenu(); });
  });
}
function renderMenu(){
  const grid = document.getElementById('menu-grid');
  const items = menu.filter(m=> selectedCategory==='Todos' || m.categoria===selectedCategory);
  if(items.length===0){ grid.innerHTML = `<div class="empty-state">Nenhum item nessa categoria ainda.</div>`; return; }
  grid.innerHTML = items.map(m=>`
    <div class="item-card">
      ${m.imagem ? `<img class="item-image" src="${m.imagem}" alt="${m.nome}" onerror="this.outerHTML='<div class=&quot;item-image-fallback&quot;>${m.emoji}</div>'">` : `<div class="item-image-fallback">${m.emoji}</div>`}
      <div class="item-name">${m.nome}</div>
      <div class="item-desc">${m.desc||''}</div>
      <div class="item-row">
        <span class="item-price">${money(m.preco)}</span>
        <button class="btn btn-add" onclick="openItemModal('${m.id}')">Adicionar</button>
      </div>
    </div>`).join('');
}
function cartKey(id, opcoes){ return id + '::' + opcoes.map(o=>o.nome).sort().join('|'); }

let modalItemId = null, modalSelectedOpts = new Map(), modalQty = 1;
function openItemModal(id){
  const item = menu.find(m=>m.id===id); if(!item) return;
  modalItemId = id; modalSelectedOpts = new Map(); modalQty = 1;
  document.getElementById('im-title').textContent = item.nome;
  renderItemModalBody();
  document.getElementById('item-overlay').classList.add('open');
}
function closeItemModal(){ document.getElementById('item-overlay').classList.remove('open'); modalItemId = null; }
function modalUnitTotal(item){
  let extra = 0; modalSelectedOpts.forEach(v=>extra+=v);
  return item.preco + extra;
}
function renderItemModalBody(){
  const item = menu.find(m=>m.id===modalItemId); if(!item) return;
  const opcoes = opcoesParaItem(item); // adicionamentos automáticos pela categoria, sempre atualizados
  const optsHtml = opcoes.length ? `
    <div class="opt-hint" style="margin-bottom:8px;">Quer adicionar ou remover algo? (ex: com cebola, sem cebola)</div>
    ${opcoes.map(o=>`<label class="im-opt-row"><input type="checkbox" ${modalSelectedOpts.has(o.nome)?'checked':''} onchange="toggleModalOpt('${o.nome.replace(/'/g,"\\'")}', ${o.valor})">${o.nome}${o.valor>0?` <span style="color:var(--gold);font-weight:700;">(+${money(o.valor)})</span>`:''}</label>`).join('')}
  ` : `<div class="im-no-opts">Este item não tem opções extras cadastradas pelo vendedor.</div>`;
  document.getElementById('im-body').innerHTML = `
    <div class="im-item-head">
      ${item.imagem ? `<img src="${item.imagem}" alt="${item.nome}" onerror="this.outerHTML='<span class=&quot;emoji&quot;>${item.emoji}</span>'">` : `<span class="emoji">${item.emoji}</span>`}
      <div>
        <div class="item-desc" style="min-height:0;">${item.desc||''}</div>
        <div class="price">${money(item.preco)}</div>
      </div>
    </div>
    <div class="im-qty-row">
      <span class="field-label" style="margin:0;">Quantidade</span>
      <div class="qty-ctrl"><button onclick="changeModalQty(-1)">−</button><span id="im-qty">${modalQty}</span><button onclick="changeModalQty(1)">+</button></div>
    </div>
    ${optsHtml}
    <button class="btn btn-add" style="width:100%;margin-top:6px;" onclick="confirmAddToCart()">Adicionar ao carrinho — <span id="im-total">${money(modalUnitTotal(item)*modalQty)}</span></button>
  `;
}
function toggleModalOpt(nome, valor){
  if(modalSelectedOpts.has(nome)) modalSelectedOpts.delete(nome); else modalSelectedOpts.set(nome, valor);
  const item = menu.find(m=>m.id===modalItemId);
  const totalEl = document.getElementById('im-total');
  if(totalEl) totalEl.textContent = money(modalUnitTotal(item)*modalQty);
}
function changeModalQty(delta){
  modalQty = Math.max(1, modalQty+delta);
  const item = menu.find(m=>m.id===modalItemId);
  document.getElementById('im-qty').textContent = modalQty;
  document.getElementById('im-total').textContent = money(modalUnitTotal(item)*modalQty);
}
function confirmAddToCart(){
  const item = menu.find(m=>m.id===modalItemId); if(!item) return;
  const opcoes = [...modalSelectedOpts].map(([nome,valor])=>({nome,valor}));
  const key = cartKey(item.id, opcoes);
  if(cart[key]) cart[key].qty += modalQty; else cart[key] = {id:item.id, opcoes, qty:modalQty};
  updateCartBadge(); closeItemModal(); toast('Adicionado ao carrinho');
}
function changeQty(key, delta){
  if(!cart[key]) return;
  cart[key].qty += delta;
  if(cart[key].qty<=0) delete cart[key];
  updateCartBadge(); renderCart();
}
function updateCartBadge(){ document.getElementById('cart-badge').textContent = Object.values(cart).reduce((a,b)=>a+b.qty,0); }
function lineUnitPrice(item, opcoes){ return item.preco + opcoes.reduce((s,o)=>s+(o.valor||0),0); }
function cartTotal(){ return Object.values(cart).reduce((sum,line)=>{ const item=menu.find(m=>m.id===line.id); return sum+(item?lineUnitPrice(item,line.opcoes)*line.qty:0); },0); }

/* ============================================================
   CART & CHECKOUT
   ============================================================ */
function openCart(){ renderCart(); document.getElementById('cart-overlay').classList.add('open'); }
function closeOverlay(id){ document.getElementById(id).classList.remove('open'); }
function renderCart(){
  const linesEl = document.getElementById('cart-lines');
  const entries = Object.entries(cart);
  if(entries.length===0){
    linesEl.innerHTML = `<div class="cart-empty">Seu carrinho está vazio.<br>Adicione algo delicioso 🔥</div>`;
    document.getElementById('cart-summary').innerHTML = '';
    document.getElementById('go-checkout').style.display = 'none';
    return;
  }
  linesEl.innerHTML = entries.map(([key,line])=>{
    const item = menu.find(m=>m.id===line.id); if(!item) return '';
    const addonsHtml = line.opcoes.length ? `
      <div class="cl-addons">
        ${line.opcoes.map(o=>`<div class="cl-addon-row"><span>${o.nome}</span><span class="cl-addon-value">${o.valor>0?'+'+money(o.valor):'Grátis'}</span></div>`).join('')}
      </div>` : '';
    return `<div class="cart-line">
      <div class="cl-top">
        <span style="font-size:1.3rem;">${item.emoji}</span>
        <span class="name">${item.nome}<br><span style="color:var(--gold);font-size:.8rem;">${money(lineUnitPrice(item,line.opcoes))}</span></span>
        <div class="qty-ctrl"><button onclick="changeQty('${key}',-1)">−</button><span>${line.qty}</span><button onclick="changeQty('${key}',1)">+</button></div>
      </div>
      ${addonsHtml}
    </div>`;
  }).join('');
  document.getElementById('cart-summary').innerHTML = `<div class="total-row"><span>Total</span><span>${money(cartTotal())}</span></div>`;
  document.getElementById('go-checkout').style.display = 'block';
}
function openCheckout(){
  closeOverlay('cart-overlay'); selectedPay = null;
  document.querySelectorAll('.pay-opt').forEach(p=>p.classList.remove('selected'));
  document.querySelectorAll('input[name=pay]').forEach(r=>r.checked=false);
  document.getElementById('pay-extra').innerHTML = '';
  updateCheckoutTotals();
  document.getElementById('checkout-overlay').classList.add('open');
}
document.querySelectorAll('.pay-opt').forEach(opt=>{
  opt.addEventListener('click', ()=>{
    document.querySelectorAll('.pay-opt').forEach(p=>p.classList.remove('selected'));
    opt.classList.add('selected'); opt.querySelector('input').checked = true;
    selectedPay = opt.dataset.val; clearErr('co-pay-error'); renderPayExtra();
  });
});
function renderPayExtra(){
  const el = document.getElementById('pay-extra'); const total = cartTotal();
  if(selectedPay==='pix'){
    el.innerHTML = `<div class="pix-box">Chave Pix do restaurante: <code>${paymentConfig.chavePix}</code><br>Pague ${money(total)} e envie o comprovante ao entregador.</div>`;
  } else if(selectedPay==='dinheiro'){
    el.innerHTML = `<label class="pay-opt" style="margin-bottom:8px;"><input type="checkbox" id="chk-troco" onchange="toggleTroco()"> Preciso de troco</label>
      <div id="troco-wrap" style="display:none;">
        <label class="field-label">Troco para quanto?</label>
        <input class="field" id="in-troco" type="number" step="0.01" placeholder="Ex: 100" oninput="updateCheckoutTotals()">
        <div class="small-note" id="troco-info"></div>
      </div>`;
  } else if(selectedPay==='cartao'){
    el.innerHTML = `<div class="pix-box">💳 ${paymentConfig.mensagemCartao}</div>`;
  } else { el.innerHTML=''; }
}
function toggleTroco(){ document.getElementById('troco-wrap').style.display = document.getElementById('chk-troco').checked?'block':'none'; updateCheckoutTotals(); }
function updateCheckoutTotals(){
  const total = cartTotal();
  document.getElementById('co-subtotal').textContent = money(total);
  document.getElementById('co-total').textContent = money(total);
  const trocoInput = document.getElementById('in-troco');
  if(trocoInput){
    const trocoInfo = document.getElementById('troco-info');
    const para = parseFloat(trocoInput.value);
    if(!isNaN(para)){
      const diff = para-total;
      trocoInfo.textContent = diff>=0 ? `Levar troco de ${money(diff)}` : `Valor menor que o total do pedido`;
      trocoInfo.style.color = diff>=0 ? 'var(--cream-dim)' : 'var(--red)';
    } else { trocoInfo.textContent=''; }
  }
}
async function submitOrder(){
  const nome = document.getElementById('in-nome').value.trim();
  const telefone = document.getElementById('in-telefone').value.trim();
  const endereco = document.getElementById('in-endereco').value.trim();
  clearErr('co-nome-error'); clearErr('co-tel-error'); clearErr('co-end-error'); clearErr('co-pay-error');
  if(Object.keys(cart).length===0){ toast('Seu carrinho está vazio'); return; }
  if(!nome){ document.getElementById('co-nome-error').textContent = 'Informe seu nome para continuar.'; return; }
  if(!telefone){ document.getElementById('co-tel-error').textContent = 'Informe seu WhatsApp/telefone.'; return; }
  if(!endereco){ document.getElementById('co-end-error').textContent = 'Informe o endereço de entrega.'; return; }
  if(!selectedPay){ document.getElementById('co-pay-error').textContent = 'Escolha uma forma de pagamento.'; return; }
  let pagamento = { tipo: selectedPay };
  if(selectedPay==='dinheiro'){
    const precisaTroco = document.getElementById('chk-troco') ? document.getElementById('chk-troco').checked : false;
    pagamento.trocoPara = precisaTroco ? (parseFloat(document.getElementById('in-troco').value)||null) : null;
    pagamento.precisaTroco = precisaTroco;
  }
  const total = cartTotal();
  const items = Object.values(cart).map(line=>{ const item=menu.find(m=>m.id===line.id); return {id:line.id, nome:item.nome, preco:lineUnitPrice(item,line.opcoes), qtd:line.qty, opcoes:line.opcoes}; });
  const order = { id:genId(), cliente:nome, telefone, endereco, items, total, pagamento, status:'pendente', motoqueiro:null, criadoEm:Date.now() };
  await loadOrders(); orders.push(order); await saveOrders();
  cart = {}; updateCartBadge(); closeOverlay('checkout-overlay'); showTracking(order.id);
  toast('Pedido enviado com sucesso! 🔥');
}

/* ============================================================
   TRACKING
   ============================================================ */
function showTracking(id){
  currentTrackingId = id;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-tracking').classList.add('active');
  document.getElementById('cart-fab').style.display = 'none';
  renderTracking();
  if(trackPoll) clearInterval(trackPoll);
  trackPoll = setInterval(renderTracking, 3000);
}
function itemLineText(i){ return `${i.qtd}× ${i.nome}` + (i.opcoes && i.opcoes.length ? ` <small>(${i.opcoes.map(normOpt).map(o=>o.nome+(o.valor>0?' +'+money(o.valor):'')).join(', ')})</small>` : ''); }
async function renderTracking(){
  await loadOrders();
  const order = orders.find(o=>o.id===currentTrackingId); if(!order) return;
  document.getElementById('track-id').textContent = '#'+order.id;
  const steps = [
    {key:'pendente', lbl:'Recebido', icon:'📝'}, {key:'preparo', lbl:'Em preparo', icon:'🔥'},
    {key:'pronto', lbl:'Pronto', icon:'✅'}, {key:'entrega', lbl:'A caminho', icon:'🏍️'}, {key:'entregue', lbl:'Entregue', icon:'🎉'},
  ];
  const idx = steps.findIndex(s=>s.key===order.status);
  document.getElementById('status-steps').innerHTML = steps.map((s,i)=>`<div class="step ${i<=idx?'done':''}"><div class="dot">${s.icon}</div><div class="lbl">${s.lbl}</div></div>`).join('');
  const payLabel = order.pagamento.tipo==='pix'?'Pix':order.pagamento.tipo==='dinheiro'?'Dinheiro':'Cartão na entrega';
  let trocoTxt = '';
  if(order.pagamento.tipo==='dinheiro' && order.pagamento.precisaTroco && order.pagamento.trocoPara){
    trocoTxt = `<br>Troco para ${money(order.pagamento.trocoPara)} (levar ${money(order.pagamento.trocoPara-order.total)})`;
  }
  // Texto do telefone formatado (apenas dígitos para o link wa.me)
  const telefoneLimpo = (order.telefone||'').replace(/\D/g,'');
  const waMsg = encodeURIComponent(`Olá! Estou acompanhando meu pedido #${order.id} feito na BRASA. Poderia me dar uma atualização?`);
  const waLink = telefoneLimpo ? `https://wa.me/55${telefoneLimpo}?text=${waMsg}` : null;
  const siteLink = window.location.origin + window.location.pathname + `#pedido-${order.id}`;

  document.getElementById('track-details').innerHTML = `
    <strong>${order.cliente}</strong> · ${order.endereco}<br>
    ${order.telefone ? `📱 ${order.telefone}<br>` : ''}
    ${order.items.map(itemLineText).join(', ')}<br>
    Pagamento: ${payLabel}${trocoTxt}<br>
    <strong>Total: ${money(order.total)}</strong>
    ${order.motoqueiro? '<br>Entregador: '+order.motoqueiro : ''}
    ${order.pagamento.tipo==='pix' ? `<div class="pix-box" style="margin-top:14px;">🔑 <strong>Chave Pix para pagamento:</strong><br><code>${paymentConfig.chavePix}</code><br>Valor: <strong>${money(order.total)}</strong><br>Envie o comprovante ao entregador na hora da entrega.</div>` : ''}`;

  // Botões de acompanhamento: site + WhatsApp
  const actionsEl = document.getElementById('track-actions');
  if(actionsEl){
    let btns = `<a class="btn btn-ghost" href="${siteLink}" style="text-align:center;text-decoration:none;display:block;">🔗 Link desta página de acompanhamento</a>`;
    if(waLink) btns += `<a class="btn" href="${waLink}" target="_blank" rel="noopener noreferrer" style="background:#25d366;color:#fff;text-align:center;text-decoration:none;display:block;">💬 Acompanhar pelo WhatsApp</a>`;
    actionsEl.innerHTML = btns;
  }

  if(order.status==='entregue' && trackPoll){ clearInterval(trackPoll); trackPoll=null; }
}
function backToMenu(){
  if(trackPoll){ clearInterval(trackPoll); trackPoll=null; }
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-cliente').classList.add('active');
  document.getElementById('cart-fab').style.display = 'flex';
}

/* ============================================================
   VENDEDOR: AUTENTICAÇÃO (login + recuperação por e-mail — sem autocadastro público)
   ============================================================ */
function renderVendAuth(){
  const el = document.getElementById('vend-auth');
  if(vendedorAccounts.length===0){
    // Primeiro acesso: precisa existir ao menos uma conta principal para o restaurante.
    el.innerHTML = `
      <div class="auth-box">
        <div class="icon">🧑‍🍳</div>
        <h2>Primeiro acesso</h2>
        <p class="hero-sub">Ainda não existe nenhuma conta de vendedor neste restaurante. Crie a conta principal para começar.</p>
        <label class="field-label">Seu nome</label>
        <input class="field" id="vb-nome" placeholder="Nome completo" oninput="clearErr('vb-error')">
        <label class="field-label">E-mail</label>
        <input class="field" id="vb-email" placeholder="email@exemplo.com" oninput="clearErr('vb-error')">
        <label class="field-label">Senha</label>
        <input class="field" id="vb-senha" type="password" placeholder="Crie uma senha" oninput="clearErr('vb-error')">
        <div class="auth-error" id="vb-error"></div>
        <button class="btn btn-add" style="width:100%;" onclick="doBootstrapVendedor()">Criar conta principal</button>
      </div>`;
    return;
  }
  if(vendAuthView==='reset'){
    el.innerHTML = `
      <div class="auth-box">
        <div class="icon">🔑</div>
        <h2>Recuperar senha</h2>
        <p class="hero-sub">Informe o e-mail cadastrado. Enviaremos uma senha temporária para ele.</p>
        <label class="field-label">E-mail cadastrado</label>
        <input class="field" id="vr-email" placeholder="email@exemplo.com" oninput="clearErr('vr-error')">
        <div class="auth-error" id="vr-error"></div>
        <button class="btn btn-add" style="width:100%;" onclick="doResetVendedor()">Enviar senha temporária</button>
        <div id="vr-result"></div>
        <button class="btn-link" style="margin-top:14px;" onclick="setVendAuthView('login')">← Voltar para o login</button>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="auth-box">
      <div class="icon">🧑‍🍳</div>
      <h2>Área do vendedor</h2>
      <p class="hero-sub">Entre com seu e-mail e senha.</p>
      <label class="field-label">E-mail</label>
      <input class="field" id="vl-email" placeholder="email@exemplo.com" value="vendedor@gmail.com" oninput="clearErr('vl-error')">
      <label class="field-label">Senha</label>
      <input class="field" id="vl-senha" type="password" placeholder="Sua senha" value="1234" oninput="clearErr('vl-error')">
      <div class="auth-error" id="vl-error"></div>
      <button class="btn btn-add" style="width:100%;" onclick="doLoginVendedor()">Entrar</button>
      <p class="auth-hint"><button class="btn-link" onclick="setVendAuthView('reset')">Esqueci minha senha</button></p>
      <p class="auth-hint">Novas contas de vendedor são criadas por quem já tem acesso, dentro do painel.</p>
    </div>`;
}
function setVendAuthView(view){ vendAuthView = view; renderVendAuth(); }
async function doBootstrapVendedor(){
  const nome = document.getElementById('vb-nome').value.trim();
  const email = document.getElementById('vb-email').value.trim().toLowerCase();
  const senha = document.getElementById('vb-senha').value;
  const errEl = document.getElementById('vb-error');
  if(!nome || !email || !senha){ errEl.textContent = 'Preencha todos os campos.'; return; }
  if(!validEmail(email)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
  if(senha.length<4){ errEl.textContent = 'A senha deve ter pelo menos 4 caracteres.'; return; }
  errEl.textContent = '';
  await loadVendedorAccounts();
  const senhaHash = await hashPassword(senha);
  vendedorAccounts.push({nome, email, senhaHash});
  await saveVendedorAccounts();
  vendedorSession = {nome, email};
  toast('Conta principal criada!');
  enterVendedorApp();
}
async function doLoginVendedor(){
  const email = document.getElementById('vl-email').value.trim().toLowerCase();
  const senha = document.getElementById('vl-senha').value.trim();
  const errEl = document.getElementById('vl-error');
  await loadVendedorAccounts();
  const acc = vendedorAccounts.find(a=>a.email===email);
  if(!acc){ errEl.textContent = 'Nenhuma conta encontrada com esse e-mail.'; return; }
  const senhaCorreta = await verifyPassword(senha, acc.senhaHash);
  if(!senhaCorreta){ errEl.textContent = 'Senha incorreta.'; return; }
  errEl.textContent = '';
  vendedorSession = {nome:acc.nome, email:acc.email};
  enterVendedorApp();
}
async function doResetVendedor(){
  const email = document.getElementById('vr-email').value.trim().toLowerCase();
  const errEl = document.getElementById('vr-error');
  await loadVendedorAccounts();
  const acc = vendedorAccounts.find(a=>a.email===email);
  if(!acc){ errEl.textContent = 'Não encontramos nenhuma conta com esse e-mail.'; document.getElementById('vr-result').innerHTML=''; return; }
  errEl.textContent = '';
  const temp = genTempPassword();
  acc.senhaHash = await hashPassword(temp);
  await saveVendedorAccounts();
  await loadEmailConfig();
  const assunto = 'Recuperação de senha — Painel do vendedor BRASA';
  const corpo = `Olá, ${acc.nome}. Sua nova senha temporária é ${temp} (válida por 3 minutos). Entre e troque-a em "Minha conta".`;
  await logEmail(acc.email, assunto, corpo);
  document.getElementById('vr-result').innerHTML = `
    <div class="email-sim-box">
      📧 <strong>Simulação de e-mail</strong> — este site não tem um servidor de e-mail próprio, então mostramos aqui o e-mail que seria enviado:<br><br>
      De: <strong>${emailConfig.principal}</strong><br>
      Para: <strong>${acc.email}</strong><br>
      Assunto: ${assunto}<br><br>
      "${corpo}"<br><br>
      Para enviar e-mails de verdade, seria necessário conectar um serviço de e-mail (ex: Resend, SendGrid) por um backend.
    </div>`;
  toast('Senha temporária gerada e mensagem registrada');
}
function enterVendedorApp(){
  document.getElementById('vend-auth').style.display = 'none';
  document.getElementById('vend-app').style.display = 'block';
  document.getElementById('vend-nome-show').textContent = vendedorSession.nome;
  document.getElementById('vend-email-show').textContent = vendedorSession.email;
  document.getElementById('profile-avatar').setAttribute('data-letter', vendedorSession.nome.charAt(0));
  document.getElementById('profile-nome-show').textContent = vendedorSession.nome;
  document.getElementById('profile-email-show').textContent = vendedorSession.email;
  switchVendPanel('pedidos');
  renderVendedorOrders();
  renderMenuManage();
  renderAddonLibrary();
  renderCategorias();
  populateCatSelects();
  renderVendAccList();
  renderMotoAccList();
  document.getElementById('ev-email').value = vendedorSession.email;
  document.getElementById('email-principal-input').value = emailConfig.principal;
  document.getElementById('pay-pix-input').value = paymentConfig.chavePix;
  document.getElementById('pay-cartao-input').value = paymentConfig.mensagemCartao;
  renderEmailLog();
}
function logoutVendedor(){
  vendedorSession = null;
  document.getElementById('vend-app').style.display = 'none';
  document.getElementById('vend-auth').style.display = 'block';
  vendAuthView = 'login';
  renderVendAuth();
}

/* ---- Vendor sub-navigation (organized screens) ---- */
document.getElementById('vend-subnav').addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-panel]');
  if(!btn) return;
  switchVendPanel(btn.dataset.panel);
});
function switchVendPanel(panel){
  document.querySelectorAll('#vend-subnav button').forEach(b=>b.classList.toggle('active', b.dataset.panel===panel));
  document.querySelectorAll('.vend-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('vend-panel-'+panel).classList.add('active');
  if(panel==='mensagens') renderEmailLog();
  if(panel==='categorias'){ renderCategorias(); populateCatSelects(); }
}

/* ---- Conta: editar e criar novas contas de vendedor ---- */
async function saveEditVendAccount(){
  const novoEmail = document.getElementById('ev-email').value.trim().toLowerCase();
  const novaSenha = document.getElementById('ev-senha').value.trim();
  const errEl = document.getElementById('ev-error');
  if(!validEmail(novoEmail)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
  await loadVendedorAccounts();
  const dup = vendedorAccounts.find(a=>a.email===novoEmail && a.email!==vendedorSession.email);
  if(dup){ errEl.textContent = 'Esse e-mail já está em uso por outra conta.'; return; }
  const acc = vendedorAccounts.find(a=>a.email===vendedorSession.email);
  if(!acc){ errEl.textContent = 'Conta não encontrada.'; return; }
  let msgToast = 'Conta atualizada!';
  acc.email = novoEmail; 
  if(novaSenha) {
    acc.senhaHash = await hashPassword(novaSenha);
    msgToast = 'Conta e senha atualizadas!';
  }
  await saveVendedorAccounts();
  vendedorSession.email = novoEmail;
  document.getElementById('vend-email-show').textContent = novoEmail;
  document.getElementById('profile-email-show').textContent = novoEmail;
  document.getElementById('ev-senha').value = '';
  errEl.textContent = '';
  toast(msgToast);
  renderVendAccList();
}
async function createVendAccount(){
  const nome = document.getElementById('nv-nome').value.trim();
  const email = document.getElementById('nv-email').value.trim().toLowerCase();
  const senha = document.getElementById('nv-senha').value;
  const errEl = document.getElementById('nv-error');
  if(!nome || !email || !senha){ errEl.textContent = 'Preencha todos os campos.'; return; }
  if(!validEmail(email)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
  if(senha.length<4){ errEl.textContent = 'A senha deve ter pelo menos 4 caracteres.'; return; }
  await loadVendedorAccounts();
  if(vendedorAccounts.find(a=>a.email===email)){ errEl.textContent = 'Já existe uma conta com esse e-mail.'; return; }
  errEl.textContent = '';
  vendedorAccounts.push({nome, email, senhaHash: await hashPassword(senha)});
  await saveVendedorAccounts();
  ['nv-nome','nv-email','nv-senha'].forEach(id=>document.getElementById(id).value='');
  toast('Nova conta de vendedor criada!');
  renderVendAccList();
}
function renderVendAccList(){
  const el = document.getElementById('vend-acc-list');
  el.innerHTML = vendedorAccounts.map(a=>`
    <div class="acc-row acc-row-vend">
      <span style="display:flex;align-items:center;">
        <span class="acc-avatar" data-letter="${a.nome.charAt(0)}" aria-hidden="true"></span>
        <span>${a.nome} <span style="color:var(--cream-dim);">— ${a.email}</span></span>
      </span>
      <span class="acc-actions">
        <input type="password" class="field vend-senha-input" placeholder="Senha nova" style="width:120px;margin:0;padding:7px 10px;font-size:.78rem;">
        <button class="btn btn-gold btn-sm" onclick="salvarNovaSenhaVend(this,'${a.email}')">💾 Salvar senha</button>
        <button class="btn btn-red btn-sm" onclick="removeVendAccount('${a.email}')">🗑️ Excluir</button>
      </span>
    </div>`).join('') || `<div class="empty-state">Nenhuma conta cadastrada.</div>`;
}

/** O vendedor define e salva manualmente a senha de outra conta de vendedor (sem geração automática). */
async function salvarNovaSenhaVend(btnEl, email){
  const linha = btnEl.closest('.acc-row-vend');
  const input = linha.querySelector('.vend-senha-input');
  const novaSenha = input.value;
  if(!novaSenha || novaSenha.length < 4){ toast('A senha deve ter pelo menos 4 caracteres.'); return; }
  await loadVendedorAccounts();
  const conta = vendedorAccounts.find(a=>a.email===email);
  if(!conta){ toast('Erro: esta conta não existe ou já foi excluída.'); renderVendAccList(); return; }
  conta.senhaHash = await hashPassword(novaSenha);
  await saveVendedorAccounts();
  toast(`Nova senha salva para ${conta.nome}.`);
  renderVendAccList();
}

/**
 * Exclui uma conta de vendedor do banco de dados (armazenamento), a partir
 * da lista "Contas de vendedor". Segue a mesma lógica do exemplo em Flask:
 * 1) busca a conta pelo identificador (aqui, o e-mail)
 * 2) valida se ela de fato existe antes de agir
 * 3) remove e salva, com tratamento de erro
 * 4) se a conta excluída for a que está logada nesta sessão, faz logout
 */
async function removeVendAccount(email){
  await loadVendedorAccounts();

  // 1) e 2) Busca a conta e valida existência — nunca assume que ela está lá.
  const conta = vendedorAccounts.find(a=>a.email===email);
  if(!conta){
    toast('Erro: esta conta não existe ou já foi excluída.');
    renderVendAccList();
    return;
  }

  if(vendedorAccounts.length <= 1){
    toast('Não é possível excluir: precisa existir pelo menos uma conta de vendedor.');
    return;
  }

  const ok = window.confirm(`Excluir permanentemente a conta de "${conta.nome}" (${conta.email})? Essa ação não pode ser desfeita.`);
  if(!ok) return;

  try{
    const totalAntes = vendedorAccounts.length;
    vendedorAccounts = vendedorAccounts.filter(a=>a.email!==email);
    if(vendedorAccounts.length === totalAntes){
      throw new Error('Falha ao remover a conta.');
    }
    await saveVendedorAccounts();
    toast(`Conta de "${conta.nome}" excluída permanentemente.`);
    renderVendAccList();

    // Se a conta excluída era a que está logada nesta sessão, desloga automaticamente.
    if(vendedorSession && vendedorSession.email===email){
      logoutVendedor();
    }
  }catch(erro){
    toast('Ocorreu um erro ao tentar excluir a conta. Tente novamente.');
  }
}

/* ---- E-mail principal (remetente) + caixa de mensagens simuladas ---- */
async function saveEmailPrincipal(){
  const val = document.getElementById('email-principal-input').value.trim();
  const errEl = document.getElementById('email-principal-error');
  if(!validEmail(val)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
  errEl.textContent = '';
  emailConfig.principal = val;
  await saveEmailConfig();
  toast('E-mail principal atualizado!');
}
function timeAgoLabel(ts){
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}
async function renderEmailLog(){
  await loadEmailLog();
  const el = document.getElementById('email-log-list');
  el.innerHTML = emailLog.map(m=>`
    <div class="email-log-row">
      <div class="elr-top"><span class="elr-subject">${m.assunto}</span><span class="elr-time">${timeAgoLabel(m.criadoEm)}</span></div>
      <div class="elr-meta">De: ${m.de} · Para: ${m.para}</div>
      <div class="elr-body">${m.corpo}</div>
    </div>`).join('') || `<div class="empty-state">Nenhuma mensagem enviada ainda. Elas aparecem aqui quando alguém usa "Esqueci minha senha".</div>`;
}

/* ============================================================
   MOTOQUEIROS: cadastrados pelo vendedor
   ============================================================ */
async function createMotoAccount(){
  const nome = document.getElementById('nm-nome').value.trim();
  const email = document.getElementById('nm-email').value.trim().toLowerCase();
  const senha = document.getElementById('nm-senha').value;
  const errEl = document.getElementById('nm-error');
  if(!nome || !email || !senha){ errEl.textContent = 'Preencha todos os campos.'; return; }
  if(!validEmail(email)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
  if(senha.length<4){ errEl.textContent = 'A senha deve ter pelo menos 4 caracteres.'; return; }
  await loadMotoAccounts();
  if(motoAccounts.find(a=>a.email===email)){ errEl.textContent = 'Já existe um motoqueiro com esse e-mail.'; return; }
  errEl.textContent = '';
  motoAccounts.push({nome, email, senhaHash: await hashPassword(senha)});
  await saveMotoAccounts();
  ['nm-nome','nm-email','nm-senha'].forEach(id=>document.getElementById(id).value='');
  toast('Motoqueiro cadastrado!');
  renderMotoAccList();
}
async function removeMotoAccount(email){
  await loadMotoAccounts();
  const existe = motoAccounts.find(a=>a.email===email);
  if(!existe){ toast('Erro: este motoqueiro não existe ou já foi excluído.'); renderMotoAccList(); return; }
  const ok = window.confirm(`Excluir permanentemente o motoqueiro "${existe.nome}" (${existe.email})? Essa ação não pode ser desfeita.`);
  if(!ok) return;
  motoAccounts = motoAccounts.filter(a=>a.email!==email);
  await saveMotoAccounts();
  renderMotoAccList();
  toast(`Motoqueiro "${existe.nome}" excluído com sucesso.`);
}
async function salvarNovaSenhaMoto(btnEl, email){
  const linha = btnEl.closest('.acc-row-moto');
  const input = linha.querySelector('.moto-senha-input');
  const novaSenha = input.value;
  if(!novaSenha || novaSenha.length < 4){ toast('A senha deve ter pelo menos 4 caracteres.'); return; }
  await loadMotoAccounts();
  const acc = motoAccounts.find(a=>a.email===email);
  if(!acc){ toast('Erro: este motoqueiro não existe ou já foi excluído.'); renderMotoAccList(); return; }
  acc.senhaHash = await hashPassword(novaSenha);
  await saveMotoAccounts();
  toast(`Nova senha salva para ${acc.nome}.`);
  renderMotoAccList();
}
function renderMotoAccList(){
  const el = document.getElementById('moto-acc-list');
  el.innerHTML = motoAccounts.map(a=>`
    <div class="acc-row acc-row-moto">
      <span>${a.nome} <span style="color:var(--cream-dim);">— ${a.email}</span></span>
      <span class="acc-actions">
        <input type="password" class="field moto-senha-input" placeholder="Senha nova" style="width:120px;margin:0;padding:7px 10px;font-size:.78rem;">
        <button class="btn btn-gold btn-sm" onclick="salvarNovaSenhaMoto(this,'${a.email}')">💾 Salvar senha</button>
        <button class="btn btn-red btn-sm" onclick="removeMotoAccount('${a.email}')">🗑️ Excluir</button>
      </span>
    </div>`).join('') || `<div class="empty-state">Nenhum motoqueiro cadastrado ainda.</div>`;
}

const STATUS_TAG = {
  pendente:{cls:'tag-pendente', lbl:'Pendente'}, preparo:{cls:'tag-preparo', lbl:'Em preparo'},
  pronto:{cls:'tag-pronto', lbl:'Pronto'}, entrega:{cls:'tag-entrega', lbl:'Em entrega'}, entregue:{cls:'tag-entregue', lbl:'Entregue'},
};
async function renderVendedorOrders(){
  if(!vendedorSession) return;
  await loadOrders();
  const el = document.getElementById('vend-orders');
  const active = orders.filter(o=>o.status!=='entregue').sort((a,b)=>b.criadoEm-a.criadoEm);
  const done = orders.filter(o=>o.status==='entregue');
  el.innerHTML = active.length ? active.map(o=>orderCardVendedor(o)).join('') : `<div class="empty-state">Nenhum pedido no momento.</div>`;
  if(done.length){
    el.innerHTML += `<div class="section-title" style="font-size:1rem;margin-top:18px;">Entregues (${done.length})</div>` + done.slice(-5).reverse().map(o=>orderCardVendedor(o)).join('');
  }
}
function orderCardVendedor(o){
  const tag = STATUS_TAG[o.status];
  const payLabel = o.pagamento.tipo==='pix'?'🔑 Pix':o.pagamento.tipo==='dinheiro'?('💵 Dinheiro'+(o.pagamento.precisaTroco?` (troco p/ ${money(o.pagamento.trocoPara||0)})`:' (sem troco)')):'💳 Cartão';
  let actions = '';
  if(o.status==='pendente') actions = `<button class="btn btn-gold" onclick="setOrderStatus('${o.id}','preparo')">Aceitar e preparar</button>`;
  else if(o.status==='preparo') actions = `<button class="btn btn-green" onclick="setOrderStatus('${o.id}','pronto')">Marcar como pronto</button>`;
  else if(o.status==='pronto') actions = `<span class="small-note" style="margin:0;">Aguardando motoqueiro aceitar a entrega…</span>`;
  else if(o.status==='entrega') actions = `<span class="small-note" style="margin:0;">Com ${o.motoqueiro} a caminho</span>`;
  return `<div class="order-card">
    <div class="order-top"><span class="order-id">#${o.id} · ${o.cliente}</span><span class="order-tag ${tag.cls}">${tag.lbl}</span></div>
    <div class="order-items">${o.items.map(itemLineText).join('<br>')}</div>
    <div class="order-meta"><span>${o.endereco}</span><span>${payLabel}</span><span><strong>${money(o.total)}</strong></span></div>
    <div class="order-actions">${actions}</div>
  </div>`;
}
async function setOrderStatus(id, status){
  await loadOrders();
  const o = orders.find(x=>x.id===id); if(!o) return;
  o.status = status; await saveOrders(); toast('Status atualizado'); renderVendedorOrders();
}

/* ============================================================
   ADICIONAMENTOS (biblioteca) + upload/edição de imagem + itens do cardápio
   ============================================================ */
let editingAddonId = null; // id do adicionamento em edição (null = modo "criar novo")

async function addAddonToLibrary(){
  const nome = document.getElementById('addon-nome').value.trim();
  const categoria = document.getElementById('addon-categoria').value;
  const valor = parseFloat(document.getElementById('addon-valor').value) || 0;
  if(!nome){ toast('Informe o nome do adicionamento'); return; }
  await loadAddons();

  // Verifica duplicidade (nome + categoria), ignorando o próprio item quando estamos editando.
  const jaExiste = addonsLibrary.find(a=>
    a.nome.toLowerCase()===nome.toLowerCase() && a.categoria===categoria && a.id!==editingAddonId
  );
  if(jaExiste){ toast(`Já existe "${nome}" cadastrado para ${categoria}`); return; }

  if(editingAddonId){
    // --- Modo edição: atualiza o adicionamento existente (nome, categoria e valor) ---
    const addon = addonsLibrary.find(a=>a.id===editingAddonId);
    if(addon){
      addon.nome = nome;
      addon.categoria = categoria;
      addon.valor = valor;
    }
    await saveAddons();
    toast('Adicionamento atualizado! Já reflete no cardápio do cliente.');
  } else {
    // --- Modo criação: adiciona um novo adicionamento à biblioteca ---
    addonsLibrary.push({id:'ad'+Date.now()+Math.floor(Math.random()*1000), nome, categoria, valor});
    await saveAddons();
    toast('Adicionamento salvo na biblioteca');
  }

  cancelEditAddon(); // limpa e volta o formulário pro modo "criar novo"
  renderAddonLibrary();
  renderMenu();          // atualiza a tela do cliente em tempo real (valores/nomes já vinculados a itens)
  renderMenuManage();    // atualiza a lista de itens do vendedor também
}

// Carrega um adicionamento existente no formulário para edição.
function editAddonInLibrary(id){
  const addon = addonsLibrary.find(a=>a.id===id);
  if(!addon) return;
  editingAddonId = id;
  document.getElementById('addon-nome').value = addon.nome;
  document.getElementById('addon-categoria').value = addon.categoria;
  document.getElementById('addon-valor').value = addon.valor;
  document.getElementById('addon-form-title').textContent = `Editando: ${addon.nome}`;
  document.getElementById('addon-submit-btn').textContent = 'Salvar alterações';
  document.getElementById('addon-cancel-btn').style.display = 'block';
  document.getElementById('addon-nome').scrollIntoView({behavior:'smooth', block:'center'});
}

// Cancela a edição e volta o formulário para o modo "criar novo".
function cancelEditAddon(){
  editingAddonId = null;
  document.getElementById('addon-nome').value = '';
  document.getElementById('addon-categoria').value = 'Todas';
  document.getElementById('addon-valor').value = '0';
  document.getElementById('addon-form-title').textContent = 'Novo adicionamento';
  document.getElementById('addon-submit-btn').textContent = '+ Adicionar à biblioteca';
  document.getElementById('addon-cancel-btn').style.display = 'none';
}

async function removeAddonFromLibrary(id){
  await loadAddons();
  addonsLibrary = addonsLibrary.filter(a=>a.id!==id);
  await saveAddons();
  if(editingAddonId===id) cancelEditAddon(); // se estava editando o item removido, volta o formulário ao normal
  renderAddonLibrary();
  renderMenu();
  toast('Adicionamento removido da biblioteca.');
}
async function resetAddonsToDefaults(){
  const ok = window.confirm('Isso vai substituir TODOS os adicionamentos cadastrados pelos adicionamentos de exemplo. Os que você criou serão perdidos. Continuar?');
  if(!ok) return;
  addonsLibrary = DEFAULT_ADDONS.map((a,i)=>({id:'ad'+Date.now()+i, ...a}));
  await saveAddons();
  renderAddonLibrary();
  toast('Adicionamentos restaurados com os itens de exemplo!');
}
function corDaCategoria(cat){
  const mapa = { Todas:'var(--cat-todas)', Lanches:'var(--cat-lanches)', Pratos:'var(--cat-pratos)', Bebidas:'var(--cat-bebidas)', Sobremesas:'var(--cat-sobremesas)' };
  return mapa[cat] || 'var(--cat-todas)';
}
function renderAddonLibrary(){
  const el = document.getElementById('addon-library-list');
  if(addonsLibrary.length===0){ el.innerHTML = `<div class="empty-state">Nenhum adicionamento cadastrado ainda.</div>`; return; }
  const ordemPreferida = ['Todas','Lanches','Pratos','Bebidas','Sobremesas'];
  const grupos = {};
  addonsLibrary.forEach(a=>{ (grupos[a.categoria] = grupos[a.categoria]||[]).push(a); });
  // CORREÇÃO: antes só mostrava categorias dessa lista fixa, escondendo qualquer
  // adicionamento com categoria diferente. Agora mostramos TODAS as categorias
  // que realmente existem na biblioteca — as conhecidas primeiro, na ordem
  // preferida, e quaisquer outras (ex: categoria digitada diferente, categoria
  // antiga) aparecem depois, em ordem alfabética, sem sumir da tela.
  const categoriasConhecidas = ordemPreferida.filter(c=>grupos[c]);
  const categoriasExtras = Object.keys(grupos).filter(c=>!ordemPreferida.includes(c)).sort();
  const categoriasPresentes = [...categoriasConhecidas, ...categoriasExtras];
  let rowsHtml = '';
  categoriasPresentes.forEach(cat=>{
    const cor = corDaCategoria(cat);
    rowsHtml += `<div class="addon-group-title" style="--cat-color:${cor};">${cat} <span style="font-weight:400;text-transform:none;letter-spacing:0;">(${grupos[cat].length})</span></div>`;
    rowsHtml += grupos[cat].map(a=>`
      <div class="addon-list-row" style="--cat-color:${cor};">
        <span class="al-nome">${a.nome}</span>
        <span class="al-cat"><span>${a.categoria}</span></span>
        <span class="al-valor ${a.valor>0?'':'gratis'}">${a.valor>0?'+'+money(a.valor):'Grátis'}</span>
        <span class="al-actions">
          <button class="al-edit" title="Editar" onclick="editAddonInLibrary('${a.id}')">✏️</button>
          <button class="al-del" title="Remover" onclick="removeAddonFromLibrary('${a.id}')">✕</button>
        </span>
      </div>`).join('');
  });
  el.innerHTML = `
    <div class="addon-list">
      <div class="addon-list-head"><span>Nome</span><span>Categoria</span><span>Valor</span><span></span></div>
      <div class="small-note" style="padding:8px 16px 0;margin:0;">Total cadastrado: <strong>${addonsLibrary.length}</strong> adicionamento(s)</div>
      ${rowsHtml}
    </div>`;
}

/* Image: URL field or PNG/JPG upload (resized + compressed client-side) */
function onMiImageUrlInput(){
  const url = document.getElementById('mi-imagem').value.trim();
  if(url){ miImageData = null; document.getElementById('mi-imagem-file').value = ''; showMiImagePreview(url); }
  else if(!miImageData){ hideMiImagePreview(); }
}
function onMiImageFile(evt){
  const file = evt.target.files[0];
  const errEl = document.getElementById('mi-imagem-error');
  errEl.textContent = '';
  if(!file) return;
  const okTypes = ['image/png','image/jpeg'];
  if(!okTypes.includes(file.type)){ errEl.textContent = 'Envie apenas arquivos PNG ou JPG.'; evt.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    const img = new Image();
    img.onload = ()=>{
      let w = img.width, h = img.height; const maxDim = 700;
      if(w>maxDim || h>maxDim){ if(w>h){ h=Math.round(h*maxDim/w); w=maxDim; } else { w=Math.round(w*maxDim/h); h=maxDim; } }
      const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      miImageData = canvas.toDataURL('image/jpeg', 0.82);
      document.getElementById('mi-imagem').value = '';
      showMiImagePreview(miImageData);
    };
    img.onerror = ()=>{ errEl.textContent = 'Não foi possível ler essa imagem.'; };
    img.src = e.target.result;
  };
  reader.onerror = ()=>{ errEl.textContent = 'Não foi possível ler esse arquivo.'; };
  reader.readAsDataURL(file);
}
function showMiImagePreview(src){
  document.getElementById('mi-imagem-preview-img').src = src;
  document.getElementById('mi-imagem-preview').style.display = 'block';
}
function hideMiImagePreview(){ document.getElementById('mi-imagem-preview').style.display = 'none'; }
function clearMiImage(){
  miImageData = null;
  document.getElementById('mi-imagem').value = '';
  document.getElementById('mi-imagem-file').value = '';
  hideMiImagePreview();
}

async function submitMenuItem(){
  const nome = document.getElementById('mi-nome').value.trim();
  const categoria = document.getElementById('mi-categoria').value;
  const preco = parseFloat(document.getElementById('mi-preco').value);
  const desc = document.getElementById('mi-desc').value.trim();
  const emoji = document.getElementById('mi-emoji').value.trim() || '🍽️';
  const imagemUrl = document.getElementById('mi-imagem').value.trim();
  const imagem = miImageData || imagemUrl || '';
  if(!nome || isNaN(preco)){ toast('Preencha nome e preço'); return; }
  await loadMenu();
  if(editingItemId){
    const item = menu.find(m=>m.id===editingItemId);
    if(item){ Object.assign(item, {nome, categoria, preco, desc, emoji, imagem}); }
    toast('Item atualizado!');
  } else {
    menu.push({id:'m'+Date.now(), nome, categoria, preco, desc, emoji, imagem});
    toast('Item adicionado ao cardápio');
  }
  await saveMenu();
  resetMenuItemForm();
  renderMenuManage(); renderChips(); renderMenu();
}
function resetMenuItemForm(){
  ['mi-nome','mi-preco','mi-desc','mi-imagem'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mi-emoji').value = '🍽️';
  document.getElementById('mi-imagem-file').value = '';
  document.getElementById('mi-imagem-error').textContent = '';
  miImageData = null; hideMiImagePreview();
  editingItemId = null;
  document.getElementById('mi-form-title').textContent = 'Adicionar item ao cardápio';
  document.getElementById('mi-submit-btn').textContent = 'Adicionar ao cardápio';
  document.getElementById('mi-cancel-btn').style.display = 'none';
}
function editMenuItem(id){
  const item = menu.find(m=>m.id===id); if(!item) return;
  editingItemId = id;
  document.getElementById('mi-nome').value = item.nome;
  document.getElementById('mi-categoria').value = item.categoria;
  document.getElementById('mi-preco').value = item.preco;
  document.getElementById('mi-desc').value = item.desc || '';
  document.getElementById('mi-emoji').value = item.emoji || '🍽️';
  miImageData = (item.imagem && item.imagem.startsWith('data:')) ? item.imagem : null;
  document.getElementById('mi-imagem').value = (item.imagem && !item.imagem.startsWith('data:')) ? item.imagem : '';
  if(item.imagem){ showMiImagePreview(item.imagem); } else { hideMiImagePreview(); }
  document.getElementById('mi-form-title').textContent = 'Editar item do cardápio';
  document.getElementById('mi-submit-btn').textContent = 'Salvar alterações';
  document.getElementById('mi-cancel-btn').style.display = 'block';
  switchVendPanel('cardapio');
  document.getElementById('mi-nome').scrollIntoView({behavior:'smooth', block:'center'});
}
function cancelEditItem(){ resetMenuItemForm(); }
async function removeMenuItem(id){
  await loadMenu();
  menu = menu.filter(m=>m.id!==id);
  await saveMenu();
  renderMenuManage(); renderChips(); renderMenu();
}
async function resetMenuToDefaults(){
  const ok = window.confirm('Isso vai substituir TODOS os itens do cardápio atual pelos itens de exemplo (com fotos e opções já configuradas). Os itens que você criou serão perdidos. Continuar?');
  if(!ok) return;
  menu = DEFAULT_MENU.map(m=>({...m, opcoes:(m.opcoes||[]).map(o=>({...o}))}));
  await saveMenu();
  resetMenuItemForm();
  renderMenuManage(); renderChips(); renderMenu();
  toast('Cardápio restaurado com os itens de exemplo!');
}
function renderMenuManage(){
  const el = document.getElementById('mi-list');
  el.innerHTML = menu.map(m=>`
    <div class="menu-manage-item">
      <div class="mmi-top">
        <span class="mmi-name">${m.imagem ? `<img src="${m.imagem}" onerror="this.style.display='none'">` : ''}${m.emoji} ${m.nome} — ${money(m.preco)} <span style="color:var(--cream-dim);">(${m.categoria})</span></span>
        <span class="mmi-actions">
          <button class="btn btn-ghost btn-sm" onclick="editMenuItem('${m.id}')">✏️ Editar</button>
          <button class="btn btn-red btn-sm" onclick="removeMenuItem('${m.id}')">Remover</button>
        </span>
      </div>
      ${(() => { const ops = opcoesParaItem(m); return ops.length ? `<div class="mmi-opts">${ops.map(o=>`<span>${o.nome}${o.valor>0?' (+'+money(o.valor)+')':''}</span>`).join('')}</div>` : ''; })()}
    </div>`).join('') || `<div class="empty-state">Nenhum item cadastrado ainda.</div>`;
}

/* ============================================================
   MOTOQUEIRO: AUTENTICAÇÃO (login + recuperação por e-mail — sem autocadastro público)
   ============================================================ */
function renderMotoAuth(){
  const el = document.getElementById('moto-auth');
  if(motoAuthView==='reset'){
    el.innerHTML = `
      <div class="auth-box">
        <div class="icon">🔑</div>
        <h2>Recuperar senha</h2>
        <p class="hero-sub">Informe o e-mail cadastrado pelo vendedor. Enviaremos uma senha temporária.</p>
        <label class="field-label">E-mail cadastrado</label>
        <input class="field" id="mr-email" placeholder="email@exemplo.com" oninput="clearErr('mr-error')">
        <div class="auth-error" id="mr-error"></div>
        <button class="btn btn-add" style="width:100%;" onclick="doResetMoto()">Enviar senha temporária</button>
        <div id="mr-result"></div>
        <button class="btn-link" style="margin-top:14px;" onclick="setMotoAuthView('login')">← Voltar para o login</button>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="auth-box">
      <div class="icon">🏍️</div>
      <h2>Área do motoqueiro</h2>
      <p class="hero-sub">Entre com o e-mail e senha que o vendedor cadastrou para você.</p>
      <label class="field-label">E-mail</label>
      <input class="field" id="ml-email" placeholder="email@exemplo.com" oninput="clearErr('ml-error')">
      <label class="field-label">Senha</label>
      <input class="field" id="ml-senha" type="password" placeholder="Sua senha" oninput="clearErr('ml-error')">
      <div class="auth-error" id="ml-error"></div>
      <button class="btn btn-add" style="width:100%;" onclick="doLoginMoto()">Entrar</button>
      <p class="auth-hint"><button class="btn-link" onclick="setMotoAuthView('reset')">Esqueci minha senha</button></p>
      <p class="auth-hint">Ainda não tem conta? Peça ao vendedor do restaurante para te cadastrar.</p>
    </div>`;
}
function setMotoAuthView(view){ motoAuthView = view; renderMotoAuth(); }
async function doLoginMoto(){
  const email = document.getElementById('ml-email').value.trim().toLowerCase();
  const senha = document.getElementById('ml-senha').value.trim();
  const errEl = document.getElementById('ml-error');
  await loadMotoAccounts();
  const acc = motoAccounts.find(a=>a.email===email);
  if(!acc){ errEl.textContent = 'Nenhum cadastro encontrado com esse e-mail.'; return; }
  const senhaCorreta = await verifyPassword(senha, acc.senhaHash);
  if(!senhaCorreta){ errEl.textContent = 'Senha incorreta.'; return; }
  errEl.textContent = '';
  motoSession = {nome:acc.nome, email:acc.email};
  enterMotoApp();
}
async function doResetMoto(){
  const email = document.getElementById('mr-email').value.trim().toLowerCase();
  const errEl = document.getElementById('mr-error');
  await loadMotoAccounts();
  const acc = motoAccounts.find(a=>a.email===email);
  if(!acc){ errEl.textContent = 'Não encontramos nenhum cadastro com esse e-mail.'; document.getElementById('mr-result').innerHTML=''; return; }
  errEl.textContent = '';
  const temp = genTempPassword();
  acc.senhaHash = await hashPassword(temp);
  await saveMotoAccounts();
  await loadEmailConfig();
  const assunto = 'Recuperação de senha — Painel do motoqueiro BRASA';
  const corpo = `Olá, ${acc.nome}. Sua nova senha temporária é ${temp} (válida por 3 minutos).`;
  await logEmail(acc.email, assunto, corpo);
  document.getElementById('mr-result').innerHTML = `
    <div class="email-sim-box">
      📧 <strong>Simulação de e-mail</strong> — este site não tem servidor de e-mail próprio, então mostramos aqui o e-mail que seria enviado:<br><br>
      De: <strong>${emailConfig.principal}</strong><br>
      Para: <strong>${acc.email}</strong><br>
      Assunto: ${assunto}<br><br>
      "${corpo}"<br><br>
      Para envio real, seria necessário um serviço de e-mail (ex: Resend, SendGrid) via backend.
    </div>`;
  toast('Senha temporária gerada e mensagem registrada');
}
function switchMotoPanel(panel){
  document.querySelectorAll('#moto-subnav button').forEach(b=>b.classList.toggle('active', b.dataset.panel===panel));
  document.querySelectorAll('.moto-panel').forEach(p=>p.style.display = p.id==='moto-panel-'+panel ? 'block' : 'none');
}
function enterMotoApp(){
  document.getElementById('moto-auth').style.display = 'none';
  document.getElementById('moto-app').style.display = 'block';
  document.getElementById('moto-nome-show').textContent = motoSession.nome;
  document.getElementById('moto-email-show').textContent = motoSession.email;
  document.getElementById('em-email').value = motoSession.email;
  document.getElementById('em-senha').value = '';
  document.getElementById('em-error').textContent = '';
  switchMotoPanel('entregas');
  renderMotoOrders();
}
function logoutMoto(){
  motoSession = null;
  document.getElementById('moto-app').style.display = 'none';
  document.getElementById('moto-auth').style.display = 'block';
  motoAuthView = 'login';
  renderMotoAuth();
}
async function saveEditMotoAccount(){
  const novoEmail = document.getElementById('em-email').value.trim().toLowerCase();
  const novaSenha = document.getElementById('em-senha').value.trim();
  const errEl = document.getElementById('em-error');
  if(!validEmail(novoEmail)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
  await loadMotoAccounts();
  const dup = motoAccounts.find(a=>a.email===novoEmail && a.email!==motoSession.email);
  if(dup){ errEl.textContent = 'Esse e-mail já está em uso por outra conta.'; return; }
  const acc = motoAccounts.find(a=>a.email===motoSession.email);
  if(!acc){ errEl.textContent = 'Conta não encontrada.'; return; }
  let msgToast = 'Conta atualizada!';
  acc.email = novoEmail; 
  if(novaSenha) {
    acc.senhaHash = await hashPassword(novaSenha);
    msgToast = 'Conta e senha atualizadas!';
  }
  await saveMotoAccounts();
  motoSession.email = novoEmail;
  document.getElementById('moto-email-show').textContent = novoEmail;
  document.getElementById('em-email').value = novoEmail;
  document.getElementById('em-senha').value = '';
  errEl.textContent = '';
  toast(msgToast);
  renderMotoAccList();
}
async function excluirMinhaContaMotoqueiro(){
  await loadMotoAccounts();
  const contaExiste = motoAccounts.find(a=>a.email===motoSession.email);
  if(!contaExiste){
    toast('Erro: esta conta não existe ou já foi excluída.');
    logoutMoto();
    return;
  }
  const ok = window.confirm(`Tem certeza que deseja excluir permanentemente sua conta de motoqueiro (${motoSession.email})? Essa ação não pode ser desfeita.`);
  if(!ok) return;
  motoAccounts = motoAccounts.filter(a=>a.email!==motoSession.email);
  await saveMotoAccounts();
  toast('Sua conta foi excluída permanentemente.');
  logoutMoto();
}
// Event listener for moto subnav
document.getElementById('moto-subnav').addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-panel]');
  if(!btn) return;
  switchMotoPanel(btn.dataset.panel);
});
async function renderMotoOrders(){
  if(!motoSession) return;
  await loadOrders();
  const disponiveis = orders.filter(o=>o.status==='pronto');
  const minhas = orders.filter(o=>o.motoqueiro===motoSession.nome && o.status==='entrega');
  const entreguesPorMim = orders.filter(o=>o.motoqueiro===motoSession.nome && o.status==='entregue');
  document.getElementById('moto-disponiveis').innerHTML = disponiveis.length ? disponiveis.map(o=>`
    <div class="order-card">
      <div class="order-top"><span class="order-id">#${o.id} · ${o.cliente}</span><span class="order-tag tag-pronto">Pronto</span></div>
      <div class="order-items">${o.items.map(itemLineText).join('<br>')}</div>
      <div class="order-meta"><span>📍 ${o.endereco}</span><span><strong>${money(o.total)}</strong></span></div>
      <div class="order-actions">
        <a class="btn btn-ghost" href="${linkGoogleMaps(o.endereco)}" target="_blank" rel="noopener noreferrer">📍 Abrir no Google Maps</a>
        <button class="btn btn-gold" onclick="acceptDelivery('${o.id}')">Aceitar entrega</button>
      </div>
    </div>`).join('') : `<div class="empty-state">Nenhuma entrega disponível agora.</div>`;
  let html = minhas.length ? minhas.map(o=>`
    <div class="order-card">
      <div class="order-top"><span class="order-id">#${o.id} · ${o.cliente}</span><span class="order-tag tag-entrega">Em entrega</span></div>
      <div class="order-items">${o.items.map(itemLineText).join('<br>')}</div>
      <div class="order-meta"><span>📍 ${o.endereco}</span><span>${o.pagamento.tipo==='dinheiro'?'💵 Dinheiro'+(o.pagamento.precisaTroco?` (troco p/ ${money(o.pagamento.trocoPara||0)})`:''):o.pagamento.tipo==='pix'?'🔑 Pix':'💳 Cartão'}</span><span><strong>${money(o.total)}</strong></span></div>
      <div class="order-actions">
        <a class="btn btn-ghost" href="${linkGoogleMaps(o.endereco)}" target="_blank" rel="noopener noreferrer">📍 Abrir no Google Maps</a>
        <button class="btn btn-green" onclick="setOrderStatus('${o.id}','entregue')">Marcar como entregue</button>
      </div>
    </div>`).join('') : `<div class="empty-state">Você não tem entregas em andamento.</div>`;
  if(entreguesPorMim.length) html += `<div class="small-note">Entregas concluídas hoje: ${entreguesPorMim.length}</div>`;
  document.getElementById('moto-minhas').innerHTML = html;
}
// Gera um link do Google Maps já pesquisando o endereço de entrega do cliente.
function linkGoogleMaps(endereco){
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}
async function acceptDelivery(id){
  await loadOrders();
  const o = orders.find(x=>x.id===id); if(!o) return;
  o.status = 'entrega'; o.motoqueiro = motoSession.nome;
  await saveOrders(); toast('Entrega aceita!'); renderMotoOrders();
}

setInterval(()=>{
  if(document.getElementById('view-vendedor').classList.contains('active') && vendedorSession) renderVendedorOrders();
  if(document.getElementById('view-motoqueiro').classList.contains('active') && motoSession) renderMotoOrders();
}, 4000);

/* ============================================================
   INIT
   ============================================================ */
(async function init(){
  await loadTheme();
  if(window.location.protocol === 'file:'){
    document.getElementById('file-protocol-warning').style.display = 'block';
  }
  await loadMenu();
  await loadOrders();
  await loadVendedorAccounts();
  await loadMotoAccounts();
  await loadAddons();
  await loadCategorias();
  await loadEmailConfig();
  await loadPaymentConfig();
  await loadEmailLog();
  populateCatSelects();
  renderChips();
  renderMenu();
  updateCartBadge();
  renderVendAuth();
  renderMotoAuth();
})();