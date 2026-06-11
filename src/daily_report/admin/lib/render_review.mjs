import path from 'node:path';

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

export {
  categoryLabels,
  escapeHtml,
  formatNumber,
  formatChange,
  formatChangeText,
  directionText,
  formatDateKo,
  formatDateTimeKo,
  textToParagraphs,
  getMetric,
  describeMetric,
  buildAutoCommentDraft,
  buildReviewHtml,
};
