import importlib.util
from pathlib import Path
import subprocess
import unittest
import tempfile
import shutil
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('patch', HERE / 'patch_runtime.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
BASE = '5fa387e563074522a68adf3b3df9e7e18a4d0be6'
ROOT = HERE.parent.parent

class RuntimeContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = Path(tempfile.mkdtemp())
        for name in ['server', 'db/repositories', 'auth/phone-otp-service']:
            ts = subprocess.check_output(['git','show',BASE+':backend/core/src/'+name+'.ts'], cwd=ROOT)
            script = "import ts from './backend/core/node_modules/typescript/lib/typescript.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(ts.transpileModule(s,{fileName:process.argv[1],compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,sourceMap:true}}).outputText);"
            js = subprocess.check_output(['node','--input-type=module','-e',script,name+'.ts'],input=ts,cwd=ROOT)
            (cls.temp / (name.replace('/','_')+'.js')).write_bytes(js)
    @classmethod
    def tearDownClass(cls): shutil.rmtree(cls.temp)
    def test_server_preserves_existing_screen_lock_additions(self):
        before=(self.temp/'server.js').read_text()
        before='// existing deployed screen lock route is preserved\n'+before
        after=p.server(before)
        self.assertIn(before.splitlines()[0],after)
        self.assertEqual(after.count('await handleDriverPasswordAuthRoute('),1)
        self.assertIn('driverPasswordAuthStore, adminRepository',after)
        self.assertIn("'/v1/auth/driver-registration/request'",after)
        with self.assertRaises(RuntimeError): p.server(after)
        with self.assertRaises(RuntimeError): p.server(before.replace("'/v1/auth/otp/request'", "'/unknown'"))
    def test_repository_one_pool_and_shared_identity(self):
        before=(self.temp/'db_repositories.js').read_text()
        after=p.repositories(before)
        self.assertEqual(after.count('createPostgresPool(databaseUrl)'),1)
        self.assertEqual(after.count('driverPasswordAuthStore:'),2)
        self.assertIn('authOtpRepository: driverAuthIdentities,',after)
        with self.assertRaises(RuntimeError): p.repositories(after)
    def test_previous_otp_recognition_is_exact(self):
        before=(self.temp/'auth_phone-otp-service.js').read_text()
        after=p.previous_otp(before)
        self.assertIn("process.env.WHATSAPP_OTP_ABUSE_CONTROLS === 'disabled'",after)
        with self.assertRaises(RuntimeError): p.previous_otp(after)

if __name__=='__main__': unittest.main()
