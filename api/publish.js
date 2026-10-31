import { prepareStorage, publishPage } from '../server/publishing.mjs';
import { errorResponse } from '../server/core.mjs';
export default async function handler(req, res) {
  try {
    prepareStorage(req, res, 20);
    res.json(await publishPage(req.body));
  } catch (e) {
    errorResponse(res, e);
  }
}
