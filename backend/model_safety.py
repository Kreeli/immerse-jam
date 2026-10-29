import contextlib,hashlib,os
from pathlib import Path

@contextlib.contextmanager
def custom_model_guard(model):
    if not model.get('custom'):
        yield
        return
    for key,hash_key in [('file','sha256'),('config','configSha256')]:
        if not model.get(key):continue
        expected=model.get(hash_key,'')
        if len(expected)!=64 or any(c not in '0123456789abcdefABCDEF' for c in expected):raise ValueError('自定义模型文件缺少 SHA-256')
        with (Path(model['directory'])/model[key]).open('rb') as source:actual=hashlib.file_digest(source,'sha256').hexdigest()
        if actual!=expected.lower():raise ValueError('自定义模型文件校验失败')
    if model.get('config'):
        import yaml
        class Loader(yaml.SafeLoader):pass
        Loader.add_constructor('tag:yaml.org,2002:python/tuple',lambda loader,node:tuple(loader.construct_sequence(node)))
        yaml.load((Path(model['directory'])/model['config']).read_text(encoding='utf-8'),Loader=Loader)
    previous=os.environ.get('TORCH_FORCE_WEIGHTS_ONLY_LOAD')
    os.environ['TORCH_FORCE_WEIGHTS_ONLY_LOAD']='1'
    try:yield
    finally:
        if previous is None:os.environ.pop('TORCH_FORCE_WEIGHTS_ONLY_LOAD',None)
        else:os.environ['TORCH_FORCE_WEIGHTS_ONLY_LOAD']=previous
