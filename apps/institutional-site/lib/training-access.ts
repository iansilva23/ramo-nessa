import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
export const accessSchema=z.object({mode:z.enum(['individual','shared','public']),username:z.string().trim().max(100),password:z.string().max(256),expectedRevision:z.number().int().nonnegative()}).strict();
export function hashPassword(password:string) { const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex'); }
export function verifyPassword(password:string,encoded:string) { const [salt,hex]=encoded.split(':');if(!salt||!hex)return false;const expected=Buffer.from(hex,'hex');const actual=scryptSync(password,salt,64);return expected.length===actual.length&&timingSafeEqual(expected,actual); }
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export const newToken=()=>randomBytes(32).toString('base64url');
