/* ===========================================================
   Minhas Contas - App de Contas a Pagar (PWA)
   Armazenamento local via IndexedDB
   =========================================================== */

const DB_NAME = 'minhas-contas-db';
const DB_VERSION = 1;
const STORE = 'contas';

let db = null;
let chartCategoria = null;
let chartStatus = null;
let chartHistorico = null;
let deferredPrompt = null;

/* ---------- IndexedDB helpers ---------- */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('vencimento', 'vencimento', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('categoria', 'categoria', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function dbAdd(conta) {
  return new Promise((resolve, reject) => {
    const r = tx('readwrite').add(conta);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function dbPut(conta) {
  return new Promise((resolve, reject) => {
    const r = tx('readwrite').put(conta);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const r = tx('readwrite').delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const r = tx().getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

function dbClear() {
  return new Promise((resolve, reject) => {
    const r = tx('readwrite').clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/* ---------- Utils ---------- */
const fmtMoney = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const todayISO = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

const daysBetween = (iso) => {
  const t = new Date(todayISO() + 'T00:00:00');
  const d = new Date(iso + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};

function statusOf(conta) {
  if (conta.status === 'paga') return 'paga';
  const diff = daysBetween(conta.vencimento);
  if (diff < 0) return 'vencida';
  if (diff <= 7) return 'proxima';
  return 'pendente';
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  setTimeout(() => t.classList.add('hidden'), 2800);
}

/* ---------- Tabs ---------- */
function setupTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach((c) => {
        c.classList.toggle('active', c.id === 'tab-' + target);
      });
      if (target === 'relatorios') renderCharts();
      if (target === 'dashboard') renderDashboard();
      if (target === 'lista') renderLista();
    });
  });
}

/* ---------- Form ---------- */
function setupForm() {
  const form = document.getElementById('form-conta');
  const cancelBtn = document.getElementById('btn-cancelar');

  document.getElementById('conta-vencimento').value = todayISO();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('conta-id').value;
    const conta = {
      descricao: document.getElementById('conta-descricao').value.trim(),
      valor: parseFloat(document.getElementById('conta-valor').value),
      vencimento: document.getElementById('conta-vencimento').value,
      categoria: document.getElementById('conta-categoria').value,
      recorrente: document.getElementById('conta-recorrente').checked,
      observacoes: document.getElementById('conta-obs').value.trim(),
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    };

    try {
      if (id) {
        conta.id = parseInt(id);
        // preserve status existente se já pago
        const all = await dbGetAll();
        const old = all.find((c) => c.id === conta.id);
        if (old) {
          conta.status = old.status;
          conta.pagaEm = old.pagaEm;
          conta.criadoEm = old.criadoEm;
        }
        await dbPut(conta);
        showToast('Conta atualizada!', 'success');
      } else {
        await dbAdd(conta);
        showToast('Conta cadastrada!', 'success');
      }
      form.reset();
      document.getElementById('conta-id').value = '';
      document.getElementById('conta-vencimento').value = todayISO();
      goTab('lista');
      await refreshAll();
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar.', 'error');
    }
  });

  cancelBtn.addEventListener('click', () => {
    form.reset();
    document.getElementById('conta-id').value = '';
    document.getElementById('conta-vencimento').value = todayISO();
  });
}

function goTab(name) {
  document.querySelector(`.tab[data-tab="${name}"]`).click();
}

function editarConta(c) {
  document.getElementById('conta-id').value = c.id;
  document.getElementById('conta-descricao').value = c.descricao;
  document.getElementById('conta-valor').value = c.valor;
  document.getElementById('conta-vencimento').value = c.vencimento;
  document.getElementById('conta-categoria').value = c.categoria;
  document.getElementById('conta-recorrente').checked = !!c.recorrente;
  document.getElementById('conta-obs').value = c.observacoes || '';
  goTab('adicionar');
}

async function marcarPaga(c) {
  c.status = 'paga';
  c.pagaEm = new Date().toISOString();
  await dbPut(c);

  // Se recorrente, criar a próxima do mês seguinte
  if (c.recorrente) {
    const d = new Date(c.vencimento + 'T00:00:00');
    d.setMonth(d.getMonth() + 1);
    const next = {
      descricao: c.descricao,
      valor: c.valor,
      vencimento: d.toISOString().slice(0, 10),
      categoria: c.categoria,
      recorrente: true,
      observacoes: c.observacoes || '',
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    };
    await dbAdd(next);
    showToast('Pago! Próxima criada automaticamente.', 'success');
  } else {
    showToast('Marcada como paga!', 'success');
  }
  await refreshAll();
}

async function desmarcarPaga(c) {
  c.status = 'pendente';
  delete c.pagaEm;
  await dbPut(c);
  await refreshAll();
}

async function excluirConta(c) {
  if (!confirm(`Excluir "${c.descricao}"?`)) return;
  await dbDelete(c.id);
  showToast('Conta excluída.');
  await refreshAll();
}

/* ---------- Render ---------- */
function billItemHTML(c) {
  const st = statusOf(c);
  const diff = daysBetween(c.vencimento);
  let prazoTxt = '';
  if (st === 'paga') prazoTxt = `Pago em ${fmtDate((c.pagaEm || '').slice(0, 10))}`;
  else if (diff < 0) prazoTxt = `Venceu há ${-diff} dia(s)`;
  else if (diff === 0) prazoTxt = 'Vence hoje';
  else prazoTxt = `Em ${diff} dia(s)`;

  return `
    <li class="bill-item ${st}" data-id="${c.id}">
      <div class="bill-info">
        <div class="bill-desc">${escapeHtml(c.descricao)}${c.recorrente ? ' 🔁' : ''}</div>
        <div class="bill-meta">
          <span>📅 ${fmtDate(c.vencimento)}</span>
          <span class="bill-categoria">${escapeHtml(c.categoria)}</span>
          <span>${prazoTxt}</span>
        </div>
      </div>
      <div class="bill-value">${fmtMoney(c.valor)}</div>
      <div class="bill-actions">
        ${
          st === 'paga'
            ? `<button class="btn-mini warn" data-act="desmarcar">↩ Desmarcar</button>`
            : `<button class="btn-mini primary" data-act="pagar">✓ Pagar</button>`
        }
        <button class="btn-mini" data-act="editar">✎ Editar</button>
        <button class="btn-mini danger" data-act="excluir">🗑</button>
      </div>
    </li>
  `;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

function bindListEvents(ul, contas) {
  ul.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = e.target.closest('li[data-id]');
    const id = parseInt(li.dataset.id);
    const c = contas.find((x) => x.id === id);
    if (!c) return;
    const act = btn.dataset.act;
    if (act === 'pagar') await marcarPaga(c);
    else if (act === 'desmarcar') await desmarcarPaga(c);
    else if (act === 'editar') editarConta(c);
    else if (act === 'excluir') await excluirConta(c);
  }, { once: true });
}

async function renderDashboard() {
  const contas = await dbGetAll();
  const hoje = new Date(todayISO() + 'T00:00:00');
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  let sumProx = 0, cntProx = 0;
  let sumVenc = 0, cntVenc = 0;
  let sumPagas = 0, cntPagas = 0;
  let sumMes = 0, cntMes = 0;

  contas.forEach((c) => {
    const venc = new Date(c.vencimento + 'T00:00:00');
    const st = statusOf(c);
    if (st === 'proxima') { sumProx += c.valor; cntProx++; }
    if (st === 'vencida') { sumVenc += c.valor; cntVenc++; }
    if (venc.getMonth() === mesAtual && venc.getFullYear() === anoAtual) {
      sumMes += c.valor; cntMes++;
      if (st === 'paga') { sumPagas += c.valor; cntPagas++; }
    }
  });

  document.getElementById('sum-proximas').textContent = fmtMoney(sumProx);
  document.getElementById('cnt-proximas').textContent = `${cntProx} conta(s)`;
  document.getElementById('sum-vencidas').textContent = fmtMoney(sumVenc);
  document.getElementById('cnt-vencidas').textContent = `${cntVenc} conta(s)`;
  document.getElementById('sum-pagas').textContent = fmtMoney(sumPagas);
  document.getElementById('cnt-pagas').textContent = `${cntPagas} conta(s)`;
  document.getElementById('sum-mes').textContent = fmtMoney(sumMes);
  document.getElementById('cnt-mes').textContent = `${cntMes} conta(s)`;

  // Próximos vencimentos (não pagas, ordenadas por data)
  const proximas = contas
    .filter((c) => c.status !== 'paga')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 8);

  const ul = document.getElementById('list-proximos');
  if (proximas.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhuma conta pendente. 🎉</li>';
  } else {
    ul.innerHTML = proximas.map(billItemHTML).join('');
    bindListEvents(ul, proximas);
  }
}

async function renderLista() {
  const contas = await dbGetAll();
  const statusFilter = document.getElementById('filter-status').value;
  const catFilter = document.getElementById('filter-categoria').value;

  // popular categorias
  const cats = [...new Set(contas.map((c) => c.categoria))].sort();
  const catSel = document.getElementById('filter-categoria');
  const current = catSel.value;
  catSel.innerHTML = '<option value="">Todas categorias</option>' +
    cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  catSel.value = current;

  let filtered = contas;
  if (statusFilter !== 'todas') {
    filtered = filtered.filter((c) => statusOf(c) === statusFilter);
  }
  if (catFilter) {
    filtered = filtered.filter((c) => c.categoria === catFilter);
  }
  filtered.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const ul = document.getElementById('list-contas');
  if (filtered.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhuma conta encontrada.</li>';
  } else {
    ul.innerHTML = filtered.map(billItemHTML).join('');
    bindListEvents(ul, filtered);
  }
}

async function renderCharts() {
  const contas = await dbGetAll();
  const hoje = new Date(todayISO() + 'T00:00:00');
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();

  const doMes = contas.filter((c) => {
    const d = new Date(c.vencimento + 'T00:00:00');
    return d.getMonth() === mes && d.getFullYear() === ano;
  });

  // Por categoria
  const porCat = {};
  doMes.forEach((c) => {
    porCat[c.categoria] = (porCat[c.categoria] || 0) + c.valor;
  });
  const catLabels = Object.keys(porCat);
  const catData = Object.values(porCat);

  if (chartCategoria) chartCategoria.destroy();
  chartCategoria = new Chart(document.getElementById('chart-categoria'), {
    type: 'doughnut',
    data: {
      labels: catLabels.length ? catLabels : ['Sem dados'],
      datasets: [{
        data: catData.length ? catData : [1],
        backgroundColor: ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6', '#64748b'],
      }],
    },
    options: { plugins: { legend: { position: 'bottom' } } },
  });

  // Status (pagas x pendentes)
  const pagas = doMes.filter((c) => c.status === 'paga').reduce((s, c) => s + c.valor, 0);
  const pendentes = doMes.filter((c) => c.status !== 'paga').reduce((s, c) => s + c.valor, 0);

  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(document.getElementById('chart-status'), {
    type: 'bar',
    data: {
      labels: ['Pagas', 'Pendentes'],
      datasets: [{
        data: [pagas, pendentes],
        backgroundColor: ['#16a34a', '#f59e0b'],
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  // Histórico 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ano, mes - i, 1);
    meses.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleString('pt-BR', { month: 'short' }) });
  }
  const valores = meses.map((mm) => {
    return contas
      .filter((c) => {
        const d = new Date(c.vencimento + 'T00:00:00');
        return d.getFullYear() === mm.y && d.getMonth() === mm.m;
      })
      .reduce((s, c) => s + c.valor, 0);
  });

  if (chartHistorico) chartHistorico.destroy();
  chartHistorico = new Chart(document.getElementById('chart-historico'), {
    type: 'line',
    data: {
      labels: meses.map((m) => m.label),
      datasets: [{
        label: 'Total mensal',
        data: valores,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.15)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: { scales: { y: { beginAtZero: true } } },
  });
}

/* ---------- Filtros ---------- */
function setupFilters() {
  document.getElementById('filter-status').addEventListener('change', renderLista);
  document.getElementById('filter-categoria').addEventListener('change', renderLista);
}

/* ---------- Backup ---------- */
function setupBackup() {
  document.getElementById('btn-exportar').addEventListener('click', async () => {
    const data = await dbGetAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-contas-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportado!', 'success');
  });

  document.getElementById('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      if (!Array.isArray(data)) throw new Error('Formato inválido');
      if (!confirm(`Importar ${data.length} conta(s)? As atuais serão substituídas.`)) return;
      await dbClear();
      for (const c of data) {
        delete c.id; // deixa gerar novo id
        await dbAdd(c);
      }
      showToast('Backup importado!', 'success');
      await refreshAll();
    } catch (err) {
      showToast('Arquivo inválido.', 'error');
    }
    e.target.value = '';
  });

  document.getElementById('btn-limpar-tudo').addEventListener('click', async () => {
    if (!confirm('Apagar TODAS as contas? Esta ação não pode ser desfeita.')) return;
    await dbClear();
    showToast('Todas as contas foram apagadas.');
    await refreshAll();
  });
}

/* ---------- Notificações ---------- */
async function setupNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    // pede permissão na primeira interação
    document.body.addEventListener('click', () => {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, { once: true });
  }
  verificarVencimentos();
  // verifica a cada 1h enquanto aberto
  setInterval(verificarVencimentos, 60 * 60 * 1000);
}

async function verificarVencimentos() {
  if (Notification.permission !== 'granted') return;
  const contas = await dbGetAll();
  const hojeKey = 'notif-' + todayISO();
  const jaNotificado = JSON.parse(localStorage.getItem(hojeKey) || '[]');

  contas.forEach((c) => {
    if (c.status === 'paga') return;
    const diff = daysBetween(c.vencimento);
    if (diff < 0 || diff > 3) return; // só vencidas hoje ou próximas em 3 dias
    if (jaNotificado.includes(c.id)) return;

    const titulo =
      diff < 0 ? `⚠ Conta vencida: ${c.descricao}`
      : diff === 0 ? `📌 Vence hoje: ${c.descricao}`
      : `⏰ Vence em ${diff} dia(s): ${c.descricao}`;

    new Notification(titulo, {
      body: `${fmtMoney(c.valor)} — ${c.categoria}`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'conta-' + c.id,
    });
    jaNotificado.push(c.id);
  });
  localStorage.setItem(hojeKey, JSON.stringify(jaNotificado));
}

/* ---------- Install Prompt ---------- */
function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('btn-install').classList.remove('hidden');
  });

  document.getElementById('btn-install').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('btn-install').classList.add('hidden');
  });
}

/* ---------- Init ---------- */
async function refreshAll() {
  await renderDashboard();
  await renderLista();
  if (document.getElementById('tab-relatorios').classList.contains('active')) {
    await renderCharts();
  }
}

(async function init() {
  try {
    db = await openDB();
    setupTabs();
    setupForm();
    setupFilters();
    setupBackup();
    setupInstall();
    await refreshAll();
    setupNotifications();
  } catch (err) {
    console.error(err);
    showToast('Erro ao iniciar o app: ' + err.message, 'error');
  }
})();
