(() => {
const FIELDS=["形式版", "行種別", "停留所名", "表示名", "英語名", "読み仮名", "緯度", "経度", "整理券1", "整理券2", "整理券3", "整理券4", "整理券5", "整理券6", "広告", "始発", "予備1", "予備2", "予備3", "放送ファイル", "停留所番号", "系統名", "路線表示", "終点名", "終点読み", "営業所", "放送フォルダ", "事業者名", "事業者読み", "系統読み"];
const empty=()=>Object.fromEntries(FIELDS.map(key=>[key,'']));
function blankStop(){return {...empty(),'形式版':'2','行種別':'停留所','整理券1':'240'};}
function blank(){return {route:{...empty(),'形式版':'2','行種別':'路線','事業者名':'架空バス','事業者読み':'かくうばす'},stops:[blankStop(),blankStop()]};}
function fromCsv(text){
 const parsed=BusRouteCsv.read(text);
 if(parsed.version===2)return {route:{...empty(),...parsed.route},stops:parsed.stops.map(row=>({...empty(),...row}))};
 const rows=BusRouteCsv.toRows(parsed),meta=rows.at(-1)||[],doc=blank();
 doc.stops=rows.slice(1,-1).map(row=>{const s=blankStop();for(const [key,i] of Object.entries({'停留所名':0,'表示名':1,'英語名':2,'広告':9,'始発':10,'予備1':11,'予備2':12,'予備3':13,'放送ファイル':14,'停留所番号':15,'緯度':16,'経度':17,'読み仮名':19}))s[key]=row[i]||'';for(let i=1;i<=6;i++)s['整理券'+i]=row[i+2]||'';return s;});
 doc.route['系統名']=meta[14]||'';doc.route['放送フォルダ']=doc.stops.some(s=>s['放送ファイル'])?meta[14]||'':'';doc.route['営業所']=String(meta[1]||'').endsWith('営業所')?meta[1]:'';doc.route['路線表示']=meta[15]||'';return doc;
}
function errors(doc){const result=[];if(!doc.route['系統名'].trim())result.push('系統名を入力してください');if(doc.stops.length<2)result.push('停留所は2か所以上必要です');doc.stops.forEach((s,i)=>{if(!s['停留所名'].trim())result.push((i+1)+'番の停留所名が空です');const lat=s['緯度'].trim(),lon=s['経度'].trim();if(Boolean(lat)!==Boolean(lon)||lat&&(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180))result.push((i+1)+'番の緯度経度が正しくありません');for(let n=1;n<=6;n++)if(s['整理券'+n]&&!/^\d+$/.test(s['整理券'+n]))result.push((i+1)+'番の運賃は0以上の整数で入力してください');});return result;}
function prepared(doc){const route={...doc.route,'形式版':'2','行種別':'路線','終点名':doc.stops.at(-1)?.['停留所名']||'','終点読み':doc.stops.at(-1)?.['読み仮名']||''};route['路線表示']=route['路線表示']||route['系統名']+'◆'+(doc.stops[0]?.['停留所名']||'')+'→'+route['終点名'];return {route,stops:doc.stops.map((s,i)=>({...s,'形式版':'2','行種別':'停留所','表示名':s['表示名']||s['停留所名'],'英語名':BusRouteCsv.formatEnglishStopName(s['英語名']),'停留所番号':String(i)}))};}
function csv(doc){const e=errors(doc);if(e.length)throw Error(e.join('\n'));const d=prepared(doc);const quote=v=>{v=String(v??'');return /[",\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;};return '\ufeff'+[FIELDS,...[d.route,...d.stops].map(row=>FIELDS.map(key=>row[key]||''))].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';}
function filename(doc){const d=prepared(doc);return (d.route['系統名']+'_'+d.stops[0]['停留所名']+'-'+d.route['終点名']).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,160)+'.csv';}
function manifest(doc,existing){const path='fictional/'+filename(doc),d=prepared(doc);return {...existing,routes:[...(existing.routes||[]).filter(e=>e.path!==path),{name:(d.route['事業者名']||'架空路線')+' / '+d.route['系統名']+'｜'+d.stops[0]['停留所名']+'－'+d.route['終点名'],path,category:'fictional'}]};}
window.RouteEditorModel={FIELDS,blankStop,blank,fromCsv,errors,prepared,csv,filename,manifest};
})();
