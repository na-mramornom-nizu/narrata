import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';

const AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const trustedCA=[...rootCertificates,readFileSync(join(process.cwd(),'certs/russian_trusted_root_ca.pem'),'utf8')];

type Token = { access_token: string; expires_at: number };
let cached: Token | null = null;

function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        ca: trustedCA,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const code = res.statusCode ?? 0;
          if (code >= 200 && code < 300) {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error('GigaChat: bad JSON')); }
          } else {
            reject(new Error(`GigaChat HTTP ${code}`));
          }
        });
      },
    );
    req.on('error', reject);
    const timeout = setTimeout(() => req.destroy(new Error('GigaChat не ответил за 30 секунд. Попробуйте ещё раз.')), 30_000);
    req.on('close', () => clearTimeout(timeout));
    req.write(body);
    req.end();
  });
}

export function hasGigaChat(): boolean {
  return Boolean(process.env.GIGACHAT_AUTH_KEY);
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expires_at - 60_000 > now) return cached.access_token;

  const key = process.env.GIGACHAT_AUTH_KEY!;
  const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
  const body = `scope=${encodeURIComponent(scope)}`;

  const json = await httpsPost(
    AUTH_URL,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      RqUID: randomUUID(),
      Authorization: `Basic ${key}`,
    },
    body,
  );

  if (!json?.access_token) throw new Error('GigaChat: no access_token in response');
  cached = {
    access_token: json.access_token,
    expires_at: json.expires_at ?? now + 25 * 60_000,
  };
  return cached.access_token;
}

export interface GCMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GCOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

export async function gcChat(messages: GCMessage[], opts: GCOptions = {}): Promise<string> {
  const token = await getToken();
  const payload = {
    model: opts.model || process.env.GIGACHAT_MODEL || 'GigaChat',
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.max_tokens ?? 2000,
  };

  const json = await httpsPost(
    API_URL,
    {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    JSON.stringify(payload),
  );

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('GigaChat: unexpected response');
  }
  return content;
}

export function extractJson<T = any>(text: string): T {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(s) as T; } catch {}
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a !== -1 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)) as T; } catch {}
  }
  throw new Error('Failed to parse JSON from model output');
}
