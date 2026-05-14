/* ===========================================================
   Minhas Contas - App de Contas a Pagar (PWA)
   Armazenamento em nuvem via Firebase Firestore
   =========================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyBtiNj8LGnqAwpzGyGgDQ9uUavJNkRWRZ4",
  authDomain: "contasapagar-3fbb0.firebaseapp.com",
  projectId: "contasapagar-3fbb0",
  storageBucket: "contasapagar-3fbb0.firebasestorage.app",
  messagingSenderId: "98517519915",
  appId: "1:98517519915:web:3a1cf70fe7f0091514e46e",
};

firebase.initializeApp(firebaseConfig);
const firestoreDb = firebase.firestore();
const auth = firebase.auth();

let currentUser = null;
let appInitialized = false;
let chartCategoria = null;
let chartStatus = null;
let chartHistorico = null;
let deferredPrompt = null;

/* ---------- Firestore helpers ---------- */
function getCol() {
  return firestoreDb.collection('users').doc(currentUser.uid).collection('contas');
}

async function dbAdd(conta) {
  const ref = await getCol().add(conta);
  return ref.id;
}

async function dbPut(conta) {
  const { id, ...data } = conta;
  await getCol().doc(id).set(data);
  return id;
}

async function dbDelete(id) {
  await getCol().doc(id).delete();
}

async function dbGetAll() {
  const snapshot = await getCol().get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function dbClear() {
  const snapshot = await getCol().get();
  const batch = firestoreDb.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/* ---------- Utils ---------- */
const fmtMoney = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
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

function statusLabel(c) {
  const st = statusOf(c);
  if (st === 'paga') return 'Paga';
  if (st === 'vencida') return 'Vencida';
  if (st === 'proxima') return 'A vencer';
  return 'Pendente';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
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

function goTab(name) {
  document.querySelector('.tab[data-tab="' + name + '"]').click();
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
        conta.id = id;
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
  if (!confirm('Excluir "' + c.descricao + '"?')) return;
  await dbDelete(c.id);
  showToast('Conta excluída.');
  await refreshAll();
}

/* ---------- Render ---------- */
function billItemHTML(c) {
  const st = statusOf(c);
  const diff = daysBetween(c.vencimento);
  let prazoTxt = '';
  if (st === 'paga') prazoTxt = 'Pago em ' + fmtDate((c.pagaEm || '').slice(0, 10));
  else if (diff < 0) prazoTxt = 'Venceu há ' + (-diff) + ' dia(s)';
  else if (diff === 0) prazoTxt = 'Vence hoje';
  else prazoTxt = 'Em ' + diff + ' dia(s)';

  const acoes = st === 'paga'
    ? '<button class="btn-mini warn" data-act="desmarcar">↩ Desmarcar</button>'
    : '<button class="btn-mini primary" data-act="pagar">✓ Pagar</button>';

  return ''
    + '<li class="bill-item ' + st + '" data-id="' + c.id + '">'
    +   '<div class="bill-info">'
    +     '<div class="bill-desc">' + escapeHtml(c.descricao) + (c.recorrente ? ' 🔁' : '') + '</div>'
    +     '<div class="bill-meta">'
    +       '<span>📅 ' + fmtDate(c.vencimento) + '</span>'
    +       '<span class="bill-categoria">' + escapeHtml(c.categoria) + '</span>'
    +       '<span>' + prazoTxt + '</span>'
    +     '</div>'
    +   '</div>'
    +   '<div class="bill-value">' + fmtMoney(c.valor) + '</div>'
    +   '<div class="bill-actions">'
    +     acoes
    +     '<button class="btn-mini" data-act="editar">✎ Editar</button>'
    +     '<button class="btn-mini danger" data-act="excluir">🗑</button>'
    +   '</div>'
    + '</li>';
}

function bindListEvents(ul, contas) {
  ul.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = e.target.closest('li[data-id]');
    const id = li.dataset.id;
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
  const chaveMesAtual = anoAtual * 12 + mesAtual;

  let sumVencerMes = 0, cntVencerMes = 0;
  let sumProxMeses = 0, cntProxMeses = 0;

  contas.forEach((c) => {
    if (c.status === 'paga') return;
    const venc = new Date(c.vencimento + 'T00:00:00');
    const chaveMes = venc.getFullYear() * 12 + venc.getMonth();
    if (chaveMes === chaveMesAtual) {
      sumVencerMes += c.valor;
      cntVencerMes++;
    } else if (chaveMes > chaveMesAtual) {
      sumProxMeses += c.valor;
      cntProxMeses++;
    }
  });

  document.getElementById('sum-vencer-mes').textContent = fmtMoney(sumVencerMes);
  document.getElementById('cnt-vencer-mes').textContent = cntVencerMes + ' conta(s)';
  document.getElementById('sum-prox-meses').textContent = fmtMoney(sumProxMeses);
  document.getElementById('cnt-prox-meses').textContent = cntProxMeses + ' conta(s)';

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

  const cats = [...new Set(contas.map((c) => c.categoria))].sort();
  const catSel = document.getElementById('filter-categoria');
  const current = catSel.value;
  catSel.innerHTML = '<option value="">Todas categorias</option>' +
    cats.map((c) => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
  catSel.value = current;

  let filtered = contas;
  if (statusFilter !== 'todas') {
    filtered = filtered.filter((c) => statusOf(c) === statusFilter);
  }
  if (catFilter) {
    filtered = filtered.filter((c) => c.categoria === catFilter);
  }
  filtered.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  // Subtotal do filtro
  const subtotal = filtered.reduce((s, c) => s + Number(c.valor || 0), 0);
  document.getElementById('subtotal-cnt').textContent = filtered.length;
  document.getElementById('subtotal-valor').textContent = fmtMoney(subtotal);

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
        backgroundColor: ['#16a34a', '#15803d', '#dc2626', '#f59e0b', '#059669', '#a855f7', '#ec4899', '#14b8a6', '#64748b'],
      }],
    },
    options: { plugins: { legend: { position: 'bottom' } } },
  });

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
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.15)',
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

/* ---------- Exportar PDF ---------- */
async function exportarPDF() {
  try {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) {
      showToast('Biblioteca de PDF não carregada. Verifique a conexão.', 'error');
      return;
    }

    const contas = await dbGetAll();
    if (contas.length === 0) {
      showToast('Nenhuma conta para exportar.', 'error');
      return;
    }

    const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y;

    // Cabeçalho
    doc.setFillColor(22, 163, 74);
    doc.rect(0, 0, pageW, 60, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatorio de Contas a Pagar', margin, 38);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const dataGeracao = new Date().toLocaleString('pt-BR');
    doc.text('Gerado em: ' + dataGeracao, pageW - margin, 38, { align: 'right' });

    y = 90;
    doc.setTextColor(15, 23, 42);

    // Resumo
    const hoje = new Date(todayISO() + 'T00:00:00');
    const chaveMesAtual = hoje.getFullYear() * 12 + hoje.getMonth();
    let totalVencerMes = 0, cntVencerMes = 0;
    let totalProxMeses = 0, cntProxMeses = 0;
    let totalVencidas = 0, cntVencidas = 0;
    let totalPagasMes = 0, cntPagasMes = 0;

    contas.forEach((c) => {
      const venc = new Date(c.vencimento + 'T00:00:00');
      const chaveMes = venc.getFullYear() * 12 + venc.getMonth();
      if (c.status === 'paga') {
        if (chaveMes === chaveMesAtual) { totalPagasMes += c.valor; cntPagasMes++; }
        return;
      }
      if (chaveMes === chaveMesAtual) { totalVencerMes += c.valor; cntVencerMes++; }
      else if (chaveMes > chaveMesAtual) { totalProxMeses += c.valor; cntProxMeses++; }
      else { totalVencidas += c.valor; cntVencidas++; }
    });

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo', margin, y);
    y += 18;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const resumoLinhas = [
      ['Total a Vencer no Mes (' + cntVencerMes + ' conta(s))', fmtMoney(totalVencerMes)],
      ['Total dos Proximos Meses (' + cntProxMeses + ' conta(s))', fmtMoney(totalProxMeses)],
      ['Vencidas (' + cntVencidas + ' conta(s))', fmtMoney(totalVencidas)],
      ['Pagas no Mes (' + cntPagasMes + ' conta(s))', fmtMoney(totalPagasMes)],
    ];
    resumoLinhas.forEach((linha) => {
      doc.text(linha[0], margin, y);
      doc.text(linha[1], pageW - margin, y, { align: 'right' });
      y += 16;
    });

    y += 10;

    // Por categoria (pendentes)
    const porCat = {};
    contas.forEach((c) => {
      if (c.status === 'paga') return;
      porCat[c.categoria] = (porCat[c.categoria] || 0) + c.valor;
    });
    const catRows = Object.entries(porCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => [cat, fmtMoney(val)]);

    if (catRows.length > 0) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Pendentes por categoria', margin, y);
      y += 8;
      doc.autoTable({
        startY: y,
        head: [['Categoria', 'Total']],
        body: catRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 10 },
        headStyles: { fillColor: [22, 163, 74] },
        columnStyles: { 1: { halign: 'right' } },
      });
      y = doc.lastAutoTable.finalY + 20;
    }

    // Tabela completa de contas
    const contasOrdenadas = [...contas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const bodyRows = contasOrdenadas.map((c) => [
      fmtDate(c.vencimento),
      c.descricao,
      c.categoria,
      statusLabel(c),
      fmtMoney(c.valor),
    ]);
    const totalGeral = contasOrdenadas.reduce((s, c) => s + c.valor, 0);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Todas as contas', margin, y);
    y += 8;
    doc.autoTable({
      startY: y,
      head: [['Vencimento', 'Descricao', 'Categoria', 'Status', 'Valor']],
      body: bodyRows,
      foot: [[
        { content: 'Total geral', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: fmtMoney(totalGeral), styles: { halign: 'right', fontStyle: 'bold' } },
      ]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235] },
      footStyles: { fillColor: [226, 232, 240], textColor: 15 },
      columnStyles: {
        0: { cellWidth: 70 },
        3: { cellWidth: 60 },
        4: { halign: 'right', cellWidth: 80 },
      },
    });

    // Rodape com numeracao
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        'Pagina ' + i + ' de ' + totalPaginas + ' - Minhas Contas',
        pageW / 2,
        doc.internal.pageSize.getHeight() - 20,
        { align: 'center' }
      );
    }

    doc.save('relatorio-contas-' + todayISO() + '.pdf');
    showToast('PDF gerado com sucesso!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erro ao gerar PDF: ' + err.message, 'error');
  }
}

/* ---------- Backup ---------- */
function setupBackup() {
  document.getElementById('btn-exportar-pdf').addEventListener('click', exportarPDF);

  document.getElementById('btn-exportar').addEventListener('click', async () => {
    const data = await dbGetAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-contas-' + todayISO() + '.json';
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
      if (!Array.isArray(data)) throw new Error('Formato invalido');
      if (!confirm('Importar ' + data.length + ' conta(s)? As atuais serao substituidas.')) return;
      await dbClear();
      for (const c of data) {
        delete c.id;
        await dbAdd(c);
      }
      showToast('Backup importado!', 'success');
      await refreshAll();
    } catch (err) {
      showToast('Arquivo invalido.', 'error');
    }
    e.target.value = '';
  });

  document.getElementById('btn-limpar-tudo').addEventListener('click', async () => {
    if (!confirm('Apagar TODAS as contas? Esta acao nao pode ser desfeita.')) return;
    await dbClear();
    showToast('Todas as contas foram apagadas.');
    await refreshAll();
  });
}

/* ---------- Notificacoes ---------- */
async function setupNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    document.body.addEventListener('click', () => {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, { once: true });
  }
  verificarVencimentos();
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
    if (diff < 0 || diff > 3) return;
    if (jaNotificado.includes(c.id)) return;

    let titulo;
    if (diff < 0) titulo = 'Conta vencida: ' + c.descricao;
    else if (diff === 0) titulo = 'Vence hoje: ' + c.descricao;
    else titulo = 'Vence em ' + diff + ' dia(s): ' + c.descricao;

    new Notification(titulo, {
      body: fmtMoney(c.valor) + ' - ' + c.categoria,
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

/* ---------- Auth ---------- */
function setupAuth() {
  document.getElementById('btn-google-login').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(() => showToast('Erro ao fazer login.', 'error'));
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    auth.signOut().then(() => location.reload());
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const loginScreen = document.getElementById('login-screen');
    if (user) {
      loginScreen.classList.add('hidden');
      document.getElementById('user-name').textContent = user.displayName || user.email;
      document.getElementById('btn-logout').classList.remove('hidden');
      if (!appInitialized) {
        appInitialized = true;
        await setupApp();
      }
    } else {
      loginScreen.classList.remove('hidden');
      document.getElementById('btn-logout').classList.add('hidden');
    }
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

async function setupApp() {
  try {
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
}

(function init() {
  setupAuth();
})();
