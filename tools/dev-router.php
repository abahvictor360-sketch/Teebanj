<?php
// PHP's development server does not honor .htaccess. Apply equivalent private-file guards.
if (PHP_SAPI !== "cli-server") {
    http_response_code(404);
    exit();
}
$path = rawurldecode(parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH));
if (
    preg_match(
        '~(^|/)\\.|^/(database|tests|tools)/|/config\\.[^/]+|/api/(bootstrap|commerce)\\.php|\\.(sql|md|log|zip)$~i',
        $path,
    )
) {
    http_response_code(404);
    exit();
}
return false;
