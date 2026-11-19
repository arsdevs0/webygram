import pathlib, sys, json, math, time, types, copy
import torch
import numpy as np
import onnxruntime as ort

folder = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(folder / 'LLVC'))
source = (folder / 'LLVC/model.py').read_text()
source = source.replace('from speechbrain.lobes.models.transformer.Transformer import PositionalEncoding', '''
class PositionalEncoding(torch.nn.Module):
    def __init__(self, input_size, max_len=2500):
        super().__init__()
        pe = torch.zeros(max_len, input_size)
        position = torch.arange(0, max_len).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, input_size, 2) * -(math.log(10000.0) / input_size))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe.unsqueeze(0))
    def forward(self, x):
        return self.pe[:, :x.shape[1]]
''')
module = types.ModuleType('llvc_export_model')
sys.modules[module.__name__] = module
exec(compile(source, str(folder / 'LLVC/model.py'), 'exec'), module.__dict__)
config = json.loads((folder / 'LLVC/experiments/llvc/config.json').read_text())
net = module.Net(**config['model_params']).eval()
checkpoint = torch.load(folder / 'llvc-checkpoint.pth', map_location='cpu', weights_only=True)
state = checkpoint['model']
missing, extra = net.load_state_dict(state, strict=False)
if any('pos_enc.pe' not in key for key in missing) or extra:
    raise RuntimeError((missing, extra))
torch.set_num_threads(1)
print('Parameters', sum(p.numel() for p in net.parameters()), 'missing', missing, flush=True)

class Streaming(torch.nn.Module):
    def __init__(self, model):
        super().__init__(); self.model = model
    def forward(self, audio, encoder, decoder, output, prenet):
        return self.model(audio, encoder.clone(), decoder.clone(), output.clone(), prenet.clone(), pad=False)

reference_wrapped = Streaming(net).eval()
optimized = copy.deepcopy(net)
# Build context tensors once instead of lowering in-place writes to ScatterND.
# This preserves the network and weights while reducing browser state-copy work.
def encoder_forward(self, x, ctx_buf):
    context = []
    for i in range(self.num_layers):
        start = self.buf_indices[i]; size = self.buf_lengths[i]
        joined = torch.cat((ctx_buf[..., start:start + size], x), dim=-1)
        context.append(joined[..., -size:])
        x = x + self.dcc_layers[i](joined)
    return x, torch.cat(context, dim=-1)
def prenet_forward(self, x, ctx):
    context = []
    for i in range(self.num_layers):
        start = self.buf_indices[i]; size = self.buf_lengths[i]
        joined = torch.cat((ctx[..., :x.shape[-2], start:start + size], x), dim=-1)
        context.append(joined[..., -size:])
        if self.combine_residuals == 'add': x = x + self.down_convs[i](joined)
        elif self.combine_residuals == 'multiply': x = x * self.down_convs[i](joined)
        else: x = self.down_convs[i](joined)
    return x, torch.cat(context, dim=-1)
def decoder_forward(self, tgt, mem, ctx_buf, probe=False):
    # Export input is an exact multiple of the fixed decoder chunk size.
    batch, channels, length = tgt.shape
    tgt = tgt.permute(0, 2, 1); mem = mem.permute(0, 2, 1)
    mem = torch.cat((ctx_buf[:, 0], mem), dim=1)
    context = [mem[:, -self.ctx_len:]]
    mem_ctx = self._causal_unfold(mem)
    if self.use_pos_enc: mem_ctx = mem_ctx + self.pos_enc(mem_ctx)
    for i, layer in enumerate(self.tf_dec_layers):
        tgt = torch.cat((ctx_buf[:, i + 1], tgt), dim=1)
        context.append(tgt[:, -self.ctx_len:])
        tgt_ctx = self._causal_unfold(tgt)
        if self.use_pos_enc and i == 0: tgt_ctx = tgt_ctx + self.pos_enc(tgt_ctx)
        tgt, _, _ = layer(tgt_ctx, mem_ctx, self.chunk_size)
        tgt = tgt.reshape(batch, length, channels)
    return tgt.permute(0, 2, 1), torch.stack(context, dim=1)
optimized.mask_gen.encoder.forward = types.MethodType(encoder_forward, optimized.mask_gen.encoder)
optimized.mask_gen.decoder.forward = types.MethodType(decoder_forward, optimized.mask_gen.decoder)
optimized.convnet_pre.forward = types.MethodType(prenet_forward, optimized.convnet_pre)
wrapped = Streaming(optimized).eval()
encoder, decoder, output = net.init_buffers(1, 'cpu')
prenet = net.convnet_pre.init_ctx_buf(1, 'cpu')
chunk = net.L * net.dec_chunk_size * (int(sys.argv[1]) if len(sys.argv) > 1 else 4)
example = (torch.randn(1, 1, chunk + 2 * net.L) * .05, encoder, decoder, output, prenet)
names = ['audio', 'encoder', 'decoder', 'output', 'prenet']
outnames = ['converted', 'next_encoder', 'next_decoder', 'next_output', 'next_prenet']
target = folder / 'llvc-stream.onnx'
with torch.inference_mode():
    torch.onnx.export(wrapped, example, str(target), input_names=names, output_names=outnames, opset_version=17, dynamo=False)
options = ort.SessionOptions(); options.intra_op_num_threads = 1; options.inter_op_num_threads = 1
session = ort.InferenceSession(str(target), options, providers=['CPUExecutionProvider'])
inputs = {name: value.numpy() for name, value in zip(names, example)}
reference = tuple(value.clone() for value in example)
times = []; differences = []; errors = []; powers = []; state_errors = []
for step in range(40):
    audio = (np.random.default_rng(step).normal(0, .05, (1, 1, chunk + 32))).astype('float32')
    inputs['audio'] = audio; reference = (torch.from_numpy(audio), *reference[1:])
    start = time.perf_counter(); outputs = session.run(None, inputs); times.append((time.perf_counter() - start) * 1000)
    with torch.inference_mode(): expected = reference_wrapped(*reference)
    differences.append(float(np.max(np.abs(expected[0].numpy() - outputs[0]))))
    errors.append(float(np.mean((expected[0].numpy() - outputs[0]) ** 2)))
    powers.append(float(np.mean(expected[0].numpy() ** 2)))
    state_errors.append([float(np.max(np.abs(x.numpy() - y))) for x, y in zip(expected[1:], outputs[1:])])
    inputs = {name: value for name, value in zip(names[1:], outputs[1:])}
    reference = (reference[0], *expected[1:])
manifest = {'sampleRate': 16000, 'chunkSamples': chunk, 'contextSamples': 32, 'inputShapes': {name: list(value.shape) for name, value in zip(names, example)}, 'modelBytes': target.stat().st_size, 'maxError': max(differences), 'snrDb': 10 * math.log10(sum(powers) / max(1e-20, sum(errors))), 'firstMaxError': differences[0], 'stateMaxErrors': np.max(state_errors, axis=0).tolist(), 'p50ms': float(np.median(times[5:])), 'p95ms': float(np.percentile(times[5:], 95)), 'budgetMs': chunk / 16, 'source': json.loads((folder / 'llvc-model-metadata.json').read_text())}
(folder / 'llvc-stream.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest, indent=2), flush=True)
if manifest['snrDb'] < 40: raise RuntimeError('Streaming export differs from PyTorch')
