const SOURCE_TYPES = new Set([
  'google_news',
  'telegram',
  'manual_note',
  'historical_comment',
  'bond_market_note',
  'market_data_note',
]);

const RELEVANCE_LEVELS = new Set(['low', 'medium', 'high']);

function cleanString(value) {
  return String(value ?? '').trim();
}

export function normalizeResearchItem(item = {}, defaults = {}) {
  const sourceType = cleanString(item.source_type || defaults.source_type || 'manual_note');
  const relevance = cleanString(item.relevance || defaults.relevance || 'medium').toLowerCase();

  return {
    report_date: cleanString(item.report_date || defaults.report_date || ''),
    source_type: SOURCE_TYPES.has(sourceType) ? sourceType : 'manual_note',
    title: cleanString(item.title || item.url || item.text || 'Untitled research item'),
    url: cleanString(item.url),
    published_at: cleanString(item.published_at || item.created_at || ''),
    author: cleanString(item.author || item.channel || ''),
    text: cleanString(item.text || item.summary || ''),
    relevance: RELEVANCE_LEVELS.has(relevance) ? relevance : 'medium',
    included: item.included === false ? false : true,
  };
}

export function normalizeResearchItems(items, defaults = {}) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => normalizeResearchItem(item, defaults))
    .filter((item) => item.title || item.text || item.url);
}

export function summarizeResearchItems(items) {
  const normalized = normalizeResearchItems(items);
  const bySourceType = {};
  const byRelevance = {};

  for (const item of normalized) {
    bySourceType[item.source_type] = (bySourceType[item.source_type] || 0) + 1;
    byRelevance[item.relevance] = (byRelevance[item.relevance] || 0) + 1;
  }

  return {
    count: normalized.length,
    by_source_type: bySourceType,
    by_relevance: byRelevance,
    has_high_relevance: normalized.some((item) => item.relevance === 'high'),
  };
}
