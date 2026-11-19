import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('routing_inspect', Path(__file__).with_name('inspect.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class DiagnosticTests(unittest.TestCase):
    def test_logs_are_aggregated_without_private_payloads(self):
        rows = [
            {'method':'POST','path':'/v1/rides/prepare','statusCode':503,'durationMs':5000,'message':'SECRET'},
            {'method':'POST','path':'/v1/rides/prepare','statusCode':201,'durationMs':20},
            {'method':'POST','path':'/v1/pricing/quote','statusCode':429,'durationMs':10},
            {'method':'GET','path':'/v1/rides/prepare','statusCode':200},
            {'method':'POST','path':'/v1/rides/prepare','statusCode':'secret'},
        ]
        result = m.summarize(('not-json\n'+'\n'.join(json.dumps(row) for row in rows)).encode())
        self.assertEqual(result['/v1/rides/prepare']['httpCounts'], {503:1,201:1})
        self.assertEqual(result['/v1/rides/prepare']['meanDurationMs'],2510)
        self.assertEqual(result['/v1/pricing/quote']['httpCounts'],{429:1})
        self.assertNotIn('SECRET',json.dumps(result))

    def test_probe_integrity_is_pinned(self):
        self.assertEqual(hashlib.sha256(Path(__file__).with_name('probe.mjs').read_bytes()).hexdigest(),m.PROBE_SHA)

    def probe(self, mode):
        source = Path(__file__).with_name('probe.mjs').read_text()
        compiled = str(ROOT / 'backend/core/dist/src') + '/'
        source = source.replace('/app/dist/src/', compiled)
        source = source.replace("import {createPostgresPool} from '"+compiled+"db/postgres.js';", 'const createPostgresPool = () => globalThis.testPool;')
        prefix = '''
process.env.GOOGLE_MAPS_SERVER_API_KEY='DO_NOT_PRINT_TEST_SECRET';
process.env.GOOGLE_ROUTES_BASE_URL=MODE==='external'?'https://untrusted.invalid/':'https://routes.googleapis.com/';
process.env.ROUTING_PROVIDER='google';
let count=0;
globalThis.fetch=async()=>{
 count++;
 const body=MODE==='permission'?{error:{status:'PERMISSION_DENIED',message:'DO_NOT_PRINT_TEST_SECRET',details:[{reason:'API_KEY_SERVICE_BLOCKED'}]}}:
  MODE==='near_missing'&&count===3?{}:{routes:[{distanceMeters:1234}]};
 return new Response(JSON.stringify(body),{status:MODE==='permission'?403:200});
};
const query=async(sql)=>{
 const value=sql.trim();
 if(!/^(SELECT|BEGIN READ ONLY|SET LOCAL|COMMIT|ROLLBACK)/i.test(value))throw Error('write blocked');
 if(value.includes('count(*)'))return {rows:[{online:1,busy:0,invalid_online_points:0}]};
 if(value.includes('FROM driver_supply'))return {rows:[{latitude:'1.123456789',longitude:'2.234567891',age_seconds:3}]};
 if(value.includes('FROM rides'))return {rows:[{pickup_latitude:'1.3',pickup_longitude:'2.4'}]};
 return {rows:[]};
};
globalThis.testPool={connect:async()=>({query,release(){}}),end:async()=>{}};
'''.replace('MODE',json.dumps(mode))
        run = subprocess.run(['node','--input-type=module','-e',prefix+source],capture_output=True,text=True,timeout=15,check=True)
        self.assertNotIn('DO_NOT_PRINT_TEST_SECRET',run.stdout)
        self.assertNotIn('1.123456789',run.stdout)
        return json.loads(run.stdout)

    def test_existing_provider_three_requests_and_nearby_route_failure(self):
        result = self.probe('near_missing')
        self.assertEqual(result['database']['status'],'READ_ONLY_OK')
        self.assertEqual(result['externalRequests'],3)
        self.assertEqual([row['outcome'] for row in result['probes']],['OK','OK','GOOGLE_NO_ROUTE'])
        self.assertEqual(result['probes'][2]['inputSeparationMeters'],4)

    def test_permission_failure_is_safe_and_stops_further_requests(self):
        result = self.probe('permission')
        self.assertEqual(result['externalRequests'],1)
        self.assertEqual(result['probes'][0]['outcome'],'GOOGLE_PERMISSION_DENIED')
        self.assertEqual(result['probes'][0]['googleReasons'],['API_KEY_SERVICE_BLOCKED'])

    def test_unrecognized_endpoint_never_receives_the_key(self):
        result = self.probe('external')
        self.assertEqual(result['probes'],[])
        self.assertFalse(result['configuration']['googleEndpoint'])
        self.assertEqual(result['probesSkipped'],'PROVIDER_CONFIGURATION_NEEDS_REVIEW')


if __name__ == '__main__':
    unittest.main()
