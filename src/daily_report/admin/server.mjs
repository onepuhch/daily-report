import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const processedDir = path.join(projectRoot, 'data', 'processed');
const outputDir = path.join(projectRoot, 'output');
const reportDir = path.join(projectRoot, 'src', 'daily_report', 'report');
const logsDir = path.join(projectRoot, 'data', 'logs');
const defaultPort = Number(process.env.DAILY_REPORT_ADMIN_PORT || process.env.PORT || 4173);
const execFileAsync = promisify(execFile);

const categoryLabels = {
  domestic_rates: '국내금리',
  global_rates: '해외금리',
  domestic_equities_fx: '국내주식',
  global_equities: '해외주식',
  fx: '환율',
  crypto: '암호화폐',
  commodities: '상품',
  credit: '크레딧',
};

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

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function resolvePython() {
  if (process.env.DAILY_REPORT_PYTHON) return process.env.DAILY_REPORT_PYTHON;

  const venvPython = path.join(projectRoot, '.venv-docling', 'Scripts', 'python.exe');
  if (existsSync(venvPython)) return venvPython;

  return process.platform === 'win32' ? 'py' : 'python3';
}

async function readDotEnv() {
  const values = {};
  let raw = '';
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '..', '.env'),
  ];

  for (const filePath of candidates) {
    try {
      raw = await readFile(filePath, 'utf8');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  if (!raw) return values;

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

function validateCommentForStatus(payload) {
  const status = normalizeStatus(payload.status);
  const finalComment = String(payload.final_comment || '').trim();
  const autoComment = String(payload.auto_comment || '').trim();
  if ((status === 'reviewed' || status === 'published') && !finalComment && !autoComment) {
    const error = new Error('reviewed/published status requires a final or draft comment.');
    error.statusCode = 400;
    throw error;
  }
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

  const columns = [
    {
      label: '국내',
      groups: [
        { title: '국내금리', rows: pick(['kr_cd91', 'cd_91d', 'kr_1y', 'kr_3y', 'kr_5y', 'kr_10y', 'kr_30y', 'kr_gov_2y', 'kr_gov_3y', 'kr_gov_5y', 'kr_gov_10y', 'kr_gov_30y']) },
        { title: '국내주식', rows: pick(['kospi', 'kosdaq', 'kospi200']) },
        { title: '크레딧', rows: pick(['kr_aa3y', 'kr_bbb3y', 'kr_corp_aa0_3y', 'credit_spread_aa0_2y']) },
      ],
    },
    {
      label: '해외 금리·주식',
      groups: [
        { title: '해외금리', rows: pick(['us_2y', 'us_5y', 'us_10y', 'us_30y', 'de_10y', 'jp_10y', 'us_treasury_2y', 'us_treasury_10y', 'us_treasury_30y', 'germany_bund_10y', 'japan_gov_10y']) },
        { title: '해외주식', rows: pick(['dow', 'sp500', 'nasdaq', 'dax', 'nikkei', 'nikkei225', 'hangseng_h', 'shanghai', 'shanghai_comp']) },
      ],
    },
    {
      label: '외환·원자재·암호화폐',
      groups: [
        { title: '외환', rows: pick(['usdkrw', 'dxy', 'dollar_index', 'usdjpy', 'eurusd']) },
        { title: '원자재', rows: pick(['wti', 'brent', 'gold', 'silver', 'sox', 'copper']) },
        { title: '암호화폐', rows: pick(['bitcoin', 'btc_usd', 'btc', 'ethereum', 'eth_usd', 'eth']) },
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
        </header>
        <table>
          <thead>
            <tr>
              <th scope="col">지표명</th>
              <th scope="col">값</th>
              <th scope="col">전일 대비</th>
              <th scope="col">전년말 대비</th>
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

      /* Legacy layout aliases */
      --paper: var(--surface);
      --ink: var(--text);
      --line: var(--border);
      --soft: var(--bg);
      --soft-strong: var(--border);
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
    .up { color: var(--up); font-weight: 650; }
    .down { color: var(--down); font-weight: 650; }
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
      .metric-grid,
      #details { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      main { padding-top: 10px; width: min(100% - 20px, 1440px); }
      .report-meta { flex-wrap: wrap; }
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
    </header>

    <section id="commentary" class="comment">
      <h2>Issue</h2>
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

function firstNested(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function mapSupabaseComment(row, status = 'draft') {
  const comment = firstNested(row);
  return {
    auto_comment: comment?.auto_comment || '',
    final_comment: comment?.final_comment || '',
    reference_note: comment?.reference_note || '',
    tags: Array.isArray(comment?.tags) ? comment.tags : [],
    approved_by: comment?.approved_by || '',
    approved_at: comment?.approved_at || null,
    updated_at: comment?.updated_at || null,
    status: normalizeStatus(status),
  };
}

function mapSupabaseObservation(row) {
  return {
    observed_date: row.observed_date,
    category: row.category,
    category_label: categoryLabels[row.category] || row.category,
    metric_key: row.metric_key,
    metric_name: row.metric_name,
    value: toNumber(row.value),
    unit: row.unit || '',
    change_1d: toNumber(row.change_1d),
    change_1d_unit: row.change_1d_unit || '',
    change_ytd: toNumber(row.change_ytd),
    change_ytd_unit: row.change_ytd_unit || '',
    source: row.source || 'infomax',
    source_sheet: row.source_sheet || '',
    source_cell: row.source_cell || '',
    raw_value: row.raw_value || '',
  };
}

function mapSupabaseReportSummary(row) {
  const comment = firstNested(row.report_comments);
  return {
    id: row.id,
    date: row.report_date,
    title: row.title || `Daily Report ${row.report_date}`,
    author: '자금운용본부',
    generated_at: row.created_at || row.updated_at || '',
    observation_count: null,
    status: row.status || 'draft',
    comment_status: row.status || 'draft',
    comment_updated_at: comment?.updated_at || null,
    modified_at: row.updated_at || row.created_at || '',
    file: null,
    source: 'supabase',
  };
}

async function getSupabaseReportSummaries(limit = 500) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));
  const rows = await supabaseRest(
    'GET',
    `reports?select=id,report_date,status,title,created_at,updated_at,published_at,report_comments(auto_comment,final_comment,reference_note,tags,approved_by,approved_at,updated_at)&order=report_date.desc&limit=${safeLimit}`,
  );
  return Array.isArray(rows) ? rows.map(mapSupabaseReportSummary) : [];
}

async function readSupabaseReport(date) {
  const rows = await supabaseRest(
    'GET',
    `reports?select=id,report_date,status,title,created_at,updated_at,published_at,report_comments(auto_comment,final_comment,reference_note,tags,approved_by,approved_at,updated_at)&report_date=eq.${date}&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  const observationRows = await supabaseRest(
    'GET',
    `market_observations?select=observed_date,category,metric_key,metric_name,value,unit,change_1d,change_1d_unit,change_ytd,change_ytd_unit,source,source_sheet,source_cell,raw_value&report_id=eq.${row.id}&order=created_at.asc`,
  );
  const observations = Array.isArray(observationRows) ? observationRows.map(mapSupabaseObservation) : [];
  const comment = mapSupabaseComment(row.report_comments, row.status);
  const report = {
    id: row.id,
    report_date: row.report_date,
    title: row.title || `Daily Report ${row.report_date}`,
    author: '자금운용본부',
    generated_at: row.created_at || row.updated_at || '',
    status: row.status || 'draft',
    observations,
    comment,
    source: 'supabase',
  };

  await mkdir(outputDir, { recursive: true });
  const reviewHtmlPath = path.join(outputDir, `market_daily_${date}.review.html`);
  await writeFile(reviewHtmlPath, buildReviewHtml(report, comment), 'utf8');

  return {
    ...report,
    preview_html: `output/market_daily_${date}.review.html`,
    original_html: `output/market_daily_${date}.html`,
  };
}

async function getReportFiles() {
  try {
    const reports = await getSupabaseReportSummaries();
    if (reports.length > 0) return reports;
  } catch (error) {
    console.warn(`Supabase report list unavailable, falling back to local processed files: ${error.message}`);
  }

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
  let names = [];
  try {
    names = await readdir(processedDir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const matches = names.filter((name) => /^market_daily_\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();

  const reports = [];
  for (const name of matches) {
    const raw = await readFile(path.join(processedDir, name), 'utf8');
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

  try {
    const report = await readSupabaseReport(date);
    if (report) return report;
  } catch (error) {
    console.warn(`Supabase report ${date} unavailable, falling back to local processed file: ${error.message}`);
  }

  const reportPath = path.join(processedDir, `market_daily_${date}.json`);
  let raw;
  try {
    raw = await readFile(reportPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      const notFound = new Error(`Report ${date} not found in Supabase or local cache.`);
      notFound.statusCode = 404;
      throw notFound;
    }
    throw error;
  }
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

async function getReportRowByDate(date) {
  const rows = await supabaseRest(
    'GET',
    `reports?select=id,report_date&report_date=eq.${date}&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function getMetricSeries(metricKey) {
  const cleanMetricKey = String(metricKey || '').trim();
  if (!cleanMetricKey) {
    const error = new Error('metric_key is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const rows = await supabaseRest(
      'GET',
      `market_observations?select=observed_date,category,metric_key,metric_name,value,unit,change_1d,change_1d_unit,change_ytd,change_ytd_unit,reports(report_date)&metric_key=eq.${encodeURIComponent(cleanMetricKey)}&order=observed_date.asc`,
    );
    const points = (Array.isArray(rows) ? rows : []).map((row) => ({
      report_date: row.reports?.report_date || row.observed_date,
      value: toNumber(row.value),
      unit: row.unit,
      change_1d: toNumber(row.change_1d),
      change_1d_unit: row.change_1d_unit,
      change_ytd: toNumber(row.change_ytd),
      change_ytd_unit: row.change_ytd_unit,
    }));

    if (rows?.length) {
      const latest = rows[rows.length - 1];
      return {
        metric_key: cleanMetricKey,
        metric_name: latest.metric_name || cleanMetricKey,
        category_label: categoryLabels[latest.category] || latest.category || '',
        unit: latest.unit || '',
        points,
      };
    }
  } catch (error) {
    console.warn(`Supabase metric series unavailable, falling back to local reports: ${error.message}`);
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

async function getMetricHistory(days = 7) {
  const safeDays = Math.max(1, Math.min(Number(days) || 7, 60));
  try {
    const reports = await getSupabaseReportSummaries(safeDays);
    const reportDates = reports.map((report) => report.date).filter(Boolean);
    if (reportDates.length > 0) {
      const rows = await supabaseRest(
        'GET',
        `market_observations?select=observed_date,category,metric_key,value,unit,change_1d,change_1d_unit,change_ytd,change_ytd_unit,reports!inner(report_date)&reports.report_date=in.(${reportDates.join(',')})&order=observed_date.asc`,
      );
      const history = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!history[row.metric_key]) history[row.metric_key] = [];
        history[row.metric_key].push({
          report_date: row.reports?.report_date || row.observed_date,
          value: toNumber(row.value),
          unit: row.unit,
          change_1d: toNumber(row.change_1d),
          change_1d_unit: row.change_1d_unit,
          change_ytd: toNumber(row.change_ytd),
          change_ytd_unit: row.change_ytd_unit,
        });
      }
      return { history };
    }
  } catch (error) {
    console.warn(`Supabase metric history unavailable, falling back to local reports: ${error.message}`);
  }

  const reports = await readAllReports();
  const recentReports = reports.slice(-safeDays);
  const history = {};

  for (const report of recentReports) {
    for (const item of report.observations || []) {
      if (!history[item.metric_key]) history[item.metric_key] = [];
      history[item.metric_key].push({
        report_date: report.report_date,
        value: item.value,
        unit: item.unit,
        change_1d: item.change_1d,
        change_1d_unit: item.change_1d_unit,
        change_ytd: item.change_ytd,
        change_ytd_unit: item.change_ytd_unit,
      });
    }
  }

  return { history };
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
  return `${item.metric_name}: ${formatNumber(item.value)}${item.unit || ''}, 전일대비 ${formatChangeText(item.change_1d, item.change_1d_unit)}, 작년말대비 ${formatChangeText(item.change_ytd, item.change_ytd_unit)}`;
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
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch (cause) {
    const error = new Error(`Request body is not valid JSON: ${cause.message}`);
    error.statusCode = 400;
    throw error;
  }
}

async function saveComment(date, payload) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }
  validateCommentForStatus(payload);

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

  const report = await readReport(date);
  return {
    report_date: date,
    auto_comment: buildAutoCommentDraft(report, payload.reference_note || ''),
    generated_at: new Date().toISOString(),
  };
}

function normalizeCommentPayload(date, payload) {
  return {
    report_date: date,
    auto_comment: payload.auto_comment || '',
    final_comment: payload.final_comment || '',
    reference_note: payload.reference_note || '',
    tags: Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean) : [],
    approved_by: payload.approved_by || '',
    status: normalizeStatus(payload.status),
    updated_at: new Date().toISOString(),
  };
}

async function updateSupabaseReportComment(date, payload) {
  validateCommentForStatus(payload);

  const row = await getReportRowByDate(date);
  if (!row?.id) return null;

  const normalized = normalizeCommentPayload(date, payload);
  const approvedAt = ['reviewed', 'published'].includes(normalized.status)
    ? new Date().toISOString()
    : null;

  await supabaseRest('POST', 'report_comments?on_conflict=report_id', [{
    report_id: row.id,
    auto_comment: normalized.auto_comment || null,
    final_comment: normalized.final_comment || null,
    reference_note: normalized.reference_note || null,
    tags: normalized.tags,
    approved_by: normalized.approved_by || null,
    approved_at: approvedAt,
  }]);

  await supabaseRest('PATCH', `reports?id=eq.${row.id}`, {
    status: normalized.status,
    published_at: normalized.status === 'published' ? new Date().toISOString() : null,
  });

  const report = await readSupabaseReport(date);
  return {
    comment: normalized,
    sql: buildCommentSql(date, normalized),
    sql_file: null,
    comment_file: null,
    review_html: report?.preview_html || null,
    supabase: {
      uploaded: true,
      report_id: row.id,
      report_date: date,
      observation_count: report?.observations?.length || 0,
      status: normalized.status,
    },
  };
}

async function uploadReportToSupabase(date, payload) {
  const updatedExisting = await updateSupabaseReportComment(date, payload);
  if (updatedExisting) return updatedExisting;

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

async function validateReport(date) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date.');
    error.statusCode = 400;
    throw error;
  }

  const python = resolvePython();
  const scriptPath = path.join(projectRoot, 'scripts', 'validate_daily_data.py');
  const args = [
    scriptPath,
    '--project-root',
    projectRoot,
    '--report-date',
    date,
    '--cross-check',
  ];

  try {
    const { stdout } = await execFileAsync(python, args, {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    });
    return await attachValidationApprovals(date, parseJson(stdout));
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : '';
    if (stdout.trim()) {
      try {
        return await attachValidationApprovals(date, parseJson(stdout));
      } catch {
        // Fall through to the process error below.
      }
    }

    const stderr = error.stderr ? String(error.stderr).trim() : '';
    const wrapped = new Error(stderr || error.message || 'Validation failed.');
    wrapped.statusCode = 500;
    throw wrapped;
  }
}

async function getValidationApprovals(date) {
  const report = await getReportRowByDate(date);
  if (!report?.id) return [];

  const rows = await supabaseRest(
    'GET',
    `validation_approvals?select=id,report_id,metric_key,metric_name,source,symbol,db_value,external_value,reason,approved_by,approved_at&report_id=eq.${report.id}&order=approved_at.desc`,
  );
  return Array.isArray(rows) ? rows : [];
}

async function attachValidationApprovals(date, result) {
  try {
    const approvals = await getValidationApprovals(date);
    const byMetric = new Map(approvals.map((approval) => [approval.metric_key, approval]));
    const crossChecks = (result.cross_checks || []).map((check) => {
      const approval = byMetric.get(check.metric_key);
      return approval ? { ...check, approval, approved: true } : check;
    });

    return {
      ...result,
      approvals,
      cross_checks: crossChecks,
    };
  } catch (error) {
    return {
      ...result,
      approvals: [],
      warnings: [
        ...(result.warnings || []),
        `Validation approval history unavailable: ${error.message}`,
      ],
    };
  }
}

async function approveValidation(date, payload = {}) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date.');
    error.statusCode = 400;
    throw error;
  }

  const metricKey = String(payload.metric_key || '').trim();
  if (!metricKey) {
    const error = new Error('metric_key is required.');
    error.statusCode = 400;
    throw error;
  }

  const report = await getReportRowByDate(date);
  if (!report?.id) {
    const error = new Error(`Supabase report row missing for ${date}.`);
    error.statusCode = 404;
    throw error;
  }

  const row = {
    report_id: report.id,
    metric_key: metricKey,
    metric_name: payload.metric_name || null,
    source: payload.source || 'Yahoo Finance',
    symbol: payload.symbol || null,
    db_value: payload.db_value ?? null,
    external_value: payload.external_value ?? null,
    reason: payload.reason || '운영자가 검증 차이를 확인하고 DB 값을 승인했습니다.',
    approved_by: payload.approved_by || null,
    approved_at: new Date().toISOString(),
  };

  const rows = await supabaseRest(
    'POST',
    'validation_approvals?on_conflict=report_id,metric_key,source',
    [row],
  );

  return {
    approval: Array.isArray(rows) ? rows[0] : rows,
  };
}

async function getJobRuns(limit = 25) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const rows = await supabaseRest(
    'GET',
    `job_runs?select=id,job_name,status,started_at,finished_at,report_from,report_until,uploaded_reports,uploaded_observations,message,log_path&order=started_at.desc&limit=${safeLimit}`,
  );

  return {
    job_runs: Array.isArray(rows) ? rows : [],
  };
}

function summarizeJobLog(job, content) {
  const text = `${job.message || ''}\n${content || ''}`;
  const lower = text.toLowerCase();
  const uploadedMatch = text.match(/"uploaded_reports"\s*:\s*(\d+)\s*,\s*"uploaded_observations"\s*:\s*(\d+)/);
  const reportsMatch = text.match(/"reports"\s*:\s*(\d+)\s*,\s*"from"\s*:\s*"([^"]+)"\s*,\s*"until"\s*:\s*"([^"]+)"/);
  const freshnessMatch = text.match(/Latest generated report date:\s*(\d{4}-\d{2}-\d{2});\s*requested until:\s*(\d{4}-\d{2}-\d{2})/);
  const validationPass = /"status"\s*:\s*"pass"/.test(text) && /"errors"\s*:\s*\[\]/.test(text);

  if (job.status === 'success') {
    const details = [];
    if (reportsMatch) details.push(`처리 기간: ${reportsMatch[2]} ~ ${reportsMatch[3]}`);
    if (uploadedMatch) details.push(`DB 업로드: 리포트 ${uploadedMatch[1]}건, 지표 ${uploadedMatch[2]}건`);
    if (validationPass) details.push('검증 결과: 통과');
    if (freshnessMatch) details.push(`최신 생성일: ${freshnessMatch[1]} / 요청 종료일: ${freshnessMatch[2]}`);

    if (freshnessMatch && freshnessMatch[1] < freshnessMatch[2]) {
      return {
        level: 'warn',
        title: '자동화는 완료됐지만 최신 보고서 날짜 확인이 필요합니다.',
        message: `요청 종료일은 ${freshnessMatch[2]}였지만 실제 생성된 최신 보고서는 ${freshnessMatch[1]}입니다. 엑셀 원본에 해당 날짜의 유효한 행이 완성됐는지 확인해야 합니다.`,
        actions: [
          'MARKET DAILY.xlsm에서 최신 기준일 행이 채워졌는지 확인',
          'Admin 데이터/검증 화면에서 최신 보고서 날짜 확인',
          '엑셀 데이터가 완성된 뒤 Admin 자동화 로그에서 재실행',
        ],
        details,
      };
    }

    return {
      level: 'success',
      title: '자동화가 정상 완료됐습니다.',
      message: '추가 조치가 필요 없습니다. Admin의 데이터/검증 화면에서 결과만 확인하면 됩니다.',
      actions: ['데이터 탭에서 주요 지표가 보이는지 확인', '검증 탭에서 차이 항목이 있는지 확인'],
      details,
    };
  }

  if (text.includes('RPC_E_CALL_REJECTED') || text.includes('Call was rejected by callee')) {
    return {
      level: 'error',
      title: 'Excel이 응답하지 않아 자동화가 실패했습니다.',
      message: 'Infomax Excel 파일을 새로고침하거나 저장하는 중 Excel이 다른 작업으로 바빠서 명령을 거절했습니다.',
      actions: [
        '열려 있는 Excel 창을 모두 저장 후 종료',
        '작업 관리자에서 남은 EXCEL.EXE가 있으면 종료',
        'Admin 또는 수동 명령으로 자동화를 다시 실행',
      ],
      details: ['실패 위치: Excel 저장/종료 단계', '기술 오류: RPC_E_CALL_REJECTED'],
    };
  }

  if (lower.includes('pre-upload data validation failed') || lower.includes('upload was blocked')) {
    return {
      level: 'warn',
      title: '업로드 전 데이터 검증에서 막혔습니다.',
      message: 'DB 연결 문제가 아니라, 업로드 전 필수 검증에서 문제가 발견되어 Supabase 업로드를 중단한 상태입니다.',
      actions: [
        'Admin 검증 탭에서 같은 날짜의 차이 항목 확인',
        '필수 지표 누락 또는 비정상 숫자가 있는지 확인',
        '문제를 수정한 뒤 같은 날짜로 재실행',
      ],
      details: ['실패 위치: 업로드 전 검증', '결과: Supabase 업로드 차단'],
    };
  }

  if (lower.includes('validation') || text.includes('"status": "fail"')) {
    return {
      level: 'warn',
      title: '데이터 검증 단계에서 확인이 필요합니다.',
      message: '엑셀에서 추출한 값과 검증 기준이 맞지 않거나 필수 데이터가 누락됐을 수 있습니다.',
      actions: ['Admin 검증 탭에서 차이 항목 확인', '엑셀 원본 값 확인', '문제가 없으면 운영 기준으로 승인'],
      details: [],
    };
  }

  if (lower.includes('supabase')) {
    return {
      level: 'error',
      title: 'Supabase 업로드 또는 조회 단계에서 실패했습니다.',
      message: 'DB 연결 정보, 네트워크, 테이블 권한 중 하나를 확인해야 합니다.',
      actions: ['인터넷 연결 확인', '.env의 Supabase URL/key 확인', '잠시 후 같은 날짜로 재실행'],
      details: [],
    };
  }

  return {
    level: job.status === 'failed' ? 'error' : 'warn',
    title: job.status === 'failed' ? '자동화가 실패했습니다.' : '자동화 로그 확인이 필요합니다.',
    message: job.message || '로그 원문을 확인해 원인을 판단해야 합니다.',
    actions: ['로그 원문 마지막 20줄 확인', '엑셀과 네트워크 상태 확인', '같은 조건으로 한 번 재실행'],
    details: [],
  };
}

async function getJobRunLog(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    const error = new Error('Invalid job run id.');
    error.statusCode = 400;
    throw error;
  }

  const rows = await supabaseRest(
    'GET',
    `job_runs?select=id,job_name,status,started_at,message,log_path&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const job = Array.isArray(rows) ? rows[0] : null;
  if (!job) {
    const error = new Error('Job run not found.');
    error.statusCode = 404;
    throw error;
  }

  const unavailable = (reason, message, actions = []) => ({
    job,
    log_available: false,
    soft_failure: true,
    reason,
    summary: {
      level: job.status === 'success' ? 'warn' : 'error',
      title: '로그 파일을 이 PC에서 열 수 없습니다.',
      message,
      actions: actions.length > 0 ? actions : [
        '자동화가 실행된 PC에서 Admin을 열어 로그 보기',
        '현재 화면의 상태와 메시지를 기준으로 원인 먼저 확인',
        '필요하면 같은 날짜로 수동 재실행',
      ],
      details: job.log_path ? [`기록된 로그 경로: ${job.log_path}`] : [],
    },
    content: message,
  });

  if (!job.log_path) {
    return unavailable('missing_log_path', '이 자동화 실행에는 로그 파일 경로가 기록되어 있지 않습니다.');
  }

  const resolved = path.resolve(job.log_path);
  const allowed = resolved.startsWith(path.resolve(logsDir) + path.sep);
  if (!allowed) {
    return unavailable('outside_local_logs_dir', '이 로그는 현재 PC의 data/logs 폴더 밖 경로를 가리킵니다. 집/회사 PC가 다르거나 자동화가 다른 작업 폴더에서 실행된 경우입니다.');
  }

  let content;
  try {
    content = await readFile(resolved, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return unavailable('log_file_missing', '로그 경로는 이 프로젝트 안에 있지만 파일이 현재 PC에 없습니다. generated/log 파일이 PC 간 동기화되지 않은 상태일 수 있습니다.');
    }
    throw error;
  }

  return {
    job,
    log_available: true,
    soft_failure: false,
    reason: null,
    summary: summarizeJobLog(job, content),
    content,
  };
}

function retryModeForJob(job) {
  const message = String(job.message || '').toLowerCase();
  if (message.includes('workbook') || message.includes('json extraction') || message.includes('no report json')) {
    return 'full';
  }
  return 'upload_only';
}

async function recordJobRunStatus(runId, status, payload = {}) {
  const now = new Date().toISOString();
  const row = {
    id: runId,
    job_name: 'Market Daily Supabase Upload',
    status,
    message: payload.message || null,
    log_path: payload.log_path || null,
    report_from: payload.report_from || null,
    report_until: payload.report_until || null,
  };

  if (status === 'started') {
    row.started_at = now;
  } else {
    row.finished_at = now;
  }

  await supabaseRest('POST', 'job_runs?on_conflict=id', [row]);
}

async function markJobRunFailedIfStillStarted(runId, payload = {}) {
  await supabaseRest(
    'PATCH',
    `job_runs?id=eq.${encodeURIComponent(runId)}&status=eq.started`,
    {
      status: 'failed',
      finished_at: new Date().toISOString(),
      message: payload.message || 'Admin rerun process exited before recording a final result.',
      log_path: payload.log_path || null,
    },
  );
}

async function startSelectedJobRerun(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    const error = new Error('Invalid job run id.');
    error.statusCode = 400;
    throw error;
  }

  const rows = await supabaseRest(
    'GET',
    `job_runs?select=id,job_name,status,started_at,report_from,report_until,message&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const job = Array.isArray(rows) ? rows[0] : null;
  if (!job) {
    const error = new Error('Job run not found.');
    error.statusCode = 404;
    throw error;
  }
  if (job.status !== 'failed' && job.status !== 'error') {
    const error = new Error('Only failed job runs can be rerun from this screen.');
    error.statusCode = 400;
    throw error;
  }

  const mode = retryModeForJob(job);
  const scriptPath = path.join(projectRoot, 'scripts', 'Run-DailyMarketUpdate.ps1');
  await mkdir(logsDir, { recursive: true });
  const runId = randomUUID();
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const logPath = path.join(logsDir, `admin_rerun_${timestamp}_${runId.slice(0, 8)}.log`);
  const startedMessage = mode === 'upload_only'
    ? 'Admin selected rerun started. Excel refresh is skipped; validation and upload will run.'
    : 'Admin selected rerun started. Excel refresh is included.';

  await writeFile(
    logPath,
    [
      'Admin selected rerun',
      `Source job: ${job.id}`,
      `Mode: ${mode}`,
      `Period: ${job.report_from || '-'} ~ ${job.report_until || '-'}`,
      `Started: ${new Date().toISOString()}`,
      '',
    ].join('\n'),
    'utf8',
  );

  await recordJobRunStatus(runId, 'started', {
    message: startedMessage,
    log_path: logPath,
    report_from: job.report_from,
    report_until: job.report_until,
  });

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-RunId',
    runId,
    '-LogPath',
    logPath,
    '-ProjectRoot',
    projectRoot,
  ];

  if (job.report_from) {
    args.push('-FromDate', job.report_from);
  }
  if (job.report_until) {
    args.push('-UntilDate', job.report_until);
  }
  if (mode === 'upload_only') {
    args.push('-SkipRefresh');
  } else {
    args.push('-Visible');
  }

  const child = spawn('powershell.exe', args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const logStream = createWriteStream(logPath, { flags: 'a' });
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  child.once('error', async (error) => {
    logStream.write(`\nAdmin rerun spawn failed: ${error.message}\n`);
    logStream.end();
    try {
      await recordJobRunStatus(runId, 'failed', {
        message: `Admin rerun spawn failed: ${error.message}`,
        log_path: logPath,
        report_from: job.report_from,
        report_until: job.report_until,
      });
    } catch {
      // The local log file still captures this failure when Supabase is unavailable.
    }
  });
  child.once('close', async (code, signal) => {
    logStream.write(`\nAdmin rerun process closed. exit_code=${code ?? '-'} signal=${signal || '-'}\n`);
    logStream.end();
    if (code && code !== 0) {
      try {
        await markJobRunFailedIfStillStarted(runId, {
          message: `Admin rerun process exited with code ${code}. Open the log for details.`,
          log_path: logPath,
        });
      } catch {
        // The child process log remains the source of truth if Supabase is unavailable.
      }
    }
  });

  return {
    started: true,
    run_id: runId,
    source_job_id: job.id,
    mode,
    report_from: job.report_from,
    report_until: job.report_until,
    log_path: logPath,
    message: mode === 'upload_only'
      ? '선택한 실패 건의 데이터 검증/DB 업로드 재실행을 시작했습니다.'
      : '선택한 실패 건의 Excel 새로고침 포함 재실행을 시작했습니다.',
  };
}

async function serveStatic(res, requestPath) {
  let filePath;

  if (requestPath === '/' || requestPath === '/admin') {
    filePath = path.join(__dirname, 'index.html');
  } else if (requestPath === '/report') {
    filePath = path.join(reportDir, 'index.html');
  } else if (requestPath === '/reports' || requestPath === '/archive') {
    filePath = path.join(__dirname, 'archive.html');
  } else if (requestPath.startsWith('/admin/')) {
    filePath = path.join(__dirname, requestPath.replace('/admin/', ''));
  } else if (requestPath.startsWith('/report/')) {
    filePath = path.join(reportDir, requestPath.replace('/report/', ''));
  } else if (requestPath.startsWith('/output/')) {
    filePath = path.join(projectRoot, requestPath.slice(1));
  } else {
    return false;
  }

  const resolved = path.resolve(filePath);
  const allowedAdmin = resolved.startsWith(__dirname);
  const allowedReport = resolved.startsWith(reportDir);
  const allowedOutput = resolved.startsWith(outputDir);

  if (!allowedAdmin && !allowedReport && !allowedOutput) {
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

    if (req.method === 'GET' && requestPath === '/api/job-runs') {
      sendJson(res, 200, await getJobRuns(url.searchParams.get('limit')));
      return;
    }

    const jobRunRerunMatch = requestPath.match(/^\/api\/job-runs\/([^/]+)\/rerun$/);
    if (req.method === 'POST' && jobRunRerunMatch) {
      sendJson(res, 200, await startSelectedJobRerun(decodeURIComponent(jobRunRerunMatch[1])));
      return;
    }

    const jobRunLogMatch = requestPath.match(/^\/api\/job-runs\/([^/]+)\/log$/);
    if (req.method === 'GET' && jobRunLogMatch) {
      sendJson(res, 200, await getJobRunLog(decodeURIComponent(jobRunLogMatch[1])));
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

    if (req.method === 'GET' && requestPath === '/api/history') {
      sendJson(res, 200, await getMetricHistory(url.searchParams.get('days')));
      return;
    }

    const reportMatch = requestPath.match(/^\/api\/reports\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'GET' && reportMatch) {
      sendJson(res, 200, await readReport(reportMatch[1]));
      return;
    }

    const validationMatch = requestPath.match(/^\/api\/validation\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'GET' && validationMatch) {
      sendJson(res, 200, await validateReport(validationMatch[1]));
      return;
    }

    const validationApprovalMatch = requestPath.match(/^\/api\/validation\/(\d{4}-\d{2}-\d{2})\/approvals$/);
    if (req.method === 'POST' && validationApprovalMatch) {
      const body = await readBody(req);
      sendJson(res, 200, await approveValidation(validationApprovalMatch[1], body));
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
