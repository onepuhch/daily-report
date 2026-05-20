const state = {
  reports: [],
  currentDate: null,
  currentReport: null,
  currentCategory: 'all',
  currentView: 'data',
  validationResult: null,
  jobRuns: [],
  selectedJobRunId: null,
};

const els = {
  reportSelect: document.querySelector('#reportSelect'),
  dailyReportMenuButton: document.querySelector('#dailyReportMenuButton'),
  jobRunsMenuButton: document.querySelector('#jobRunsMenuButton'),
  reportTitle: document.querySelector('#reportTitle'),
  refreshButton: document.querySelector('#refreshButton'),
  summaryStrip: document.querySelector('#summaryStrip'),
  workspaceTabs: document.querySelector('#workspaceTabs'),
  summaryGenerated: document.querySelector('#summaryGenerated'),
  summaryStatus: document.querySelector('#summaryStatus'),
  categoryTabs: document.querySelector('#categoryTabs'),
  metricRows: document.querySelector('#metricRows'),
  statusInput: document.querySelector('#statusInput'),
  autoCommentInput: document.querySelector('#autoCommentInput'),
  referenceInput: document.querySelector('#referenceInput'),
  finalCommentInput: document.querySelector('#finalCommentInput'),
  draftButton: document.querySelector('#draftButton'),
  uploadButton: document.querySelector('#uploadButton'),
  saveMessage: document.querySelector('#saveMessage'),
  dataView: document.querySelector('#dataView'),
  previewView: document.querySelector('#previewView'),
  previewFrame: document.querySelector('#previewFrame'),
  previewOpenLink: document.querySelector('#previewOpenLink'),
  commentView: document.querySelector('#commentView'),
  validationView: document.querySelector('#validationView'),
  jobsView: document.querySelector('#jobsView'),
  viewTabs: document.querySelectorAll('.workspace-tab'),
  runValidationButton: document.querySelector('#runValidationButton'),
  validationSummary: document.querySelector('#validationSummary'),
  validationRows: document.querySelector('#validationRows'),
  validationMessages: document.querySelector('#validationMessages'),
  reloadJobsButton: document.querySelector('#reloadJobsButton'),
  rerunSelectedButton: document.querySelector('#rerunSelectedButton'),
  jobsSummary: document.querySelector('#jobsSummary'),
  jobRows: document.querySelector('#jobRows'),
  logModal: document.querySelector('#logModal'),
  logModalTitle: document.querySelector('#logModalTitle'),
  logModalMeta: document.querySelector('#logModalMeta'),
  logModalPath: document.querySelector('#logModalPath'),
  logModalSummary: document.querySelector('#logModalSummary'),
  logModalContent: document.querySelector('#logModalContent'),
  closeLogModalButton: document.querySelector('#closeLogModalButton'),
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

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '요청에 실패했습니다.');
  }
  return data;
}

function renderReportPicker() {
  if (state.reports.length === 0) {
    els.reportSelect.innerHTML = '<option value="">리포트 없음</option>';
    els.reportSelect.disabled = true;
    return;
  }

  els.reportSelect.disabled = false;
  els.reportSelect.innerHTML = state.reports.map((report) => `
    <option value="${escapeHtml(report.date)}" ${report.date === state.currentDate ? 'selected' : ''}>
      ${escapeHtml(report.date)}
    </option>
  `).join('');
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
    els.metricRows.innerHTML = '<tr><td colspan="4" class="empty-state">표시할 데이터가 없습니다.</td></tr>';
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
    </tr>
  `).join('');
}

function setCommentForm(comment) {
  els.autoCommentInput.value = comment?.auto_comment || '';
  els.referenceInput.value = comment?.reference_note || '';
  els.finalCommentInput.value = comment?.final_comment || '';
  els.statusInput.value = comment?.status || 'draft';
  els.saveMessage.textContent = '';
  els.saveMessage.className = 'save-message';
}

function renderReport() {
  const report = state.currentReport;
  if (!report) return;

  els.reportTitle.textContent = report.title || `Daily Report ${report.report_date}`;
  els.summaryGenerated.textContent = formatDateTime(report.generated_at);
  els.summaryStatus.textContent = report.comment?.status || 'draft';
  const previewUrl = `/${report.preview_html}`;
  els.previewFrame.src = previewUrl;
  els.previewOpenLink.href = previewUrl;

  setCommentForm(report.comment);
  renderReportPicker();
  renderCategoryTabs();
  renderMetrics();
  clearValidation();
}

function setView(view) {
  state.currentView = view;
  const isData = view === 'data';
  const isPreview = view === 'preview';
  const isComment = view === 'comment';
  const isValidation = view === 'validation';
  const isJobs = view === 'jobs';
  els.dataView.hidden = !isData;
  els.previewView.hidden = !isPreview;
  els.commentView.hidden = !isComment;
  els.validationView.hidden = !isValidation;
  els.jobsView.hidden = !isJobs;
  els.dataView.classList.toggle('active', isData);
  els.previewView.classList.toggle('active', isPreview);
  els.commentView.classList.toggle('active', isComment);
  els.validationView.classList.toggle('active', isValidation);
  els.jobsView.classList.toggle('active', isJobs);
  els.viewTabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  els.dailyReportMenuButton.classList.toggle('active', !isJobs);
  els.jobRunsMenuButton.classList.toggle('active', isJobs);
  document.body.classList.toggle('jobs-mode', isJobs);
  els.summaryStrip.hidden = isJobs;
  els.workspaceTabs.hidden = isJobs;

  if (isJobs) {
    els.reportTitle.textContent = '자동화 로그';
  } else if (state.currentReport) {
    els.reportTitle.textContent = state.currentReport.title || `Daily Report ${state.currentReport.report_date}`;
  }

  if (isJobs) {
    loadJobRuns();
  }
}

function clearValidation() {
  state.validationResult = null;
  els.validationSummary.className = 'validation-summary empty-state';
  els.validationSummary.textContent = '검증 실행 버튼을 누르면 현재 선택한 날짜의 Supabase 반영 여부와 Yahoo Finance 대조 결과가 표시됩니다.';
  els.validationRows.innerHTML = '';
  els.validationMessages.innerHTML = '';
}

function renderValidationMessages(result) {
  const blocks = [];
  if (result.errors?.length) {
    blocks.push(`
      <div class="validation-message error">
        <strong>Errors</strong>
        <ul>${result.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
    `);
  }
  if (result.warnings?.length) {
    blocks.push(`
      <div class="validation-message warn">
        <strong>Warnings</strong>
        <ul>${result.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
    `);
  }
  if (result.approvals?.length) {
    blocks.push(`
      <div class="validation-message approval">
        <strong>승인 이력</strong>
        <ul>${result.approvals.map((item) => `
          <li>${escapeHtml(item.metric_name || item.metric_key)} · ${escapeHtml(formatDateTime(item.approved_at))} · ${escapeHtml(item.reason || '승인')}</li>
        `).join('')}</ul>
      </div>
    `);
  }
  els.validationMessages.innerHTML = blocks.join('');
}

function renderValidation(result) {
  const checks = result.cross_checks || [];
  const failed = checks.filter((item) => !item.passed && !item.approved).length;
  const approved = checks.filter((item) => item.approved).length;
  const warnings = result.warnings?.length || 0;
  const errors = result.errors?.length || 0;
  const summaryClass = errors > 0 ? 'error' : result.status === 'pass' && failed === 0 ? 'ok' : 'warn';
  const summaryText = errors > 0 ? '실패' : failed > 0 ? '차이 확인 필요' : '통과';

  els.validationSummary.className = `validation-summary ${summaryClass}`;
  els.validationSummary.innerHTML = `
    <strong>${escapeHtml(result.report_date)} 검증 ${summaryText}</strong>
    <span>Yahoo Finance 대조 완료 · 차이 ${failed}개 · 승인 ${approved}개 · 경고 ${warnings}개 · 오류 ${errors}개</span>
  `;

  if (!checks.length) {
    els.validationRows.innerHTML = '<tr><td colspan="7" class="empty-state">표시할 외부 검증 결과가 없습니다.</td></tr>';
  } else {
    els.validationRows.innerHTML = checks.map((item) => `
      <tr class="${item.passed || item.approved ? '' : 'validation-failed'}">
        <td>${escapeHtml(item.name || item.metric_key)}</td>
        <td>${escapeHtml(item.symbol || '-')}</td>
        <td class="value-cell">${formatNumber(item.local)}</td>
        <td class="value-cell">${formatNumber(item.external)}</td>
        <td>${renderValidationStatus(item)}</td>
        <td>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Yahoo</a>` : '-'}</td>
        <td>${renderApprovalAction(item)}</td>
      </tr>
    `).join('');

    els.validationRows.querySelectorAll('[data-approve-metric]').forEach((button) => {
      button.addEventListener('click', () => approveValidation(button.dataset.approveMetric));
    });
  }

  renderValidationMessages(result);
}

function renderValidationStatus(item) {
  if (item.approved) {
    return '<span class="status-pill approved">승인됨</span>';
  }
  return `<span class="status-pill ${item.passed ? 'pass' : 'warn'}">${item.passed ? '일치' : '차이 있음'}</span>`;
}

function renderApprovalAction(item) {
  if (item.passed) return '-';
  if (item.approved) {
    return `<span class="approval-note">${escapeHtml(formatDateTime(item.approval?.approved_at))}</span>`;
  }
  return `<button class="button micro" type="button" data-approve-metric="${escapeHtml(item.metric_key)}">우리 값 승인</button>`;
}

async function approveValidation(metricKey) {
  if (!state.currentDate || !state.validationResult) return;
  const item = (state.validationResult.cross_checks || []).find((check) => check.metric_key === metricKey);
  if (!item) return;

  const reason = window.prompt(
    `${item.name || item.metric_key} 차이를 승인할까요?`,
    'Yahoo와 차이가 있지만 Infomax/DB 값을 운영 기준으로 승인합니다.',
  );
  if (reason === null) return;

  try {
    await fetchJson(`/api/validation/${state.currentDate}/approvals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        metric_key: item.metric_key,
        metric_name: item.name || item.metric_key,
        source: item.source || 'Yahoo Finance',
        symbol: item.symbol || null,
        db_value: item.local,
        external_value: item.external,
        reason: reason.trim(),
      }),
    });
    await runValidation();
  } catch (error) {
    els.validationSummary.className = 'validation-summary error';
    els.validationSummary.textContent = `승인 저장 실패: ${error.message}`;
  }
}

function formatJobPeriod(job) {
  if (!job.report_from && !job.report_until) return '-';
  if (job.report_from === job.report_until) return job.report_from;
  return `${job.report_from || '-'} ~ ${job.report_until || '-'}`;
}

function formatUploadCounts(job) {
  const reports = job.uploaded_reports ?? '-';
  const observations = job.uploaded_observations ?? '-';
  return `리포트 ${reports} / 지표 ${observations}`;
}

function isRerunnableJob(job) {
  return job.status === 'failed' || job.status === 'error';
}

function renderLogSummary(summary) {
  if (!summary) {
    return '<div class="log-summary-card warn"><strong>요약을 생성하지 못했습니다.</strong></div>';
  }
  const actions = summary.actions?.length
    ? `<ol>${summary.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`
    : '';
  const details = summary.details?.length
    ? `<div class="log-summary-details">${summary.details.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="log-summary-card ${escapeHtml(summary.level || 'warn')}">
      <strong>${escapeHtml(summary.title || '로그 요약')}</strong>
      <p>${escapeHtml(summary.message || '')}</p>
      ${details}
      ${actions ? `<div class="log-summary-actions"><span>다음 조치</span>${actions}</div>` : ''}
    </div>
  `;
}

function openLogModal({
  title = '로그',
  meta = '',
  pathText = '',
  summary = null,
  content = '로그를 불러오는 중입니다.',
} = {}) {
  els.logModalTitle.textContent = title;
  els.logModalMeta.textContent = meta;
  els.logModalPath.textContent = pathText;
  els.logModalPath.hidden = !pathText;
  els.logModalSummary.innerHTML = renderLogSummary(summary);
  els.logModalContent.textContent = content;
  els.logModal.hidden = false;
}

function closeLogModal() {
  els.logModal.hidden = true;
}

async function viewJobLog(jobId) {
  openLogModal();
  try {
    const data = await fetchJson(`/api/job-runs/${encodeURIComponent(jobId)}/log`);
    const job = data.job || {};
    openLogModal({
      title: `${job.status || '-'} · ${job.job_name || '자동화 실행'}`,
      meta: `${formatDateTime(job.started_at)} 시작 · ${job.message || '메시지 없음'}`,
      pathText: job.log_path || '',
      summary: data.summary,
      content: data.content || '로그 파일이 비어 있습니다.',
    });
  } catch (error) {
    openLogModal({
      title: '로그 로드 실패',
      meta: error.message,
      summary: {
        level: 'error',
        title: '로그 파일을 읽지 못했습니다.',
        message: '자동화가 다른 컴퓨터에서 실행됐거나, 로컬 로그 파일이 삭제됐을 수 있습니다.',
        actions: ['자동화가 실행된 컴퓨터에서 Admin을 열어 확인', '자동화 로그의 메시지와 상태를 먼저 확인', '필요하면 같은 날짜로 재실행'],
        details: [],
      },
      content: '로그 파일을 읽지 못했습니다. 자동화가 다른 컴퓨터에서 실행됐거나, 로그 파일이 삭제됐을 수 있습니다.',
    });
  }
}

function renderJobRuns(data) {
  const rows = data.job_runs || [];
  state.jobRuns = rows;
  if (!rows.some((job) => job.id === state.selectedJobRunId && isRerunnableJob(job))) {
    state.selectedJobRunId = null;
  }
  els.rerunSelectedButton.disabled = !state.selectedJobRunId;
  const latest = rows[0];

  if (!rows.length) {
    els.jobsSummary.className = 'jobs-summary empty-state';
    els.jobsSummary.textContent = '표시할 자동화 실행 내역이 없습니다.';
    els.jobRows.innerHTML = '';
    return;
  }

  els.jobsSummary.className = `jobs-summary ${latest.status || ''}`;
  els.jobsSummary.innerHTML = `
    <strong>최근 실행: ${escapeHtml(latest.status || '-')}</strong>
    <span>${escapeHtml(formatDateTime(latest.started_at))} 시작 · ${escapeHtml(latest.message || '메시지 없음')}</span>
  `;

  els.jobRows.innerHTML = rows.map((job) => {
    const status = job.status || 'warn';
    const logPath = job.log_path || '';
    const rerunnable = isRerunnableJob(job);
    return `
    <tr class="job-row ${escapeHtml(status)}">
      <td class="select-cell">
        <input
          type="checkbox"
          data-select-job="${escapeHtml(job.id)}"
          ${rerunnable ? '' : 'disabled'}
          ${job.id === state.selectedJobRunId ? 'checked' : ''}
          aria-label="${escapeHtml(formatDateTime(job.started_at))} 실행 선택"
        >
      </td>
      <td>${escapeHtml(formatDateTime(job.started_at))}</td>
      <td><span class="status-pill ${escapeHtml(status)}">${escapeHtml(job.status || '-')}</span></td>
      <td>${escapeHtml(formatJobPeriod(job))}</td>
      <td>${escapeHtml(formatUploadCounts(job))}</td>
      <td class="message-cell">${escapeHtml(job.message || '-')}</td>
      <td>${logPath ? `
        <div class="log-path-wrap">
          <span class="log-path" title="${escapeHtml(logPath)}">${escapeHtml(logPath)}</span>
          <button class="button micro" type="button" data-view-log="${escapeHtml(job.id)}">로그 보기</button>
        </div>
      ` : '-'}</td>
    </tr>
  `;
  }).join('');

  els.jobRows.querySelectorAll('[data-view-log]').forEach((button) => {
    button.addEventListener('click', () => {
      viewJobLog(button.dataset.viewLog);
    });
  });
  els.jobRows.querySelectorAll('[data-select-job]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      state.selectedJobRunId = checkbox.checked ? checkbox.dataset.selectJob : null;
      renderJobRuns({ job_runs: state.jobRuns });
    });
  });
}

async function loadJobRuns() {
  els.reloadJobsButton.disabled = true;
  els.jobsSummary.className = 'jobs-summary empty-state';
  els.jobsSummary.textContent = '최근 실행 내역을 불러오는 중입니다...';

  try {
    renderJobRuns(await fetchJson('/api/job-runs'));
  } catch (error) {
    els.jobsSummary.className = 'jobs-summary error';
    els.jobsSummary.textContent = `자동화 로그 로드 실패: ${error.message}`;
    els.jobRows.innerHTML = '';
  } finally {
    els.reloadJobsButton.disabled = false;
  }
}

async function rerunSelectedJob() {
  const job = state.jobRuns.find((item) => item.id === state.selectedJobRunId);
  if (!job) return;

  const confirmed = window.confirm(
    `${formatDateTime(job.started_at)} 실패 건을 다시 실행할까요?\n\n대상 기간: ${formatJobPeriod(job)}\n실패 메시지를 기준으로 Excel 새로고침 필요 여부는 시스템이 자동 판단합니다.`,
  );
  if (!confirmed) return;

  els.rerunSelectedButton.disabled = true;
  els.jobsSummary.className = 'jobs-summary started';
  els.jobsSummary.innerHTML = '<strong>선택 항목 재실행 요청 중</strong><span>자동화 스크립트를 시작하고 있습니다.</span>';

  try {
    const result = await fetchJson(`/api/job-runs/${encodeURIComponent(job.id)}/rerun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    els.jobsSummary.className = 'jobs-summary started';
    els.jobsSummary.innerHTML = `<strong>선택 항목 재실행 시작</strong><span>${escapeHtml(result.message || '자동화 로그에서 진행 상태를 확인하세요.')}</span>`;
    state.selectedJobRunId = null;
    setTimeout(loadJobRuns, 2500);
  } catch (error) {
    els.jobsSummary.className = 'jobs-summary error';
    els.jobsSummary.textContent = `선택 항목 재실행 시작 실패: ${error.message}`;
  } finally {
    els.rerunSelectedButton.disabled = !state.selectedJobRunId;
  }
}

async function loadReports() {
  const data = await fetchJson('/api/reports');
  state.reports = data.reports || [];
  state.currentDate = state.currentDate || state.reports[0]?.date || null;
  renderReportPicker();

  if (state.currentDate) {
    await loadReport(state.currentDate);
  } else {
    els.reportTitle.textContent = '리포트가 없습니다.';
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
    tags: [],
    approved_by: '',
    status: els.statusInput.value,
  };
}

async function generateDraft() {
  if (!state.currentDate) return;

  els.draftButton.disabled = true;
  els.saveMessage.textContent = '자동 초안을 생성하는 중입니다...';
  els.saveMessage.className = 'save-message';

  try {
    const result = await fetchJson(`/api/comments/${state.currentDate}/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reference_note: els.referenceInput.value.trim(),
      }),
    });

    els.autoCommentInput.value = result.auto_comment || '';
    els.saveMessage.textContent = '자동 코멘트 초안을 생성했습니다. 최종 코멘트에는 직접 옮겨 다듬어 주세요.';
    els.saveMessage.className = 'save-message ok';
  } catch (error) {
    els.saveMessage.textContent = `자동 초안 생성 실패: ${error.message}`;
    els.saveMessage.className = 'save-message error';
  } finally {
    els.draftButton.disabled = false;
  }
}

async function uploadToSupabase() {
  if (!state.currentDate) return;

  els.uploadButton.disabled = true;
  els.saveMessage.textContent = 'Supabase에 저장 중입니다...';
  els.saveMessage.className = 'save-message';

  try {
    const result = await fetchJson(`/api/supabase/reports/${state.currentDate}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(getCommentPayload()),
    });

    state.currentReport.comment = result.comment;
    state.currentReport.preview_html = result.review_html || state.currentReport.preview_html;
    els.summaryStatus.textContent = result.comment.status;
    const previewUrl = `/${state.currentReport.preview_html}`;
    els.previewFrame.src = previewUrl;
    els.previewOpenLink.href = previewUrl;
    els.saveMessage.textContent = `저장·발행 완료: ${result.supabase.report_date}`;
    els.saveMessage.className = 'save-message ok';
  } catch (error) {
    els.saveMessage.textContent = `저장 실패: ${error.message}`;
    els.saveMessage.className = 'save-message error';
  } finally {
    els.uploadButton.disabled = false;
  }
}

async function runValidation() {
  if (!state.currentDate) return;

  els.runValidationButton.disabled = true;
  els.validationSummary.className = 'validation-summary';
  els.validationSummary.textContent = '검증 실행 중입니다...';
  els.validationRows.innerHTML = '';
  els.validationMessages.innerHTML = '';

  try {
    const result = await fetchJson(`/api/validation/${state.currentDate}`);
    state.validationResult = result;
    renderValidation(result);
  } catch (error) {
    els.validationSummary.className = 'validation-summary error';
    els.validationSummary.textContent = `검증 실패: ${error.message}`;
  } finally {
    els.runValidationButton.disabled = false;
  }
}

els.refreshButton.addEventListener('click', () => {
  if (state.currentView === 'jobs') {
    loadJobRuns();
  } else {
    loadReports();
  }
});
els.closeLogModalButton.addEventListener('click', closeLogModal);
els.rerunSelectedButton.addEventListener('click', rerunSelectedJob);
els.logModal.addEventListener('click', (event) => {
  if (event.target === els.logModal) {
    closeLogModal();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.logModal.hidden) {
    closeLogModal();
  }
});
els.reportSelect.addEventListener('change', () => {
  if (els.reportSelect.value) {
    loadReport(els.reportSelect.value);
  }
});
els.draftButton.addEventListener('click', generateDraft);
els.uploadButton.addEventListener('click', uploadToSupabase);
els.runValidationButton.addEventListener('click', runValidation);
els.reloadJobsButton.addEventListener('click', loadJobRuns);
els.dailyReportMenuButton.addEventListener('click', () => setView('data'));
els.jobRunsMenuButton.addEventListener('click', () => setView('jobs'));
els.viewTabs.forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

loadReports().catch((error) => {
  els.reportTitle.textContent = '관리자 화면 오류';
  els.metricRows.innerHTML = `<tr><td colspan="4" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
});
