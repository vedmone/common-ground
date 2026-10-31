import { publicationId, readBlob } from '../server/publishing.mjs';
export default async function handler(req, res) {
  const id = req.query?.id;
  if (!publicationId(id)) return res.status(404).send('Page not found.');
  try {
    const html = await readBlob(`sites/${id}.html`);
    if (!html)
      return res.status(404).send('This page has not been published yet.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public,max-age=0,must-revalidate');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src https: data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.send(html);
  } catch {
    res
      .status(503)
      .send('This page is temporarily unavailable. Please try again.');
  }
}
