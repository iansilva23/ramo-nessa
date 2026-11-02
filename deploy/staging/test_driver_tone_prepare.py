import importlib.util
import json
import tempfile
from pathlib import Path
from unittest import TestCase, mock

HERE = Path(__file__).resolve().parent / 'driver-tone-prepare-production.py'
spec = importlib.util.spec_from_file_location('tone_release', HERE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class SafePromotionPrepareTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.active = self.root / 'old' / 'bundles'
        self.driver = self.active / 'driver'
        self.driver.mkdir(parents=True)
        self.passenger = self.active / 'passenger'
        self.passenger.mkdir()
        self.stage = self.root / 'hml'
        (self.stage / 'driver').mkdir(parents=True)
        self.release = self.root / 'new-release'
        self.addCleanup(mock.patch.stopall)

        key = 'AIza' + 'A' * 35
        index = '<base href="/motorista/"><script src="https://maps.googleapis.com/maps/api/js?key='+key+'"></script>'
        self.put(self.driver, 'index.html', index.encode())
        self.put(self.driver, 'main.dart.js', b'old driver')
        self.put(self.driver, 'manifest.json', b'{"name":"driver"}')
        for name in mod.PROTECTED:
            self.put(self.driver, name, ('live-' + name).encode())
        self.put(self.passenger, 'main.dart.js', b'original-passenger')
        audio = b'fake loop bytes for test'
        newfiles = {
            'main.dart.js': b'new ringtone driver',
            'index.html': b'<base href="/motorista-toque-hml/"><script src="https://maps.googleapis.com/maps/api/js?key=WEB_KEY_NOT_CONFIGURED_FOR_CI"></script>',
            'assets/assets/audio/nova_corrida.mp3': audio,
            'ramo_push_config.js': b'self.ramoPushConfig = null;',
        }
        for name, data in newfiles.items():
            self.put(self.stage / 'driver', name, data)
        manifest = {
            'sourceCommit': mod.EXPECTED_SOURCE, 'schemaVersion': 1, 'role': 'driver',
            'ciPreviewOnly': True, 'basePath': '/motorista-toque-hml/',
            'audioSha256': mod.sha(audio),
            'files': [{
                'path': name, 'bytes': len(data), 'sha256': mod.sha(data)
            } for name, data in newfiles.items()]
        }
        (self.stage / 'manifest.hml.json').write_text(json.dumps(manifest))
        self.patch('EXPECTED_ACTIVE_ROOT', self.active)
        self.patch('EXPECTED_ACTIVE_MAIN_SHA', mod.file_hash(self.driver / 'main.dart.js'))
        self.patch('STAGE', self.stage)
        self.patch('RELEASE', self.release)
        self.patch('BUNDLES', self.release / 'bundles')
        self.patch('AUDIO_SHA', mod.sha(audio))
        mock.patch.object(mod, 'inspect', lambda: {'Mounts':[{'Destination':'/srv/web','Source':str(self.active)}]}).start()
        mock.patch.object(mod.os, 'geteuid', lambda: 0).start()

    @staticmethod
    def put(root, name, data):
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def patch(self, name, value):
        mock.patch.object(mod, name, value).start()

    def test_new_candidate_preserves_active_app_push_passenger(self):
        mod.main()
        candidate = self.release / 'bundles/driver'
        self.assertEqual((self.driver/'main.dart.js').read_bytes(), b'old driver')
        self.assertEqual((candidate/'main.dart.js').read_bytes(), b'new ringtone driver')
        self.assertIn('<base href="/motorista/">', (candidate/'index.html').read_text())
        self.assertNotIn('WEB_KEY_NOT_CONFIGURED_FOR_CI', (candidate/'index.html').read_text())
        for name in mod.PROTECTED:
            self.assertEqual((candidate/name).read_bytes(), (self.driver/name).read_bytes())
        self.assertEqual((self.release/'bundles/passenger/main.dart.js').read_bytes(), b'original-passenger')
        self.assertEqual(json.loads((self.release/'prepare-report.json').read_text())['status'], 'PREPARED_NOT_ACTIVE')

    def test_changed_live_driver_blocks_release(self):
        (self.driver/'main.dart.js').write_bytes(b'unexpected live version')
        with self.assertRaises(SystemExit):
            mod.main()
        self.assertFalse(self.release.exists())

    def test_modified_ringtone_blocks_release(self):
        (self.stage/'driver/assets/assets/audio/nova_corrida.mp3').write_bytes(b'tampered')
        with self.assertRaises(SystemExit):
            mod.main()
        self.assertFalse(self.release.exists())
