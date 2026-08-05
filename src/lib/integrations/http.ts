export async function jsonRequest<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),init.timeoutMs??15_000);
  try {
    const response=await fetch(url,{...init,signal:controller.signal,headers:{Accept:"application/json","Content-Type":"application/json",...(init.headers||{})}});
    const text=await response.text();
    const body=text?JSON.parse(text):null;
    if(!response.ok)throw new Error(body?.message||body?.error||`HTTP ${response.status}`);
    return body as T;
  } finally { clearTimeout(timer); }
}
