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
    ['주식', ['domestic_equities_fx', 'global_equities', 'global_equities_fx_crypto']],
    ['코스피', ['domestic_equities_fx']],
    ['나스닥', ['global_equities', 'global_equities_fx_crypto']],
    ['환율', ['fx', 'domestic_equities_fx', 'global_equities_fx_crypto']],
    ['달러', ['fx', 'domestic_equities_fx', 'global_equities_fx_crypto']],
    ['원달러', ['fx', 'domestic_equities_fx']],
    ['암호', ['crypto', 'global_equities_fx_crypto']],
    ['비트', ['crypto', 'global_equities_fx_crypto']],
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
  return `${item.metric_name}: ${formatNumber(item.value)}${item.unit || ''}, 전일대비 ${formatChangeText(item.change_1d, item.change_1d_unit)}, 연말대비 ${formatChangeText(item.change_ytd, item.change_ytd_unit)}`;
}

function getMetric(observations, key) {
  return observations.find((item) => item.metric_key === key);
}

function uniqueItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = item?.metric_key || item?.metric_name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function pickMetrics(observations, keys) {
  return keys.map((key) => getMetric(observations, key)).filter(Boolean);
}

function describeDraftMetric(item) {
  return `${item.metric_name} ${formatNumber(item.value)}${item.unit || ''}(전일대비 ${formatChangeText(item.change_1d, item.change_1d_unit)})`;
}

function buildDraftSection(label, items) {
  if (!items.length) return '';
  return `${label}: ${items.map(describeDraftMetric).join(', ')} 흐름을 확인했습니다.`;
}

function buildTopMoverLine(observations) {
  const movers = observations
    .filter((item) => Number.isFinite(Number(item.change_1d)))
    .sort((a, b) => Math.abs(Number(b.change_1d)) - Math.abs(Number(a.change_1d)))
    .slice(0, 4)
    .map((item) => `${item.metric_name} ${formatChangeText(item.change_1d, item.change_1d_unit)}`);

  if (!movers.length) {
    return '변동폭 점검: 전일대비 변동 데이터가 충분하지 않습니다.';
  }

  return `변동폭 점검: ${movers.join(', ')} 순으로 전일대비 움직임이 컸습니다.`;
}

function firstCommentLine(reportComment = {}) {
  const commentText = reportComment.final_comment || reportComment.auto_comment || '';
  return commentText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
}

function summarizeResearchItems(items) {
  const bySourceType = {};
  const byRelevance = {};

  for (const item of items) {
    const sourceType = item.source_type || 'manual_note';
    const relevance = item.relevance || 'medium';
    bySourceType[sourceType] = (bySourceType[sourceType] || 0) + 1;
    byRelevance[relevance] = (byRelevance[relevance] || 0) + 1;
  }

  return {
    count: items.length,
    by_source_type: bySourceType,
    by_relevance: byRelevance,
  };
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
    `${first.metric_name}의 최근 흐름을 자세히 보여줘.`,
    '오늘 최종 코멘트에 반영할 리스크 요인을 정리해줘.',
  ];
}

function buildResearchLine(researchItems) {
  if (!researchItems.length) {
    return '외부 뉴스, 텔레그램, RAG 참고 자료는 아직 연결되지 않았습니다.';
  }

  const titles = researchItems
    .slice(0, 3)
    .map((item) => item.title || item.source_type || '무제 근거')
    .join(' / ');
  return `참고 자료 ${researchItems.length}건이 함께 전달되었습니다: ${titles}`;
}

function selectDraftMatches(observations) {
  return uniqueItems([
    ...pickMetrics(observations, ['kr_gov_10y', 'us_treasury_10y', 'us_treasury_30y', 'kr_corp_aa0_3y', 'credit_spread_aa0_2y']),
    ...pickMetrics(observations, ['kospi', 'kosdaq', 'sp500', 'nasdaq', 'nikkei225']),
    ...pickMetrics(observations, ['usdkrw', 'dollar_index', 'wti', 'brent', 'gold', 'btc_usd']),
  ]).slice(0, 12);
}

function buildAssistedDraftAnswer(date, observations, researchItems, savedComment) {
  const sections = [
    buildDraftSection('금리/크레딧', pickMetrics(observations, ['kr_gov_10y', 'us_treasury_10y', 'us_treasury_30y', 'kr_corp_aa0_3y', 'credit_spread_aa0_2y'])),
    buildDraftSection('주식', pickMetrics(observations, ['kospi', 'kosdaq', 'sp500', 'nasdaq', 'nikkei225'])),
    buildDraftSection('환율/원자재', pickMetrics(observations, ['usdkrw', 'dollar_index', 'wti', 'brent', 'gold', 'btc_usd'])),
    buildTopMoverLine(observations),
  ].filter(Boolean);

  const commentLine = savedComment
    ? `기존 코멘트 참고: ${savedComment}`
    : '기존 최종 코멘트는 아직 저장되지 않았습니다.';
  const researchLine = researchItems.length
    ? `${buildResearchLine(researchItems)} 최종 발행 전에는 해당 근거가 지표 움직임을 설명하는지 확인하세요.`
    : `${buildResearchLine(researchItems)} 최종 발행 전에는 당일 정책, 수급, 주요 뉴스 확인이 필요합니다.`;

  return [
    `${date} 운영자 검토용 시장 코멘트 초안입니다.`,
    ...sections,
    commentLine,
    researchLine,
    '이 초안은 현재 리포트 데이터와 포함 처리된 리서치 근거만 사용한 검토용 문안입니다.',
  ].join('\n');
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
      const assistedDraft = context.mode === 'assisted_draft';
      const savedComment = firstCommentLine(context.report_comment || report.comment || {});
      const sourceMatches = assistedDraft ? selectDraftMatches(observations) : matches;
      const answer = assistedDraft
        ? buildAssistedDraftAnswer(date, observations, researchItems, savedComment)
        : [
            question
              ? `${date} 리포트에서 "${question}"와 관련된 지표를 찾았습니다.`
              : `${date} 리포트의 주요 지표입니다.`,
            ...matches.map(observationToAnswerLine),
            savedComment ? `저장된 코멘트 요약: ${savedComment}` : '저장된 최종 코멘트는 아직 없습니다.',
            buildResearchLine(researchItems),
          ].join('\n');

      return {
        report_date: date,
        question,
        answer,
        confidence: sourceMatches.length > 0 ? 'medium' : 'low',
        sources: buildSources(sourceMatches, researchItems),
        blocks: [{ type: 'text', content: answer }],
        followups: buildFollowups(sourceMatches),
        research_summary: summarizeResearchItems(researchItems),
        safety: {
          uses_only_available_context: true,
          needs_operator_review: true,
        },
        matches: sourceMatches,
        source: report.source || 'report_data',
        mode: 'rule_based_search',
        provider: 'rule_based',
      };
    },
  };
}
