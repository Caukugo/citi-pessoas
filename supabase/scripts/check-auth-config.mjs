#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Trava contra regressão de Auth: CITi Pessoas é plataforma por convite
// (CLAUDE.md §4) e não usa telefone para nada. Se alguém reverter
// `supabase/config.toml` para o padrão do template do Supabase (que vem com
// signup público habilitado), este script falha o build antes que isso
// vire config versionada de novo.
//
// Parser mínimo, de propósito: só o suficiente para ler `chave = valor` sob
// um cabeçalho `[secao]` em TOML. Não lê rede, não decide nada fora deste
// arquivo — não há motivo para trazer uma dependência de parsing de TOML só
// para três booleanos.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.toml');

function parseToml(text) {
  const sections = {};
  let current = 'ROOT';
  sections[current] = {};

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([\w.]+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1];
      sections[current] ??= {};
      continue;
    }

    const kvMatch = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      sections[current] ??= {};
      sections[current][key] = rawValue.trim();
    }
  }

  return sections;
}

function boolOf(sections, section, key) {
  const raw = sections[section]?.[key];
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined; // valor não booleano — trata como "não confirmado" abaixo.
}

const text = readFileSync(CONFIG_PATH, 'utf8');
const sections = parseToml(text);

// Cada trava: [seção, chave, valor esperado, o que ela impede].
const CHECKS = [
  ['auth', 'enable_signup', false, 'signup público (global)'],
  ['auth.email', 'enable_signup', false, 'signup público pelo provedor de e-mail'],
  ['auth.sms', 'enable_signup', false, 'signup por telefone'],
  ['auth.sms.twilio', 'enabled', false, 'SMS/Twilio habilitado (produto não usa telefone)'],
];

const failures = [];

for (const [section, key, expected, description] of CHECKS) {
  const actual = boolOf(sections, section, key);
  if (actual === undefined) {
    failures.push(
      `[auth.config] ${section}.${key} não encontrado ou não é um booleano literal (true/false) em supabase/config.toml — não dá para confirmar que "${description}" está bloqueado.`,
    );
    continue;
  }
  if (actual !== expected) {
    failures.push(
      `[auth.config] ${section}.${key} = ${actual}, esperado ${expected} — isto HABILITARIA ${description}. CITi Pessoas é plataforma por convite (CLAUDE.md §4); reverta esta mudança em supabase/config.toml.`,
    );
  }
}

if (failures.length > 0) {
  console.error('Verificação de configuração de Auth FALHOU:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nCorrija supabase/config.toml antes de continuar.');
  process.exit(1);
}

console.log('OK: supabase/config.toml mantém signup público, signup por telefone e SMS/Twilio desabilitados.');
