<?php

declare(strict_types=1);

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

echo 'Ambiente PHP validado.', PHP_EOL;
