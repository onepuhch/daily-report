import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const processedDir = path.join(projectRoot, 'data', 'processed');
const outputDir = path.join(projectRoot, 'output');
const defaultPort = Number(process.env.DAILY_REPORT_ADMIN_PORT || process.env.PORT || 4173);

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

function parseJson(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function getReportFiles() {
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

async function readReport(date) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

  const reportPath = path.join(processedDir, `market_daily_${date}.json`);
  const raw = await readFile(reportPath, 'utf8');
  const report = parseJson(raw);

  let comment = null;
  try {
    const commentRaw = await readFile(path.join(processedDir, `comment_${date}.json`), 'utf8');
    comment = parseJson(commentRaw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return {
    ...report,
    comment,
    preview_html: `output/market_daily_${date}.html`,
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
  for await (const chunk of req) {
    chunks.push(chunk);
    const size = chunks.reduce((sum, part) => sum + part.length, 0);
    if (size > 1_000_000) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function saveComment(date, payload) {
  if (!isDate(date)) {
    const error = new Error('Invalid report date');
    error.statusCode = 400;
    throw error;
  }

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

  await writeFile(commentPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await writeFile(sqlPath, sql, 'utf8');

  return {
    comment: normalized,
    sql,
    sql_file: path.relative(projectRoot, sqlPath),
    comment_file: path.relative(projectRoot, commentPath),
  };
}

async function serveStatic(res, requestPath) {
  let filePath;

  if (requestPath === '/' || requestPath === '/admin') {
    filePath = path.join(__dirname, 'index.html');
  } else if (requestPath.startsWith('/admin/')) {
    filePath = path.join(__dirname, requestPath.replace('/admin/', ''));
  } else if (requestPath.startsWith('/output/')) {
    filePath = path.join(projectRoot, requestPath.slice(1));
  } else {
    return false;
  }

  const resolved = path.resolve(filePath);
  const allowedAdmin = resolved.startsWith(__dirname);
  const allowedOutput = resolved.startsWith(outputDir);

  if (!allowedAdmin && !allowedOutput) {
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

    const reportMatch = requestPath.match(/^\/api\/reports\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'GET' && reportMatch) {
      sendJson(res, 200, await readReport(reportMatch[1]));
      return;
    }

    const commentMatch = requestPath.match(/^\/api\/comments\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === 'POST' && commentMatch) {
      const body = await readBody(req);
      sendJson(res, 200, await saveComment(commentMatch[1], body));
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
