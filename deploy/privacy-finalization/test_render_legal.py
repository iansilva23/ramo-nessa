import importlib.util
from pathlib import Path
import unittest

root=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('legal_renderer',root/'render-legal.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class LegalRenderingTests(unittest.TestCase):
 def test_incomplete_identity_or_retention_never_produces_publishable_documents(self):
  with self.assertRaises(ValueError):m.render({'legalName':'Ramo Nessa'},root)
 def test_complete_reviewed_inputs_resolve_all_placeholders_without_faking_publication(self):
  config={'legalName':'Empresa sintética de teste','registeredAddress':'Endereço sintético de teste','providerDescription':'Provedores sintéticos','internationalProcessingDescription':'Descrição sintética revisada','retention':[{'category':k,'period':'Período sintético','basis':'Fundamento sintético','endAction':'Destino sintético'}for k in sorted(m.CATEGORIES)]}
  result=m.render(config,root)
  self.assertEqual(set(result),{'terms_of_use','privacy_policy'})
  self.assertTrue(all('{{'not in text for text in result.values()))
  self.assertIn('Endereço sintético de teste',result['terms_of_use'])
  self.assertIn('backups',result['privacy_policy'])
  self.assertNotIn('Versão 1',result['privacy_policy'])

if __name__=='__main__':unittest.main()
