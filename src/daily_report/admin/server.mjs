import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createMarketAiProvider, getAiProviderStatus } from '../ai/llm_provider.mjs';
import { normalizeResearchItems, summarizeResearchItems } from '../research/research_items.mjs';
import { mimeTypes, sendJson, sendText, isTruthy, isPathInside, staticCacheControl, safeEqual, isDate, parseJson, toNumber, readBody } from './lib/http.mjs';
import { readDotEnv, getSupabaseConfig, supabaseRest, bestEffortSupabase, sqlString, sqlArray } from './lib/supabase.mjs';
import { categoryLabels, buildAutoCommentDraft, buildReviewHtml } from './lib/render_review.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const processedDir = path.join(projectRoot, 'data', 'processed');
const outputDir = path.join(projectRoot, 'output');
const reportDir = path.join(projectRoot, 'src', 'daily_report', 'report');
const reportV2Dir = path.join(projectRoot, 'src', 'daily_report', 'report_v2');
const logsDir = path.join(projectRoot, 'data', 'logs');
const researchDir = path.join(projectRoot, 'data', 'research');
const cleanedHistoricalCommentDir = path.join(projectRoot, 'data', 'historical_ocr', 'cleaned_comments', 'approved');
const defaultPort = Number(process.env.DAILY_REPORT_ADMIN_PORT || process.env.PORT || 4173);
const defaultHost = process.env.DAILY_REPORT_ADMIN_HOST || process.env.HOST || '127.0.0.1';
const execFileAsync = promisify(execFile);

function requireBasicAuth(req, res) {
  const expectedUser = process.env.DAILY_REPORT_BASIC_AUTH_USER || '';
  const expectedPassword = process.env.DAILY_REPORT_BASIC_AUTH_PASSWORD || '';
  if (!expectedUser || !expectedPassword) return true;

  const header = req.headers.authorization || '';
  const match = header.match(/^Basic\s+(.+)$/i);
  if (match) {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const user = separator >= 0 ? decoded.slice(0, separator) : '';
    const password = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (safeEqual(user, expectedUser) && safeEqual(password, expectedPassword)) {
      return true;
    }
  }

  res.writeHead(401, {
    'content-type': 'text/plain; charset=utf-8',
    'www-authenticate': 'Basic realm="Daily Report"',
    'cache-control': 'no-store',
  });
  res.end('Authentication required');
  return false;
}

function isBlockedByReadOnlyMode(method, requestPath) {
  if (!isTruthy(process.env.DAILY_REPORT_READ_ONLY)) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  return !(method === 'POST' && requestPath === '/api/ask');
}

function resolvePython() {
  if (process.env.DAILY_REPORT_PYTHON) return process.env.DAILY_REPORT_PYTHON;

  const venvPython = path.join(projectRoot, '.venv-docling', 'Scripts', 'python.exe');
  if (existsSync(venvPython)) return venvPython;

  return process.platform === 'win32' ? 'py' : 'python3';
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

function hasUsableCommentText(comment = {}) {
  const text = String(comment.final_comment || comment.auto_comment || '').trim();
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  if (/^\?+$/.test(compact)) return false;
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks >= 3 && questionMarks / Math.max(text.length, 1) > 0.25) return false;
  return true;
}

function sourceDocumentToResearchItem(row = {}) {
  const text = row.extracted_text || row.summary || '';
  return {
    id: row.id,
    report_date: row.source_date || '',
    source_type: 'historical_comment',
    title: row.title || `Historical comment ${row.source_date || ''}`.trim(),
    url: '',
    published_at: row.source_date || '',
    author: 'historical_ocr',
    text,
    relevance: 'medium',
    included: true,
    metadata: {
      original_source_type: row.source_type || '',
      file_path: row.file_path || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      source_table: 'source_documents',
    },
  };
}

function historicalCommentTextFromDocuments(rows = []) {
  const docs = rows
    .map(sourceDocumentToResearchItem)
    .filter((item) => String(item.text || '').trim());

  if (!docs.length) return '';
  return docs[0].text.trim();
}

async function getHistoricalCommentDocuments(date) {
  if (!isDate(date)) return [];

  try {
    const rows = await supabaseRest(
      'GET',
      `source_documents?select=id,source_type,source_date,title,file_path,extracted_text,summary,tags,created_at&source_date=eq.${date}&order=created_at.desc&limit=20`,
    );
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const tags = Array.isArray(row.tags) ? row.tags.map((tag) => String(tag).toLowerCase()) : [];
      const sourceType = String(row.source_type || '').toLowerCase();
      return sourceType.includes('historical') || tags.includes('comment') || tags.includes('ocr');
    });
  } catch (error) {
    console.warn(`Historical source_documents unavailable for ${date}: ${error.message}`);
    return [];
  }
}

async function mapSupabaseCommentWithFallback(row, status = 'draft') {
  const comment = mapSupabaseComment(row.report_comments, status);
  if (hasUsableCommentText(comment)) return comment;
  const fallbackBase = {
    ...comment,
    auto_comment: '',
    final_comment: '',
  };

  try {
    const cleanedComment = (await readFile(
      path.join(cleanedHistoricalCommentDir, `${row.report_date}.comment.txt`),
      'utf8',
    )).trim();
    if (!cleanedComment) return fallbackBase;
    return {
      ...fallbackBase,
      auto_comment: cleanedComment,
      reference_note: comment.reference_note || 'Loaded from cleaned historical PNG comment box.',
      tags: [...new Set([...(comment.tags || []), 'historical', 'png-cleaned'])],
      historical_comment_source: 'cleaned_png_comment',
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Cleaned historical comment unavailable for ${row.report_date}: ${error.message}`);
    }
    return fallbackBase;
  }
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
  const comment = await mapSupabaseCommentWithFallback(row, row.status);
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
  const [commentVersions, approvalEvents] = await Promise.all([
    getCommentVersions(date),
    getApprovalEvents(date),
  ]);

  await mkdir(outputDir, { recursive: true });
  const reviewHtmlPath = path.join(outputDir, `market_daily_${date}.review.html`);
  await writeFile(reviewHtmlPath, buildReviewHtml(report, comment), 'utf8');

  return {
    ...report,
    comment_versions: commentVersions,
    approval_events: approvalEvents,
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
    comment_versions: [],
    approval_events: [],
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

async function readResearchItems(date) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

  const historicalItems = (await getHistoricalCommentDocuments(date)).map(sourceDocumentToResearchItem);
  const researchPath = path.join(researchDir, `research_${date}.json`);
  let localItems = [];
  try {
    const raw = await readFile(researchPath, 'utf8');
    const parsed = parseJson(raw);
    localItems = Array.isArray(parsed) ? parsed : parsed.items;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return dedupeResearchItems([
    ...normalizeResearchItems(localItems, { report_date: date }),
    ...normalizeResearchItems(historicalItems, { report_date: date }),
  ]);
}

async function writeResearchItems(date, payload = {}) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

  const items = normalizeResearchItems(payload.items, { report_date: date });
  await mkdir(researchDir, { recursive: true });
  const researchPath = path.join(researchDir, `research_${date}.json`);
  const body = {
    report_date: date,
    updated_at: new Date().toISOString(),
    items,
  };
  await writeFile(researchPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return {
    ...body,
    summary: summarizeResearchItems(items),
  };
}

function dedupeResearchItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of normalizeResearchItems(items)) {
    const key = [
      item.report_date,
      item.source_type,
      item.url,
      item.title,
      item.text,
    ].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function buildResearchContext(date, payload = {}) {
  const storedItems = await readResearchItems(date);
  const requestItems = normalizeResearchItems(payload.research_items, { report_date: date });
  const items = dedupeResearchItems([...requestItems, ...storedItems]).filter((item) => item.included !== false);
  return {
    items,
    summary: summarizeResearchItems(items),
  };
}

async function answerMarketQuestion(payload = {}) {
  const question = String(payload.question || '').trim();
  let date = payload.report_date || payload.date || '';

  if (!date) {
    date = await getLatestReportDate();
  }

  if (!date || !isDate(date)) {
    const error = new Error('Question requires a valid report date.');
    error.statusCode = 400;
    throw error;
  }

  const report = await readReport(date);
  const research = await buildResearchContext(date, payload);
  const provider = createMarketAiProvider();
  const context = {
    ...payload,
    question,
    report_date: date,
    report,
    report_comment: payload.report_comment || report.comment || {},
    research_items: research.items,
    research_summary: research.summary,
  };
  const answer = await provider.generateAnswer(context, [{ role: 'user', content: question }]);

  return {
    ...answer,
    report_date: date,
    question,
    ai_provider: getAiProviderStatus(),
    research_summary: research.summary,
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
  const report = await readReport(date);
  const reviewHtml = buildReviewHtml(report, normalized);

  await writeFile(commentPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await writeFile(sqlPath, sql, 'utf8');
  await writeFile(reviewHtmlPath, reviewHtml, 'utf8');
  await recordCommentVersion(date, normalized, 'local_save');

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

async function generateAiCommentDraft(date, payload = {}) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

  const referenceNote = String(payload.reference_note || '').trim();
  const question = [
    'Create an operator-review draft comment for today market daily report.',
    'Summarize rates, equities, FX, commodities, and key risk points.',
    'Use only the provided report data and research items.',
    referenceNote ? `Operator memo: ${referenceNote}` : '',
  ].filter(Boolean).join('\n');

  const answer = await answerMarketQuestion({
    ...payload,
    question,
    report_date: date,
    surface: 'admin',
    mode: 'assisted_draft',
  });

  return {
    report_date: date,
    auto_comment: answer.answer || '',
    generated_at: new Date().toISOString(),
    ai_provider: answer.ai_provider,
    sources: answer.sources || [],
    research_summary: answer.research_summary || summarizeResearchItems([]),
    safety: answer.safety || {
      uses_only_available_context: true,
      needs_operator_review: true,
    },
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

async function recordCommentVersion(date, normalized, eventType = 'comment_saved') {
  const row = await getReportRowByDate(date);
  if (!row?.id) return null;

  return bestEffortSupabase('POST', 'comment_versions', [{
    report_id: row.id,
    report_date: date,
    event_type: eventType,
    auto_comment: normalized.auto_comment || null,
    final_comment: normalized.final_comment || null,
    reference_note: normalized.reference_note || null,
    status: normalized.status,
    created_by: normalized.approved_by || null,
    metadata: {
      source: 'admin',
      tags: normalized.tags || [],
    },
  }], 'comment_versions');
}

async function recordApprovalEvent(date, event = {}) {
  const row = await getReportRowByDate(date);
  if (!row?.id) return null;

  return bestEffortSupabase('POST', 'approval_events', [{
    report_id: row.id,
    report_date: date,
    event_type: event.event_type || 'approval',
    target_type: event.target_type || 'report',
    target_key: event.target_key || null,
    status_from: event.status_from || null,
    status_to: event.status_to || null,
    approved_by: event.approved_by || null,
    reason: event.reason || null,
    metadata: event.metadata || {},
  }], 'approval_events');
}

async function getCommentVersions(date) {
  const row = await getReportRowByDate(date);
  if (!row?.id) return [];

  const rows = await bestEffortSupabase(
    'GET',
    `comment_versions?select=id,event_type,status,created_by,created_at,auto_comment,final_comment,reference_note,metadata&report_id=eq.${row.id}&order=created_at.desc&limit=20`,
    null,
    'comment_versions',
  );
  return Array.isArray(rows) ? rows : [];
}

async function getApprovalEvents(date) {
  const row = await getReportRowByDate(date);
  if (!row?.id) return [];

  const rows = await bestEffortSupabase(
    'GET',
    `approval_events?select=id,event_type,target_type,target_key,status_from,status_to,approved_by,reason,metadata,created_at&report_id=eq.${row.id}&order=created_at.desc&limit=50`,
    null,
    'approval_events',
  );
  return Array.isArray(rows) ? rows : [];
}

async function previewSupabaseReportComment(date, payload) {
  validateCommentForStatus(payload);

  const row = await getReportRowByDate(date);
  if (!row?.id) {
    const error = new Error(`Supabase report row missing for ${date}.`);
    error.statusCode = 404;
    throw error;
  }

  const normalized = normalizeCommentPayload(date, payload);
  const report = await readSupabaseReport(date);
  return {
    dry_run: true,
    comment: normalized,
    sql: buildCommentSql(date, normalized),
    sql_file: null,
    comment_file: null,
    review_html: report?.preview_html || null,
    supabase: {
      uploaded: false,
      would_upload: true,
      report_id: row.id,
      report_date: date,
      observation_count: report?.observations?.length || 0,
      status: normalized.status,
    },
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

  await recordCommentVersion(date, normalized, 'admin_save');
  if (['reviewed', 'published'].includes(normalized.status)) {
    await recordApprovalEvent(date, {
      event_type: normalized.status === 'published' ? 'report_published' : 'comment_reviewed',
      target_type: 'comment',
      status_from: null,
      status_to: normalized.status,
      approved_by: normalized.approved_by,
      reason: normalized.status === 'published'
        ? 'Operator approved publication.'
        : 'Operator reviewed the comment.',
      metadata: {
        has_final_comment: Boolean(normalized.final_comment),
        has_auto_comment: Boolean(normalized.auto_comment),
      },
    });
  }

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
  if (payload?.dry_run) return previewSupabaseReportComment(date, payload);

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

  await recordCommentVersion(date, comment, 'admin_save');
  if (['reviewed', 'published'].includes(comment.status)) {
    await recordApprovalEvent(date, {
      event_type: comment.status === 'published' ? 'report_published' : 'comment_reviewed',
      target_type: 'comment',
      status_to: comment.status,
      approved_by: comment.approved_by,
      reason: comment.status === 'published'
        ? 'Operator approved publication.'
        : 'Operator reviewed the comment.',
      metadata: {
        has_final_comment: Boolean(comment.final_comment),
        has_auto_comment: Boolean(comment.auto_comment),
      },
    });
  }

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

const validationRequiredMetricKeys = ['kospi', 'usdkrw', 'wti', 'us_treasury_10y'];

function isMissingLocalReportJson(result) {
  return (result?.errors || []).some((message) => String(message).includes('Report JSON not found'));
}

function isFiniteValidationNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function validateSupabaseLoadedReport(date, cause = '') {
  const report = await readSupabaseReport(date);
  const observations = report?.observations || [];
  const byMetric = new Map(observations.map((item) => [item.metric_key, item]));
  const errors = [];
  const warnings = [];

  if (!report) {
    errors.push(`Supabase report row missing for ${date}.`);
  }
  if (!observations.length) {
    errors.push(`Supabase observations missing for ${date}.`);
  }

  for (const key of validationRequiredMetricKeys) {
    const item = byMetric.get(key);
    if (!item) {
      errors.push(`Missing critical metric: ${key}.`);
      continue;
    }
    if (!isFiniteValidationNumber(item.value)) {
      errors.push(`Critical metric has invalid value: ${key}=${item.value}.`);
    }
  }

  if (cause) {
    const detail = String(cause).replace('Report JSON not found: ', 'Target file: ');
    warnings.push(`Local processed JSON is missing; validated against Supabase-loaded data. ${detail}`.trim());
  } else {
    warnings.push('Local processed JSON is missing; validated against Supabase-loaded data.');
  }
  warnings.push('Yahoo Finance cross-check was skipped in fallback validation because it requires local processed JSON output.');

  return {
    report_date: date,
    observations: observations.length,
    status: errors.length ? 'fail' : 'pass',
    errors,
    warnings,
    cross_checks: [],
    validation_source: 'supabase_fallback',
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
        const parsed = parseJson(stdout);
        if (isMissingLocalReportJson(parsed)) {
          return await attachValidationApprovals(date, await validateSupabaseLoadedReport(date, parsed.errors[0]));
        }
        return await attachValidationApprovals(date, parsed);
      } catch {
        // Fall through to the process error below.
      }
    }

    const stderr = error.stderr ? String(error.stderr).trim() : '';
    const message = stderr || error.message || 'Validation failed.';
    if (String(message).includes('Report JSON not found')) {
      return await attachValidationApprovals(date, await validateSupabaseLoadedReport(date, message));
    }
    const wrapped = new Error(message);
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
    reason: payload.reason || 'Operator reviewed the validation difference and approved the DB value.',
    approved_by: payload.approved_by || null,
    approved_at: new Date().toISOString(),
  };

  const rows = await supabaseRest(
    'POST',
    'validation_approvals?on_conflict=report_id,metric_key,source',
    [row],
  );

  await recordApprovalEvent(date, {
    event_type: 'validation_approved',
    target_type: 'metric',
    target_key: metricKey,
    approved_by: row.approved_by,
    reason: row.reason,
    metadata: {
      metric_name: row.metric_name,
      source: row.source,
      symbol: row.symbol,
      db_value: row.db_value,
      external_value: row.external_value,
    },
  });

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
  const excelCloseRejected =
    text.includes('RPC_E_CALL_REJECTED') ||
    text.includes('Call was rejected by callee') ||
    text.includes('Workbook close skipped');
  const uploadCompleted =
    text.includes('Daily Market update complete.') ||
    Boolean(uploadedMatch) ||
    Boolean(text.match(/"job_run_recorded"\s*:\s*"success"/));

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

  if (excelCloseRejected && uploadCompleted) {
    return {
      level: 'warn',
      title: 'Excel close was skipped after a successful save/upload.',
      message: 'Infomax Excel rejected the final close request, but the workbook save and Supabase upload had already completed. Treat this as an operational notice, not a failed batch.',
      actions: [
        'Leave Excel open if Infomax real-time formulas are still updating',
        'Only close Excel manually if the next batch cannot save or attach to the workbook',
        'Confirm the latest report date in the data validation screen',
      ],
      details: ['Non-fatal stage: Excel cleanup after save', 'Technical signal: RPC_E_CALL_REJECTED'],
    };
  }

  if (excelCloseRejected) {
    return {
      level: 'warn',
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
      ? 'Started rerun for the selected failed job: validation and DB upload only.'
      : 'Started rerun for the selected failed job including Excel refresh.',
  };
}

async function serveStatic(res, requestPath) {
  let filePath;

  if (requestPath === '/' || requestPath === '/admin') {
    filePath = path.join(__dirname, 'index.html');
  } else if (requestPath === '/report') {
    filePath = path.join(reportDir, 'index.html');
  } else if (requestPath === '/report-v2') {
    filePath = path.join(reportV2Dir, 'index.html');
  } else if (requestPath === '/reports' || requestPath === '/archive') {
    filePath = path.join(__dirname, 'archive.html');
  } else if (requestPath.startsWith('/admin/')) {
    filePath = path.join(__dirname, requestPath.replace('/admin/', ''));
  } else if (requestPath.startsWith('/report-v2/')) {
    filePath = path.join(reportV2Dir, requestPath.replace('/report-v2/', ''));
  } else if (requestPath.startsWith('/report/')) {
    filePath = path.join(reportDir, requestPath.replace('/report/', ''));
  } else if (requestPath.startsWith('/output/')) {
    filePath = path.join(projectRoot, requestPath.slice(1));
  } else {
    return false;
  }

  const resolved = path.resolve(filePath);
  const allowedAdmin = isPathInside(__dirname, resolved);
  const allowedReport = isPathInside(reportDir, resolved);
  const allowedReportV2 = isPathInside(reportV2Dir, resolved);
  const allowedOutput = isPathInside(outputDir, resolved);

  if (!allowedAdmin && !allowedReport && !allowedReportV2 && !allowedOutput) {
    sendText(res, 403, 'Forbidden');
    return true;
  }

  try {
    await stat(resolved);
    const extension = path.extname(resolved).toLowerCase();
    const type = mimeTypes.get(extension) || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': staticCacheControl(extension) });
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

    if (!requireBasicAuth(req, res)) {
      return;
    }

    if (isBlockedByReadOnlyMode(req.method, requestPath)) {
      sendJson(res, 403, {
        error: 'This demo deployment is read-only. Run the local Admin server to save, publish, or rerun jobs.',
      });
      return;
    }

    if (req.method === 'GET' && requestPath === '/api/ai/provider') {
      sendJson(res, 200, getAiProviderStatus());
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

    const researchMatch = requestPath.match(/^\/api\/research\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'GET' && researchMatch) {
      const items = await readResearchItems(researchMatch[1]);
      sendJson(res, 200, {
        report_date: researchMatch[1],
        items,
        summary: summarizeResearchItems(items),
      });
      return;
    }

    if ((req.method === 'POST' || req.method === 'PUT') && researchMatch) {
      const body = await readBody(req);
      sendJson(res, 200, await writeResearchItems(researchMatch[1], body));
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

    const aiDraftMatch = requestPath.match(/^\/api\/comments\/(\d{4}-\d{2}-\d{2})\/ai-draft$/);
    if (req.method === 'POST' && aiDraftMatch) {
      const body = await readBody(req);
      sendJson(res, 200, await generateAiCommentDraft(aiDraftMatch[1], body));
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
      error: statusCode >= 500 ? 'Unexpected server error' : (error.message || 'Request failed'),
    });
  }
});

function checkStartupSafety() {
  const isPublic = defaultHost === '0.0.0.0';
  const isWritable = !isTruthy(process.env.DAILY_REPORT_READ_ONLY);
  const hasAuth = Boolean(process.env.DAILY_REPORT_BASIC_AUTH_USER && process.env.DAILY_REPORT_BASIC_AUTH_PASSWORD);
  if (isPublic && isWritable && !hasAuth) {
    console.error('[SECURITY] Refusing to start: public binding (0.0.0.0) with write mode requires Basic Auth.');
    console.error('[SECURITY] Set DAILY_REPORT_BASIC_AUTH_USER + DAILY_REPORT_BASIC_AUTH_PASSWORD, or set DAILY_REPORT_READ_ONLY=true.');
    process.exit(1);
  }
}

checkStartupSafety();
server.listen(defaultPort, defaultHost, () => {
  const displayHost = defaultHost === '0.0.0.0' ? '127.0.0.1' : defaultHost;
  console.log(`Daily Report Admin: http://${displayHost}:${defaultPort}`);
});
