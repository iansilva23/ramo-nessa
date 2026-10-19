// Core-only image switch. No migration, remote transfer, or database restore callback.
export async function switchReceiverCore(steps) {
 let touched=false;
 try {
  touched=true;await steps.up();await steps.check();await steps.verify();
 } catch (cause) {
  const errors=[];
  if(touched)try{await steps.rollback();}catch(e){errors.push(e.message??'rollback');}
  if(!errors.length)try{await steps.verifyRollback();}catch(e){errors.push(e.message??'verification');}
  const error=new Error(errors.length?'Receptor requer conferência; retorno não confirmado.':'Receptor não ativado; Core anterior restaurado e conferido.',{cause});
  error.rollbackComplete=errors.length===0;error.rollbackFailures=errors;throw error;
 }
}
