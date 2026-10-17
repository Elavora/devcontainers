'use strict';

// Contrato de scripts/image-tags.sh (docs/publicacao.md, "Script scripts/image-tags.sh").
const test = require('node:test');
const assert = require('node:assert/strict');
const { runScript, repoFileExists } = require('./helpers.cjs');

const SCRIPT = 'scripts/image-tags.sh';
const run = (...args) => runScript(SCRIPT, args);

test('scripts/image-tags.sh existe', () => {
  assert.ok(repoFileExists(SCRIPT), `${SCRIPT} não encontrado`);
});

test('exemplo da doc: 1.2.0-beta.3', () => {
  const r = run('1.2.0-beta.3');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3\n');
  assert.equal(r.stderr, '');
});

const VALIDAS = [
  '1.0.0',
  '0.0.1-beta.1',
  '10.20.30-beta.12',
  '0.0.0',
  // tabela "Referências publicadas"
  '0.1.0',
  '0.1.1-beta.1',
  '1.2.0-beta.3',
];

for (const tag of VALIDAS) {
  test(`tag válida ${tag}: uma linha em stdout, stderr vazio, código 0`, () => {
    const r = run(tag);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, `ghcr.io/elavora/php-dev:8.3-${tag}\n`);
    assert.equal(r.stdout.split('\n').filter((l) => l !== '').length, 1);
    assert.equal(r.stderr, '');
  });
}

const INVALIDAS = [
  'v1.0.0',
  'v0.0.1-rc.1',
  '1.0.0-rc.1',
  '1.0.0-beta',
  '1.0.0-beta.0',
  '1.0.0-beta.01',
  '01.0.0',
  '1.0',
  'latest',
  '8.3',
  '',
  '1.0.0 ',
  ' 1.0.0',
  '1.0.0\nx',
  '1.0.0;id',
];

for (const tag of INVALIDAS) {
  test(`tag inválida ${JSON.stringify(tag)}: código 1, stdout vazio, stderr com o valor`, () => {
    const r = run(tag);
    assert.equal(r.code, 1, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.notEqual(r.stderr.trim(), '', 'stderr deveria ter uma mensagem');
    const visivel = tag.split('\n')[0].trim();
    if (visivel !== '') {
      assert.ok(r.stderr.includes(visivel), `stderr deveria conter o valor recebido ${JSON.stringify(tag)}: ${r.stderr}`);
    }
  });
}

test('nenhum argumento: código 1, stdout vazio, mensagem em stderr', () => {
  const r = run();
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.notEqual(r.stderr.trim(), '');
});

test('dois argumentos (1.0.0 1.0.1): código 1, stdout vazio, mensagem em stderr', () => {
  const r = run('1.0.0', '1.0.1');
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.notEqual(r.stderr.trim(), '');
});
