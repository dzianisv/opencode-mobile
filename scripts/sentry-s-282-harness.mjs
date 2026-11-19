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
// - No CellRendererComponent in scenarios A–E (app uses MessageCell, which
//   forwards onLayout and records frames; the loop under test lives in
//   VirtualizedList). Scenarios F/G (added 2026-11-20) DO model MessageCell.
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
    // App-fidelity nav state (scenarios F/G): mirrors src/lib/message-navigation.ts
    // (ids newest-first, frames by message id, pending seek target) and the
    // session screen's seekMessage retry loop (100ms timer, max 20 attempts).
    // NOTE: synthetic cell layouts carry y:0, so nav frames here are degenerate
    // (destination() collapses to offset 0) — the seek *call path* (synchronous
    // scrollToIndex from inside onLayout + 100ms retry timer) is what is exercised.
    this.nav = { ids: [], frames: new Map(), target: undefined, offset: 0, height: VIEWPORT_H };
    this.navRetry = undefined;
    this.navAttempts = 0;
    this.MessageCell = null;
    this.footerOn = false;
  }

  // The app's MessageCell (app/session/[id].tsx): a CellRendererComponent that
  // records each row's measured frame and resumes a pending seek synchronously
  // from inside onLayout when the laid-out row is the seek target.
  makeMessageCell() {
    const self = this;
    function MessageCell(props) {
      const key = props.item.message.id;
      const { onLayout, ...cell } = props;
      React.useEffect(() => () => { self.nav.frames.delete(key); }, [key]);
      return React.createElement('View', {
        ...cell,
        onLayout: (event) => {
          self.nav.frames.set(key, event.nativeEvent.layout);
          onLayout?.(event);
          if (self.nav.target === key) self.seekMessage();
        },
      }, props.children);
    }
    return MessageCell;
  }

  // Full list props, shared by mount() and updateData() so the fidelity options
  // (MessageCell, footer) survive data updates exactly as on device.
  listProps(data) {
    return {
      ref: (inst) => {
        this.listRef = inst;
        if (inst && !inst.__s282Wrapped) {
          inst.__s282Wrapped = true;
          const origSetState = inst.setState.bind(inst);
          inst.setState = (...a) => { this.counts.setStates++; return origSetState(...a); };
          const origUpdate = inst._updateCellsToRender.bind(inst);
          inst._updateCellsToRender = (...a) => { this.counts.updateCells++; return origUpdate(...a); };
        }
      },
      data,
      inverted: true,
      maintainVisibleContentPosition: { minIndexForVisible: 0 },
      ...(this.MessageCell ? { CellRendererComponent: this.MessageCell } : {}),
      ...(this.footerOn
        ? { ListFooterComponent: React.createElement('View', { key: 'loading-more' },
            React.createElement('Text', null, 'loading older')) }
        : {}),
      getItem: (d, i) => d[i],
      getItemCount: (d) => d.length,
      keyExtractor: (item) => item.id,
      renderItem: this.renderItem,
      initialNumToRender: 10,
      contentContainerStyle: { padding: 16, paddingBottom: 8 },
      scrollEventThrottle: 100,
      onEndReachedThreshold: 0.5,
      // Mirrors the app's onScrollToIndexFailed (session screen):
      // estimated jump toward the target so its rows mount.
      onScrollToIndexFailed: ({ index, averageItemLength }) => {
        this.listRef?.scrollToOffset({ offset: averageItemLength * index, animated: false });
        const last = scrollToCalls[scrollToCalls.length - 1];
        if (last) this.scroll(last.y);
      },
    };
  }

  // Mirrors the session screen's seekMessage (100ms retry, max 20 attempts)
  // over a minimal port of MessageNavigation.seek (attempt 0 scrollToIndex,
  // later attempts scrollToOffset steps; destination() when the frame landed).
  seekMessage() {
    if (!this.root) return;
    if (this.navRetry) clearTimeout(this.navRetry);
    const nav = this.nav;
    if (!nav.target) return;
    const index = nav.ids.indexOf(nav.target);
    if (index < 0) return;
    const frame = nav.frames.get(nav.target);
    if (frame && frame.height > 0 && nav.height > 0) {
      const offset = Math.max(0, frame.y + frame.height - nav.height);
      this.listRef?.scrollToOffset({ offset, animated: false });
      const last = scrollToCalls[scrollToCalls.length - 1];
      if (last) this.scroll(last.y);
      nav.target = undefined;
      return;
    }
    if (this.navAttempts >= 20) { nav.target = undefined; return; }
    if (this.navAttempts === 0) {
      try {
        this.listRef?.scrollToIndex({ index, viewPosition: 1, animated: false });
      } catch { /* out-of-range: retry loop settles on the real frame */ }
    } else {
      this.listRef?.scrollToOffset({ offset: Math.max(0, nav.offset + nav.height * 0.8), animated: false });
      const last = scrollToCalls[scrollToCalls.length - 1];
      if (last) this.scroll(last.y);
    }
    this.navAttempts++;
    this.navRetry = setTimeout(() => this.seekMessage(), 100);
  }

  // Simulate a Previous/Next tap: set the target and start the seek loop.
  setNavTarget(id) {
    this.nav.target = id;
    this.navAttempts = 0;
    this.seekMessage();
  }

  syncNavIds() {
    this.nav.ids = this.data.map((item) => (item.message ? item.message.id : item.id));
  }

  rowHeight(item) {
    // Streaming row: height grows with text length (~1 line per 40 chars).
    return 80 + Math.ceil(item.text.length / 40) * 22;
  }

  renderItem = ({ item }) => {
    this.counts.rowRenders++;
    return React.createElement('Text', { key: item.id }, item.id);
  };

  mount(data, opts = {}) {
    this.data = data;
    if (opts.messageCell) this.MessageCell = this.makeMessageCell();
    if (opts.footerOn !== undefined) this.footerOn = opts.footerOn;
    this.syncNavIds();
    const VL = VirtualizedList;
    act(() => {
      this.root = TestRenderer.create(
        React.createElement(VL, this.listProps(data)),
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
    const total = this.data.reduce((s, item, i) => s + (this.heights.get(i) ?? this.rowHeight(item)), 0)
      + (this.footerOn ? 48 : 0);
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
    this.syncNavIds();
    act(() => {
      this.root.update(
        React.createElement(VirtualizedList, this.listProps(data)),
      );
    });
  }

  // Toggle the ListFooterComponent loading spinner (loadingMore on/off).
  // The footer adds ~48px to the content size on device; model that here.
  setFooter(on) {
    this.footerOn = on;
    this.updateData(this.data);
    this.fireContentSize();
  }

  // onEndReached: an older page lands at the far end (highest indices).
  prependOlder(count) {
    const start = this.data.length;
    const older = Array.from({ length: count }, (_, k) => {
      const id = `msg-old-${start + k}`;
      return { id, message: { id }, text: `older message ${start + k}` };
    });
    this.updateData([...this.data, ...older]);
    this.layoutAllCells();
    this.fireContentSize();
  }

  // App-fidelity streaming token: the app's messageData useMemo rebuilds the
  // {message, parts} wrapper object for EVERY row on every token (deps
  // [messages, parts]), so every CellRenderer sees a new `item` identity and
  // its getDerivedStateFromProps fires for every cell, every token — unlike
  // streamStep, which only replaces index 0. Also runs the auto-scroll effect:
  // scrollToOffset(0) while the user is at the bottom.
  streamStepFidelity(step, withScroll, withFocus) {
    const len = 120 + step * 60;
    const data = this.data.map((m, i) => {
      const text = i === 0 ? 'x'.repeat(len) : m.text;
      // New wrapper object for every row, every token (messageData useMemo).
      return { ...m, message: { ...(m.message || { id: m.id }), }, parts: [], text };
    });
    this.updateData(data);
    this.layoutCell(0, this.rowHeight(data[0]));
    this.fireContentSize();
    // Auto-scroll effect: content changed while at the bottom -> scrollToBottom.
    if (this.offset === 0) {
      this.listRef?.scrollToOffset({ offset: 0, animated: true });
      const last = scrollToCalls[scrollToCalls.length - 1];
      if (last) this.scroll(last.y);
    }
    if (withScroll) this.scroll(Math.min(600, step * 15));
    if (withFocus && step % 5 === 0) {
      this.focusCell(Math.min(this.data.length - 1, 1 + (step % 5)));
      this.focusCell(0);
    }
  }

  // Native event burst in a single JS task (one act()): 60 focus captures +
  // 60 cell layouts + scroll events, as delivered after the JS thread was
  // busy on a large list. _onCellFocusCapture calls _updateCellsToRender()
  // directly (deferFlatListFocusChangeRenderUpdate() === false), so this is
  // the one unguarded synchronous setState path outside componentDidUpdate.
  burstEvents(n = 60) {
    const cells = this.cellNodes();
    act(() => {
      for (let k = 0; k < n; k++) {
        const cell = cells[k % cells.length];
        if (!cell) break;
        cell.props.onFocusCapture({});
        const idx = k % this.data.length;
        const h = this.rowHeight(this.data[idx]);
        cell.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: VIEWPORT_W, height: h } } });
        this.scrollViewNode().props.onScroll({
          timeStamp: Date.now(),
          nativeEvent: {
            contentOffset: { x: 0, y: (k * 7) % 600 },
            contentSize: { width: VIEWPORT_W, height: this.totalH },
            layoutMeasurement: { width: VIEWPORT_W, height: VIEWPORT_H },
            zoomScale: 1,
          },
        });
      }
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
    // Stop the seek retry loop before unmount: its 100ms timer would otherwise
    // fire after unmount and throw inside the timer (crashing the process).
    if (d.navRetry) { clearTimeout(d.navRetry); d.navRetry = undefined; }
    try { if (d.root) act(() => { d.root.unmount(); }); } catch {}
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
  // F: app-fidelity — MessageCell (seek resumes synchronously from inside
  // onLayout) + new wrapper objects for every row per token (CellRenderer
  // getDerivedStateFromProps fires per cell per token) + auto-scroll
  // scrollToOffset(0) per token + footer spinner toggling + onEndReached
  // older-page prepend + a real Previous-tap seek with the 100ms retry loop.
  F: async (d) => {
    const data = makeMessages(itemCount).map((m) => ({ ...m, message: { id: m.id }, parts: [] }));
    d.mount(data, { messageCell: true });
    await d.flushTimers();
    for (let s = 1; s <= tokenSteps; s++) {
      d.streamStepFidelity(s, true, true);
      if (s === Math.floor(tokenSteps / 2)) {
        // Previous tap: target a far message; the seek loop runs, the target
        // frame lands via layout, and MessageCell.onLayout resumes the seek.
        const targetId = d.data[Math.min(d.data.length - 1, 25)].message.id;
        d.setNavTarget(targetId);
        d.layoutAllCells();
        await d.flushTimers(250);
        // onEndReached: older page lands at the far end, footer spins then clears.
        d.setFooter(true);
        await d.flushTimers(120);
        d.prependOlder(20);
        d.setFooter(false);
        await d.flushTimers();
      }
      if (s % 10 === 0) await d.flushTimers();
    }
    await d.flushTimers(300);
  },
  // G: native event burst in one JS task — 60 focus captures + 60 cell
  // layouts + scroll events fired synchronously inside a single act(), as
  // a burst queued while the JS thread was busy on a large list would land.
  // _onCellFocusCapture calls _updateCellsToRender() directly (unguarded),
  // so if bursts could re-enter the same cascade this must throw.
  G: async (d) => {
    d.mount(makeMessages(itemCount));
    await d.flushTimers();
    for (let s = 1; s <= 5; s++) d.streamStep(s, true, true);
    await d.flushTimers();
    // Burst 1: mid-stream, straight after a token update (50ms batching
    // timeout still pending from the last _scheduleCellsToRenderUpdate).
    d.streamStep(6, true, true);
    d.burstEvents(60);
    await d.flushTimers(150);
    // Burst 2: after settling, plus a seek retry firing into the burst.
    d.setNavTarget(d.data[20].id);
    d.burstEvents(60);
    d.layoutAllCells();
    await d.flushTimers(300);
  },
};

const wanted = scenarioArg === 'all' ? ['A', 'B', 'C', 'D', 'E', 'F', 'G'] : [scenarioArg.toUpperCase()];
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
