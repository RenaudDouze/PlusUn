// Audit des dépendances avec exceptions datées (CI-13).
// Usage : node .github/scripts/audit-check.mjs [--level=high] [--omit=dev]
// Échoue sur tout avis de gravité >= niveau, sauf ceux listés dans
// .github/audit-exceptions.json : [{ "id": "GHSA-xxxx-xxxx-xxxx", "reason": "…", "expires": "AAAA-MM-JJ" }].
// Une exception expirée ne protège plus ; une exception qui ne correspond plus à aucun avis est signalée.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ORDER = ['info', 'low', 'moderate', 'high', 'critical'];
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const level = arg('level', 'high');
const omit = arg('omit', '');
if (!ORDER.includes(level)) fail(`niveau inconnu : ${level}`);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const file = fileURLToPath(new URL('../audit-exceptions.json', import.meta.url));
const exceptions = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const today = new Date().toISOString().slice(0, 10);
for (const e of exceptions) {
  if (!/^GHSA(-[a-z0-9]{4}){3}$/.test(e.id ?? '') || !e.reason || !/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? '')) {
    fail(`exception invalide (id GHSA, reason et expires AAAA-MM-JJ obligatoires) : ${JSON.stringify(e)}`);
  }
}

const args = ['audit', '--json', ...(omit ? [`--omit=${omit}`] : [])];
const run = spawnSync('npm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  fail(`npm audit illisible : ${run.stderr || run.stdout}`);
}
if (report.error) fail(`npm audit : ${report.error.summary ?? JSON.stringify(report.error)}`);

// Un avis = une entrée « via » qui n'est pas un simple nom de paquet.
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string') continue;
    advisories.set(via.url, via);
  }
}

const idOf = (url) => url.split('/').pop();
const used = new Set();
const blocking = [];
const excepted = [];
for (const [url, via] of advisories) {
  if (ORDER.indexOf(via.severity) < ORDER.indexOf(level)) continue;
  const e = exceptions.find((x) => x.id === idOf(url));
  if (e && e.expires >= today) {
    used.add(e.id);
    excepted.push(`${via.name} ${via.severity} ${e.id} : ${e.reason} (jusqu'au ${e.expires})`);
  } else {
    if (e) used.add(e.id);
    blocking.push(`${via.name} ${via.severity} ${url} : ${via.title}${e ? ` [exception expirée le ${e.expires}]` : ''}`);
  }
}

for (const line of excepted) console.log(`exception : ${line}`);
for (const e of exceptions) {
  if (!used.has(e.id)) console.log(`::warning::exception ${e.id} sans effet : retirer de audit-exceptions.json`);
}
if (blocking.length > 0) {
  for (const line of blocking) console.error(`::error::${line}`);
  process.exit(1);
}
console.log(`Audit (${omit ? `sans ${omit}` : 'tout'}, niveau ${level}) : ${advisories.size} avis, ${excepted.length} exception(s), aucun bloquant.`);
