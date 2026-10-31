import { prepare, chat, errorResponse } from '../server/core.mjs';
import { serveChat } from '../server/stream.mjs';
export const config = { maxDuration: 180 };
export default async function handler(req, res) {
  try {
    prepare(req, res, 45);
    return await serveChat(req, res, chat);
  } catch (e) {
    return errorResponse(res, e);
  }
}
