import multer from 'multer';
import {prepare,transcribe,errorResponse,AppError} from '../server/core.mjs';
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8_000_000,files:1}});
export const config={api:{bodyParser:false}};
export default async function handler(req,res){try{prepare(req,res,100);await new Promise((resolve,reject)=>upload.single('file')(req,res,e=>e?reject(new AppError('Try a shorter audio recording (under 8 MB).',413)):resolve()));return res.status(200).json(await transcribe(req.file));}catch(e){return errorResponse(res,e);}}
