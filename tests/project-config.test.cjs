const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));

function readManifestVersion(entryPath, expectedName) {
  let directory = path.dirname(entryPath);
  while (directory !== path.dirname(directory)) {
    const manifestPath = path.join(directory, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.name === expectedName) return manifest.version;
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Could not find installed package version: ${expectedName}`);
}

test('Android and iOS share a valid, non-placeholder app identifier', () => {
  assert.equal(app.android.package, app.ios.bundleIdentifier);
  assert.match(app.android.package, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/);
  assert.doesNotMatch(app.android.package, /yourname|example|placeholder/i);
});

test('Expo Font is installed and registered for the SDK 58 app', () => {
  assert.match(pkg.dependencies.expo, /^\^58\./);
  assert.match(pkg.dependencies['expo-font'], /^~58\./);
  assert.ok(app.plugins.includes('expo-font'));
  assert.match(readManifestVersion(require.resolve('expo-font'), 'expo-font'), /^58\.0\./);
});

test('Native runtime versions stay on the Expo 58 compatibility line', () => {
  assert.match(readManifestVersion(require.resolve('expo'), 'expo'), /^58\.0\./);
  assert.match(pkg.dependencies['react-native'], /^0\.88\./);
  assert.equal(pkg.dependencies.react, '19.3.0');
  assert.match(readManifestVersion(require.resolve('expo-router'), 'expo-router'), /^58\./);
  assert.equal(
    readManifestVersion(require.resolve('@config-plugins/react-native-webrtc'), '@config-plugins/react-native-webrtc'),
    '15.0.2',
  );
  const webRtcPlugin = require('@config-plugins/react-native-webrtc/package.json');
  assert.match(webRtcPlugin.peerDependencies.expo, /^>=56/);
});

test('Expo Router uses the CommonJS-compatible query-string release', () => {
  const routerDirectory = path.dirname(require.resolve('expo-router'));
  const queryStringEntry = require.resolve('query-string', { paths: [routerDirectory] });
  assert.equal(readManifestVersion(queryStringEntry, '@marmelab/query-string'), '7.1.4');
  assert.equal(pkg.dependencies['query-string'], 'npm:@marmelab/query-string@7.1.4');
  assert.equal(
    readManifestVersion(require.resolve('@marmelab/decode-uri-component'), '@marmelab/decode-uri-component'),
    '0.2.3',
  );

  const queryString = require(queryStringEntry);
  assert.equal(typeof queryString.stringify, 'function');
  assert.deepEqual({ ...queryString.parse('?name=Lumo%20Social') }, { name: 'Lumo Social' });
  assert.equal(queryString.stringify({ name: 'Lumo Social' }), 'name=Lumo%20Social');

  assert.equal(readManifestVersion(require.resolve('postcss'), 'postcss'), '8.5.33');
  const postcss = require('postcss');
  assert.equal(postcss.parse('a { color: red }').nodes[0].selector, 'a');
});

test('Core routes/components and EAS build profiles exist', () => {
  for (const file of [
    'app/(tabs)/index.tsx',
    'app/(tabs)/messages.tsx',
    'app/(tabs)/search.tsx',
    'app/chat/chat-screen.tsx',
    'components/ProfileView.tsx',
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `Missing route/component: ${file}`);
  }
  for (const profile of ['development', 'preview', 'production']) {
    assert.ok(eas.build[profile], `Missing EAS profile: ${profile}`);
  }
});

test('Expo build tooling keeps the SDK 58 Metro and minimatch compatibility overrides', () => {
  const fingerprintDirectory = path.dirname(require.resolve('@expo/fingerprint'));
  const fingerprintMinimatch = require.resolve('minimatch', { paths: [fingerprintDirectory] });

  assert.equal(readManifestVersion(fingerprintMinimatch, 'minimatch'), '11.0.8');
  assert.equal(pkg.overrides['@expo/fingerprint'].minimatch, '11.0.8');
  assert.match(readManifestVersion(require.resolve('metro'), 'metro'), /^0\.87\./);
  assert.equal(fs.existsSync(path.join(root, 'patches', 'metro+0.83.3.patch')), false);

  const minimatchModule = require(fingerprintMinimatch);
  const minimatch = minimatchModule.minimatch ?? minimatchModule;
  assert.equal(minimatch('app/(tabs)/index.tsx', '**/*.tsx'), true);
});


test('Root navigator only registers existing Market routes', () => {
  const rootLayout = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');

  assert.match(rootLayout, /name="market\/create"/);
  assert.match(rootLayout, /name="market\/originals\/manage"/);
  assert.match(rootLayout, /name="market\/originals\/\[slug\]"/);
  assert.match(rootLayout, /name="market\/store\/create"/);
  assert.match(rootLayout, /name="market\/store\/\[slug\]"/);
  assert.doesNotMatch(rootLayout, /name="market\/\[id\]"/);
  assert.doesNotMatch(rootLayout, /name="market\/store\/manage(?:\/\[id\])?"/);
});
