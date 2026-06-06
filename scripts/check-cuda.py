import sys

import torch

cuda_available = torch.cuda.is_available()

print(f"torch_version={torch.__version__}")
print(f"cuda_available={cuda_available}")
print(f"torch_cuda_version={torch.version.cuda}")
print(f"device_count={torch.cuda.device_count()}")
if cuda_available:
    print(f"device_name={torch.cuda.get_device_name(0)}")

raise SystemExit(0 if cuda_available else 1)
