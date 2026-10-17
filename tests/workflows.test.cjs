'use strict';

// Estrutura dos workflows, arquivos removidos e examples/devcontainer.json
// (docs/publicacao.md "Referência" e docs/uso.md "Referência: examples/devcontainer.json").
// Leitura de texto, sem parser YAML: as verificações aceitam a ordem de chaves livre.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readRepoFile, repoFileExists } = require('./helpers.cjs');

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

test('.github/workflows contém exatamente image.yml, release.yml e sync-labels.yml', () => {
  const files = fs.readdirSync(path.join(ROOT, WF)).sort();
  assert.deepEqual(files, ['image.yml', 'release.yml', 'sync-labels.yml']);
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

test('image.yml: gatilhos pull_request, push na main, repository_dispatch tag-created e workflow_dispatch', () => {
  const t = code(read('image.yml'));
  const on = t.split(/^on:\s*$/m)[1].split(/^\S/m)[0];
  assert.match(on, /^\s{2}pull_request:/m);
  assert.match(on, /^\s{2}push:/m);
  assert.ok(listHas(on, 'branches', 'main'), 'push na main');
  assert.match(on, /^\s{2}repository_dispatch:/m);
  assert.ok(listHas(on, 'types', 'tag-created'), 'repository_dispatch types: [tag-created]');
  assert.match(on, /^\s{2}workflow_dispatch:/m);
  assert.ok(!/^\s*tags:/m.test(on), 'sem gatilho de tags');
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

test('image.yml: nenhuma tag móvel publicada', () => {
  const t = code(read('image.yml'));
  assert.ok(!/:latest\b/.test(t), 'sem :latest');
  assert.ok(!/ghcr\.io\/elavora\/php-dev:(8\.3|latest|8\.3-latest)(\s|['"]|$)/m.test(t));
});

test('.dockerignore continua excluindo scripts/', () => {
  const t = readRepoFile('.dockerignore');
  assert.match(t, /^\*\s*$/m);
  assert.ok(!/^!\s*scripts/m.test(t));
});

test('examples/devcontainer.json aponta para ghcr.io/elavora/php-dev:8.3-0.1.0 e mantém os demais campos', () => {
  const j = JSON.parse(readRepoFile('examples/devcontainer.json'));
  assert.equal(j.image, 'ghcr.io/elavora/php-dev:8.3-0.1.0');
  assert.equal(j.name, 'Elavora PHP 8.3');
  assert.equal(j.remoteUser, 'vscode');
  assert.equal(
    j.postCreateCommand,
    'git config --global --add safe.directory "$(pwd)" && composer install --no-interaction --prefer-dist',
  );
  assert.deepEqual(j.customizations.vscode.extensions, ['xdebug.php-debug', 'bmewburn.vscode-intelephense-client']);
  assert.deepEqual(j.customizations.vscode.settings, { 'php.validate.executablePath': '/usr/local/bin/php' });
});
