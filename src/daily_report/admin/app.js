const state = {
  reports: [],
  currentDate: null,
  currentReport: null,
  currentCategory: 'all',
};

const els = {
  reportList: document.querySelector('#reportList'),
  reportTitle: document.querySelector('#reportTitle'),
  previewLink: document.querySelector('#previewLink'),
  refreshButton: document.querySelector('#refreshButton'),
  summaryDate: document.querySelector('#summaryDate'),
  summaryCount: document.querySelector('#summaryCount'),
  summaryGenerated: document.querySelector('#summaryGenerated'),
  summaryStatus: document.querySelector('#summaryStatus'),
  categoryTabs: document.querySelector('#categoryTabs'),
  metricRows: document.querySelector('#metricRows'),
  statusInput: document.querySelector('#statusInput'),
  autoCommentInput: document.querySelector('#autoCommentInput'),
  referenceInput: document.querySelector('#referenceInput'),
  finalCommentInput: document.querySelector('#finalCommentInput'),
  tagsInput: document.querySelector('#tagsInput'),
  approvedByInput: document.querySelector('#approvedByInput'),
  saveButton: document.querySelector('#saveButton'),
  saveMessage: document.querySelector('#saveMessage'),
  sqlOutput: document.querySelector('#sqlOutput'),
};

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  if (Math.abs(number) >= 1000) {
    return number.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  return number.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatChange(value, unit) {
  if (value === null || value === undefined || value === '') {
    return '<span class="change flat">-</span>';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `<span class="change flat">${escapeHtml(value)}</span>`;
  }

  const className = number > 0 ? 'up' : number < 0 ? 'down' : 'flat';
  const sign = number > 0 ? '+' : '';
  return `<span class="change ${className}">${sign}${formatNumber(number)}${escapeHtml(unit || '')}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '요청에 실패했습니다.');
  }
  return data;
}

function renderReportList() {
  if (state.reports.length === 0) {
    els.reportList.innerHTML = '<div class="empty-state">리포트 없음</div>';
    return;
  }

  els.reportList.innerHTML = state.reports.map((report) => `
    <button class="report-item ${report.date === state.currentDate ? 'active' : ''}" type="button" data-date="${escapeHtml(report.date)}">
      <strong>${escapeHtml(report.date)}</strong>
      <span>${escapeHtml(report.observation_count)}개 지표</span>
    </button>
  `).join('');

  els.reportList.querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => loadReport(button.dataset.date));
  });
}

function categoriesFor(report) {
  const map = new Map();
  for (const item of report.observations || []) {
    if (!map.has(item.category)) {
      map.set(item.category, item.category_label || item.category);
    }
  }
  return [['all', '전체'], ...map.entries()];
}

function renderCategoryTabs() {
  const categories = categoriesFor(state.currentReport || {});
  els.categoryTabs.innerHTML = categories.map(([key, label]) => `
    <button class="category-tab ${key === state.currentCategory ? 'active' : ''}" type="button" data-category="${escapeHtml(key)}">
      ${escapeHtml(label)}
    </button>
  `).join('');

  els.categoryTabs.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentCategory = button.dataset.category;
      renderCategoryTabs();
      renderMetrics();
    });
  });
}

function renderMetrics() {
  const report = state.currentReport;
  if (!report) return;

  const rows = (report.observations || [])
    .filter((item) => state.currentCategory === 'all' || item.category === state.currentCategory);

  if (rows.length === 0) {
    els.metricRows.innerHTML = '<tr><td colspan="5" class="empty-state">표시할 데이터 없음</td></tr>';
    return;
  }

  els.metricRows.innerHTML = rows.map((item) => `
    <tr>
      <td>
        <div class="metric-name">
          <strong>${escapeHtml(item.metric_name)}</strong>
          <span>${escapeHtml(item.category_label || item.category)}</span>
        </div>
      </td>
      <td class="value-cell">${formatNumber(item.value)} ${escapeHtml(item.unit || '')}</td>
      <td>${formatChange(item.change_1d, item.change_1d_unit)}</td>
      <td>${formatChange(item.change_ytd, item.change_ytd_unit)}</td>
      <td class="source-cell">${escapeHtml(item.source_sheet || '-')}${item.source_cell ? ` ${escapeHtml(item.source_cell)}` : ''}</td>
    </tr>
  `).join('');
}

function setCommentForm(comment) {
  els.autoCommentInput.value = comment?.auto_comment || '';
  els.referenceInput.value = comment?.reference_note || '';
  els.finalCommentInput.value = comment?.final_comment || '';
  els.tagsInput.value = Array.isArray(comment?.tags) ? comment.tags.join(', ') : '';
  els.approvedByInput.value = comment?.approved_by || '자금운용본부';
  els.statusInput.value = comment?.status || 'draft';
  els.sqlOutput.value = '';
  els.saveMessage.textContent = '';
  els.saveMessage.className = 'save-message';
}

function renderReport() {
  const report = state.currentReport;
  if (!report) return;

  els.reportTitle.textContent = report.title || `Daily Report ${report.report_date}`;
  els.summaryDate.textContent = report.report_date || '-';
  els.summaryCount.textContent = String((report.observations || []).length);
  els.summaryGenerated.textContent = formatDateTime(report.generated_at);
  els.summaryStatus.textContent = report.comment?.status || 'draft';
  els.previewLink.href = `/${report.preview_html}`;

  setCommentForm(report.comment);
  renderReportList();
  renderCategoryTabs();
  renderMetrics();
}

async function loadReports() {
  const data = await fetchJson('/api/reports');
  state.reports = data.reports || [];
  state.currentDate = state.currentDate || state.reports[0]?.date || null;
  renderReportList();

  if (state.currentDate) {
    await loadReport(state.currentDate);
  } else {
    els.reportTitle.textContent = '리포트 없음';
  }
}

async function loadReport(date) {
  state.currentDate = date;
  state.currentCategory = 'all';
  state.currentReport = await fetchJson(`/api/reports/${date}`);
  renderReport();
}

function getCommentPayload() {
  return {
    auto_comment: els.autoCommentInput.value.trim(),
    reference_note: els.referenceInput.value.trim(),
    final_comment: els.finalCommentInput.value.trim(),
    tags: els.tagsInput.value.split(',').map((item) => item.trim()).filter(Boolean),
    approved_by: els.approvedByInput.value.trim(),
    status: els.statusInput.value,
  };
}

async function saveComment() {
  if (!state.currentDate) return;

  els.saveButton.disabled = true;
  els.saveMessage.textContent = '저장 중';
  els.saveMessage.className = 'save-message';

  try {
    const result = await fetchJson(`/api/comments/${state.currentDate}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(getCommentPayload()),
    });

    state.currentReport.comment = result.comment;
    els.summaryStatus.textContent = result.comment.status;
    els.sqlOutput.value = result.sql;
    els.saveMessage.textContent = `${result.comment_file} 저장, ${result.sql_file} 생성`;
    els.saveMessage.className = 'save-message ok';
  } catch (error) {
    els.saveMessage.textContent = error.message;
    els.saveMessage.className = 'save-message error';
  } finally {
    els.saveButton.disabled = false;
  }
}

els.refreshButton.addEventListener('click', () => loadReports());
els.saveButton.addEventListener('click', saveComment);

loadReports().catch((error) => {
  els.reportTitle.textContent = '관리자 화면 오류';
  els.metricRows.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
});
