const state = {
  reports: [],
  currentDate: null,
  currentReport: null,
  currentValidation: null,
  currentResearch: null,
  history: {},
  view: 'overview',
  trendSlots: ['kr_gov_3y', 'kospi', 'usdkrw'],
  trendSelected: new Set(['kr_gov_3y', 'kospi', 'usdkrw', 'credit_spread_aa0_2y']),
  chatOpen: false,
  chatLoading: false,
  sparklines: new Map(),
};

const dom = {
  datePicker: document.getElementById('datePicker'),
  heroDate: document.getElementById('heroDate'),
  heroAuthor: document.getElementById('heroAuthor'),
  heroComment: document.getElementById('heroComment'),
  opsStrip: document.getElementById('opsStrip'),
  briefBoard: document.getElementById('briefBoard'),
  marketCharts: document.getElementById('marketCharts'),
  overviewView: document.getElementById('overviewView'),
  trendView: document.getElementById('trendView'),
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
  {
    key: 'rates_credit',
    label: '금리·크레딧',
    eyebrow: 'Rates & Credit',
    categories: ['domestic_rates', 'global_rates', 'credit'],
    metricKeys: [
      'cd_91d',
      'monetary_stab_1y',
      'monetary_stab_2y',
      'kr_gov_3y',
      'kr_gov_5y',
      'kr_gov_10y',
      'bank_aaa_3m',
      'bank_aaa_1y',
      'bank_aaa_2y',
      'bank_aaa_3y',
      'bank_aaa_5y',
      'kr_corp_aa0_1y',
      'kr_corp_aa0_3y',
      'other_fin_aa_minus_2y',
      'us_treasury_2y',
      'us_treasury_10y',
      'us_treasury_30y',
      'germany_bund_10y',
      'japan_gov_10y',
    ],
    sparkMetric: null,
    tone: 'blue',
  },
  {
    key: 'equities',
    label: '주식·암호화폐',
    eyebrow: 'Equities',
    categories: ['domestic_equities_fx', 'global_equities', 'crypto'],
    sparkMetric: null,
    tone: 'green',
  },
  {
    key: 'investor_flows',
    label: '투자자별 매매 동향',
    eyebrow: 'Investor Flows',
    categories: ['investor_flows'],
    optional: true,
    sparkMetric: null,
    tone: 'orange',
  },
  {
    key: 'fx',
    label: '환율',
    eyebrow: 'FX',
    categories: ['fx'],
    sparkMetric: null,
    tone: 'teal',
  },
  {
    key: 'commodities',
    label: '원자재',
    eyebrow: 'Commodities',
    categories: ['commodities'],
    sparkMetric: null,
    tone: 'yellow',
  },
];

const CATEGORY_LABELS = {
  domestic_rates: '국내금리',
  global_rates: '해외금리',
  credit: '크레딧',
  domestic_equities_fx: '국내주식',
  global_equities: '해외주식',
  fx: '환율',
  crypto: '암호화폐',
  commodities: '원자재',
  investor_flows: '투자자 동향',
};

const CATEGORY_ORDER = [
  'domestic_rates',
  'global_rates',
  'credit',
  'domestic_equities_fx',
  'global_equities',
  'crypto',
  'investor_flows',
  'fx',
  'commodities',
];

const METRIC_ORDER = [
  'cd_91d',
  'monetary_stab_1y',
  'monetary_stab_2y',
  'kr_gov_3y',
  'kr_gov_5y',
  'kr_gov_10y',
  'bank_aaa_3m',
  'bank_aaa_1y',
  'bank_aaa_2y',
  'bank_aaa_3y',
  'bank_aaa_5y',
  'kr_corp_aa0_1y',
  'kr_corp_aa0_3y',
  'other_fin_aa_minus_2y',
  'kr_gov_2y',
  'kr_gov_30y',
  'us_treasury_2y',
  'us_treasury_10y',
  'us_treasury_30y',
  'germany_bund_10y',
  'japan_gov_10y',
  'credit_spread_aa0_2y',
  'kospi',
  'kospi200',
  'kosdaq',
  'usdkrw',
  'dow',
  'sp500',
  'nasdaq',
  'nikkei225',
  'hangseng_h',
  'dax',
  'usdjpy',
  'eurusd',
  'dollar_index',
  'btc_usd',
  'eth_usd',
  'wti',
  'brent',
  'gold',
  'silver',
  'sox',
  'copper',
];

const METRIC_ORDER_INDEX = new Map(METRIC_ORDER.map((key, index) => [key, index]));

const TREND_SLOT_META = [
  { title: '금리', tone: 'blue' },
  { title: '주식', tone: 'green' },
  { title: '환율', tone: 'teal' },
];

const TREND_WINDOW = 22; // ~1개월 거래일 (오버뷰 "1M" 차트 구간)

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
    const [validation, research] = await Promise.all([
      loadValidation(date),
      loadResearch(date),
    ]);
    state.currentValidation = validation;
    state.currentResearch = research;
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
  const data = await fetchJson('/api/history?days=60');
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

async function loadResearch(date) {
  try {
    return await fetchJson(`/api/research/${date}`);
  } catch (error) {
    return {
      report_date: date,
      items: [],
      error: error.message,
    };
  }
}

function includedResearchItems(research = state.currentResearch) {
  return (research?.items || []).filter((item) => item.included !== false);
}

function renderDatePicker() {
  const dates = state.reports.map((report) => report.date); // 최신순 내림차순
  const current = state.currentDate;
  const idx = dates.indexOf(current);
  const olderDate = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;
  const newerDate = idx > 0 ? dates[idx - 1] : null;

  dom.datePicker.innerHTML = `
    <span class="date-picker-label">리포트 날짜</span>
    <div class="date-nav">
      <button class="date-nav-btn" type="button" data-date-step="older" ${olderDate ? '' : 'disabled'} aria-label="이전 리포트">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="date-current" type="button" id="dateCurrentBtn" aria-haspopup="dialog" aria-expanded="false">
        <span>${esc(current ? dayLabel(current, true) : '날짜 선택')}</span>
        <svg class="picker-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="date-nav-btn" type="button" data-date-step="newer" ${newerDate ? '' : 'disabled'} aria-label="다음 리포트">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
  dom.datePicker.querySelector('[data-date-step="older"]')?.addEventListener('click', () => { if (olderDate) loadReport(olderDate); });
  dom.datePicker.querySelector('[data-date-step="newer"]')?.addEventListener('click', () => { if (newerDate) loadReport(newerDate); });
  dom.datePicker.querySelector('#dateCurrentBtn')?.addEventListener('click', (event) => openCalendarPopover(event.currentTarget));
}

function buildCalendarHtml(year, month, available, currentDate) {
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push('<div class="cal-day empty"></div>');
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isAvail = available.has(dateStr);
    const cls = ['cal-day', isAvail ? 'available' : 'disabled', dateStr === currentDate ? 'current' : ''].filter(Boolean).join(' ');
    cells.push(isAvail
      ? `<button type="button" class="${cls}" data-date="${dateStr}">${d}</button>`
      : `<div class="${cls}">${d}</div>`);
  }
  return `
    <div class="cal-head">
      <button type="button" class="cal-nav" data-cal-prev aria-label="이전 달"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <span class="cal-title">${year}. ${monthNames[month]}</span>
      <button type="button" class="cal-nav" data-cal-next aria-label="다음 달"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <div class="cal-weekdays">${['일', '월', '화', '수', '목', '금', '토'].map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
  `;
}

function localDateString(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function openCalendarPopover(anchor) {
  const available = new Set(state.reports.map((report) => report.date));
  const base = state.currentDate && DATE_PATTERN.test(state.currentDate)
    ? state.currentDate
    : (state.reports[0]?.date || localDateString());
  let viewYear = Number(base.slice(0, 4));
  let viewMonth = Number(base.slice(5, 7)) - 1;

  const content = document.createElement('div');
  content.className = 'calendar-popover';

  const render = () => {
    content.innerHTML = buildCalendarHtml(viewYear, viewMonth, available, state.currentDate);
    content.querySelector('[data-cal-prev]')?.addEventListener('click', () => stepMonth(-1));
    content.querySelector('[data-cal-next]')?.addEventListener('click', () => stepMonth(1));
    content.querySelectorAll('.cal-day.available').forEach((button) => {
      button.addEventListener('click', () => {
        closeActivePopover();
        loadReport(button.dataset.date);
      });
    });
  };
  const stepMonth = (delta) => {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    else if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    render();
  };

  openPopover(anchor, content, { className: 'popover-calendar', minWidth: 272, maxHeight: 340 });
  render();
}

function renderReport(report) {
  renderHero(report);
  renderOpsStrip(report, state.currentValidation);
  renderBriefBoard(report, state.currentValidation);
  renderMarketCharts(report);
  renderTrendWorkspace(report);
  renderGrid(report);
}

function renderHero(report) {
  dom.heroDate.textContent = dayLabel(report.report_date, true);
  dom.heroAuthor.textContent = report.author || '자금운용본부';
  dom.heroComment.textContent = '';
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

function formatCompactDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function findObservation(report, metricKey) {
  return (report.observations || []).find((item) => item.metric_key === metricKey) || null;
}

function metricCatalog(report = state.currentReport) {
  const byKey = new Map();
  for (const item of report?.observations || []) {
    if (!item.metric_key) continue;
    byKey.set(item.metric_key, item);
  }
  for (const [metricKey, points] of Object.entries(state.history || {})) {
    if (byKey.has(metricKey) || !points?.length) continue;
    byKey.set(metricKey, {
      metric_key: metricKey,
      metric_name: metricKey,
      category: 'history',
      category_label: 'History',
      unit: points.at(-1)?.unit || '',
      value: points.at(-1)?.value,
    });
  }
  return [...byKey.values()].sort((a, b) => {
    const groupA = CATEGORY_ORDER.indexOf(a.category);
    const groupB = CATEGORY_ORDER.indexOf(b.category);
    const orderA = groupA === -1 ? 999 : groupA;
    const orderB = groupB === -1 ? 999 : groupB;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.metric_name).localeCompare(String(b.metric_name), 'ko');
  });
}

function metricOptionLabel(item) {
  const group = CATEGORY_LABELS[item.category] || item.category_label || '';
  return group ? `${group} · ${item.metric_name}` : item.metric_name;
}

function metricTone(item) {
  if (!item) return 'blue';
  if (['domestic_rates', 'global_rates', 'credit'].includes(item.category)) return 'blue';
  if (['domestic_equities_fx', 'global_equities', 'crypto'].includes(item.category)) return 'green';
  if (item.category === 'fx') return 'teal';
  if (item.category === 'investor_flows') return 'orange';
  if (item.category === 'commodities') return 'yellow';
  return 'blue';
}

function historyValues(metricKey, report = state.currentReport) {
  const history = state.history[metricKey];
  if (history?.length) return history.map((entry) => entry.value);
  const item = findObservation(report, metricKey);
  return item ? [item.value] : [];
}

function historyLabels(metricKey) {
  const history = state.history[metricKey];
  return history?.length ? history.map((entry) => dayLabel(entry.report_date)) : [];
}

function historyDates(metricKey) {
  const history = state.history[metricKey];
  return history?.length ? history.map((entry) => entry.report_date) : [];
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[0].slice(2)}.${parts[1]}.${parts[2]}`;
}

function monthSlice(arr) {
  return arr.length > TREND_WINDOW ? arr.slice(-TREND_WINDOW) : arr;
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

function sourceLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'source unknown';
  if (raw === 'supabase') return 'Supabase';
  return raw;
}

function summarizeProcessIssue(issue) {
  const text = String(issue || '').trim();
  if (!text) return '';
  if (text.includes('Local processed JSON is missing')) {
    return '로컬 processed JSON 없음: Supabase 적재 데이터 기준으로 표시 중';
  }
  if (text.includes('Yahoo Finance cross-check was skipped')) {
    return 'Yahoo 대조 생략: 로컬 산출물 생성 후 재검증 가능';
  }
  if (text.length > 88) {
    return `${text.slice(0, 86)}...`;
  }
  return text;
}

function marketDirection(item, opts = {}) {
  if (!item) return '-';
  const raw = Number(item.change_1d);
  if (!Number.isFinite(raw)) return `${item.metric_name} 변화 없음`;
  const direction = raw > 0 ? '상승' : raw < 0 ? '하락' : '보합';
  const assetDirection = opts.inverse ? (raw > 0 ? '약세 압력' : raw < 0 ? '강세 압력' : '중립') : direction;
  return `${item.metric_name} ${assetDirection} (${changeText(item.change_1d, item.change_1d_unit || '')})`;
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
  if (!points.length) return '주요 지표 데이터가 아직 충분하지 않습니다.';
  return points.join(' · ');
}

function briefTextHtml(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return '<p>-</p>';

  const blocks = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^-?\s*\[(국내|해외)\]\s*(.*)$/);
    if (match) {
      if (current) blocks.push(current);
      current = { title: match[1], body: [] };
      if (match[2]) current.body.push(match[2]);
      continue;
    }
    if (current) current.body.push(line);
    else blocks.push({ title: '', body: [line] });
  }
  if (current) blocks.push(current);

  return blocks.map((block) => {
    const title = block.title ? `<h3>${esc(`[${block.title}]`)}</h3>` : '';
    const body = block.body.length ? `<p>${esc(block.body.join(' '))}</p>` : '';
    return `<section class="brief-comment-block">${title}${body}</section>`;
  }).join('');
}

function renderOpsStrip(report, validation) {
  if (!dom.opsStrip) return;
  const reportMeta = state.reports.find((item) => item.date === report.report_date) || {};
  const vMeta = validationMeta(validation, report);
  const cMeta = statusMeta(report.comment?.status || reportMeta.comment_status || report.status);
  const latest = state.reports[0]?.date === report.report_date;
  const researchTotal = (state.currentResearch?.items || []).length;
  const researchIncluded = includedResearchItems().length;
  const freshness = latest
    ? { tone: 'ok', label: 'Latest', detail: '목록 기준 최신 리포트' }
    : { tone: 'warn', label: 'Archive', detail: `${dayLabel(state.reports[0]?.date, true)} 최신` };
  const generatedAt = report.generated_at || reportMeta.generated_at || reportMeta.modified_at;

  const cards = [
    { label: '데이터 검증', value: vMeta.title, detail: vMeta.detail, tone: vMeta.tone },
    { label: '발행 상태', value: cMeta.label, detail: cMeta.detail, tone: cMeta.tone },
    { label: '커버리지', value: `${(report.observations || []).length}개`, detail: '시장 지표 적재', tone: 'ok' },
    {
      label: 'AI 근거',
      value: researchIncluded ? `${researchIncluded}개` : '대기',
      detail: researchTotal ? `${researchTotal}개 중 분석 반영` : '저장된 리서치 없음',
      tone: researchIncluded ? 'ok' : 'neutral',
    },
    { label: '최신성', value: freshness.label, detail: freshness.detail, tone: freshness.tone },
    { label: '생성 시각', value: formatCompactDateTime(generatedAt), detail: sourceLabel(report.source || reportMeta.source), tone: 'neutral' },
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
  void validation;

  dom.briefBoard.innerHTML = `
    <article class="brief-main-card">
      <div class="brief-kicker">Daily Brief</div>
      <div class="brief-text">${briefTextHtml(briefText)}</div>
      <div class="brief-actions">
        <button class="btn-primary brief-chat" type="button" data-open-chat>AI로 추가 분석</button>
      </div>
    </article>
  `;
  dom.briefBoard.querySelector('[data-open-chat]')?.addEventListener('click', openChat);
}

let activePopoverCleanup = null;

function closeActivePopover() {
  if (activePopoverCleanup) {
    activePopoverCleanup();
    activePopoverCleanup = null;
  }
}

function openPopover(anchor, contentEl, opts = {}) {
  closeActivePopover();
  const layer = document.createElement('div');
  layer.className = 'popover-layer';
  const pop = document.createElement('div');
  pop.className = `popover ${opts.className || ''}`.trim();
  pop.appendChild(contentEl);
  layer.appendChild(pop);
  document.body.appendChild(layer);

  const rect = anchor.getBoundingClientRect();
  const width = Math.max(rect.width, opts.minWidth || 240);
  const maxHeight = opts.maxHeight || 320;
  pop.style.width = `${width}px`;
  const left = Math.min(rect.left, window.innerWidth - width - 12);
  const top = rect.bottom + 6 + maxHeight > window.innerHeight
    ? Math.max(12, rect.top - maxHeight - 6)
    : rect.bottom + 6;
  pop.style.left = `${Math.max(12, left)}px`;
  pop.style.top = `${top}px`;

  const onKey = (event) => { if (event.key === 'Escape') closeActivePopover(); };
  const onLayerDown = (event) => { if (event.target === layer) closeActivePopover(); };
  layer.addEventListener('mousedown', onLayerDown);
  document.addEventListener('keydown', onKey, true);

  activePopoverCleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    layer.remove();
    if (anchor.setAttribute) anchor.setAttribute('aria-expanded', 'false');
  };
  if (anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
  return pop;
}

function openMetricPicker(anchor, currentKey, catalog, onSelect) {
  const known = new Set(CATEGORY_ORDER);
  const groups = CATEGORY_ORDER
    .map((cat) => ({ label: CATEGORY_LABELS[cat] || cat, items: catalog.filter((it) => it.category === cat) }))
    .filter((group) => group.items.length);
  const others = catalog.filter((it) => !known.has(it.category));
  if (others.length) groups.push({ label: '기타', items: others });

  const content = document.createElement('div');
  content.className = 'metric-popover';
  content.innerHTML = `
    <div class="metric-popover-search">
      <input type="text" class="metric-popover-input" placeholder="지표 검색..." aria-label="지표 검색" />
    </div>
    <div class="metric-popover-list" role="listbox">
      ${groups.map((group) => `
        <div class="metric-popover-group">
          <div class="metric-popover-group-label">${esc(group.label)}</div>
          ${group.items.map((it) => `
            <button type="button" class="metric-popover-item ${it.metric_key === currentKey ? 'active' : ''}" role="option" data-key="${esc(it.metric_key)}" data-name="${esc(it.metric_name)}">${esc(it.metric_name)}</button>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;

  const pop = openPopover(anchor, content, { className: 'popover-metric', minWidth: 240, maxHeight: 340 });
  const input = pop.querySelector('.metric-popover-input');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    pop.querySelectorAll('.metric-popover-item').forEach((button) => {
      const match = !query || button.dataset.name.toLowerCase().includes(query) || button.dataset.key.toLowerCase().includes(query);
      button.hidden = !match;
    });
    pop.querySelectorAll('.metric-popover-group').forEach((group) => {
      group.hidden = ![...group.querySelectorAll('.metric-popover-item')].some((button) => !button.hidden);
    });
  });
  pop.querySelectorAll('.metric-popover-item').forEach((button) => {
    button.addEventListener('click', () => {
      closeActivePopover();
      onSelect(button.dataset.key);
    });
  });
  input.focus();
}

function renderMarketCharts(report) {
  if (!dom.marketCharts) return;
  const catalog = metricCatalog(report);
  dom.marketCharts.innerHTML = `
    <div class="section-heading">
      <span>1M Trends</span>
      <h2>월간 추이</h2>
    </div>
    <div class="chart-deck">
      ${TREND_SLOT_META.map((slot, index) => {
        const metricKey = state.trendSlots[index] || catalog[index]?.metric_key;
        const item = findObservation(report, metricKey) || catalog.find((entry) => entry.metric_key === metricKey);
        const values = monthSlice(metricKey ? historyValues(metricKey, report) : []);
        const dates = monthSlice(metricKey ? historyDates(metricKey) : []);
        const nums = values.map(Number).filter(Number.isFinite);
        const yMax = nums.length ? fmtNum(Math.max(...nums)) : '';
        const yMin = nums.length ? fmtNum(Math.min(...nums)) : '';
        const startDate = dates.length ? shortDate(dates[0]) : '';
        const endDate = dates.length ? shortDate(dates.at(-1)) : '';
        const latest = item ? `${fmtNum(item.value)}${item.unit ? ` ${item.unit}` : ''}` : '-';
        const tone = metricTone(item) || slot.tone;
        const slotTitle = item ? (CATEGORY_LABELS[item.category] || item.metric_name) : slot.title;
        return `<article class="trend-card tone-${tone}">
          <div class="trend-card-top">
            <span>${esc(slotTitle)}</span>
            <strong>${esc(latest)}</strong>
          </div>
          <button class="metric-picker-btn" type="button" data-trend-slot="${index}" aria-haspopup="listbox" aria-expanded="false">
            <span class="metric-picker-label">${esc(item ? item.metric_name : '지표 선택')}</span>
            <svg class="picker-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="trend-chart-frame">
            <div class="trend-yaxis"><span>${esc(yMax)}</span><span>${esc(yMin)}</span></div>
            <div class="trend-chart" data-trend-metric="${esc(metricKey || '')}">
              ${buildSvgLine(values, {
                color: cssVar(`--tone-${tone}`) || cssVar('--primary'),
                width: 300,
                height: 116,
                pad: 12,
                fill: true,
                strokeWidth: 2.4,
              })}
            </div>
          </div>
          <div class="trend-xaxis">${
            startDate ? `<span>${esc(startDate)}</span><span>${esc(endDate)}</span>` : '<span>데이터 없음</span>'
          }</div>
        </article>`;
      }).join('')}
    </div>
  `;
  dom.marketCharts.querySelectorAll('.metric-picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.trendSlot);
      openMetricPicker(btn, state.trendSlots[index] || '', metricCatalog(report), (key) => {
        state.trendSlots[index] = key;
        renderMarketCharts(report);
        renderTrendWorkspace(report);
      });
    });
  });
}

function renderTrendWorkspace(report) {
  if (!dom.trendView) return;
  const catalog = metricCatalog(report);
  for (const metricKey of state.trendSlots) {
    if (metricKey) state.trendSelected.add(metricKey);
  }
  const selected = catalog.filter((item) => state.trendSelected.has(item.metric_key));
  const grouped = CATEGORY_ORDER
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      items: catalog.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length);

  dom.trendView.innerHTML = `
    <div class="trend-page-head">
      <div>
        <span>Trend Lab</span>
        <h1>시장 지표 상세 추이</h1>
      </div>
      <button class="btn-ghost" type="button" data-view-target="overview">Overview로 돌아가기</button>
    </div>
    <div class="trend-layout">
      <aside class="trend-picker" aria-label="차트 지표 선택">
        ${grouped.map((group) => `
          <section class="trend-picker-group">
            <h2>${esc(group.label)}</h2>
            <div class="trend-toggle-list">
              ${group.items.map((item) => `
                <label class="trend-toggle ${state.trendSelected.has(item.metric_key) ? 'checked' : ''}">
                  <input type="checkbox" value="${esc(item.metric_key)}" ${state.trendSelected.has(item.metric_key) ? 'checked' : ''}>
                  <span>${esc(item.metric_name)}</span>
                </label>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </aside>
      <div class="trend-detail-grid">
        ${selected.map((item) => renderDetailTrendCard(item, report)).join('') || '<div class="trend-empty">왼쪽에서 보고 싶은 지표를 선택하세요.</div>'}
      </div>
    </div>
  `;

  dom.trendView.querySelectorAll('[data-view-target]').forEach((target) => {
    target.addEventListener('click', () => setView(target.dataset.viewTarget));
  });
  dom.trendView.querySelectorAll('.trend-toggle input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.trendSelected.add(input.value);
      else state.trendSelected.delete(input.value);
      renderTrendWorkspace(report);
    });
  });
}

function renderDetailTrendCard(item, report) {
  const values = historyValues(item.metric_key, report);
  const labels = historyLabels(item.metric_key);
  const latest = `${fmtNum(item.value)}${item.unit ? ` ${item.unit}` : ''}`;
  const tone = metricTone(item);
  const nums = values.map(Number).filter(Number.isFinite);
  const yMax = nums.length ? fmtNum(Math.max(...nums)) : '';
  const yMin = nums.length ? fmtNum(Math.min(...nums)) : '';
  const first = values.find((value) => Number.isFinite(Number(value)));
  const last = [...values].reverse().find((value) => Number.isFinite(Number(value)));
  const rangeText = Number.isFinite(Number(first)) && Number.isFinite(Number(last))
    ? `${fmtNum(first)} -> ${fmtNum(last)}`
    : '-';

  return `
    <article class="trend-detail-card tone-${tone}">
      <div class="trend-detail-top">
        <div>
          <span>${esc(CATEGORY_LABELS[item.category] || item.category_label || '')}</span>
          <h2>${esc(item.metric_name)}</h2>
        </div>
        <strong>${esc(latest)}</strong>
      </div>
      <div class="trend-detail-frame">
        <div class="trend-yaxis lg"><span>${esc(yMax)}</span><span>${esc(yMin)}</span></div>
        <div class="trend-detail-chart">
          ${buildSvgLine(values, {
            color: cssVar(`--tone-${tone}`) || cssVar('--primary'),
            width: 560,
            height: 210,
            pad: 22,
            fill: true,
            dots: values.length <= 12,
            strokeWidth: 2.6,
          })}
        </div>
      </div>
      <div class="trend-detail-meta">
        <span>${esc(labels[0] || '-')} - ${esc(labels.at(-1) || '-')}</span>
        <span>${esc(rangeText)}</span>
      </div>
    </article>
  `;
}

function categoryItems(observations, category) {
  const categorySet = new Set(category.categories || [category.key]);
  let items = observations.filter((item) => categorySet.has(item.category));
  if (category.metricKeys) {
    const keySet = new Set(category.metricKeys);
    items = items.filter((item) => keySet.has(item.metric_key));
  }
  if (category.excludeMetricKeys) {
    const excluded = new Set(category.excludeMetricKeys);
    items = items.filter((item) => !excluded.has(item.metric_key));
  }
  return items.slice().sort((a, b) => {
    const aOrder = METRIC_ORDER_INDEX.get(a.metric_key) ?? 9999;
    const bOrder = METRIC_ORDER_INDEX.get(b.metric_key) ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.metric_name || '').localeCompare(String(b.metric_name || ''), 'ko-KR');
  });
}

function renderGrid(report) {
  const observations = report.observations || [];
  const renderedCards = [];

  dom.reportGrid.innerHTML = '';
  for (const category of CATEGORY_META) {
    const items = categoryItems(observations, category);
    if (!items.length && category.optional) continue;
    renderedCards.push({
      key: category.key,
      card: category.key === 'investor_flows'
        ? renderInvestorFlowsCard(category, items)
        : renderMetricsCard(category, items),
    });
  }

  const cardByKey = new Map(renderedCards.map((entry) => [entry.key, entry.card]));
  const ratesCard = cardByKey.get('rates_credit');
  const equitiesCard = cardByKey.get('equities');
  const investorCard = cardByKey.get('investor_flows');

  if (ratesCard && equitiesCard) {
    dom.reportGrid.appendChild(ratesCard);

    const rightStack = document.createElement('div');
    rightStack.className = 'market-right-stack';
    rightStack.appendChild(equitiesCard);
    if (investorCard) rightStack.appendChild(investorCard);
    dom.reportGrid.appendChild(rightStack);

    for (const { key, card } of renderedCards) {
      if (['rates_credit', 'equities', 'investor_flows'].includes(key)) continue;
      dom.reportGrid.appendChild(card);
    }
  } else {
    for (const { card } of renderedCards) dom.reportGrid.appendChild(card);
  }

  requestAnimationFrame(() => initSparklines(report));
}


function renderMetricsCard(category, items) {
  const card = document.createElement('section');
  card.className = `category-card tone-${category.tone}`;
  card.dataset.category = category.key;
  const flowItems = items.filter((item) => item.category === 'investor_flows');
  const tableGroups = CATEGORY_ORDER
    .filter((key) => key !== 'investor_flows')
    .map((key) => ({
      key,
      label: CATEGORY_LABELS[key] || key,
      items: items.filter((item) => item.category === key),
    }))
    .filter((group) => group.items.length);
  const multiGroup = tableGroups.length > 1;

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-group">
        <div class="card-eyebrow">${esc(category.eyebrow)}</div>
        <h2 class="card-title">${esc(category.label)}</h2>
      </div>
    </div>
    <div class="metrics-table-wrap">
      <table class="metrics-table">
        <thead><tr><th>지표</th><th>현재값</th><th>전일대비</th><th>연말대비</th></tr></thead>
        <tbody>
          ${tableGroups.map((group) => `
            ${multiGroup ? `<tr class="metric-group-row"><td colspan="4">${esc(group.label)}</td></tr>` : ''}
            ${group.items.map((item) => `<tr>
              <td><div class="metric-name">${esc(item.metric_name)}</div></td>
              <td><span class="metric-value">${fmtNum(item.value)}</span><span class="metric-unit">${esc(item.unit || '')}</span></td>
              <td>${formatChange(item.change_1d, item.change_1d_unit)}</td>
              <td>${formatChange(item.change_ytd, item.change_ytd_unit)}</td>
            </tr>`).join('')}
          `).join('')}
        </tbody>
      </table>
    </div>
    ${flowItems.length ? renderFlowsBlock(flowItems) : ''}
  `;
  return card;
}

function investorFlowValue(items, key) {
  return items.find((item) => item.metric_key === key) || null;
}

function renderInvestorFlowsCard(category, items) {
  const card = document.createElement('section');
  card.className = `category-card investor-card tone-${category.tone}`;
  card.dataset.category = category.key;

  const sections = [
    {
      title: '채권',
      rows: [
        ['국채선물 3년', 'fut_kr3y_foreign', 'fut_kr3y_inst', 'fut_kr3y_individual'],
        ['국채선물 10년', 'fut_kr10y_foreign', 'fut_kr10y_inst', 'fut_kr10y_individual'],
      ],
    },
    {
      title: '주식',
      rows: [
        ['KOSPI', 'stock_kospi_foreign', 'stock_kospi_inst', 'stock_kospi_individual'],
        ['KOSDAQ', 'stock_kosdaq_foreign', 'stock_kosdaq_inst', 'stock_kosdaq_individual'],
        ['KOSPI200 선물', 'fut_kospi200_foreign', 'fut_kospi200_inst', 'fut_kospi200_individual'],
      ],
    },
  ];

  const renderCell = (item) => {
    if (!item) return '<td class="flow-matrix-empty">-</td>';
    const value = Number(item.value);
    const direction = value >= 0 ? 'buy' : 'sell';
    const abs = Math.abs(value);
    const digits = abs >= 1000 ? 0 : 1;
    const sign = value > 0 ? '+' : '';
    const text = Number.isFinite(value) ? `${sign}${value.toLocaleString('ko-KR', {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    })}${item.unit || ''}` : '-';
    return `<td class="flow-matrix-value ${direction}">${esc(text)}</td>`;
  };

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-group">
        <div class="card-eyebrow">${esc(category.eyebrow)}</div>
        <h2 class="card-title">${esc(category.label)}</h2>
      </div>
    </div>
    <div class="investor-matrix-grid">
      ${sections.map((section) => `
        <section class="investor-matrix-section">
          <h3>${esc(section.title)}</h3>
          <div class="investor-table-wrap">
            <table class="investor-table">
              <thead>
                <tr><th>구분</th><th>외국인</th><th>기관</th><th>개인</th></tr>
              </thead>
              <tbody>
                ${section.rows.map(([label, foreignKey, instKey, individualKey]) => `
                  <tr>
                    <td>${esc(label)}</td>
                    ${renderCell(investorFlowValue(items, foreignKey))}
                    ${renderCell(investorFlowValue(items, instKey))}
                    ${renderCell(investorFlowValue(items, individualKey))}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      `).join('')}
    </div>
  `;
  return card;
}

function renderFlowsBlock(items) {
  const maxAbs = Math.max(...items.map((item) => Math.abs(Number(item.value) || 0)), 1);
  return `
    <div class="flows-block">
      <div class="flows-block-title">투자자 동향 <span>순매수 (억원)</span></div>
      <div class="flows-grid">
        ${items.map((item) => {
          const value = Number(item.value) || 0;
          const direction = value >= 0 ? 'up' : 'down';
          const percent = Math.min(100, Math.abs(value) / maxAbs * 100);
          return `<div class="flow-item">
            <div class="flow-name">${esc(item.metric_name)}</div>
            <div class="flow-bar-wrap"><div class="flow-bar-bg"><div class="flow-bar ${direction}" style="width:${percent.toFixed(1)}%"></div></div></div>
            <div class="flow-value ${direction}">${esc(changeText(value, item.unit || ''))}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function initSparklines(report) {
  const observations = report.observations || [];
  state.sparklines.clear();
  for (const category of CATEGORY_META) {
    if (!category.sparkMetric) continue;
    const target = document.getElementById(`spark-${category.key}`);
    const item = categoryItems(observations, category).find((observation) => observation.metric_key === category.sparkMetric);
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
  if (state.currentReport) renderMarketCharts(state.currentReport);
  if (state.currentReport) renderTrendWorkspace(state.currentReport);
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
  let researchItems = includedResearchItems();
  if (state.currentDate) {
    try {
      const validationResult = await fetchJson(`/api/validation/${state.currentDate}`);
      validation = validationResult.cross_checks || [];
    } catch {}
    if (!state.currentResearch) {
      try {
        const research = await fetchJson(`/api/research/${state.currentDate}`);
        state.currentResearch = research;
        researchItems = includedResearchItems(research);
      } catch {}
    }
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
    research_items: researchItems,
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

function setView(view) {
  const next = view === 'trend' ? 'trend' : 'overview';
  state.view = next;
  if (dom.overviewView) dom.overviewView.hidden = next !== 'overview';
  if (dom.trendView) dom.trendView.hidden = next !== 'trend';
  document.querySelectorAll('[data-view-target]').forEach((target) => {
    target.classList.toggle('active', target.dataset.viewTarget === next);
  });
  if (next === 'trend') {
    renderTrendWorkspace(state.currentReport);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function bindViewSwitching() {
  document.querySelectorAll('[data-view-target]').forEach((target) => {
    target.addEventListener('click', () => setView(target.dataset.viewTarget));
  });
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

bindViewSwitching();
bindChat();
loadReports().catch((error) => {
  dom.reportLoading.innerHTML = `<p style="color:var(--down)">리포트 로드 실패: ${esc(error.message)}</p>`;
});
