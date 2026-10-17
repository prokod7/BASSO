// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let audio: { paused:boolean; ended:boolean; currentTime:number; preload:string; play:ReturnType<typeof vi.fn> };
let constructor:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 vi.resetModules();
 audio={paused:true,ended:false,currentTime:0,preload:'',play:vi.fn(async()=>{audio.paused=false;})};
 constructor=vi.fn(function(){return audio;});vi.stubGlobal('Audio',constructor);
});
afterEach(()=>vi.unstubAllGlobals());
describe('campainha compartilhada entre painel e cozinha',()=>{
 it('usa um único reprodutor para chamadas simultâneas e não corta a campainha',async()=>{
  const {playNewOrderSound}=await import('@/lib/order-notification-sound');
  await Promise.all([playNewOrderSound(),playNewOrderSound()]);
  expect(constructor).toHaveBeenCalledOnce();expect(audio.play).toHaveBeenCalledOnce();
  audio.currentTime=1.25;await playNewOrderSound();
  expect(audio.currentTime).toBe(1.25);expect(audio.play).toHaveBeenCalledOnce();
 });
 it('avisa novamente depois que a campainha anterior termina',async()=>{
  const {playNewOrderSound}=await import('@/lib/order-notification-sound');await playNewOrderSound();
  audio.currentTime=4.35;audio.paused=true;audio.ended=true;
  await playNewOrderSound();expect(audio.play).toHaveBeenCalledTimes(2);expect(audio.currentTime).toBe(0);
 });
 it('não bloqueia pedidos por restrição de autoplay e permite tentar após interação',async()=>{
  const {playNewOrderSound}=await import('@/lib/order-notification-sound');
  audio.play.mockRejectedValueOnce(new DOMException('Autoplay bloqueado','NotAllowedError'));
  await expect(playNewOrderSound()).resolves.toBeUndefined();
  await playNewOrderSound();expect(audio.play).toHaveBeenCalledTimes(2);expect(audio.paused).toBe(false);
 });
 it('agrupa solicitações enquanto o navegador ainda está iniciando o áudio',async()=>{
  let started!:()=>void;audio.play.mockImplementationOnce(()=>new Promise<void>(resolve=>{started=resolve;}));
  const {playNewOrderSound}=await import('@/lib/order-notification-sound');
  const first=playNewOrderSound();const second=playNewOrderSound();expect(audio.play).toHaveBeenCalledOnce();
  started();await Promise.all([first,second]);
 });
});
