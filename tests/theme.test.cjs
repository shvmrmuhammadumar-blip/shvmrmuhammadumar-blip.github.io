const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function loadTypeScript(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const themeModule = loadTypeScript('lib/theme.ts');
const themePalettes = themeModule.themePalettes;
const originalLoad = Module._load;
let colorModule;
try {
  Module._load = function (request, parent, isMain) {
    if (
      request === './theme' &&
      parent?.filename === path.join(root, 'lib', 'theme-color.ts')
    ) {
      return themeModule;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  colorModule = loadTypeScript('lib/theme-color.ts');
} finally {
  Module._load = originalLoad;
}
const { resolveThemeColorForPalette } = colorModule;

function luminance(hex) {
  const raw = hex.replace('#', '');
  const rgb = [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16) / 255);
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('all five themes define a complete semantic color system', () => {
  const required = [
    'bg', 'surface', 'surfaceRaised', 'surfaceSoft', 'text', 'muted', 'dim', 'border',
    'accent', 'accentStrong', 'accentDark', 'accentSoft', 'inverseText', 'mediaBg', 'mediaText', 'shadow', 'like', 'success', 'successSoft',
    'danger', 'dangerSoft', 'verified', 'verifiedSoft', 'chatOutgoing', 'chatOutgoingText',
    'chatIncoming', 'chatIncomingText', 'overlay', 'glass', 'glassBorder', 'focus',
  ];

  assert.deepEqual(Object.keys(themePalettes), ['obsidian', 'light', 'amoled', 'forest', 'sandstone']);
  for (const [name, palette] of Object.entries(themePalettes)) {
    for (const key of required) {
      assert.equal(typeof palette[key], 'string', name + ' is missing ' + key);
    }
  }
});

test('neutral surfaces map to neutral surfaces, never to text or accent colors', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(resolveThemeColorForPalette('#FFFFFF', 'backgroundColor', palette), palette.surface, name + ' white surface');
    assert.equal(resolveThemeColorForPalette('#090C12', 'backgroundColor', palette), palette.bg, name + ' dark canvas');
    assert.equal(resolveThemeColorForPalette('#F2F5F7', 'color', palette), palette.text, name + ' light text');
    assert.equal(resolveThemeColorForPalette('#0B1016', 'color', palette), palette.chatOutgoingText, name + ' dark text');
    assert.equal(resolveThemeColorForPalette('#090C12', 'color', palette), palette.inverseText, name + ' text on accent');
    assert.equal(resolveThemeColorForPalette('#2B3440', 'borderColor', palette), palette.border, name + ' neutral border');
  }
});

test('accent, success, error and verified colors keep their semantic roles in every theme', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(resolveThemeColorForPalette('#D8B879', 'color', palette), palette.accent, name + ' accent');
    assert.equal(resolveThemeColorForPalette('#9EBEAE', 'color', palette), palette.success, name + ' success');
    assert.equal(resolveThemeColorForPalette('#FF647C', 'color', palette), palette.danger, name + ' danger');
    assert.equal(resolveThemeColorForPalette('#3998FF', 'color', palette), palette.verified, name + ' verified');
    assert.equal(resolveThemeColorForPalette('#542B35', 'backgroundColor', palette), palette.dangerSoft, name + ' soft danger fill');
    assert.equal(resolveThemeColorForPalette('#1E2717', 'backgroundColor', palette), palette.accentSoft, name + ' soft accent fill');
  }
});

test('text over semantic buttons uses the correct inverse foreground in every theme', () => {
  const semanticBackgrounds = ['#B9C7D6', '#9EBEAE', '#D8878D', '#8EABC8', '#D58B9A'];
  for (const palette of Object.values(themePalettes)) {
    for (const background of semanticBackgrounds) {
      assert.equal(
        resolveThemeColorForPalette('#F2F5F7', 'color', palette, background),
        palette.inverseText,
      );
    }
  }
});

test('transparent surface and border treatments preserve their original opacity', () => {
  for (const palette of Object.values(themePalettes)) {
    const surface = resolveThemeColorForPalette('rgba(255,255,255,0.08)', 'backgroundColor', palette);
    const border = resolveThemeColorForPalette('rgba(224,232,240,0.12)', 'borderColor', palette);
    assert.match(surface, /, 0\.08\)$/);
    assert.match(border, /, 0\.12\)$/);
  }
});

test('surface hierarchy is ordered correctly for each theme', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    const levels = ['bg', 'surface', 'surfaceRaised', 'surfaceSoft'].map((key) => luminance(palette[key]));
    if (name === 'light') {
      assert.ok(levels[0] < levels[1], name + ' canvas to white surface');
      assert.ok(levels[2] < levels[0], name + ' raised surface to canvas');
      assert.ok(levels[3] < levels[2], name + ' soft surface to raised');
    } else {
      assert.ok(levels[0] < levels[1], name + ' canvas to surface');
      assert.ok(levels[1] < levels[2], name + ' surface to raised');
      assert.ok(levels[2] < levels[3], name + ' raised to soft');
    }
  }
});

test('primary and message text maintain readable contrast', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    for (const surface of ['bg', 'surface', 'surfaceRaised', 'surfaceSoft']) {
      assert.ok(contrast(palette.text, palette[surface]) >= 4.5, name + ' text on ' + surface);
    }
    assert.ok(contrast(palette.chatOutgoingText, palette.chatOutgoing) >= 4.5, name + ' outgoing message');
    assert.ok(contrast(palette.chatIncomingText, palette.chatIncoming) >= 4.5, name + ' incoming message');
    for (const role of ['accent', 'success', 'danger', 'verified', 'like']) {
      assert.ok(contrast(palette.inverseText, palette[role]) >= 4.5, name + ' inverse text on ' + role);
    }
  }
});


test('all themes have distinct visual signatures instead of collapsing into Obsidian', () => {
  const structuralKeys = ['bg', 'surface', 'surfaceRaised', 'surfaceSoft', 'border', 'accent'];
  const signatures = Object.entries(themePalettes).map(([name, palette]) => {
    for (const key of structuralKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(palette, key), name + ' must define ' + key);
    }
    return structuralKeys.map((key) => palette[key]).join('|');
  });

  assert.equal(new Set(signatures).size, 5, 'each theme must have a distinct structural palette');
  assert.equal(themePalettes.amoled.bg, '#000000', 'AMOLED must use a true black canvas');
  assert.notEqual(themePalettes.amoled.surface, themePalettes.obsidian.surface, 'AMOLED surfaces must differ from Obsidian');
  assert.equal(themePalettes.light.surface, '#FFFFFF', 'Light must retain a white primary surface');
  assert.notEqual(themePalettes.forest.bg, themePalettes.obsidian.bg, 'Forest must not reuse Obsidian background');
  assert.notEqual(themePalettes.sandstone.accent, themePalettes.obsidian.accent, 'Sandstone must keep its warm accent identity');
});


test('media canvases, overlay text and shadows do not invert in Light mode', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(resolveThemeColorForPalette('#000000', 'backgroundColor', palette), palette.bg, name + ' regular black surface follows theme');
    assert.equal(resolveThemeColorForPalette('#010101', 'backgroundColor', palette), palette.mediaBg, name + ' explicit media canvas stays black');
    assert.equal(resolveThemeColorForPalette('#FFFFFF', 'color', palette), palette.text, name + ' normal white literal becomes theme text');
    assert.equal(resolveThemeColorForPalette(palette.mediaText, 'color', palette), palette.mediaText, name + ' explicit media overlay text');
    assert.equal(resolveThemeColorForPalette('#FFFFFF', 'color', palette, palette.mediaBg), palette.mediaText, name + ' white text on media canvas');
    assert.equal(resolveThemeColorForPalette('#000000', 'shadowColor', palette), palette.shadow, name + ' shadow');
    const overlay = resolveThemeColorForPalette('rgba(0, 0, 0, 0.48)', 'backgroundColor', palette);
    assert.match(overlay, /, 0\.48\)$/);
  }
});


test('style tokens captured under any selected source theme remap to the same role', () => {
  const targets = Object.entries(themePalettes);
  const backgroundRoles = ['bg', 'surface', 'surfaceRaised', 'surfaceSoft', 'accentDark', 'accentSoft'];
  const foregroundRoles = ['text', 'muted', 'dim', 'accent', 'accentStrong', 'like', 'success', 'danger', 'verified'];
  const borderRoles = ['border'];

  for (const [sourceName, source] of targets) {
    for (const [targetName, target] of targets) {
      for (const role of backgroundRoles) {
        assert.equal(
          resolveThemeColorForPalette(source[role], 'backgroundColor', target),
          target[role],
          sourceName + ' -> ' + targetName + ' background ' + role,
        );
      }
      for (const role of foregroundRoles) {
        assert.equal(
          resolveThemeColorForPalette(source[role], 'color', target),
          target[role],
          sourceName + ' -> ' + targetName + ' foreground ' + role,
        );
      }
      for (const role of borderRoles) {
        assert.equal(
          resolveThemeColorForPalette(source[role], 'borderColor', target),
          target[role],
          sourceName + ' -> ' + targetName + ' border ' + role,
        );
      }
      assert.equal(
        resolveThemeColorForPalette(source.shadow, 'shadowColor', target),
        target.shadow,
        sourceName + ' -> ' + targetName + ' shadow',
      );
    }
  }
});


test('dark neutral legacy surfaces preserve distinct card and page layers in every theme', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(resolveThemeColorForPalette('#000000', 'backgroundColor', palette), palette.bg, name + ' page background');
    assert.equal(resolveThemeColorForPalette('#080808', 'backgroundColor', palette), palette.surface, name + ' dark card');
    assert.equal(resolveThemeColorForPalette('#141414', 'backgroundColor', palette), palette.surfaceRaised, name + ' raised control');
    assert.equal(resolveThemeColorForPalette('#202020', 'backgroundColor', palette), palette.surfaceSoft, name + ' soft surface');
  }
});


test('legacy LUMO brand-lime is treated as the active accent, not status success', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(
      resolveThemeColorForPalette('#C9D9A4', 'backgroundColor', palette),
      palette.accent,
      name + ' legacy lime surface accent',
    );
    assert.equal(
      resolveThemeColorForPalette('#C9D9A4', 'color', palette),
      palette.accent,
      name + ' legacy lime foreground accent',
    );
  }
});

test('paired labels keep contrast on primary buttons, chat bubbles and surfaces', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(
      resolveThemeColorForPalette('#FFFFFF', 'color', palette, '#E0E8F0'),
      palette.inverseText,
      name + ' primary accent button label',
    );
    assert.equal(
      resolveThemeColorForPalette('#FFFFFF', 'color', palette, '#1A2028'),
      palette.chatIncomingText,
      name + ' incoming message label',
    );
    assert.equal(
      resolveThemeColorForPalette('#0B1016', 'color', palette, '#DCE4EC'),
      palette.chatOutgoingText,
      name + ' outgoing message label',
    );
    assert.equal(
      resolveThemeColorForPalette('#FFFFFF', 'color', palette, '#12161C'),
      palette.text,
      name + ' label on surface',
    );
  }
});


test('white UI text defaults to theme text unless an explicit media canvas is supplied', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(resolveThemeColorForPalette('#FFFFFF', 'color', palette), palette.text, name + ' default white text');
    assert.equal(resolveThemeColorForPalette('#FFFFFF', 'color', palette, palette.mediaBg), palette.mediaText, name + ' explicit media white');
    assert.equal(resolveThemeColorForPalette(palette.mediaText, 'color', palette), palette.mediaText, name + ' explicit media token');
    assert.equal(resolveThemeColorForPalette('#FFFFFF', 'backgroundColor', palette), palette.surface, name + ' normal white surface');
    assert.equal(resolveThemeColorForPalette(palette.mediaText, 'backgroundColor', palette), palette.mediaText, name + ' media progress surface');
  }
});


test('text and spinners on danger surfaces use the correct foreground for every theme', () => {
  for (const [name, palette] of Object.entries(themePalettes)) {
    assert.equal(
      resolveThemeColorForPalette('#FFFFFF', 'color', palette, palette.dangerSoft),
      palette.text,
      name + ' dark or soft danger surface foreground',
    );
    assert.equal(
      resolveThemeColorForPalette('#FFFFFF', 'color', palette, palette.like),
      palette.inverseText,
      name + ' like action foreground',
    );
  }
});
