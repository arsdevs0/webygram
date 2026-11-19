import type {TelegramChat} from '../types/telegram';
export function vaultSources(chats:TelegramChat[],targetId?:string) {return chats.filter(c=>!c.isDeletedChat && c.id!==targetId && (c.type==='group'||c.type==='channel'));}
export function selectedVaultSources(chats:TelegramChat[],mode:'all'|'single'|'multiple',selected:string[],single:string,targetId?:string) {const sources=vaultSources(chats,targetId);return mode==='all'?sources:sources.filter(c=>mode==='single'?c.id===single:selected.includes(c.id));}
