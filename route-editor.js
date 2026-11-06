(() => {
'use strict';
const M=RouteEditorModel,$=id=>document.getElementById(id),key='bus-fictional-route-draft-v1';
let doc=M.blank(),selected=0,placing=false,baseManifest=null,manualManifest=false;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
try {const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.route && Array.isArray(saved.stops)&&saved.stops.length){doc={route:{...doc.route,...saved.route},stops:saved.stops.map(s=>({...M.blankStop(),...s})),_cloud:saved._cloud||null};}}catch{}
function save(){try{localStorage.setItem(key,JSON.stringify(doc));}catch{status('下書きを自動保存できません。CSVで保存してください。',true);}}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
let map=null,markers=null,line=null;
if(window.L){map=L.map('map').setView([43.08,141.35],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);markers=L.layerGroup().addTo(map);line=L.polyline([],{color:'#2563eb',weight:4}).addTo(map);
map.on('click',event=>{if(!placing&&!$('map-add').checked)return;let index=selected;if(!placing){index=doc.stops.findIndex(s=>!s['停留所名']&&!s['緯度']&&!s['経度']);if(index<0){index=doc.stops.length;doc.stops.push(M.blankStop());}}selected=index;doc.stops[index]['緯度']=event.latlng.lat.toFixed(8);doc.stops[index]['経度']=event.latlng.lng.toFixed(8);placing=false;$('place-selected').textContent='次の地図クリックで選択中の停留所を移動';save();render();status((index+1)+'番の位置を設定しました。停留所名と読み仮名を入力してください。');});
}else{$('map').textContent='地図を読み込めません。緯度経度を直接入力して編集できます。';}
function coords(s){const lat=Number(s['緯度']),lon=Number(s['経度']);return s['緯度']!==''&&s['経度']!==''&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null;}
function drawMap(){if(!map)return;markers.clearLayers();const points=[];doc.stops.forEach((s,i)=>{const point=coords(s);if(!point)return;points.push(point);const icon=L.divIcon({className:'',html:'<div class="marker-number '+(i===selected?'selected':'')+'">'+(i+1)+'</div>',iconSize:[32,32],iconAnchor:[16,16]});const marker=L.marker(point,{icon,draggable:true}).addTo(markers);const tooltip=document.createElement('span');tooltip.textContent=(i+1)+'. '+(s['停留所名']||'名称未入力');marker.bindTooltip(tooltip);marker.on('click',()=>{selected=i;render();});marker.on('dragend',()=>{const p=marker.getLatLng();s['緯度']=p.lat.toFixed(8);s['経度']=p.lng.toFixed(8);save();render();});});line.setLatLngs(points);}
function renderList(){const list=$('stop-list');list.replaceChildren();doc.stops.forEach((s,i)=>{const li=document.createElement('li'),button=document.createElement('button'),number=document.createElement('span'),info=document.createElement('span'),title=document.createElement('span'),small=document.createElement('small');button.type='button';button.classList.toggle('active',i===selected);button.setAttribute('aria-current',i===selected?'true':'false');number.className='stop-number';number.textContent=i+1;info.className='stop-info';title.textContent=s['停留所名']||'名称未入力';small.textContent=(s['読み仮名']||'読み仮名なし')+(coords(s)?' ・座標あり':' ・座標なし');info.append(title,small);button.append(number,info);button.onclick=()=>{selected=i;render();};li.append(button);list.append(li);});$('count').textContent=doc.stops.length+'か所';}
function field(container,target,name,label,options={}){const wrap=document.createElement('label');wrap.className='field';const caption=document.createElement('span');caption.textContent=label;let input;if(options.choices){input=document.createElement('select');for(const item of options.choices){const option=document.createElement('option');option.value=item;option.textContent=item||'指定なし（TTS）';input.append(option);}}else{input=document.createElement('input');input.type='text';if(options.numeric)input.inputMode=options.numeric;input.placeholder=options.placeholder||'';}
input.value=target[name]||'';input.dataset.field=name;input.autocomplete='off';input.addEventListener('input',()=>{target[name]=input.value;save();renderList();if(['停留所名','緯度','経度'].includes(name))drawMap();});if(name==='停留所名')input.addEventListener('blur',()=>fillReading(target));wrap.append(caption,input);container.append(wrap);return input;}
let readings={};fetch('tts-readings.json?v=25',{cache:'no-store'}).then(r=>r.ok?r.json():{}).then(values=>{readings=Object.fromEntries(Object.entries(values).map(([k,v])=>[k.replace(/[\s　]/g,''),v]));}).catch(()=>{});
function fillReading(stop){if(stop['読み仮名'])return;const reading=readings[stop['停留所名'].replace(/[\s　]/g,'')];if(reading){stop['読み仮名']=reading;const input=$('stop-fields').querySelector('[data-field="読み仮名"]');if(input)input.value=reading;save();renderList();}}
function renderRoute(){const fields=$('route-fields');fields.replaceChildren();for(const [name,label,placeholder] of [['系統名','系統名','例：架1'],['系統読み','系統の読み（「ばん」は不要）','かくいち'],['事業者名','バス会社名','架空バス'],['事業者読み','会社の読み','かくうばす'],['路線表示','最初のLCD表示（空欄で自動生成）','架1◆始点→終点'],['放送フォルダ','録音フォルダ（空欄でTTS）','sound_file配下のフォルダ名']])field(fields,doc.route,name,label,{placeholder});field(fields,doc.route,'営業所','停車・発車案内の声',{choices:['','石狩営業所','東営業所','北営業所','新川営業所','白石営業所',...(!['','石狩営業所','東営業所','北営業所','新川営業所','白石営業所'].includes(doc.route['営業所'])?[doc.route['営業所']]:[])]});}
function render(){selected=Math.max(0,Math.min(selected,doc.stops.length-1));renderList();drawMap();$('stop-title').textContent=(selected+1)+'番の停留所';const target=doc.stops[selected],fields=$('stop-fields');fields.replaceChildren();for(const [name,label,options] of [['停留所名','停留所名',{placeholder:'例：架空中央駅'}],['読み仮名','読み仮名（ひらがな）',{placeholder:'かくうちゅうおうえき'}],['表示名','LCD表示名（空欄で停留所名）',{}],['英語名','英語名',{placeholder:'Kaku Chuo Sta.'}],['緯度','緯度',{numeric:'decimal'}],['経度','経度',{numeric:'decimal'}],['放送ファイル','この停留所の録音ファイル名',{placeholder:'例：01.wav（空欄でTTS）'}]])field(fields,target,name,label,options);
const fares=$('fares');fares.replaceChildren();for(let n=1;n<=6;n++)field(fares,target,'整理券'+n,n+'番・円',{numeric:'numeric'});const extra=$('extra-fields');extra.replaceChildren();for(const name of ['広告','始発','予備1','予備2','予備3'])field(extra,target,name,name);$('up').disabled=selected===0;$('down').disabled=selected===doc.stops.length-1;$('remove').disabled=doc.stops.length<=1;$('copy-fares').disabled=selected===0;}
$('add').onclick=()=>{doc.stops.push(M.blankStop());selected=doc.stops.length-1;save();render();};
$('duplicate').onclick=()=>{doc.stops.splice(selected+1,0,{...doc.stops[selected]});selected++;save();render();};
$('remove').onclick=()=>{if(doc.stops.length<=1)return;doc.stops.splice(selected,1);save();render();};
function move(delta){const next=selected+delta;if(next<0||next>=doc.stops.length)return;[doc.stops[selected],doc.stops[next]]=[doc.stops[next],doc.stops[selected]];selected=next;save();render();}
$('up').onclick=()=>move(-1);$('down').onclick=()=>move(1);
$('copy-fares').onclick=()=>{if(!selected)return;for(let n=1;n<=6;n++)doc.stops[selected]['整理券'+n]=doc.stops[selected-1]['整理券'+n];save();render();};
$('place-selected').onclick=()=>{placing=true;status('地図をクリックすると、'+(selected+1)+'番の停留所をその位置へ移動します。');$('place-selected').textContent='地図上の移動先をクリックしてください';};
$('fit').onclick=()=>{if(!map)return;const points=doc.stops.map(coords).filter(Boolean);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:15});};
$('export').onclick=()=>{try{download(M.filename(doc),M.csv(doc),'text/csv;charset=utf-8');const missing=doc.stops.filter(s=>!s['読み仮名']).length;status('CSVを保存しました。'+(missing?'読み仮名が空の停留所が'+missing+'か所あります。':''));}catch(error){status(error.message,true);}};
$('import').onclick=()=>$('csv-file').click();$('csv-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{const next=M.fromCsv(await file.text());if(!next.stops.length)throw Error('停留所がありません');doc=next;selected=0;save();renderRoute();render();cloudLabel();$('fit').click();status(file.name+'を開きました。下書きを更新しました。');}catch(error){status('CSVを開けません: '+error.message,true);}event.target.value='';};
$('new').onclick=()=>$('confirm').showModal();$('confirm').addEventListener('close',()=>{if($('confirm').returnValue!=='ok')return;doc=M.blank();selected=0;save();renderRoute();render();cloudLabel();status('新しい架空路線を作成しています。');});
$('manifest').disabled=true;
fetch('routes/index.json?v=25',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('一覧を取得できません');return r.json();}).then(value=>{if(!Array.isArray(value.routes))throw Error('一覧形式が違います');if(!manualManifest){baseManifest=value;$('manifest').disabled=false;}}).catch(()=>{status('公開済みの一覧を取得できませんでした。CSV保存は可能です。一覧JSONは手元のファイルを開いてから保存してください。',true);});
$('import-manifest').onclick=()=>$('manifest-file').click();$('manifest-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{const next=JSON.parse(await file.text());if(!Array.isArray(next.routes)||next.routes.some(e=>typeof e.name!=='string'||typeof e.path!=='string'))throw Error('routes一覧の形式が違います');baseManifest=next;manualManifest=true;$('manifest').disabled=false;status('手元の一覧JSONを読み込みました。');}catch(error){status(error.message,true);}event.target.value='';};
$('manifest').onclick=()=>{const errors=M.errors(doc);if(errors.length)return status(errors.join('\n'),true);if(!baseManifest)return status('先に一覧JSONを読み込んでください。',true);const next=M.manifest(doc,baseManifest);download('index.json',JSON.stringify(next,null,2)+'\n','application/json');baseManifest=next;status('一覧JSONを保存しました。CSVは routes/fictional/'+M.filename(doc)+' に置いてください。');};

let cloudLoggedIn=false,cloudUid='',bundledCustom=[];
function cloudLabel(){const current=doc._cloud;$('cloud-current').textContent=current?'登録済み路線を編集中（保存すると上書き）':'新しい自作路線を編集中';}
function cloudPicker(){
 const select=$('cloud-routes'),previous=select.value;select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='路線を選択';select.append(placeholder);
 for(const record of window.customRoutes?.list()||[]){const option=document.createElement('option');option.value='cloud:'+record.id;option.textContent=record.name;select.append(option);}
 for(const entry of bundledCustom){const option=document.createElement('option');option.value='file:'+entry.path;option.textContent=entry.name+'（GitHubのCSV）';select.append(option);}
 if([...select.options].some(option=>option.value===previous))select.value=previous;
}
async function saveCloud(asNew=false){
 if(!cloudLoggedIn)return status('先にログインしてください',true);
 $('cloud-save').disabled=true;$('cloud-copy').disabled=true;
 try{
  const csv=M.csv(doc),prepared=M.prepared(doc),title=(prepared.route['事業者名']||'架空バス')+' / '+prepared.route['系統名']+'｜'+prepared.stops[0]['停留所名']+'－'+prepared.route['終点名'];
  const current=asNew?null:doc._cloud;
  const record=await window.customRoutes.save({id:current?.id,revision:current?.revision,name:title,csv});
  doc._cloud={id:record.id,revision:record.revision,uid:cloudUid};save();cloudLabel();cloudPicker();$('cloud-routes').value='cloud:'+record.id;
  status('自作路線に保存しました。iPhoneの「自作路線」へ自動反映されます。');
 }catch(error){status('自作路線を保存できません: '+error.message,true);}
 finally{$('cloud-save').disabled=!cloudLoggedIn;$('cloud-copy').disabled=!cloudLoggedIn;}
}
$('cloud-save').onclick=()=>saveCloud(false);$('cloud-copy').onclick=()=>saveCloud(true);
$('cloud-open').onclick=async()=>{
 const value=$('cloud-routes').value;if(!value)return status('編集する路線を選択してください',true);
 try{
  let next;if(value.startsWith('cloud:')){const record=window.customRoutes.get(value.slice(6));if(!record)throw Error('路線を取得できません');next=M.fromCsv(record.csv);next._cloud={id:record.id,revision:record.revision,uid:cloudUid};}
  else {const path=value.slice(5),response=await fetch('routes/'+path.split('/').map(encodeURIComponent).join('/')+'?v=25',{cache:'no-store'});if(!response.ok)throw Error('CSVを取得できません');next=M.fromCsv(await response.text());next._cloud=null;}
  doc=next;selected=0;save();renderRoute();render();cloudLabel();$('fit').click();status('自作路線を開きました。編集後に「自作路線に保存」を押してください。');
 }catch(error){status(error.message,true);}
};
$('editor-login-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('editor-login');button.disabled=true;
 try{if(!window.customRoutes)throw Error('Firebaseの初期化中です。少し待ってから再度ログインしてください');await window.customRoutes.login($('editor-user').value,$('editor-password').value);$('editor-password').value='';}
 catch(error){$('editor-auth-status').textContent='ログインできません: '+error.message;}
 finally{button.disabled=false;}
});
$('editor-logout').onclick=async()=>{try{await window.customRoutes.logout();}catch(error){status(error.message,true);}};
window.addEventListener('custom-routes-auth',event=>{
 cloudLoggedIn=event.detail.loggedIn;cloudUid=event.detail.uid;
 document.body.classList.toggle('editor-locked',!cloudLoggedIn);$('editor-auth').hidden=cloudLoggedIn;
 $('cloud-save').disabled=!cloudLoggedIn;$('cloud-copy').disabled=!cloudLoggedIn;
 if(cloudLoggedIn){$('editor-password').value='';if(doc._cloud?.uid && doc._cloud.uid!==cloudUid){doc._cloud=null;save();}cloudLabel();requestAnimationFrame(()=>{map?.invalidateSize();$('fit').click();});}
 else{$('editor-auth-status').textContent='ユーザーIDとパスワードでログインしてください';}
});
window.addEventListener('custom-routes-changed',cloudPicker);
window.addEventListener('custom-routes-error',event=>{if(cloudLoggedIn)status('自作路線の接続エラー: '+event.detail,true);else $('editor-auth-status').textContent='接続エラー: '+event.detail;});
fetch('routes/index.json?v=25',{cache:'no-store'}).then(r=>r.ok?r.json():{routes:[]}).then(manifest=>{bundledCustom=(manifest.routes||[]).filter(e=>e.category==='fictional'||e.path.startsWith('fictional/'));cloudPicker();}).catch(()=>{});
cloudLabel();
renderRoute();render();$('fit').click();status('下書きは自動保存されます。地図で停留所の位置を指定できます。');
})();
