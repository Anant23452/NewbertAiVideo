// Design-document generator only. Does not start or modify application services.
import { writeFile } from 'node:fs/promises';
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const str = (maxLength = 1000) => ({ type: 'string', maxLength });
const en = (...values) => ({ type: 'string', enum: values });
const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date-time' };
const int = (minimum = 0) => ({ type: 'integer', minimum });
const arr = (items, maxItems = 100) => ({ type: 'array', items, maxItems });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const jsonObject = { type: 'object', additionalProperties: true, description: 'Schema-versioned validated metadata; arbitrary executable code is prohibited.' };
const hash = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const schemas = {};
schemas.Problem = obj({ type: { type: 'string', format: 'uri-reference' }, title: str(), status: { type: 'integer', minimum: 400, maximum: 599 }, code: str(80), detail: str(), requestId: uuid, fieldErrors: arr(obj({ field: str(200), code: str(80) })) }, ['type','title','status','code','detail','requestId']);
schemas.Workspace = obj({ id: uuid, revision: int(1), timezone: str(80), createdAt: date });
schemas.Me = obj({ user: obj({ id: uuid, status: en('active','disabled','deletion_pending') }), workspace: ref('Workspace'), csrfToken: str(256) });
schemas.WorkspacePatch = obj({ timezone: str(80) });
schemas.Brief = obj({ topic: { ...str(1000), minLength: 5 }, language: en('Hindi','Hinglish'), audience: en('school','college','curious'), mode: en('guided','automatic'), targetSeconds: { type: 'integer', minimum: 5, maximum: 600 } }, ['topic','language','audience','mode']);
schemas.VoiceSelection = obj({ catalogVoiceId: str(200), providerConnectionId: nullable(uuid) });
schemas.Voice = obj({ catalogVoiceId: str(200), name: str(160), provider: str(80), languages: arr(str(40),30), available: { type: 'boolean' }, commercialUse: en('permitted','not_permitted','unknown'), attributionRequired: { type: 'boolean' }, termsUrl: { type:'string',format:'uri' } });
schemas.Capabilities = obj({ languages: arr(en('Hindi','Hinglish'),2), components: arr(str(60),20), maxAudioSeconds: int(1), generationEnabled: { type: 'boolean' }, publishingEnabled: { type: 'boolean' }, allowanceTimezone: { const: 'UTC' }, rendererSchemaVersion: int(1) });
schemas.Span = obj({ start: int(), end: int(1) });
schemas.TextMapping = obj({ displaySpan: ref('Span'), spokenSpan: ref('Span') });
schemas.SceneObject = obj({ id: uuid, type: en('text','shape','icon','node','edge','data_series'), label: str(300), parameters: jsonObject }, ['id','type','parameters']);
schemas.SceneCue = obj({ id: uuid, objectId: uuid, spokenSpan: ref('Span'), event: en('enter','highlight','connect','exit'), leadMs: { type:'integer',minimum:-1000,maximum:1000 } });
schemas.Scene = obj({ id: uuid, purpose: str(300), component: en('typography','diagram','flow','timeline','comparison','relationship','chart','steps'), title: str(120), displayNarration: str(2000), spokenNarration: str(2000), textMappings: arr(ref('TextMapping'),500), objects: arr(ref('SceneObject'),40), cues: arr(ref('SceneCue'),80), claimIds: arr(uuid,50), illustrative: { type:'boolean' } }, ['id','purpose','component','title','displayNarration','spokenNarration','textMappings','objects','cues','claimIds']);
schemas.Style = obj({ preset: en('standard','black_glow'), accentColor: {type:'string',pattern:'^#[0-9a-fA-F]{6}$'} }, ['preset']);
schemas.DraftContent = obj({ schemaVersion: { const: 1 }, brief: ref('Brief'), voice: nullable(ref('VoiceSelection')), style: ref('Style'), scenes: arr(ref('Scene'),12), pronunciationOverrides: arr(obj({ displayText: str(200), spokenText: str(200) }),100), captionOverrides: arr(obj({ sceneId: uuid, spokenSpan: ref('Span'), displayText: str(200) }),200) });
schemas.Draft = obj({ projectId: uuid, revision: int(1), content: ref('DraftContent'), updatedAt: date });
schemas.DraftPatch = obj({ content: ref('DraftContent') });
schemas.ProjectCreate = obj({ title: {...str(160),minLength:1}, brief: ref('Brief'), voice: nullable(ref('VoiceSelection')), style: ref('Style') }, ['title','brief']);
schemas.ProjectPatch = obj({ title: {...str(160),minLength:1}, status: en('active','archived') }, []);
schemas.ProjectPatch.minProperties = 1;
schemas.Project = obj({ id: uuid, title: str(160), status: en('active','archived'), revision: int(1), latestOutputArtifactId: nullable(uuid), createdAt: date, updatedAt: date });
schemas.Version = obj({ id: uuid, projectId: uuid, number: int(1), sourceDraftRevision: int(1), inputHash: hash, content: ref('DraftContent'), approvedAt: nullable(date), createdAt: date, artifactIds: arr(uuid,200) });
schemas.Message = obj({ id: uuid, projectId: uuid, role: en('user','assistant'), content: str(12000), createdAt: date });
schemas.MessageCreate = obj({ content: {...str(4000),minLength:1} });
schemas.IdeationAccepted = obj({ message: ref('Message'), job: ref('Job') });
schemas.JobCreate = obj({ kind: en('plan','produce'), scriptApproved: {type:'boolean'}, acknowledgedUsageTerms: {type:'boolean'} }, ['kind','acknowledgedUsageTerms']);
schemas.JobCreate.description = 'Freezes the draft matched by If-Match. Guided produce requires scriptApproved=true, valid scenes/evidence and a selected eligible voice. Automatic produce does not require script approval. Consent binds the returned version and selected provider terms; it is not permission for unbounded paid usage.';
schemas.Job = obj({ id: uuid, revision: int(1), projectId: uuid, versionId: uuid, kind: en('ideation','plan','produce'), state: en('queued','running','paused','succeeded','failed','cancelled'), stage: nullable(en('ideating','researching','scripting','planning_scenes','generating_voice','aligning','composing','rendering','checking')), queueStatus: en('waiting','processing','attention','complete'), pauseReason: nullable(str(100)), error: nullable(obj({ code: str(80), detail: str(), retryable: { type:'boolean' } })), outputArtifactId: nullable(uuid), cancelRequestedAt: nullable(date), pollAfterSeconds: {type:'integer',minimum:1,maximum:60}, createdAt: date });
schemas.RetryJob = obj({ allowNewProviderRequest: {type:'boolean'} });
schemas.ApplyResult = obj({ artifactId: uuid });
schemas.Artifact = obj({ id: uuid, projectId: uuid, versionId: uuid, jobId: uuid, kind: en('research','storyboard','audio','alignment','composition','captions','video','validation','visual_asset'), sha256: hash, mimeType: str(120), bytes: int(), durationMs: nullable(int(1)), validationStatus: en('pending','passed','failed'), storageStatus: en('available','deleting','deleted'), createdAt: date });
schemas.AccessRequest = obj({ purpose: en('preview','download') });
schemas.MediaAccess = obj({ url: {type:'string',format:'uri'}, expiresAt: date, mimeType: str(120) });
schemas.Evidence = obj({ versionId: uuid, sources: arr(obj({ id: uuid, title: str(), url: {type:'string',format:'uri'}, retrievedAt: date }),100), claims: arr(obj({ id: uuid, sceneId: nullable(uuid), text: str(2000), classification: en('factual','interpretation','illustrative'), status: en('supported','needs_review','unsupported'), blocking: {type:'boolean'}, sourceIds: arr(uuid,30) }),200) });
schemas.UsageResource = obj({ resource: en('generation_count','narration_ms','render_ms','storage_bytes','provider_credits'), limit: int(), used: int(), reserved: int(), remaining: int(), periodStart: date, resetsAt: nullable(date) });
schemas.Usage = obj({ allowanceTimezone: {const:'UTC'}, resources: arr(ref('UsageResource'),20), platformCapacity: en('available','queued','paused') });
schemas.UsageEntry = obj({ id: uuid, jobId: uuid, resource: str(80), unitsDelta: {type:'integer'}, providerUnits: nullable(int()), providerUnit: nullable(str(80)), reasonCode: str(80), createdAt: date });
schemas.ProviderCreate = obj({ provider: {const:'elevenlabs'}, apiKey: {...str(512),minLength:10,writeOnly:true} });
schemas.ProviderConnection = obj({ id: uuid, provider: {const:'elevenlabs'}, status: en('pending_validation','active','invalid','revoked'), revision: int(1), lastCheckedAt: nullable(date), errorCode: nullable(str(80)), createdAt: date });
schemas.InstagramConnection = obj({ id: uuid, revision: int(1), displayName: str(160), status: en('active','reauth_required','disconnected'), grantedScopes: arr(str(120),30), expiresAt: nullable(date) });
schemas.InstagramConnectionResult = obj({ connection: nullable(ref('InstagramConnection')) });
schemas.AuthorizationRequest = obj({ returnPath: en('/settings/connections') });
schemas.Authorization = obj({ authorizationUrl: {type:'string',format:'uri'}, expiresAt: date });
schemas.Delivery = { oneOf: [obj({ mode: {const:'immediate'} }), obj({ mode: {const:'when_ready'} }), obj({ mode: {const:'scheduled'}, scheduledAt: date, timezone: str(80), lateToleranceSeconds: {type:'integer',minimum:0,maximum:86400} })] };
schemas.PublishSource = { oneOf: [obj({ artifactId: uuid }), obj({ productionJobId: uuid })] };
schemas.PublishCreate = obj({ connectionId: uuid, source: ref('PublishSource'), caption: str(2200), delivery: ref('Delivery'), authorizePublishing: {const:true} });
schemas.PublishCreate.description = 'Authorizes only this exact asset/job and current connection grant. Immediate needs a ready video; when_ready needs an automatic produce job. Scheduled can reference either, subject to its bounded lateness policy. Another deliberate submission can create another post; HTTP retries must reuse their idempotency key.';
schemas.SchedulePatch = obj({ scheduledAt: date, timezone: str(80), lateToleranceSeconds: {type:'integer',minimum:0,maximum:86400} });
schemas.Schedule = obj({ scheduledAt: date, timezone: str(80), lateToleranceSeconds: int(), state: en('scheduled','claimed','completed','paused','cancelled') });
schemas.PublishIntent = obj({ id: uuid, revision: int(1), projectId: uuid, versionId: uuid, connectionId: uuid, videoArtifactId: nullable(uuid), productionJobId: nullable(uuid), caption: str(2200), state: en('awaiting_output','scheduled','queued','publishing','paused','published','failed','cancelled','reconciliation_required'), authorizedAt: date, schedule: nullable(ref('Schedule')), remoteMediaId: nullable(str(200)), permalink: nullable({type:'string',format:'uri'}), pauseReason: nullable(str(100)), cancelRequestedAt: nullable(date), createdAt: date });
schemas.PublishRetry = obj({ confirmSamePayload: {const:true} });
for (const name of ['Project','Version','Message','Job','Voice','UsageEntry','ProviderConnection','PublishIntent']) schemas[`${name}Page`] = obj({ items: arr(ref(name),100), nextCursor: nullable(str(2048)) });

const headers = {
  ETag: {description:'Strong revision tag for subsequent If-Match.',schema:str(200)},
  Location: {description:'Relative URL of the durable created/accepted resource.',schema:str(1000)},
  'X-Request-Id': {description:'Correlation ID.',schema:uuid},
  'Idempotency-Replayed': {description:'True when returning a committed replay.',schema:{type:'boolean'}},
  'Cache-Control': {description:'Private user data and signed media URLs use no-store.',schema:str(100)}
};
const response = (description, schema) => ({description,headers,...(schema?{content:{'application/json':{schema}}}:{})});
const problem = description => ({ description, headers: {'X-Request-Id':headers['X-Request-Id'],'Retry-After':{description:'Seconds before retry for throttling or temporary capacity errors.',schema:int(1)}}, content:{'application/problem+json':{schema:ref('Problem')}} });
const errorDescriptions = [['400','Malformed input/cursor'],['401','Authentication required'],['403','CSRF failure or disabled account'],['404','Missing or inaccessible resource'],['409','Conflicting state, operation key, active job or uncertain provider outcome'],['412','Stale If-Match revision'],['422','Invalid domain input or provider/voice eligibility'],['428','If-Match required'],['429','Allowance exhausted or rate-limited'],['503','Platform capacity gate']];
const reusableResponses = Object.fromEntries(errorDescriptions.map(([code,d])=>[`Error${code}`,problem(d)]));
const errors = Object.fromEntries(errorDescriptions.map(([code])=>[code,{$ref:`#/components/responses/Error${code}`} ]));
const parameters = {
  IdempotencyKey:{name:'Idempotency-Key',in:'header',required:true,schema:{...uuid,maxLength:128},description:'Replay-safe command identifier. Reuse the same key, body and original precondition when retrying the same operation.'},
  IfMatch:{name:'If-Match',in:'header',required:true,schema:str(200),description:'Strong ETag of the target resource. For create-job/message/apply-result this is the project draft ETag.'},
  CsrfToken:{name:'X-CSRF-Token',in:'header',required:true,schema:str(256),description:'Session-bound CSRF token from /me; server also validates Origin.'},
  Limit:{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:20}},
  Cursor:{name:'cursor',in:'query',schema:str(2048)}
};
const pr = n=>({$ref:`#/components/parameters/${n}`});
const paths={};
function add(method,path,id,summary,output,options={}) {
  const params=[...path.matchAll(/\{(\w+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:uuid}));
  if(options.page)params.push(pr('Limit'),pr('Cursor'));
  if(method!=='get')params.push(pr('CsrfToken'));
  if(method==='post')params.push(pr('IdempotencyKey'));
  if(options.match)params.push(pr('IfMatch'));
  params.push(...(options.parameters||[]));
  const status=options.status||200;
  const operation={operationId:id,summary,tags:[options.tag||'Creation'],parameters:params,responses:{[status]:response(summary,output?ref(output):null),...errors}};
  if(options.description)operation.description=options.description;
  if(options.body)operation.requestBody={required:true,content:{'application/json':{schema:ref(options.body)}}};
  if(options.security)operation.security=options.security;
  (paths[path]||={})[method]=operation;
}
add('get','/me','getMe','Read identity, private workspace and CSRF token','Me',{tag:'Identity'});
add('get','/workspace','getWorkspace','Read current workspace','Workspace',{tag:'Identity'});
add('patch','/workspace','updateWorkspace','Update display timezone','Workspace',{body:'WorkspacePatch',match:true,tag:'Identity'});
add('get','/capabilities','getCapabilities','Read supported options and configured pilot limits','Capabilities',{tag:'Catalog'});
add('get','/voices','listVoices','List eligible catalog voices','VoicePage',{page:true,tag:'Catalog',parameters:[{name:'providerConnectionId',in:'query',schema:uuid},{name:'language',in:'query',schema:en('Hindi','Hinglish')}],description:'Without providerConnectionId use the platform voice provider. Do not silently fall back if a personal connection is unavailable.'});
add('get','/projects','listProjects','List private projects','ProjectPage',{page:true,parameters:[{name:'status',in:'query',schema:en('active','archived')}]});
add('post','/projects','createProject','Create project and initial draft','Project',{body:'ProjectCreate',status:201});
add('get','/projects/{projectId}','getProject','Read project metadata','Project');
add('patch','/projects/{projectId}','updateProject','Rename or archive project','Project',{body:'ProjectPatch',match:true,description:'Archive does not silently cancel jobs or schedules. Retention/deletion is a separate workflow.'});
add('get','/projects/{projectId}/draft','getDraft','Read editable draft and ETag','Draft');
add('patch','/projects/{projectId}/draft','updateDraft','Replace validated draft content atomically','Draft',{body:'DraftPatch',match:true});
add('post','/projects/{projectId}/draft/apply-result','applyPlan','Import a validated planning artifact into the current draft','Draft',{body:'ApplyResult',match:true,description:'Artifact must be a completed, validated storyboard for this project. Import changes the draft revision; it does not mutate its source version. Preserve sources and stable claim references in the next version.'});
add('get','/projects/{projectId}/messages','listMessages','Read idea discussion','MessagePage',{page:true,tag:'Ideation'});
add('post','/projects/{projectId}/messages','discussIdea','Save message and queue an ideation response','IdeationAccepted',{body:'MessageCreate',match:true,status:202,tag:'Ideation',description:'Atomically save user message, freeze matching draft and bounded conversation context, reserve planning allowance, create ideation job and outbox. Accepted Location points to the job. Worker appends assistant response; it never edits the draft silently.'});
add('get','/projects/{projectId}/versions','listVersions','Read immutable version history','VersionPage',{page:true});
add('get','/versions/{versionId}','getVersion','Read submitted input and immutable artifact references','Version');
add('get','/versions/{versionId}/evidence','getEvidence','Read claim support and review flags','Evidence');
add('post','/projects/{projectId}/jobs','createJob','Freeze matching draft, reserve allowance and queue generation','Job',{body:'JobCreate',match:true,status:202,tag:'Generation'});
add('get','/jobs','listJobs','Read job history','JobPage',{page:true,tag:'Generation',parameters:[{name:'projectId',in:'query',schema:uuid},{name:'state',in:'query',schema:en('queued','running','paused','succeeded','failed','cancelled')}]});
add('get','/jobs/{jobId}','getJob','Read progress, outcome and job ETag','Job',{tag:'Generation'});
add('post','/jobs/{jobId}/cancel','cancelJob','Request cooperative cancellation','Job',{match:true,status:202,tag:'Generation'});
add('post','/jobs/{jobId}/resume','resumeJob','Resume an eligible paused job without changing input','Job',{match:true,status:202,tag:'Generation'});
add('post','/jobs/{jobId}/retry','retryJob','Create a retry job on the original immutable version','Job',{body:'RetryJob',match:true,status:202,tag:'Generation',description:'Only terminal failed jobs. Unknown prior chargeable outcomes block retry even if allowNewProviderRequest=true. Reuse validated matching artifacts and reserve only remaining work.'});
add('get','/artifacts/{artifactId}','getArtifact','Read private media metadata','Artifact',{tag:'Media'});
add('post','/artifacts/{artifactId}/access','accessArtifact','Issue a short-lived authorized preview/download URL','MediaAccess',{body:'AccessRequest',tag:'Media',description:'Only available validated media is downloadable. No storage key or arbitrary object path is accepted. URL expires; a replay may yield an expired URL, so obtain a new key for a deliberate refresh. Cache-Control: no-store.'});
add('get','/usage','getUsage','Read platform allowance and reservation totals','Usage',{tag:'Usage'});
add('get','/usage/entries','listUsageEntries','Read incurred usage and adjustments','UsageEntryPage',{page:true,tag:'Usage'});
add('get','/provider-connections','listProviderConnections','Read masked personal-provider connection metadata','ProviderConnectionPage',{page:true,tag:'Connections'});
add('post','/provider-connections','createProviderConnection','Store a personal secret and queue validation','ProviderConnection',{body:'ProviderCreate',status:201,tag:'Connections',description:'Never echo apiKey. Starts pending_validation. Reject a second current connection; revoke old one explicitly. Idempotency stores keyed request digest only, never body/key. Secret material is handled by secret-store adapter.'});
add('delete','/provider-connections/{connectionId}','revokeProviderConnection','Revoke personal-provider access','',{match:true,status:204,tag:'Connections',description:'Revocation is idempotent for the same owned connection. Pause dependent pending work; do not silently substitute an operator key or different voice.'});
add('get','/instagram/connection','getInstagramConnection','Read current Instagram connection','InstagramConnectionResult',{tag:'Publishing'});
add('post','/instagram/authorization','authorizeInstagram','Create a short-lived session-bound OAuth authorization','Authorization',{body:'AuthorizationRequest',status:201,tag:'Publishing',description:'Return path is allowlisted. State is random, single use and stored hashed. Existing active destination must be explicitly disconnected before replacement.'});
paths['/instagram/callback']={get:{operationId:'instagramCallback',summary:'Consume official OAuth callback',tags:['Publishing'],description:'Adapter-specific redirect endpoint. Requires initiating session, single-use state and exact configured callback URI. No Idempotency-Key/CSRF header. Store token through secret adapter, reject remote-account ownership conflicts, redirect only to stored allowlisted path; never put tokens/errors in redirect query.',parameters:[{name:'state',in:'query',required:true,schema:str(512)},{name:'code',in:'query',schema:str(4096)},{name:'error',in:'query',schema:str(200)}],responses:{303:{description:'Redirect to saved local connection-settings route',headers:{Location:{schema:str(200)}}},...errors}}};
add('delete','/instagram/connection','disconnectInstagram','Disconnect current grant and pause pending deliveries','',{match:true,status:204,tag:'Publishing'});
add('get','/publish-intents','listPublishIntents','Read delivery history and schedules','PublishIntentPage',{page:true,tag:'Publishing'});
add('post','/publish-intents','createPublishIntent','Freeze explicit publication authorization and queue delivery','PublishIntent',{body:'PublishCreate',status:202,tag:'Publishing'});
add('get','/publish-intents/{intentId}','getPublishIntent','Read exact payload, schedule, remote outcome and ETag','PublishIntent',{tag:'Publishing'});
add('patch','/publish-intents/{intentId}/schedule','rescheduleIntent','Change only delivery time before dispatch','PublishIntent',{body:'SchedulePatch',match:true,tag:'Publishing'});
add('post','/publish-intents/{intentId}/cancel','cancelPublishIntent','Request cancellation subject to remote submission race','PublishIntent',{match:true,status:202,tag:'Publishing'});
add('post','/publish-intents/{intentId}/retry','retryPublishIntent','Retry a confirmed-safe failure with unchanged authorization','PublishIntent',{body:'PublishRetry',match:true,status:202,tag:'Publishing',description:'Only confirmed nonpublication, still-valid grant and frozen payload. Reconciliation_required returns 409; reconnect requires a new explicit authorization/intent.'});

const spec={openapi:'3.1.1',info:{title:'Newbert AI Video — V1 proposed API',version:'1.0.0-draft',description:'DESIGN CONTRACT ONLY. No production endpoints are implemented by this specification. Read ../API-DB-DESIGN-V1.md for transaction/state/security invariants. Auth adapter routes and operator-only APIs are intentionally separate.'},servers:[{url:'/api/v1'}],security:[{SessionCookie:[]}],tags:['Identity','Catalog','Ideation','Creation','Generation','Media','Usage','Connections','Publishing'].map(name=>({name})),paths,components:{securitySchemes:{SessionCookie:{type:'apiKey',in:'cookie',name:'newbert_session',description:'Proposed production adapter session; HttpOnly/Secure/SameSite=Lax. Cookie name is finalized with the auth adapter.'}},responses:reusableResponses,parameters,schemas}};
await writeFile(new URL('./openapi-v1.json',import.meta.url),JSON.stringify(spec,null,2)+'\n');
console.log(`Wrote ${Object.keys(paths).length} paths, ${Object.values(paths).reduce((n,p)=>n+Object.keys(p).length,0)} operations, ${Object.keys(schemas).length} schemas.`);
