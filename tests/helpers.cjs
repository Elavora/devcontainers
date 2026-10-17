'use strict';

// Utilitários comuns aos testes dos scripts e workflows (node:test, sem dependências).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function runScript(relScript, args, env) {
  // Sem o script, o `sh` sairia com 2 ou 127 e alguns casos passariam por engano.
  if (!fs.existsSync(path.join(ROOT, relScript))) {
    throw new Error(`${relScript} não encontrado`);
  }
  const result = spawnSync('sh', [path.join(ROOT, relScript), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: env || process.env,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error };
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readRepoFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function repoFileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

module.exports = { ROOT, runScript, tmpDir, readRepoFile, repoFileExists };
