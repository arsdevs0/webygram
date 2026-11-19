import urllib.request, pathlib, json
folder=pathlib.Path(__file__).resolve().parent
folder.mkdir(parents=True, exist_ok=True)
revision='ebfe8c0fdeb974a7eeb463b3abbc8ce42a0e3851'
metadata=json.load(urllib.request.urlopen('https://huggingface.co/api/models/KoeAI/llvc/revision/'+revision, timeout=20))
(folder/'llvc-model-metadata.json').write_text(json.dumps({'sha':metadata['sha'],'license':metadata.get('cardData',{}).get('license')},indent=2))
target=folder/'llvc-checkpoint.pth'
if not target.exists():
    url='https://huggingface.co/KoeAI/llvc/resolve/'+metadata['sha']+'/models/checkpoints/llvc/G_500000.pth'
    with urllib.request.urlopen(url, timeout=30) as response, target.open('wb') as output:
        size=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            output.write(chunk);size+=len(chunk)
            if size>180*1024*1024:raise RuntimeError('Model exceeds research download limit')
    print('Checkpoint bytes',size,flush=True)
print('Pinned source',metadata['sha'],'license',metadata.get('cardData',{}).get('license'),flush=True)
