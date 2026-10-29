// Mutable store for everything the preview bridge reports. Hover data lives in plain fields (no React
// state per mouse move); components subscribe only to the coarse snapshot (ready / selection / a
// debounced hover summary) through useSyncExternalStore.

export function createBridgeStore() {
  let snapshot = { ready: false, generation: 0, selection: null, hover: null, title: '', count: 0, url: '' };
  const listeners = new Set();
  const waiters = new Set();
  let hoverTimer = 0;

  const store = {
    hover: null,
    trail: [],
    elements: [],
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(partial) {
      snapshot = { ...snapshot, ...partial };
      for (const fn of listeners) fn();
    },
    reset() {
      clearTimeout(hoverTimer);
      store.hover = null;
      store.elements = [];
      store.set({ ready: false, selection: null, hover: null, count: 0 });
    },
    markReady({ title = '', elements = [], count = 0, url = '' }) {
      store.elements = Array.isArray(elements) ? elements : [];
      const generation = snapshot.generation + 1;
      store.set({ ready: true, generation, title, count, url });
      for (const w of [...waiters]) if (generation > w.after) {
        waiters.delete(w);
        w.resolve(true);
      }
    },
    setElements(elements) {
      if (Array.isArray(elements)) store.elements = elements;
    },
    recordHover(element, at) {
      store.hover = element || null;
      if (element) {
        const last = store.trail[store.trail.length - 1];
        if (!last || last.id !== element.id) {
          store.trail.push({ id: element.id, kind: element.kind, label: element.label, tag: element.tag, at: at || Date.now() });
          if (store.trail.length > 40) store.trail.splice(0, store.trail.length - 40);
        }
      }
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => store.set({ hover: store.hover }), 160);
    },
    /** Resolve once a cg:ready newer than `after` has arrived, or false on timeout. */
    waitForReady(after, timeout = 5000) {
      if (snapshot.generation > after) return Promise.resolve(true);
      return new Promise((resolve) => {
        const w = { after, resolve };
        waiters.add(w);
        setTimeout(() => {
          if (waiters.delete(w)) resolve(false);
        }, timeout);
      });
    },
  };
  return store;
}
