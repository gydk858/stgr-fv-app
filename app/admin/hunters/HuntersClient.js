'use client'
import {useEffect,useState,useRef} from 'react'
import s from './desk.module.css'
import useHunterEmployees from './useHunterEmployees'
import HunterSettings from './HunterSettings'
import HunterRecords from './HunterRecords'
import HunterPurchase from './HunterPurchase'
import PurchaseLedger from './PurchaseLedger'
const empty={tag:'',display_name:'',rank:'',bio:'',mission:'',photo_id:null}
const newHunter={...empty,rank:'1'}
export default function HuntersClient({staffMode=false,accessToken=null}){
 const [cards,setCards]=useState([]),[count,setCount]=useState(0),[page,setPage]=useState(0),[search,setSearch]=useState(''),[settings,setSettings]=useState(null),[ranks,setRanks]=useState([]),[detail,setDetail]=useState(null),[form,setForm]=useState(empty),[fresh,setFresh]=useState(newHunter),[dirty,setDirty]=useState(false),[recordDirty,setRecordDirty]=useState(false),[purchaseDirty,setPurchaseDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[photoStatus,setPhotoStatus]=useState(''),[image,setImage]=useState(''),[imageVersion,setImageVersion]=useState(null),[previewBusy,setPreviewBusy]=useState(false),[origin,setOrigin]=useState('');const lock=useRef(false),issueKey=useRef(null),previewRequest=useRef(0),selectedId=useRef(null),imageRef=useRef(null)
 const [view,setView]=useState('purchase')
 // 管理用の上のタブ（受付・全員の買取表・設定）
 const [topView,setTopView]=useState('desk')
 // 受付担当者（買取とサイズ記録で共通。画面上部で選ぶ）
 const employee=useHunterEmployees(api)
 // エラーがどの操作で起きたか（'purchase'・'size'）。押したボタンの近くにも同じエラーを表示する
 const [errorSource,setErrorSource]=useState('')
 const card=detail?.card,pending=card&&(detail.print_pending||card.printed_settings_version!==settings?.version)
 async function api(query='',data){const r=await fetch('/api/hunters'+query,{method:data?'POST':'GET',headers:{...(accessToken?{'x-hunter-token':accessToken}:{}),...(data&&!(data instanceof FormData)?{'Content-Type':'application/json'}:{})},body:data?(data instanceof FormData?data:JSON.stringify(data)):undefined,cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'通信に失敗しました。');return d}
 async function run(fn,source=''){if(lock.current)return;lock.current=true;setBusy(true);setError('');setErrorSource('');setMessage('');try{await fn()}catch(e){setError(e.message);setErrorSource(source)}finally{lock.current=false;setBusy(false)}}
 async function list(p=page,q=search){const d=await api(`?page=${p}&search=${encodeURIComponent(q)}`);setCards(d.cards);setCount(d.count);setSettings(d.settings);setRanks(d.ranks);setPage(p)}
 async function preview(c){const seq=++previewRequest.current;setPreviewBusy(true);try{const r=await fetch(`/api/hunters?image=${c.id}`,{cache:'no-store',headers:accessToken?{'x-hunter-token':accessToken}:{}});if(!r.ok)throw Error('プレビューを取得できませんでした。');const b=await r.blob();if(seq!==previewRequest.current||selectedId.current!==c.id)return;if(imageRef.current)URL.revokeObjectURL(imageRef.current);imageRef.current=URL.createObjectURL(b);setImage(imageRef.current);setImageVersion(c.version)}catch(e){if(seq===previewRequest.current)setError(e.message)}finally{if(seq===previewRequest.current)setPreviewBusy(false)}}
 async function select(id,rp=0,showPreview=false){const d=await api('?id='+id+'&record_page='+rp);selectedId.current=id;setDetail({...d,recordPage:rp});setForm({...empty,...d.card});setDirty(false);setRecordDirty(false);setPurchaseDirty(false);setRanks(d.ranks);setPhotoStatus(d.card.photo_id?'写真は保存済みです。':'');if(showPreview){setImage('');setImageVersion(null);void preview(d.card)}}
 useEffect(()=>{setOrigin(window.location.origin);run(()=>list(0,''));return()=>{previewRequest.current++;if(imageRef.current)URL.revokeObjectURL(imageRef.current)}},[])
 useEffect(()=>{const f=e=>{if(dirty||recordDirty||purchaseDirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',f);return()=>window.removeEventListener('beforeunload',f)},[dirty,recordDirty,purchaseDirty])
 const discard=()=>!(dirty||recordDirty||purchaseDirty)||confirm('未保存の入力を破棄しますか？')
 async function changed(data){const d=await api('',{id:card.id,version:card.version,operation_id:crypto.randomUUID(),...data});setMessage('保存しました。GTA用画像は「印刷画像へ反映」で更新してください。');await select(d.card.id);setCards(cs=>cs.map(c=>c.id===d.card.id?d.card:c))}
 async function publish(){const d=await api('',{action:'prepare',id:card.id});if(!d.print_ready)throw Error(d.print_error||'画像更新に失敗しました。');await select(card.id);setMessage('印刷画像を更新しました。GTAへの反映には約60秒かかる場合があります。');void preview(d.card)}
 async function publishAll(){
  const targets=[];let p=0,total=Infinity
  while(targets.length<total){const d=await api(`?page=${p++}`);total=d.count;targets.push(...d.cards);if(!d.cards.length)break}
  const failed=[]
  for(const [i,c]of targets.entries()){
   setMessage(`全カード画像を更新中 ${i+1}/${targets.length}：#${c.hunter_no}。この画面を閉じずにお待ちください。`)
   try{const d=await api('',{action:'prepare',id:c.id});if(!d.print_ready)throw Error(d.print_error)}catch(e){failed.push(`#${c.hunter_no} ${e.message}`)}
  }
  if(card)await select(card.id)
  setMessage(`${targets.length-failed.length}/${targets.length}件の画像を更新しました。処理中に別の方が記録を変更した場合は、もう一度全カードを更新してください。`)
  if(failed.length)setError('更新できなかったカード：'+failed.join(' ／ '))
 }
 async function upload(kind,file){const fd=new FormData();fd.set('kind',kind);fd.set('file',file);return (await api('',fd)).asset.id}
 const field=(k,max)=>({value:form[k]||'',maxLength:max,onChange:e=>{setForm({...form,[k]:e.target.value});setDirty(true)}})
 // ---- 新デザイン（案B）の表示 ----
 const blocked=busy||dirty||recordDirty||purchaseDirty
 const sortedCards=[...cards].sort((a,b)=>Number(b.kills||0)-Number(a.kills||0)||Number(a.hunter_no)-Number(b.hunter_no))
 const historyLabel=h=>h.action==='purchase_save'?'買取を登録・訂正':h.action==='purchase_cancel'?'買取を取消':h.action==='record_batch'?`まとめ登録：${(h.after_data.records||[]).map(r=>`${r.animal} ${r.quantity}頭`).join('、')}`:h.action==='size_save'?'サイズ記録を登録・訂正':h.action==='size_delete'?'サイズ記録を削除':h.action==='record_save'?'狩猟記録を保存':h.action==='record_delete'?'狩猟記録を削除':h.action==='profile'?'プロフィールを変更':h.action==='owner_rotate'?'編集用URLを発行':h.action==='owner_access'?'編集用URLの有効状態を変更':h.action==='legacy_count'?'旧頭数を訂正':'カード発行'
 const historyActor=h=>h.actor==='owner'?'本人':h.action.startsWith('size_')?(h.after_data?.request?.actor||'未記録'):h.action.startsWith('purchase_')?h.actor:'管理ログイン'
 const innerTabs=[['purchase','素材の買取'],['size','サイズ記録'],['profile','プロフィール'],['owner','本人用ページ'],...(staffMode?[]:[['history','履歴']])]
 return <div className={s.page}>
 <header className={s.header}><div><span className={s.kicker}>Hunting</span><h1>{staffMode?'ハンティング受付':'ハンティング'}</h1></div>
 {!staffMode&&<nav className={s.topTabs} aria-label="ハンティングの画面">{[['desk','受付'],['ledger','全員の買取表'],['settings','設定']].map(([key,label])=><button type="button" key={key} aria-pressed={topView===key} onClick={()=>setTopView(key)}>{label}</button>)}</nav>}</header>
 {(error||message)&&<div className={s.alerts}>{error&&<div className={`${s.notice} ${s.error} ${s.alertError}`} role="alert"><span>⚠ {error}</span><button type="button" className={s.alertClose} aria-label="エラー表示を閉じる" onClick={()=>{setError('');setErrorSource('')}}>×</button></div>}{message&&<div className={s.notice} role="status">{message}</div>}</div>}

 <div hidden={topView!=='desk'} className={s.workspace}>
 <aside className={`${s.panel} ${s.listPanel}`} aria-label="ハンター一覧">
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><h2>ハンター</h2><span className={s.muted}>{count}人</span></div>
  <form onSubmit={e=>{e.preventDefault();run(()=>list(0,search))}} style={{display:'flex',gap:6,alignItems:'flex-end'}}><label style={{flex:1}}>管理番号<input inputMode="numeric" value={search} onChange={e=>setSearch(e.target.value)} placeholder="番号で探す"/></label><button disabled={busy}>探す</button></form>
  {search!==''&&<button type="button" disabled={busy} onClick={()=>{setSearch('');run(()=>list(0,''))}} style={{alignSelf:'flex-start'}}>全員を表示</button>}
  <div className={s.list}>{sortedCards.map(c=><button type="button" key={c.id} className={`${s.item} ${card?.id===c.id?s.itemActive:''}`} disabled={busy} aria-current={card?.id===c.id?'true':undefined} onClick={()=>{if(card?.id===c.id)return;if(discard())run(()=>select(c.id,0,true))}}><span><span className={s.itemName}>#{c.hunter_no} {c.display_name||'匿名'}</span><span className={s.itemSub}>HR {c.rank||'—'} ・ {c.kills}頭</span></span>{card?.id===c.id&&<span className={s.itemSub} style={{color:'#8a6f45'}}>表示中</span>}</button>)}{!cards.length&&<p className={s.muted}>該当するハンターはいません。</p>}</div>
  {count>50&&<div className={s.row}><button disabled={busy||page===0} onClick={()=>run(()=>list(page-1))}>前</button><span className={s.muted}>{page+1}/{Math.max(1,Math.ceil(count/50))}</span><button disabled={busy||(page+1)*50>=count} onClick={()=>run(()=>list(page+1))}>次</button></div>}
  <p className={s.muted}>討伐数の多い順です。</p>
  <details style={{borderTop:'1px solid #efe7da',paddingTop:10}}><summary>＋ 新しいカードを発行</summary><form onSubmit={e=>{e.preventDefault();if(!discard())return;run(async()=>{issueKey.current??=crypto.randomUUID();const d=await api('',{action:'create',...fresh,operation_id:issueKey.current});issueKey.current=null;setFresh(newHunter);await select(d.card.id,0,true);await list(0,'');setSearch('');setMessage('カードを発行しました。「印刷画像へ反映」を押してからURLをお渡しください。')})}}><fieldset disabled={busy} style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}><label>名前（任意）<input maxLength={40} value={fresh.display_name} onChange={e=>setFresh({...fresh,display_name:e.target.value})}/></label><button className={s.primary}>カードを発行する</button></fieldset></form></details>
 </aside>

 {card?<>
 <section className={s.center} aria-label="受付">
  <div className={`${s.panel} ${s.hunterHead}`}>
   <div><span className={s.muted} style={{fontSize:13}}>#{card.hunter_no} ・ HR {card.rank||'—'} ・ 累計 {Number(card.kills||0).toLocaleString('ja-JP')}頭</span><div className={s.hunterName}>{card.display_name||'匿名'}</div></div>
   <div className={s.headTools}>
    <span className={`${s.pill} ${pending?s.pillWarn:''}`}>{pending?'印刷画像：未反映':'印刷画像：反映済み'}</span>
    <label>受付担当<select aria-label="受付担当者名" required value={employee.actor} onFocus={()=>employee.refreshEmployees.current()} onPointerDown={()=>employee.refreshEmployees.current()} disabled={employee.employeeLoading||!!employee.employeeError||!employee.employees.length} onChange={e=>employee.setActor(e.target.value)}><option value="">{employee.employeeLoading?'従業員を取得中…':'選んでください'}</option>{employee.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    <button type="button" disabled={busy} onClick={()=>{if(discard())run(()=>select(card.id))}}>再読込</button>
   </div>
   {employee.employeeError&&<span role="alert" className={s.muted} style={{color:'#b8573f',flexBasis:'100%'}}>{employee.employeeError}</span>}
   {!employee.employeeLoading&&!employee.employeeError&&!employee.employees.length&&<span className={s.muted} style={{flexBasis:'100%'}}>在籍中の従業員がいません。従業員一覧を確認してください。</span>}
  </div>
  <div className={s.tabs} aria-label="受付の操作">{innerTabs.map(([key,label])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>

  <div hidden={view!=='purchase'} className={s.panel}><HunterPurchase key={'purchase:'+card.id+':'+card.version} card={card} animals={settings?.animals||[]} api={api} employee={employee} busy={busy} dirty={dirty||recordDirty} onDirty={setPurchaseDirty} actionError={errorSource==='purchase'?error:''} onSave={data=>run(()=>changed(data),'purchase')}/></div>
  <section hidden={view!=='size'} className={s.panel}><HunterRecords api={api} key={card.id+':'+card.version} card={card} employee={employee} animals={settings?.animals||[]} stats={detail.stats} records={detail.records} count={detail.record_count} page={detail.recordPage} onPage={p=>{if(discard())run(()=>select(card.id,p))}} onSave={data=>run(()=>changed(data),'size')} actionError={errorSource==='size'?error:''} busy={busy} dirty={dirty||purchaseDirty} onDirty={setRecordDirty}/></section>

  <section hidden={view!=='profile'} className={s.panel}><h3>{staffMode?'ランク・プロフィールの変更':'プロフィール'}</h3><form onSubmit={e=>{e.preventDefault();run(()=>changed({action:'profile',...Object.fromEntries(Object.keys(empty).map(k=>[k,form[k]]))}))}}><fieldset disabled={busy||recordDirty||purchaseDirty} style={{display:'flex',flexDirection:'column',gap:10}}><div className={s.fields}><label>ハンタータグ<input {...field('tag',24)}/></label><label>ランク番号<input type="number" min="0" max="999999" step="1" list="hunter-ranks" value={form.rank||''} onChange={e=>{setForm({...form,rank:e.target.value===''?'':String(Number(e.target.value))});setDirty(true)}}/><datalist id="hunter-ranks">{ranks.map(r=><option key={r.rank} value={r.rank}/>)}</datalist></label><label>名前<input {...field('display_name',40)}/></label></div><label>自己紹介<textarea {...field('bio',160)}/></label><p className={s.muted}>受注クエスト：{ranks.find(r=>r.rank===form.rank)?.mission||card.mission||'未設定'}</p><label>写真（2MB以下）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files[0];e.target.value='';if(f)run(async()=>{const id=await upload('photo',f);setForm({...form,photo_id:id});setDirty(true);setPhotoStatus('写真を読み込みました。プロフィールを保存してください。')})}}/>{photoStatus&&<span className={s.photoStatus} role="status">{photoStatus}</span>}</label><div className={s.row}>{form.photo_id&&<button type="button" onClick={()=>{setForm({...form,photo_id:null});setDirty(true);setPhotoStatus('写真を外しました。保存してください。')}}>写真を外す</button>}<button className={s.primary} disabled={!dirty}>プロフィールを保存</button></div></fieldset></form></section>

  <section hidden={view!=='owner'} className={s.panel}><h3>本人用ページ</h3><p className={s.muted}>本人がタグ・名前・写真・自己紹介を変更できるページです。URLは本人にだけ渡してください。</p><div className={s.row}><button disabled={blocked} onClick={()=>{if(!card.owner_token||confirm('以前の編集用URLを無効にして再発行しますか？'))run(()=>changed({action:'owner_rotate'}))}}>編集用URLを{card.owner_token?'再発行':'発行'}</button>{card.owner_token&&<button disabled={blocked} onClick={()=>run(()=>changed({action:'owner_access',enabled:!card.owner_enabled}))}>{card.owner_enabled?'停止':'再開'}</button>}</div>{card.owner_token&&<label>本人にだけ共有（{card.owner_enabled?'有効':'停止中'}）<input className={s.url} readOnly value={`${origin}/hunter-user/${card.owner_token}`} onFocus={e=>e.target.select()}/></label>}</section>

  {!staffMode&&<section hidden={view!=='history'} className={s.panel}><h3>変更履歴</h3><div className={s.history}>{detail.history.map(h=><article key={h.id}><time>{new Date(h.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ {historyActor(h)}</time>{historyLabel(h)}</article>)}{!detail.history.length&&<p className={s.muted}>履歴はありません。</p>}</div></section>}
 </section>

 <aside className={`${s.panel} ${s.previewPanel}`} aria-label="カード"><h2>カード</h2><div className={s.imageBox}>{image?<a href={image} target="_blank" rel="noreferrer"><img className={s.card} src={image} alt="ハンティングカード"/></a>:<p className={s.muted} style={{padding:12,textAlign:'center'}}>{previewBusy?'プレビューを生成中…':'プレビューを更新してください。'}</p>}</div><p className={s.muted}>{imageVersion!==card.version?'保存内容が変わりました。プレビューを更新してください。':'保存済みの内容です。'}{previewBusy?' 画像生成中…':''}</p><button disabled={busy||previewBusy} onClick={()=>preview(card)}>プレビューを更新</button>
  <div className={s.publishBox}><strong style={{fontSize:13,color:'#22352b'}}>{pending?'印刷画像：未反映の変更があります':'印刷画像：反映済み'}</strong><p className={s.muted}>入力をまとめて保存した後に押すと、GTAで使う画像が新しくなります（反映に約60秒）。</p><button className={s.primary} disabled={blocked} onClick={()=>run(publish)} style={{minHeight:42,fontSize:14}}>{busy?'処理中…':'印刷画像へ反映'}</button></div>
  <label>GTA印刷用URL<input className={s.url} readOnly value={detail.print_url} onFocus={e=>e.target.select()}/></label><div className={s.row} style={{margin:0}}><button disabled={busy} onClick={()=>run(async()=>{await navigator.clipboard.writeText(detail.print_url);setMessage('URLをコピーしました。未反映なら画像へ反映してください。')})}>URLをコピー</button>{image&&<a href={image} download={`hunter-${card.hunter_no}.png`} style={{fontSize:13}}>PNG保存</a>}</div></aside>
 </>:<section className={`${s.panel} ${s.center}`}><div className={s.empty}>左の一覧からハンターを選んでください。</div></section>}
 </div>

 {!staffMode&&topView==='ledger'&&<PurchaseLedger api={api} busy={busy} revision={card?.version} onSelect={id=>{if(discard()){setTopView('desk');run(()=>select(id,0,true))}}}/>}

 {!staffMode&&<div hidden={topView!=='settings'} className={s.supportTools}>
  {settings&&<HunterSettings key={settings.version} settings={settings} origin={origin} ranks={ranks} busy={busy} api={api} run={run} reload={async()=>{await list();setImageVersion(null);setMessage('設定を保存しました。各カードで印刷画像へ反映してください。')}} onBackground={async file=>{await api('',{action:'background',background_id:file?await upload('background',file):'',version:settings.version});await list();setImageVersion(null);setMessage('台紙を保存しました。印刷画像へ反映してください。')}}/>}
  <section className={s.panel}><h3>全カードの画像更新・金冠について</h3><p className={s.muted}><b>金冠：動物ごとの最小・最大記録 ／ トロフィー：最多討伐数（同率は全員）</b></p><p className={s.muted}>記録を訂正・追加した後は、以前の保持者の金冠・トロフィーも変わる場合があります。最後に全カードの画像を更新してください。公開済み画像の金冠は、画像へ反映した時点の記録です。毎日19:50には自動でも更新されます。</p><div className={s.row}><button disabled={blocked} onClick={()=>run(publishAll)}>金冠・トロフィーを含め全カード画像を更新</button></div></section>
 </div>}
 </div>
}
