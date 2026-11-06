import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, push, onValue, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './firebase-config.js?v=25';

const dispatch=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
let auth=null,db=null,unsubscribe=null,records={};
const rootPath='privateBus/state';
function list(){return Object.values(records).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));}
function clear(){records={};dispatch('custom-routes-changed',[]);}
function requireUser(){if(!auth?.currentUser)throw new Error('ユーザーIDとパスワードでログインしてください');return auth.currentUser;}
function validateCsv(csv){
 if(typeof csv!=='string' || new TextEncoder().encode(csv).length>500000)throw new Error('CSVは500KB以内で保存してください');
 const rows=BusRouteCsv.parse(csv);
 if(rows.length<4 || rows.length>1002)throw new Error('停留所は2〜1000か所で保存してください');
 for(const row of rows.slice(1,-1))if(!row[0]?.trim())throw new Error('停留所名が空です');
 return rows;
}
window.customRoutes={
 list, get:id=>records[id]||null,
 async login(userId,password){await ready;const id=String(userId||'').trim();if(!id)throw new Error('ユーザーIDを入力してください');await signInWithEmailAndPassword(auth,id.includes('@')?id:id.toLowerCase()+'@bus-display.invalid',password);},
 async logout(){await ready;if(auth)await signOut(auth);},
 async save({id,name,csv,revision}){
  await ready;const user=requireUser();validateCsv(csv);name=String(name||'').trim();if(!name)throw new Error('路線名がありません');
  const isNew=!id;id=id||push(ref(db,rootPath+'/customRoutes')).key;
  if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('路線IDが正しくありません');
  const result=await runTransaction(ref(db,rootPath),current=>{
   const node=current?{...current}:{state:{mawashi:0},writerClientId:'route-editor'};
   const routes={...(node.customRoutes||{})},previous=routes[id];
   if(!isNew && (!previous || previous.ownerUid!==user.uid || previous.revision!==revision))return;
   routes[id]={id,name,csv,ownerUid:user.uid,revision:(previous?.revision||0)+1,updatedAt:Date.now()};
   node.customRoutes=routes;return node;
  },{applyLocally:false});
  if(!result.committed)throw new Error('別の画面で更新されたか、路線が削除されています。保存前に登録済み路線を開き直してください。');
  return result.snapshot.val().customRoutes[id];
 }
};
const ready=(async()=>{
 try{
  if(!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('PASTE_'))throw new Error('Firebaseの設定が必要です');
  const app=getApps().length?getApp():initializeApp(firebaseConfig);auth=getAuth(app);db=getDatabase(app);
  await setPersistence(auth,browserLocalPersistence);
  onAuthStateChanged(auth,user=>{
   if(unsubscribe){unsubscribe();unsubscribe=null;}clear();
   dispatch('custom-routes-auth',{loggedIn:Boolean(user),uid:user?.uid||''});
   if(!user)return;
   unsubscribe=onValue(ref(db,rootPath+'/customRoutes'),snapshot=>{
    records={};for(const [id,value] of Object.entries(snapshot.val()||{})){
     if(value?.ownerUid!==user.uid || typeof value.csv!=='string')continue;
     try{validateCsv(value.csv);records[id]={...value,id};}catch(error){console.warn('自作路線の読み込みをスキップ',id,error);}
    }
    dispatch('custom-routes-changed',list());
   },error=>{clear();dispatch('custom-routes-error',error.message);});
  },error=>dispatch('custom-routes-error',error.message));
 }catch(error){dispatch('custom-routes-error',error.message);throw error;}
})();
ready.catch(()=>{});
