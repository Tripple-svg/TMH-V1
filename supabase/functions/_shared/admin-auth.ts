import { publicRequestLimit } from './abuse-limits.ts';
import { HavenRequestError,readBoundedJson } from './haven-request.ts';
export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function readAdminBody(request:Request){
  try{return await readBoundedJson(request,16384);}
  catch(error){throw new AdminAuthError(error instanceof HavenRequestError?error.message:'Invalid request.',error instanceof HavenRequestError?error.status:400);}
}
// getUser verifies the token with Auth. Only trusted app_metadata grants access;
// a customer account, public key, JSON email or user_metadata cannot become admin.
export async function requireAdmin(db: any, request: Request, serviceKey: string) {
  const match=request.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i);
  if(!match || match[1]===serviceKey)throw new AdminAuthError('Unauthorised',401);
  try { await publicRequestLimit(db,request,serviceKey,'admin-api',60,60); }
  catch(error) { throw new AdminAuthError(error instanceof HavenRequestError?error.message:'Authentication checks are unavailable.',error instanceof HavenRequestError?error.status:503); }
  let result;
  try{result=await db.auth.getUser(match[1]);}
  catch{throw new AdminAuthError('Authentication is temporarily unavailable. Please retry.',503);}
  if(result.error || !result.data?.user)throw new AdminAuthError('Unauthorised',401);
  if(result.data.user.app_metadata?.role!=='admin')throw new AdminAuthError('Admin access required.',403);
  return result.data.user;
}
