'use client'
import { useEffect, useRef, useState } from 'react'
import LayoutEditor, { newLayout, StampBoard, useAssetUrls } from '@/components/events/LayoutEditor'
import PuzzleEditor, { PuzzleBoard } from '@/components/events/PuzzleEditor'
import { puzzleLayout } from '@/lib/puzzle-geometry'
import s from './events.module.css'
const statuses={draft:'準備中',active:'開催中',ended:'終了'}
const types={sequential:'1．スタンプ（順番）',specific:'2．スタンプ（場所指定）',puzzle:'3．画像パズル',bingo:'4．ビンゴ（今後対応）',other:'5．その他（今後対応）'}
const blank={name:'',description:'',starts_on:'',ends_on:'',status:'draft',event_type:'sequential',max_stamps:1}
function Fields({form,setForm,existing,locked}) {
 const field=k=>({value:form[k]??'',onChange:e=>setForm({...form,[k]:e.target.value,...(k==='event_type'?{layout:e.target.value==='puzzle'?puzzleLayout():newLayout()}: {})})})
 return <div className={s.fields}><label>イベント名<input required maxLength={80} {...field('name')}/></label><label>種類<select disabled={locked} {...field('event_type')}>{Object.entries(types).map(([k,v])=><option value={k} key={k} disabled={['bingo','other'].includes(k)&&form.event_type!==k}>{v}</option>)}</select></label><div className={s.dates}><label>開始日<input type="date" {...field('starts_on')}/></label><label>終了日<input type="date" min={form.starts_on||undefined} {...field('ends_on')}/></label></div><label>説明・特典<textarea maxLength={1000} {...field('description')}/></label>{existing&&<label>状態<select {...field('status')}>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}<p className={s.small}>開催日は案内用です。開始・終了は「状態」で切り替えます。</p></div>
}
export default function EventsClient({accessToken=null}) {
 const operator=accessToken!==null
 const [saving,setSaving]=useState(false),[events,setEvents]=useState([]),[event,setEvent]=useState(null),[form,setForm]=useState(blank),[assets,setAssets]=useState([]),[hasCards,setHasCards]=useState(false)
 const [cards,setCards]=useState([]),[total,setTotal]=useState(0),[page,setPage]=useState(0),[query,setQuery]=useState(''),[busy,setBusy]=useState(true),[message,setMessage]=useState(''),[dirty,setDirty]=useState(false),[selected,setSelected]=useState(null),[shareUrl,setShareUrl]=useState(''),[filter,setFilter]=useState('active')
 const lock=useRef(false),urls=useAssetUrls(assets,accessToken)
 // 管理用の上のタブ（受付・設定・台紙と配置・担当者用URL）と、一覧の「新しいイベントを作る」
 const [tab,setTab]=useState(null),[creating,setCreating]=useState(false)
 useEffect(()=>{if(events.length&&filter==='active'&&!events.some(e=>e.status==='active'))setFilter('all')},[events])
 async function api(params='',payload) {
  const response=await fetch(`${operator?'/api/event-operator':'/api/admin-events'}${params}`,{method:payload?'POST':'GET',cache:'no-store',headers:{...(payload?{'Content-Type':'application/json'}:{}),...(operator?{'x-event-access':accessToken}:{})},...(payload?{body:JSON.stringify(payload)}:{})})
  const data=await response.json();if(!response.ok)throw Error(data.error||'処理に失敗しました。');return data
 }
 async function run(fn) {if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{return await fn()}catch(e){setMessage(e.message||'処理に失敗しました。')}finally{lock.current=false;setBusy(false)}}
 async function list(){const data=await api();setEvents(data.events)}
 async function load(id,p=0,term='',keepDraft=false){
  const params=n=>`?event_id=${encodeURIComponent(id||'')}&page=${n}&search=${encodeURIComponent(term)}`
  if(operator&&term&&keepDraft){const data=await api(params(0)+'&cards_only=1');setEvent(data.event);setCards(old=>old.map(c=>data.cards.find(n=>n.id===c.id)||c));return data}
  const data=await api(params(p))
  let listed=data.cards,total=data.count
  if(operator){
   const first=term?await api('?page=0'):data
   listed=[...first.cards];total=first.count
   for(let n=1;n*50<total;n+=4){const pages=await Promise.all(Array.from({length:Math.min(4,Math.ceil(total/50)-n)},(_,i)=>api(`?page=${n+i}&cards_only=1`)));for(const next of pages)listed.push(...next.cards)}
   listed=Array.from(new Map(listed.map(c=>[c.id,c])).values())
  }
  setEvent(data.event);setAssets(data.assets);setCards(listed);setTotal(total);setPage(operator?0:p);setHasCards(!!data.has_cards)
  if(!keepDraft){setForm({...data.event,layout:data.event.layout?.slots?.length||data.has_cards?data.event.layout:data.event.event_type==='puzzle'?puzzleLayout():newLayout()});setDirty(false)}
  setShareUrl(!operator&&data.event.access_token?`${window.location.origin}/event-access/${data.event.access_token}`:'');return data
 }
 useEffect(()=>{run(()=>operator?load(null):list())},[accessToken])
 function acceptCard(card,created=false){setCards(old=>{const others=old.filter(c=>c.id!==card.id);return [card,...others].sort((a,b)=>operator?Number(a.card_no)-Number(b.card_no):Number(b.card_no)-Number(a.card_no))});if(created){setTotal(n=>n+1);setHasCards(true)}}
 function editForm(next){setForm(next);setDirty(true)}
 async function refresh(){if(event){await load(event.id,page,query);setSelected(null)}else await list()}
 async function upload(kind,file){return run(async()=>{const data=new FormData();data.set('event_id',event.id);data.set('kind',kind);data.set('file',file);const response=await fetch('/api/event-assets',{method:'POST',body:data});const result=await response.json();if(!response.ok)throw Error(result.error);setAssets(old=>[...old,result.asset]);setMessage('画像を登録しました。最後に「設定と配置を保存」を押してください。');return result.asset})}
 async function removeAsset(action,assetId){if(!window.confirm(action==='reset_background'?'台紙をリセットしますか？登録済み台紙画像を削除し、準備中に戻します。枠と文字の配置は保持します。':'このスタンプ画像を削除しますか？使用している枠は画像未選択になり、イベントは準備中に戻ります。'))return;await run(async()=>{const {warning}=await api('',{action,event_id:event.id,version:event.version,asset_id:assetId,layout:form.layout});await load(event.id,0,'');setMessage(warning||'削除しました。画像を設定し、設定と配置を保存してください。')})}
 async function deleteEvent(){const name=window.prompt(`「${event.name}」を削除します。カード・押印履歴・画像も削除され、専用URLと印刷用URLは使えなくなります。元に戻せません。削除する場合はイベント名を入力してください。`);if(name!==event.name)return;await run(async()=>{const {warning}=await api('',{action:'delete_event',event_id:event.id,version:event.version,confirm_name:name});setEvent(null);setSelected(null);setForm(blank);setAssets([]);setDirty(false);await list();setMessage(warning||'イベントを削除しました。')})}
 const ready=event&&['sequential','specific','puzzle'].includes(event.event_type)
 const discard=()=>!saving&&(!dirty||window.confirm('保存していない設定を破棄しますか？'))
 // ---- 新デザイン（案B）の表示 ----
 const badgeClass=st=>`${s.badge} ${st==='draft'?s.badgeDraft:st==='ended'?s.badgeEnded:''}`
 const typeName=t=>(types[t]||t||'').replace(/^\d．/,'')
 const daysLeft=end=>{if(!end)return null;const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);return Math.round((new Date(end+'T00:00:00Z')-new Date(today+'T00:00:00Z'))/86400000)}
 const counts=Object.fromEntries(Object.keys(statuses).map(k=>[k,events.filter(e=>e.status===k).length]))
 const backToList=()=>{if(discard())run(async()=>{await list();setEvent(null);setSelected(null);setForm(blank);setDirty(false);setAssets([]);setTab(null)})}
 const currentTab=operator?'reception':tab||(hasCards||!ready?'reception':'layout')
 const saveBar=<div className={s.saveBar}><span>{dirty?'未保存の変更があります':'保存済み'}</span><button className={s.button}>設定と配置を保存</button></div>
 return <main className={s.page}><div className={s.wrap}>
  <header className={s.header}>
   <div><div className={s.topline}>{operator?'Event reception':'Events'}</div><h1>{event?.name||(operator?'イベント受付':'イベント')}</h1>{operator&&<p className={s.muted}>番号でカードを探して押印できます。お客様名の登録は任意です。</p>}</div>
   <div className={s.headerSide}>
    {event&&<div className={s.headerMeta}><span className={badgeClass(event.status)}>{statuses[event.status]}</span><span>{typeName(event.event_type)} ・ {event.starts_on||'開始日未定'}〜{event.ends_on||'終了日未定'}</span><button type="button" className={s.secondary} disabled={busy||saving} onClick={()=>{if(discard())run(refresh)}}>再読込</button>{!operator&&<button type="button" className={s.secondary} disabled={busy||saving} onClick={backToList}>← イベント一覧</button>}</div>}
    {!operator&&event&&<nav className={s.tabs} aria-label="イベントの画面">{[['reception','受付'],['settings','設定'],['layout','台紙・配置'],['access','担当者用URL']].map(([k,l])=><button type="button" key={k} aria-pressed={currentTab===k} onClick={()=>setTab(k)}>{l}</button>)}</nav>}
   </div>
  </header>
  {message&&<div className={s.message} role="status">{message}</div>}{busy&&<p role="status" className={s.small}>処理中です…</p>}

  {!operator&&!event&&<>
   <div className={s.listBar}>
    <div className={s.segment} role="group" aria-label="状態で絞り込み">{[['active','開催中'],['draft','準備中'],['ended','終了'],['all','すべて']].map(([k,l])=><button type="button" key={k} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{l}{k!=='all'?` ${counts[k]||0}`:''}</button>)}</div>
    <button type="button" className={s.button} style={{background:'#dcc79e',color:'#22352b',borderColor:'#dcc79e'}} disabled={busy||saving} onClick={()=>setCreating(v=>!v)}>{creating?'作るのをやめる':'＋ 新しいイベントを作る'}</button>
   </div>
   <div className={s.list}>
    {creating&&<section className={`${s.panel} ${s.createCard}`}><h2>新しいイベントを作る</h2><form onSubmit={e=>{e.preventDefault();run(async()=>{const {result}=await api('',{...form,action:'create_event'});await load(result.id);setQuery('');setCreating(false);setTab('layout');setMessage('作成しました。画像と配置を設定して保存してください。')})}}><fieldset disabled={busy||saving} style={{display:'flex',flexDirection:'column',gap:12}}><Fields form={form} setForm={setForm}/><button className={s.button}>作って台紙の準備へ</button></fieldset></form></section>}
    {events.filter(e=>filter==='all'||e.status===filter).map(e=>{const left=e.status==='active'?daysLeft(e.ends_on):null;return <article className={`${s.panel} ${s.event}`} key={e.id}>
     <div className={s.row} style={{justifyContent:'space-between'}}><span className={badgeClass(e.status)}>{statuses[e.status]}</span><span className={s.small}>{typeName(e.event_type)}</span></div>
     <span className={s.eventName}>{e.name}</span>
     <span className={s.muted}>{e.starts_on||'開始日未定'}〜{e.ends_on||'終了日未定'}{left!==null?` ・ ${left>0?`終了まで あと${left}日`:left===0?'今日が最終日':'終了日を過ぎています'}`:''}</span>
     <div className={s.eventStats}><span>発行<b>{Number(e.last_card_no||0)}</b>枚</span><span><b>{e.max_stamps}</b>{e.event_type==='puzzle'?'ピース':'枠'}</span></div>
     <span className={s.small}>担当者用URL：{e.access_enabled?'有効':'停止中'}</span>
     <div className={s.row}><button type="button" className={e.status==='active'?s.button:s.secondary} disabled={busy||saving} onClick={()=>run(async()=>{await load(e.id);setQuery('');setSelected(null);setTab('reception')})}>{e.status==='ended'?'記録を見る':'受付を開く'}</button><button type="button" className={s.secondary} disabled={busy||saving} onClick={()=>run(async()=>{await load(e.id);setQuery('');setSelected(null);setTab('layout')})}>設定・台紙</button></div>
    </article>})}
   </div>
   {!busy&&!events.length&&<p className={s.empty}>イベントはまだありません。「＋ 新しいイベントを作る」から作ってください。</p>}
   <p className={s.small}>ビンゴ・その他は、今後対応のため選べません。</p>
  </>}

  {event&&<>
   {!operator&&<form hidden={!['settings','layout'].includes(currentTab)} onSubmit={e=>{e.preventDefault();run(async()=>{const custom=['sequential','specific','puzzle'].includes(form.event_type);const payload={...form,layout:custom?form.layout:{},max_stamps:custom?(form.layout.slots?.length||event.max_stamps):event.max_stamps,event_id:event.id,version:event.version,action:'update_event'};const {result}=await api('',payload);setEvent(result);setForm(result);setDirty(false);setMessage('設定と配置を保存しました。')})}}><fieldset disabled={busy||saving} style={{display:'flex',flexDirection:'column',gap:16}}>
    <div hidden={currentTab!=='settings'} className={s.settingsGrid}>
     <section className={s.panel}><h2>イベント設定</h2><Fields form={form} setForm={editForm} existing locked={hasCards}/></section>
     <section className={s.panel}><h2>イベントの削除</h2><p className={s.small}>カード・押印履歴・画像もすべて削除され、担当者用URLと印刷用URLは使えなくなります。元に戻せません。</p><div><button type="button" className={`${s.secondary} ${s.danger}`} onClick={deleteEvent}>イベントを削除</button></div></section>
    </div>
    <div hidden={currentTab!=='layout'}>
     {form.event_type==='puzzle'&&<PuzzleEditor key={event.id} value={form.layout?.puzzle?form.layout:puzzleLayout()} onChange={layout=>editForm({...form,layout})} urls={urls} onUpload={upload} locked={hasCards} onImport={async file=>{setSaving(true);try{const fd=new FormData();fd.set('event_id',event.id);fd.set('file',file);const r=await fetch('/api/event-puzzle-import',{method:'POST',body:fd});const data=await r.json();if(!r.ok)throw Error(data.error);setAssets(old=>[...old,...data.assets]);return data}finally{setSaving(false)}}}/>}
     {['sequential','specific'].includes(form.event_type)&&<LayoutEditor eventId={event.id} key={event.id} value={form.layout||newLayout()} onChange={layout=>editForm({...form,layout})} assets={assets} urls={urls} onUpload={upload} onDeleteAsset={id=>removeAsset('delete_asset',id)} onResetBackground={()=>removeAsset('reset_background')} locked={hasCards} eventType={form.event_type}/>}
     {!['sequential','specific','puzzle'].includes(form.event_type)&&<section className={s.panel}><p className={s.empty}>この種類（ビンゴ・その他）の台紙は今後対応予定です。</p></section>}
    </div>
    {saveBar}
   </fieldset></form>}

   {!operator&&currentTab==='access'&&<section className={s.panel} style={{maxWidth:760}}><h2>担当者用URL</h2><p>{event.access_enabled?'URLは有効です':'URLは停止中です'}{event.status!=='active'?' ／ 開催中になるまで操作できません':''}</p>{shareUrl&&<label>担当者に共有するURL<input value={shareUrl} readOnly onFocus={e=>e.target.select()}/></label>}<div className={s.row}><button className={s.button} disabled={busy||saving||dirty} onClick={()=>{if(shareUrl&&!window.confirm('古い専用URLが使えなくなります。再発行しますか？'))return;run(async()=>{const {result}=await api('',{event_id:event.id,version:event.version,action:'rotate_access'});setEvent(result);setForm(old=>({...old,version:result.version}));setShareUrl(`${window.location.origin}/event-access/${result.access_token}`);setMessage('専用URLを発行しました。信頼する担当者に共有してください。')})}}>{shareUrl?'URLを再発行':'専用URLを発行'}</button>{shareUrl&&<><button className={s.secondary} disabled={busy||saving} onClick={()=>run(async()=>{await navigator.clipboard.writeText(shareUrl);setMessage('担当者用URLをコピーしました。')})}>URLをコピー</button><button className={s.secondary} disabled={busy||saving||dirty} onClick={()=>run(async()=>{const {result}=await api('',{event_id:event.id,version:event.version,action:'set_access',enabled:!event.access_enabled});setEvent(result);setForm(old=>({...old,version:result.version}));setMessage(result.access_enabled?'専用入口を再開しました。':'専用入口を停止しました。')})}>{event.access_enabled?'URLを停止':'URLを再開'}</button></>}</div><p className={s.small}>このURLを知る人は、このイベントのカードを操作できます。お客様に渡す画像URLとは別です。未保存の設定がある場合は、先に「設定と配置を保存」を押してください。</p></section>}

   {currentTab==='reception'&&(ready?<CardOperations key={event.id} event={event} assets={assets} urls={urls} api={api} run={run} busy={busy||(!operator&&dirty)} operator={operator} cards={cards} count={total} page={page} query={query} setQuery={setQuery} selected={selected} setSelected={setSelected} load={load} acceptCard={acceptCard} message={setMessage} onSaving={setSaving}/>:<section className={s.panel}><p className={s.empty}>ビンゴ・その他のカード操作は今後対応予定です。</p></section>)}
   {!operator&&currentTab==='reception'&&dirty&&<p className={s.small}>台紙・設定に未保存の変更があるため、押印は止めています。「台紙・配置」タブで保存してください。</p>}
  </>}
 </div></main>
}
function CardOperations({event,urls,api,run,busy,operator,cards,count,page,query,setQuery,selected,setSelected,load,acceptCard,message,onSaving}) {
 const [newName,setNewName]=useState(''),[name,setName]=useState(''),[pending,setPending]=useState(0),[failure,setFailure]=useState(''),[printError,setPrintError]=useState(''),[showPrint,setShowPrint]=useState(false),[directPrint,setDirectPrint]=useState(null),[liveReady,setLiveReady]=useState(false)
 const queue=useRef([]),working=useRef(false),current=useRef(null),issue=useRef(null)
 const active=event.status==='active',slots=event.layout?.slots||[],blocked=busy||pending>0||!!failure
 const legacyUrl=selected?`/event-card/${selected.print_token}.png`:''
 const imageUrl=selected?`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')}/storage/v1/object/public/bambi-event-live/${selected.print_token}.png`:''
 function apply(card,op){if(op.delta!==undefined){const n=card.stamps+op.delta;return {...card,stamps:n,marked_slots:slots.slice(0,n).map(s=>s.id)}}const marks=(card.marked_slots||[]).filter(id=>id!==op.slot_id);if(op.pressed)marks.push(op.slot_id);return {...card,marked_slots:marks,stamps:marks.length}}
 function preview(){let card=current.current;for(const item of queue.current)card=apply(card,item.op);setSelected(card)}
 function select(card){setLiveReady(false);setDirectPrint(null);current.current=card;setSelected(card);setName(card.display_name||'');setPrintError('');setFailure('');setShowPrint(false)}
 useEffect(()=>{if(!selected&&!working.current&&!queue.current.length)current.current=null},[selected])
 useEffect(()=>{const warn=e=>{if(queue.current.length){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[])
 async function drain(){if(working.current)return;working.current=true;setFailure('');onSaving(true)
  try{while(queue.current.length){const item=queue.current[0];if(!item.payload)item.payload={action:'stamp_card',event_id:event.id,card_id:current.current.id,version:current.current.version,operation_id:item.id,...item.op};const data=await api('',item.payload);current.current=data.result;queue.current.shift();acceptCard(data.result);setLiveReady(data.print_ready===true);setPrintError(data.print_ready===false?data.print_error:'');preview();setPending(queue.current.length)}}
  catch(e){setFailure(`${e.message} 未保存の操作が残っています。`)}
  finally{working.current=false;onSaving(queue.current.length>0)}
 }
 function stamp(op){if(!current.current||busy||!active||failure||queue.current.length>=50)return;let card=current.current;for(const item of queue.current)card=apply(card,item.op);const next=apply(card,op);if(next.stamps<0||next.stamps>event.max_stamps)return;setLiveReady(false);setDirectPrint(null);queue.current.push({id:crypto.randomUUID(),op});setPending(queue.current.length);preview();onSaving(true);void drain()}
 async function discardPending(){if(!window.confirm('未保存の操作を取り消し、サーバーの最新状態を取得しますか？'))return;const id=current.current;try{const data=await load(event.id,0,String(id.card_no),true);if(!data.cards.length)throw Error('カードが見つかりません。');queue.current=[];setPending(0);onSaving(false);select(data.cards[0])}catch(e){setFailure(e.message)}}
 async function issueDirectPrint(){await run(async()=>{setDirectPrint(null);const data=await api('',{action:'direct_print',event_id:event.id,card_id:selected.id});setDirectPrint(data)})}
 async function prepare(){await run(async()=>{const data=await api('',{action:'prepare_card',event_id:event.id,card_id:selected.id});setLiveReady(data.print_ready===true);setPrintError(data.print_ready===false?data.print_error:'');if(data.print_ready)message('印刷画像を準備しました。')})}
 // ---- 新デザイン（案B）の表示：左＝カード一覧、中央＝押印、右＝このカード ----
 const unit=event.event_type==='puzzle'?'ピース':'枠'
 const sortedCards=cards
 return <section className={s.reception}>
 <aside className={`${s.panel} ${s.listPanel}`} aria-label="カード">
  <div className={s.row} style={{justifyContent:'space-between'}}><h2>カード</h2><span className={s.small}>{count}枚</span></div>
  <form className={s.row} onSubmit={e=>{e.preventDefault();if(!query.trim())return;run(async()=>{const data=await load(event.id,0,query,true);if(data.cards.length===1)select(data.cards[0]);else message('このイベントに該当する番号はありません。')})}}><input aria-label="カード番号" inputMode="numeric" placeholder="カード番号" disabled={blocked} value={query} onChange={e=>setQuery(e.target.value)}/><button disabled={blocked} className={s.secondary}>探す</button></form>
  {!operator&&query!==''&&<button type="button" className={s.secondary} disabled={blocked} onClick={()=>run(async()=>{setQuery('');await load(event.id,0,'',true)})} style={{alignSelf:'flex-start'}}>全件を表示</button>}
  <div className={s.cardScroll} tabIndex={0} role="region" aria-label="発行済みカード一覧">{sortedCards.map(c=><button type="button" key={c.id} className={`${s.cardItem} ${selected?.id===c.id?s.cardItemActive:''}`} disabled={blocked} aria-label={`カード #${c.card_no} を表示`} aria-current={selected?.id===c.id?'true':undefined} onClick={()=>select(c)}><span><span className={s.cardItemName}>#{c.card_no} {c.display_name||'未登録'}</span><span className={s.cardItemSub}>{c.stamps} / {event.max_stamps}</span></span><span className={s.progress} aria-hidden="true"><span style={{width:`${Math.min(100,Math.round(c.stamps/Math.max(1,event.max_stamps)*100))}%`}}/></span></button>)}{!cards.length&&<p className={s.small}>カードはありません。</p>}</div>
  {!operator&&count>50&&<div className={s.row}><button className={s.secondary} disabled={blocked||page===0} onClick={()=>run(()=>load(event.id,page-1,query,true))}>前へ</button><button className={s.secondary} disabled={blocked||(page+1)*50>=count} onClick={()=>run(()=>load(event.id,page+1,query,true))}>次へ</button></div>}
  <details style={{borderTop:'1px solid #efe7da',paddingTop:8}}><summary>＋ 新しいカードを発行</summary><form onSubmit={e=>{e.preventDefault();run(async()=>{if(!issue.current)issue.current={key:crypto.randomUUID(),name:newName};const data=await api('',{action:'create_card',event_id:event.id,display_name:issue.current.name,issue_key:issue.current.key});issue.current=null;setNewName('');select(data.result);acceptCard(data.result,true);setLiveReady(data.print_ready===true);setPrintError(data.print_ready===false?data.print_error:'');message(`カード #${data.result.card_no} を発行しました。`)})}}><fieldset className={s.fields} disabled={blocked||!active||!event.layout?.background} style={{marginTop:8}}><label>お客様名（任意）<input maxLength={40} value={newName} onChange={e=>setNewName(e.target.value)}/></label><button className={s.button}>カードを発行する</button>{!active&&<span className={s.small}>開催中のイベントだけ発行できます。</span>}</fieldset></form></details>
 </aside>

 <section className={s.operationPanel} aria-label="押印">
 {!selected?<section className={s.panel}><p className={s.empty}>左の一覧からカードを選ぶか、番号で探してください。</p></section>:<>
  <div className={`${s.panel} ${s.cardHead}`}>
   <div><span className={s.small}>カード #{selected.card_no}</span><div className={s.cardName}>{selected.display_name||'氏名未登録'}</div></div>
   <div className={s.row}><span className={s.count}>{selected.stamps} <small>/ {event.max_stamps} {unit}</small></span><span role="status" className={`${s.badge} ${failure?s.badgeDraft:''}`}>{failure?'保存を中断しています':pending?`保存中… 残り${pending}操作`:'保存済み ・ 押すたびに自動保存'}</span></div>
  </div>
  {failure&&<div className={`${s.message} ${s.inlineMessage} ${s.errorMessage}`} role="alert">{failure}<div className={s.row}><button type="button" className={s.button} onClick={()=>void drain()}>未保存操作を再試行</button><button type="button" className={s.secondary} onClick={()=>void discardPending()}>最新状態を取得</button></div></div>}
  {printError&&<div className={`${s.message} ${s.inlineMessage} ${s.errorMessage}`} role="alert">{printError}<div><button className={s.secondary} disabled={blocked} onClick={prepare}>画像を再準備</button></div></div>}
  <section className={s.panel}>
   <h2>{event.event_type==='puzzle'?'お題の達成':event.event_type==='specific'?'押印（場所指定）':'押印'}</h2>
   <p className={s.small}>{event.event_type==='sequential'?'「＋1」で次の枠に押します。押すたびに保存されます。':event.event_type==='puzzle'?'パズルのピース、または下のお題を押すと達成・取消できます（押すたびに保存）。':'台紙の枠、または下の枠名を押すと押印・取消できます（押すたびに保存）。'}{!active?' 開催中ではないため、押印できません。':''}</p>
   <fieldset disabled={busy||!active||!!failure} style={{display:'flex',flexDirection:'column',gap:12}}>
    <div className={s.liveBoard}>{event.event_type==='puzzle'?<PuzzleBoard layout={event.layout} urls={urls} marked={selected.marked_slots||[]} showAll onSelect={i=>stamp({slot_id:slots[i].id,pressed:!(selected.marked_slots||[]).includes(slots[i].id)})} cardNo={selected.card_no} name={selected.display_name}/>:<StampBoard layout={event.layout} urls={urls} marked={selected.marked_slots||[]} showAll={event.event_type==='specific'} cardNo={selected.card_no} name={selected.display_name} onSelect={i=>{if(event.event_type==='specific')stamp({slot_id:slots[i].id,pressed:!(selected.marked_slots||[]).includes(slots[i].id)})}}/>}</div>
    {event.event_type==='sequential'?<div className={`${s.row} ${s.stampActions}`}><button className={s.secondary} disabled={selected.stamps<=0} onClick={()=>stamp({delta:-1})}>−1</button><button className={s.button} disabled={selected.stamps>=event.max_stamps} onClick={()=>stamp({delta:1})}>＋1</button></div>:<div className={s.slotChoices}>{slots.map((slot,i)=>{const on=(selected.marked_slots||[]).includes(slot.id);return <label className={`${s.check} ${on?s.checkOn:''}`} key={slot.id}><input type="checkbox" checked={on} onChange={e=>stamp({slot_id:slot.id,pressed:e.target.checked})}/>{i+1}：{slot.label}</label>})}</div>}
   </fieldset>
  </section>
 </>}
 </section>

 <aside className={`${s.panel} ${s.sidePanel}`} aria-label="このカード">
  <h2>このカード</h2>
  {!selected?<p className={s.small}>カードを選ぶと、お客様名の変更と印刷画像の操作がここに出ます。</p>:<>
  <label>お客様名（空欄でも可）<span className={s.row}><input disabled={blocked} maxLength={40} value={name} onChange={e=>setName(e.target.value)}/><button type="button" className={s.secondary} disabled={blocked||(operator&&!active)} onClick={()=>run(async()=>{const data=await api('',{action:'update_name',event_id:event.id,card_id:selected.id,version:selected.version,display_name:name});select(data.result);acceptCard(data.result);setLiveReady(data.print_ready===true);setPrintError(data.print_ready===false?data.print_error:'');message('氏名を保存しました。')})}>保存</button></span></label>
  <div className={s.printBox}>
   <strong style={{fontSize:13,color:'#22352b'}}>印刷画像（GTA用）</strong>
   <p className={s.small}>期限なしの固定URLです。初めて使う既存カードは「画像を再準備」を押してください。押印のあと、反映まで少し時間がかかる場合があります。</p>
   {!liveReady&&<p role="status" className={s.small}>公開画像の準備を確認してから、URLをコピーしてください。</p>}
   <label>お客様に渡す画像URL<input readOnly value={typeof window==='undefined'?'':new URL(imageUrl,window.location.origin).href} onFocus={e=>e.target.select()}/></label>
   <div className={s.row}><button className={s.button} disabled={blocked||!liveReady} onClick={()=>run(async()=>{await navigator.clipboard.writeText(new URL(imageUrl,window.location.origin).href);message('カード画像URLをコピーしました。')})}>URLをコピー</button>{liveReady&&<a href={imageUrl} target="_blank" rel="noreferrer" style={{fontSize:13}}>PNGを開く</a>}<button className={s.secondary} disabled={blocked} onClick={prepare}>画像を再準備</button></div>
  </div>
  <div className={s.utilityDetails}>
   <details onToggle={e=>setShowPrint(e.currentTarget.open)}><summary>保存済みの画像を見る</summary>{showPrint&&!pending&&liveReady?<img className={s.preview} src={`${imageUrl}?v=${selected.version}-${event.version}`} alt={`カード番号 ${selected.card_no} の保存済み画像`}/>:<p className={s.small}>{pending?'保存が終わると表示します。':'公開画像の準備ができると表示します。'}</p>}</details>
   {!operator&&<details><summary>GTA読み込みの比較テスト</summary><p className={s.small}>比較用に、発行時点のPNGを保存先から取得します。発行時点の画像で固定され、後の押印・氏名変更は反映しません。有効期限は24時間です。</p><button type="button" className={s.secondary} disabled={blocked} onClick={issueDirectPrint}>比較用の直接URLを発行</button>{directPrint&&<><label>比較用の直接画像URL（24時間有効）<input readOnly value={directPrint.direct_url} onFocus={e=>e.target.select()}/></label><div className={s.row}><button type="button" className={s.secondary} disabled={blocked} onClick={()=>run(async()=>{await navigator.clipboard.writeText(directPrint.direct_url);message('比較用URLをコピーしました。')})}>比較用URLをコピー</button><a href={directPrint.direct_url} target="_blank" rel="noreferrer">比較用PNGを開く</a></div><p className={s.small}>有効期限（日本時間）：{new Date(directPrint.expires_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ カード版：{directPrint.card_version}</p></>}<p className={s.small}>テスト用カードで通常URL・比較用URLをそれぞれ印刷し、続けて2〜3回使用してください。比較中は押印・氏名の変更を止めてください。比較用URLはお客様への継続利用には使わないでください。</p><p className={s.small}>旧方式（アプリ経由）の比較用：<a href={`${legacyUrl}?size=original`} target="_blank" rel="noreferrer">元解像度版</a></p></details>}
  </div>
  </>}
 </aside>
 </section>
}
