import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

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

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isPathInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function staticCacheControl(extension) {
  if (extension === '.html') return 'no-store';
  if (['.css', '.js', '.svg'].includes(extension)) return 'public, max-age=3600';
  return 'no-store';
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseJson(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1_000_000) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
  }

  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch (cause) {
    const error = new Error(`Request body is not valid JSON: ${cause.message}`);
    error.statusCode = 400;
    throw error;
  }
}

export {
  mimeTypes,
  sendJson,
  sendText,
  isTruthy,
  isPathInside,
  staticCacheControl,
  safeEqual,
  isDate,
  parseJson,
  toNumber,
  readBody,
};
