/* ─── State ─── */
const state = {
  reports: [],
  currentDate: null,
  currentReport: null,
  history: {},
  chatOpen: false,
  chatMessages: [],    // {role, content} for API
  chatLoading: false,
  sparklines: new Map(),
};

/* ─── DOM refs ─── */
const dom = {
  datePicker: document.getElementById('datePicker'),
  heroDate: document.getElementById('heroDate'),
  heroAuthor: document.getElementById('heroAuthor'),
  heroComment: document.getElementById('heroComment'),
  heroTickers: document.getElementById('heroTickers'),
  reportLoading: document.getElementById('reportLoading'),
  reportGrid: document.getElementById('reportGrid'),
  chatOverlay: document.getElementById('chatOverlay'),
  chatPanel: document.getElementById('chatPanel'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  chatSend: document.getElementById('chatSend'),
  chatFab: document.getElementById('chatFab'),
  chatToggleNav: document.getElementById('chatToggleNav'),
  chatClose: document.getElementById('chatClose'),
  chatSuggestions: document.getElementById('chatSuggestions'),
  chatContextLabel: document.getElementById('chatContextLabel'),
};

/* ─── Utilities ─── */
function esc(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

function fmtNum(v, decimals) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  if (decimals !== undefined) return n.toFixed(decimals);
  const abs = Math.abs(n);
  if (abs >= 10000) return n.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  if (abs >= 100)   return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  if (abs >= 10)    return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function fmtChange(val, unit) {
  if (val === null || val === undefined || val === '') return { html: '<span class="change-badge flat">—</span>', cls: 'flat' };
  const n = Number(val);
  if (!isFinite(n)) return { html: '<span class="change-badge flat">—</span>', cls: 'flat' };
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const sign = n > 0 ? '+' : '';
  const u = unit ? esc(unit) : '';
  return { html: `<span class="change-badge ${cls}">${sign}${fmtNum(n)}${u}</span>`, cls };
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildSvgLine(values, opts = {}) {
  const width = opts.width || 320;
  const height = opts.height || 120;
  const pad = opts.pad ?? 12;
  const color = opts.color || cssVar('--primary');
  const nums = values.map(Number).filter(Number.isFinite);

  if (!nums.length) {
    return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="no data"></svg>`;
  }

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const step = nums.length > 1 ? (width - pad * 2) / (nums.length - 1) : 0;
  const points = nums.map((value, index) => {
    const x = nums.length > 1 ? pad + index * step : width / 2;
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return { x, y, value };
  });
  const polyline = points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = opts.fill && points.length > 1
    ? `<polygon points="${pad},${height - pad} ${polyline} ${width - pad},${height - pad}" fill="${color}" opacity="0.1"></polygon>`
    : '';
  const dots = opts.dots
    ? points.map(point => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.5" fill="${color}"><title>${fmtNum(point.value)}</title></circle>`).join('')
    : '';

  return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="trend chart">
    ${area}
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="${opts.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${dots}
  </svg>`;
}

function buildSvgBar(labels, values, color) {
  const width = 320;
  const height = 140;
  const pad = 18;
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="no data"></svg>`;
  const max = Math.max(...nums.map(Math.abs), 1);
  const barGap = 6;
  const barWidth = Math.max(4, (width - pad * 2 - barGap * (nums.length - 1)) / nums.length);
  const zeroY = height - pad;
  const bars = nums.map((value, index) => {
    const x = pad + index * (barWidth + barGap);
    const h = Math.max(2, Math.abs(value) / max * (height - pad * 2));
    const y = value >= 0 ? zeroY - h : zeroY;
    const label = labels[index] || '';
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill="${color}"><title>${esc(label)} ${fmtNum(value)}</title></rect>`;
  }).join('');
  return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="bar chart">${bars}</svg>`;
}

function dayLabel(dateStr) {
  if (!dateStr) return '';
  const days = ['일','월','화','수','목','금','토'];
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = days[d.getDay()];
  return `${month}월 ${day}일 (${dow})`;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

/* ─── Data loading ─── */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readDateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('date');
  return raw && DATE_PATTERN.test(raw) ? raw : null;
}

function syncUrlToDate(date) {
  const params = new URLSearchParams(window.location.search);
  if (date) {
    params.set('date', date);
  } else {
    params.delete('date');
  }
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', next);
}

async function loadReports() {
  const data = await fetchJson('/api/reports');
  state.reports = data.reports || [];
  renderDatePicker();

  if (state.reports.length === 0) {
    dom.reportLoading.innerHTML = '<p>표시할 리포트가 아직 없습니다.</p>';
    syncUrlToDate(null);
    return;
  }

  const urlDate = readDateFromUrl();
  const knownDates = new Set(state.reports.map((r) => r.date));
  const target = urlDate && knownDates.has(urlDate) ? urlDate : state.reports[0].date;
  await loadReport(target);
  loadHistory().catch(() => {});
}

async function loadReport(date) {
  state.currentDate = date;
  syncUrlToDate(date);
  renderDatePicker();
  dom.reportLoading.hidden = false;
  dom.reportLoading.textContent = '리포트를 불러오는 중...';
  dom.reportGrid.hidden = true;
  try {
    const data = await fetchJson(`/api/reports/${date}`);
    state.currentReport = data;
    dom.chatContextLabel.textContent = `${dayLabel(date)} 데이터 기반`;
    renderReport(data);
    dom.reportLoading.hidden = true;
    dom.reportGrid.hidden = false;
  } catch (err) {
    dom.reportLoading.hidden = false;
    dom.reportLoading.innerHTML = `<p style="color:var(--down)">${esc(date)} 리포트 로드 실패: ${esc(err.message)}</p>`;
    dom.reportGrid.hidden = true;
    throw err;
  }
}

async function loadHistory() {
  const data = await fetchJson('/api/history?days=7');
  state.history = data.history || {};
  updateSparklines();
}

/* ─── Render date picker ─── */
function renderDatePicker() {
  dom.datePicker.innerHTML = state.reports.map(r => `
    <button class="date-pill ${r.date === state.currentDate ? 'active' : ''}"
            type="button" data-date="${esc(r.date)}">${dayLabel(r.date)}</button>
  `).join('');
  dom.datePicker.querySelectorAll('[data-date]').forEach(btn => {
    btn.addEventListener('click', () => loadReport(btn.dataset.date).catch(() => {}));
  });
}

/* ─── Render report ─── */
function renderReport(report) {
  renderHero(report);
  renderGrid(report);
}

function renderHero(report) {
  dom.heroDate.textContent = `2026년 ${dayLabel(report.report_date)}`;
  dom.heroAuthor.textContent = report.author || '자금운용본부';

  const comment = report.comment;
  const text = comment?.final_comment || comment?.auto_comment || '';
  dom.heroComment.textContent = text;

  const tickers = [
    { key: 'kospi', label: 'KOSPI', decimals: 1, unit: 'pt' },
    { key: 'usdkrw', label: 'USD/KRW', decimals: 1, unit: '₩', invertColor: true },
    { key: 'us_10y', label: '미국 10Y', decimals: 2, unit: '%', rateBond: true },
    { key: 'gold', label: '금', decimals: 1, unit: 'USD' },
    { key: 'wti', label: 'WTI', decimals: 2, unit: 'USD' },
  ];
  const obs = report.observations || [];
  dom.heroTickers.innerHTML = tickers.map(t => {
    const item = obs.find(o => o.metric_key === t.key);
    if (!item) return '';
    const val = fmtNum(item.value, t.decimals);
    const chg = item.change_1d;
    let cls = 'flat';
    let chgText = '—';
    if (chg !== null && chg !== undefined && isFinite(Number(chg))) {
      const n = Number(chg);
      // For bonds (rates), up = unfavorable; for USD/KRW, down = KRW strong (favorable)
      if (t.invertColor) cls = n < 0 ? 'up' : n > 0 ? 'down' : 'flat';
      else if (t.rateBond) cls = n < 0 ? 'up' : n > 0 ? 'down' : 'flat';
      else cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
      const sign = n > 0 ? '+' : '';
      chgText = `${sign}${fmtNum(n, t.decimals)}`;
    }
    return `<div class="ticker-card">
      <span class="ticker-label">${esc(t.label)}</span>
      <span class="ticker-value">${val}</span>
      <span class="ticker-change ${cls}">${chgText}</span>
    </div>`;
  }).join('');
}

/* ─── Category definitions ─── */
const CATEGORIES = [
  { key: 'domestic_rates',          label: '국내금리',               sparkMetric: 'kr_10y',       tint: 'tint-blue',   fullWidth: false },
  { key: 'global_rates',            label: '해외금리',               sparkMetric: 'us_10y',       tint: 'tint-purple', fullWidth: false },
  { key: 'domestic_equities_fx',    label: '국내 주식·환율',         sparkMetric: 'kospi',        tint: 'tint-green',  fullWidth: false },
  { key: 'global_equities_fx_crypto', label: '해외 주식·환율·암호화폐', sparkMetric: 'sp500', tint: 'tint-teal',   fullWidth: false },
  { key: 'investor_flows',          label: '투자자 동향',             sparkMetric: null,           tint: 'tint-orange', fullWidth: true  },
  { key: 'commodities',             label: '원자재',                 sparkMetric: 'gold',         tint: 'tint-yellow', fullWidth: false },
];

function renderGrid(report) {
  const obs = report.observations || [];
  const byCategory = {};
  for (const o of obs) {
    if (!byCategory[o.category]) byCategory[o.category] = [];
    byCategory[o.category].push(o);
  }

  dom.reportGrid.innerHTML = '';

  // Category cards
  for (const cat of CATEGORIES) {
    const items = byCategory[cat.key] || [];
    if (cat.key === 'investor_flows') {
      dom.reportGrid.appendChild(renderFlowsCard(cat, items));
    } else {
      dom.reportGrid.appendChild(renderMetricsCard(cat, items));
    }
  }

  // Comment card
  const comment = report.comment;
  if (comment?.auto_comment || comment?.final_comment) {
    const div = document.createElement('div');
    div.className = 'comment-section';
    const text = comment.final_comment || comment.auto_comment;
    const status = comment.status || 'draft';
    div.innerHTML = `
      <div class="comment-label">
        <span>📝 오늘의 코멘트</span>
        <span class="comment-status-badge ${status}">${esc(status)}</span>
      </div>
      <p class="comment-text">${esc(text)}</p>
    `;
    dom.reportGrid.appendChild(div);
  }

  // Init sparklines after DOM is ready
  requestAnimationFrame(() => initSparklines(report));
}

function computeSignal(items) {
  const changes = items.map(i => i.change_1d).filter(v => v !== null && v !== undefined && isFinite(Number(v)));
  if (!changes.length) return { cls: 'flat', label: '중립' };
  const pos = changes.filter(v => Number(v) > 0).length;
  const neg = changes.filter(v => Number(v) < 0).length;
  if (pos > neg && pos >= changes.length * 0.6) return { cls: 'up', label: '대체로 상승' };
  if (neg > pos && neg >= changes.length * 0.6) return { cls: 'down', label: '대체로 하락' };
  return { cls: 'flat', label: '혼조' };
}

function renderMetricsCard(cat, items) {
  const card = document.createElement('div');
  card.className = `category-card${cat.fullWidth ? ' full-width' : ''}`;
  card.dataset.category = cat.key;

  const signal = computeSignal(items);
  const canvasId = `spark-${cat.key}`;

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-group">
        <div class="card-eyebrow">${esc(cat.key.replace(/_/g,' '))}</div>
        <div class="card-title">${esc(cat.label)}</div>
        <div class="card-signal">
          <span class="signal-dot ${signal.cls}"></span>
          <span>${esc(signal.label)}</span>
        </div>
      </div>
      <div class="card-sparkline-wrap" id="${canvasId}">
      </div>
    </div>
    <div class="metrics-table-wrap">
      <table class="metrics-table">
        <thead>
          <tr>
            <th>지표</th>
            <th>현재값</th>
            <th>전일대비</th>
            <th>작년말대비</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const chg1d = fmtChange(item.change_1d, item.change_1d_unit);
            const chgYtd = fmtChange(item.change_ytd, item.change_ytd_unit);
            return `<tr>
              <td><div class="metric-name">${esc(item.metric_name)}</div></td>
              <td><span class="metric-value">${fmtNum(item.value)}</span><span class="metric-unit">${esc(item.unit||'')}</span></td>
              <td>${chg1d.html}</td>
              <td>${chgYtd.html}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  return card;
}

function renderFlowsCard(cat, items) {
  const card = document.createElement('div');
  card.className = 'category-card full-width';

  const maxAbs = Math.max(...items.map(i => Math.abs(i.value || 0)), 1);

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-group">
        <div class="card-eyebrow">investor flows</div>
        <div class="card-title">${esc(cat.label)}</div>
      </div>
    </div>
    <div class="flows-grid">
      ${items.map(item => {
        const v = item.value || 0;
        const isBuy = v >= 0;
        const pct = Math.min(100, (Math.abs(v) / maxAbs) * 100);
        const cls = isBuy ? 'buy' : 'sell';
        const sign = v > 0 ? '+' : '';
        return `<div class="flow-item">
          <div class="flow-name">${esc(item.metric_name)}</div>
          <div class="flow-bar-wrap">
            <div class="flow-bar-bg">
              <div class="flow-bar ${cls}" style="width:${pct.toFixed(1)}%"></div>
            </div>
          </div>
          <div class="flow-value ${cls}">${sign}${fmtNum(v)} ${esc(item.unit||'')}</div>
        </div>`;
      }).join('')}
    </div>
  `;
  return card;
}

/* ─── Sparklines ─── */
function initSparklines(report) {
  const obs = report.observations || [];
  for (const cat of CATEGORIES) {
    if (!cat.sparkMetric) continue;
    const target = document.getElementById(`spark-${cat.key}`);
    if (!target) continue;
    const item = obs.find(o => o.metric_key === cat.sparkMetric);
    if (!item) continue;

    const hist = state.history[cat.sparkMetric];
    const values = hist ? hist.map(h => h.value) : [item.value];

    renderSparkline(target, values, cat.key);
    state.sparklines.set(cat.key, { target, metric: cat.sparkMetric });
  }
}

function updateSparklines() {
  for (const [catKey, { target, metric }] of state.sparklines) {
    const hist = state.history[metric];
    if (!hist) continue;
    renderSparkline(target, hist.map(h => h.value), catKey);
  }
}

const SPARKLINE_COLORS = {
  domestic_rates: 'primary',
  global_rates: 'primary-hover',
  domestic_equities_fx: 'up',
  global_equities_fx_crypto: 'down',
  commodities: 'warn',
};

function renderSparkline(target, values, catKey) {
  const token = SPARKLINE_COLORS[catKey] || 'primary';
  target.innerHTML = buildSvgLine(values, {
    color: cssVar(`--${token}`),
    width: 110,
    height: 44,
    pad: 4,
    strokeWidth: 1.8,
  });
}

/* ─────────────────────────────────────────────────────────────────
   Chat panel
   ───────────────────────────────────────────────────────────────── */
function openChat() {
  if (state.chatOpen) return;
  state.chatOpen = true;
  dom.chatPanel.hidden = false;
  dom.chatOverlay.hidden = false;
  dom.chatFab.classList.add('hidden');
  setTimeout(() => dom.chatInput.focus(), 300);
}

function closeChat() {
  if (!state.chatOpen) return;
  state.chatOpen = false;
  dom.chatPanel.hidden = true;
  dom.chatOverlay.hidden = true;
  dom.chatFab.classList.remove('hidden');
}

dom.chatFab.addEventListener('click', openChat);
dom.chatToggleNav.addEventListener('click', openChat);
dom.chatClose.addEventListener('click', closeChat);
dom.chatOverlay.addEventListener('click', closeChat);

/* ─── Suggestion chips ─── */
dom.chatSuggestions.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    dom.chatInput.value = chip.dataset.q;
    sendMessage();
  });
});

/* ─── Auto-resize textarea ─── */
dom.chatInput.addEventListener('input', () => {
  dom.chatInput.style.height = 'auto';
  dom.chatInput.style.height = `${Math.min(dom.chatInput.scrollHeight, 140)}px`;
});

dom.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
dom.chatSend.addEventListener('click', sendMessage);

async function buildAskPayload(question) {
  let validation = [];

  if (state.currentDate) {
    try {
      const validationResult = await fetchJson(`/api/validation/${state.currentDate}`);
      validation = validationResult.cross_checks || [];
    } catch {
      validation = [];
    }
  }

  return {
    question,
    report_date: state.currentDate,
    surface: 'public_report',
    selected_metric: null,
    report_comment: {
      status: state.currentReport?.comment?.status || null,
      final_comment: state.currentReport?.comment?.final_comment || null,
      auto_comment: state.currentReport?.comment?.auto_comment || null,
      reference_note: state.currentReport?.comment?.reference_note || null,
    },
    validation,
    history: [],
    research_items: [],
  };
}

async function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text || state.chatLoading) return;

  dom.chatInput.value = '';
  dom.chatInput.style.height = 'auto';
  dom.chatSuggestions.style.display = 'none';

  appendUserMessage(text);
  state.chatMessages.push({ role: 'user', content: text });

  const typingEl = appendTyping();
  state.chatLoading = true;
  dom.chatSend.disabled = true;

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await buildAskPayload(text)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '서버 오류');

    typingEl.remove();
    const blocks = data.blocks || [{ type: 'text', content: data.answer || '답변을 생성하지 못했습니다.' }];
    const assistantHtml = renderBlocks(blocks);
    appendAssistantMessage(assistantHtml, blocks);
    // Keep rolling summary in API messages
    state.chatMessages.push({ role: 'assistant', content: data.rawText || blocksToText(blocks) });
  } catch (err) {
    typingEl.remove();
    appendErrorMessage(err.message);
  } finally {
    state.chatLoading = false;
    dom.chatSend.disabled = false;
  }
}

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-message user';
  div.innerHTML = `<div class="chat-bubble">${esc(text).replace(/\n/g,'<br>')}</div>`;
  dom.chatMessages.appendChild(div);
  scrollChat();
}

function appendAssistantMessage(html, blocks) {
  const div = document.createElement('div');
  div.className = 'chat-message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = html;
  div.appendChild(bubble);
  dom.chatMessages.appendChild(div);
  scrollChat();
  // Render charts inside after DOM insert
  bubble.querySelectorAll('[data-chart]').forEach(target => {
    try {
      const cfg = JSON.parse(target.dataset.chart);
      renderChatChart(target, cfg);
    } catch {}
  });
}

function appendTyping() {
  const div = document.createElement('div');
  div.className = 'chat-message assistant';
  div.innerHTML = `<div class="chat-typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  dom.chatMessages.appendChild(div);
  scrollChat();
  return div;
}

function appendErrorMessage(msg) {
  const div = document.createElement('div');
  div.className = 'chat-message assistant';
  div.innerHTML = `<div class="chat-error">오류: ${esc(msg)}</div>`;
  dom.chatMessages.appendChild(div);
  scrollChat();
}

function scrollChat() {
  requestAnimationFrame(() => { dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight; });
}

/* ─── Block rendering ─── */
function renderBlocks(blocks) {
  return blocks.map(block => {
    if (block.type === 'text') return renderTextBlock(block);
    if (block.type === 'table') return renderTableBlock(block);
    if (block.type === 'chart') return renderChartBlock(block);
    return '';
  }).join('');
}

function renderTextBlock(block) {
  const lines = (block.content || '').split('\n');
  return `<div class="chat-block">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
}

function renderTableBlock(block) {
  const title = block.title ? `<div class="chat-block-title">${esc(block.title)}</div>` : '';
  const headers = (block.headers || []).map(h => `<th>${esc(h)}</th>`).join('');
  const rows = (block.rows || []).map(row =>
    `<tr>${row.map(cell => `<td>${esc(String(cell ?? ''))}</td>`).join('')}</tr>`
  ).join('');
  return `<div class="chat-block">
    ${title}
    <div class="chat-table-wrap">
      <table class="chat-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderChartBlock(block) {
  const id = `cc-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const title = block.title ? `<div class="chat-block-title">${esc(block.title)}</div>` : '';
  const cfg = JSON.stringify(block);
  return `<div class="chat-block">
    ${title}
    <div class="chat-chart-wrap" id="${id}" data-chart="${esc(cfg)}">
    </div>
  </div>`;
}

function renderChatChart(target, block) {
  const palette = [
    cssVar('--primary'),
    cssVar('--up'),
    cssVar('--down'),
    cssVar('--warn'),
    cssVar('--primary-hover'),
  ];
  const type = block.chartType === 'bar' ? 'bar' : 'line';
  const datasets = block.datasets || [];
  const first = datasets[0] || { data: [] };
  const color = palette[0];
  target.innerHTML = type === 'bar'
    ? buildSvgBar(block.labels || [], first.data || [], color)
    : buildSvgLine(first.data || [], { color, fill: true, dots: true, width: 320, height: 140, pad: 18 });
}

function blocksToText(blocks) {
  return blocks.filter(b => b.type === 'text').map(b => b.content).join('\n');
}

/* ─── Boot ─── */
loadReports().catch(err => {
  dom.reportLoading.innerHTML = `<p style="color:var(--down)">리포트 로드 실패: ${esc(err.message)}</p>`;
});
