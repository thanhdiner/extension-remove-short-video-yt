// Observe intrinsic content, rather than the iframe viewport that we resize.
export function watchFocusFrame(frame, onReady, {
  Observer = ResizeObserver,
  request = requestAnimationFrame,
  cancel = cancelAnimationFrame,
} = {}) {
  const doc = frame.contentDocument;
  const content = doc?.querySelector('.popup-container');
  if (!content) return () => {};
  let scheduled = null;
  let stopped = false;
  let ready = false;
  const schedule = () => {
    if (stopped || scheduled !== null) return;
    scheduled = request(() => {
      scheduled = null;
      if (stopped) return;
      const height = Math.min(500, Math.max(1, Math.ceil(content.getBoundingClientRect().height)));
      if (frame.style.height !== `${height}px`) frame.style.height = `${height}px`;
      if (!ready) { ready = true; onReady(); }
    });
  };
  const observer = new Observer(schedule);
  observer.observe(content);
  schedule();
  doc.fonts?.ready.then(schedule);
  return () => {
    stopped = true;
    observer.disconnect();
    if (scheduled !== null) cancel(scheduled);
  };
}
