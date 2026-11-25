const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const studioDir = path.join(root, 'app', 'creator-studio');
const componentDir = path.join(root, 'components', 'studio');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('every Creator Studio destination has a real screen and shared frame', () => {
  const routes = [
    'index.tsx', 'analytics.tsx', 'audience.tsx', 'community.tsx',
    'content.tsx', 'growth.tsx', 'media-kit.tsx', 'monetization.tsx',
    'planner.tsx', 'account.tsx',
  ];

  for (const route of routes) {
    const file = path.join(studioDir, route);
    assert.ok(fs.existsSync(file), 'Missing Studio screen: ' + route);
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /<StudioFrame\b/, route + ' must use the shared Studio frame');
    assert.match(source, /useStudioStyles|useThemedStyles/, route + ' must follow the selected theme');
  }
});

test('Creator Studio text styles do not fall below 10 px', () => {
  const files = [
    ...fs.readdirSync(studioDir).filter((name) => name.endsWith('.tsx') && name !== '_layout.tsx').map((name) => path.join(studioDir, name)),
    ...fs.readdirSync(componentDir).filter((name) => name.endsWith('.tsx')).map((name) => path.join(componentDir, name)),
  ];
  const small = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
      const size = Number(match[1]);
      if (size < 10) small.push(path.basename(file) + ': ' + size);
    }
  }

  assert.deepEqual(small, []);
});

test('Dashboard analytics read every page of recorded opens and follower history', () => {
  const source = read('lib/studio-data.ts');
  assert.match(source, /loadCreatorContentEvents/);
  assert.match(source, /loadCreatorFollowerDates/);
  assert.equal((source.match(/\.range\(from, from \+ pageSize - 1\)/g) ?? []).length, 2);
  assert.match(source, /\.eq\('event_type', 'open'\)/);
  assert.doesNotMatch(source, /limit\(1500\)|limit\(2000\)/);
});

test('Analytics all-time mode uses the full event history, not a 1500-row sample', () => {
  const source = read('app/creator-studio/analytics.tsx');
  assert.match(source, /loadCreatorContentEvents\(userId, since\)/);
  assert.match(source, /period === 'all' && oldestEvent/);
  assert.match(source, /All-time content activity/);
  assert.doesNotMatch(source, /limit\(1500\)/);
});

test('Account screen persists validated creator settings separately from platform role', () => {
  const source = read('app/creator-studio/account.tsx');
  assert.match(source, /\.from\('creator_settings'\)/);
  assert.match(source, /\.upsert\(/);
  assert.match(source, /account_type/);
  assert.match(source, /contact_email/);
  assert.match(source, /website_url/);
  assert.match(source, /getPlatformRoles\(userId\)/);
  assert.match(source, /valid website address/i);
});

test('Studio navigation and filter controls retain usable touch dimensions', () => {
  const frame = read('components/studio/StudioFrame.tsx');
  const widgets = read('components/studio/StudioWidgets.tsx');
  assert.match(frame, /navItemCompact: \{\s*minHeight: 40/);
  assert.match(frame, /exitButtonCompact: \{ width: 40, minHeight: 40/);
  assert.match(frame, /navItem: \{\s*minHeight: 46/);
  assert.match(widgets, /chip: \{\s*minHeight: 40/);
  assert.match(widgets, /emptyAction: \{\s*minHeight: 42/);
  const planner = read('app/creator-studio/planner.tsx');
  assert.match(planner, /actionButton: \{ minHeight: 40/);
  assert.match(planner, /deleteButton: \{ minHeight: 40, width: 40/);
});

test('Planner validates real calendar dates before saving a schedule', () => {
  const source = read('app/creator-studio/planner.tsx');
  assert.match(source, /const parsed = new Date\(year, month - 1, day/);
  assert.match(source, /parsed\.getFullYear\(\) === year/);
  assert.match(source, /parsed\.getMonth\(\) === month - 1/);
  assert.match(source, /parsed\.getDate\(\) === day/);
});
