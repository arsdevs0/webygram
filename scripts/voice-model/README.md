LLVC browser model reproduction (optional development tools)

The app runs entirely in the browser and does not require Python, PyTorch or a GPU.
These tools reproduce the bundled optimized FP32 model; they are never loaded by the app.

1. Install Python 3.11, torch, numpy, onnx and onnxruntime in a separate virtual environment.
2. From this directory, clone https://github.com/KoeAI/LLVC into LLVC and check out
   1627c5d358cf9bb2b92b0ccc513d8b36807c923d.
3. Run python download-llvc.py (pins the MIT model checkpoint revision).
4. Run python export-llvc.py 4. This exports 832-sample chunks at 16 kHz and compares
   40 streaming steps against the original PyTorch network. The export fails if
   output SNR is below 40 dB. The bundled export measured about 109.8 dB.
5. Copy llvc-stream.onnx to public/voice/llvc-v1.onnx and llvc-stream.json to
   public/voice/llvc-v1.json; add the model's SHA-256 digest as sha256 in that manifest.
   New releases should use a new filename/cache version rather than replacing v1.

Original model: https://huggingface.co/KoeAI/llvc
Checkpoint revision: ebfe8c0fdeb974a7eeb463b3abbc8ce42a0e3851
Code/model license: MIT (copyright 2023 Koe AI); retain licenses/LLVC-MIT.txt.
Context writes are expressed as concatenation instead of ScatterND. Model weights
and mathematical inference behavior remain the same. INT8 was evaluated but is
not shipped because that trial substantially reduced audio quality.
