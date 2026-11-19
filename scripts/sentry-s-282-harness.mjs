// Repro harness for #282 — Sentry OPENCODE-MOBILE-S ("Maximum update depth
// exceeded", class setState through VirtualizedList._updateCellsToRender).
//
// What it does: renders the REAL VirtualizedList from the installed
// react-native 0.81.5 tree (node_modules/react-native/node_modules/
// @react-native/virtualized-lists, Flow stripped + CJS via @babel/core) under
// react-test-renderer 19.1.0 (same React 19.1 reconciler family as the app),
// with the session screen's exact list props (inverted +
// maintainVisibleContentPosition, no getItemLayout, no onViewableItemsChanged)
// and drives it the way the #282 recipe drives the device: a streaming
// assistant reply whose row grows per token (cell onLayout with a new height),
// scroll events while tokens stream, focus-capture taps into/out of rows,
// scrollToIndex Previous/Next navigation retries, and new messages unshifted
// at index 0 (MVCP shift).
//
// Success = a scenario throws React's "Maximum update depth exceeded".
// A no-throw run is also a result: it reports render/setState counts and
// which ingredients were exercised, so the fix lead knows what did NOT loop.
//
// Prerequisites (NOT repo deps — install once, --no-save):
//   npm install --no-save react-test-renderer@19.1.0
// Run:
//   node scripts/sentry-s-282-harness.mjs [--scenario A|B|C|D|all] [--tokens N]
// Exit code 0 = harness ran to completion (throw or no-throw both reported
// on stdout); exit 2 = harness itself failed (setup error, not a repro).
//
// Deliberate deviations from the device (recorded, not hidden):
// - FlatList is skipped; VirtualizedList is rendered directly. FlatList is a
//   thin wrapper that forwards these props unchanged, and the S stack names
//   VirtualizedList._updateCellsToRender, not FlatList.
// - No CellRendererComponent (app uses MessageCell, which forwards onLayout
//   and records frames; the loop under test lives in VirtualizedList).
// - Host components (View/ScrollView) are stubs: layout/scroll events are
//   fired synthetically by this script, exactly as the native side would
//   deliver them (onLayout per cell resize, onScroll per offset change,
//   onContentSizeChange per total-height change).
// - Timers are real (50ms updateCellsBatchingPeriod), flushed with async act.

import { createRequire } from 'node:module';
import { transformFileSync } from '@babel/core';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, symlinkSync, lstatSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const hermesParser = require('hermes-parser');
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = '/tmp/s282-vl-build';
const VL_SRC = join(repoRoot, 'node_modules/react-native/node_modules/@react-native/virtualized-lists');
const RN_ROOT = join(repoRoot, 'node_modules/react-native');

const args = process.argv.slice(2);
const scenarioArg = (args.find(a => a.startsWith('--scenario=')) || '--scenario=all').split('=')[1];
const tokenSteps = Number((args.find(a => a.startsWith('--tokens=')) || '--tokens=40').split('=')[1] || 40);
const itemCount = Number((args.find(a => a.startsWith('--items=')) || '--items=30').split('=')[1] || 30);

// ---------------------------------------------------------------------------
// 1. Babel-transform the real VirtualizedList sources (Flow + ESM -> CJS).
// ---------------------------------------------------------------------------
function transformTree(srcDir, outDir) {
  for (const entry of readdirSync(srcDir)) {
    const src = join(srcDir, entry);
    const out = join(outDir, entry);
    if (statSync(src).isDirectory()) {
      mkdirSync(out, { recursive: true });
      transformTree(src, out);
      continue;
    }
    if (!entry.endsWith('.js')) continue;
    // @babel/parser cannot parse Flow `as` casts (used 15x in
    // VirtualizedList.js); the repo ships hermes-parser, which can — the
    // same parser Metro uses for this tree. Babel only accepts a parser
    // override as a plugin property (parserOverride).
    const hermesPlugin = {
      parserOverride: (text) => hermesParser.parse(text, { babel: true }),
    };
    const { code } = transformFileSync(src, {
      plugins: [
        hermesPlugin,
        '@babel/plugin-transform-flow-strip-types',
        '@babel/plugin-transform-react-jsx',
        '@babel/plugin-transform-modules-commonjs',
      ],
      configFile: false,
      babelrc: false,
    });
    writeFileSync(out, code);
  }
}

if (!existsSync(join(BUILD_DIR, 'Lists/VirtualizedList.js'))) {
  mkdirSync(BUILD_DIR, { recursive: true });
  transformTree(VL_SRC, BUILD_DIR);
}
// The build lives in /tmp, so its bare imports (react, invariant, ...) need
// the repo's node_modules: link it in (symlink, not a copy).
try {
  if (lstatSync(join(BUILD_DIR, 'node_modules')).isSymbolicLink()) {
    // already linked
  }
} catch {
  symlinkSync(join(repoRoot, 'node_modules'), join(BUILD_DIR, 'node_modules'), 'dir');
}

// ---------------------------------------------------------------------------
// 2. Stub 'react-native' + the feature-flags deep import.
//    Feature-flag defaults are parsed from the REAL flags file so the harness
//    runs with the shipped defaults (notably
//    deferFlatListFocusChangeRenderUpdate = false -> focus capture calls
//    _updateCellsToRender() synchronously).
// ---------------------------------------------------------------------------
const React = require('react');

const View = React.forwardRef((props, ref) =>
  React.createElement('View', { ...props, ref }));
View.displayName = 'View';

const scrollToCalls = [];
const ScrollView = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => ({
    scrollTo: ({ x = 0, y = 0, animated = false } = {}) => {
      scrollToCalls.push({ x, y, animated, at: Date.now() });
    },
    scrollToEnd: () => {},
    flashScrollIndicators: () => {},
    getScrollResponder: () => null,
    getScrollableNode: () => 1,
    getScrollRef: () => null,
    setNativeProps: () => {},
    measureLayout: (_rel, onSuccess) => { if (onSuccess) onSuccess(0, 0, 390, 844); },
  }), []);
  return React.createElement('ScrollView', props);
});
ScrollView.displayName = 'ScrollView';

const StyleSheet = {
  create: (o) => o,
  flatten: (s) => {
    if (s == null) return {};
    if (Array.isArray(s)) return Object.assign({}, ...s.map((x) => StyleSheet.flatten(x)));
    return s;
  },
  compose: (a, b) => [a, b],
  absoluteFill: {},
  absoluteFillObject: {},
  hairlineWidth: 1,
};

const reactNativeStub = {
  View,
  ScrollView,
  StyleSheet,
  Platform: { OS: 'android', Version: 34, select: (o) => o.android ?? o.default },
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {}, swapLeftAndRightInRTL: () => false },
  RefreshControl: () => null,
  findNodeHandle: () => 1,
  Dimensions: { get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) },
  UIManager: { hasViewManagerConfig: () => false },
};

const flagsSrc = readFileSync(
  join(RN_ROOT, 'src/private/featureflags/ReactNativeFeatureFlags.js'), 'utf8');
const flagDefaults = {};
for (const m of flagsSrc.matchAll(/create(?:JavaScript|Native)FlagGetter\('([^']+)',\s*(true|false)\)/g)) {
  flagDefaults[m[1]] = m[2] === 'true';
}
const featureFlagsStub = new Proxy({}, {
  get: (_t, k) => {
    if (k === '__esModule') return true;
    if (typeof k !== 'string') return undefined;
    if (k in flagDefaults) return () => flagDefaults[k];
    return () => false; // unparsed flag: fail closed to false, like the file's shape
  },
});

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'react-native') return reactNativeStub;
  if (request === 'react-native/src/private/featureflags/ReactNativeFeatureFlags') return featureFlagsStub;
  return origLoad.call(this, request, ...rest);
};

// react-test-renderer must be loaded AFTER the patch (it does not import
// react-native, but the order keeps the stub authoritative).
// RN runtime global. false = release build, matching the shipped 0.4.24 CI
// APK the S events came from (dev-only branches, e.g. the nesting warning,
// stay off exactly as on device).
globalThis.__DEV__ = false;

// Silence act() warnings / make act flush synchronously in this env.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const VirtualizedList = require(join(BUILD_DIR, 'Lists/VirtualizedList.js')).default;

// ---------------------------------------------------------------------------
// 3. Scenario driver.
// ---------------------------------------------------------------------------
const VIEWPORT_H = 844;
const VIEWPORT_W = 390;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeMessages(n, streamingIndex = 0, streamingLen = 120) {
  return Array.from({ length: n }, (_, i) => ({
    id: `msg-${i}`,
    // messageData[0] is the newest (inverted list); index 0 streams.
    text: i === streamingIndex ? 'x'.repeat(streamingLen) : `message ${i} body`,
  }));
}

class Driver {
  constructor() {
    this.counts = { listRenders: 0, setStates: 0, updateCells: 0, rowRenders: 0 };
    this.thrown = null;
    this.offset = 0;
    this.totalH = 0;
    this.heights = new Map();
    this.listRef = null;
    this.root = null;
    this.data = [];
  }

  rowHeight(item) {
    // Streaming row: height grows with text length (~1 line per 40 chars).
    return 80 + Math.ceil(item.text.length / 40) * 22;
  }

  renderItem = ({ item }) => {
    this.counts.rowRenders++;
    return React.createElement('Text', { key: item.id }, item.id);
  };

  mount(data) {
    this.data = data;
    const VL = VirtualizedList;
    const self = this;
    act(() => {
      this.root = TestRenderer.create(
        React.createElement(VL, {
          ref: (inst) => {
            this.listRef = inst;
            if (inst && !inst.__s282Wrapped) {
              inst.__s282Wrapped = true;
              const origSetState = inst.setState.bind(inst);
              inst.setState = (...a) => { self.counts.setStates++; return origSetState(...a); };
              const origUpdate = inst._updateCellsToRender.bind(inst);
              inst._updateCellsToRender = (...a) => { self.counts.updateCells++; return origUpdate(...a); };
            }
          },
          data,
          inverted: true,
          maintainVisibleContentPosition: { minIndexForVisible: 0 },
          getItem: (d, i) => d[i],
          getItemCount: (d) => d.length,
          keyExtractor: (item) => item.id,
          renderItem: this.renderItem,
          initialNumToRender: 10,
          // Mirrors the app's onScrollToIndexFailed (session screen):
          // estimated jump toward the target so its rows mount.
          onScrollToIndexFailed: ({ index, averageItemLength }) => {
            this.listRef?.scrollToOffset({ offset: averageItemLength * index, animated: false });
            const last = scrollToCalls[scrollToCalls.length - 1];
            if (last) this.scroll(last.y);
          },
        }),
      );
    });
    // Native side delivers the first layout pass.
    this.layoutViewport();
    this.layoutAllCells();
    this.diagnose('mounted');
  }

  // One-line state dump for the run log: proves the driver actually got the
  // list into a measured, windowed state (visibleLength > 0, cells mounted).
  diagnose(label) {
    if (!this.root) {
      console.log(`  [${label}] (no list mounted — control scenario)`);
      return;
    }
    const vl = this.listRef;
    const sm = vl ? vl._scrollMetrics : null;
    const cells = vl ? vl.state.cellsAroundViewport : null;
    console.log(`  [${label}] cells mounted: ${this.cellNodes().length}, ` +
      `window: ${cells ? `${cells.first}..${cells.last}` : 'n/a'}, ` +
      `visibleLength: ${sm ? sm.visibleLength : 'n/a'}, ` +
      `contentLength: ${vl ? vl._listMetrics.getContentLength() : 'n/a'}, ` +
      `avgCell: ${vl ? Math.round(vl._listMetrics.getAverageCellLength()) : 'n/a'}, ` +
      `layoutMisses: ${this.counts.layoutMisses || 0}`);
  }

  scrollViewNode() {
    return this.root.root.findByType('ScrollView');
  }

  cellNodes() {
    return this.root.root.findAllByType('View').filter(
      (n) => typeof n.props.onLayout === 'function' && typeof n.props.onFocusCapture === 'function',
    );
  }

  cellForItem(id) {
    for (const cell of this.cellNodes()) {
      const texts = cell.findAllByType('Text');
      if (texts.some((t) => t.children && t.children.includes(id))) return cell;
    }
    return null;
  }

  layoutViewport() {
    act(() => {
      this.scrollViewNode().props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H } },
      });
    });
  }

  fireContentSize() {
    const total = this.data.reduce((s, item, i) => s + (this.heights.get(i) ?? this.rowHeight(item)), 0);
    this.totalH = total;
    const sv = this.scrollViewNode();
    if (typeof sv.props.onContentSizeChange === 'function') {
      act(() => { sv.props.onContentSizeChange(VIEWPORT_W, total); });
    }
  }

  layoutAllCells() {
    for (let i = 0; i < this.data.length; i++) {
      const h = this.rowHeight(this.data[i]);
      const prev = this.heights.get(i);
      if (prev === h) continue;
      this.heights.set(i, h);
      const cell = this.cellForItem(this.data[i].id);
      if (!cell) continue;
      act(() => {
        cell.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: VIEWPORT_W, height: h } } });
      });
    }
    this.fireContentSize();
  }

  layoutCell(index, height) {
    this.heights.set(index, height);
    const cell = this.cellForItem(this.data[index].id);
    if (!cell) {
      this.counts.layoutMisses = (this.counts.layoutMisses || 0) + 1;
      return false;
    }
    act(() => {
      cell.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: VIEWPORT_W, height } } });
    });
    return true;
  }

  scroll(offset) {
    this.offset = offset;
    act(() => {
      this.scrollViewNode().props.onScroll({
        timeStamp: Date.now(),
        nativeEvent: {
          contentOffset: { x: 0, y: offset },
          contentSize: { width: VIEWPORT_W, height: this.totalH },
          layoutMeasurement: { width: VIEWPORT_W, height: VIEWPORT_H },
          zoomScale: 1,
        },
      });
    });
  }

  updateData(data) {
    this.data = data;
    act(() => {
      this.root.update(
        React.createElement(VirtualizedList, {
          ref: (inst) => { this.listRef = inst; },
          data,
          inverted: true,
          maintainVisibleContentPosition: { minIndexForVisible: 0 },
          getItem: (d, i) => d[i],
          getItemCount: (d) => d.length,
          keyExtractor: (item) => item.id,
          renderItem: this.renderItem,
          initialNumToRender: 10,
          onScrollToIndexFailed: ({ index, averageItemLength }) => {
            this.listRef?.scrollToOffset({ offset: averageItemLength * index, animated: false });
            const last = scrollToCalls[scrollToCalls.length - 1];
            if (last) this.scroll(last.y);
          },
        }),
      );
    });
  }

  focusCell(index) {
    const cell = this.cellForItem(this.data[index].id);
    if (!cell) return false;
    act(() => { cell.props.onFocusCapture({}); });
    return true;
  }

  async flushTimers(ms = 70) {
    await act(async () => { await sleep(ms); });
  }

  // One streaming token: the newest message grows, its row gets taller.
  streamStep(step, withScroll, withFocus) {
    const len = 120 + step * 60;
    const data = this.data.map((m, i) =>
      i === 0 ? { ...m, text: 'x'.repeat(len) } : m);
    this.updateData(data);
    // The native side reports the resized row (height changes every token).
    this.layoutCell(0, this.rowHeight(data[0]));
    this.fireContentSize();
    if (withScroll) this.scroll(Math.min(600, step * 15));
    if (withFocus && step % 5 === 0) {
      this.focusCell(Math.min(this.data.length - 1, 1 + (step % 5)));
      this.focusCell(0);
    }
  }

  navSeek(index) {
    // App's seekMessage: scrollToIndex, then scrollToOffset retries.
    const before = scrollToCalls.length;
    try {
      act(() => {
        this.listRef.scrollToIndex({ index, viewPosition: 1, animated: false });
      });
    } catch (e) {
      return { threw: e, scrollTos: scrollToCalls.length - before };
    }
    // Native side delivers the programmatic scroll.
    const last = scrollToCalls[scrollToCalls.length - 1];
    if (last) this.scroll(last.y);
    return { threw: null, scrollTos: scrollToCalls.length - before };
  }
}

async function runScenario(name, drive) {
  const d = new Driver();
  const started = Date.now();
  let outcome = 'no-throw';
  let error = null;
  // Count VirtualizedList renders for the whole scenario (not just mount).
  const origRender = VirtualizedList.prototype.render;
  VirtualizedList.prototype.render = function (...a) {
    d.counts.listRenders++;
    return origRender.apply(this, a);
  };
  try {
    await drive(d);
  } catch (e) {
    outcome = 'THREW';
    error = e;
  } finally {
    VirtualizedList.prototype.render = origRender;
    // Drain the 50ms batching timeout chain so the end state is settled.
    try { await act(async () => { await sleep(200); }); act(() => {}); } catch {}
    d.diagnose('end');
    try { if (d.root) d.root.unmount(); } catch {}
  }
  console.log(`\n=== Scenario ${name} — ${outcome} (${Date.now() - started}ms) ===`);
  console.log(`list renders: ${d.counts.listRenders}, setStates: ${d.counts.setStates}, ` +
    `_updateCellsToRender calls: ${d.counts.updateCells}, row renders: ${d.counts.rowRenders}, ` +
    `scrollTo calls: ${scrollToCalls.length}`);
  if (error) {
    console.log(`ERROR: ${error.message}`);
    console.log((error.stack || '').split('\n').slice(0, 12).join('\n'));
  }
  return { name, outcome, error: error ? error.message : null, counts: d.counts };
}

// Positive control: a class component that setStates unconditionally in
// componentDidUpdate MUST throw "Maximum update depth exceeded" in this
// harness. If it does not, a no-throw from A–D would be a harness blind
// spot, not evidence about VirtualizedList.
class LoopControl extends React.PureComponent {
  state = { n: 0 };
  componentDidUpdate() {
    this.setState({ n: this.state.n + 1 });
  }
  render() {
    return React.createElement('Text', null, `n=${this.state.n}`);
  }
}

const scenarios = {
  // E: positive control — unconditional setState in componentDidUpdate.
  E: async (d) => {
    let root;
    act(() => {
      root = TestRenderer.create(React.createElement(LoopControl, { tick: 0 }));
    });
    // A prop change triggers the first CDU; the unconditional setState
    // inside CDU must then nest 50 deep and throw.
    act(() => {
      root.update(React.createElement(LoopControl, { tick: 1 }));
    });
    root.unmount();
  },
  // A: streaming growth + scrolling while tokens stream (core #282 recipe).
  A: async (d) => {
    d.mount(makeMessages(itemCount));
    await d.flushTimers();
    for (let s = 1; s <= tokenSteps; s++) {
      d.streamStep(s, true, false);
      if (s % 10 === 0) await d.flushTimers();
    }
    await d.flushTimers(150);
  },
  // B: A + focus-capture taps into/out of rows (direct _updateCellsToRender).
  B: async (d) => {
    d.mount(makeMessages(itemCount));
    await d.flushTimers();
    for (let s = 1; s <= tokenSteps; s++) {
      d.streamStep(s, true, true);
      if (s % 10 === 0) await d.flushTimers();
    }
    await d.flushTimers(150);
  },
  // C: B + Previous/Next navigation retries + a new message unshifted mid-stream.
  C: async (d) => {
    d.mount(makeMessages(itemCount));
    await d.flushTimers();
    for (let s = 1; s <= tokenSteps; s++) {
      d.streamStep(s, true, true);
      if (s === Math.floor(tokenSteps / 2)) {
        const r = d.navSeek(25);
        if (r.threw) throw r.threw;
        // A new assistant message arrives at index 0 (MVCP window shift).
        const data = [{ id: 'msg-new', text: 'fresh reply' }, ...d.data];
        d.updateData(data);
        d.layoutAllCells();
        await d.flushTimers();
      }
      if (s % 10 === 0) await d.flushTimers();
    }
    await d.flushTimers(150);
  },
  // D: worst case — every token also re-lays out ALL visible cells (each row
  // re-measures, e.g. markdown reflow) + rapid scroll + focus churn.
  D: async (d) => {
    d.mount(makeMessages(itemCount));
    await d.flushTimers();
    for (let s = 1; s <= tokenSteps; s++) {
      d.streamStep(s, true, true);
      d.layoutAllCells();
      if (s % 5 === 0) d.navSeek(10 + (s % 15));
      if (s % 10 === 0) await d.flushTimers();
    }
    await d.flushTimers(150);
  },
};

const wanted = scenarioArg === 'all' ? ['A', 'B', 'C', 'D', 'E'] : [scenarioArg.toUpperCase()];
if (wanted.some((s) => !scenarios[s])) {
  console.error(`Unknown scenario ${scenarioArg}; use A|B|C|D|all`);
  process.exit(2);
}
console.log(`#282 harness — react-test-renderer ${require('react-test-renderer/package.json').version}, ` +
  `tokens=${tokenSteps}, items=${itemCount}, deferFlatListFocusChangeRenderUpdate=${flagDefaults.deferFlatListFocusChangeRenderUpdate}`);
const results = [];
for (const name of wanted) {
  scrollToCalls.length = 0;
  results.push(await runScenario(name, scenarios[name]));
}
const threw = results.filter((r) => r.outcome === 'THREW');
console.log(`\nSUMMARY: ${threw.length}/${results.length} scenarios threw. ` +
  (threw.length
    ? `REPRODUCED — ${threw.map((r) => `${r.name}: ${r.error}`).join('; ')}`
    : 'NOT REPRODUCED in this harness.'));
