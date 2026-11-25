const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const helperPath = path.join(__dirname, '..', 'lib', 'responsive.ts');
const source = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const helperModule = new Module(helperPath, module);
helperModule.filename = helperPath;
helperModule.paths = Module._nodeModulePaths(path.dirname(helperPath));
helperModule._compile(compiled, helperPath);

const {
  getAppContentWidth,
  getProfileLayoutMetrics,
  getStudioBodyWidth,
  getSearchGridMetrics,
  getEventsLayoutMode,
  getMarketGridMetrics,
} = helperModule.exports;

test('app content width accounts for mobile, tablet and desktop navigation', () => {
  assert.equal(getAppContentWidth(280, true), 280);
  assert.equal(getAppContentWidth(320, true), 320);
  assert.equal(getAppContentWidth(768, true), 768);
  assert.equal(getAppContentWidth(899, true), 899);
  assert.equal(getAppContentWidth(900, true), 824);
  assert.equal(getAppContentWidth(1279, true), 1203);
  assert.equal(getAppContentWidth(1280, true), 1044);
  assert.equal(getAppContentWidth(1280, false), 1280);
});

test('studio body width accounts for its own desktop navigation at usable widths', () => {
  assert.equal(getStudioBodyWidth(280), 280);
  assert.equal(getStudioBodyWidth(900), 900);
  assert.equal(getStudioBodyWidth(959), 959);
  assert.equal(getStudioBodyWidth(960), 960);
  assert.equal(getStudioBodyWidth(1160), 1160);
  assert.equal(getStudioBodyWidth(1259), 1259);
  assert.equal(getStudioBodyWidth(1260), 1016);
  assert.equal(getStudioBodyWidth(1440), 1196);
});

test('Search discovery cards reflow cleanly around the LUMO navigation shell', () => {
  const cases = [
    { width: 280, columns: 1 },
    { width: 320, columns: 1 },
    { width: 390, columns: 2 },
    { width: 692, columns: 2 },
    { width: 724, columns: 2 },
    { width: 1044, columns: 3 },
    { width: 1130, columns: 3 },
    { width: 1204, columns: 4 },
    { width: 1440, columns: 4 },
  ];

  for (const item of cases) {
    const metrics = getSearchGridMetrics(item.width);
    assert.equal(metrics.columns, item.columns);
    assert.ok(metrics.cardWidth > 0);
    assert.ok(metrics.cardWidth <= metrics.gridWidth);
    const occupied = metrics.cardWidth * metrics.columns + 14 * (metrics.columns - 1);
    assert.ok(Math.abs(occupied - metrics.gridWidth) < 0.01);
  }
});

test('Events desktop layout stays stable as the tab sidebar expands', () => {
  const cases = [
    { viewport: 899, content: getAppContentWidth(899, true), desktop: false, tablet: true, compact: false },
    { viewport: 900, content: getAppContentWidth(900, true), desktop: false, tablet: true, compact: false },
    { viewport: 1020, content: getAppContentWidth(1020, true), desktop: false, tablet: true, compact: false },
    { viewport: 1039, content: getAppContentWidth(1039, true), desktop: false, tablet: true, compact: false },
    { viewport: 1040, content: getAppContentWidth(1040, true), desktop: false, tablet: true, compact: false },
    { viewport: 1180, content: getAppContentWidth(1180, true), desktop: true, tablet: true, compact: false },
    { viewport: 1279, content: getAppContentWidth(1279, true), desktop: true, tablet: true, compact: false },
    { viewport: 1280, content: getAppContentWidth(1280, true), desktop: true, tablet: true, compact: false },
    { viewport: 1356, content: getAppContentWidth(1356, true), desktop: true, tablet: true, compact: false },
    { viewport: 390, content: getAppContentWidth(390, true), desktop: false, tablet: false, compact: true },
    { viewport: 320, content: getAppContentWidth(320, true), desktop: false, tablet: false, compact: true },
  ];

  for (const item of cases) {
    assert.deepEqual(getEventsLayoutMode(item.viewport, item.content), {
      desktop: item.desktop,
      tablet: item.tablet,
      compact: item.compact,
    });
  }
});

test('Events compact cards wrap actions below event details', () => {
  const eventsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'events.tsx'),
    'utf8',
  );

  assert.match(eventsSource, /eventListItemCompact: \{[^}]*flexWrap: 'wrap'/);
  assert.match(eventsSource, /listEventActionsCompact: \{ width: '100%', flexDirection: 'row'[^}]*paddingLeft: 110/);
});

test('Events keeps one create entry point and removes duplicate empty-state CTAs', () => {
  const eventsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'events.tsx'),
    'utf8',
  );

  assert.equal((eventsSource.match(/onPress=\{\(\) => openCreate\(\)\}/g) ?? []).length, 1);
  assert.doesNotMatch(eventsSource, /emptyCreateButton|styles\.iconButton/);
  assert.match(eventsSource, /No hosted events/);
  assert.match(eventsSource, /myEventsEmptyText:/);
});

test('Events page and horizontal category rail are constrained to the viewport', () => {
  const eventsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'events.tsx'),
    'utf8',
  );

  assert.match(eventsSource, /page: \{[^}]*width: '100%'[^}]*minWidth: 0[^}]*overflow: 'hidden'/);
  assert.match(eventsSource, /pageScroll: \{ flex: 1, width: '100%', minWidth: 0/);
  assert.match(eventsSource, /scrollContent: \{ flexGrow: 1, width: '100%', minWidth: 0/);
  assert.match(eventsSource, /columnsStacked: \{ width: '100%', minWidth: 0, flexDirection: 'column', alignItems: 'stretch'/);
  assert.match(eventsSource, /categoryScroller: \{ width: '100%', maxWidth: '100%', minWidth: 0/);
  assert.match(eventsSource, /emptyState: \{ width: '100%', maxWidth: '100%', minWidth: 0/);
});

test('market grid card widths fit the available content at common breakpoints', () => {
  const cases = [
    { width: 280, columns: 1 },
    { width: 320, columns: 2 },
    { width: 390, columns: 2 },
    { width: 692, columns: 3 },
    { width: 1044, columns: 4 },
    { width: 1222, columns: 4 },
  ];

  for (const item of cases) {
    const metrics = getMarketGridMetrics(item.width);
    assert.equal(metrics.columns, item.columns);
    const occupied = metrics.cardWidth * metrics.columns + 12 * (metrics.columns - 1);
    assert.ok(Math.abs(occupied - metrics.gridWidth) < 0.01);
    assert.ok(metrics.cardWidth > 0);
    assert.ok(metrics.cardWidth <= metrics.gridWidth);
  }
});

test('Events actions drawer keeps secondary tools out of the main toolbar', () => {
  const eventsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'events.tsx'),
    'utf8',
  );

  assert.match(eventsSource, /accessibilityLabel="More Events options"/);
  assert.match(eventsSource, /Ionicons name="menu-outline"/);
  assert.match(eventsSource, /actionsMenuVisible/);
  assert.match(eventsSource, /Personal list/);
  assert.match(eventsSource, /Blocked people/);
  assert.match(eventsSource, /Refresh events/);
  assert.match(eventsSource, /Clear filters/);
  assert.doesNotMatch(eventsSource, /styles\.followingButton|styles\.manageBlocksButton/);
});

test('Events accents and component surfaces follow the active LUMO theme', () => {
  const eventsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'events.tsx'),
    'utf8',
  );

  assert.match(eventsSource, /get accent\(\) \{ return colors\.accent; \}/);
  assert.match(eventsSource, /useThemedStyles\(styles\)/);
  assert.doesNotMatch(eventsSource, /#E9A24D|#F4C27E/);
});

test('Studio sidebar breakpoint uses the space left after the LUMO sidebar', () => {
  const cases = [
    { viewport: 899, insideTabs: true, appContent: 899, studioSidebar: false, body: 899 },
    { viewport: 900, insideTabs: true, appContent: 824, studioSidebar: false, body: 824 },
    { viewport: 1039, insideTabs: true, appContent: 963, studioSidebar: false, body: 963 },
    { viewport: 1279, insideTabs: true, appContent: 1203, studioSidebar: false, body: 1203 },
    { viewport: 1280, insideTabs: true, appContent: 1044, studioSidebar: false, body: 1044 },
    { viewport: 1366, insideTabs: true, appContent: 1130, studioSidebar: false, body: 1130 },
    { viewport: 1396, insideTabs: true, appContent: 1160, studioSidebar: false, body: 1160 },
    { viewport: 1280, insideTabs: false, appContent: 1280, studioSidebar: true, body: 1036 },
    { viewport: 1520, insideTabs: true, appContent: 1284, studioSidebar: true, body: 1040 },
  ];

  for (const item of cases) {
    const contentWidth = getAppContentWidth(item.viewport, item.insideTabs);
    const studioSidebar = contentWidth >= 1260;

    assert.equal(contentWidth, item.appContent);
    assert.equal(studioSidebar, item.studioSidebar);
    assert.equal(getStudioBodyWidth(contentWidth), item.body);
  }

  const frameSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'studio', 'StudioFrame.tsx'),
    'utf8',
  );

  assert.match(frameSource, /const desktop = appContentWidth >= 1260;/);
  assert.ok(frameSource.includes("href: '/creator-studio'"));
  assert.ok(frameSource.includes("router.push('/creator-studio')"));
});

test('Studio entry and legacy subroutes all resolve to the canonical dashboard tree', () => {
  const tabsLayoutSource = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx'), 'utf8');
  assert.ok(tabsLayoutSource.includes("{ label: 'Studio', path: '/creator-studio'"));

  const legacyDir = path.join(__dirname, '..', 'app', '(tabs)', 'studio');
  const canonicalDir = path.join(__dirname, '..', 'app', 'creator-studio');
  const routes = [
    ['index.tsx', '/creator-studio'],
    ['analytics.tsx', '/creator-studio/analytics'],
    ['audience.tsx', '/creator-studio/audience'],
    ['community.tsx', '/creator-studio/community'],
    ['content.tsx', '/creator-studio/content'],
    ['growth.tsx', '/creator-studio/growth'],
    ['media-kit.tsx', '/creator-studio/media-kit'],
    ['monetization.tsx', '/creator-studio/monetization'],
    ['planner.tsx', '/creator-studio/planner'],
    ['account.tsx', '/creator-studio/account'],
  ];

  for (const [legacyFile, target] of routes) {
    const legacySource = fs.readFileSync(path.join(legacyDir, legacyFile), 'utf8');
    const targetFile = target === '/creator-studio'
      ? path.join(canonicalDir, 'index.tsx')
      : path.join(canonicalDir, target.replace('/creator-studio/', '') + '.tsx');

    assert.ok(legacySource.includes('Redirect href="' + target + '"'));
    assert.ok(fs.existsSync(targetFile), 'Missing canonical Studio route: ' + target);
  }
});


test('Perks stays inside the Home modules menu instead of taking a bottom tab slot', () => {
  const tabsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );

  assert.match(tabsSource, /\{ label: 'Perks', path: '\/perks', icon: 'ribbon-outline', section: 'more' \}/);
  assert.match(tabsSource, /<Tabs\.Screen name="perks" options=\{\{ tabBarButton: \(\) => null, headerShown: false \}\} \/>/);
  assert.match(tabsSource, /\.filter\(\(item\) => item\.path !== '\/' && item\.path !== '\/live'\)\s*\.sort\(\(a, b\) =>/);
  assert.match(tabsSource, /const aQuickAction = a\.path === '\/create' \|\| a\.path === '\/profile'/);
  assert.match(tabsSource, /onPress=\{\(\) => setModulesVisible\(true\)\}/);
  assert.match(tabsSource, /Platform\.OS === 'web'/);
  assert.match(tabsSource, /StyleSheet\.absoluteFill,[\s\S]*?zIndex: 10000/);
  const homeTab = tabsSource.indexOf('name="index"');
  const searchTab = tabsSource.indexOf('name="search"');
  const createTab = tabsSource.indexOf('name="create"');
  const messagesTab = tabsSource.indexOf('name="messages"');
  const profileTab = tabsSource.indexOf('name="profile"');
  assert.ok(homeTab < searchTab && searchTab < createTab && createTab < messagesTab && messagesTab < profileTab,
    'Bottom navigation order should be Home, Search, Create, Messages, Profile, with Create centered and Profile last');
  assert.doesNotMatch(tabsSource, /accessibilityLabel="Open profile"/);
});

test('mobile bottom navigation keeps five equal-width tabs and identical icon slots', () => {
  const tabsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );

  assert.match(tabsSource, /tabBarStyle: \{[\s\S]*?width: '100%',[\s\S]*?flexDirection: 'row'/);
  assert.match(tabsSource, /tabBarItemStyle: \{\s*width: '20%',\s*maxWidth: '20%',\s*flexBasis: '20%',\s*flexGrow: 0,\s*flexShrink: 0,\s*minWidth: 0,/);
  assert.match(tabsSource, /tabBarIconStyle: \{\s*width: '100%',\s*height: 44,/);
  assert.match(tabsSource, /tabIconSlot: \{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' \}/);
  assert.equal((tabsSource.match(/<View style=\{styles\.tabIconSlot\}>/g) ?? []).length, 2);
  assert.equal((tabsSource.match(/tabBarIcon: icon\(/g) ?? []).length, 4);
  assert.match(tabsSource, /height: 62,[\s\S]*?paddingHorizontal: 6,/);
  assert.match(tabsSource, /const isCompactPhone = windowWidth < 380;/);
  assert.match(tabsSource, /headerRightCompact: \{\s*gap: 5,/);
  assert.match(tabsSource, /headerTitleContainerStyle: \{ flex: 1, minWidth: 0, marginRight: 4 \}/);
});

test('Ionicons font is registered at the root for early web preloading', () => {
  const rootSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '_layout.tsx'),
    'utf8',
  );

  assert.match(rootSource, /import \{ useFonts \} from 'expo-font'/);
  assert.match(rootSource, /import Ionicons from '@expo\/vector-icons\/Ionicons'/);
  assert.match(rootSource, /useFonts\(Ionicons\.font\)/);
});

test('Home header keeps the inline profile search between the Lumo brand and modules', () => {
  const tabsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );

  assert.match(tabsSource, /function HomeHeaderTitle\(\{ showWord \}: \{ showWord: boolean \}\)/);
  assert.match(tabsSource, /<BrandTitle showWord=\{showWord\} \/>[\s\S]*?<View style=\{lumoStyles\.headerProfileSearch\}>/);
  assert.match(tabsSource, /<HomeHeaderTitle showWord=\{isTablet\} \/>/);
  assert.match(tabsSource, /placeholder="Search profiles"/);
  assert.match(tabsSource, /onChangeText=\{setQuery\}/);
});

test('Search landing hides the intro and trending topics, showing active creators when focused', () => {
  const searchSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'search.tsx'),
    'utf8',
  );

  assert.doesNotMatch(searchSource, /Find people, posts and communities across LUMO\./);
  assert.doesNotMatch(searchSource, /Trending on LUMO/);
  assert.doesNotMatch(searchSource, /Topics appearing often in recent posts/);
  const focusPanel = searchSource.indexOf('{isFocusPanel ?');
  const creators = searchSource.indexOf('Creators to discover');
  const landingPanel = searchSource.indexOf('{isLanding ?');
  assert.ok(focusPanel >= 0 && creators > focusPanel && creators < landingPanel);
  assert.match(searchSource, /People actively sharing on LUMO/);
  assert.match(searchSource, /subtitle: 'Active creator'/);
  assert.match(searchSource, /personBioMuted/);
  assert.match(searchSource, /onFocus=\{\(\) => \{\s*setFocused\(true\)/);
});

test('Home feed filter tabs shrink within narrow viewports instead of overlapping', () => {
  const feedSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'),
    'utf8',
  );

  assert.match(feedSource, /filterRow: \{[^}]*paddingHorizontal: 12/);
  assert.match(feedSource, /filterTab: \{ flex: 1, minWidth: 0/);
  assert.match(feedSource, /filterText: \{ flexShrink: 1/);
});


test('Home shell keeps enough width for its horizontal header between tablet breakpoints', () => {
  const tabsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );

  assert.match(tabsSource, /const isTablet = windowWidth >= 900;/);
  assert.match(tabsSource, /const isDesktop = windowWidth >= 1280;/);
  assert.match(tabsSource, /headerProfileSearch: \{[^}]*maxWidth: 440/);
  assert.equal(getAppContentWidth(899, true), 899);
  assert.equal(getAppContentWidth(900, true), 824);
  assert.equal(getAppContentWidth(1279, true), 1203);
  assert.equal(getAppContentWidth(1280, true), 1044);
});


test('People search results can be dismissed without removing suggested creators', () => {
  const searchSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'search.tsx'),
    'utf8',
  );

  assert.match(searchSource, /const removable = items === results && scope === 'People' && query\.trim\(\)\.length > 0/);
  assert.match(searchSource, /removePersonButton/);
  assert.match(searchSource, /setResults\(\(current\) => current\.filter\(\(result\) => result\.id !== item\.id\)\)/);
  assert.match(searchSource, /Remove.*from search results/);
});

test('Native map panel supports swipe and tap expansion', () => {
  const mapSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'MapScreen.native.tsx'),
    'utf8',
  );

  assert.match(mapSource, /PanResponder\.create/);
  assert.match(mapSource, /onMoveShouldSetPanResponderCapture/);
  assert.match(mapSource, /Animated\.View style=\{\[lumoStyles\.bottomPanel/);
  assert.match(mapSource, /setPanelExpanded\(\(current\) => !current\)/);
  assert.match(mapSource, /Collapse map panel/);
});

test('Creator Studio dashboard switches to readable phone cards and a stacked layout', () => {
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'creator-studio', 'index.tsx'),
    'utf8',
  );
  const frameSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'studio', 'StudioFrame.tsx'),
    'utf8',
  );

  assert.match(dashboardSource, /const isMobile = contentWidth < 640/);
  assert.match(dashboardSource, /metricCardNarrowMobile/);
  assert.match(dashboardSource, /mobilePostStats/);
  assert.match(dashboardSource, /tableHeaderMobile: \{ display: 'none' \}/);
  assert.match(dashboardSource, /quickActionsMobile/);
  assert.match(frameSource, /bodyContentCompact/);
  assert.match(frameSource, /contentWidthCompact/);
});


test('Web map panel has the same draggable and expandable handle as native', () => {
  const mapSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'MapScreen.web.tsx'),
    'utf8',
  );

  assert.match(mapSource, /PanResponder\.create/);
  assert.match(mapSource, /onMoveShouldSetPanResponderCapture/);
  assert.match(mapSource, /Animated\.View style=\{\[lumoStyles\.bottomPanel/);
  assert.match(mapSource, /expandedPanelContent/);
  assert.match(mapSource, /setPanelExpanded\(\(current\) => !current\)/);
});


test('Creator Studio keeps small supporting text readable across every Studio page', () => {
  const themeSource = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'theme-styles.ts'),
    'utf8',
  );
  const accountSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'creator-studio', 'account.tsx'),
    'utf8',
  );

  assert.match(themeSource, /export function useStudioStyles/);
  assert.match(themeSource, /typeof fontSize === 'number' && fontSize < 10/);
  assert.match(accountSource, /useStudioStyles/);
});

test('Creator Studio open analytics exclude completion events and paginate full history', () => {
  const dataSource = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'studio-data.ts'),
    'utf8',
  );
  const analyticsSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'creator-studio', 'analytics.tsx'),
    'utf8',
  );

  assert.match(dataSource, /\.eq\('event_type', 'open'\)/);
  assert.match(dataSource, /const pageSize = 1000/);
  assert.match(dataSource, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(analyticsSource, /loadCreatorContentEvents\(userId, since\)/);
});

test('Creator Studio planner rejects invalid calendar dates and confirms plan deletion', () => {
  const plannerSource = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'creator-studio', 'planner.tsx'),
    'utf8',
  );

  assert.match(plannerSource, /const isRealDate = parsed\.getFullYear\(\) === year/);
  assert.match(plannerSource, /parsed\.getMonth\(\) === month - 1/);
  assert.match(plannerSource, /Alert\.alert\(/);
  assert.match(plannerSource, /onPress: \(\) => void removePlan\(plan\)/);
});


test('Creator Studio desktop content keeps a measurable flex column beside the sidebar', () => {
  const frameSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'studio', 'StudioFrame.tsx'),
    'utf8',
  );

  assert.match(frameSource, /main: \{[^}]*width: '100%'[^}]*minWidth: 0/);
  assert.match(frameSource, /sidebar: \{[^}]*flexBasis: 244[^}]*flexShrink: 0/);
  assert.match(frameSource, /const desktop = appContentWidth >= 1260/);
  assert.match(frameSource, /workspace: \{[^}]*flex: 1[^}]*minWidth: 0[^}]*minHeight: 0/);
  assert.match(frameSource, /mobileNavShell/);
  assert.match(frameSource, /body: \{[^}]*width: '100%'[^}]*minWidth: 0[^}]*minHeight: 0/);
  assert.match(frameSource, /bodyContent: \{[^}]*width: '100%'[^}]*flexGrow: 1/);
});


test('Profile grid and opened posts fit the exact Lumo shell width at every breakpoint', () => {
  const cases = [
    { width: 320, height: 740, content: 320, desktop: false, grid: 288, tile: 140, wide: false, media: 280, mediaHeight: 308 },
    { width: 320, height: 568, content: 320, desktop: false, grid: 288, tile: 140, wide: false, media: 280, mediaHeight: 305 },
    { width: 390, height: 390, content: 390, desktop: false, grid: 358, tile: 175, wide: false, media: 350, mediaHeight: 184 },
    { width: 390, height: 844, content: 390, desktop: false, grid: 358, tile: 175, wide: false, media: 350, mediaHeight: 385 },
    { width: 899, height: 900, content: 899, desktop: false, grid: 867, tile: 429.5, wide: false, media: 720, mediaHeight: 530 },
    { width: 900, height: 900, content: 824, desktop: false, grid: 792, tile: 392, wide: false, media: 720, mediaHeight: 530 },
    { width: 901, height: 768, content: 825, desktop: false, grid: 793, tile: 392.5, wide: false, media: 720, mediaHeight: 441 },
    { width: 900, height: 600, content: 824, desktop: false, grid: 792, tile: 392, wide: false, media: 720, mediaHeight: 326 },
    { width: 960, height: 900, content: 884, desktop: false, grid: 852, tile: 422, wide: false, media: 720, mediaHeight: 530 },
    { width: 1040, height: 900, content: 964, desktop: false, grid: 932, tile: 462, wide: false, media: 720, mediaHeight: 530 },
    { width: 1055, height: 900, content: 979, desktop: false, grid: 947, tile: 469.5, wide: false, media: 720, mediaHeight: 530 },
    { width: 1056, height: 900, content: 980, desktop: true, grid: 588, tile: 290, wide: true, media: '100%', mediaHeight: 558 },
    { width: 1279, height: 900, content: 1203, desktop: true, grid: 811, tile: 401.5, wide: true, media: '100%', mediaHeight: 640 },
    { width: 1280, height: 640, content: 1044, desktop: true, grid: 652, tile: 322, wide: false, media: 720, mediaHeight: 354 },
    { width: 1280, height: 900, content: 1044, desktop: true, grid: 652, tile: 322, wide: true, media: '100%', mediaHeight: 601 },
    { width: 1440, height: 960, content: 1204, desktop: true, grid: 812, tile: 402, wide: true, media: '100%', mediaHeight: 640 },
  ];

  for (const item of cases) {
    const metrics = getProfileLayoutMetrics(item.width, item.height, true);
    assert.equal(metrics.contentWidth, item.content);
    assert.equal(metrics.desktopProfile, item.desktop);
    assert.equal(metrics.gridWidth, item.grid);
    assert.equal(metrics.tileWidth, item.tile);
    assert.equal(metrics.widePost, item.wide);
    assert.equal(metrics.postMediaWidth, item.media);
    assert.equal(metrics.postMediaHeight, item.mediaHeight);

    if (metrics.postMediaWidth !== '100%') {
      assert.ok(metrics.postMediaWidth <= item.width - 32);
      assert.ok(metrics.postMediaWidth <= 720);
    }
    assert.ok(metrics.tileWidth * 2 + 8 <= metrics.gridWidth + 0.01);
  }
});

test('Profile post viewer switches layout using the real content width after the LUMO rail', () => {
  const at900 = getProfileLayoutMetrics(900, 900, true);
  const at1024 = getProfileLayoutMetrics(1024, 900, true);
  const justBelowSplit = getProfileLayoutMetrics(1055, 900, true);
  const split = getProfileLayoutMetrics(1056, 900, true);
  const shortSplit = getProfileLayoutMetrics(1056, 699, true);

  assert.equal(at900.contentWidth, 824);
  assert.equal(at900.widePost, false);
  assert.equal(at900.postMediaWidth, 720);
  assert.equal(at1024.widePost, false);
  assert.equal(justBelowSplit.contentWidth, 979);
  assert.equal(justBelowSplit.widePost, false);
  assert.equal(split.contentWidth, 980);
  assert.equal(split.widePost, true);
  assert.equal(split.postMediaWidth, '100%');
  assert.equal(split.postMediaHeight, 558);
  assert.equal(shortSplit.widePost, false);
  assert.equal(shortSplit.postMediaWidth, 720);
  assert.ok(split.postMediaHeight + 106 <= 900);
});

test('Profile post media frames cannot grow wider than their media viewport', () => {
  const profileSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'ProfileView.tsx'),
    'utf8',
  );
  assert.match(profileSource, /getProfileLayoutMetrics\(/);
  assert.match(profileSource, /postMediaWidth/);
  assert.match(profileSource, /postImageFrame: \{[\s\S]*?width: "100%"[\s\S]*?marginHorizontal: 0/);
  assert.match(profileSource, /postMediaUnavailable: \{[\s\S]*?marginHorizontal: 0/);
  assert.match(profileSource, /desktopPostMediaWrap: \{[\s\S]*?maxWidth: "100%"/);
  assert.match(profileSource, /modalScreen: \{[\s\S]*?width: "100%"[\s\S]*?minWidth: 0[\s\S]*?overflow: "hidden"/);
  assert.match(profileSource, /postViewerWideLayout: \{[\s\S]*?alignItems: "stretch"/);
  assert.match(profileSource, /postViewerDetailsCard: \{[\s\S]*?width: "36%"[\s\S]*?minWidth: 320[\s\S]*?minHeight: 0/);
  assert.match(profileSource, /postViewerCompactScroll: \{[\s\S]*?width: "100%"[\s\S]*?minWidth: 0[\s\S]*?minHeight: 0/);
  assert.match(profileSource, /postViewerActionsGrid: \{[\s\S]*?flexWrap: "nowrap"/);
  assert.match(profileSource, /postViewerActionCard: \{[\s\S]*?minHeight: 42[\s\S]*?height: 42/);
  assert.match(profileSource, /postViewerSaveAction: \{[\s\S]*?marginLeft: "auto"/);
  assert.doesNotMatch(profileSource, /postViewerCommentsButton|COMMENTS & REPLIES/);
  assert.match(profileSource, /PanResponder\.create/);
  assert.match(profileSource, /imageZoomResponder\.panHandlers/);
  assert.match(profileSource, /Math\.min\(4,/);
  assert.match(profileSource, /imagePressTimerRef\.current = setTimeout/);
  assert.match(profileSource, /onPress=\{openImageViewer\}/);
  assert.match(profileSource, /postViewerHeader: \{[\s\S]*?height: Platform\.OS === "android" \? 100 : 76/);
  assert.match(profileSource, /selectedPost\?\.user_id === me/);
  assert.match(profileSource, /accessibilityLabel="Delete post"/);
  assert.match(profileSource, /requestDeleteSelectedPost/);
  assert.match(profileSource, /\.eq\("user_id", me\)/);
  assert.match(profileSource, /setPosts\(\(current\) => current\.filter\(\(item\) => item\.id !== selectedPost\.id\)\)/);
  assert.match(profileSource, /usePreferences\(\)/);
  assert.match(profileSource, /t\(locale, "Delete this post\?"\)/);
  assert.match(profileSource, /t\(locale, "This post will be permanently deleted\. This action cannot be undone\."\)/);
  assert.match(profileSource, /postViewerMediaCanvas: \{[\s\S]*?overflow: "hidden"/);
  assert.match(profileSource, /postViewerCompactContent: \{[\s\S]*?maxWidth: 860/);
  assert.doesNotMatch(profileSource, /postCommentsAction = \(/);
  assert.doesNotMatch(profileSource, /height: postMediaHeight \+ 62/);

  const giftViewerSource = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'gift-viewer-html.ts'),
    'utf8',
  );
  assert.match(giftViewerSource, /camera-controls/);
  assert.match(giftViewerSource, /disable-zoom/);
  assert.match(giftViewerSource, /disable-pan/);
  assert.match(giftViewerSource, /min-camera-orbit="auto 75deg auto"/);
  assert.match(giftViewerSource, /max-camera-orbit="auto 75deg auto"/);
  assert.match(giftViewerSource, /touch-action: pan-y/);
  assert.doesNotMatch(giftViewerSource, /auto-rotate|rotation-per-second/);
});
