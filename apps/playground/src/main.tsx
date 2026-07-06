import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Inhibitor } from 'inhibitor-js';
import type { SessionSnapshot } from 'inhibitor-js';
import './style.css';

function App() {
  const sdk = useRef(new Inhibitor({ transport: { enabled: false } }));
  const [state, setState] = useState(sdk.current.getState());
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'sdk' | 'baseline'>('sdk');
  const [baseline, setBaseline] = useState(0);
  const [measurements, setMeasurements] = useState<number[]>([]);
  const [offline, setOffline] = useState(false);
  const [latency, setLatency] = useState(0);
  const [failureRate, setFailureRate] = useState(0);
  const [mockResult, setMockResult] = useState('No simulation run');

  const refresh = useCallback(async () => {
    setState(sdk.current.getState());
    if (sdk.current.getState() === 'running' || sdk.current.getState() === 'stopped') {
      const start = performance.now();
      const value = await sdk.current.getSessionSignals();
      setMeasurements(m => [...m.slice(-99), performance.now() - start]);
      setSnapshot(value);
    }
  }, []);
  useEffect(() => { const timer = window.setInterval(() => { void refresh(); }, 500); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => () => { void sdk.current.dispose(); }, []);

  async function start() {
    setError('');
    try { await sdk.current.initialize(); await sdk.current.start({ consent: true }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function stop() { await sdk.current.stop(); await refresh(); }
  async function clear() { await sdk.current.dispose(); sdk.current = new Inhibitor({ transport: { enabled: false } }); setSnapshot(null); setMeasurements([]); setState('idle'); }
  async function simulate() {
    if (offline) { setMockResult('Offline: request dropped locally'); return; }
    await new Promise(resolve => setTimeout(resolve, latency));
    setMockResult(Math.random() < failureRate / 100 ? 'Simulated HTTP 503' : 'Simulated HTTP 200');
  }
  function download() {
    const report = { generatedAt: new Date().toISOString(), mode, measurementsMs: measurements, snapshot };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'inhibitor-benchmark.json'; a.click(); URL.revokeObjectURL(url);
  }
  const behavior = snapshot?.behavior;
  return <main>
    <header><div className="eyebrow">RESEARCH PLAYGROUND · 0.1.0</div><h1>Session signals,<br/><em>under your control.</em></h1><p>Explore aggregated browser telemetry. Nothing is collected until you press Start collection. This page sends no telemetry.</p></header>
    <section className="card controls"><div><span className="label">SESSION STATE</span><strong className="state">{state}</strong><p>Starting asserts that your app has obtained an appropriate consent or legal basis. Stop withdraws collection and clears queued data.</p></div><div className="buttons"><button type="button" onClick={start} disabled={state === 'running'}>Start collection</button><button type="button" className="secondary" onClick={() => void stop()} disabled={state !== 'running'}>Stop</button><button type="button" className="secondary" onClick={() => void clear()}>Clear session</button></div>{error && <div className="error">{error}</div>}</section>
    <div className="grid"><section className="card"><span className="label">LIVE AGGREGATES</span><div className="metrics"><div><b>{behavior?.pointerEventCount ?? 0}</b><small>pointer events</small></div><div><b>{behavior?.keyboardEventCount ?? 0}</b><small>keyboard events</small></div><div><b>{behavior?.visibilityChangeCount ?? 0}</b><small>visibility changes</small></div><div><b>{sdk.current.getQueueStats().depth}</b><small>queue depth</small></div></div><p className="muted">Sampled events: {snapshot?.diagnostics.sampledEvents ?? 0} · Dropped: {snapshot?.diagnostics.droppedEvents ?? 0}</p><h3>Timing histograms</h3><pre>{JSON.stringify({ pointer: behavior?.pointerIntervalHistogramMs, keyboard: behavior?.keyboardIntervalHistogramMs }, null, 2)}</pre></section>
      <section className="card"><span className="label">INTERACTION SANDBOX</span><h2>Move, click, and press keys</h2><p>Try interaction here, then compare counts. Editable controls are deliberately excluded from keyboard metrics.</p><button type="button" className="sandbox" onPointerDown={() => { if (mode === 'baseline') setBaseline(n => n + 1); }}>Focus this surface and interact</button><input aria-label="Excluded input" placeholder="Typing here is excluded"/><div className="mode"><button type="button" className={mode === 'sdk' ? '' : 'secondary'} onClick={() => setMode('sdk')}>SDK mode</button><button type="button" className={mode === 'baseline' ? '' : 'secondary'} onClick={() => setMode('baseline')}>Baseline mode</button></div><p className="muted">Baseline pointer count: {baseline} · Snapshot median: {measurements.length ? measurements.slice().sort((a,b)=>a-b)[Math.floor(measurements.length/2)]?.toFixed(3) : '—'} ms</p></section></div>
    <div className="grid"><section className="card"><span className="label">PRIVACY INSPECTOR</span><h2>What can leave the browser?</h2><p>Transport is disabled in this playground. In a host app that enables it, only these coarse snapshot keys enter the JSON batch:</p><code>schemaVersion · sdk · session · environment · behavior · plugins (if configured) · diagnostics</code><p className="muted">Built-in collectors produce no key values, text, input content, coordinates, URLs, or persistent IDs. Review custom plugins separately.</p><h3>Collector state</h3><p>Environment: enabled · Behavior: enabled · Automation indicators: disabled</p></section>
      <section className="card"><span className="label">LOCAL NETWORK SIMULATOR</span><h2>Explore delivery conditions</h2><label><input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)}/> Offline</label><label>Latency <input type="range" min="0" max="2000" value={latency} onChange={e => setLatency(Number(e.target.value))}/>{latency} ms</label><label>Error rate <input type="range" min="0" max="100" value={failureRate} onChange={e => setFailureRate(Number(e.target.value))}/>{failureRate}%</label><button type="button" onClick={() => void simulate()}>Simulate locally</button><p>{mockResult}</p></section></div>
    <section className="card"><div className="row"><div><span className="label">SERIALIZED SNAPSHOT</span><h2>Inspect the actual payload</h2></div><button type="button" className="secondary" onClick={download}>Download JSON report</button></div><pre className="snapshot">{snapshot ? JSON.stringify(snapshot, null, 2) : 'Start collection to view a snapshot.'}</pre></section>
    <footer>inhibitor-js · Signals are indicators, never a fraud verdict.</footer>
  </main>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Playground root missing');
createRoot(root).render(<App/>);
