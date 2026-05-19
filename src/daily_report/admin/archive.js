const archiveState = {
  reports: [],
  currentDate: null,
  currentReport: null,
  filter: '',
};

const archiveEls = {
  list: document.querySelector('#archiveList'),
  title: document.querySelector('#archiveTitle'),
  frame: document.querySelector('#reportFrame'),
  openLink: document.querySelector('#openReportLink'),
  search: document.querySelector('#reportSearch'),
  askForm: document.querySelector('#askForm'),
  questionInput: document.querySelector('#questionInput'),
  answerBox: document.querySelector('#answerBox'),
  chartBox: document.querySelector('#chartBox'),
  chartTitle: document.querySelector('#chartTitle'),
  chartMeta: document.querySelector('#chartMeta'),
  chartCanvas: document.querySelector('#chartCanvas'),
};

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

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(number) >= 1000 ? 2 : 4 });
}

function filteredReports() {
  const filter = archiveState.filter.trim().toLowerCase();
  if (!filter) return archiveState.reports;

  return archiveState.reports.filter((report) => {
    return [
      report.date,
      report.title,
      report.status,
      report.observation_count,
    ].join(' ').toLowerCase().includes(filter);
  });
}

function renderReportList() {
  const reports = filteredReports();
  if (reports.length === 0) {
    archiveEls.list.innerHTML = '<div class="empty-state">표시할 리포트가 없습니다.</div>';
    return;
  }

  archiveEls.list.innerHTML = reports.map((report) => `
    <button class="report-item ${report.date === archiveState.currentDate ? 'active' : ''}" type="button" data-date="${escapeHtml(report.date)}">
      <strong>${escapeHtml(report.date)}</strong>
      <span>${escapeHtml(report.observation_count)}개 지표</span>
    </button>
  `).join('');

  archiveEls.list.querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => loadReport(button.dataset.date));
  });
}

async function loadReports() {
  const data = await fetchJson('/api/reports');
  archiveState.reports = data.reports || [];
  archiveState.currentDate = archiveState.currentDate || archiveState.reports[0]?.date || null;
  renderReportList();

  if (archiveState.currentDate) {
    await loadReport(archiveState.currentDate);
  } else {
    archiveEls.title.textContent = '리포트가 없습니다.';
  }
}

async function loadReport(date) {
  archiveState.currentDate = date;
  archiveState.currentReport = await fetchJson(`/api/reports/${date}`);
  const report = archiveState.currentReport;
  const previewPath = `/${report.preview_html}`;

  archiveEls.title.textContent = report.title || `Daily Report ${report.report_date}`;
  archiveEls.frame.src = previewPath;
  archiveEls.openLink.href = previewPath;
  archiveEls.answerBox.textContent = '질문을 입력하면 현재 선택한 리포트의 숫자와 코멘트에서 관련 내용을 찾습니다.';
  resetChart();
  renderReportList();
}

function resetChart() {
  archiveEls.chartBox.classList.add('empty');
  archiveEls.chartTitle.textContent = '선택 지표 추이';
  archiveEls.chartMeta.textContent = '질문 후 자동 표시';
  archiveEls.chartCanvas.textContent = '질문 결과와 연결된 지표 추이가 여기에 표시됩니다.';
}

function renderMetricChart(series) {
  const points = (series.points || []).filter((point) => Number.isFinite(Number(point.value)));
  archiveEls.chartBox.classList.remove('empty');
  archiveEls.chartTitle.textContent = `${series.metric_name} 추이`;
  archiveEls.chartMeta.textContent = `${points.length}개 관측치 · ${series.unit || ''}`;

  if (points.length === 0) {
    archiveEls.chartCanvas.textContent = '표시할 숫자 데이터가 없습니다.';
    return;
  }

  if (points.length === 1) {
    const point = points[0];
    archiveEls.chartCanvas.innerHTML = `
      <div class="single-point">
        <strong>${formatNumber(point.value)} ${escapeHtml(point.unit || series.unit || '')}</strong>
        <span>${escapeHtml(point.report_date)} · 전일대비 ${formatNumber(point.change_1d)}${escapeHtml(point.change_1d_unit || '')}</span>
      </div>
    `;
    return;
  }

  const width = 760;
  const height = 220;
  const pad = 26;
  const values = points.map((point) => Number(point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((Number(point.value) - min) / spread) * (height - pad * 2);
    return { x, y, point };
  });
  const line = coords.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ');
  const last = points[points.length - 1];

  archiveEls.chartCanvas.innerHTML = `
    <svg class="metric-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(series.metric_name)} 추이">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="axis"></line>
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="axis"></line>
      <polyline points="${line}" class="series-line"></polyline>
      ${coords.map((coord) => `<circle cx="${coord.x.toFixed(2)}" cy="${coord.y.toFixed(2)}" r="4" class="series-point"><title>${escapeHtml(coord.point.report_date)} ${formatNumber(coord.point.value)}${escapeHtml(coord.point.unit || series.unit || '')}</title></circle>`).join('')}
      <text x="${pad}" y="18" class="axis-label">${formatNumber(max)}${escapeHtml(series.unit || '')}</text>
      <text x="${pad}" y="${height - 6}" class="axis-label">${formatNumber(min)}${escapeHtml(series.unit || '')}</text>
    </svg>
    <div class="chart-caption">
      최근 값: <strong>${formatNumber(last.value)} ${escapeHtml(last.unit || series.unit || '')}</strong>
      <span>${escapeHtml(last.report_date)} 기준</span>
    </div>
  `;
}

async function askQuestion(event) {
  event.preventDefault();
  const question = archiveEls.questionInput.value.trim();
  if (!question || !archiveState.currentDate) return;

  archiveEls.answerBox.textContent = '관련 지표를 찾는 중입니다...';

  try {
    const result = await fetchJson('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        report_date: archiveState.currentDate,
        question,
      }),
    });

    archiveEls.answerBox.textContent = result.answer;
    const firstMetric = result.matches?.[0]?.metric_key;
    if (firstMetric) {
      const series = await fetchJson(`/api/metrics/${encodeURIComponent(firstMetric)}/series`);
      renderMetricChart(series);
    } else {
      resetChart();
    }
  } catch (error) {
    archiveEls.answerBox.textContent = `질문 처리 실패: ${error.message}`;
    resetChart();
  }
}

archiveEls.search.addEventListener('input', () => {
  archiveState.filter = archiveEls.search.value;
  renderReportList();
});
archiveEls.askForm.addEventListener('submit', askQuestion);

loadReports().catch((error) => {
  archiveEls.title.textContent = '아카이브 화면 오류';
  archiveEls.answerBox.textContent = error.message;
});
