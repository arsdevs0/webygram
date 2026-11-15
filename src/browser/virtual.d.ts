declare module 'virtual:telegram-engine' {
  export function startEngine(): Promise<{ fetch(request: Request): Promise<Response> }>;
}
