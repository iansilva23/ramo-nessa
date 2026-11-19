export class AuthInputError extends Error { readonly code='INVALID_PHONE'; }
export function normalizeBrazilMobilePhone(value:string):string {
 const digits=value.replace(/\D/g,''),national=digits.startsWith('55')&&digits.length===13?digits.slice(2):digits;
 if(!/^[1-9]\d9\d{8}$/.test(national))throw new AuthInputError('Informe um celular brasileiro válido com DDD.');
 return '+55'+national;
}
export function resolvePasswordRateLimitSecret(env:NodeJS.ProcessEnv=process.env):string {
 const secret=env.AUTH_PASSWORD_RATE_LIMIT_SECRET?.trim();
 if(secret&&secret.length>=32)return secret;
 if(env.NODE_ENV==='production')throw new Error('AUTH_PASSWORD_RATE_LIMIT_SECRET precisa ter pelo menos 32 caracteres.');
 return 'ramo-nessa-development-password-rate-limit-secret';
}
