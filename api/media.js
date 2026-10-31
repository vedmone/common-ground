import multer from 'multer';
import { prepareStorage, uploadImage } from '../server/publishing.mjs';
import { errorResponse, AppError } from '../server/core.mjs';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3_000_000, files: 1 },
});
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  try {
    prepareStorage(req, res, 40);
    await new Promise((resolve, reject) =>
      upload.single('file')(req, res, (e) =>
        e
          ? reject(new AppError('Use an image smaller than 3 MB.', 413))
          : resolve(),
      ),
    );
    res.json(await uploadImage(req.file));
  } catch (e) {
    errorResponse(res, e);
  }
}
