<?php

declare(strict_types=1);

// Smoke test da imagem (docs/ferramentas-de-qualidade.md "Smoke test: tests/smoke.php").
// Roda dentro da imagem construída, como o usuário vscode.

// Versões fixadas: mudam junto com os ARG do Dockerfile, de propósito.
const PHP_CS_FIXER_VERSION = '3.95.27';
const EDITORCONFIG_CHECKER_VERSION = '4.0.2';

if (PHP_MAJOR_VERSION !== 8 || PHP_MINOR_VERSION !== 3) {
    throw new RuntimeException('Esperado PHP 8.3.');
}

foreach (['ctype', 'curl', 'dom', 'filter', 'json', 'mbstring', 'openssl', 'tokenizer', 'xml', 'xmlwriter', 'zip', 'xdebug'] as $extension) {
    if (!extension_loaded($extension)) {
        throw new RuntimeException("Extensao ausente: {$extension}");
    }
}

foreach (['composer --version', 'git --version'] as $command) {
    passthru($command, $status);
    if ($status !== 0) {
        throw new RuntimeException("Ferramenta indisponivel: {$command}");
    }
}

if (function_exists('posix_geteuid') && posix_geteuid() === 0) {
    throw new RuntimeException('O ambiente deve executar como usuario sem privilegios.');
}

/**
 * Roda um comando (pelo nome, sem caminho) e devolve [código de saída, saída].
 *
 * @return array{0: int, 1: string}
 */
function run(string $command): array
{
    $output = [];
    $status = 0;
    exec($command . ' 2>&1', $output, $status);

    return [$status, implode(PHP_EOL, $output)];
}

function removeTree(string $path): void
{
    if (is_dir($path) && !is_link($path)) {
        foreach (scandir($path) ?: [] as $entry) {
            if ($entry !== '.' && $entry !== '..') {
                removeTree($path . DIRECTORY_SEPARATOR . $entry);
            }
        }
        @rmdir($path);
    } elseif (file_exists($path) || is_link($path)) {
        @unlink($path);
    }
}

function makeTempDir(): string
{
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'elavora-smoke-' . bin2hex(random_bytes(6));
    if (!mkdir($dir, 0700)) {
        throw new RuntimeException("Nao foi possivel criar o diretorio temporario {$dir}.");
    }

    return $dir;
}

// Versões no PATH.
foreach (['php-cs-fixer' => PHP_CS_FIXER_VERSION, 'editorconfig-checker' => EDITORCONFIG_CHECKER_VERSION] as $tool => $version) {
    [$status, $output] = run("{$tool} --version");
    echo $output, PHP_EOL;
    if ($status !== 0) {
        throw new RuntimeException("{$tool} --version saiu com {$status}: {$output}");
    }
    if (!str_contains($output, $version)) {
        throw new RuntimeException("{$tool}: esperada a versao {$version}, saida: {$output}");
    }
}

$tmp = makeTempDir();
$cwd = getcwd();

try {
    // PHP-CS-Fixer funciona: em --dry-run, sai com 8 e não altera o arquivo.
    $source = "<?php\nif(true){echo 1;}\n";
    $file = $tmp . DIRECTORY_SEPARATOR . 'fixer.php';
    file_put_contents($file, $source);
    [$status, $output] = run('php-cs-fixer fix --dry-run --using-cache=no --rules=@PER-CS ' . escapeshellarg($file));
    if ($status !== 8) {
        throw new RuntimeException("php-cs-fixer fix --dry-run: esperado codigo 8, obtido {$status}: {$output}");
    }
    if (file_get_contents($file) !== $source) {
        throw new RuntimeException('php-cs-fixer fix --dry-run alterou o arquivo.');
    }

    // editorconfig-checker acusa erro e aceita arquivo correto.
    file_put_contents($tmp . DIRECTORY_SEPARATOR . '.editorconfig', "root = true\n\n[*]\nindent_style = space\n");
    file_put_contents($tmp . DIRECTORY_SEPARATOR . 'ruim.php', "\tx\n");
    file_put_contents($tmp . DIRECTORY_SEPARATOR . 'bom.php', "x\n");
    if (!chdir($tmp)) {
        throw new RuntimeException("editorconfig-checker: nao foi possivel entrar em {$tmp}.");
    }

    [$status, $output] = run('editorconfig-checker ruim.php');
    if ($status === 0) {
        throw new RuntimeException("editorconfig-checker nao acusou erro em ruim.php: {$output}");
    }

    [$status, $output] = run('editorconfig-checker bom.php');
    if ($status !== 0) {
        throw new RuntimeException("editorconfig-checker recusou bom.php (codigo {$status}): {$output}");
    }
} finally {
    if ($cwd !== false) {
        chdir($cwd);
    }
    removeTree($tmp);
}

echo 'Ambiente PHP validado.', PHP_EOL;
