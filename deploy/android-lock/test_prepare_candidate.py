import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location("preparer",Path(__file__).with_name("prepare-lock-candidate.py"))
p=importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

BASE_SERVER="""import fs from 'node:fs';
async function handler() {
        const driverOfferAction = requestUrl.pathname.match(/^\\/v1\\/driver\\/me\\/offers\\/([0-9a-fA-F-]+)\\/(accept|reject)$/);
        if (request.method === 'POST' && driverOfferAction != null) {
            const action = driverOfferAction[2];
            if (action === 'accept') {
                return;
            }
        }
}
"""
BASE_MATCHING="""export class PostgresRideMatchingRepository {
    async rejectOffer(input) {
        return input;
    }
}
"""

class CandidatePatchTests(unittest.TestCase):
    def test_changes_are_reversible_and_parse(self):
        server, matching=p.patch_sources(BASE_SERVER,BASE_MATCHING)
        self.assertIn("/v1/driver/me/screen-lock",server)
        self.assertIn("async lockDriverScreen(input)",matching)
        with tempfile.TemporaryDirectory() as tmp:
            for name,source in [("server.mjs",server),("matching.mjs",matching)]:
                file=Path(tmp)/name
                file.write_text(source)
                subprocess.run(["node","--check",str(file)],check=True,capture_output=True)
    def test_duplicate_anchor_fails_closed(self):
        with self.assertRaises(RuntimeError):
            p.patch_sources(BASE_SERVER+BASE_SERVER,BASE_MATCHING)
    def test_missing_accept_fails_closed(self):
        with self.assertRaises(RuntimeError):
            p.patch_sources(BASE_SERVER.replace("if (action === 'accept')","if (action === 'changed')"),BASE_MATCHING)
    def test_second_application_fails_closed(self):
        server,matching=p.patch_sources(BASE_SERVER,BASE_MATCHING)
        with self.assertRaises(RuntimeError):
            p.patch_sources(server,matching)

if __name__=="__main__":
    unittest.main()

