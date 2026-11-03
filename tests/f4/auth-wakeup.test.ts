import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForAuthService} from '../../apps/web/lib/api.js';

test('auth wakeup accepts anonymous readiness and never sends credentials or a POST',async()=>{
  const original=globalThis.fetch;
  const requests:RequestInit[]=[];
  globalThis.fetch=async (_url,init)=>{requests.push(init!);return new Response('{}',{status:401});};
  try { await waitForAuthService();assert.equal(requests.length,1);assert.equal(requests[0].method,undefined);assert.equal(requests[0].body,undefined);assert.equal(requests[0].cache,'no-store'); }
  finally {globalThis.fetch=original;}
});
test('auth wakeup stops on configuration errors without submitting authentication',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('{}',{status:404});};
  try {await assert.rejects(waitForAuthService(),/request was not submitted/);assert.equal(calls,1);}
  finally {globalThis.fetch=original;}
});
