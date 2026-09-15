const {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');

function normalizeEndpoint(endpoint) {
  if (!endpoint) return undefined;
  const e = String(endpoint).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(e) ? e : `http://${e}`;
}

function makeClient(cfg) {
  const params = {
    region: cfg.region || 'us-east-1',
    forcePathStyle: cfg.forcePathStyle !== false,
    credentials: {
      accessKeyId: cfg.accessKeyId || '',
      secretAccessKey: cfg.secretAccessKey || '',
    },
  };
  const endpoint = normalizeEndpoint(cfg.endpoint);
  if (endpoint) params.endpoint = endpoint;
  return new S3Client(params);
}

async function testConnection(cfg) {
  if (!cfg.bucket) throw new Error('Bucket name is required');
  const client = makeClient(cfg);
  const result = await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  return { ok: true, status: result.$metadata ? result.$metadata.httpStatusCode : 200 };
}

async function listAllKeys(client, bucket, prefix) {
  const keys = [];
  let continuationToken;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of res.Contents || []) keys.push(obj.Key);
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function getObjectText(client, bucket, key) {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchCrFiles(cfg, accountId) {
  const client = makeClient(cfg);
  const basePrefix = (cfg.prefix || '').trim().replace(/\/+$/, '');
  const candidates = [];
  if (basePrefix) {
    candidates.push(`${basePrefix}/${accountId}/`, `${basePrefix}/${accountId}`);
  } else {
    candidates.push(`${accountId}/`, `stats/${accountId}/`);
  }

  let keys = [];
  let usedPrefix = null;
  for (const prefix of candidates) {
    try {
      const found = await listAllKeys(client, cfg.bucket, prefix);
      if (found.length > 0) {
        keys = found;
        usedPrefix = prefix;
        break;
      }
    } catch (err) {
      // continue to next candidate
    }
  }

  if (keys.length === 0) {
    // Auto-detect: list "stats/" and find a folder matching the account id.
    try {
      const all = await listAllKeys(client, cfg.bucket, 'stats/');
      const target = all.filter((k) => k.includes(`/${accountId}/`));
      if (target.length === 0) {
        const wanted = all.find((k) => k === `${accountId}/` && false);
        keys = target;
      } else {
        keys = target;
      }
    } catch (err) {
      keys = [];
    }
    if (keys.length) {
      const sample = keys[0];
      const idx = sample.indexOf(`/${accountId}/`);
      usedPrefix = idx >= 0 ? sample.slice(0, idx + accountId.length + 2) : '';
    }
  }

  const files = [];
  for (const key of keys) {
    if (!/\.json$/i.test(key)) continue;
    const name = key.split('/').pop();
    const m = /^(\d+)\.json$/i.exec(name);
    if (!m) continue;
    try {
      const text = await getObjectText(client, cfg.bucket, key);
      const parsed = JSON.parse(text);
      files.push({ appId: m[1], data: parsed });
    } catch (err) {
      // Skip unreadable/invalid object.
      continue;
    }
  }

  return { files, usedPrefix };
}

module.exports = { makeClient, testConnection, listAllKeys, getObjectText, fetchCrFiles };