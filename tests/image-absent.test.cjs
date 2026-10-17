'use strict';

// Contrato de scripts/image-absent.sh (docs/publicacao.md, "Script scripts/image-absent.sh").
// O comando de inspeção é sempre um script falso criado aqui, via IMAGE_INSPECT_CMD
// ou via um "docker" falso no PATH (para o comando padrão).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runScript, tmpDir, repoFileExists } = require('./helpers.cjs');

const SCRIPT = 'scripts/image-absent.sh';
const REF = 'ghcr.io/elavora/php-dev:8.3-0.1.0';

// Comando falso: grava os argumentos recebidos (um por linha), imprime FAKE_OUTPUT e sai com FAKE_CODE.
function makeFake(dir, name) {
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    [
      '#!/bin/sh',
      ': > "$FAKE_LOG"',
      'for a in "$@"; do printf "%s\\n" "$a" >> "$FAKE_LOG"; done',
      'printf "%s" "$FAKE_OUTPUT"',
      'exit "$FAKE_CODE"',
      '',
    ].join('\n'),
  );
  fs.chmodSync(file, 0o755);
  return file;
}

function setup({ output = '', code = 0 } = {}) {
  const dir = tmpDir('image-absent-');
  const fake = makeFake(dir, 'fake-inspect');
  const log = path.join(dir, 'calls.log');
  const env = {
    ...process.env,
    FAKE_OUTPUT: output,
    FAKE_CODE: String(code),
    FAKE_LOG: log,
    IMAGE_INSPECT_CMD: fake,
  };
  return { dir, fake, log, env };
}

const called = (log) => fs.existsSync(log);
const args = (log) => fs.readFileSync(log, 'utf8').split('\n').filter((l) => l !== '');

test('scripts/image-absent.sh existe', () => {
  assert.ok(repoFileExists(SCRIPT), `${SCRIPT} não encontrado`);
});

// Tabela "Exemplos, com um comando falso em IMAGE_INSPECT_CMD" e bordas da tabela de classificação.
const EXEMPLOS = [
  ['{"schemaVersion":2,"mediaType":"application/vnd.oci.image.index.v1+json"}', 0, 1],
  ['manifest unknown', 1, 0],
  ['MANIFEST_UNKNOWN: manifest unknown', 1, 0],
  [`no such manifest: ${REF}`, 1, 0],
  ['unauthorized: authentication required', 1, 2],
  ['denied: permission_denied', 1, 2],
  ['Get "https://ghcr.io/v2/": dial tcp: lookup ghcr.io: no such host', 1, 2],
  ['sh: docker: not found', 127, 2],
  ['manifest unknown', 127, 2],
  ['', 1, 2],
  ['Manifest Unknown', 1, 0],
  ['NO SUCH MANIFEST', 1, 0],
  ['error: manifest unknown\n', 2, 0],
  ['manifest unknown', 126, 2],
  ['no such manifest', 127, 2],
  ['permission denied', 126, 2],
  ['not found', 1, 2],
  ['Error: image not found', 1, 2],
  ['timeout', 124, 2],
  ['algo inesperado', 3, 2],
];

for (const [output, code, expected] of EXEMPLOS) {
  test(`inspeção imprime ${JSON.stringify(output)} e sai ${code}: script sai ${expected}`, () => {
    const s = setup({ output, code });
    const r = runScript(SCRIPT, [REF], s.env);
    assert.equal(r.code, expected, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', 'stdout deve ser sempre vazio');
    assert.ok(called(s.log), 'o comando de inspeção deveria ter sido chamado');
    assert.equal(args(s.log).at(-1), REF, 'a referência deve ser o último argumento');
    if (expected === 0) {
      assert.equal(r.stderr, '', 'não existe: nada em stderr');
    } else {
      assert.ok(r.stderr.includes(REF), `stderr deveria conter a referência: ${r.stderr}`);
    }
    if (expected === 2 && output.trim() !== '') {
      assert.ok(r.stderr.includes(output.trim()), `stderr deveria conter a saída do comando: ${r.stderr}`);
    }
  });
}

test('referência já existe: a mensagem diz que ela já existe', () => {
  const s = setup({ output: '{"schemaVersion":2}', code: 0 });
  const r = runScript(SCRIPT, [REF], s.env);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /j[áa] existe/i);
});

test('a saída classificada inclui o stderr do comando de inspeção', () => {
  const dir = tmpDir('image-absent-');
  const fake = path.join(dir, 'fake-stderr');
  fs.writeFileSync(fake, '#!/bin/sh\necho "manifest unknown" >&2\nexit 1\n');
  fs.chmodSync(fake, 0o755);
  const r = runScript(SCRIPT, [REF], { ...process.env, IMAGE_INSPECT_CMD: fake });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
});

test('IMAGE_INSPECT_CMD é separado em palavras e a referência vai por último', () => {
  const s = setup({ output: 'manifest unknown', code: 1 });
  s.env.IMAGE_INSPECT_CMD = `${s.fake} manifest inspect`;
  const r = runScript(SCRIPT, [REF], s.env);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(args(s.log), ['manifest', 'inspect', REF]);
});

test('IMAGE_INSPECT_CMD não passa por eval', () => {
  const s = setup({ output: 'manifest unknown', code: 1 });
  const marker = path.join(s.dir, 'eval-marker');
  s.env.IMAGE_INSPECT_CMD = `${s.fake} ;touch ${marker}`;
  runScript(SCRIPT, [REF], s.env);
  assert.ok(!fs.existsSync(marker), 'o valor da variável não pode ser avaliado pelo shell');
  assert.deepEqual(args(s.log), [';touch', marker, REF]);
});

for (const [label, value] of [['ausente', undefined], ['vazia', '']]) {
  test(`IMAGE_INSPECT_CMD ${label}: usa "docker manifest inspect <referência>"`, () => {
    const s = setup({ output: 'manifest unknown', code: 1 });
    makeFake(s.dir, 'docker');
    s.env.PATH = `${s.dir}:${process.env.PATH}`;
    if (value === undefined) delete s.env.IMAGE_INSPECT_CMD;
    else s.env.IMAGE_INSPECT_CMD = value;
    const r = runScript(SCRIPT, [REF], s.env);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.deepEqual(args(s.log), ['manifest', 'inspect', REF]);
  });
}

test('aceita referência beta válida', () => {
  const s = setup({ output: 'manifest unknown', code: 1 });
  const ref = 'ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3';
  const r = runScript(SCRIPT, [ref], s.env);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(args(s.log).at(-1), ref);
});

// Argumento inválido: código 2, mensagem em stderr, stdout vazio e a inspeção não roda.
const ARGS_INVALIDOS = [
  ['nenhum argumento', []],
  ['argumento vazio', ['']],
  ['dois argumentos', [REF, 'ghcr.io/elavora/php-dev:8.3-0.1.1']],
  ['tag com prefixo v', ['ghcr.io/elavora/php-dev:8.3-v1.0.0']],
  ['tag rc legada', ['ghcr.io/elavora/php-dev:8.3-v0.0.1-rc.1']],
  ['beta.0', ['ghcr.io/elavora/php-dev:8.3-1.0.0-beta.0']],
  ['zero à esquerda', ['ghcr.io/elavora/php-dev:8.3-01.0.0']],
  ['tag móvel 8.3', ['ghcr.io/elavora/php-dev:8.3']],
  ['tag móvel latest', ['ghcr.io/elavora/php-dev:latest']],
  ['tag móvel 8.3-latest', ['ghcr.io/elavora/php-dev:8.3-latest']],
  ['só a tag', ['0.1.0']],
  ['outro registro', ['docker.io/elavora/php-dev:8.3-0.1.0']],
  ['outra imagem', ['ghcr.io/elavora/outra:8.3-0.1.0']],
  ['outra versão de PHP', ['ghcr.io/elavora/php-dev:8.4-0.1.0']],
  ['espaço na ponta', [`${REF} `]],
  ['duas linhas', [`${REF}\nx`]],
  ['com digest', [`${REF}@sha256:${'a'.repeat(64)}`]],
  ['injeção', [`${REF};id`]],
];

for (const [label, argv] of ARGS_INVALIDOS) {
  test(`argumento inválido (${label}): código 2, sem chamar a inspeção`, () => {
    const s = setup({ output: 'manifest unknown', code: 1 });
    const r = runScript(SCRIPT, argv, s.env);
    assert.equal(r.code, 2, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.notEqual(r.stderr.trim(), '');
    assert.ok(!called(s.log), 'o comando de inspeção não pode ser chamado');
  });
}
