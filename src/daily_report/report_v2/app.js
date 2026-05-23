const state = {
  reports: [],
  currentDate: null,
  currentReport: null,
  currentValidation: null,
  history: {},
  chatOpen: false,
  chatLoading: false,
  sparklines: new Map(),
};

const dom = {
  datePicker: document.getElementById('datePicker'),
  heroDate: document.getElementById('heroDate'),
  heroAuthor: document.getElementById('heroAuthor'),
  heroComment: document.getElementById('heroComment'),
  heroTickers: document.getElementById('heroTickers'),
  opsStrip: document.getElementById('opsStrip'),
  briefBoard: document.getElementById('briefBoard'),
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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const CATEGORY_META = [
  { key: 'domestic_rates', label: '국내 금리', eyebrow: 'Rates', sparkMetric: 'kr_gov_10y', tone: 'blue' },
  { key: 'global_rates', label: '해외 금리', eyebrow: 'Global Rates', sparkMetric: 'us_treasury_10y', tone: 'violet' },
  { key: 'domestic_equities_fx', label: '국내 주식·환율', eyebrow: 'Korea Market', sparkMetric: 'kospi', tone: 'green' },
  { key: 'global_equities_fx_crypto', label: '해외 주식·환율·암호화폐', eyebrow: 'Global Market', sparkMetric: 'sp500', tone: 'teal' },
  { key: 'investor_flows', label: '투자자 동향', eyebrow: 'Investor Flows', sparkMetric: null, tone: 'orange', wide: true },
  { key: 'commodities', label: '원자재', eyebrow: 'Commodities', sparkMetric: 'gold', tone: 'yellow' },
];

const TICKERS = [
  { key: 'kospi', label: 'KOSPI', decimals: 1, unit: 'pt' },
  { key: 'usdkrw', label: 'USD/KRW', decimals: 1, unit: '원', invertColor: true },
  { key: 'us_treasury_10y', label: 'US 10Y', decimals: 2, unit: '%', rateBond: true },
  { key: 'gold', label: 'Gold', decimals: 1, unit: 'USD' },
  { key: 'wti', label: 'WTI', decimals: 2, unit: 'USD' },
];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtNum(value, decimals) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (decimals !== undefined) return number.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const abs = Math.abs(number);
  const maximumFractionDigits = abs >= 10000 ? 0 : abs >= 100 ? 1 : 2;
  return number.toLocaleString('ko-KR', { maximumFractionDigits });
}

function dayLabel(dateStr, includeYear = false) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const label = `${month}.${String(day).padStart(2, '0')} (${WEEKDAYS[date.getDay()]})`;
  return includeYear ? `${year}.${label}` : label;
}

function readDateFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('date');
  return raw && DATE_PATTERN.test(raw) ? raw : null;
}

function syncUrlToDate(date) {
  const params = new URLSearchParams(window.location.search);
  if (date) params.set('date', date);
  else params.delete('date');
  window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || data?.message || `${response.status} ${response.statusText}`);
  return data;
}

function classifyChange(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'flat';
  if (number > 0) return 'up';
  if (number < 0) return 'down';
  return 'flat';
}

function changeText(value, unit = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : '';
  return `${sign}${fmtNum(number)}${unit || ''}`;
}

function formatChange(value, unit) {
  const cls = classifyChange(value);
  return `<span class="change-badge ${cls}">${esc(changeText(value, unit))}</span>`;
}

function buildSvgLine(values, opts = {}) {
  const width = opts.width || 320;
  const height = opts.height || 120;
  const pad = opts.pad ?? 14;
  const color = opts.color || cssVar('--primary');
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="no data"></svg>`;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const step = nums.length > 1 ? (width - pad * 2) / (nums.length - 1) : 0;
  const points = nums.map((value, index) => {
    const x = nums.length > 1 ? pad + index * step : width / 2;
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return { x, y, value };
  });
  const polyline = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = opts.fill && points.length > 1
    ? `<polygon points="${pad},${height - pad} ${polyline} ${width - pad},${height - pad}" fill="${color}" opacity="0.10"></polygon>`
    : '';
  const dots = opts.dots
    ? points.map((point) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.5" fill="${color}"><title>${fmtNum(point.value)}</title></circle>`).join('')
    : '';
  return `<svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="trend chart">${area}<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="${opts.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round"></polyline>${dots}</svg>`;
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

async function loadReports() {
  const data = await fetchJson('/api/reports');
  state.reports = data.reports || [];
  renderDatePicker();

  if (!state.reports.length) {
    dom.reportLoading.innerHTML = '<p>표시할 리포트가 아직 없습니다.</p>';
    syncUrlToDate(null);
    return;
  }

  const urlDate = readDateFromUrl();
  const dates = new Set(state.reports.map((report) => report.date));
  const target = urlDate && dates.has(urlDate) ? urlDate : state.reports[0].date;
  await loadReport(target);
  loadHistory().catch(() => {});
}

async function loadReport(date) {
  state.currentDate = date;
  syncUrlToDate(date);
  renderDatePicker();
  dom.reportLoading.hidden = false;
  dom.reportLoading.innerHTML = '<div class="loading-spinner"></div><p>리포트를 불러오는 중...</p>';
  dom.reportGrid.hidden = true;

  try {
    const data = await fetchJson(`/api/reports/${date}`);
    state.currentReport = data;
    state.currentValidation = await loadValidation(date);
    dom.chatContextLabel.textContent = `${dayLabel(date, true)} 데이터 기반`;
    renderReport(data);
    dom.reportLoading.hidden = true;
    dom.reportGrid.hidden = false;
  } catch (error) {
    dom.reportLoading.hidden = false;
    dom.reportLoading.innerHTML = `<p style="color:var(--down)">${esc(date)} 리포트 로드 실패: ${esc(error.message)}</p>`;
    dom.reportGrid.hidden = true;
  }
}

async function loadHistory() {
  const data = await fetchJson('/api/history?days=7');
  state.history = data.history || {};
  updateSparklines();
}

async function loadValidation(date) {
  try {
    return await fetchJson(`/api/validation/${date}`);
  } catch (error) {
    return {
      report_date: date,
      status: 'unavailable',
      observations: 0,
      errors: [error.message],
      warnings: [],
      cross_checks: [],
      approvals: [],
    };
  }
}

function renderDatePicker() {
  dom.datePicker.innerHTML = state.reports.map((report) => `
    <button class="date-pill ${report.date === state.currentDate ? 'active' : ''}" type="button" data-date="${esc(report.date)}">
      ${esc(dayLabel(report.date))}
    </button>
  `).join('');
  dom.datePicker.querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => loadReport(button.dataset.date));
  });
}

function renderReport(report) {
  renderHero(report);
  renderOpsStrip(report, state.currentValidation);
  renderBriefBoard(report, state.currentValidation);
  renderGrid(report);
}

function renderHero(report) {
  dom.heroDate.textContent = dayLabel(report.report_date, true);
  dom.heroAuthor.textContent = report.author || '자금운용본부';
  const comment = report.comment;
  dom.heroComment.textContent = comment?.final_comment || comment?.auto_comment || '';

  const observations = report.observations || [];
  dom.heroTickers.innerHTML = TICKERS.map((ticker) => {
    const item = observations.find((observation) => observation.metric_key === ticker.key);
    if (!item) return '';
    const rawChange = Number(item.change_1d);
    let cls = classifyChange(rawChange);
    if (Number.isFinite(rawChange) && (ticker.invertColor || ticker.rateBond)) {
      cls = rawChange < 0 ? 'up' : rawChange > 0 ? 'down' : 'flat';
    }
    return `<article class="ticker-card">
      <span class="ticker-label">${esc(ticker.label)}</span>
      <strong class="ticker-value">${fmtNum(item.value, ticker.decimals)}</strong>
      <span class="ticker-change ${cls}">${esc(changeText(item.change_1d, item.change_1d_unit || ''))}</span>
    </article>`;
  }).join('');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function findObservation(report, metricKey) {
  return (report.observations || []).find((item) => item.metric_key === metricKey) || null;
}

function isLocalValidationGap(validation) {
  return (validation?.errors || []).some((error) => String(error).includes('Report JSON not found'));
}

function validationMeta(validation, report) {
  const status = validation?.status || 'unknown';
  if (status === 'pass') return { tone: 'ok', title: 'Pass', detail: '사전 검증 통과' };
  if (status === 'fail' && isLocalValidationGap(validation) && (report?.observations || []).length) {
    return { tone: 'warn', title: 'Review', detail: 'DB 로드됨, 로컬 검증 산출물 확인 필요' };
  }
  if (status === 'fail') {
    const first = validation?.errors?.[0] || '검증 실패 항목 확인 필요';
    return { tone: 'danger', title: 'Check', detail: first };
  }
  if ((validation?.warnings || []).length) return { tone: 'warn', title: 'Warn', detail: validation.warnings[0] };
  return { tone: 'warn', title: 'Pending', detail: '검증 정보를 불러오지 못했습니다' };
}

function statusMeta(status) {
  if (status === 'published') return { tone: 'ok', label: 'Published', detail: '발행 완료' };
  if (status === 'reviewed') return { tone: 'ok', label: 'Reviewed', detail: '검토 완료' };
  if (status === 'draft') return { tone: 'warn', label: 'Draft', detail: '검토 전 초안' };
  return { tone: 'warn', label: status || 'Unknown', detail: '상태 확인 필요' };
}

function marketDirection(item, opts = {}) {
  if (!item) return '-';
  const raw = Number(item.change_1d);
  if (!Number.isFinite(raw)) return `${item.metric_name} 변화 없음`;
  const direction = raw > 0 ? '상승' : raw < 0 ? '하락' : '보합';
  const assetDirection = opts.inverse ? (raw > 0 ? '약세 압력' : raw < 0 ? '강세 압력' : '중립') : direction;
  return `${item.metric_name} ${assetDirection} (${changeText(item.change_1d, item.change_1d_unit || '')})`;
}

function getTopMovers(report, limit = 4) {
  return (report.observations || [])
    .filter((item) => item.category !== 'investor_flows')
    .map((item) => ({ item, abs: Math.abs(Number(item.change_1d)) }))
    .filter((entry) => Number.isFinite(entry.abs) && entry.abs > 0)
    .sort((a, b) => b.abs - a.abs)
    .slice(0, limit)
    .map(({ item }) => item);
}

function buildGeneratedBrief(report) {
  const kospi = findObservation(report, 'kospi');
  const usdkrw = findObservation(report, 'usdkrw');
  const us10y = findObservation(report, 'us_10y') || findObservation(report, 'us_treasury_10y');
  const kr10y = findObservation(report, 'kr_10y') || findObservation(report, 'kr_gov_10y');
  const wti = findObservation(report, 'wti');
  const points = [
    marketDirection(kr10y),
    marketDirection(us10y),
    marketDirection(kospi),
    marketDirection(usdkrw, { inverse: true }),
    marketDirection(wti),
  ].filter((line) => line && line !== '-');
  if (!points.length) return '주요 지표 데이터가 아직 충분하지 않습니다. 관리자 화면에서 원천 데이터와 검증 상태를 먼저 확인하세요.';
  return points.join(' · ');
}

function renderOpsStrip(report, validation) {
  if (!dom.opsStrip) return;
  const reportMeta = state.reports.find((item) => item.date === report.report_date) || {};
  const vMeta = validationMeta(validation, report);
  const cMeta = statusMeta(report.comment?.status || reportMeta.comment_status || report.status);
  const latest = state.reports[0]?.date === report.report_date;
  const freshness = latest
    ? { tone: 'ok', label: 'Latest', detail: '목록 기준 최신 리포트' }
    : { tone: 'warn', label: 'Archive', detail: `${dayLabel(state.reports[0]?.date, true)} 최신` };
  const generatedAt = report.generated_at || reportMeta.generated_at || reportMeta.modified_at;

  const cards = [
    { label: '데이터 검증', value: vMeta.title, detail: vMeta.detail, tone: vMeta.tone },
    { label: '발행 상태', value: cMeta.label, detail: cMeta.detail, tone: cMeta.tone },
    { label: '커버리지', value: `${(report.observations || []).length}개`, detail: '시장 지표 적재', tone: 'ok' },
    { label: '최신성', value: freshness.label, detail: freshness.detail, tone: freshness.tone },
    { label: '생성 시각', value: formatDateTime(generatedAt), detail: report.source || reportMeta.source || 'source unknown', tone: 'neutral' },
  ];

  dom.opsStrip.innerHTML = cards.map((card) => `
    <article class="ops-card ${card.tone}">
      <span class="ops-label">${esc(card.label)}</span>
      <strong>${esc(card.value)}</strong>
      <small title="${esc(card.detail)}">${esc(card.detail)}</small>
    </article>
  `).join('');
}

function renderBriefBoard(report, validation) {
  if (!dom.briefBoard) return;
  const comment = report.comment;
  const hasComment = Boolean(comment?.final_comment || comment?.auto_comment);
  const briefText = hasComment ? (comment.final_comment || comment.auto_comment) : buildGeneratedBrief(report);
  const movers = getTopMovers(report, 4);
  const rawIssues = [
    ...(validation?.errors || []),
    ...(validation?.warnings || []),
  ];
  const validationIssues = isLocalValidationGap(validation) && (report.observations || []).length
    ? ['Supabase 리포트 데이터는 로드됐습니다. 로컬 processed JSON 기반 검증 산출물만 확인이 필요합니다.']
    : rawIssues.slice(0, 3);

  dom.briefBoard.innerHTML = `
    <article class="brief-main-card">
      <div class="brief-kicker">Daily treasury brief</div>
      <h2>오늘 의사결정에 필요한 시장 요약</h2>
      <p>${esc(briefText)}</p>
      <div class="brief-actions">
        <button class="btn-primary brief-chat" type="button" data-open-chat>AI로 추가 분석</button>
        <a class="btn-ghost" href="/admin" target="_blank" rel="noreferrer">코멘트 검토</a>
      </div>
    </article>
    <article class="brief-side-card">
      <div class="brief-side-header">
        <span>Watchpoints</span>
        <strong>${movers.length || 0}</strong>
      </div>
      <div class="watch-list">
        ${movers.map((item) => `
          <div class="watch-item">
            <span>${esc(item.metric_name)}</span>
            ${formatChange(item.change_1d, item.change_1d_unit)}
          </div>
        `).join('') || '<div class="watch-empty">전일대비 변동 지표 없음</div>'}
      </div>
    </article>
    <article class="brief-side-card process-card">
      <div class="brief-side-header">
        <span>Process</span>
        <strong>${esc(validation?.status || 'n/a')}</strong>
      </div>
      <div class="process-list">
        ${validationIssues.length ? validationIssues.map((issue) => `<p>${esc(issue)}</p>`).join('') : '<p>검증 이슈가 없습니다.</p>'}
      </div>
    </article>
  `;
  dom.briefBoard.querySelector('[data-open-chat]')?.addEventListener('click', openChat);
}
function renderGrid(report) {
  const observations = report.observations || [];
  const byCategory = new Map();
  for (const item of observations) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }

  dom.reportGrid.innerHTML = '';
  for (const category of CATEGORY_META) {
    const items = byCategory.get(category.key) || [];
    if (category.key === 'investor_flows') dom.reportGrid.appendChild(renderFlowsCard(category, items));
    else dom.reportGrid.appendChild(renderMetricsCard(category, items));
  }

  const comment = report.comment;
  if (comment?.auto_comment || comment?.final_comment) {
    const div = document.createElement('section');
    div.className = 'comment-section';
    const status = comment.status || 'draft';
    div.innerHTML = `
      <div class="comment-label">
        <span>Market comment</span>
        <span class="comment-status-badge ${esc(status)}">${esc(status)}</span>
      </div>
      <p class="comment-text">${esc(comment.final_comment || comment.auto_comment)}</p>
    `;
    dom.reportGrid.appendChild(div);
  }

  requestAnimationFrame(() => initSparklines(report));
}

function computeSignal(items) {
  const changes = items.map((item) => Number(item.change_1d)).filter(Number.isFinite);
  if (!changes.length) return { cls: 'flat', label: '중립' };
  const positive = changes.filter((value) => value > 0).length;
  const negative = changes.filter((value) => value < 0).length;
  if (positive > negative && positive >= changes.length * 0.6) return { cls: 'up', label: '상승 우위' };
  if (negative > positive && negative >= changes.length * 0.6) return { cls: 'down', label: '하락 우위' };
  return { cls: 'flat', label: '혼조' };
}

function renderMetricsCard(category, items) {
  const card = document.createElement('section');
  card.className = `category-card tone-${category.tone}`;
  card.dataset.category = category.key;
  const signal = computeSignal(items);

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-group">
        <div class="card-eyebrow">${esc(category.eyebrow)}</div>
        <h2 class="card-title">${esc(category.label)}</h2>
        <div class="card-signal"><span class="signal-dot ${signal.cls}"></span><span>${esc(signal.label)}</span></div>
      </div>
      <div class="card-sparkline-wrap" id="spark-${esc(category.key)}"></div>
    </div>
    <div class="metrics-table-wrap">
      <table class="metrics-table">
        <thead><tr><th>지표</th><th>현재값</th><th>전일대비</th><th>연말대비</th></tr></thead>
        <tbody>
          ${items.map((item) => `<tr>
            <td><div class="metric-name">${esc(item.metric_name)}</div><div class="metric-sub">${esc(item.metric_key || '')}</div></td>
            <td><span class="metric-value">${fmtNum(item.value)}</span><span class="metric-unit">${esc(item.unit || '')}</span></td>
            <td>${formatChange(item.change_1d, item.change_1d_unit)}</td>
            <td>${formatChange(item.change_ytd, item.change_ytd_unit)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  return card;
}

function renderFlowsCard(category, items) {
  const card = document.createElement('section');
  card.className = `category-card full-width tone-${category.tone}`;
  const maxAbs = Math.max(...items.map((item) => Math.abs(Number(item.value) || 0)), 1);

  card.innerHTML = `
    <div class="card-header compact">
      <div class="card-title-group">
        <div class="card-eyebrow">${esc(category.eyebrow)}</div>
        <h2 class="card-title">${esc(category.label)}</h2>
      </div>
    </div>
    <div class="flows-grid">
      ${items.map((item) => {
        const value = Number(item.value) || 0;
        const direction = value >= 0 ? 'buy' : 'sell';
        const percent = Math.min(100, Math.abs(value) / maxAbs * 100);
        return `<div class="flow-item">
          <div class="flow-name">${esc(item.metric_name)}</div>
          <div class="flow-bar-wrap"><div class="flow-bar-bg"><div class="flow-bar ${direction}" style="width:${percent.toFixed(1)}%"></div></div></div>
          <div class="flow-value ${direction}">${esc(changeText(value, item.unit || ''))}</div>
        </div>`;
      }).join('')}
    </div>
  `;
  return card;
}

function initSparklines(report) {
  const observations = report.observations || [];
  state.sparklines.clear();
  for (const category of CATEGORY_META) {
    if (!category.sparkMetric) continue;
    const target = document.getElementById(`spark-${category.key}`);
    const item = observations.find((observation) => observation.metric_key === category.sparkMetric);
    if (!target || !item) continue;
    const history = state.history[category.sparkMetric];
    renderSparkline(target, history ? history.map((entry) => entry.value) : [item.value], category.tone);
    state.sparklines.set(category.key, { target, metric: category.sparkMetric, tone: category.tone });
  }
}

function updateSparklines() {
  for (const { target, metric, tone } of state.sparklines.values()) {
    const history = state.history[metric];
    if (history) renderSparkline(target, history.map((entry) => entry.value), tone);
  }
}

function renderSparkline(target, values, tone) {
  target.innerHTML = buildSvgLine(values, {
    color: cssVar(`--tone-${tone}`) || cssVar('--primary'),
    width: 116,
    height: 46,
    pad: 5,
    strokeWidth: 2,
  });
}

function openChat() {
  if (state.chatOpen) return;
  state.chatOpen = true;
  dom.chatPanel.hidden = false;
  dom.chatOverlay.hidden = false;
  dom.chatFab.classList.add('hidden');
  setTimeout(() => dom.chatInput.focus(), 200);
}

function closeChat() {
  if (!state.chatOpen) return;
  state.chatOpen = false;
  dom.chatPanel.hidden = true;
  dom.chatOverlay.hidden = true;
  dom.chatFab.classList.remove('hidden');
}

function appendUserMessage(text) {
  const message = document.createElement('div');
  message.className = 'chat-message user';
  message.innerHTML = `<div class="chat-bubble">${esc(text).replace(/\n/g, '<br>')}</div>`;
  dom.chatMessages.appendChild(message);
  scrollChat();
}

function appendAssistantMessage(html) {
  const message = document.createElement('div');
  message.className = 'chat-message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = html;
  message.appendChild(bubble);
  dom.chatMessages.appendChild(message);
  scrollChat();
  bubble.querySelectorAll('[data-chart]').forEach((target) => {
    try { renderChatChart(target, JSON.parse(target.dataset.chart)); } catch {}
  });
}

function appendTyping() {
  const message = document.createElement('div');
  message.className = 'chat-message assistant';
  message.innerHTML = '<div class="chat-typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  dom.chatMessages.appendChild(message);
  scrollChat();
  return message;
}

function appendErrorMessage(text) {
  appendAssistantMessage(`<div class="chat-error">오류: ${esc(text)}</div>`);
}

function scrollChat() {
  requestAnimationFrame(() => { dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight; });
}

async function buildAskPayload(question) {
  let validation = [];
  if (state.currentDate) {
    try {
      const validationResult = await fetchJson(`/api/validation/${state.currentDate}`);
      validation = validationResult.cross_checks || [];
    } catch {}
  }

  return {
    question,
    report_date: state.currentDate,
    surface: 'public_report_v2',
    mode: 'manual_review',
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
    automation_state: {
      job_run_id: null,
      latest_validation_status: state.currentValidation?.status || null,
      publish_dry_run_available: true,
      requires_human_approval: true,
    },
  };
}

async function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text || state.chatLoading) return;

  dom.chatInput.value = '';
  dom.chatInput.style.height = 'auto';
  dom.chatSuggestions.style.display = 'none';
  appendUserMessage(text);

  const typing = appendTyping();
  state.chatLoading = true;
  dom.chatSend.disabled = true;

  try {
    const data = await fetchJson('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await buildAskPayload(text)),
    });
    typing.remove();
    appendAssistantMessage(renderBlocks(data.blocks || [{ type: 'text', content: data.answer || '응답을 생성하지 못했습니다.' }]));
  } catch (error) {
    typing.remove();
    appendErrorMessage(error.message);
  } finally {
    state.chatLoading = false;
    dom.chatSend.disabled = false;
  }
}

function renderBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === 'table') return renderTableBlock(block);
    if (block.type === 'chart') return renderChartBlock(block);
    return renderTextBlock(block);
  }).join('');
}

function renderTextBlock(block) {
  return `<div class="chat-block">${String(block.content || '').split('\n').map((line) => `<p>${esc(line)}</p>`).join('')}</div>`;
}

function renderTableBlock(block) {
  const headers = (block.headers || []).map((header) => `<th>${esc(header)}</th>`).join('');
  const rows = (block.rows || []).map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('');
  return `<div class="chat-block">${block.title ? `<div class="chat-block-title">${esc(block.title)}</div>` : ''}<div class="chat-table-wrap"><table class="chat-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderChartBlock(block) {
  return `<div class="chat-block">${block.title ? `<div class="chat-block-title">${esc(block.title)}</div>` : ''}<div class="chat-chart-wrap" data-chart="${esc(JSON.stringify(block))}"></div></div>`;
}

function renderChatChart(target, block) {
  const first = (block.datasets || [])[0] || { data: [] };
  const color = cssVar('--primary');
  target.innerHTML = block.chartType === 'bar'
    ? buildSvgBar(block.labels || [], first.data || [], color)
    : buildSvgLine(first.data || [], { color, fill: true, dots: true, width: 320, height: 140, pad: 18 });
}

function bindChat() {
  dom.chatFab.addEventListener('click', openChat);
  dom.chatToggleNav.addEventListener('click', openChat);
  dom.chatClose.addEventListener('click', closeChat);
  dom.chatOverlay.addEventListener('click', closeChat);
  dom.chatSend.addEventListener('click', sendMessage);
  dom.chatInput.addEventListener('input', () => {
    dom.chatInput.style.height = 'auto';
    dom.chatInput.style.height = `${Math.min(dom.chatInput.scrollHeight, 140)}px`;
  });
  dom.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  dom.chatSuggestions.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      dom.chatInput.value = chip.dataset.q;
      sendMessage();
    });
  });
}

bindChat();
loadReports().catch((error) => {
  dom.reportLoading.innerHTML = `<p style="color:var(--down)">리포트 로드 실패: ${esc(error.message)}</p>`;
});
