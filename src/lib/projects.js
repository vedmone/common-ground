const KEY = 'commonground:v1:projects';
export function loadProjects() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(p)
      ? p
          .filter(
            (x) =>
              x &&
              typeof x.id === 'string' &&
              x.id.startsWith('custom_') &&
              typeof x.name === 'string',
          )
          .slice(0, 24)
          .map((x) => ({
            ...x,
            name: x.name.slice(0, 70),
            html: blankHTML(x.name),
            swatch: ['#f3f1eb', '#46664e', '#6f5cd3'],
            suggestions: ['Tell Baat the landing page you want to build.'],
          }))
      : [];
  } catch {
    return [];
  }
}
export function saveProjects(projects) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        projects
          .map(({ id, name, kind, description }) => ({
            id,
            name,
            kind,
            description,
          }))
          .slice(-24),
      ),
    );
  } catch {}
}
export function blankHTML(name = 'Untitled page') {
  const title = String(name).replace(
    /[<>&"']/g,
    (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#faf9f5;color:#283c30;font-family:system-ui,sans-serif}main{min-height:95vh;display:grid;align-content:center;justify-items:center;text-align:center;padding:40px;background-image:radial-gradient(#cfd7c8 .7px,transparent .7px);background-size:22px 22px}small{font-size:10px;letter-spacing:.16em;color:#75836e}h1{font:400 50px/1.1 Georgia,serif;letter-spacing:-.04em;max-width:600px;margin:20px}p{font-size:15px;line-height:1.8;max-width:460px;color:#6f7a69}span{margin:25px;padding:10px 16px;border:1px dashed #c4d0bc;border-radius:7px;font-size:12px}</style></head><body><main data-cg-id="canvas"><small>A FRESH CANVAS</small><h1 data-cg-id="hero-heading">${title}</h1><p data-cg-id="brief">Tell Baat what you're making, who it's for, and how it should feel. Your landing page starts here.</p><span data-cg-id="canvas-hint">Describe it on the call, or open the HTML editor.</span></main></body></html>`;
}
