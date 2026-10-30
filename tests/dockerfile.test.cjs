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

// Pacotes passados a todos os `apt-get install` do Dockerfile.
function aptInstalledPackages() {
  return instructions()
    .filter((i) => /^RUN\s/.test(i))
    .flatMap(commands)
    .filter((c) => /\bapt(-get)?\s+install\b/.test(c))
    .flatMap((c) =>
      c
        .replace(/^.*\bapt(-get)?\s+install\b/, '')
        .split(/\s+/)
        .filter((t) => t && !t.startsWith('-')),
    );
}

test('apt-get install mantém libzip-dev e unzip, acrescenta libpq-dev e não instala servidor algum', () => {
  const pkgs = aptInstalledPackages();
  for (const p of ['libzip-dev', 'unzip', 'libpq-dev']) assert.ok(pkgs.includes(p), `apt-get install sem ${p}`);
  const servers = pkgs.filter((p) => /server|mysql|mariadb|^postgresql|redis|mongo|memcached/.test(p));
  assert.deepEqual(servers, [], 'a imagem não traz servidores');
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

// ---------------------------------------------------------------------------
// Extensões de PHP (docs/extensoes-php.md, "Contrato do Dockerfile" e "Smoke test").
// Os SHA-256 foram calculados por download em container (mesmo padrão do PHP-CS-Fixer):
// os testes conferem o valor documentado nos ARG, o formato e o uso do `sha256sum -c`.
// ---------------------------------------------------------------------------
const PECL = {
  apcu: { arg: 'APCU', version: '5.1.28', sha: 'ca9c1820810a168786f8048a4c3f8c9e3fd941407ad1553259fb2e30b5f057bf' },
  redis: { arg: 'REDIS', version: '6.3.0', sha: '0d5141f634bd1db6c1ddcda053d25ecf2c4fc1c395430d534fd3f8d51dd7f0b5' },
  mongodb: { arg: 'MONGODB', version: '2.5.5', sha: '0eaf84ff709f73183d80597f31ff02937f6aefde01eb895a0aa19334a290cec0' },
};
const peclUrl = (name) => `https://pecl.php.net/get/${name}-\${${PECL[name].arg}_VERSION}.tgz`;

// Todos os comandos de todos os RUN, na ordem do arquivo, com o índice da instrução.
function allCommands() {
  const out = [];
  instructions().forEach((ins, run) => {
    if (/^RUN\s/.test(ins)) commands(ins).forEach((cmd) => out.push({ run, cmd }));
  });
  return out;
}
const idxOf = (list, pred, from = 0) => {
  for (let i = from; i < list.length; i++) if (pred(list[i].cmd)) return i;
  return -1;
};
const isPeclInstallOf = (name) => (c) => /^pecl\s+install\s/.test(c) && new RegExp(`${name}[^\\s]*\\.tgz`).test(c);

test('extensões: os seis ARG de PECL existem com nome e valor padrão exatos, um por linha, e o SHA-256 tem 64 hex', () => {
  const text = readRepoFile('Dockerfile');
  for (const [name, p] of Object.entries(PECL)) {
    for (const [suffix, value] of [['VERSION', p.version], ['SHA256', p.sha]]) {
      const arg = `${p.arg}_${suffix}`;
      const re = new RegExp(`^ARG ${arg}=${esc(value)}\\s*$`, 'gm');
      assert.equal((text.match(re) || []).length, 1, `esperada exatamente uma linha "ARG ${arg}=${value}" (${name})`);
      const any = new RegExp(`^\\s*ARG\\s+${arg}\\b`, 'gm');
      assert.equal((text.match(any) || []).length, 1, `${arg} declarado mais de uma vez`);
    }
    assert.match(p.sha, /^[0-9a-f]{64}$/);
  }
});

test('extensões: as URLs do PECL usam ${...} e nenhuma URL repete a versão literal', () => {
  const text = readRepoFile('Dockerfile');
  for (const name of Object.keys(PECL)) assert.ok(text.includes(peclUrl(name)), `URL ausente: ${peclUrl(name)}`);
  const urls = text.match(/https?:\/\/[^\s"'\\]+/g) || [];
  for (const url of urls) {
    for (const p of Object.values(PECL)) assert.ok(!url.includes(p.version), `versão literal ${p.version} na URL: ${url}`);
  }
});

for (const [name, p] of Object.entries(PECL)) {
  test(`${name}: curl -f baixa o .tgz, sha256sum -c confere contra \${${p.arg}_SHA256} e só depois vem pecl install do arquivo e docker-php-ext-enable`, () => {
    const cmds = allCommands();
    const dl = idxOf(cmds, (c) => c.includes(peclUrl(name)));
    assert.ok(dl >= 0, `nenhum comando baixa ${peclUrl(name)}`);
    assert.match(cmds[dl].cmd, /^curl\s/, `o download de ${name} não usa curl`);
    assert.ok(/\s(-[a-zA-Z]*f[a-zA-Z]*|--fail)(\s|$)/.test(cmds[dl].cmd), `curl sem -f: ${cmds[dl].cmd}`);
    const sha = idxOf(cmds, (c) => c.includes(`\${${p.arg}_SHA256}`), dl);
    assert.ok(sha >= 0, `o Dockerfile não usa \${${p.arg}_SHA256} depois do download`);
    const check = idxOf(cmds, (c) => /\bsha256sum\s+(-\w*\s+)*-c\b/.test(c), sha);
    assert.ok(check >= 0, `nenhum sha256sum -c depois do uso de \${${p.arg}_SHA256}`);
    const install = idxOf(cmds, isPeclInstallOf(name), check);
    assert.ok(install >= 0, `nenhum "pecl install" do arquivo ${name}-*.tgz depois do sha256sum -c`);
    const enable = idxOf(cmds, (c) => new RegExp(`^docker-php-ext-enable\\s+(.*\\s)?${name}(\\s|$)`).test(c), install);
    assert.ok(enable >= 0, `nenhum "docker-php-ext-enable ${name}" depois do pecl install`);
  });

  test(`${name}: o .tgz e o cache /tmp/pear são apagados no mesmo RUN do pecl install, depois dele`, () => {
    const cmds = allCommands();
    const install = idxOf(cmds, isPeclInstallOf(name));
    assert.ok(install >= 0, `nenhum "pecl install" do arquivo ${name}-*.tgz`);
    const run = cmds[install].run;
    const rm = idxOf(cmds, (c) => /^rm\s+-\w*f/.test(c) && /\.tgz|\/tmp\//.test(c), install);
    assert.ok(rm >= 0 && cmds[rm].run === run, `o ${name}-*.tgz não é apagado (rm -f) no mesmo RUN depois de instalar`);
    assert.ok(instructions()[run].includes('/tmp/pear'), 'o cache /tmp/pear do pecl não é apagado no mesmo RUN');
  });
}

test('PECL: nada de pecl install por nome sem versão nem de install-php-extensions', () => {
  const text = readRepoFile('Dockerfile');
  assert.ok(!/install-php-extensions/.test(text), 'install-php-extensions não deve ser usado');
  const installs = allCommands().filter(({ cmd }) => /^pecl\s+install\b/.test(cmd));
  assert.ok(installs.length >= 3, 'esperados ao menos três pecl install');
  for (const { cmd } of installs) {
    const args = cmd.replace(/^pecl\s+install\b/, '').split(/\s+/).filter((t) => t && !t.startsWith('-'));
    assert.ok(args.length > 0 && args.every((a) => /\.tgz$/.test(a)), `pecl install deve receber só arquivos .tgz: ${cmd}`);
  }
});

test('pdo_mysql e pdo_pgsql são instalados com docker-php-ext-install', () => {
  const cmds = allCommands();
  for (const ext of ['pdo_mysql', 'pdo_pgsql']) {
    const i = idxOf(cmds, (c) => new RegExp(`^docker-php-ext-install\\s+(.*\\s)?${ext}(\\s|$)`).test(c));
    assert.ok(i >= 0, `nenhum "docker-php-ext-install ${ext}"`);
  }
});

test('libpq: libpq-dev instalado só para compilar e removido no mesmo RUN, libpq5 mantida', () => {
  const cmds = allCommands();
  const aptIns = idxOf(cmds, (c) => /\bapt(-get)?\s+install\b/.test(c) && /\blibpq-dev\b/.test(c));
  assert.ok(aptIns >= 0, 'libpq-dev não é instalado com apt-get');
  const run = cmds[aptIns].run;
  const build = idxOf(cmds, (c) => /^docker-php-ext-install\s/.test(c) && /\bpdo_pgsql\b/.test(c), aptIns);
  assert.ok(build >= 0 && cmds[build].run === run, 'pdo_pgsql deve ser compilado no mesmo RUN que instala o libpq-dev');
  const purge = idxOf(cmds, (c) => /\bapt(-get)?\s+(purge|remove)\b/.test(c) && /\blibpq-dev\b/.test(c), build);
  assert.ok(purge >= 0 && cmds[purge].run === run, 'libpq-dev não é removido (apt-get purge/remove) no mesmo RUN, depois do build');
  for (const { cmd } of cmds) {
    if (/\bapt(-get)?\s+(purge|remove)\b/.test(cmd)) assert.ok(!/\blibpq5\b/.test(cmd), `libpq5 removido: ${cmd}`);
  }
  // Com autoremove (ou purge --auto-remove), a libpq5 precisa ser marcada como manual antes.
  const auto = idxOf(cmds, (c) => /\bautoremove\b|--auto-?remove/.test(c));
  if (auto >= 0) {
    const mark = idxOf(cmds, (c) => /^apt-mark\s+manual\s+(.*\s)?libpq5(\s|$)/.test(c));
    assert.ok(mark >= 0 && mark < auto, 'apt-mark manual libpq5 deve vir antes do autoremove');
  }
});

test('ferramentas de compilação instaladas só para o build são removidas no mesmo RUN', () => {
  const cmds = allCommands();
  const aptIns = idxOf(cmds, (c) => /\bapt(-get)?\s+install\b/.test(c) && /\blibpq-dev\b/.test(c));
  assert.ok(aptIns >= 0, 'libpq-dev não é instalado com apt-get');
  const run = cmds[aptIns].run;
  const removes = cmds.filter((c, i) => i > aptIns && c.run === run && /\bapt(-get)?\s+(purge|remove|autoremove)\b/.test(c.cmd));
  assert.ok(removes.length > 0, 'nenhum apt-get purge/remove/autoremove no RUN do build');
  const installed = cmds.filter((c) => c.run === run && /\bapt(-get)?\s+install\b/.test(c.cmd)).map((c) => c.cmd).join(' ');
  for (const tool of ['autoconf', 'gcc', 'make']) {
    if (new RegExp(`\\b${tool}\\b`).test(installed)) {
      assert.ok(removes.some((r) => new RegExp(`\\b${tool}\\b|--auto-?remove|autoremove`).test(r.cmd)), `${tool} instalado e não removido`);
    }
  }
  if (/\$\{?PHPIZE_DEPS\}?/.test(installed)) {
    assert.ok(removes.some((r) => /PHPIZE_DEPS|autoremove|--auto-?remove/.test(r.cmd)), 'PHPIZE_DEPS instalado e não removido');
  }
});

test('as listas do apt são apagadas no mesmo RUN que instala os pacotes', () => {
  const ins = instructions();
  const idx = ins.findIndex((i) => /^RUN\s/.test(i) && /\bapt(-get)?\s+install\b/.test(i) && /\blibpq-dev\b/.test(i));
  assert.ok(idx >= 0, 'RUN com libpq-dev ausente');
  assert.ok(ins[idx].includes('/var/lib/apt/lists'), '/var/lib/apt/lists não é apagado no mesmo RUN');
});

test('extensões: instaladas como root, antes do USER vscode', () => {
  const ins = instructions();
  const user = ins.findIndex((i) => /^USER\s+vscode\b/.test(i));
  assert.ok(user >= 0, 'USER vscode ausente');
  const targets = Object.keys(PECL).map((name) => [name, ins.findIndex((i) => /^RUN\s/.test(i) && /\bpecl\s+install\b/.test(i) && new RegExp(`${name}[^\\s]*\\.tgz`).test(i))]);
  targets.push(['pdo_pgsql', ins.findIndex((i) => /^RUN\s/.test(i) && /docker-php-ext-install\b.*\bpdo_pgsql\b/.test(i))]);
  for (const [name, idx] of targets) {
    assert.ok(idx >= 0 && idx < user, `${name}: a instalação deve vir antes do USER vscode`);
    const before = ins.slice(0, idx).filter((i) => /^USER\s/.test(i));
    if (before.length) assert.match(before[before.length - 1], /^USER\s+(root|0)\s*$/);
  }
});

test('sem servidores: nada de EXPOSE, VOLUME nem ENTRYPOINT, e o CMD continua sleep infinity', () => {
  const ins = instructions();
  assert.ok(!ins.some((i) => /^(EXPOSE|VOLUME|ENTRYPOINT)\s/.test(i)), 'EXPOSE/VOLUME/ENTRYPOINT não devem existir');
  const cmd = ins.filter((i) => /^CMD\s/.test(i));
  assert.equal(cmd.length, 1);
  assert.match(cmd[0], /sleep["',\s]+infinity/);
  assert.ok(ins.some((i) => /^WORKDIR\s/.test(i)), 'WORKDIR ausente');
});

test('mongodb com SASL desligado: sem libsasl2, snappy ou zstd e sem opção que ligue o SASL', () => {
  const text = readRepoFile('Dockerfile');
  assert.ok(!/libsasl2/.test(text), 'libsasl2-dev não deve ser instalado');
  assert.ok(!/libsnappy|libzstd/.test(text), 'snappy/zstd não devem ser instalados');
  assert.ok(!/mongodb-sasl(=|\s+)(yes|auto|cyrus|1)\b/i.test(text), 'SASL do mongodb não deve ser ligado');
});

test('só Linux amd64: o Dockerfile não fixa outra arquitetura', () => {
  const text = readRepoFile('Dockerfile');
  assert.ok(!/--platform=(?!linux\/amd64)/.test(text));
  assert.ok(!/\b(arm64|aarch64)\b/.test(text));
});

// php.ini: só ganha a linha apc.enable_cli = 1.
test('php.ini tem exatamente uma linha apc.enable_cli = 1 ativa e nenhuma outra opção do APCu', () => {
  const active = readRepoFile('php.ini').split(/\r?\n/).filter((l) => !/^\s*[;#]/.test(l));
  assert.equal(active.filter((l) => /^apc\.enable_cli\s*=\s*1\s*$/.test(l)).length, 1, 'esperada uma linha "apc.enable_cli = 1"');
  assert.equal(active.filter((l) => /^\s*apc\.enable_cli\b/.test(l)).length, 1, 'apc.enable_cli definido mais de uma vez');
  assert.deepEqual(active.filter((l) => /^\s*apc\./.test(l) && !/^apc\.enable_cli\s*=/.test(l)), [], 'outra opção apc.* alterada');
});

test('php.ini mantém as linhas anteriores e não carrega extensões (isso é feito em conf.d)', () => {
  const text = readRepoFile('php.ini');
  assert.ok(text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*[;#]/.test(l)).length >= 2, 'php.ini ficou só com a linha nova');
  assert.ok(!/^\s*(zend_)?extension\s*=/m.test(text), 'as extensões carregam por conf.d, não pelo php.ini');
});

// tests/smoke.php: verificações estáticas do contrato das extensões.
const smoke = () => readRepoFile('tests/smoke.php');
const smokeCode = () => smoke().replace(/^\s*\/\/.*$/gm, '');

test('smoke.php confere as cinco extensões, as de antes e as versões de PECL fixadas no arquivo', () => {
  const t = smoke();
  for (const e of ['ctype', 'curl', 'dom', 'filter', 'json', 'mbstring', 'openssl', 'tokenizer', 'xml', 'xmlwriter', 'zip', 'xdebug', 'apcu', 'redis', 'mongodb', 'pdo_mysql', 'pdo_pgsql']) {
    assert.ok(new RegExp(`['"]${e}['"]`).test(t), `extensão ${e} ausente do smoke.php`);
  }
  assert.match(t, /extension_loaded\(/);
  assert.match(t, /phpversion\(/);
  for (const [name, p] of Object.entries(PECL)) assert.ok(t.includes(`'${p.version}'`), `versão ${p.version} de ${name} ausente do smoke.php`);
});

test('smoke.php confere os drivers do PDO: mysql, pgsql e sqlite', () => {
  const t = smoke();
  assert.match(t, /PDO::getAvailableDrivers\(\)/);
  for (const d of ['mysql', 'pgsql', 'sqlite']) assert.ok(new RegExp(`['"]${d}['"]`).test(t), `driver ${d} ausente`);
});

test('smoke.php: APCu guarda e lê 42 no CLI e apaga a chave', () => {
  const t = smoke();
  assert.match(t, /apcu_store\(\s*'elavora-smoke'\s*,\s*42\s*\)/);
  assert.match(t, /apcu_fetch\(\s*'elavora-smoke'/);
  assert.match(t, /apcu_delete\(\s*'elavora-smoke'\s*\)/);
});

test('smoke.php: redis tem a classe e new Redis() não conecta; mongodb funciona sem servidor', () => {
  const t = smoke();
  assert.match(t, /class_exists\(\s*'Redis'\s*\)/);
  assert.match(t, /new\s+\\?Redis\(\)/);
  assert.match(t, /new\s+\\?MongoDB\\BSON\\ObjectId\(\)/);
  assert.match(t, /\{24\}|!==\s*24|===\s*24/, 'esperada a conferência de 24 caracteres do ObjectId');
  assert.match(t, /ctype_xdigit|preg_match|\[0-9a-f\]/i, 'esperada a conferência de hexadecimal do ObjectId');
  assert.match(t, /new\s+\\?MongoDB\\Driver\\BulkWrite\(\)/);
});

test('smoke.php: a mongodb tem TLS (php --ri mongodb) e o libpq5 está instalado (dpkg -s libpq5)', () => {
  const t = smoke();
  assert.match(t, /php --ri mongodb/);
  assert.ok(t.includes('libmongoc SSL => enabled'), 'texto "libmongoc SSL => enabled" ausente');
  assert.match(t, /dpkg -s libpq5/);
});

test('smoke.php não usa servidor nem rede e continua terminando em "Ambiente PHP validado."', () => {
  const t = smokeCode();
  for (const re of [/fsockopen|stream_socket_client|socket_create/, /->connect\(|->pconnect\(/, /new\s+\\?PDO\(/, /mysqli_connect|new\s+mysqli/, /new\s+\\?MongoDB\\Driver\\Manager/, /curl_init|curl_exec/, /https?:\/\//, /pecl\.php\.net/]) {
    assert.ok(!re.test(t), `smoke.php não deve usar rede ou servidor: ${re}`);
  }
  assert.match(t, /RuntimeException/);
  assert.match(t, /echo 'Ambiente PHP validado\.', PHP_EOL;\s*$/);
});
