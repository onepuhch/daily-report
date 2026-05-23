function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  if (Math.abs(number) >= 1000) {
    return number.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  return number.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
}

function formatChangeText(value, unit) {
  if (value === null || value === undefined || value === '') return '변동 데이터 없음';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${formatNumber(number)}${unit || ''}`;
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function scoreObservation(item, question, selectedMetric) {
  const text = normalizeSearchText([
    item.metric_name,
    item.metric_key,
    item.category,
    item.category_label,
    item.unit,
  ].join(' '));
  const query = normalizeSearchText(question);
  let score = 0;

  if (selectedMetric?.metric_key && item.metric_key === selectedMetric.metric_key) score += 10;
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

function firstCommentLine(reportComment = {}) {
  const commentText = reportComment.final_comment || reportComment.auto_comment || '';
  return commentText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
}

function buildSources(matches, researchItems) {
  const marketSources = matches.slice(0, 5).map((item) => ({
    label: item.metric_name || item.metric_key,
    source_type: 'market_data',
    metric_key: item.metric_key,
    url: item.source_url || null,
  }));

  const researchSources = researchItems.slice(0, 5).map((item) => ({
    label: item.title || item.source_type,
    source_type: item.source_type || 'manual_note',
    url: item.url || null,
    published_at: item.published_at || null,
  }));

  return [...marketSources, ...researchSources];
}

function buildFollowups(matches) {
  const first = matches[0];
  if (!first) {
    return [
      '최근 리포트의 핵심 지표를 요약해줘.',
      '검증 경고가 있는 항목을 알려줘.',
    ];
  }

  return [
    `${first.metric_name}의 최근 흐름을 더 자세히 봐줘.`,
    '오늘 최종 코멘트에 반영할 리스크 요인을 정리해줘.',
  ];
}

export function createRuleBasedProvider() {
  return {
    id: 'rule_based',
    async generateAnswer(context = {}) {
      const question = String(context.question || '').trim();
      const date = context.report_date || context.date || '';
      const report = context.report || {};
      const observations = Array.isArray(report.observations) ? report.observations : [];
      const researchItems = Array.isArray(context.research_items) ? context.research_items : [];

      const scored = observations
        .map((item) => ({ item, score: scoreObservation(item, question, context.selected_metric) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((row) => row.item);

      const matches = scored.length > 0 ? scored : observations.slice(0, 8);
      const intro = question
        ? `${date} 리포트에서 "${question}"와 관련된 지표를 찾았습니다.`
        : `${date} 리포트의 주요 지표입니다.`;
      const lines = matches.map(observationToAnswerLine);
      const commentLine = firstCommentLine(context.report_comment || report.comment || {})
        ? `저장된 코멘트 요약: ${firstCommentLine(context.report_comment || report.comment || {})}`
        : '저장된 최종 코멘트는 아직 없습니다.';
      const researchLine = researchItems.length > 0
        ? `참고 자료 ${researchItems.length}건이 함께 전달되었습니다.`
        : '외부 뉴스/텔레그램/RAG 참고 자료는 아직 연결되지 않았습니다.';
      const answer = [intro, ...lines, commentLine, researchLine].join('\n');

      return {
        report_date: date,
        question,
        answer,
        confidence: matches.length > 0 ? 'medium' : 'low',
        sources: buildSources(matches, researchItems),
        blocks: [{ type: 'text', content: answer }],
        followups: buildFollowups(matches),
        safety: {
          uses_only_available_context: true,
          needs_operator_review: true,
        },
        matches,
        source: report.source || 'report_data',
        mode: 'rule_based_search',
        provider: 'rule_based',
      };
    },
  };
}
