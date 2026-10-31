import { prepare, errorResponse } from '../server/core.mjs';
import { discuss } from '../server/discuss.mjs';
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  try {
    prepare(req, res, 90);
    return res.status(200).json(await discuss(req.body));
  } catch (error) {
    return errorResponse(res, error);
  }
}
