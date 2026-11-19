import Home from './home';
import { siteManagement } from '@/db/site-management';
export const dynamic = 'force-dynamic';
export default function Page() { return <Home initialContent={siteManagement().state().published}/>; }
