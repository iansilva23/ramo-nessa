import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('second_diagnose',Path(__file__).with_name('diagnose.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class DiagnosisTests(unittest.TestCase):
    def test_only_inspect_compose_config_compiled_read_and_exact_readonly_schema_probe_are_allowed(self):
        probe="await client.query('BEGIN READ ONLY'); SELECT filename,checksum FROM schema_migrations"
        commands=[['docker','inspect','container'],['docker','image','inspect','image'],['docker','compose','--project-directory','/private','--project-name','p','--env-file','/dev/null','-f','/private/config','config','--format','json'],['docker','exec','core','cat','/app/dist/src/server.js'],['docker','exec','core','node','--input-type=module','-e',probe]]
        for args in commands:self.assertIsInstance(m.read_operation(args,probe),str)
        for args in [['docker','build','.'],['docker','run','image'],['docker','compose','up','-d'],['docker','restart','core'],['docker','exec','core','cat','/run/secrets/api-key'],['docker','exec','core','node','--input-type=module','-e','DELETE FROM auth_identities'],['docker','exec','core','node','--input-type=module','-e',probe,'extra']]:
            with self.assertRaises(m.DiagnosisError):m.read_operation(args,probe)

    def test_failed_check_reports_phase_and_class_but_never_private_exception_or_command_output(self):
        with tempfile.TemporaryDirectory() as directory:
            d=m.Diagnosis(Path(directory));d.phase='compose-snapshot:core'
            (Path(directory)/'command.private.log').write_text('SECRET_ENV_VALUE\nPRIVATE_DATABASE_URL')
            try:raise RuntimeError('PRIVATE_EXCEPTION_VALUE')
            except RuntimeError as error:result=d.failure(error)
            serialized=json.dumps(result)
            for secret in ['SECRET_ENV_VALUE','PRIVATE_DATABASE_URL','PRIVATE_EXCEPTION_VALUE']:self.assertNotIn(secret,serialized)
            self.assertEqual('compose-snapshot:core',result['failedPhase'])
            self.assertEqual('RuntimeError',result['errorType'])
            self.assertIn('PRIVATE_EXCEPTION_VALUE',(Path(directory)/'exception.private.log').read_text())
            self.assertFalse(result['changesApplied']);self.assertFalse(result['servicesRestarted']);self.assertFalse(result['imagesBuilt'])

    def test_known_guard_or_missing_runtime_file_has_safe_actionable_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            d=m.Diagnosis(Path(directory));d.phase='compiled-code:core:dist/src/server.js'
            (Path(directory)/'command.private.log').write_text('PRIVATE_TOKEN\ncat: /app/dist/src/server.js: No such file or directory')
            result=d.failure(RuntimeError('Comando falhou. Detalhes privados.'))
            self.assertEqual('COMPILED_FILE_OR_RUNTIME_PATH_MISSING',result['commandFailureCategory'])
            self.assertNotIn('PRIVATE_TOKEN',json.dumps(result))
            result=d.failure(RuntimeError('Compose difere do ambiente ativo. Nenhum valor privado foi exibido.'))
            self.assertEqual('Compose difere do ambiente ativo. Nenhum valor privado foi exibido.',result['reason'])

    def test_runner_blocks_mutation_before_invoking_subprocess(self):
        with tempfile.TemporaryDirectory() as directory:
            d=m.Diagnosis(Path(directory));calls=[]
            runner=d.runner(lambda args,**kw:calls.append(args),'BEGIN READ ONLY')
            with self.assertRaises(m.DiagnosisError):runner(['docker','restart','core'])
            self.assertEqual([],calls)
            runner(['docker','inspect','core']);self.assertEqual(1,len(calls))

    def test_runtime_change_stops_before_reading_payloads_or_attempting_preparation(self):
        with tempfile.TemporaryDirectory() as directory:
            d=m.Diagnosis(Path(directory))
            inv=types.SimpleNamespace(collect_all=lambda:{'baselineSha256':'changed'})
            target=types.SimpleNamespace(BASELINE='expected')
            with self.assertRaises(m.DiagnosisError):m.run_checks(d,target,inv,None,Path(directory))
            self.assertEqual('runtime-inventory',d.phase)

if __name__=='__main__':unittest.main()
