'use strict';

// Estrutura dos workflows, arquivos removidos e examples/devcontainer.json
// (docs/publicacao.md "Referência" e docs/uso.md "Referência: examples/devcontainer.json").
// Leitura de texto, sem parser YAML: as verificações aceitam a ordem de chaves livre.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, readRepoFile, repoFileExists, tmpDir } = require('./helpers.cjs');

const SHA = '6884d27a5dc5930dceee3fe39f0b112faf5c3034';
const OLD_SHA = 'b1651502678ad20b6d6f01eea2f3bb480d220c72';
const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
const WF = '.github/workflows';

const read = (name) => readRepoFile(`${WF}/${name}`);
// Remove comentários de linha inteira para não confundir as buscas.
const code = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
// Aceita lista em fluxo ([a, b]) ou em bloco (- a).
const listHas = (text, key, value) =>
  new RegExp(`${key}:\\s*\\[[^\\]]*['"]?${value}['"]?[^\\]]*\\]`).test(text) ||
  new RegExp(`${key}:\\s*\\n(\\s*-\\s*.*\\n)*?\\s*-\\s*['"]?${value}['"]?\\s*(\\n|$)`).test(text);

test('.github/workflows contém exatamente image.yml, release.yml, sync-labels.yml e test.yml', () => {
  const files = fs.readdirSync(path.join(ROOT, WF)).sort();
  assert.deepEqual(files, ['image.yml', 'release.yml', 'sync-labels.yml', 'test.yml']);
});

test('test.yml: nome Testes, gatilhos pull_request e push na main, sem dispatch', () => {
  const t = code(read('test.yml'));
  assert.match(t, /^name:\s*['"]?Testes['"]?\s*$/m);
  const on = t.split(/^on:\s*$/m)[1].split(/^\S/m)[0];
  assert.match(on, /^\s{2}pull_request:/m);
  assert.match(on, /^\s{2}push:/m);
  assert.ok(listHas(on, 'branches', 'main'), 'push na main');
  assert.ok(!/repository_dispatch|workflow_dispatch|schedule|pull_request_target/.test(on), 'sem outros gatilhos');
});

test('test.yml: só contents: read, sem permissões no job além dessa', () => {
  const t = code(read('test.yml'));
  const [top, jobs] = t.split(/^jobs:\s*$/m);
  const topPerms = top.split(/^permissions:\s*$/m)[1] || '';
  assert.match(topPerms, /contents:\s*read/);
  assert.ok(!/write/.test(t), 'sem nenhuma permissão de escrita');
  const jobPerms = [...jobs.matchAll(/^\s+([a-z-]+):\s*(read|write|none)\s*$/gm)].map((m) => `${m[1]}:${m[2]}`);
  assert.ok(jobPerms.every((p) => p === 'contents:read'), `permissões extras no job: ${jobPerms}`);
});

test('test.yml: job tests, checkout fixado por SHA sem persistir credenciais', () => {
  const t = code(read('test.yml'));
  const jobs = t.split(/^jobs:\s*$/m)[1] || '';
  const jobIds = [...jobs.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(jobIds, ['tests']);
  const checkouts = t.match(/uses:\s*actions\/checkout@.*$/gm) || [];
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].replace(/^uses:\s*/, '').trim(), CHECKOUT);
  assert.match(t, /persist-credentials:\s*false/);
});

test('test.yml: node --test em node:22-alpine e actionlint 1.7.12, repo montado :ro', () => {
  const t = code(read('test.yml'));
  const runs = t.split('\n').filter((l) => /docker run/.test(l));
  const node = runs.find((l) => /node:22-alpine/.test(l));
  const lint = runs.find((l) => /rhysd\/actionlint/.test(l));
  assert.ok(node, 'passo com node:22-alpine');
  assert.ok(lint, 'passo com actionlint');
  assert.match(node, /node:22-alpine\s+node --test\s+["']tests\/\*\.test\.cjs["']/);
  assert.match(lint, /rhysd\/actionlint:1\.7\.12(\s|$)/);
  for (const l of [node, lint]) {
    assert.match(l, /-v\s+["']?\$\{?PWD\}?:\/w:ro["']?/, `montagem :ro: ${l}`);
    assert.match(l, /-w\s+\/w/);
  }
  assert.ok(!/smoke\.php/.test(t), 'smoke.php não entra no test.yml');
  assert.ok(!/rhysd\/actionlint(:latest|\s|$)/m.test(t.replace(/rhysd\/actionlint:1\.7\.12/g, '')), 'actionlint fixado');
});

test('image.yml continua com o smoke.php e não roda node --test', () => {
  const t = code(read('image.yml'));
  assert.ok(t.includes('smoke.php'));
  assert.ok(!/node --test/.test(t));
});

test('arquivos removidos: sync_labels.yml e .github/labels.yml', () => {
  assert.ok(!repoFileExists(`${WF}/sync_labels.yml`));
  assert.ok(!repoFileExists('.github/labels.yml'));
});

test('nenhum workflow referencia o fluxo antigo', () => {
  for (const name of fs.readdirSync(path.join(ROOT, WF))) {
    const text = read(name);
    assert.ok(!text.includes('micnncim/action-label-syncer'), `${name}: micnncim/action-label-syncer`);
    assert.ok(!text.includes(OLD_SHA), `${name}: SHA antigo`);
    assert.ok(!text.includes('refs/tags/v'), `${name}: refs/tags/v`);
    assert.ok(!/tags:\s*\[\s*['"]v\*['"]\s*\]/.test(text), `${name}: tags: ['v*']`);
    assert.ok(!/tags:\s*\n\s*-\s*['"]v\*['"]/.test(text), `${name}: tags: - 'v*'`);
  }
});

// Chamadores: SHA completo no uses (com comentário de versão) e o mesmo SHA no automation_ref.
function assertCaller(text, workflow) {
  const uses = text.match(/^\s*uses:\s*(\S+)(.*)$/gm) || [];
  assert.equal(uses.length, 1, 'um único uses no chamador');
  assert.match(
    uses[0],
    new RegExp(`uses:\\s*Elavora/\\.github/\\.github/workflows/${workflow.replace('.', '\\.')}@${SHA}\\s+#\\s*1\\.0\\.0\\s*$`),
  );
  const refs = text.match(/automation_ref:\s*['"]?([^\s'"#]+)/g) || [];
  assert.equal(refs.length, 1, 'um único automation_ref');
  assert.ok(refs[0].includes(SHA), `automation_ref deve ser ${SHA}: ${refs[0]}`);
  assert.ok(!/@(main|1\.0\.0|v1)\b/.test(text), 'não usa branch nem nome de tag');
}

test('release.yml: gatilho pull_request closed na main', () => {
  const t = code(read('release.yml'));
  assert.match(t, /^name:\s*['"]?Release['"]?\s*$/m);
  assert.match(t, /^\s*pull_request:/m);
  assert.ok(listHas(t, 'types', 'closed'), 'types: [closed]');
  assert.ok(listHas(t, 'branches', 'main'), 'branches: [main]');
  assert.ok(!/^\s*(push|pull_request_target|workflow_dispatch|schedule):/m.test(t), 'sem outros gatilhos');
});

test('release.yml: só roda se o PR foi integrado', () => {
  const t = code(read('release.yml'));
  assert.match(t, /if:\s*\$?\{?\{?\s*github\.event\.pull_request\.merged\s*==\s*true\s*\}?\}?/);
});

test('release.yml: SHA fixado no uses e no automation_ref', () => {
  assertCaller(code(read('release.yml')), 'release.yml');
});

test('release.yml: entradas package_name e packagist: false, sem secrets', () => {
  const t = code(read('release.yml'));
  assert.match(t, /package_name:\s*['"]?elavora\/devcontainers['"]?\s*$/m);
  assert.match(t, /packagist:\s*false\s*$/m);
  assert.ok(!/^\s*secrets:/m.test(t), 'sem bloco secrets');
  const withBlock = t.split(/^\s*with:\s*$/m)[1] || '';
  const keys = [...withBlock.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ['automation_ref', 'package_name', 'packagist']);
});

test('release.yml: permissões contents: read no workflow e write/read no job', () => {
  const t = code(read('release.yml'));
  const [top, jobs] = t.split(/^jobs:\s*$/m);
  assert.ok(jobs, 'bloco jobs');
  const topPerms = top.split(/^permissions:\s*$/m)[1] || '';
  assert.match(topPerms, /contents:\s*read/);
  assert.ok(!/write/.test(topPerms), 'sem escrita no nível do workflow');
  assert.match(jobs, /contents:\s*write/);
  assert.match(jobs, /pull-requests:\s*read/);
});

test('sync-labels.yml: gatilhos schedule semanal e workflow_dispatch, sem push', () => {
  const t = code(read('sync-labels.yml'));
  assert.match(t, /^name:\s*['"]?Sincronizar labels['"]?\s*$/m);
  assert.match(t, /cron:\s*['"]17 3 \* \* 1['"]/);
  assert.match(t, /^\s*workflow_dispatch:/m);
  assert.ok(!/^\s*push:/m.test(t), 'sem gatilho push');
  assert.ok(!/^\s*pull_request:/m.test(t));
});

test('sync-labels.yml: SHA fixado, sem prune, permissões', () => {
  const t = code(read('sync-labels.yml'));
  assertCaller(t, 'sync-labels.yml');
  assert.ok(!/prune/.test(t), 'sem entrada prune');
  const [top, jobs] = t.split(/^jobs:\s*$/m);
  const topPerms = top.split(/^permissions:\s*$/m)[1] || '';
  assert.match(topPerms, /contents:\s*read/);
  assert.ok(!/write/.test(topPerms));
  assert.match(jobs, /issues:\s*write/);
  assert.match(jobs, /contents:\s*read/);
});

// Bloco `on` do image.yml e a sub-seção de um gatilho (linhas mais indentadas que a chave).
const imageOn = () => code(read('image.yml')).split(/^on:\s*$/m)[1].split(/^\S/m)[0];
function triggerBlock(on, name) {
  const lines = on.split('\n');
  const i = lines.findIndex((l) => new RegExp(`^ {2}${name}:`).test(l));
  if (i < 0) return null;
  const out = [lines[i]];
  for (const l of lines.slice(i + 1)) {
    if (l.trim() !== '' && !/^ {3,}/.test(l)) break;
    out.push(l);
  }
  return out.join('\n');
}
// Itens de uma lista em fluxo ([a, b]) ou em bloco (- a), sem aspas.
function listItems(block, key) {
  const unq = (s) => s.trim().replace(/^['"]|['"]$/g, '');
  const flow = block.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (flow) return flow[1].split(',').map(unq).filter((s) => s !== '');
  const lines = block.split('\n');
  const i = lines.findIndex((l) => new RegExp(`^\\s*${key}:\\s*$`).test(l));
  if (i < 0) return null;
  const items = [];
  for (const l of lines.slice(i + 1)) {
    const m = l.match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break;
    items.push(unq(m[1]));
  }
  return items;
}

test('image.yml: gatilhos são exatamente pull_request, repository_dispatch e workflow_dispatch (sem push)', () => {
  const on = imageOn();
  const keys = [...on.matchAll(/^ {2}([A-Za-z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ['pull_request', 'repository_dispatch', 'workflow_dispatch']);
  assert.ok(!/^\s*push:/m.test(on), 'sem gatilho push (nem de branch nem de tag)');
  assert.ok(!/^\s*tags:/m.test(on), 'sem gatilho de tags');
});

test('image.yml: repository_dispatch do tipo tag-created e workflow_dispatch mantidos', () => {
  const on = imageOn();
  const rd = triggerBlock(on, 'repository_dispatch');
  assert.ok(rd, 'repository_dispatch');
  assert.deepEqual(listItems(rd, 'types'), ['tag-created']);
  assert.ok(triggerBlock(on, 'workflow_dispatch'), 'workflow_dispatch');
});

test('image.yml: pull_request com paths de exatamente seis itens, sem paths-ignore nem branches', () => {
  const pr = triggerBlock(imageOn(), 'pull_request');
  assert.ok(pr, 'pull_request');
  assert.ok(!/paths-ignore/.test(pr), 'sem paths-ignore');
  assert.ok(!/^\s*branches(-ignore)?:/m.test(pr), 'sem branches');
  const paths = listItems(pr, 'paths');
  assert.ok(paths, 'pull_request com paths');
  assert.deepEqual(
    [...paths].sort(),
    ['.dockerignore', '.github/workflows/image.yml', 'Dockerfile', 'php.ini', 'scripts/**', 'tests/smoke.php'].sort(),
  );
});

test('image.yml: publica se e somente se for repository_dispatch', () => {
  const t = code(read('image.yml'));
  assert.match(t, /github\.event_name\s*==\s*'repository_dispatch'/);
  assert.ok(!/startsWith\(github\.ref/.test(t));
});

test('image.yml: checkout fixado por SHA com a ref do payload no repository_dispatch', () => {
  const t = code(read('image.yml'));
  const checkouts = t.match(/uses:\s*actions\/checkout@.*$/gm) || [];
  assert.ok(checkouts.length >= 1);
  for (const c of checkouts) assert.equal(c.replace(/^uses:\s*/, '').trim(), CHECKOUT);
  assert.match(t, /ref:.*github\.event\.client_payload\.tag/);
  assert.match(t, /ref:.*github\.ref/);
});

test('image.yml: build e smoke test com o nome local', () => {
  const t = code(read('image.yml'));
  assert.ok(t.includes('docker build --pull -t elavora/php-dev:8.3 .'));
  assert.ok(t.includes('docker run --rm elavora/php-dev:8.3 php /usr/local/share/elavora/smoke.php'));
});

test('image.yml: tag do payload chega por variável de ambiente, não interpolada no run', () => {
  const t = code(read('image.yml'));
  const lines = t.split('\n').filter((l) => l.includes('client_payload.tag'));
  assert.ok(lines.length >= 1);
  for (const l of lines) {
    // Só como valor de uma chave (ref: do checkout ou variável em env:), nunca dentro do script do run.
    assert.match(l, /^\s*(-\s*)?[A-Za-z_][A-Za-z0-9_-]*:\s*['"]?\$\{\{.*\}\}['"]?\s*$/, `uso fora de ref/env: ${l}`);
    assert.ok(!/^\s*(-\s*)?run:/.test(l));
  }
});

test('image.yml: ordem image-tags.sh → login → image-absent.sh → tag/push → logout com trap', () => {
  const t = code(read('image.yml'));
  const iTags = t.indexOf('scripts/image-tags.sh');
  const iLogin = t.search(/docker login[^\n]*ghcr\.io|docker login/);
  const iAbsent = t.indexOf('scripts/image-absent.sh');
  const iTag = t.search(/docker tag elavora\/php-dev:8\.3 /);
  const iPush = t.indexOf('docker push');
  for (const [n, i] of Object.entries({ iTags, iLogin, iAbsent, iTag, iPush })) assert.ok(i >= 0, `${n} não encontrado`);
  assert.ok(iTags < iLogin, 'image-tags.sh antes do login');
  assert.ok(iLogin < iAbsent, 'login antes do image-absent.sh');
  assert.ok(iAbsent < iTag && iAbsent < iPush, 'image-absent.sh antes de qualquer tag/push');
  assert.match(t, /--password-stdin/);
  assert.match(t, /github\.actor/);
  assert.match(t, /trap\s+.*docker logout[^\n]*\bEXIT\b|trap\s+['"][^'"]*logout[^'"]*['"]\s+EXIT/);
});

test('image.yml: permissões contents: read e packages: write, sem PAT', () => {
  const t = code(read('image.yml'));
  const [top, jobs] = t.split(/^jobs:\s*$/m);
  const topPerms = top.split(/^permissions:\s*$/m)[1] || '';
  assert.match(topPerms, /contents:\s*read/);
  assert.ok(!/write/.test(topPerms));
  assert.match(jobs, /packages:\s*write/);
  assert.match(jobs, /contents:\s*read/);
  assert.match(t, /GITHUB_TOKEN|github\.token/);
  const secrets = [...t.matchAll(/secrets\.([A-Za-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(secrets)].filter((s) => s !== 'GITHUB_TOKEN'), [], 'só GITHUB_TOKEN');
});

// Remove também comentários no fim da linha (" # ...").
const noComments = (text) => code(text).split('\n').map((l) => l.replace(/\s+#.*$/, '')).join('\n');

test('image.yml: o texto latest não aparece fora de comentários (a 8.3-latest vem só do image-tags.sh)', () => {
  // O rótulo do runner (runs-on: ubuntu-latest) não é referência de imagem; ver o relatório do tester.
  const t = noComments(read('image.yml')).replace(/^(\s*runs-on:\s*)['"]?ubuntu-latest['"]?\s*$/gm, '$1');
  const linhas = t.split('\n').filter((l) => /latest/.test(l));
  assert.deepEqual(linhas, [], 'latest fora de comentários');
});

test('image.yml: image-absent.sh aparece uma única vez e fora do laço for', () => {
  const t = noComments(read('image.yml'));
  const n = (t.match(/scripts\/image-absent\.sh/g) || []).length;
  assert.equal(n, 1, 'image-absent.sh roda uma única vez');
  const lines = t.split('\n');
  let dentro = 0;
  for (const l of lines) {
    if (/^\s*for\b/.test(l)) dentro++;
    if (dentro > 0) assert.ok(!/image-absent\.sh/.test(l), `image-absent.sh dentro do laço for: ${l}`);
    if (/^\s*done\b|;\s*done\b/.test(l) && dentro > 0) dentro--;
  }
});

// Executa o `run` do passo de publicação com docker e scripts falsos, para verificar a ordem das chamadas.
function publishScript() {
  const lines = read('image.yml').split('\n');
  const indent = (l) => l.match(/^\s*/)[0].length;
  const i = lines.findIndex((l) => !/^\s*#/.test(l) && l.includes('scripts/image-tags.sh'));
  assert.ok(i >= 0, 'passo que chama scripts/image-tags.sh');
  let r = i;
  while (r >= 0 && !(/^\s*(-\s*)?run:\s*[|>][-+]?\s*$/.test(lines[r]) && indent(lines[r]) < indent(lines[i]))) r--;
  assert.ok(r >= 0, 'o passo de publicação usa run: | (bloco)');
  const base = indent(lines[r]);
  const body = [];
  for (const l of lines.slice(r + 1)) {
    if (l.trim() !== '' && indent(l) <= base) break;
    body.push(l);
  }
  const min = Math.min(...body.filter((l) => l.trim() !== '').map(indent));
  return body.map((l) => l.slice(min)).join('\n');
}

function exprValue(expr, tag) {
  if (/client_payload\.tag/.test(expr)) return tag;
  if (/GITHUB_TOKEN|github\.token/.test(expr)) return 'token-falso';
  if (/github\.actor/.test(expr)) return 'actor-falso';
  return '';
}

function runPublish(tag, { absentCode = 0 } = {}) {
  const dir = tmpDir('image-publish-');
  const log = path.join(dir, 'calls.log');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(dir, 'scripts'));
  const write = (file, body) => fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  write(path.join(bin, 'docker'), 'echo "docker $*" >> "$FAKE_LOG"\n[ "$1" = login ] && cat >/dev/null\nexit 0');
  // image-tags.sh falso, com o contrato documentado para as tags usadas aqui.
  write(
    path.join(dir, 'scripts', 'image-tags.sh'),
    [
      'echo "image-tags $*" >> "$FAKE_LOG"',
      'case "$1" in',
      '  1.2.0) printf "%s\\n" ghcr.io/elavora/php-dev:8.3-1.2.0 ghcr.io/elavora/php-dev:8.3-latest ;;',
      '  1.2.0-beta.3) printf "%s\\n" ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3 ;;',
      '  *) echo "tag inválida: $1" >&2; exit 1 ;;',
      'esac',
    ].join('\n'),
  );
  write(path.join(dir, 'scripts', 'image-absent.sh'), `echo "image-absent $#: $*" >> "$FAKE_LOG"\nexit ${absentCode}`);

  const script = publishScript().replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (_, e) => exprValue(e, tag));
  fs.writeFileSync(path.join(dir, 'run.sh'), script);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log };
  const envLine = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*['"]?\$\{\{\s*(.+?)\s*\}\}['"]?\s*$/;
  for (const l of code(read('image.yml')).split('\n')) {
    const m = l.match(envLine);
    if (m && m[1] !== 'ref') env[m[1]] = exprValue(m[2], tag);
  }
  const res = spawnSync('sh', ['-e', path.join(dir, 'run.sh')], { cwd: dir, env, encoding: 'utf8' });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter((l) => l !== '') : [];
  return { code: res.status, stderr: res.stderr, calls };
}

const V_EST = 'ghcr.io/elavora/php-dev:8.3-1.2.0';
const V_BETA = 'ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3';
const LATEST = 'ghcr.io/elavora/php-dev:8.3-latest';
const tagPush = (calls) => calls.filter((c) => /^docker (tag|push) /.test(c));

function assertPublishOrder(r, tag, versioned, refs) {
  assert.equal(r.code, 0, `stderr: ${r.stderr}\nchamadas: ${r.calls.join(' | ')}`);
  const c = r.calls;
  assert.equal(c[0], `image-tags ${tag}`, 'image-tags.sh primeiro, com a tag do payload');
  const absent = c.filter((x) => x.startsWith('image-absent'));
  assert.deepEqual(absent, [`image-absent 1: ${versioned}`], 'image-absent.sh uma vez, só com a primeira linha');
  const iLogin = c.findIndex((x) => x.startsWith('docker login'));
  const iAbsent = c.indexOf(absent[0]);
  const iFirstTagPush = c.findIndex((x) => /^docker (tag|push) /.test(x));
  assert.ok(iLogin > 0 && iLogin < iAbsent, 'login depois do image-tags.sh e antes do image-absent.sh');
  assert.ok(iAbsent < iFirstTagPush, 'image-absent.sh antes de qualquer tag/push');
  assert.deepEqual(
    tagPush(c),
    refs.flatMap((ref) => [`docker tag elavora/php-dev:8.3 ${ref}`, `docker push ${ref}`]),
    'tag e push de cada referência, na ordem impressa',
  );
  assert.match(c.at(-1), /^docker logout ghcr\.io/, 'logout ao final');
}

test('image.yml: publicação estável envia a versionada e depois a 8.3-latest', () => {
  assertPublishOrder(runPublish('1.2.0'), '1.2.0', V_EST, [V_EST, LATEST]);
});

test('image.yml: publicação beta envia só a versionada', () => {
  const r = runPublish('1.2.0-beta.3');
  assertPublishOrder(r, '1.2.0-beta.3', V_BETA, [V_BETA]);
  assert.ok(!r.calls.some((x) => x.includes('latest')), 'beta nunca envia a 8.3-latest');
});

test('image.yml: se o image-absent.sh falhar, nada é enviado e o logout acontece', () => {
  const r = runPublish('1.2.0', { absentCode: 1 });
  assert.notEqual(r.code, 0, 'o passo falha');
  assert.deepEqual(tagPush(r.calls), [], 'nenhum docker tag/push');
  assert.match(r.calls.at(-1) || '', /^docker logout ghcr\.io/, 'logout também na falha');
});

test('image.yml: se o image-tags.sh falhar, o passo para antes do login', () => {
  const r = runPublish('v1.0.0');
  assert.notEqual(r.code, 0, 'o passo falha');
  assert.ok(!r.calls.some((x) => x.startsWith('docker login')), 'sem login');
  assert.ok(!r.calls.some((x) => x.startsWith('image-absent')), 'sem image-absent.sh');
  assert.deepEqual(tagPush(r.calls), [], 'nenhum docker tag/push');
});

test('.dockerignore continua excluindo scripts/', () => {
  const t = readRepoFile('.dockerignore');
  assert.match(t, /^\*\s*$/m);
  assert.ok(!/^!\s*scripts/m.test(t));
});

test('examples/devcontainer.json segue exatamente o contrato de docs/uso.md (imagem 8.3-0.2.0, extensões e settings)', () => {
  const j = JSON.parse(readRepoFile('examples/devcontainer.json'));
  assert.equal(j.image, 'ghcr.io/elavora/php-dev:8.3-0.2.0');
  assert.deepEqual(j, {
    name: 'Elavora PHP 8.3',
    image: 'ghcr.io/elavora/php-dev:8.3-0.2.0',
    remoteUser: 'vscode',
    postCreateCommand:
      'git config --global --add safe.directory "$(pwd)" && composer install --no-interaction --prefer-dist',
    customizations: {
      vscode: {
        extensions: [
          'xdebug.php-debug',
          'bmewburn.vscode-intelephense-client',
          'junstyle.php-cs-fixer',
          'EditorConfig.EditorConfig',
        ],
        settings: {
          'php.validate.executablePath': '/usr/local/bin/php',
          'php-cs-fixer.executablePath': '/usr/local/bin/php-cs-fixer',
          'php-cs-fixer.config': '.php-cs-fixer.php;.php-cs-fixer.dist.php',
          'php-cs-fixer.rules': '@PER-CS',
          'php-cs-fixer.onsave': false,
          '[php]': {
            'editor.defaultFormatter': 'junstyle.php-cs-fixer',
            'editor.formatOnSave': true,
          },
        },
      },
    },
  });
});

test('examples/devcontainer.json: extensões na ordem documentada, as novas no fim', () => {
  const j = JSON.parse(readRepoFile('examples/devcontainer.json'));
  const ext = j.customizations.vscode.extensions;
  assert.deepEqual(ext.slice(0, 2), ['xdebug.php-debug', 'bmewburn.vscode-intelephense-client']);
  assert.deepEqual(ext.slice(2), ['junstyle.php-cs-fixer', 'EditorConfig.EditorConfig']);
});
