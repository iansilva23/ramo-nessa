// API ingress stays stopped until SQL and the private Core checks succeed.
export async function switchMpProduction(steps){
  let paused=false,dataAttempted=false,coreAttempted=false,opening=false;
  try{
    paused=true;await steps.pause();await steps.assertPaused();
    dataAttempted=true;await steps.applyData();
    coreAttempted=true;await steps.upProduction();await steps.verifyPrivate();
    // Once ingress might have opened, real requests can exist. Never roll back
    // finance automatically after this boundary, even if the start response is lost.
    opening=true;await steps.openIngress();await steps.verifyPublic();
    return {completed:true};
  }catch(cause){
    if(opening){const error=new Error('MP_PRODUCTION_OPEN_REQUIRES_REVIEW',{cause});error.productionMayBeOpen=true;throw error;}
    const failures=[];
    try{
      if(paused){await steps.ensurePaused();if(coreAttempted)await steps.stopCandidate();
        if(dataAttempted)await steps.reverseData();await steps.upRollback();await steps.verifyRollbackPrivate();await steps.openRollbackIngress();await steps.verifyRollbackPublic();}
    }catch(error){failures.push(error.message);}
    const error=new Error(failures.length?'MP_ROLLBACK_REQUIRES_REVIEW':'MP_ACTIVATION_ROLLED_BACK',{cause});error.rollbackComplete=failures.length===0;error.rollbackFailures=failures;throw error;
  }
}
