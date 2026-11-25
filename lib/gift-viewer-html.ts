const MODEL_VIEWER_SCRIPT = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js';

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildGiftViewerHtml(modelUrl: string, posterUrl?: string | null, backgroundColor = '#000000', colorScheme: 'light' | 'dark' = 'dark') {
  const src = escapeAttribute(modelUrl);
  const poster = posterUrl ? `poster="${escapeAttribute(posterUrl)}"` : '';
  const background = escapeAttribute(backgroundColor);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <meta name="color-scheme" content="${colorScheme}" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: ${background}; }
    body { display: flex; align-items: center; justify-content: center; }
    model-viewer {
      width: 100%; height: 100%; display: block; background: ${background};
      --poster-color: ${background};
      /* Horizontal gestures rotate the model; vertical gestures never orbit it. */
      touch-action: pan-y;
      outline: none;
    }
  </style>
  <script type="module" src="${MODEL_VIEWER_SCRIPT}"></script>
</head>
<body>
  <model-viewer
    src="${src}"
    ${poster}
    alt="Interactive LUMO 3D gift"
    camera-controls
    disable-zoom
    disable-pan
    interaction-prompt="none"
    loading="lazy"
    reveal="auto"
    shadow-intensity="0.8"
    exposure="1.05"
    camera-orbit="0deg 75deg auto"
    min-camera-orbit="auto 75deg auto"
    max-camera-orbit="auto 75deg auto"
  ></model-viewer>
</body>
</html>`;
}
