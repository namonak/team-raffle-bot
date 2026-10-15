import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,rmSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudAdapter, getAuthConfigWithDefaults } from '@microsoft/agents-hosting';
import { Store } from '../src/store.js';
import { RaffleService } from '../src/service.js';
import { createApp, createTeamsTransport, dispatchAction } from '../src/index.js';
test('SDK는 폼 시작 후 새 메시지 없이 원래 메시지 ID를 갱신한다',async()=>{
 const store=Store.open(':memory:');const adapter=new CloudAdapter(getAuthConfigWithDefaults({clientId:'app',clientSecret:'secret',tenantId:'tenant'}));
 let sends=0;const ids:string[]=[];
 Object.assign(adapter,{
  createConnectorClientWithIdentity:async()=>({}),createUserTokenClient:async()=>({}),
  sendActivities:async(...[_context,activities]:Parameters<CloudAdapter['sendActivities']>)=>{sends+=activities.length;return activities.map(()=>({id:'form-message'}));},
  updateActivity:async(...[_context,activity]:Parameters<CloudAdapter['updateActivity']>)=>{ids.push(activity.id!);return {id:activity.id};},
 });
 store.activateConversation('chat',{serviceUrl:'https://example.invalid',channelId:'msteams',conversation:{id:'chat',conversationType:'groupChat'},agent:{id:'bot'},user:{id:'owner'}});
 const service=new RaffleService(store,createTeamsTransport(adapter,'app',store));const actor={conversationId:'chat',userId:'owner',messageId:'form-message'};
 try{
 const d=await service.createDraft(actor,'req');assert.equal(sends,1);
 await dispatchAction(service,actor,{verb:'raffleStart',data:{draftId:d.id,title:'판',candidates:'A\nB',count:'1'}});
 assert.equal(ids.length,0);await service.runScheduledTasks();assert.deepEqual(ids,['form-message']);assert.equal(sends,1);
 await assert.rejects(dispatchAction(service,actor,{verb:'unknown',data:{}}));
 await assert.rejects(dispatchAction(service,actor,{verb:'raffleStart',data:{draftId:{}}}));
 }finally{store.close();}
});
test('인증 누락은 시작 거부하고 무인증 요청은 401이다',async()=>{
 assert.throws(()=>createApp({}),/MicrosoftAppId/);
 const dir=mkdtempSync(join(tmpdir(),'raffle-app-'));
 const app=createApp({MicrosoftAppId:'00000000-0000-0000-0000-000000000001',MicrosoftAppPassword:'fake',MicrosoftAppTenantId:'00000000-0000-0000-0000-000000000002',DATABASE_PATH:join(dir,'test.sqlite')});
 const request=async(method:string,url:string)=>{
  let output='';
  const socket=new Duplex({read(){},write(chunk,_encoding,callback){output+=chunk.toString();callback();}});
  const req=new IncomingMessage(socket as Socket);req.method=method;req.url=url;req.headers={host:'localhost'};
  const res=new ServerResponse(req);res.assignSocket(socket as Socket);
  const done=new Promise<void>((resolve,reject)=>{res.on('finish',resolve);res.on('error',reject);});
  app(req,res);await done;return {status:res.statusCode,output};
 };
 try{
  const health=await request('GET','/healthz');assert.equal(health.status,200);assert.match(health.output,/\{"ok":true\}/);
  assert.equal((await request('POST','/api/messages')).status,401);
 }finally{await app.locals.dispose();rmSync(dir,{recursive:true,force:true});}
});
