import test from 'node:test';
import assert from 'node:assert/strict';
import {readAuthConfig} from '../../apps/api/src/modules/identity/config.js';
import {createAuthMailer} from '../../apps/api/src/modules/identity/mail.js';
const base={AUTH_DATABASE_URL:'postgresql://fixture',BETTER_AUTH_SECRET:'x'.repeat(40),AUTH_BASE_URL:'https://frontend.example',APP_ORIGIN:'https://frontend.example',NODE_ENV:'production',AUTH_MAIL_MODE:'brevo',BREVO_API_KEY:'private-fixture',AUTH_MAIL_FROM:'verified@example.test'};
test('HTTPS email requires a server key and verified sender format',()=>{
 assert.equal(readAuthConfig(base)?.mailMode,'brevo');
 for(const overrides of [{BREVO_API_KEY:''},{AUTH_MAIL_FROM:'bad\r\nvalue'},{AUTH_MAIL_FROM:'Newbert <verified@example.test>'}]) assert.throws(()=>readAuthConfig({...base,...overrides}));
});
test('verification and recovery use fixed HTTPS endpoint, private server key and accepted response',async()=>{
 const config=readAuthConfig(base)!;
 for(const kind of ['verification','password_reset'] as const){
  let calls=0;
  const fetcher:typeof fetch=async(url,init)=>{
   calls++;assert.equal(url,'https://api.brevo.com/v3/smtp/email');assert.equal(init?.redirect,'error');
   assert.equal((init?.headers as Record<string,string>)['api-key'],base.BREVO_API_KEY);
   const body=JSON.parse(String(init?.body));assert.equal(body.sender.email,base.AUTH_MAIL_FROM);assert.equal(body.to[0].email,'recipient@example.test');assert.ok(body.textContent.includes('https://frontend.example/verify?token=fixture'));assert.ok(!String(init?.body).includes(base.BREVO_API_KEY));
   return new Response('',{status:201});
  };
  await createAuthMailer(config,fetcher)({kind,to:'recipient@example.test',url:'https://frontend.example/verify?token=fixture'});assert.equal(calls,1);
 }
});
test('email rejection and network ambiguity are redacted and never automatically retried',async()=>{
 const config=readAuthConfig(base)!;
 for(const mode of ['quota','network']){
  let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;if(mode==='network')throw Error(base.BREVO_API_KEY);return new Response(base.BREVO_API_KEY,{status:429})};
  await assert.rejects(createAuthMailer(config,fetcher)({kind:'verification',to:'recipient@example.test',url:'https://frontend.example/verify'}),e=>e instanceof Error&&e.message==='Authentication email delivery unavailable.');assert.equal(calls,1);
 }
});
