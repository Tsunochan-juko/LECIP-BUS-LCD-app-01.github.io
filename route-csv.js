/* Route CSV v2. Named records are adapted at the renderer/sync boundary. */
(() => {
  const stopFields = {'停留所名':0,'表示名':1,'英語名':2,'広告':9,'始発':10,'予備1':11,'予備2':12,'予備3':13,'放送ファイル':14,'停留所番号':15,'緯度':16,'経度':17,'読み仮名':19};
  for(let n=1;n<=6;n++) stopFields['整理券'+n]=n+2;
  function formatEnglishStopName(value) {
    return String(value || '').replace(/(\d+)\s+Jo\s+(\d+)\s+Chome\b/gi, '$1-$2')
      .replace(/\s+(?:Jo|Chome)\b/gi, '').trim();
  }
  function readCells(text) {
    const rows=[]; let row=[],field='',quoted=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++) {
      const ch=text[i];
      if(ch==='"') {
        if(quoted && text[i+1]==='"') {field+='"';i++;}
        else quoted=!quoted;
      } else if(ch===',' && !quoted) {row.push(field);field='';}
      else if((ch==='\n'||ch==='\r') && !quoted) {
        if(ch==='\r' && text[i+1]==='\n')i++;
        row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';
      } else field+=ch;
    }
    if(quoted)throw new Error('CSVの引用符が閉じていません');
    if(field!==''||row.length){row.push(field);if(row.some(v=>v!==''))rows.push(row);}
    return rows;
  }
  function fromCells(cells) {
    if(!cells.length || !cells[0].includes('形式版'))return {version:1,legacy:cells};
    const header=cells[0];
    for(const key of ['行種別','停留所名','読み仮名'])if(!header.includes(key))throw new Error('CSVに必要な列がありません: '+key);
    const records=cells.slice(1).map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]||''])));
    if(records.some(row=>row['形式版']!=='2'))throw new Error('未対応のCSV形式版です');
    const routes=records.filter(row=>row['行種別']==='路線');
    if(routes.length!==1)throw new Error('路線情報は1行必要です');
    return {version:2,route:routes[0],stops:records.filter(row=>row['行種別']==='停留所')};
  }
  function read(text) { return fromCells(readCells(text)); }
  function toRows(data) {
    if(data.version===1)return data.legacy;
    const rows=[Array(23).fill('')];
    for(const record of data.stops){const row=Array(23).fill('');for(const [key,i] of Object.entries(stopFields))row[i]=record[key]||'';rows.push(row);}
    const route=data.route,meta=Array(23).fill('');
    meta[1]=route['営業所']||'';
    meta[14]=route['放送フォルダ']||route['系統名']||'';meta[15]=route['路線表示']||'';
    meta[19]=route['終点読み']||'';meta[20]=route['事業者読み']||'';meta[21]=route['系統読み']||'';meta[22]=route['事業者名']||'';
    rows.push(meta);return rows;
  }
  function normalizeState(state) {
    const cells = state.routeData;
    if (!Array.isArray(cells) || !Array.isArray(cells[0]) || !cells[0].includes('形式版')) return state;
    const parsed = fromCells(cells);
    const kind = cells[0].indexOf('行種別');
    const rawIndex = Math.max(0, Number(state.mawashi) || 0) + 1;
    const before = cells.slice(1, rawIndex).filter(row => row?.[kind] === '停留所').length;
    const index = cells[rawIndex]?.[kind] === '停留所' ? before : 0;
    return {...state, routeData:toRows(parsed), mawashi:Math.min(index, Math.max(0,parsed.stops.length-1)), dataFormat:'renderer-v2'};
  }
  window.BusRouteCsv={read,toRows,normalizeState,formatEnglishStopName,parse:text=>toRows(read(text))};
})();
