import {prepare,chat,errorResponse} from '../server/core.mjs';
export const config={maxDuration:180};
export default async function handler(req,res){try{prepare(req,res,45);return res.status(200).json(await chat(req.body));}catch(e){return errorResponse(res,e);}}
