import {organizeAdminNavigation, syncAdminNavigation, organizeAdminWorkspace} from './admin-workspace.js';

const nav = document.querySelector('.sidebar-nav');
organizeAdminNavigation(nav);
syncAdminNavigation(nav);
if (nav) new MutationObserver(() => syncAdminNavigation(nav))
  .observe(nav, {subtree:true, attributes:true, attributeFilter:['hidden']});

const outlet = document.getElementById('route-outlet');
function organize() {
  const panel = outlet?.querySelector('.view-panel');
  if (panel) organizeAdminWorkspace(panel, panel.id.slice(5));
}
organize();
if (outlet) new MutationObserver(organize).observe(outlet, {childList:true});
