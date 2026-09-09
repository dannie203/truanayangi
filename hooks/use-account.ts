import { useCallback, useRef, useState } from 'react';
import { emptyProfile, validateProfile, type PoolProfile } from '@/lib/personal-pool';
import config from '@/counter/google-auth-config.json';
import counter from '@/counter/public-config.json';
export const accountApi=counter.apiUrl.replace(/\/spins$/,'');
export const LOCAL_POOL_KEY='truanayangi-local-pool';
export function loadLocalPool(): PoolProfile {
 try{const saved=localStorage.getItem(LOCAL_POOL_KEY);if(saved)return validateProfile(JSON.parse(saved))}catch{}
 return emptyProfile();
}
export function saveLocalPool(profile: PoolProfile){
 try{localStorage.setItem(LOCAL_POOL_KEY,JSON.stringify(profile))}catch{}
}
type GoogleIdentity={initialize:(options:{client_id:string;callback:(response:{credential:string})=>void;nonce:string;auto_select:boolean})=>void;renderButton:(element:HTMLElement,options:Record<string,unknown>)=>void;disableAutoSelect:()=>void};
declare global{interface Window{google?:{accounts:{id:GoogleIdentity}}}}
let scriptPromise:Promise<void>|undefined;
export function loadGoogle(){
 if(window.google)return Promise.resolve();
 if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  const timer=window.setTimeout(()=>{script.remove();scriptPromise=undefined;reject(new Error('Google sign-in unavailable'))},15000);
  script.onload=()=>{clearTimeout(timer);resolve()};script.onerror=()=>{clearTimeout(timer);script.remove();scriptPromise=undefined;reject(new Error('Google sign-in unavailable'))};document.head.appendChild(script);
 });return scriptPromise;
}
export function useAccount(){
 const [user,setUser]=useState<{name:string;sub:string;admin:boolean}|null>(null);
 const [profile,setProfile]=useState<PoolProfile>(()=>{try{return loadLocalPool()}catch{return emptyProfile()}});
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 // Credentials stay in memory; no bearer token is persisted in browser storage.
 const token=useRef(''),generation=useRef(0);
 const request=useCallback(async<T = {profile:PoolProfile;name:string;sub:string;admin:boolean}>(path:string,method='GET',body?:unknown):Promise<T>=>{
  const response=await fetch(accountApi+path,{method,headers:{Authorization:`Bearer ${token.current}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await response.json() as {error?:string};
  if(!response.ok)throw new Error(response.status===401?'Phiên đăng nhập hết hạn / Session expired':data.error||'Request failed');return data as T;
 },[]);
 const signOut=useCallback(()=>{generation.current++;token.current='';setUser(null);setProfile(loadLocalPool());setPending(false);setError('');window.google?.accounts.id.disableAutoSelect()},[]);
 const mountButton=useCallback(async(element:HTMLElement,language:string)=>{
  await loadGoogle();const nonce=crypto.randomUUID();
  window.google!.accounts.id.initialize({client_id:config.clientId,nonce,auto_select:false,callback:async({credential})=>{
   const current=++generation.current;setPending(true);setError('');
   try{
    const claims=JSON.parse(atob(credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if(claims.nonce!==nonce)throw new Error('Invalid login response');
    // Identity and authorization come exclusively from the verified Worker response.
    token.current=credential;const data=await request('/profile');
    if(current!==generation.current)return;
    setUser({name:data.name,sub:data.sub,admin:data.admin});setProfile(data.profile);saveLocalPool(data.profile);
   }catch(e){if(current===generation.current){token.current='';setError(e instanceof Error?e.message:'Sign-in failed')}}finally{if(current===generation.current)setPending(false)}
  }});
  element.replaceChildren();window.google!.accounts.id.renderButton(element,{theme:'outline',size:'large',text:'signin_with',locale:language,width:260});
 },[request]);
 const save=async(next:PoolProfile)=>{saveLocalPool(next);if(!token.current){setProfile(next);return true}setPending(true);setError('');const current=generation.current;try{const data=await request('/profile','PUT',next);if(current===generation.current)setProfile(data.profile);return current===generation.current}catch(e){setError(e instanceof Error?e.message:'Save failed');return false}finally{if(current===generation.current)setPending(false)}};
 const reload=async()=>{if(!token.current){const p=loadLocalPool();setProfile(p);return p}setPending(true);setError('');try{const data=await request('/profile');setProfile(data.profile);saveLocalPool(data.profile);return data.profile as PoolProfile}catch(e){setError(e instanceof Error?e.message:'Load failed');return null}finally{setPending(false)}};
 const remove=async()=>{try{localStorage.removeItem(LOCAL_POOL_KEY)}catch{}if(token.current){setPending(true);setError('');try{await request('/profile','DELETE');signOut();return true}catch(e){setError(e instanceof Error?e.message:'Delete failed');return false}finally{setPending(false)}}else{setProfile(emptyProfile());return true}};
 return {user,profile,setProfile,pending,error,setError,mountButton,save,reload,remove,signOut,request};
}
export type Account=ReturnType<typeof useAccount>;
