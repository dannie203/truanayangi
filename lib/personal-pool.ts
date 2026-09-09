import { foods, type Food } from './foods';
import { createFoodSelector, priceRarity } from './case-mechanics';
export type CustomFood = { id: string; name: string; price: number; veg: boolean };
export type PoolProfile = { disabled: number[]; custom: CustomFood[]; revision: number };
export const emptyProfile = (): PoolProfile => ({ disabled: [], custom: [], revision: 0 });
const ids = new Set(foods.map(f => f.image));
export function validateProfile(input: unknown): PoolProfile {
 if (!input || typeof input !== 'object') throw new Error('Invalid profile');
 const p = input as Record<string, unknown>;
 if (Object.keys(p).some(k => !['disabled','custom','revision'].includes(k)) || !Array.isArray(p.disabled) || !Array.isArray(p.custom) || !Number.isSafeInteger(p.revision) || (p.revision as number)<0) throw new Error('Invalid profile');
 if (p.disabled.length>foods.length || p.custom.length>50 || new Set(p.disabled).size!==p.disabled.length || p.disabled.some(id=>!ids.has(id))) throw new Error('Invalid dishes');
 const custom = p.custom.map((item: unknown): CustomFood => {
  if (!item || typeof item!=='object') throw new Error('Invalid dish');
  const f=item as Record<string,unknown>;
  if(Object.keys(f).some(k=>!['id','name','price','veg'].includes(k)) || typeof f.id!=='string' || !/^[0-9a-f-]{36}$/i.test(f.id) || typeof f.name!=='string' || !f.name.trim() || f.name.length>60 || /[\x00-\x1f\x7f]/.test(f.name) || !Number.isInteger(f.price) || (f.price as number)<10 || (f.price as number)>500 || typeof f.veg!=='boolean') throw new Error('Invalid dish');
  return {id:f.id,name:f.name.trim().normalize('NFC'),price:f.price as number,veg:f.veg};
 });
 if(new Set(custom.map(f=>f.id)).size!==custom.length || foods.length-p.disabled.length+custom.length<1) throw new Error('Keep at least one dish');
 return {disabled:p.disabled as number[],custom,revision:p.revision as number};
}
export function personalFoods(profile: PoolProfile): Food[] {
 return [...foods.filter(f=>!profile.disabled.includes(f.image)), ...profile.custom.map(f=>({...f,customId:f.id,image:-1,sub:'Món của tôi',quip:'',rarity:priceRarity(f.price)}))];
}
export function personalSelector(population: Food[], target: number) {
 if(!population.length) return null;
 const feasible=Math.max(Math.min(...population.map(f=>f.price)),Math.min(target,Math.max(...population.map(f=>f.price))));
 return createFoodSelector(population,feasible);
}
export function encodePoolShare(profile: PoolProfile): string {
 const payload = { d: profile.disabled, c: profile.custom.map(x => [x.name, x.price, x.veg ? 1 : 0]) };
 const str = JSON.stringify(payload);
 if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf-8').toString('base64url');
 const b64 = btoa(unescape(encodeURIComponent(str)));
 return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePoolShare(hashOrRaw: string): PoolProfile | null {
 try {
  const clean = hashOrRaw.replace(/^#?pool=/, '').trim();
  if (!clean) return null;
  let jsonStr = '';
  if (typeof Buffer !== 'undefined') {
   jsonStr = Buffer.from(clean, 'base64url').toString('utf-8');
  } else {
   const pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
   const b64 = (clean + pad).replace(/-/g, '+').replace(/_/g, '/');
   jsonStr = decodeURIComponent(escape(atob(b64)));
  }
  const p = JSON.parse(jsonStr);
  if (!p || typeof p !== 'object' || !Array.isArray(p.d) || !Array.isArray(p.c)) return null;
  const custom: CustomFood[] = p.c.map((item: unknown) => {
   if (!Array.isArray(item) || typeof item[0] !== 'string' || typeof item[1] !== 'number') throw new Error('bad');
   return { id: crypto.randomUUID(), name: item[0], price: item[1], veg: Boolean(item[2]) };
  });
  return validateProfile({ disabled: p.d, custom, revision: 0 });
 } catch {
  return null;
 }
}
