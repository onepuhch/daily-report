import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../..');

async function readDotEnv() {
  const values = {};
  let raw = '';
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '..', '.env'),
  ];

  for (const filePath of candidates) {
    try {
      raw = await readFile(filePath, 'utf8');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  if (!raw) return values;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }

  return values;
}

async function getSupabaseConfig() {
  const env = await readDotEnv();
  const url = process.env.SUPABASE_URL || env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  const key = serviceRoleKey && !serviceRoleKey.startsWith('your-') ? serviceRoleKey : anonKey;

  if (!url || url.includes('your-project-ref')) {
    const error = new Error('SUPABASE_URL is missing in .env.');
    error.statusCode = 400;
    throw error;
  }

  if (!key || key.startsWith('your-')) {
    const error = new Error('SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is missing in .env.');
    error.statusCode = 400;
    throw error;
  }

  return {
    url: url.replace(/\/+$/, ''),
    key,
  };
}

async function supabaseRest(method, apiPath, body, extraHeaders = {}) {
  const config = await getSupabaseConfig();
  const headers = {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    'content-type': 'application/json',
    prefer: 'resolution=merge-duplicates,return=representation',
    ...extraHeaders,
  };

  const response = await fetch(`${config.url}/rest/v1/${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    let message = data?.message || data?.hint || text || `Supabase request failed: ${response.status}`;
    if (response.status === 403 && String(message).includes('permission denied')) {
      message = `${message}. Check SUPABASE_SERVICE_ROLE_KEY in .env, or add Supabase write policies for this table.`;
    }
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return data;
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

async function bestEffortSupabase(method, endpoint, body, label) {
  try {
    return await supabaseRest(method, endpoint, body === null ? undefined : body);
  } catch (error) {
    console.warn(`${label} unavailable: ${error.message}`);
    return null;
  }
}

export {
  readDotEnv,
  getSupabaseConfig,
  supabaseRest,
  bestEffortSupabase,
  sqlString,
  sqlArray,
};
