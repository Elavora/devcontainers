'use strict';

// Contrato do Dockerfile e do smoke test (docs/ferramentas-de-qualidade.md, "Referência").
// Leitura de texto: os nomes dos arquivos temporários e a ordem dos comandos dentro do RUN podem variar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readRepoFile } = require('./helpers.cjs');

const ARGS = {
  PHP_CS_FIXER_VERSION: '3.95.27',
  PHP_CS_FIXER_SHA256: '47231757eefdd08778e2bd047d98a63dfaad881006c8c1d1bc870d63be7f6a9b',
  EDITORCONFIG_CHECKER_VERSION: '4.0.2',
  EDITORCONFIG_CHECKER_SHA256: '44efaef3ed14c6ab52eb87481d78e5e5c204796dccf26e2f4598a61ba17f8003',
};
const FIXER_URL =
  'https://github.com/PHP-CS-Fixer/PHP-CS-Fixer/releases/download/v${PHP_CS_FIXER_VERSION}/php-cs-fixer.phar';
const EC_URL =
  'https://github.com/editorconfig-checker/editorconfig-checker/releases/download/v${EDITORCONFIG_CHECKER_VERSION}/editorconfig-checker-linux-amd64.tar.gz';
const FIXER_DEST = '/usr/local/bin/php-cs-fixer';
const EC_DEST = '/usr/local/bin/editorconfig-checker';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Instruções lógicas do Dockerfile: sem comentários e com as continuações (\) juntadas.
function instructions() {
  const lines = readRepoFile('Dockerfile').split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
  const out = [];
  let cur = '';
  for (const line of lines) {
    if (/\\\s*$/.test(line)) {
      cur += line.replace(/\\\s*$/, ' ');
      continue;
    }
    cur += line;
    if (cur.trim()) out.push(cur.trim().replace(/\s+/g, ' '));
    cur = '';
  }
  if (cur.trim()) out.push(cur.trim().replace(/\s+/g, ' '));
  return out;
}

// Comandos de shell de um RUN, separados por ; && ||.
const commands = (run) =>
  run
    .replace(/^RUN\s+/, '')
    .split(/;|&&|\|\|/)
    .map((c) => c.trim())
    .filter(Boolean);

// RUN que baixa a URL dada (por padrão, a do PHP-CS-Fixer).
function toolsRun(url = FIXER_URL) {
  const ins = instructions();
  const idx = ins.findIndex((i) => /^RUN\s/.test(i) && i.includes(url));
  assert.ok(idx >= 0, `nenhum RUN baixa ${url}`);
  return { ins, idx, run: ins[idx], cmds: commands(ins[idx]) };
}

const findCmd = (cmds, pred, from = 0) => {
  for (let i = from; i < cmds.length; i++) if (pred(cmds[i])) return i;
  return -1;
};

// Posição do comando que coloca o arquivo no destino (install, cp ou mv), sem aceitar sufixos no nome.
const destRe = (dest) => new RegExp(`${esc(dest)}(?![\\w.-])`);
const placesAt = (dest) => (c) => /^(install|cp|mv)\s/.test(c) && destRe(dest).test(c);

test('Dockerfile declara os quatro ARG com os nomes e valores padrão exatos, um por linha', () => {
  const text = readRepoFile('Dockerfile');
  for (const [name, value] of Object.entries(ARGS)) {
    const re = new RegExp(`^ARG ${name}=${esc(value)}\\s*$`, 'gm');
    assert.equal((text.match(re) || []).length, 1, `esperada exatamente uma linha "ARG ${name}=${value}"`);
    const any = new RegExp(`^\\s*ARG\\s+${name}\\b`, 'gm');
    assert.equal((text.match(any) || []).length, 1, `${name} declarado mais de uma vez`);
  }
});

test('Dockerfile monta as URLs das releases com ${...}, sem a versão literal', () => {
  const text = readRepoFile('Dockerfile');
  assert.ok(text.includes(FIXER_URL), `URL do PHP-CS-Fixer ausente: ${FIXER_URL}`);
  assert.ok(text.includes(EC_URL), `URL do editorconfig-checker ausente: ${EC_URL}`);
  const urls = text.match(/https?:\/\/[^\s"'\\]+/g) || [];
  for (const url of urls) {
    assert.ok(!url.includes('3.95.27'), `versão literal na URL: ${url}`);
    assert.ok(!url.includes('4.0.2'), `versão literal na URL: ${url}`);
  }
});

test('downloads usam curl com falha em erro HTTP (-f)', () => {
  for (const url of [FIXER_URL, EC_URL]) {
    const { cmds } = toolsRun(url);
    const i = findCmd(cmds, (c) => c.includes(url));
    assert.ok(i >= 0, `nenhum comando baixa ${url}`);
    assert.match(cmds[i], /^curl\s/, `o download de ${url} não usa curl`);
    assert.ok(/\s(-[a-zA-Z]*f[a-zA-Z]*|--fail)(\s|$)/.test(cmds[i]), `curl sem -f: ${cmds[i]}`);
  }
});

test('PHP-CS-Fixer: baixa, confere com sha256sum -c e só depois instala em /usr/local/bin/php-cs-fixer', () => {
  const { cmds } = toolsRun();
  const dl = findCmd(cmds, (c) => c.includes(FIXER_URL));
  const sha = findCmd(cmds, (c) => c.includes('${PHP_CS_FIXER_SHA256}'));
  assert.ok(sha >= 0, 'o RUN não usa ${PHP_CS_FIXER_SHA256}');
  const check = findCmd(cmds, (c) => /\bsha256sum\s+(-\w*\s+)*-c\b/.test(c), sha);
  const inst = findCmd(cmds, placesAt(FIXER_DEST));
  assert.ok(check >= 0, 'nenhum sha256sum -c depois do uso de ${PHP_CS_FIXER_SHA256}');
  assert.ok(inst >= 0, `nenhum comando instala em ${FIXER_DEST}`);
  assert.ok(dl < sha && sha <= check && check < inst, 'ordem esperada: download, sha256sum -c, instalação');
});

test('editorconfig-checker: baixa, confere com sha256sum -c antes de extrair e instala em /usr/local/bin/editorconfig-checker', () => {
  const { cmds } = toolsRun(EC_URL);
  const dl = findCmd(cmds, (c) => c.includes(EC_URL));
  const sha = findCmd(cmds, (c) => c.includes('${EDITORCONFIG_CHECKER_SHA256}'));
  assert.ok(sha >= 0, 'o RUN não usa ${EDITORCONFIG_CHECKER_SHA256}');
  const check = findCmd(cmds, (c) => /\bsha256sum\s+(-\w*\s+)*-c\b/.test(c), sha);
  const untar = findCmd(cmds, (c) => /^tar\s/.test(c), Math.max(dl, 0));
  const inst = findCmd(cmds, placesAt(EC_DEST));
  assert.ok(check >= 0, 'nenhum sha256sum -c depois do uso de ${EDITORCONFIG_CHECKER_SHA256}');
  assert.ok(untar >= 0, 'o .tar.gz não é extraído com tar');
  assert.ok(inst >= 0, `nenhum comando instala em ${EC_DEST}`);
  assert.ok(dl < sha && sha <= check && check < untar && untar < inst, 'ordem esperada: download, sha256sum -c, tar, instalação');
});

test('os dois destinos ficam com modo 0755', () => {
  for (const [dest, url] of [[FIXER_DEST, FIXER_URL], [EC_DEST, EC_URL]]) {
    const { cmds } = toolsRun(url);
    const inst = findCmd(cmds, placesAt(dest));
    assert.ok(inst >= 0, `nenhum comando instala em ${dest}`);
    const viaInstall = /^install\s/.test(cmds[inst]) && /\s-m\s*0?755(\s|$)/.test(cmds[inst]);
    const viaChmod = findCmd(cmds, (c) => /^chmod\s+0?755\s/.test(c) && destRe(dest).test(c), inst + 1) >= 0;
    assert.ok(viaInstall || viaChmod, `${dest} sem modo 0755`);
  }
});

test('os arquivos temporários são apagados no mesmo RUN, depois das instalações', () => {
  for (const [dest, url] of [[FIXER_DEST, FIXER_URL], [EC_DEST, EC_URL]]) {
    const { cmds } = toolsRun(url);
    const inst = findCmd(cmds, placesAt(dest));
    assert.ok(inst >= 0, `nenhum comando instala em ${dest}`);
    assert.ok(findCmd(cmds, (c) => /^rm\s+-\w*f/.test(c), inst + 1) >= 0, `nenhum rm -f/-rf depois de instalar ${dest}`);
  }
});

test('nenhum outro nome é criado: sem ec, sem php-cs-fixer.phar em /usr/local/bin, sem links', () => {
  const text = readRepoFile('Dockerfile');
  assert.ok(!/\/usr\/local\/bin\/ec(?![\w.-])/.test(text), 'alias /usr/local/bin/ec encontrado');
  assert.ok(!/\/usr\/local\/bin\/php-cs-fixer\.phar/.test(text), '/usr/local/bin/php-cs-fixer.phar encontrado');
  assert.ok(!/\bln\s+-\w*s/.test(text), 'link simbólico criado no Dockerfile');
  assert.ok(!/\balias\s+ec\b/.test(text), 'alias ec definido');
});

test('sem verificação por GPG', () => {
  assert.ok(!/\bgpg\b/.test(readRepoFile('Dockerfile')));
});

test('nenhum pacote Debian novo: apt-get install continua só com libzip-dev unzip', () => {
  const ins = instructions();
  const installs = ins
    .filter((i) => /^RUN\s/.test(i))
    .flatMap(commands)
    .filter((c) => /\bapt(-get)?\s+install\b/.test(c));
  assert.equal(installs.length, 1, 'esperado um único apt-get install');
  const pkgs = installs[0]
    .replace(/^.*\bapt(-get)?\s+install\b/, '')
    .split(/\s+/)
    .filter((t) => t && !t.startsWith('-'))
    .sort();
  assert.deepEqual(pkgs, ['libzip-dev', 'unzip']);
});

test('a instalação roda como root, depois do apt-get e antes do USER vscode', () => {
  for (const url of [FIXER_URL, EC_URL]) {
    const { ins, idx } = toolsRun(url);
    const apt = ins.findIndex((i) => /^RUN\s/.test(i) && /\bapt-get\s+install\b/.test(i));
    const user = ins.findIndex((i) => /^USER\s+vscode\b/.test(i));
    assert.ok(apt >= 0 && user >= 0, 'apt-get install ou USER vscode ausentes');
    assert.ok(apt <= idx && idx < user, 'ordem esperada: apt-get, instalação das ferramentas, USER vscode');
    const before = ins.slice(0, idx).filter((i) => /^USER\s/.test(i));
    if (before.length) assert.match(before[before.length - 1], /^USER\s+(root|0)\s*$/);
  }
});

test('o ENV XDEBUG_MODE=off e o USER vscode continuam no Dockerfile', () => {
  const ins = instructions();
  assert.ok(ins.some((i) => /^ENV\s+XDEBUG_MODE=off\b/.test(i)));
  assert.ok(ins.some((i) => /^USER\s+vscode\b/.test(i)));
});

// tests/smoke.php: verificações estáticas do contrato. A execução real roda no build (image.yml).
test('smoke.php fixa as versões no próprio arquivo e não lê o Dockerfile', () => {
  const t = readRepoFile('tests/smoke.php');
  assert.ok(t.includes("'3.95.27'"), 'versão 3.95.27 do PHP-CS-Fixer ausente no smoke.php');
  assert.ok(t.includes("'4.0.2'"), 'versão 4.0.2 do editorconfig-checker ausente no smoke.php');
  assert.ok(!/(file_get_contents|fopen|file|SplFileObject)\s*\([^)]*Dockerfile/.test(t), 'smoke.php não deve ler o Dockerfile');
  assert.ok(!/\bARG\b.*VERSION/.test(t.replace(/^\s*\/\/.*$/gm, '')), 'smoke.php não deve extrair a versão dos ARG');
});

test('smoke.php chama as ferramentas pelo nome, sem caminho, e cobre os casos documentados', () => {
  const t = readRepoFile('tests/smoke.php');
  assert.ok(!/\/usr\/local\/bin\//.test(t), 'smoke.php usa caminho absoluto para as ferramentas');
  assert.match(t, /--version/);
  assert.match(t, /php-cs-fixer fix --dry-run --using-cache=no --rules=@PER-CS/);
  assert.match(t, /!==\s*8\b/, 'esperado o código de saída 8 no dry-run');
  assert.match(t, /editorconfig-checker ruim\.php/);
  assert.match(t, /editorconfig-checker bom\.php/);
  assert.match(t, /indent_style = space/);
  assert.match(t, /sys_get_temp_dir\(\)/);
  assert.match(t, /finally/);
  assert.match(t, /RuntimeException/);
  assert.match(t, /echo 'Ambiente PHP validado\.', PHP_EOL;\s*$/);
});
