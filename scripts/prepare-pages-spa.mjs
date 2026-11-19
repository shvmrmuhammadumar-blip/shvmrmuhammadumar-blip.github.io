import { readFile, writeFile } from 'node:fs/promises';

const indexPath = 'dist/index.html';
let html = await readFile(indexPath, 'utf8');

const restoreRoute = `<script>
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var requestedPath = params.get('__lumo_route');
    if (requestedPath && requestedPath.charAt(0) === '/' && requestedPath.charAt(1) !== '/') {
      window.history.replaceState(null, '', requestedPath);
    }
  } catch (_) {}
})();
</script>`;

if (!html.includes('__lumo_route')) {
  html = html.replace('<head>', '<head>\\n' + restoreRoute);
}
await writeFile(indexPath, html, 'utf8');

const fallback = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LUMO</title>
  <script>
    (function () {
      var requestedPath = window.location.pathname + window.location.search + window.location.hash;
      window.location.replace('/?__lumo_route=' + encodeURIComponent(requestedPath));
    })();
  </script>
</head>
<body></body>
</html>`;

await writeFile('dist/404.html', fallback, 'utf8');
