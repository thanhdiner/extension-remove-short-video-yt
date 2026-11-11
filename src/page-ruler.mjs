// Self-contained: Chrome serializes this function into the tab's isolated world.
export function togglePageRuler(labels) {
  const key = '__dinkitPageRuler';
  if (globalThis[key]) { globalThis[key](); return false; }
  const host = document.createElement('div');
  host.id = 'dinkit-page-ruler';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;max-width:none!important;max-height:none!important;z-index:2147483647!important;background:transparent!important;';
  host.setAttribute('popover', 'manual');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{color-scheme:light} *{box-sizing:border-box}
    .surface{position:absolute;inset:0;contain:strict;cursor:crosshair;touch-action:none;user-select:none;overflow:hidden;background-image:linear-gradient(#0000000d 1px,transparent 1px),linear-gradient(90deg,#0000000d 1px,transparent 1px);background-size:50px 50px}
    .surface.no-grid{background-image:none}
    .box{position:absolute;left:0;top:0;border:1px solid #00000026;background:#f5c40026;pointer-events:none;will-change:transform}
    .measurements{position:absolute;inset:0;pointer-events:none}
    .metric{position:absolute;top:0;left:0;width:110px;height:32px;padding:0 5px;border:1px solid #00000026;background:#fff;color:#111;text-align:center;font:600 14px/32px monospace;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;will-change:transform}
    .toolbar{position:absolute;top:1px;left:1px;max-width:calc(100% - 2px);font:11px/1.4 Arial,sans-serif;color:#333;cursor:default}
    summary{width:128px;max-width:100%;padding:7px 10px;background:#f5c400;font-weight:600;letter-spacing:1px;text-align:center;list-style:none;cursor:pointer}summary::-webkit-details-marker{display:none}
    .controls{display:flex;flex-wrap:wrap;gap:6px;max-width:360px;padding:10px;background:#fff;border:1px solid #ddd;box-shadow:0 3px 10px #0002}
    button{font:12px Arial,sans-serif;color:#333;background:#fff;border:1px solid #ccc;padding:5px 9px;cursor:pointer}button:hover{background:#fff7d0}button:focus-visible,summary:focus-visible{outline:2px solid #a78100}
    .hint{flex-basis:100%;font-size:11px;color:#666}.box[hidden],.measurements[hidden]{display:none}
  `;
  const surface = document.createElement('div'); surface.className = 'surface';
  const box = document.createElement('div'); box.className = 'box'; box.hidden = true;
  const measurements = document.createElement('div'); measurements.className = 'measurements'; measurements.hidden = true;
  const metricNames = ['start-x', 'start-y', 'w', 'h', 'end-x', 'end-y'];
  const metrics = metricNames.map(name => { const el = document.createElement('span'); el.className = `metric metric-${name}`; measurements.append(el); return el; });
  surface.append(box, measurements);
  const toolbar = document.createElement('details'); toolbar.className = 'toolbar';
  const title = document.createElement('summary'); title.textContent = labels.mode || 'Ruler mode…'; title.title = labels.hint;
  const controls = document.createElement('div'); controls.className = 'controls'; controls.setAttribute('aria-label', labels.title);
  const button = (text, action) => { const el = document.createElement('button'); el.textContent = text; el.type = 'button'; el.addEventListener('click', action); return el; };
  const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = labels.hint;
  let start = null, end = null, pointerId = null, lastClient = null;
  let frame = 0, lastScrollX = NaN, lastScrollY = NaN;
  const lastText = [];
  const textMeasure = document.createElement('canvas').getContext('2d');
  textMeasure.font = '600 14px monospace';
  let sizingKey = '', labelWidth = 110, labelFontSize = 14;
  const abort = new AbortController();
  const previousFocus = document.activeElement;
  const dispose = () => { cancelAnimationFrame(frame); abort.abort(); host.remove(); delete globalThis[key]; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  globalThis[key] = dispose;
  const reset = button(labels.reset, () => { cancelAnimationFrame(frame); frame = 0; start = end = null; box.hidden = measurements.hidden = true; toolbar.open = false; });
  const grid = button(labels.grid, () => { const hidden = surface.classList.toggle('no-grid'); grid.setAttribute('aria-pressed', String(!hidden)); }); grid.setAttribute('aria-pressed', 'true');
  const close = button(labels.close, dispose);
  controls.append(reset, grid, close, hint); toolbar.append(title, controls);
  shadow.append(style, surface, toolbar);
  document.documentElement.append(host);
  // The top layer also covers dialogs and pages with unusually high z-indexes.
  try { host.showPopover(); } catch { /* Fixed overlay fallback. */ }
  const badge = title.getBoundingClientRect();
  const render = () => {
    frame = 0;
    if (!start || !end) return;
    const sx = scrollX, sy = scrollY;
    const left = Math.min(start.x, end.x), top = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    box.hidden = measurements.hidden = false;
    // Preserve subpixel pointer coordinates for motion; round only the labels.
    Object.assign(box.style, { transform: `translate3d(${left - sx}px,${top - sy}px,0)`, width: `${w}px`, height: `${h}px` });
    const x = left - sx, y = top - sy, right = x + w, bottom = y + h;
    const values = [left, top, w, h, left+w, top+h];
    const names = ['x', 'y', 'w', 'h', 'x', 'y'];
    const texts = values.map((v,i)=>`(${names[i]}) ${Math.round(v)}px`);
    const longest = texts.reduce((a,b)=>a.length>=b.length?a:b);
    const vw = innerWidth, vh = innerHeight, lh = 32;
    const key = `${longest.length}:${vw}:${vh}`;
    if (key !== sizingKey) {
      // Include letter spacing, padding and borders; long document coordinates
      // must remain readable instead of silently turning into an ellipsis.
      // When long coordinates and a zoomed/narrow viewport occur together,
      // reserve enough rows/columns for all six labels below the status badge.
      const rows = Math.max(1,Math.floor((vh-badge.bottom-1)/(lh+1)));
      const columns = Math.ceil(6/rows);
      const maxWidth = Math.floor((vw-2-(columns-1))/columns);
      labelFontSize = 14;
      let measured;
      do {
        textMeasure.font = `600 ${labelFontSize}px monospace`;
        measured = Math.ceil(textMeasure.measureText(longest).width+longest.length+14);
        if (measured <= maxWidth || labelFontSize <= 6) break;
        labelFontSize -= .25;
      } while (true);
      labelWidth = Math.min(maxWidth,Math.max(110,measured));
      sizingKey = key;
    }
    const lw = labelWidth;
    // Page Ruler's default layout uses stable edge zones, not a search for the
    // cheapest non-overlapping arrangement. Keep each label in its prescribed
    // slot until the rectangle crosses a zone boundary.
    const freeLeft = x > lw+3, freeTop = y > lh*2+3;
    const freeRight = right < vw-lw-3, freeBottom = bottom < vh-lh*2-3;
    const roomy = w*h > lw*lh*2 && ((w>lw*2 && h>lh+2) || (h>lh*2 && w>lw+2));
    const positions = Array(6);
    const at = (i, dx, dy) => { positions[i] = [x+dx+2, y+dy+2]; }; // border + label margin
    const outsideLeft = -lw-3, above = -lh-3;
    if (freeRight) {
      if (freeTop) {
        at(0, freeLeft ? outsideLeft : 0, freeLeft ? 0 : above);
        at(1, freeLeft ? 0 : lw+1, above);
      } else if (freeLeft) {
        at(0, outsideLeft, 0); at(1, outsideLeft, lh+1);
      } else if (roomy) {
        at(0, 0, freeBottom ? h+lh : h-lh*2-4);
        at(1, 0, freeBottom ? h+lh*2+1 : h-lh-4);
      } else {
        const row = freeBottom ? h-lh-1 : h-lh*3-1;
        at(0, w-1, row); at(1, w+lw, row);
      }
      if (roomy) {
        at(2, (w-lw)/2-1, 0); at(3, 0, (h-lh)/2-2);
        at(4, w-1, h-lh-4);
        at(5, freeBottom ? w-lw-4 : w+lw+1, freeBottom ? h-1 : h-lh-4);
      } else {
        const row = freeBottom ? h+lh : h-lh*2-1;
        at(2, w-1, row); at(3, w+lw, row);
        at(4, w-1, freeBottom ? h-1 : h-lh-1);
        at(5, w+lw, freeBottom ? h-1 : h-lh-1);
      }
    } else {
      at(0, freeLeft ? outsideLeft : 0, freeLeft ? (freeTop ? -lh-1 : 0) : (freeTop ? above : 0));
      at(1, freeLeft ? outsideLeft : lw+1, freeLeft ? (freeTop ? 0 : lh+1) : (freeTop ? above : 0));
      const column = w-lw-3;
      at(2, column, freeBottom ? h+lh*2-1 : h-lh*4-3);
      at(3, column, freeBottom ? h+lh*3-1 : h-lh*3-3);
      at(4, column, freeBottom ? h-1 : h-lh*2-3);
      at(5, column, freeBottom ? h+lh-1 : h-lh-3);
    }
    // Dimensions belong outside the selection: W above its horizontal edge,
    // H to the left of its vertical edge. Keep the measured content readable.
    positions[2] = [(x+right-lw)/2,y-lh-2];
    positions[3] = [x-lw-2,(y+bottom-lh)/2];
    const space = 1;
    const badgeRect = [badge.x,badge.y,badge.width,badge.height];
    const selectionRect = [x,y,w,h];
    const collides = (a,b) => a[0] < b[0]+(b[2]??lw)+space-.01 && a[0]+lw+space-.01 > b[0] && a[1] < b[1]+(b[3]??lh)+space-.01 && a[1]+lh+space-.01 > b[1];
    const inBounds = p => p[0] >= 1 && p[1] >= 1 && p[0]+lw <= vw-1 && p[1]+lh <= vh-1;
    const fit = blockers => {
      const fitted = positions.map(p=>p.slice()), placed = blockers.slice();
      let crowded = false;
      for (const i of [0,1,4,5,2,3]) {
        const desired = fitted[i];
        if (!inBounds(desired) || placed.some(p=>collides(desired,p))) {
          const clampX = px => Math.max(1,Math.min(vw-lw-1,px));
          const clampY = py => Math.max(1,Math.min(vh-lh-1,py));
          const xs = [clampX(desired[0]),1,vw-lw-1];
          const ys = [clampY(desired[1]),1,vh-lh-1];
          for (const p of placed) { xs.push(clampX(p[0]-lw-space),clampX(p[0]+(p[2]??lw)+space)); ys.push(clampY(p[1]-lh-space),clampY(p[1]+(p[3]??lh)+space)); }
          let best = null, distance = Infinity;
          for (const px of xs) for (const py of ys) {
            const candidate = [px,py];
            if (!inBounds(candidate) || placed.some(p=>collides(candidate,p))) continue;
            const d = Math.abs(px-desired[0])+Math.abs(py-desired[1]);
            if (d<distance) { best = candidate; distance = d; }
          }
          if (best) fitted[i] = best;
          else { crowded = true; break; }
        }
        placed.push(fitted[i]);
      }
      if (!crowded) return fitted;
      // Only reflow all six if fragmented space prevents local placement.
      let packed = null, nearest = Infinity;
      for (let columns=1;columns<=6;columns++) {
        const rows = Math.ceil(6/columns), pw = columns*(lw+space)-space, ph = rows*(lh+space)-space;
        if (pw>vw-2 || ph>vh-2) continue;
        const clampX = px => Math.max(1,Math.min(vw-pw-1,px));
        const clampY = py => Math.max(1,Math.min(vh-ph-1,py));
        for (const px of [x-pw-space,right+space,(x+right-pw)/2,1,vw-pw-1]) for (const py of [y-ph-space,bottom+space,(y+bottom-ph)/2,badge.bottom+space,1,vh-ph-1]) {
          const cx = clampX(px), cy = clampY(py);
          const group = positions.map((_,i)=>[cx+(i%columns)*(lw+space),cy+Math.floor(i/columns)*(lh+space)]);
          if (group.some(p=>blockers.some(b=>collides(p,b)))) continue;
          const distance = Math.abs(cx+pw/2-(x+right)/2)+Math.abs(cy+ph/2-(y+bottom)/2);
          if (distance<nearest) { packed = group; nearest = distance; }
        }
      }
      return packed;
    };
    // Try the entire layout outside the rectangle first. With a selection that
    // fills a tiny viewport, fall back to readable labels within that viewport.
    const fitted = fit([badgeRect,selectionRect]) || fit([badgeRect]);
    if (fitted) fitted.forEach((p,i)=>{ positions[i] = p; });
    metrics.forEach((el, i) => {
      const text = texts[i];
      if (lastText[i] !== text) { el.textContent = lastText[i] = text; }
      el.style.width = `${lw}px`;
      el.style.fontSize = `${labelFontSize}px`;
      el.style.transform = `translate3d(${positions[i][0]}px,${positions[i][1]}px,0)`;
    });
    if (sx !== lastScrollX || sy !== lastScrollY) {
      surface.style.backgroundPosition = `${-sx}px ${-sy}px`;
      lastScrollX = sx; lastScrollY = sy;
    }
  };
  // High polling-rate mice can deliver multiple moves per display frame.
  // Keep only the latest position and commit DOM changes once before paint.
  const scheduleRender = () => { if (!frame) frame = requestAnimationFrame(render); };
  const flushRender = () => { cancelAnimationFrame(frame); render(); };
  const point = e => ({ x: e.clientX + scrollX, y: e.clientY + scrollY });
  surface.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    toolbar.open = false;
    pointerId = e.pointerId; lastClient = { clientX: e.clientX, clientY: e.clientY };
    start = end = point(e); surface.setPointerCapture(pointerId); scheduleRender();
  });
  surface.addEventListener('pointermove', e => {
    if (e.pointerId !== pointerId) return;
    lastClient = { clientX: e.clientX, clientY: e.clientY }; end = point(e); scheduleRender();
  });
  const finish = e => { if (e.pointerId !== pointerId) return; end = point(e); pointerId = null; lastClient = null; flushRender(); };
  surface.addEventListener('pointerup', finish);
  surface.addEventListener('pointercancel', () => { pointerId = null; lastClient = null; });
  // Consume interactions on the measuring layer so they cannot click page controls.
  for (const event of ['click', 'dblclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointermove']) host.addEventListener(event, e => { e.stopPropagation(); if (event === 'contextmenu') e.preventDefault(); });
  window.addEventListener('scroll', () => { if (pointerId !== null && lastClient) end = point(lastClient); scheduleRender(); }, { passive: true, signal: abort.signal });
  window.addEventListener('resize', scheduleRender, { passive: true, signal: abort.signal });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dispose(); return; }
    if (!start || !end || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const step = e.shiftKey ? 10 : 1;
    end = { x: Math.max(0, end.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)), y: Math.max(0, end.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)) }; scheduleRender();
  }, { capture: true, signal: abort.signal });
  host.tabIndex = -1; host.focus({ preventScroll: true });
  return true;
}

export async function openPageRuler(labels, api = chrome) {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('rulerUnavailable');
  try {
    await api.scripting.executeScript({ target: { tabId: tab.id }, func: togglePageRuler, args: [labels] });
  } catch { throw new Error('rulerUnavailable'); }
}
