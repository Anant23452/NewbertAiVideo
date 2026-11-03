import test from 'node:test';
import assert from 'node:assert/strict';
import {readApiConfig} from '../../apps/api/src/config.js';
test('hosted API binds the platform port on all interfaces; local defaults remain loopback',()=>{
 assert.deepEqual(readApiConfig({NODE_ENV:'production',PORT:'10000'}),{host:'0.0.0.0',port:10000});
 assert.deepEqual(readApiConfig({}),{host:'127.0.0.1',port:3100});
 assert.equal(readApiConfig({PORT:'10000',API_PORT:'3101'}).port,3101);
 assert.throws(()=>readApiConfig({PORT:'invalid'}),/API_PORT/);
});
