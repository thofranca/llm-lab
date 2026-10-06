"""Diagnóstico local; não baixa nem carrega modelos."""
import platform
import sys
import torch
import transformers
print('Python:', sys.version.split()[0])
print('Sistema:', platform.platform())
print('PyTorch:', torch.__version__)
print('Transformers:', transformers.__version__)
print('CUDA do PyTorch:', torch.version.cuda)
print('GPU acessível:', torch.cuda.is_available())
if torch.cuda.is_available():
    props = torch.cuda.get_device_properties(0)
    free, total = torch.cuda.mem_get_info()
    print('GPU:', props.name)
    print('VRAM total / livre (GiB):', round(total/1024**3, 2), '/', round(free/1024**3, 2))
else:
    print('O modo auto usará CPU; a captura será mais lenta.')
