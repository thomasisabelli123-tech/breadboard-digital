import React, { useEffect, useRef, useState } from 'react';
import { BoardScene } from '../three/BoardScene.js';
import { useStore, snapPlacement, WIRE_COLORS } from '../store.js';
import { engine } from '../sim.js';
import { PART_TYPES } from '../data/catalog.js';
import { useT } from '../i18n.js';
import { BOARD_CENTER, holeById, holeLabel } from '../engine/geometry.js';
import { fmt } from '../data/format.js';


// harmless stand-in while the 3D scene is (re)starting, so toolbar buttons never throw
const NOOP_SCENE = new Proxy({}, { get: () => () => {} });
const epFromPick = (pick) => (pick.pin ? { p: pick.pin.p, n: pick.pin.n } : pick.hole ? { h: pick.hole.id } : null);
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

function Btn({ active, children, ...p }) {
  return <button {...p} className={`btn ${active ? 'btn-on' : ''} ${p.className || ''}`}>{children}</button>;
}

export default function Viewport() {
  const t = useT();
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const sceneRef = useRef(null);
  const ix = useRef({ drag: null, wireStart: null, emptyDown: null });
  const [hover, setHover] = useState(null);
  const [view, setView] = useState('perspective');
  const [tiltDeg, setTiltDeg] = useState(45);
  // 3D resilience: a new <canvas key> is mounted whenever the GL context is lost or the render loop keeps failing
  const [sceneKey, setSceneKey] = useState(0);
  const [sceneErr, setSceneErr] = useState(null);
  const tRef = useRef(t); tRef.current = t;
  const recoveries = useRef([]);

  const parts = useStore((s) => s.parts);
  const wires = useStore((s) => s.wires);
  const burnt = useStore((s) => s.burnt);
  const selection = useStore((s) => s.selection);
  const xray = useStore((s) => s.xray);
  const tool = useStore((s) => s.tool);
  const armed = useStore((s) => s.armed);
  const wireColor = useStore((s) => s.wireColor);
  const autoRotate = useStore((s) => s.autoRotate);
  const showHelp = useStore((s) => s.showHelp);
  const board = useStore((s) => s.board);
  const sceneNonce = useStore((s) => s.sceneNonce);
  const lastReset = useRef({ board, nonce: sceneNonce });
  const lightLevel = useStore((s) => s.lightLevel);
  const lightAngle = useStore((s) => s.lightAngle);
  const shadows = useStore((s) => s.shadows);
  const reflections = useStore((s) => s.reflections);
  const [lightOpen, setLightOpen] = useState(false);
  useStore((s) => s.tick); // re-render at ~10 Hz for live voltages

  // ---------------------------------------------------------------- scene lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let scene;
    try { scene = new BoardScene(canvas); } catch (e) {
      console.error('[3D] scene init failed', e);
      setSceneErr(String((e && e.message) || e));
      return undefined;
    }
    sceneRef.current = scene;
    setView('perspective');
    let alive = true, raf = 0, streak = 0, last = performance.now(), acc = 0, acc2 = 0;
    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      try { scene.resize(Math.max(10, r.width), Math.max(10, r.height)); } catch (e) { console.error('[3D] resize failed', e); }
    });
    ro.observe(wrapRef.current);

    // replace the canvas by a fresh one (a lost WebGL context can never be reused); gives up after repeated failures
    const recover = (reason) => {
      alive = false;
      const now = performance.now();
      recoveries.current = recoveries.current.filter((x) => now - x < 20000);
      recoveries.current.push(now);
      console.error('[3D] restarting 3D view:', reason);
      if (recoveries.current.length > 4) setSceneErr(String(reason));
      else { useStore.getState().setToast(tRef.current('err.3d.text')); setSceneKey((k) => k + 1); }
    };
    const onLost = (e) => { e.preventDefault(); recover('WebGL context lost'); };
    canvas.addEventListener('webglcontextlost', onLost);

    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop); // schedule first: an exception in this frame can never end the loop
      let dt = (now - last) / 1000;
      last = now;
      dt = Number.isFinite(dt) && dt > 0 ? Math.min(0.05, dt) : 0.016;
      const st = useStore.getState();
      if (st.running) {
        try { engine.frame(dt, st.speed); } catch (e) {
          console.error('[sim] step failed', e);
          st.setRunning(false);
          st.setToast(tRef.current('err.sim'));
        }
      }
      try { scene.frame(engine, dt); streak = 0; } catch (e) {
        console.error('[3D] frame failed', e);
        if (++streak >= 20) { recover((e && e.message) || e); return; }
      }
      acc += dt; acc2 += dt;
      if (acc > 0.1) { acc = 0; st.bumpTick(); }
      if (acc2 > 0.25) {
        acc2 = 0;
        try { const d = scene.tiltDeg(); if (Number.isFinite(d)) setTiltDeg(Math.round(d)); } catch (_) { /* ignore */ }
      }
    };
    raf = requestAnimationFrame(loop);
    try {
      const s0 = useStore.getState();
      scene.sync(s0.parts, s0.wires, s0.burnt, s0.selection);
    } catch (e) { console.error('[3D] initial sync failed', e); }
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      try { scene.dispose(); } catch (_) { /* ignore */ }
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [sceneKey]);

  // a new project / loaded file / board change: rebuild the 3D board and all models from scratch, then sync the circuit
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    const L = lastReset.current;
    if (L.board !== board || L.nonce !== sceneNonce) {
      lastReset.current = { board, nonce: sceneNonce };
      try { sc.rebuildBoard(); } catch (e) { console.error('[3D] board rebuild failed', e); }
      setHover(null);
    }
  }, [board, sceneNonce, sceneKey]);
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    try { sc.sync(parts, wires, burnt, selection); } catch (e) { console.error('[3D] sync failed', e); }
  }, [parts, wires, burnt, selection, board, sceneNonce, sceneKey]);
  useEffect(() => { sceneRef.current && sceneRef.current.setLighting(lightLevel, lightAngle); }, [lightLevel, lightAngle, sceneKey]);
  useEffect(() => { sceneRef.current && sceneRef.current.setShadows(shadows); }, [shadows, sceneKey]);
  useEffect(() => { sceneRef.current && sceneRef.current.setReflections(reflections); }, [reflections, sceneKey]);
  useEffect(() => { sceneRef.current && sceneRef.current.setXray(xray); }, [xray, sceneKey]);
  useEffect(() => { sceneRef.current && sceneRef.current.setAutoRotate(autoRotate); }, [autoRotate, sceneKey]);
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    if (!armed) sc.clearGhost();
    if (tool !== 'wire') { ix.current.wireStart = null; sc.setWirePreview(null); sc.setHover(null); }
  }, [armed, tool]);

  // ---------------------------------------------------------------- interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return undefined;
    const S = ix.current;

    const claim = (e) => {
      scene.controls.enabled = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      e.stopImmediatePropagation();
    };

    const onDown = (e) => {
      if (e.button !== 0) return;
      const st = useStore.getState();
      const pick = scene.pick(e.clientX, e.clientY);
      S.down = { x: e.clientX, y: e.clientY };
      if (st.armed) {
        claim(e);
        if (!pick.point) return;
        const id = st.addPart(st.armed, pick.point.x + BOARD_CENTER.x, pick.point.z + BOARD_CENTER.y, st.armedRot);
        if (!id) st.setToast('Invalid position');
        else if (!e.shiftKey) { st.disarm(); scene.clearGhost(); }
        return;
      }
      if (st.tool === 'wire') {
        claim(e);
        const ep = epFromPick(pick);
        if (!ep) { S.wireStart = null; scene.setWirePreview(null); return; }
        if (!S.wireStart) S.wireStart = ep;
        else { st.addWire(S.wireStart, ep, st.wireColor); S.wireStart = null; scene.setWirePreview(null); }
        return;
      }
      if (pick.probe) {
        claim(e);
        const key = `${pick.probe.partId}:${pick.probe.name}`;
        S.drag = { kind: 'probe', key, ...pick.probe };
        const p = pick.point ? pick.point.clone() : scene.tipPosition(st.parts.find((q) => q.id === pick.probe.partId), pick.probe.name, null);
        p.y = 0.4;
        scene.setProbeDrag(key, p);
        scene.syncProbes(st.parts);
        return;
      }
      if (pick.part) {
        claim(e);
        const part = st.parts.find((q) => q.id === pick.part);
        if (!part) return;
        st.select({ kind: 'part', id: part.id });
        const o = pick.partObj ? pick.partObj.userData : {};
        if (part.type === 'pushbutton' && o.cap) {
          if (part.params.mode === 'latching') engine.setInput(part.id, { pressed: !(engine.inputs.get(part.id) || {}).pressed });
          else { engine.setInput(part.id, { pressed: true }); S.drag = { kind: 'press', id: part.id }; }
          return;
        }
        if (part.type === 'keypad' && o.key !== undefined) {
          const keys = new Set((engine.inputs.get(part.id) || {}).keys || []);
          keys.add(o.key);
          engine.setInput(part.id, { keys });
          S.drag = { kind: 'key', id: part.id, key: o.key };
          return;
        }
        const grab = pick.point ? { x: pick.point.x + BOARD_CENTER.x - part.x, y: pick.point.z + BOARD_CENTER.y - part.y } : { x: 0, y: 0 };
        S.drag = { kind: 'part', id: part.id, ox: grab.x, oy: grab.y, moved: false, sx: e.clientX, sy: e.clientY, dip: o.dipIndex, snap: null };
        return;
      }
      if (pick.wire) { claim(e); st.select({ kind: 'wire', id: pick.wire }); S.drag = { kind: 'click' }; return; }
      S.emptyDown = { x: e.clientX, y: e.clientY }; // OrbitControls rotates; a plain click deselects
    };

    const onMove = (e) => {
      const st = useStore.getState();
      const D = S.drag;
      if (D && D.kind === 'part') {
        if (!D.moved && Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < 4) return;
        D.moved = true;
        const pt = scene.boardPoint(e.clientX, e.clientY);
        const part = st.parts.find((q) => q.id === D.id);
        if (!pt || !part) return;
        const snap = snapPlacement(part.type, pt.x + BOARD_CENTER.x - D.ox, pt.z + BOARD_CENTER.y - D.oy, part.rot, st.parts, part.id, part.params);
        scene.dragPartTo(part.id, snap.x, snap.y, snap.valid);
        D.snap = snap;
        return;
      }
      if (D && D.kind === 'probe') {
        const pick = scene.pick(e.clientX, e.clientY);
        if (pick.point) {
          const p = pick.point.clone(); p.y = 0.4;
          scene.setProbeDrag(D.key, p);
          scene.syncProbes(st.parts);
        }
        const ep = epFromPick(pick);
        scene.setHover(ep ? scene.epWorld(ep) : null);
        return;
      }
      if (e.buttons) return;
      const pick = scene.pick(e.clientX, e.clientY);
      if (pick.hole) {
        const h = pick.hole;
        setHover({ id: h.id, strip: h.strip, label: holeLabel(h) });
        scene.setStripHighlight(h.strip);
      } else { setHover(null); scene.clearHighlight(); }
      if (st.armed) {
        if (pick.point) {
          const snap = snapPlacement(st.armed, pick.point.x + BOARD_CENTER.x, pick.point.z + BOARD_CENTER.y, st.armedRot, st.parts, null);
          scene.setGhost(st.armed, snap.x, snap.y, st.armedRot, snap.valid);
        }
      } else if (st.tool === 'wire') {
        const ep = epFromPick(pick);
        const w = ep ? scene.epWorld(ep) : null;
        scene.setHover(w);
        if (S.wireStart) {
          const a = scene.epWorld(S.wireStart);
          const to = w || (pick.point ? pick.point.clone().setY(0.6) : null);
          scene.setWirePreview(a, to, st.wireColor);
        }
      }
    };

    const onUp = (e) => {
      scene.controls.enabled = true;
      const st = useStore.getState();
      const D = S.drag;
      S.drag = null;
      if (S.emptyDown) {
        if (Math.hypot(e.clientX - S.emptyDown.x, e.clientY - S.emptyDown.y) < 4 && !st.armed && st.tool === 'select') st.select(null);
        S.emptyDown = null;
      }
      if (!D) return;
      if (D.kind === 'press') engine.setInput(D.id, { pressed: false });
      else if (D.kind === 'key') {
        const keys = new Set((engine.inputs.get(D.id) || {}).keys || []);
        keys.delete(D.key);
        engine.setInput(D.id, { keys });
      } else if (D.kind === 'probe') {
        const pick = scene.pick(e.clientX, e.clientY);
        const ep = epFromPick(pick);
        scene.setProbeDrag(null);
        scene.setHover(null);
        st.setProbe(D.partId, D.name, ep);
        scene.syncProbes(useStore.getState().parts);
      } else if (D.kind === 'part') {
        const part = st.parts.find((q) => q.id === D.id);
        if (!part) return;
        if (D.moved) {
          if (D.snap && D.snap.valid) st.commitMove(D.id, D.snap.x, D.snap.y);
          else { scene.dragPartTo(part.id, part.x, part.y); st.setToast('Invalid position'); }
          scene.selBox.material.color.set('#ffd54a');
          scene.updateSelection();
        } else if (D.dip !== undefined) {
          const sw = [...(part.params.sw || [])];
          sw[D.dip] = sw[D.dip] ? 0 : 1;
          st.updateParams(part.id, { sw });
        } else if (part.type === 'sw_spst') st.updateParams(part.id, { on: !part.params.on });
        else if (part.type === 'sw_spdt' || part.type === 'sw_dpdt') st.updateParams(part.id, { pos: +part.params.pos ? 0 : 1 });
      }
    };

    const onContext = (e) => {
      e.preventDefault();
      if (S.wireStart) { S.wireStart = null; scene.setWirePreview(null); }
    };

    const onKey = (e) => {
      if (isTyping(e.target)) return;
      const st = useStore.getState();
      const k = e.key.toLowerCase();
      if (k === 'r') {
        if (st.armed) { st.rotateArmed(); scene.clearGhost(); }
        else if (st.selection && st.selection.kind === 'part') st.rotatePart(st.selection.id);
      } else if (k === 'delete' || k === 'backspace') st.deleteSelection();
      else if (k === 'escape') { st.disarm(); scene.clearGhost(); S.wireStart = null; scene.setWirePreview(null); st.setTool('select'); st.select(null); }
      else if (k === 'w') st.setTool('wire');
      else if (k === 's') st.setTool('select');
      else if (k === 'x') st.setXray(!st.xray);
    };

    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
    };
  }, [sceneKey]);

  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    const sc = sceneRef.current;
    if (!PART_TYPES[type] || !sc) return;
    const pt = sc.boardPoint(e.clientX, e.clientY);
    if (!pt) return;
    const st = useStore.getState();
    if (!st.addPart(type, pt.x + BOARD_CENTER.x, pt.z + BOARD_CENTER.y, 0)) st.setToast('Invalid position');
    sc.clearGhost();
  };

  const sc = () => sceneRef.current || NOOP_SCENE;
  const setV = (name) => { setView(name); sc().setView(name); };
  const st = useStore.getState();
  const hoverV = hover ? engine.keyVoltage(hover.strip) : null;
  const connected = hover && engine.nl ? engine.nl.nodeOfKey(hover.strip) > 0 : false;

  return (
    <div
      ref={wrapRef}
      translate="no"
      data-tut="viewport"
      className="relative min-h-0 flex-1 overflow-hidden bg-bg-0"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={onDrop}
    >
      <canvas key={sceneKey} ref={canvasRef} onPointerLeave={() => { setHover(null); sceneRef.current && sceneRef.current.clearHighlight(); }} className="block h-full w-full touch-none outline-none" style={{ cursor: armed ? 'copy' : tool === 'wire' ? 'crosshair' : 'default' }} />

      {sceneErr && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-0/90 p-6">
          <div className="max-w-md rounded-lg border border-danger/50 bg-bg-1 p-4 text-sm text-slate-300 shadow-xl">
            <div className="font-semibold text-danger">{t('err.3d.title')}</div>
            <p className="mt-1 text-xs">{t('err.3d.text')}</p>
            <details className="mt-2 text-[11px] text-slate-500"><summary className="cursor-pointer">{t('err.3d.detail')}</summary><pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap">{sceneErr}</pre></details>
            <button className="btn btn-accent mt-3" onClick={() => { recoveries.current = []; setSceneErr(null); setSceneKey((k) => k + 1); }}>{t('err.3d.retry')}</button>
          </div>
        </div>
      )}

      {/* view controls */}
      <div className="absolute left-3 top-3 flex max-w-[calc(100%-260px)] flex-wrap items-center gap-1.5 rounded-lg border border-bg-3 bg-bg-1/90 p-1.5 backdrop-blur">
        <Btn active={view === 'perspective'} onClick={() => setV('perspective')}>{t('view.perspective')}</Btn>
        <Btn active={view === 'top'} onClick={() => setV('top')}>{t('view.top')}</Btn>
        <Btn active={view === 'front'} onClick={() => setV('front')}>{t('view.front')}</Btn>
        <Btn active={view === 'side'} onClick={() => setV('side')}>{t('view.side')}</Btn>
        <span className="mx-0.5 h-5 w-px bg-bg-3" />
        <Btn onClick={() => sc().rotateBy(-90)} title={t('view.rotL')}>⟲ 90°</Btn>
        <Btn onClick={() => sc().rotateBy(90)} title={t('view.rotR')}>⟳ 90°</Btn>
        <Btn active={autoRotate} onClick={() => st.setAutoRotate(!autoRotate)} title={t('view.auto')}>360°</Btn>
        <span className="mx-0.5 h-5 w-px bg-bg-3" />
        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
          {t('view.tilt')}
          <input type="range" min="0" max="88" value={tiltDeg} className="w-24" onChange={(e) => { setTiltDeg(+e.target.value); sc().setTilt(+e.target.value); }} />
          <span className="w-8 font-mono text-slate-300">{tiltDeg}°</span>
        </label>
        <Btn onClick={() => sc().zoomBy(0.75)} title={t('view.zoomIn')}>＋</Btn>
        <Btn onClick={() => sc().zoomBy(1.33)} title={t('view.zoomOut')}>－</Btn>
      </div>

      {/* X-ray (internal view) */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <button
          data-tut="xray"
          onClick={() => st.setXray(!xray)}
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold shadow-lg transition ${xray ? 'border-accent bg-accent text-bg-0' : 'border-accent/60 bg-bg-1/90 text-accent hover:bg-accent/15'}`}
          title="X"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
          {xray ? t('xray.on') : t('xray.off')}
        </button>
        <div className="flex flex-col items-end gap-1.5">
          <button className={`btn ${lightOpen ? 'btn-on' : ''}`} onClick={() => setLightOpen((v) => !v)} title={t('light.title')}>💡 {t('light.title')}</button>
          {lightOpen && (
            <div className="w-56 space-y-2 rounded-lg border border-bg-3 bg-bg-1/95 p-2.5 text-[10.5px] uppercase tracking-wide text-slate-400 shadow-lg backdrop-blur">
              <label className="block">{t('light.level')} <span className="font-mono text-slate-300">{Math.round(lightLevel * 100)}%</span>
                <input type="range" className="mt-1 w-full" min="0.3" max="2" step="0.05" value={lightLevel} onChange={(e) => st.setLightLevel(parseFloat(e.target.value))} /></label>
              <label className="block">{t('light.angle')} <span className="font-mono text-slate-300">{lightAngle}°</span>
                <input type="range" className="mt-1 w-full" min="-90" max="90" step="1" value={lightAngle} onChange={(e) => st.setLightAngle(parseInt(e.target.value, 10))} /></label>
              <label className="flex items-center gap-2 normal-case"><input type="checkbox" checked={shadows} onChange={(e) => st.setShadows(e.target.checked)} /> {t('light.shadows')}</label>
              <label className="flex items-center gap-2 normal-case"><input type="checkbox" checked={reflections} onChange={(e) => st.setReflections(e.target.checked)} /> {t('light.reflections')}</label>
            </div>
          )}
        </div>
        {xray && <div className="max-w-[260px] rounded-md border border-accent/40 bg-bg-1/90 px-2.5 py-1.5 text-right text-[11px] text-accent">{t('xray.hint')}</div>}
      </div>

      {/* tools */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-bg-3 bg-bg-1/90 p-1.5 backdrop-blur">
        <Btn active={tool === 'select' && !armed} onClick={() => st.setTool('select')}>{t('tool.select')}</Btn>
        <Btn active={tool === 'wire'} onClick={() => st.setTool('wire')}>{t('tool.wire')} (W)</Btn>
        {tool === 'wire' && (
          <div className="flex items-center gap-1 pl-1" title={t('wire.color')}>
            {WIRE_COLORS.map((c) => (
              <button key={c} onClick={() => st.setWireColor(c)} style={{ background: c }} className={`h-5 w-5 rounded-full border-2 ${wireColor === c ? 'border-white' : 'border-bg-3'}`} />
            ))}
          </div>
        )}
        <span className="mx-0.5 h-5 w-px bg-bg-3" />
        <Btn disabled={!(selection && selection.kind === 'part')} onClick={() => selection && st.rotatePart(selection.id)}>{t('tool.rotate')}</Btn>
        <Btn disabled={!selection} className="btn-danger" onClick={() => st.deleteSelection()}>{t('tool.delete')}</Btn>
      </div>

      {/* hover info */}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-bg-3 bg-bg-1/90 px-3 py-1.5 font-mono text-xs text-slate-300">
        {hover
          ? <>{t('status.hole')} <b className="text-white">{hover.label}</b>{connected && <> · {fmt(hoverV, 'V')}</>}</>
          : <span className="text-slate-500">{armed ? `${t.comp(armed)} — R` : t('status.ready')}</span>}
      </div>

      {showHelp && (
        <div className="absolute left-3 top-[76px] max-w-sm rounded-lg border border-bg-3 bg-bg-1/90 p-3 text-[11px] leading-relaxed text-slate-400">
          <div className="mb-1 flex items-center justify-between"><b className="text-slate-200">{t('help.title')}</b><button className="text-slate-500 hover:text-white" onClick={() => st.toggleHelp()}>✕</button></div>
          <p>{t('help.1')}</p><p>{t('help.2')}</p><p>{t('help.3')}</p><p>{t('help.4')}</p>
        </div>
      )}
    </div>
  );
}
