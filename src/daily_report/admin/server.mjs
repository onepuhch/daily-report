import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const processedDir = path.join(projectRoot, 'data', 'processed');
const outputDir = path.join(projectRoot, 'output');
const defaultPort = Number(process.env.DAILY_REPORT_ADMIN_PORT || process.env.PORT || 4173);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.sql', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseJson(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function readDotEnv() {
  const values = {};
  let raw = '';

  try {
    raw = await readFile(path.join(projectRoot, '.env'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return values;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }

  return values;
}

async function getSupabaseConfig() {
  const env = await readDotEnv();
  const url = process.env.SUPABASE_URL || env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  const key = serviceRoleKey && !serviceRoleKey.startsWith('your-') ? serviceRoleKey : anonKey;

  if (!url || url.includes('your-project-ref')) {
    const error = new Error('SUPABASE_URL is missing in .env.');
    error.statusCode = 400;
    throw error;
  }

  if (!key || key.startsWith('your-')) {
    const error = new Error('SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is missing in .env.');
    error.statusCode = 400;
    throw error;
  }

  return {
    url: url.replace(/\/+$/, ''),
    key,
  };
}

async function supabaseRest(method, apiPath, body, extraHeaders = {}) {
  const config = await getSupabaseConfig();
  const headers = {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    'content-type': 'application/json',
    prefer: 'resolution=merge-duplicates,return=representation',
    ...extraHeaders,
  };

  const response = await fetch(`${config.url}/rest/v1/${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    let message = data?.message || data?.hint || text || `Supabase request failed: ${response.status}`;
    if (response.status === 403 && String(message).includes('permission denied')) {
      message = `${message}. Check SUPABASE_SERVICE_ROLE_KEY in .env, or add Supabase write policies for this table.`;
    }
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function sqlString(value) {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  const clean = Array.isArray(values)
    ? values.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (clean.length === 0) {
    return 'ARRAY[]::text[]';
  }

  return `ARRAY[${clean.map(sqlString).join(', ')}]::text[]`;
}

function normalizeStatus(value) {
  const allowed = new Set(['draft', 'reviewed', 'published']);
  return allowed.has(value) ? value : 'reviewed';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  if (Math.abs(number) >= 1000) {
    return number.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  return number.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
}

function formatChange(value, unit) {
  if (value === null || value === undefined || value === '') {
    return '<span class="flat">-</span>';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `<span class="flat">${escapeHtml(value)}</span>`;
  }

  const className = number > 0 ? 'up' : number < 0 ? 'down' : 'flat';
  const sign = number > 0 ? '+' : '';
  return `<span class="${className}">${sign}${formatNumber(number)}${escapeHtml(unit || '')}</span>`;
}

function formatChangeText(value, unit) {
  if (value === null || value === undefined || value === '') return '변동 데이터 없음';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${formatNumber(number)}${unit || ''}`;
}

function directionText(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '보합';
  return number > 0 ? '상승' : '하락';
}

function formatDateKo(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatDateTimeKo(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function textToParagraphs(value) {
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '<p class="muted">최종 코멘트가 아직 작성되지 않았습니다.</p>';
  }

  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');
}

function groupObservations(observations) {
  const groups = new Map();

  for (const item of observations || []) {
    const key = item.category || 'other';
    if (!groups.has(key)) {
      groups.set(key, {
        label: item.category_label || key,
        rows: [],
      });
    }
    groups.get(key).rows.push(item);
  }

  return [...groups.values()];
}

function getMetric(report, key) {
  return (report.observations || []).find((item) => item.metric_key === key);
}

function describeMetric(item) {
  if (!item) return null;
  const value = `${formatNumber(item.value)}${item.unit ? item.unit : ''}`;
  const change = formatChangeText(item.change_1d, item.change_1d_unit);
  return `${item.metric_name} ${value}, 전일대비 ${change} ${directionText(item.change_1d)}`;
}

function buildAutoCommentDraft(report, referenceNote = '') {
  const kr10y = getMetric(report, 'kr_gov_10y');
  const us10y = getMetric(report, 'us_treasury_10y');
  const kospi = getMetric(report, 'kospi');
  const kosdaq = getMetric(report, 'kosdaq');
  const sp500 = getMetric(report, 'sp500');
  const nasdaq = getMetric(report, 'nasdaq');
  const usdkrw = getMetric(report, 'usdkrw');
  const dollarIndex = getMetric(report, 'dollar_index');
  const gold = getMetric(report, 'gold');
  const wti = getMetric(report, 'wti');
  const btc = getMetric(report, 'btc_usd');

  const paragraphs = [];
  const rates = [describeMetric(kr10y), describeMetric(us10y)].filter(Boolean);
  if (rates.length > 0) {
    paragraphs.push(`금리는 ${rates.join(', ')} 흐름을 보였습니다.`);
  }

  const equities = [describeMetric(kospi), describeMetric(kosdaq), describeMetric(sp500), describeMetric(nasdaq)].filter(Boolean);
  if (equities.length > 0) {
    paragraphs.push(`주식시장은 ${equities.join(', ')}했습니다.`);
  }

  const fxCommodity = [describeMetric(usdkrw), describeMetric(dollarIndex), describeMetric(gold), describeMetric(wti), describeMetric(btc)].filter(Boolean);
  if (fxCommodity.length > 0) {
    paragraphs.push(`환율과 기타 자산은 ${fxCommodity.join(', ')}했습니다.`);
  }

  const movers = (report.observations || [])
    .filter((item) => Number.isFinite(Number(item.change_1d)))
    .sort((a, b) => Math.abs(Number(b.change_1d)) - Math.abs(Number(a.change_1d)))
    .slice(0, 4)
    .map((item) => `${item.metric_name} ${formatChangeText(item.change_1d, item.change_1d_unit)}`);

  if (movers.length > 0) {
    paragraphs.push(`전일대비 변동폭은 ${movers.join(', ')} 순으로 크게 나타났습니다.`);
  }

  if (String(referenceNote || '').trim()) {
    paragraphs.push('참고 메모에 적은 이벤트와 수급 요인을 확인해 위 숫자 흐름의 원인을 최종 코멘트에 보강하세요.');
  }

  paragraphs.push('위 문장은 숫자 기반 자동 초안입니다. 실제 발행 전에는 당일 뉴스, 수급, 정책 이벤트를 확인해 표현을 다듬어야 합니다.');
  return paragraphs.join('\n\n');
}

function buildHighlightCards(report) {
  const highlights = [
    getMetric(report, 'kr_gov_10y'),
    getMetric(report, 'us_treasury_10y'),
    getMetric(report, 'kospi'),
    getMetric(report, 'sp500'),
    getMetric(report, 'usdkrw'),
    getMetric(report, 'btc_usd'),
  ].filter(Boolean);

  if (highlights.length === 0) return '';

  return `
    <section class="highlight-grid" aria-label="핵심 지표">
      ${highlights.map((item) => `
        <article class="highlight-card">
          <span>${escapeHtml(item.category_label || item.category)}</span>
          <strong>${escapeHtml(item.metric_name)}</strong>
          <div class="highlight-value">${formatNumber(item.value)} <small>${escapeHtml(item.unit || '')}</small></div>
          <div class="highlight-change">${formatChange(item.change_1d, item.change_1d_unit)}</div>
        </article>
      `).join('\n')}
    </section>`;
}

function buildTopMoverList(report) {
  const movers = (report.observations || [])
    .filter((item) => Number.isFinite(Number(item.change_1d)))
    .sort((a, b) => Math.abs(Number(b.change_1d)) - Math.abs(Number(a.change_1d)))
    .slice(0, 6);

  if (movers.length === 0) {
    return '<p class="muted">전일대비 변동 데이터가 없습니다.</p>';
  }

  return `
    <ol class="mover-list">
      ${movers.map((item) => `
        <li>
          <div>
            <strong>${escapeHtml(item.metric_name)}</strong>
            <span>${escapeHtml(item.category_label || item.category)}</span>
          </div>
          ${formatChange(item.change_1d, item.change_1d_unit)}
        </li>
      `).join('\n')}
    </ol>`;
}

function buildReviewHtml(report, comment) {
  const reportDate = report.report_date;
  const status = comment.status || 'draft';
  const mainComment = comment.final_comment || comment.auto_comment || '';
  const byKey = new Map((report.observations || []).map((item) => [item.metric_key, item]));
  const workbookName = report.source_workbook ? path.basename(report.source_workbook) : '-';
  const pick = (keys) => keys.map((key) => byKey.get(key)).filter(Boolean);
  const tickerItems = [
    ['kospi', 'KOSPI'],
    ['usdkrw', 'USD/KRW'],
    ['us_10y', 'US10Y'],
    ['wti', 'WTI'],
    ['gold', 'GOLD'],
  ].map(([key, label]) => ({ item: byKey.get(key), label })).filter(({ item }) => item);

  const columns = [
    {
      label: '국내',
      groups: [
        { title: '국내금리', rows: pick(['kr_cd91', 'kr_1y', 'kr_3y', 'kr_5y', 'kr_10y', 'kr_30y']) },
        { title: '국내주식', rows: pick(['kospi', 'kosdaq', 'kospi200']) },
        { title: '크레딧', rows: pick(['kr_aa3y', 'kr_bbb3y']) },
      ],
    },
    {
      label: '해외 금리·주식',
      groups: [
        { title: '해외금리', rows: pick(['us_2y', 'us_5y', 'us_10y', 'us_30y', 'de_10y']) },
        { title: '해외주식', rows: pick(['sp500', 'nasdaq', 'nikkei', 'shanghai']) },
      ],
    },
    {
      label: '외환·원자재·암호화폐',
      groups: [
        { title: '외환', rows: pick(['usdkrw', 'dxy']) },
        { title: '원자재', rows: pick(['wti', 'brent', 'gold', 'silver', 'copper']) },
        { title: '암호화폐', rows: pick(['bitcoin', 'btc_usd']) },
      ],
    },
  ];

  const seenKeys = new Set(columns.flatMap((column) => column.groups.flatMap((group) => group.rows.map((item) => item.metric_key))));
  const leftoverFlows = (report.observations || []).filter((item) => item.category === 'investor_flows' && !seenKeys.has(item.metric_key));
  if (leftoverFlows.length > 0) {
    columns[0].groups.push({ title: '투자자 동향', rows: leftoverFlows });
    for (const item of leftoverFlows) seenKeys.add(item.metric_key);
  }
  const leftover = (report.observations || []).filter((item) => !seenKeys.has(item.metric_key));
  if (leftover.length > 0) {
    columns[2].groups.push({ title: '기타', rows: leftover });
  }

  const renderTicker = ({ item, label }) => `
    <article class="ticker-chip ${Number(item.change_1d) > 0 ? 'is-up' : Number(item.change_1d) < 0 ? 'is-down' : 'is-flat'}">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(item.value)}${item.unit ? `<small>${escapeHtml(item.unit)}</small>` : ''}</strong>
      <em>1D ${formatChangeText(item.change_1d, item.change_1d_unit)}</em>
    </article>`;

  const renderMetricRow = (item) => `
    <tr data-metric-key="${escapeHtml(item.metric_key)}">
      <th scope="row">
        <span class="metric-title">${escapeHtml(item.metric_name)}</span>
        <span class="metric-key">${escapeHtml(item.metric_key)}</span>
      </th>
      <td class="num">${formatNumber(item.value)}${item.unit ? `<span>${escapeHtml(item.unit)}</span>` : ''}</td>
      <td class="change-cell">${formatChange(item.change_1d, item.change_1d_unit)}</td>
      <td class="change-cell">${formatChange(item.change_ytd, item.change_ytd_unit)}</td>
      <td class="spark-cell" aria-label="sparkline placeholder">--</td>
    </tr>`;

  const renderGroup = (group) => {
    if (group.rows.length === 0) return '';
    return `
      <section class="metric-card">
        <header class="metric-card-head">
          <h2>${escapeHtml(group.title)}</h2>
          <span>${group.rows.length}</span>
        </header>
        <table>
          <thead>
            <tr>
              <th scope="col">지표명</th>
              <th scope="col">값</th>
              <th scope="col">1D</th>
              <th scope="col">YTD</th>
              <th scope="col">추이</th>
            </tr>
          </thead>
          <tbody>${group.rows.map(renderMetricRow).join('\n')}</tbody>
        </table>
      </section>`;
  };

  const metricColumns = columns.map((column) => `
    <section class="metric-column" aria-label="${escapeHtml(column.label)}">
      <div class="column-title">${escapeHtml(column.label)}</div>
      ${column.groups.map(renderGroup).join('\n')}
    </section>`).join('\n');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Market Daily - ${escapeHtml(reportDate)}</title>
  <style>
    @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
    :root {
      /* New design system tokens (see design.md) */
      --bg: #fafbfc;
      --surface: #ffffff;
      --border: #e6e8eb;
      --border-strong: #d1d5db;
      --text: #1a1f2e;
      --text-strong: #0a0e1a;
      --muted: #6b7280;
      --subtle: #9ca3af;
      --accent: #1f4ed8;
      --accent-hover: #1846c4;
      --accent-soft: #eef2ff;
      --up: #d92d20;
      --up-soft: #fef3f2;
      --down: #1570ef;
      --down-soft: #eff8ff;
      --flat: #6b7280;
      --warning: #b54708;
      --error: #b42318;
      --status-draft: #6b7280;
      --status-reviewed: #1f4ed8;
      --status-published: #067647;
      --radius-xs: 2px;
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-lg: 8px;
      --radius-full: 9999px;
      --shadow-1: 0 1px 2px rgba(15, 23, 42, 0.04);
      --shadow-2: 0 4px 12px rgba(15, 23, 42, 0.08);
      --shadow-3: 0 12px 32px rgba(15, 23, 42, 0.16);
      --font-sans: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI",
                   "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;

      /* Backward-compat aliases (Phase B에서 점진 제거) */
      --paper: var(--surface);
      --ink: var(--text);
      --line: var(--border);
      --soft: var(--bg);
      --soft-strong: var(--border);
      --red: var(--up);
      --blue: var(--down);
      --green: var(--status-published);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      letter-spacing: 0;
    }
    main {
      margin: 0 auto;
      padding: 34px 0 64px;
      width: min(1160px, calc(100% - 32px));
    }
    header {
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 18px;
      grid-template-columns: minmax(0, 1fr) auto;
      margin-bottom: 18px;
      padding-bottom: 24px;
    }
    .kicker {
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
      margin-bottom: 8px;
    }
    h1 {
      font-size: clamp(34px, 5vw, 54px);
      font-weight: 720;
      line-height: 1.08;
      margin: 0 0 14px;
    }
    .header-date {
      align-self: end;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
      text-align: right;
      white-space: nowrap;
    }
    .header-date strong {
      color: var(--ink);
      display: block;
      font-size: 18px;
      margin-bottom: 2px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      align-items: center;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      display: inline-flex;
      font-size: 13px;
      min-height: 28px;
      padding: 0 11px;
    }
    .report-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 18px;
    }
    .report-nav a {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: 13px;
      padding: 7px 11px;
      text-decoration: none;
    }
    .report-nav a:hover { color: var(--ink); }
    .summary-layout {
      align-items: stretch;
      display: grid;
      gap: 14px;
      grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.55fr);
      margin-bottom: 18px;
    }
    .comment {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 18px 20px;
    }
    .comment h2 {
      font-size: 16px;
      margin: 0 0 10px;
    }
    .comment p {
      line-height: 1.7;
      margin: 0 0 8px;
    }
    .comment p:last-child { margin-bottom: 0; }
    .mover-panel {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 18px 18px 14px;
    }
    .mover-panel h2 {
      font-size: 16px;
      margin: 0 0 12px;
    }
    .mover-list {
      display: grid;
      gap: 0;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .mover-list li {
      align-items: center;
      border-top: 1px solid var(--line);
      display: flex;
      gap: 12px;
      justify-content: space-between;
      padding: 10px 0;
    }
    .mover-list li:first-child { border-top: 0; padding-top: 0; }
    .mover-list strong {
      display: block;
      font-size: 13px;
      margin-bottom: 2px;
    }
    .mover-list span:not(.up):not(.down):not(.flat) {
      color: var(--muted);
      display: block;
      font-size: 12px;
    }
    .highlight-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      margin-bottom: 18px;
    }
    .highlight-card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      min-width: 0;
      padding: 14px;
    }
    .highlight-card span {
      color: var(--muted);
      display: block;
      font-size: 11px;
      font-weight: 650;
      margin-bottom: 7px;
    }
    .highlight-card strong {
      display: block;
      font-size: 13px;
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .highlight-value {
      font-size: 19px;
      font-weight: 720;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .highlight-value small {
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
    }
    .highlight-change { font-size: 13px; }
    .section {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 10px;
      margin-top: 14px;
      overflow: hidden;
    }
    .section-head {
      align-items: center;
      background: #fbfbfa;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 12px;
      justify-content: space-between;
      padding: 15px 18px;
    }
    .section-head h2 {
      font-size: 17px;
      margin: 0;
    }
    .section-head span {
      color: var(--muted);
      font-size: 13px;
    }
    .table-wrap { overflow-x: auto; }
    table {
      border-collapse: collapse;
      min-width: 760px;
      width: 100%;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      font-size: 14px;
      padding: 12px 16px;
      text-align: right;
      vertical-align: middle;
      white-space: nowrap;
    }
    th {
      background: var(--soft);
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    th:first-child, td:first-child { text-align: left; }
    tr:last-child td { border-bottom: 0; }
    td strong {
      display: block;
      font-size: 14px;
      margin-bottom: 3px;
    }
    td small {
      color: var(--muted);
      display: block;
      font-size: 11px;
    }
    .muted { color: var(--muted); }
    .up { color: var(--red); font-weight: 650; }
    .down { color: var(--blue); font-weight: 650; }
    .flat { color: var(--muted); font-weight: 650; }
    .source {
      color: var(--muted);
      font-family: Consolas, monospace;
      font-size: 12px;
    }
    footer {
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
      margin-top: 22px;
      padding-top: 14px;
    }
    @media (max-width: 720px) {
      main { padding-top: 22px; width: min(100% - 20px, 1180px); }
      header { grid-template-columns: 1fr; }
      .header-date { text-align: left; }
      .summary-layout { grid-template-columns: 1fr; }
      .highlight-grid { grid-template-columns: 1fr 1fr; }
      .comment, .section-head { padding-left: 14px; padding-right: 14px; }
      th, td { padding: 10px 12px; }
    }
    @media (min-width: 721px) and (max-width: 1020px) {
      .highlight-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .summary-layout { grid-template-columns: 1fr; }
    }
    .report-header {
      align-items: center;
      backdrop-filter: blur(12px);
      background: rgba(250, 251, 252, 0.94);
      border-bottom: 1px solid var(--border);
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(220px, 1fr) auto;
      height: 48px;
      margin: 0 0 12px;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    main {
      padding: 16px 0 28px;
      width: min(1440px, calc(100% - 32px));
    }
    .header-main { min-width: 0; }
    .report-header .kicker {
      font-size: 11px;
      line-height: 1.1;
      margin-bottom: 2px;
    }
    .report-header h1 {
      color: var(--text-strong);
      font-size: 18px;
      line-height: 1.1;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ticker-strip {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .ticker-strip::-webkit-scrollbar { display: none; }
    .ticker-chip {
      align-items: center;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      display: grid;
      gap: 1px;
      grid-template-columns: auto auto;
      min-width: 118px;
      padding: 5px 8px;
    }
    .ticker-chip span {
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
    }
    .ticker-chip strong {
      color: var(--text-strong);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      justify-self: end;
      line-height: 1;
    }
    .ticker-chip small {
      color: var(--muted);
      font-size: 9px;
      font-weight: 600;
      margin-left: 2px;
    }
    .ticker-chip em {
      font-size: 10px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      grid-column: 1 / -1;
      justify-self: end;
    }
    .ticker-chip.is-up em { color: var(--up); }
    .ticker-chip.is-down em { color: var(--down); }
    .ticker-chip.is-flat em { color: var(--flat); }
    .report-meta {
      align-items: center;
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .report-header .meta,
    .header-date,
    .report-nav,
    #key-metrics,
    .mover-panel {
      display: none;
    }
    .summary-layout {
      display: block;
      margin-bottom: 14px;
    }
    .comment {
      margin-bottom: 14px;
      max-height: 120px;
      overflow: hidden;
      padding: 14px 16px;
      position: relative;
    }
    .comment.is-expanded { max-height: none; }
    .comment-head {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .comment h2 {
      font-size: 14px;
      margin: 0;
    }
    .comment p {
      font-size: 13px;
      line-height: 1.55;
    }
    .comment-toggle {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    .metric-grid,
    #details {
      align-items: start;
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .metric-column {
      display: grid;
      gap: 12px;
      min-width: 0;
    }
    .column-title {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .02em;
      text-transform: uppercase;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-1);
      overflow: hidden;
    }
    .metric-card-head {
      align-items: center;
      display: flex;
      justify-content: space-between;
      min-height: 32px;
      padding: 7px 10px;
    }
    .metric-card-head h2 {
      font-size: 13px;
      font-weight: 750;
      margin: 0;
    }
    .metric-card-head span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }
    .metric-card table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
    }
    .metric-card th,
    .metric-card td {
      border-top: 1px solid var(--border);
      font-size: 13px;
      height: 28px;
      line-height: 1.15;
      padding: 4px 8px;
      text-align: right;
      vertical-align: middle;
      white-space: nowrap;
    }
    .metric-card thead th {
      background: var(--soft);
      color: var(--muted);
      font-size: 10px;
      font-weight: 750;
    }
    .metric-card th:first-child,
    .metric-card td:first-child {
      overflow: hidden;
      text-align: left;
      text-overflow: ellipsis;
    }
    .metric-card tbody th {
      background: transparent;
      color: var(--text);
      font-weight: 650;
      width: 34%;
    }
    .metric-title {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .metric-key {
      color: var(--muted);
      display: block;
      font-size: 9px;
      font-weight: 600;
      margin-top: 1px;
    }
    .num,
    .change-cell {
      font-variant-numeric: tabular-nums;
    }
    .num { font-weight: 700; }
    .num span {
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
      margin-left: 2px;
    }
    .spark-cell {
      color: var(--subtle);
      font-size: 11px;
      width: 52px;
    }
    @media (max-width: 1100px) {
      .report-header {
        align-items: start;
        grid-template-columns: 1fr;
        height: auto;
        padding-bottom: 8px;
      }
      .ticker-strip { justify-content: flex-start; }
      .metric-grid,
      #details { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      main { padding-top: 10px; width: min(100% - 20px, 1440px); }
      .report-meta { flex-wrap: wrap; }
      .ticker-chip { min-width: 104px; }
      .metric-card th,
      .metric-card td { font-size: 12px; padding-left: 6px; padding-right: 6px; }
      .metric-key { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <header class="report-header">
      <div>
        <div class="kicker">${escapeHtml(formatDateKo(reportDate))}</div>
        <h1>${escapeHtml(report.title || 'Market Daily')}</h1>
        <div class="meta">
          <span class="pill">기준일 ${escapeHtml(reportDate)}</span>
          <span class="pill">작성 ${escapeHtml(report.author || '자금운용본부')}</span>
          <span class="pill">상태 ${escapeHtml(status)}</span>
        </div>
      </div>
      <div class="header-date">
        <strong>${escapeHtml(formatDateKo(reportDate))}</strong>
        <span>${escapeHtml(formatDateTimeKo(report.generated_at))} 생성</span>
      </div>
      <div class="ticker-strip" aria-label="key metrics">
        ${tickerItems.map(renderTicker).join('\n')}
      </div>
    </header>

    <section id="commentary" class="comment">
      <h2>시장 코멘트</h2>
      <button class="comment-toggle" type="button" aria-expanded="false">More</button>
      <div class="comment-body">${textToParagraphs(mainComment)}</div>
    </section>

    <div id="details">
      ${metricColumns}
    </div>

    <footer>Generated at ${escapeHtml(formatDateTimeKo())} · source workbook: ${escapeHtml(workbookName)}</footer>
  </main>
  <script>
    const comment = document.querySelector('.comment');
    const toggle = document.querySelector('.comment-toggle');
    if (comment && toggle) {
      toggle.addEventListener('click', () => {
        const expanded = comment.classList.toggle('is-expanded');
        toggle.textContent = expanded ? 'Less' : 'More';
        toggle.setAttribute('aria-expanded', String(expanded));
      });
      if (comment.scrollHeight <= 122) toggle.hidden = true;
    }
  </script>
</body>
</html>
`;
}

async function getReportFiles() {
  let names = [];
  try {
    names = await readdir(processedDir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = names
    .filter((name) => /^market_daily_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .reverse();

  return Promise.all(files.map(async (name) => {
    const fullPath = path.join(processedDir, name);
    const raw = await readFile(fullPath, 'utf8');
    const report = parseJson(raw);
    const fileStat = await stat(fullPath);
    return {
      date: report.report_date,
      title: report.title || `Daily Report ${report.report_date}`,
      author: report.author || '',
      generated_at: report.generated_at || '',
      observation_count: Array.isArray(report.observations) ? report.observations.length : 0,
      modified_at: fileStat.mtime.toISOString(),
      file: path.relative(projectRoot, fullPath),
    };
  }));
}

async function readAllReports() {
  const files = await getReportFiles();
  const reports = [];

  for (const file of files) {
    const raw = await readFile(path.join(projectRoot, file.file), 'utf8');
    reports.push(parseJson(raw));
  }

  return reports.sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
}

async function readReport(date) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

  const reportPath = path.join(processedDir, `market_daily_${date}.json`);
  const raw = await readFile(reportPath, 'utf8');
  const report = parseJson(raw);

  let comment = null;
  try {
    const commentRaw = await readFile(path.join(processedDir, `comment_${date}.json`), 'utf8');
    comment = parseJson(commentRaw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const reviewHtmlPath = path.join(outputDir, `market_daily_${date}.review.html`);
  let previewHtml = `output/market_daily_${date}.html`;
  try {
    await stat(reviewHtmlPath);
    previewHtml = `output/market_daily_${date}.review.html`;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return {
    ...report,
    comment,
    preview_html: previewHtml,
    original_html: `output/market_daily_${date}.html`,
  };
}

async function getMetricSeries(metricKey) {
  const cleanMetricKey = String(metricKey || '').trim();
  if (!cleanMetricKey) {
    const error = new Error('metric_key is required.');
    error.statusCode = 400;
    throw error;
  }

  const reports = await readAllReports();
  const points = [];
  let metricName = cleanMetricKey;
  let categoryLabel = '';
  let unit = '';

  for (const report of reports) {
    const item = (report.observations || []).find((observation) => observation.metric_key === cleanMetricKey);
    if (!item) continue;

    metricName = item.metric_name || metricName;
    categoryLabel = item.category_label || categoryLabel;
    unit = item.unit || unit;
    points.push({
      report_date: report.report_date,
      value: item.value,
      unit: item.unit,
      change_1d: item.change_1d,
      change_1d_unit: item.change_1d_unit,
      change_ytd: item.change_ytd,
      change_ytd_unit: item.change_ytd_unit,
    });
  }

  return {
    metric_key: cleanMetricKey,
    metric_name: metricName,
    category_label: categoryLabel,
    unit,
    points,
  };
}

async function getLatestReportDate() {
  const reports = await getReportFiles();
  return reports[0]?.date || null;
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function scoreObservation(item, question) {
  const text = normalizeSearchText([
    item.metric_name,
    item.metric_key,
    item.category,
    item.category_label,
    item.unit,
  ].join(' '));
  const query = normalizeSearchText(question);
  let score = 0;

  if (query && text.includes(query)) score += 8;
  for (const token of query.match(/[a-z0-9가-힣]+/g) || []) {
    if (token.length >= 2 && text.includes(token)) score += 3;
  }

  const categoryHints = [
    ['금리', ['domestic_rates', 'global_rates', 'credit']],
    ['국채', ['domestic_rates', 'global_rates']],
    ['크레딧', ['credit']],
    ['주식', ['domestic_equities_fx', 'global_equities']],
    ['코스피', ['domestic_equities_fx']],
    ['나스닥', ['global_equities']],
    ['환율', ['fx']],
    ['달러', ['fx']],
    ['원달러', ['fx']],
    ['암호', ['crypto']],
    ['비트', ['crypto']],
    ['상품', ['commodities']],
    ['유가', ['commodities']],
    ['금값', ['commodities']],
  ];

  for (const [keyword, categories] of categoryHints) {
    if (question.includes(keyword) && categories.includes(item.category)) score += 2;
  }

  return score;
}

function observationToAnswerLine(item) {
  return `${item.metric_name}: ${formatNumber(item.value)}${item.unit || ''}, 1D ${formatChangeText(item.change_1d, item.change_1d_unit)}, YTD ${formatChangeText(item.change_ytd, item.change_ytd_unit)}`;
}

async function answerMarketQuestion(payload = {}) {
  const question = String(payload.question || '').trim();
  let date = payload.report_date || payload.date || '';

  if (!date) {
    date = await getLatestReportDate();
  }

  if (!date || !isDate(date)) {
    const error = new Error('질문할 리포트 날짜를 찾지 못했습니다.');
    error.statusCode = 400;
    throw error;
  }

  const report = await readReport(date);
  const observations = report.observations || [];
  const scored = observations
    .map((item) => ({ item, score: scoreObservation(item, question) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((row) => row.item);

  const matches = scored.length > 0 ? scored : observations.slice(0, 8);
  const commentText = report.comment?.final_comment || report.comment?.auto_comment || '';
  const intro = question
    ? `${date} 리포트에서 "${question}"와 관련된 지표를 찾았습니다.`
    : `${date} 리포트의 주요 지표입니다.`;
  const lines = matches.map(observationToAnswerLine);
  const commentLine = commentText
    ? `저장된 코멘트 요약: ${commentText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0]}`
    : '저장된 최종 코멘트는 아직 없습니다.';

  return {
    report_date: date,
    question,
    answer: [intro, ...lines, commentLine].join('\n'),
    matches,
    source: 'local_report_json',
    mode: 'rule_based_search',
  };
}

function buildCommentSql(date, payload) {
  const status = normalizeStatus(payload.status);
  const autoComment = payload.auto_comment || '';
  const finalComment = payload.final_comment || '';
  const referenceNote = payload.reference_note || '';
  const approvedBy = payload.approved_by || '';
  const tags = Array.isArray(payload.tags) ? payload.tags : [];

  return [
    `-- Daily Report comment update for ${date}`,
    '-- Run this in the Supabase SQL Editor.',
    '',
    'with target_report as (',
    `  select id from reports where report_date = date ${sqlString(date)} limit 1`,
    '), upsert_comment as (',
    '  insert into report_comments (',
    '    report_id, auto_comment, final_comment, reference_note, tags, approved_by, approved_at',
    '  )',
    '  select',
    '    id,',
    `    ${sqlString(autoComment)},`,
    `    ${sqlString(finalComment)},`,
    `    ${sqlString(referenceNote)},`,
    `    ${sqlArray(tags)},`,
    `    ${sqlString(approvedBy)},`,
    `    case when ${sqlString(status)} in ('reviewed', 'published') then now() else null end`,
    '  from target_report',
    '  on conflict (report_id) do update set',
    '    auto_comment = excluded.auto_comment,',
    '    final_comment = excluded.final_comment,',
    '    reference_note = excluded.reference_note,',
    '    tags = excluded.tags,',
    '    approved_by = excluded.approved_by,',
    '    approved_at = excluded.approved_at,',
    '    updated_at = now()',
    '  returning report_id',
    ')',
    'update reports',
    `set status = ${sqlString(status)}, updated_at = now()`,
    'where id in (select report_id from upsert_comment);',
    '',
  ].join('\n');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1_000_000) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function saveComment(date, payload) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

  await mkdir(processedDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const normalized = {
    report_date: date,
    auto_comment: payload.auto_comment || '',
    final_comment: payload.final_comment || '',
    reference_note: payload.reference_note || '',
    tags: Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean) : [],
    approved_by: payload.approved_by || '',
    status: normalizeStatus(payload.status),
    updated_at: new Date().toISOString(),
  };

  const sql = buildCommentSql(date, normalized);
  const commentPath = path.join(processedDir, `comment_${date}.json`);
  const sqlPath = path.join(outputDir, `market_daily_${date}.comment_update.sql`);
  const reviewHtmlPath = path.join(outputDir, `market_daily_${date}.review.html`);
  const reportRaw = await readFile(path.join(processedDir, `market_daily_${date}.json`), 'utf8');
  const report = parseJson(reportRaw);
  const reviewHtml = buildReviewHtml(report, normalized);

  await writeFile(commentPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await writeFile(sqlPath, sql, 'utf8');
  await writeFile(reviewHtmlPath, reviewHtml, 'utf8');

  return {
    comment: normalized,
    sql,
    sql_file: path.relative(projectRoot, sqlPath),
    comment_file: path.relative(projectRoot, commentPath),
    review_html: path.relative(projectRoot, reviewHtmlPath),
  };
}

async function generateCommentDraft(date, payload = {}) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

  const reportRaw = await readFile(path.join(processedDir, `market_daily_${date}.json`), 'utf8');
  const report = parseJson(reportRaw);
  return {
    report_date: date,
    auto_comment: buildAutoCommentDraft(report, payload.reference_note || ''),
    generated_at: new Date().toISOString(),
  };
}

async function uploadReportToSupabase(date, payload) {
  const saved = await saveComment(date, payload);
  const reportRaw = await readFile(path.join(processedDir, `market_daily_${date}.json`), 'utf8');
  const report = parseJson(reportRaw);
  const comment = saved.comment;

  const reportRows = await supabaseRest('POST', 'reports?on_conflict=report_date', [{
    report_date: report.report_date,
    status: comment.status,
    title: report.title || `Daily Report ${report.report_date}`,
    published_at: comment.status === 'published' ? new Date().toISOString() : null,
  }]);

  const reportId = Array.isArray(reportRows) ? reportRows[0]?.id : reportRows?.id;
  if (!reportId) {
    const error = new Error('Could not resolve report id after uploading report.');
    error.statusCode = 500;
    throw error;
  }

  const observations = (report.observations || []).map((item) => ({
    report_id: reportId,
    observed_date: item.observed_date,
    category: item.category,
    metric_key: item.metric_key,
    metric_name: item.metric_name,
    value: item.value,
    unit: item.unit,
    change_1d: item.change_1d,
    change_1d_unit: item.change_1d_unit,
    change_ytd: item.change_ytd,
    change_ytd_unit: item.change_ytd_unit,
    source: item.source,
    source_sheet: item.source_sheet,
    source_cell: item.source_cell,
    raw_value: item.raw_value,
  }));

  if (observations.length > 0) {
    await supabaseRest('POST', 'market_observations?on_conflict=report_id,metric_key', observations);
  }

  const approvedAt = ['reviewed', 'published'].includes(comment.status)
    ? new Date().toISOString()
    : null;

  await supabaseRest('POST', 'report_comments?on_conflict=report_id', [{
    report_id: reportId,
    auto_comment: comment.auto_comment || null,
    final_comment: comment.final_comment || null,
    reference_note: comment.reference_note || null,
    tags: comment.tags || [],
    approved_by: comment.approved_by || null,
    approved_at: approvedAt,
  }]);

  return {
    ...saved,
    supabase: {
      uploaded: true,
      report_id: reportId,
      report_date: report.report_date,
      observation_count: observations.length,
      status: comment.status,
    },
  };
}

async function serveStatic(res, requestPath) {
  let filePath;

  if (requestPath === '/' || requestPath === '/admin') {
    filePath = path.join(__dirname, 'index.html');
  } else if (requestPath === '/reports' || requestPath === '/archive') {
    filePath = path.join(__dirname, 'archive.html');
  } else if (requestPath.startsWith('/admin/')) {
    filePath = path.join(__dirname, requestPath.replace('/admin/', ''));
  } else if (requestPath.startsWith('/output/')) {
    filePath = path.join(projectRoot, requestPath.slice(1));
  } else {
    return false;
  }

  const resolved = path.resolve(filePath);
  const allowedAdmin = resolved.startsWith(__dirname);
  const allowedOutput = resolved.startsWith(outputDir);

  if (!allowedAdmin && !allowedOutput) {
    sendText(res, 403, 'Forbidden');
    return true;
  }

  try {
    await stat(resolved);
    const extension = path.extname(resolved).toLowerCase();
    const type = mimeTypes.get(extension) || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    createReadStream(resolved).pipe(res);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendText(res, 404, 'Not found');
      return true;
    }
    throw error;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const requestPath = decodeURIComponent(url.pathname);

    if (req.method === 'GET' && requestPath === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && requestPath === '/api/reports') {
      sendJson(res, 200, { reports: await getReportFiles() });
      return;
    }

    if (req.method === 'POST' && requestPath === '/api/ask') {
      const body = await readBody(req);
      sendJson(res, 200, await answerMarketQuestion(body));
      return;
    }

    const metricSeriesMatch = requestPath.match(/^\/api\/metrics\/([^/]+)\/series$/);
    if (req.method === 'GET' && metricSeriesMatch) {
      sendJson(res, 200, await getMetricSeries(decodeURIComponent(metricSeriesMatch[1])));
      return;
    }

    const reportMatch = requestPath.match(/^\/api\/reports\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'GET' && reportMatch) {
      sendJson(res, 200, await readReport(reportMatch[1]));
      return;
    }

    const draftMatch = requestPath.match(/^\/api\/comments\/(\d{4}-\d{2}-\d{2})\/draft$/);
    if (req.method === 'POST' && draftMatch) {
      const body = await readBody(req);
      sendJson(res, 200, await generateCommentDraft(draftMatch[1], body));
      return;
    }

    const commentMatch = requestPath.match(/^\/api\/comments\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'POST' && commentMatch) {
      const body = await readBody(req);
      sendJson(res, 200, await saveComment(commentMatch[1], body));
      return;
    }

    const supabaseUploadMatch = requestPath.match(/^\/api\/supabase\/reports\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'POST' && supabaseUploadMatch) {
      const body = await readBody(req);
      sendJson(res, 200, await uploadReportToSupabase(supabaseUploadMatch[1], body));
      return;
    }

    if (req.method === 'GET' && await serveStatic(res, requestPath)) {
      return;
    }

    sendText(res, 404, 'Not found');
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      error: error.message || 'Unexpected server error',
    });
  }
});

server.listen(defaultPort, '127.0.0.1', () => {
  console.log(`Daily Report Admin: http://127.0.0.1:${defaultPort}`);
});
