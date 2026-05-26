const state = {
  reports: [],
  currentDate: null,
  currentReport: null,
  currentCategory: 'all',
  currentView: 'report',
  validationResult: null,
  validationLoading: false,
  research: null,
  aiProvider: null,
  jobRuns: [],
  selectedJobRunId: null,
};

const els = {
  reportSelect: document.querySelector('#reportSelect'),
  dailyReportMenuButton: document.querySelector('#dailyReportMenuButton'),
  jobRunsMenuButton: document.querySelector('#jobRunsMenuButton'),
  reportTitle: document.querySelector('#reportTitle'),
  refreshButton: document.querySelector('#refreshButton'),
  statusbar: document.querySelector('#statusbar'),
  chipData: document.querySelector('#chipData'),
  chipValidation: document.querySelector('#chipValidation'),
  chipComment: document.querySelector('#chipComment'),
  validationBanner: document.querySelector('#validationBanner'),
  validationBannerCount: document.querySelector('#validationBannerCount'),
  validationBannerMetrics: document.querySelector('#validationBannerMetrics'),
  validationBannerDetail: document.querySelector('#validationBannerDetail'),
  reportView: document.querySelector('#reportView'),
  summaryGenerated: document.querySelector('#summaryGenerated'),
  categoryTabs: document.querySelector('#categoryTabs'),
  openPreviewButton: document.querySelector('#openPreviewButton'),
  previewModal: document.querySelector('#previewModal'),
  closePreviewModalButton: document.querySelector('#closePreviewModalButton'),
  researchCount: document.querySelector('#researchCount'),
  metricRows: document.querySelector('#metricRows'),
  autoCommentInput: document.querySelector('#autoCommentInput'),
  aiDraftTrace: document.querySelector('#aiDraftTrace'),
  referenceInput: document.querySelector('#referenceInput'),
  finalCommentInput: document.querySelector('#finalCommentInput'),
  draftButton: document.querySelector('#draftButton'),
  aiDraftButton: document.querySelector('#aiDraftButton'),
  copyDraftButton: document.querySelector('#copyDraftButton'),
  uploadButton: document.querySelector('#uploadButton'),
  saveDraftButton: document.querySelector('#saveDraftButton'),
  saveMessage: document.querySelector('#saveMessage'),
  commentHistory: document.querySelector('#commentHistory'),
  reloadResearchButton: document.querySelector('#reloadResearchButton'),
  researchSummary: document.querySelector('#researchSummary'),
  sourceRows: document.querySelector('#sourceRows'),
  researchTitleInput: document.querySelector('#researchTitleInput'),
  researchTypeInput: document.querySelector('#researchTypeInput'),
  researchRelevanceInput: document.querySelector('#researchRelevanceInput'),
  researchTextInput: document.querySelector('#researchTextInput'),
  researchUrlInput: document.querySelector('#researchUrlInput'),
  addResearchButton: document.querySelector('#addResearchButton'),
  saveResearchButton: document.querySelector('#saveResearchButton'),
  researchSaveMessage: document.querySelector('#researchSaveMessage'),
  aiProviderStatus: document.querySelector('#aiProviderStatus'),
  previewFrame: document.querySelector('#previewFrame'),
  previewOpenLink: document.querySelector('#previewOpenLink'),
  jobsView: document.querySelector('#jobsView'),
  validationModal: document.querySelector('#validationModal'),
  closeValidationModalButton: document.querySelector('#closeValidationModalButton'),
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
  if (!els.categoryTabs) return;
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
    els.metricRows.innerHTML = '<tr><td colspan="5" class="empty-state">표시할 데이터가 없습니다.</td></tr>';
    return;
  }

  els.metricRows.innerHTML = rows.map((item, index) => `
    <tr>
      <td class="row-number">${index + 1}</td>
      <td class="metric-cell">
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
  els.saveMessage.textContent = '';
  els.saveMessage.className = 'save-message';
  if (els.aiDraftTrace) {
    els.aiDraftTrace.className = 'draft-trace empty-state';
    els.aiDraftTrace.textContent = 'AI 보조 초안을 생성하면 provider와 반영된 근거가 여기에 표시됩니다.';
  }
}

function renderAiProviderStatus() {
  if (!els.aiProviderStatus) return;
  const provider = state.aiProvider;
  if (!provider) {
    els.aiProviderStatus.textContent = 'AI provider 상태를 확인하는 중입니다.';
    return;
  }

  const fallbackText = provider.fallback_active
    ? `요청 provider ${provider.requested_provider}가 아직 구현되지 않아 rule_based fallback을 사용 중입니다.`
    : `현재 provider: ${provider.active_provider}`;
  els.aiProviderStatus.textContent = `${fallbackText} 초안은 저장 전 운영자 검토가 필요합니다.`;
}

function validationDiffs() {
  const checks = state.validationResult?.cross_checks || [];
  return checks.filter((item) => !item.passed && !item.approved);
}

function renderValidationChip() {
  const chip = els.chipValidation;
  if (!chip) return;

  if (state.validationLoading) {
    chip.textContent = '검증 중…';
    chip.className = 'status-chip pending';
    return;
  }

  const validation = state.validationResult;
  if (!validation) {
    chip.textContent = '검증 대기';
    chip.className = 'status-chip';
    return;
  }

  const errors = validation.errors?.length || 0;
  const diffs = validationDiffs().length;
  if (errors > 0) {
    chip.textContent = `검증 오류 ${errors}`;
    chip.className = 'status-chip error';
  } else if (diffs > 0) {
    chip.textContent = `검증 차이 ${diffs}`;
    chip.className = 'status-chip warn';
  } else {
    chip.textContent = '검증 통과';
    chip.className = 'status-chip ok';
  }
}

function renderValidationBanner() {
  if (!els.validationBanner) return;
  const errors = state.validationResult?.errors?.length || 0;
  const diffs = validationDiffs();
  const show = state.currentView !== 'jobs' && (diffs.length > 0 || errors > 0);
  els.validationBanner.hidden = !show;
  if (!show) return;

  els.validationBannerCount.textContent = String(diffs.length || errors);
  const labels = diffs.slice(0, 4).map((item) => item.name || item.metric_key).filter(Boolean);
  els.validationBannerMetrics.textContent = labels.length ? labels.join(' · ') : '';
}

function renderStatusBar() {
  const report = state.currentReport;
  if (!report) return;

  const observations = report.observations || [];
  const comment = report.comment || {};
  const status = comment.status || report.status || 'draft';

  if (els.chipData) {
    els.chipData.textContent = `데이터 ${observations.length}개`;
    els.chipData.className = `status-chip ${observations.length ? 'ok' : 'warn'}`;
  }
  if (els.chipComment) {
    els.chipComment.textContent = status;
    els.chipComment.className = `status-chip status-${status}`;
  }

  renderValidationChip();
  renderValidationBanner();
}

function renderCommentHistory() {
  if (!els.commentHistory) return;
  const versions = state.currentReport?.comment_versions || [];
  const approvals = state.currentReport?.approval_events || [];

  if (!versions.length && !approvals.length) {
    els.commentHistory.className = 'comment-history empty-state';
    els.commentHistory.textContent = '아직 이력 테이블이 없거나 저장된 이력이 없습니다.';
    return;
  }

  const versionRows = versions.slice(0, 5).map((item) => `
    <article class="history-item">
      <strong>${escapeHtml(item.event_type || 'comment')}</strong>
      <span>${escapeHtml(formatDateTime(item.created_at))} · ${escapeHtml(item.status || '')}</span>
      <p>${escapeHtml((item.final_comment || item.auto_comment || item.reference_note || '').slice(0, 110))}</p>
    </article>
  `).join('');

  const approvalRows = approvals.slice(0, 5).map((item) => `
    <article class="history-item">
      <strong>${escapeHtml(item.event_type || 'approval')}</strong>
      <span>${escapeHtml(formatDateTime(item.created_at))} · ${escapeHtml(item.target_type || '')}${item.target_key ? `/${escapeHtml(item.target_key)}` : ''}</span>
      <p>${escapeHtml(item.reason || item.status_to || '')}</p>
    </article>
  `).join('');

  els.commentHistory.className = 'comment-history';
  els.commentHistory.innerHTML = `
    ${versionRows ? `<h5>Comment versions</h5>${versionRows}` : ''}
    ${approvalRows ? `<h5>Approval events</h5>${approvalRows}` : ''}
  `;
}

function renderResearch() {
  if (!els.researchSummary || !els.sourceRows) return;
  const research = state.research;
  if (!research) {
    els.researchSummary.className = 'research-summary empty-state';
    els.researchSummary.textContent = '리서치 근거를 불러오는 중입니다.';
    els.sourceRows.innerHTML = '';
    return;
  }

  const summary = research.summary || { count: 0, by_source_type: {}, by_relevance: {} };
  if (els.researchCount) {
    els.researchCount.textContent = summary.count ? `(${summary.count})` : '';
  }
  const sourceTypes = Object.entries(summary.by_source_type || {})
    .map(([key, count]) => `${key} ${count}`)
    .join(' / ');
  const relevance = Object.entries(summary.by_relevance || {})
    .map(([key, count]) => `${key} ${count}`)
    .join(' / ');

  els.researchSummary.className = 'research-summary';
  els.researchSummary.innerHTML = `
    <strong>${summary.count || 0}개 근거 자료</strong>
    <span>${escapeHtml(sourceTypes || '아직 수집된 외부 근거 없음')} / ${escapeHtml(relevance || 'relevance 없음')}</span>
  `;

  const items = research.items || [];
  if (!items.length) {
    els.sourceRows.innerHTML = `
      <div class="source-empty">
        <strong>수집된 근거 자료가 아직 없습니다.</strong>
        <p>현재는 운영 메모를 직접 붙여 넣고 AI 초안에 함께 전달합니다. 크롤러가 붙으면 이 영역에 뉴스, 텔레그램, 과거 코멘트 근거가 표시됩니다.</p>
      </div>
    `;
    return;
  }

  els.sourceRows.innerHTML = items.map((item, index) => `
    <article class="source-card ${item.included === false ? 'excluded' : ''}">
      <div>
        <span class="source-type">${escapeHtml(item.source_type || 'manual_note')}</span>
        <h4>${escapeHtml(item.title || 'Untitled source')}</h4>
        <p>${escapeHtml(item.text || item.url || '')}</p>
      </div>
      <footer>
        <span>${escapeHtml(item.relevance || 'medium')}</span>
        <span>${escapeHtml(item.published_at || item.author || '')}</span>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">원문</a>` : ''}
        <button class="text-button source-toggle" type="button" data-source-index="${index}">
          ${item.included === false ? '포함' : '제외'}
        </button>
        <button class="text-button source-delete" type="button" data-source-index="${index}">
          삭제
        </button>
      </footer>
    </article>
  `).join('');
}

function renderReport() {
  const report = state.currentReport;
  if (!report) return;

  els.reportTitle.textContent = 'Comment';
  els.summaryGenerated.textContent = formatDateTime(report.generated_at);
  if (els.previewOpenLink) els.previewOpenLink.href = previewUrlForCurrentDate();

  setCommentForm(report.comment);
  renderCommentHistory();
  renderReportPicker();
  renderCategoryTabs();
  renderMetrics();
  clearValidation();
  renderResearch();
  renderAiProviderStatus();
  renderStatusBar();
}

function previewUrlForCurrentDate() {
  return state.currentDate ? `/report-v2?date=${encodeURIComponent(state.currentDate)}` : '/report-v2';
}

function setView(view) {
  const isJobs = view === 'jobs';
  state.currentView = isJobs ? 'jobs' : 'report';

  els.reportView.hidden = isJobs;
  els.jobsView.hidden = !isJobs;
  els.jobsView.classList.toggle('active', isJobs);
  els.statusbar.hidden = isJobs;
  els.dailyReportMenuButton.classList.toggle('active', !isJobs);
  els.jobRunsMenuButton.classList.toggle('active', isJobs);
  document.body.classList.toggle('jobs-mode', isJobs);
  renderValidationBanner();

  if (isJobs) {
    els.reportTitle.textContent = '자동화 로그';
    loadJobRuns();
  } else {
    els.reportTitle.textContent = 'Comment';
  }
}

function clearValidation() {
  state.validationResult = null;
  state.validationLoading = false;
  els.validationSummary.className = 'validation-summary empty-state';
  els.validationSummary.textContent = '날짜를 열면 검증이 자동 실행됩니다. Supabase 반영 여부와 Yahoo Finance 대조 결과가 여기에 표시됩니다.';
  els.validationRows.innerHTML = '';
  els.validationMessages.innerHTML = '';
  renderValidationChip();
  renderValidationBanner();
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
  const sourceText = result.validation_source === 'supabase_fallback'
    ? 'Supabase 적재 데이터 기준 검증 · Yahoo 대조 생략'
    : 'Yahoo Finance 대조 완료';

  els.validationSummary.className = `validation-summary ${summaryClass}`;
  els.validationSummary.innerHTML = `
    <strong>${escapeHtml(result.report_date)} 검증 ${summaryText}</strong>
    <span>${escapeHtml(sourceText)} · 차이 ${failed}개 · 승인 ${approved}개 · 경고 ${warnings}개 · 오류 ${errors}개</span>
  `;

  if (!checks.length) {
    els.validationRows.innerHTML = '<tr><td colspan="7" class="empty-state">표시할 외부 검증 결과가 없습니다.</td></tr>';
  } else {
    els.validationRows.innerHTML = checks.map((item) => `
      <tr class="${item.passed || item.approved ? '' : 'validation-failed'}">
        <td>${escapeHtml(item.name || item.metric_key)}</td>
        <td>${escapeHtml(item.symbol || '-')}</td>
        <td class="value-cell">${formatNumber(item.local)}</td>
        <td class="value-cell">${renderExternalValue(item)}</td>
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

function renderExternalValue(item) {
  const value = formatNumber(item.external);
  if (!item.external_date) return value;
  return `
    <div class="value-with-note">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(item.external_date)} 기준</span>
    </div>
  `;
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
    const unavailableLabel = data.soft_failure ? ` · ${data.reason || 'log unavailable'}` : '';
    openLogModal({
      title: `${job.status || '-'} · ${job.job_name || '자동화 실행'}`,
      meta: `${formatDateTime(job.started_at)} 시작 · ${job.message || '메시지 없음'}${unavailableLabel}`,
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

  if (state.reports.length === 0) {
    state.currentDate = null;
    syncUrlToDate(null);
    renderReportPicker();
    els.reportTitle.textContent = '리포트가 없습니다.';
    return;
  }

  const urlDate = readDateFromUrl();
  const knownDates = new Set(state.reports.map((r) => r.date));
  if (!state.currentDate || !knownDates.has(state.currentDate)) {
    state.currentDate = urlDate && knownDates.has(urlDate) ? urlDate : state.reports[0].date;
  }
  renderReportPicker();
  await loadReport(state.currentDate);
}

async function loadReport(date) {
  state.currentDate = date;
  state.currentCategory = 'all';
  state.research = null;
  syncUrlToDate(date);
  try {
    state.currentReport = await fetchJson(`/api/reports/${date}`);
    renderReport();
    await Promise.allSettled([loadResearch(date), loadAiProviderStatus()]);
    runValidation({ silent: true }).catch(() => {});
  } catch (error) {
    els.reportTitle.textContent = `${date} (불러오기 실패)`;
    els.metricRows.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(date)} 리포트 로드 실패: ${escapeHtml(error.message)}</td></tr>`;
    throw error;
  }
}

async function loadResearch(date = state.currentDate) {
  if (!date || !els.researchSummary || !els.sourceRows) return;
  els.researchSummary.className = 'research-summary empty-state';
  els.researchSummary.textContent = '리서치 근거를 불러오는 중입니다.';

  try {
    state.research = await fetchJson(`/api/research/${date}`);
    renderResearch();
  } catch (error) {
    state.research = { report_date: date, items: [], summary: { count: 0 } };
    els.researchSummary.className = 'research-summary error';
    els.researchSummary.textContent = `리서치 근거 로드 실패: ${error.message}`;
    els.sourceRows.innerHTML = '';
  }
}

async function loadAiProviderStatus() {
  if (!els.aiProviderStatus) return;
  try {
    state.aiProvider = await fetchJson('/api/ai/provider');
  } catch (error) {
    state.aiProvider = {
      active_provider: 'unknown',
      requested_provider: 'unknown',
      fallback_active: true,
      error: error.message,
    };
  }
  renderAiProviderStatus();
}

function summarizeLocalResearch(items = []) {
  const includedItems = items.filter((item) => item.included !== false);
  const bySourceType = {};
  const byRelevance = {};

  includedItems.forEach((item) => {
    const sourceType = item.source_type || 'manual_note';
    const relevance = item.relevance || 'medium';
    bySourceType[sourceType] = (bySourceType[sourceType] || 0) + 1;
    byRelevance[relevance] = (byRelevance[relevance] || 0) + 1;
  });

  return {
    count: includedItems.length,
    by_source_type: bySourceType,
    by_relevance: byRelevance,
    has_high_relevance: includedItems.some((item) => item.relevance === 'high'),
  };
}

function updateResearchState(items) {
  state.research = {
    report_date: state.currentDate,
    items,
    summary: summarizeLocalResearch(items),
  };
  renderResearch();
}

function clearResearchForm() {
  if (els.researchTitleInput) els.researchTitleInput.value = '';
  if (els.researchTextInput) els.researchTextInput.value = '';
  if (els.researchUrlInput) els.researchUrlInput.value = '';
  if (els.researchTypeInput) els.researchTypeInput.value = 'manual_note';
  if (els.researchRelevanceInput) els.researchRelevanceInput.value = 'medium';
}

function addResearchItem() {
  if (!state.currentDate || !els.researchTitleInput || !els.researchTextInput) return;

  const title = els.researchTitleInput.value.trim();
  const text = els.researchTextInput.value.trim();
  const url = els.researchUrlInput?.value.trim() || '';

  if (!title && !text && !url) {
    if (els.researchSaveMessage) {
      els.researchSaveMessage.textContent = '제목, 내용, URL 중 하나는 입력해야 합니다.';
      els.researchSaveMessage.className = 'save-message error';
    }
    return;
  }

  const items = [...(state.research?.items || []), {
    report_date: state.currentDate,
    source_type: els.researchTypeInput?.value || 'manual_note',
    title: title || url || text.slice(0, 60) || '운영 메모',
    url,
    published_at: '',
    author: '',
    text,
    relevance: els.researchRelevanceInput?.value || 'medium',
    included: true,
  }];

  updateResearchState(items);
  clearResearchForm();
  if (els.researchSaveMessage) {
    els.researchSaveMessage.textContent = '근거가 임시 추가되었습니다. 저장을 눌러 파일에 반영하세요.';
    els.researchSaveMessage.className = 'save-message';
  }
}

async function saveResearch() {
  if (!state.currentDate || !els.saveResearchButton) return;

  els.saveResearchButton.disabled = true;
  if (els.researchSaveMessage) {
    els.researchSaveMessage.textContent = '근거를 저장하는 중입니다...';
    els.researchSaveMessage.className = 'save-message';
  }

  try {
    state.research = await fetchJson(`/api/research/${state.currentDate}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: state.research?.items || [] }),
    });
    renderResearch();
    if (els.researchSaveMessage) {
      els.researchSaveMessage.textContent = '근거가 저장되었습니다.';
      els.researchSaveMessage.className = 'save-message ok';
    }
  } catch (error) {
    if (els.researchSaveMessage) {
      els.researchSaveMessage.textContent = `근거 저장 실패: ${error.message}`;
      els.researchSaveMessage.className = 'save-message error';
    }
  } finally {
    els.saveResearchButton.disabled = false;
  }
}

function handleSourceAction(event) {
  const button = event.target.closest('[data-source-index]');
  if (!button || !state.research) return;

  const index = Number(button.dataset.sourceIndex);
  const items = [...(state.research.items || [])];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return;

  if (button.classList.contains('source-delete')) {
    items.splice(index, 1);
  } else if (button.classList.contains('source-toggle')) {
    items[index] = { ...items[index], included: items[index].included === false };
  }

  updateResearchState(items);
  if (els.researchSaveMessage) {
    els.researchSaveMessage.textContent = '근거 변경 사항이 있습니다. 저장을 눌러 파일에 반영하세요.';
    els.researchSaveMessage.className = 'save-message';
  }
}

function getCommentPayload(status) {
  return {
    auto_comment: els.autoCommentInput.value.trim(),
    reference_note: els.referenceInput.value.trim(),
    final_comment: els.finalCommentInput.value.trim(),
    tags: [],
    approved_by: '',
    status,
  };
}

function validateCommentPayload(payload) {
  const hasComment = Boolean(payload.final_comment || payload.auto_comment);
  if (payload.status === 'published' && !hasComment) {
    return '발행하려면 최종 코멘트 또는 초안 코멘트가 필요합니다.';
  }
  return '';
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

async function generateAiDraft() {
  if (!state.currentDate || !els.aiDraftButton) return;

  els.aiDraftButton.disabled = true;
  els.saveMessage.textContent = 'AI 보조 초안을 생성하는 중입니다...';
  els.saveMessage.className = 'save-message';
  if (els.aiDraftTrace) {
    els.aiDraftTrace.className = 'draft-trace';
    els.aiDraftTrace.textContent = 'provider 응답과 근거 trace를 기다리는 중입니다...';
  }

  try {
    const includedResearchItems = (state.research?.items || []).filter((item) => item.included !== false);
    const result = await fetchJson(`/api/comments/${state.currentDate}/ai-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reference_note: els.referenceInput.value.trim(),
        research_items: includedResearchItems,
      }),
    });

    els.autoCommentInput.value = result.auto_comment || '';
    const sourceCount = Array.isArray(result.sources) ? result.sources.length : 0;
    const provider = result.ai_provider?.active_provider || result.ai_provider?.provider || 'unknown';
    const sourceLabels = (result.sources || [])
      .slice(0, 5)
      .map((source) => source.label || source.metric_key || source.source_type)
      .filter(Boolean);
    els.saveMessage.textContent = `AI 보조 초안을 생성했습니다. provider=${provider}, sources=${sourceCount}.`;
    els.saveMessage.className = 'save-message ok';
    if (els.aiDraftTrace) {
      els.aiDraftTrace.className = 'draft-trace ok';
      els.aiDraftTrace.innerHTML = `
        <strong>AI draft trace</strong>
        <span>provider: ${escapeHtml(provider)}</span>
        <span>included research: ${includedResearchItems.length}개 / returned sources: ${sourceCount}개</span>
        <span>${escapeHtml(sourceLabels.length ? sourceLabels.join(' / ') : '반환된 source 라벨 없음')}</span>
      `;
    }
  } catch (error) {
    els.saveMessage.textContent = `AI 보조 초안 생성 실패: ${error.message}`;
    els.saveMessage.className = 'save-message error';
    if (els.aiDraftTrace) {
      els.aiDraftTrace.className = 'draft-trace error';
      els.aiDraftTrace.textContent = `AI draft trace 실패: ${error.message}`;
    }
  } finally {
    els.aiDraftButton.disabled = false;
  }
}

function copyDraftToFinal() {
  const draft = els.autoCommentInput.value.trim();
  const currentFinal = els.finalCommentInput.value.trim();

  if (!draft) {
    els.saveMessage.textContent = '복사할 초안이 없습니다. 먼저 숫자 기반 초안 또는 AI 보조 초안을 생성하세요.';
    els.saveMessage.className = 'save-message error';
    return;
  }

  if (currentFinal && currentFinal !== draft) {
    els.saveMessage.textContent = '최종 코멘트가 이미 있습니다. 기존 문안을 덮어쓰지 않도록 직접 확인해 주세요.';
    els.saveMessage.className = 'save-message error';
    return;
  }

  els.finalCommentInput.value = draft;
  els.saveMessage.textContent = '초안을 최종 코멘트로 복사했습니다. 저장 및 발행 전에 문안을 검토하세요.';
  els.saveMessage.className = 'save-message ok';
  els.finalCommentInput.focus();
}

async function saveComment(status) {
  if (!state.currentDate) return;
  const isPublish = status === 'published';

  els.uploadButton.disabled = true;
  if (els.saveDraftButton) els.saveDraftButton.disabled = true;
  els.saveMessage.textContent = isPublish ? '저장·발행 중입니다...' : '임시저장 중입니다...';
  els.saveMessage.className = 'save-message';

  try {
    const payload = getCommentPayload(status);
    const validationError = validateCommentPayload(payload);
    if (validationError) {
      throw new Error(validationError);
    }

    const result = await fetchJson(`/api/supabase/reports/${state.currentDate}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    state.currentReport.comment = result.comment;
    try {
      state.currentReport = await fetchJson(`/api/reports/${state.currentDate}`);
    } catch (error) {
      // Keep the optimistic update when the detail refresh is unavailable.
    }
    if (els.previewOpenLink) els.previewOpenLink.href = previewUrlForCurrentDate();
    if (els.previewFrame && els.previewModal && !els.previewModal.hidden) {
      els.previewFrame.src = previewUrlForCurrentDate();
    }
    renderCommentHistory();
    renderStatusBar();
    els.saveMessage.textContent = `${isPublish ? '저장·발행' : '임시저장'} 완료: ${result.supabase.report_date}`;
    els.saveMessage.className = 'save-message ok';
  } catch (error) {
    els.saveMessage.textContent = `${isPublish ? '발행' : '임시저장'} 실패: ${error.message}`;
    els.saveMessage.className = 'save-message error';
  } finally {
    els.uploadButton.disabled = false;
    if (els.saveDraftButton) els.saveDraftButton.disabled = false;
  }
}

async function runValidation({ silent = false } = {}) {
  if (!state.currentDate) return;

  state.validationLoading = true;
  renderValidationChip();
  if (els.runValidationButton) els.runValidationButton.disabled = true;
  if (!silent) {
    els.validationSummary.className = 'validation-summary';
    els.validationSummary.textContent = '검증 실행 중입니다...';
    els.validationRows.innerHTML = '';
    els.validationMessages.innerHTML = '';
  }

  try {
    const result = await fetchJson(`/api/validation/${state.currentDate}`);
    state.validationResult = result;
    renderValidation(result);
  } catch (error) {
    if (!silent) {
      state.validationResult = null;
      els.validationSummary.className = 'validation-summary error';
      els.validationSummary.textContent = `검증 실패: ${error.message}`;
    }
  } finally {
    state.validationLoading = false;
    if (els.runValidationButton) els.runValidationButton.disabled = false;
    renderValidationChip();
    renderValidationBanner();
  }
}

function openPreviewModal() {
  if (!els.previewModal || !state.currentDate) return;
  if (els.previewFrame) els.previewFrame.src = previewUrlForCurrentDate();
  if (els.previewOpenLink) els.previewOpenLink.href = previewUrlForCurrentDate();
  els.previewModal.hidden = false;
}

function closePreviewModal() {
  if (els.previewModal) els.previewModal.hidden = true;
}

function openValidationModal() {
  if (!els.validationModal) return;
  els.validationModal.hidden = false;
  if (!state.validationResult && !state.validationLoading) {
    runValidation().catch(() => {});
  }
}

function closeValidationModal() {
  if (els.validationModal) els.validationModal.hidden = true;
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
els.openPreviewButton?.addEventListener('click', openPreviewModal);
els.closePreviewModalButton?.addEventListener('click', closePreviewModal);
els.previewModal?.addEventListener('click', (event) => {
  if (event.target === els.previewModal) closePreviewModal();
});
els.validationBannerDetail?.addEventListener('click', openValidationModal);
els.closeValidationModalButton?.addEventListener('click', closeValidationModal);
els.validationModal?.addEventListener('click', (event) => {
  if (event.target === els.validationModal) closeValidationModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!els.logModal.hidden) closeLogModal();
  else if (els.previewModal && !els.previewModal.hidden) closePreviewModal();
  else if (els.validationModal && !els.validationModal.hidden) closeValidationModal();
});
els.reportSelect.addEventListener('change', () => {
  if (els.reportSelect.value) {
    loadReport(els.reportSelect.value).catch(() => {});
  }
});
els.draftButton.addEventListener('click', generateDraft);
els.aiDraftButton?.addEventListener('click', generateAiDraft);
els.copyDraftButton?.addEventListener('click', copyDraftToFinal);
els.reloadResearchButton?.addEventListener('click', () => loadResearch());
els.addResearchButton?.addEventListener('click', addResearchItem);
els.saveResearchButton?.addEventListener('click', saveResearch);
els.sourceRows?.addEventListener('click', handleSourceAction);
els.uploadButton.addEventListener('click', () => saveComment('published'));
els.saveDraftButton?.addEventListener('click', () => saveComment('draft'));
els.runValidationButton?.addEventListener('click', () => runValidation());
els.reloadJobsButton.addEventListener('click', loadJobRuns);
els.dailyReportMenuButton.addEventListener('click', () => setView('report'));
els.jobRunsMenuButton.addEventListener('click', () => setView('jobs'));

loadReports().catch((error) => {
  els.reportTitle.textContent = '관리자 화면 오류';
  els.metricRows.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
});
