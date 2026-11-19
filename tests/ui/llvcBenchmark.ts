import * as ort from 'onnxruntime-web/wasm';
export async function benchmark() {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = '/fixture-ort/';
  const manifest = await fetch('/fixture-llvc.json').then(response => response.json());
  const session = await ort.InferenceSession.create('/fixture-llvc.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const shapes: Record<string, number[]> = manifest.inputShapes;
  const chunk = manifest.chunkSamples;
  let feed: Record<string, ort.Tensor> = {};
  for (const [name, shape] of Object.entries(shapes)) feed[name] = new ort.Tensor('float32', new Float32Array(shape.reduce((a,b) => a*b, 1)), shape);
  const times: number[] = []; let energy = 0;
  for (let step=0;step<45;step++) {
    const input = new Float32Array(shapes.audio[2]);
    for (let n=0;n<input.length;n++) input[n] = .12*Math.sin(2*Math.PI*130*(step*chunk+n)/16000) + .04*Math.sin(2*Math.PI*260*(step*chunk+n)/16000);
    feed.audio = new ort.Tensor('float32',input,shapes.audio);
    const start = performance.now(); const converted = await session.run(feed); times.push(performance.now()-start);
    const samples = converted.converted.data as Float32Array;
    for (const sample of samples) { if (!Number.isFinite(sample)) throw Error('Invalid neural output'); energy += sample*sample; }
    for (const name of Object.keys(feed)) if (name !== 'audio') feed[name].dispose();
    feed.audio.dispose();
    feed = { encoder: converted.next_encoder, decoder: converted.next_decoder, output: converted.next_output, prenet: converted.next_prenet };
    converted.converted.dispose();
  }
  for (const tensor of Object.values(feed)) tensor.dispose();
  await session.release();
  const sorted = times.slice(5).sort((a,b)=>a-b);
  return {p50ms:sorted[Math.floor(sorted.length*.5)],p95ms:sorted[Math.floor(sorted.length*.95)],rms:Math.sqrt(energy/(45*chunk)),chunkMs:chunk/16,times};
}
