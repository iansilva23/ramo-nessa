// Keep the managed-capable Core if catalog recovery cannot be proved safe.
// Never restore a database dump or overwrite a later administrator's catalog.
export async function switchRegionsRuntime(steps){
  await steps.preflight();
  let coreTouched=false,gatewayTouched=false,resetAttempted=false;
  try{
    coreTouched=true;await steps.upCore();await steps.checkCore();
    gatewayTouched=true;await steps.upGateway();await steps.checkGateway();
    await steps.beforeReset();resetAttempted=true;await steps.applyReset();
    await steps.verify();return {activated:true};
  }catch(cause){
    if(resetAttempted){
      let recovery;
      try{recovery=await steps.restoreCatalogIfUnchanged();}catch{recovery='unknown';}
      if(!['restored','unchanged'].includes(recovery)){
        const error=Error('Ativação requer conferência: catálogo mudou ou sua recuperação não pôde ser confirmada. A candidata foi preservada para não reativar preços legados.',{cause});
        error.rollbackComplete=false;error.catalogRecovery=recovery;error.candidatePreserved=true;throw error;
      }
    }else if(coreTouched){
      let safe=false;
      try{safe=await steps.checkRollbackSafety()==='legacy';}catch{}
      if(!safe){const error=Error('Retorno interrompido: o estado do catálogo não permite reativar o motor anterior.',{cause});error.rollbackComplete=false;error.candidatePreserved=true;error.catalogRecovery='external-managed-or-unknown';throw error;}
    }
    const failures=[];
    if(coreTouched)try{await steps.rollbackCore();}catch{failures.push('core');}
    if(gatewayTouched)try{await steps.rollbackGateway();}catch{failures.push('gateway');}
    try{await steps.verifyRollback();}catch{failures.push('verification');}
    const error=Error(failures.length?'Ativação interrompida; retorno requer conferência.':'Ativação interrompida; versão anterior restaurada e conferida.',{cause});
    error.rollbackComplete=failures.length===0;error.rollbackFailures=failures;throw error;
  }
}
