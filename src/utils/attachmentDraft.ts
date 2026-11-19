import type { AttachmentUpload } from '../types/telegram';
export const MAX_ATTACHMENT_BYTES=42*1024*1024;
export function attachmentKind(file:Pick<File,'type'>):'photo'|'video'|'file' {return /image\/(jpeg|png|webp)/.test(file.type)?'photo':file.type.startsWith('video/')?'video':'file';}
export function readAttachment(file:Blob):Promise<string> {return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>typeof r.result==='string'?resolve(r.result):reject(new Error('Could not read file'));r.onerror=()=>reject(new Error('Could not read selected file'));r.readAsDataURL(file);});}
export async function prepareAttachment(file:File,options:{asFile:boolean;quality:'standard'|'hd'|'original';rotation:number;crop:'original'|'square'|'portrait';spoiler:boolean;ttlSeconds:number;silent:boolean}):Promise<AttachmentUpload> {
 if(!file.size)throw new Error('This file is empty');if(file.size>MAX_ATTACHMENT_BYTES)throw new Error('Maximum upload size is 42 MB');
 const kind=options.asFile?'file':attachmentKind(file);
 let fileDataUrl:string,fileName=file.name,width:number|undefined,height:number|undefined;
 if(kind==='photo' && (options.quality!=='original'||options.rotation||options.crop!=='original')) {
   const url=URL.createObjectURL(file);const image=new Image();
   try {
     await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('This image format could not be opened. Send it as a file.'));image.src=url;});
     const rotated=document.createElement('canvas'),turn=options.rotation%180!==0;
     rotated.width=turn?image.naturalHeight:image.naturalWidth;rotated.height=turn?image.naturalWidth:image.naturalHeight;
     const context=rotated.getContext('2d');if(!context)throw new Error('Image editor unavailable');context.translate(rotated.width/2,rotated.height/2);context.rotate(options.rotation*Math.PI/180);context.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);
     const ratio=options.crop==='square'?1:options.crop==='portrait'?3/4:rotated.width/rotated.height;
     const cw=Math.min(rotated.width,rotated.height*ratio),ch=Math.min(rotated.height,rotated.width/ratio),cap=options.quality==='standard'?1280:options.quality==='hd'?2560:8192,scale=Math.min(1,cap/Math.max(cw,ch));
     const canvas=document.createElement('canvas');width=canvas.width=Math.max(1,Math.round(cw*scale));height=canvas.height=Math.max(1,Math.round(ch*scale));
     canvas.getContext('2d')!.drawImage(rotated,(rotated.width-cw)/2,(rotated.height-ch)/2,cw,ch,0,0,width,height);
     fileDataUrl=canvas.toDataURL('image/jpeg',options.quality==='standard'?.86:.95);fileName=file.name.replace(/\.[^.]+$/,'')+'.jpg';
   } finally {URL.revokeObjectURL(url);}
 }else fileDataUrl=await readAttachment(file);
 return {fileDataUrl,fileName,mediaType:kind,width,height,spoiler:kind!=='file'&&options.spoiler,ttlSeconds:kind!=='file'?options.ttlSeconds || undefined:undefined,silent:options.silent};
}
