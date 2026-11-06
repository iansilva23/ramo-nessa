import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('second_resume',Path(__file__).with_name('prepare.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ResumeTests(unittest.TestCase):
    def test_site_dockerfile_cleans_only_derived_image_code_and_restores_original_user(self):
        with tempfile.TemporaryDirectory() as directory:
            build=Path(directory);(build/'payload').mkdir();(build/'payload/new').write_text('new')
            original={'Id':'old','Config':{'User':'node','Env':['KEEP=literal$value'],'Volumes':{'/var/lib/ramo-site':{}}},'Os':'linux','Architecture':'amd64','RootFS':{'Layers':['base-layer']}}
            candidate={**original,'Id':'new','RootFS':{'Layers':['base-layer','cleanup-layer','copy-layer']}}
            calls=[]
            h=types.SimpleNamespace(inspect=lambda value,image:original if value=='old' else candidate,run=lambda args,**kwargs:calls.append(args))
            self.assertEqual('new',m.derive_image(h,'old','fixture-site',build,[('payload/','/app/')]))
            text=(build/'Dockerfile').read_text()
            self.assertIn('USER root\nRUN rm -rf -- /app/node_modules /app/.next /app/public /app/server.js /app/package.json\nUSER node\n',text)
            self.assertNotIn('/var/lib/ramo-site',text)
            self.assertTrue(all(c[1]!='exec' for c in calls))
            self.assertTrue(any('--network=none' in c and c[1]=='build' for c in calls))
            self.assertEqual('new',m.derive_image(h,'old','fixture-site',build,[('payload/','/app/')]))
            (build/'Dockerfile').write_text('different')
            with self.assertRaises(m.PreparationError):m.derive_image(h,'old','fixture-site',build,[('payload/','/app/')])

    def test_private_plan_reuse_never_overwrites_divergent_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'plan.json';h=types.SimpleNamespace(private_file=lambda p:p.read_bytes())
            previous=os.umask(0o077)
            try:
                digest=m.verified_save(h,p,{'value':'approved'})
                before=p.stat().st_mtime_ns
                self.assertEqual(digest,m.verified_save(h,p,{'value':'approved'}))
                self.assertEqual(before,p.stat().st_mtime_ns)
                with self.assertRaises(m.PreparationError):m.verified_save(h,p,{'value':'changed'})
                self.assertEqual({'value':'approved'},json.loads(p.read_bytes()))
            finally:os.umask(previous)

    def test_extracted_site_context_rejects_extra_changed_missing_or_linked_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);p=root/'file.js';p.write_bytes(b'code');p.chmod(0o644)
            meta={'files':{'file.js':m.sha(b'code')},'modes':{'file.js':0o644}}
            m.verify_extracted(root,meta)
            p.write_bytes(b'changed')
            with self.assertRaises(m.PreparationError):m.verify_extracted(root,meta)
            p.write_bytes(b'code');extra=root/'extra';extra.write_bytes(b'extra')
            with self.assertRaises(m.PreparationError):m.verify_extracted(root,meta)
            extra.unlink();p.unlink()
            with self.assertRaises(m.PreparationError):m.verify_extracted(root,meta)
            p.symlink_to(root/'absent')
            with self.assertRaises(m.PreparationError):m.verify_extracted(root,meta)

    def test_reused_image_requires_exact_id_configuration_and_base_layers(self):
        original={'Id':'old','Config':{'User':'node'},'RootFS':{'Layers':['base']}}
        candidate={'Id':'new','Config':{'User':'node'},'RootFS':{'Layers':['base','overlay']}}
        h=types.SimpleNamespace(inspect=lambda name,image:original if name=='old' else candidate)
        m.verify_image_base(h,'new','old')
        for bad in [{'Id':'other'},{'Config':{'User':'root'}},{'RootFS':{'Layers':['unexpected']}}]:
            changed={**candidate,**bad};h=types.SimpleNamespace(inspect=lambda name,image:original if name=='old' else changed)
            with self.assertRaises(m.PreparationError):m.verify_image_base(h,'new','old')

    def test_reused_image_file_probe_has_no_real_volumes_network_or_server_start(self):
        calls=[];expected={'/app/dist/module.js':'a'*64}
        h=types.SimpleNamespace(run=lambda args,**kwargs:(calls.append(args) or json.dumps(expected).encode()))
        m.verify_image_files(h,'pinned-image',{'dist/module.js':'a'*64},'/app/')
        args=calls[0];self.assertIn('--network=none',args);self.assertIn('--read-only',args)
        self.assertNotIn('--mount',args);self.assertNotIn('--volume',args)
        self.assertIn('pinned-image',args);self.assertIn('readFileSync',args[-1])
        with self.assertRaises(m.PreparationError):m.verify_image_files(types.SimpleNamespace(run=lambda *a,**k:b'{}'),'pinned-image',{'dist/module.js':'a'*64},'/app/')

    def test_gateway_proof_uses_sha256sum_and_rejects_mismatch_missing_duplicate_or_unexpected_files(self):
        path='/srv/admin/src/site-admin.js';digest='b'*64;calls=[]
        h=types.SimpleNamespace(run=lambda args,**kwargs:(calls.append(args) or (digest+'  '+path+'\n').encode()))
        m.verify_image_files(h,'gateway',{'src/site-admin.js':digest},'/srv/admin/')
        self.assertEqual('sha256sum',calls[0][calls[0].index('--entrypoint')+1]);self.assertNotIn('node',calls[0])
        self.assertIn('--network=none',calls[0]);self.assertNotIn('--mount',calls[0])
        for output in [b'',('a'*64+'  '+path).encode(),(digest+'  /srv/admin/unexpected').encode(),((digest+'  '+path+'\n')*2).encode()]:
            bad=types.SimpleNamespace(run=lambda *args,**kw:output)
            with self.assertRaises(m.PreparationError):m.verify_image_files(bad,'gateway',{'src/site-admin.js':digest},'/srv/admin/')

    def test_resume_refuses_nonpreparing_anchor_before_build_or_runtime_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);anchor=root/m.NAME;anchor.mkdir(mode=0o700)
            h=types.SimpleNamespace(private_file=lambda p:json.dumps({'phase':'prepared','source':m.SOURCE,'changesApplied':False}).encode())
            with patch.object(m,'ROOT',root):
                with self.assertRaisesRegex(m.PreparationError,'Fase da âncora'):m.resume_preparation(root,h,None)
            self.assertEqual([],list(anchor.iterdir()))

    def test_legacy_v3_phase_reaches_baseline_guard_without_rebuilding(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);anchor=root/m.NAME;anchor.mkdir(mode=0o700)
            h=types.SimpleNamespace(private_file=lambda p:json.dumps({'phase':'preparing','changesApplied':False}).encode())
            inventory=types.SimpleNamespace(collect_all=lambda:{'baselineSha256':'changed','activeWebRoot':str(m.BASE_WEB)})
            with patch.object(m,'ROOT',root):
                with self.assertRaisesRegex(m.PreparationError,'VPS mudou'):m.resume_preparation(root,h,inventory)
            self.assertTrue((anchor/'resume-progress.private.json').exists())
            self.assertFalse((anchor/'build-site-resume').exists())

    def test_progress_tracks_stage_and_failed_command_log_offset(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'command.private.log').write_bytes(b'old error')
            m.progress(root,'site-clean-image-build')
            value=json.loads((root/'resume-progress.private.json').read_bytes())
            self.assertEqual('site-clean-image-build',value['stage']);self.assertEqual(9,value['logOffset'])
            self.assertEqual(0o600,(root/'resume-progress.private.json').stat().st_mode&0o777)

if __name__=='__main__':unittest.main()
