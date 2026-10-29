import {prepare,speak,errorResponse} from '../server/core.mjs';
export default async function handler(req,res){try{prepare(req,res,100);return res.status(200).json(await speak(req.body||{}));}catch(e){return errorResponse(res,e);}}
