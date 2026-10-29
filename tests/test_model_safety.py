import builtins,hashlib,os,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from model_safety import custom_model_guard
class ModelSafetyTests(unittest.TestCase):
    def test_custom_pickle_cannot_execute_and_modified_config_is_rejected(self):
        import torch
        test_root=Path(__file__).resolve().parents[1]/'.runtime'/'test-workspaces'
        test_root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=test_root) as temporary:
            root=Path(temporary);marker=root/'executed.txt'
            class Payload:
                def __reduce__(self):return builtins.eval,(f"__import__('pathlib').Path({str(marker)!r}).write_text('bad')",)
            file=root/'model.ckpt';torch.save(Payload(),file)
            model={'custom':True,'directory':str(root),'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
            with custom_model_guard(model):
                with self.assertRaises(Exception):torch.load(file,weights_only=False)
            self.assertFalse(marker.exists())
            config=root/'model.yaml';config.write_text('model: {}',encoding='utf-8');model.update(config=config.name,configSha256=hashlib.sha256(config.read_bytes()).hexdigest())
            config.write_text('model: {changed: true}',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'校验'):
                with custom_model_guard(model):pass
