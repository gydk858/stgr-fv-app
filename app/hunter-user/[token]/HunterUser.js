'use client'
import {useState,useEffect,useRef} from 'react'
import s from '@/app/admin/hunters/desk.module.css'
import { v2FontVariables } from '@/components/v2/fonts'
export default function HunterUser({token}){
 const [card,setCard]=useState(null),[form,setForm]=useState({}),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[image,setImage]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[photoStatus,setPhotoStatus]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');const lock=useRef(false),blob=useRef(null)
 async function api(body){const r=await fetch('/api/hunter-owner',{method:body?'POST':'GET',headers:{'x-hunter-owner':token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined,cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'通信に失敗しました。');return d}
 async function run(f){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await f()}catch(e){setError(e.message)}finally{setBusy(false);lock.current=false}}
 async function load(){const d=await api();setCard(d.card);setForm(d.card);setPhotoStatus(d.card.photo_id?'写真は保存済みです。':'写真なしで保存済みです。');setDirty(false);setRevision(v=>v+1)}
 useEffect(()=>{run(load)},[token])
 useEffect(()=>{if(!card)return;let live=true,url;blob.current=null;setImage('');fetch(`/api/hunter-owner?image=1&page=${page}`,{headers:{'x-hunter-owner':token},cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('画像を取得できませんでした。再読込してください。');return r.blob()}).then(b=>{if(live){blob.current=b;url=URL.createObjectURL(b);setImage(url)}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false;if(url)URL.revokeObjectURL(url)}},[token,page,revision,card?.id])
 const field=(key,max)=>({maxLength:max,value:form[key]||'',onChange:e=>{setForm({...form,[key]:e.target.value});setDirty(true)}})
 // ---- 新デザイン（案B）の表示 ----
 const kpi={display:'flex',flexDirection:'column',borderRadius:14,padding:'14px 18px'}
 const kpiValue={fontFamily:'var(--v2-font-mincho), serif',fontWeight:700,fontSize:24,color:'#22352b'}
 return <div className={v2FontVariables} style={{minHeight:'100vh',background:'#f4efe6'}}>
 <header style={{background:'#22352b',color:'#e9e2d4',padding:'18px 32px',display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12}}>
  <div style={{display:'flex',alignItems:'center',gap:12}}><span aria-hidden="true" style={{width:40,height:40,background:'#b8573f',color:'#fbf6ec',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--v2-font-mincho), serif',fontWeight:700,fontSize:20,borderRadius:10}}>鹿</span><span style={{display:'flex',flexDirection:'column',lineHeight:1.3}}><span style={{fontFamily:'var(--v2-font-latin), serif',fontStyle:'italic',fontSize:18,color:'#dcc79e'}}>Bistro Bambi</span><span style={{fontSize:12,letterSpacing:'0.16em',color:'#c7d1c4'}}>ハンティングクラブ</span></span></div>
  <span style={{fontSize:13,color:'#c7d1c4'}}>あなた専用のページです。URLは人に教えないでください</span>
 </header>
 <main className={s.page} style={{maxWidth:1080,margin:'0 auto',padding:'28px 24px 64px'}}>
  <div className={s.header}><div><span className={s.kicker}>My hunter card</span><h1>マイハンティングカード</h1></div>{card&&<button type="button" disabled={busy} onClick={()=>{if(!dirty||confirm('保存していない編集を破棄しますか？'))run(load)}}>再読込</button>}</div>
  {(error||message)&&<div className={s.alerts}>{error&&<p className={`${s.notice} ${s.error}`} role="alert" style={{margin:0}}>{error}</p>}{message&&<p className={s.notice} role="status" style={{margin:0}}>{message}</p>}</div>}
  {!card&&!error&&<div className={s.panel}><p className={s.muted}>読み込み中です…</p></div>}
  {card&&<>
  <section aria-label="あなたの記録" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:12}}>
   <div style={{...kpi,background:'#22352b'}}><span style={{fontSize:12,color:'#c7d1c4'}}>ハンター番号</span><span style={{...kpiValue,color:'#e4d1a6'}}>No. {card.hunter_no}</span></div>
   <div style={{...kpi,background:'#fffdf9',border:'1px solid #e4dacb'}}><span className={s.muted}>ランク</span><span style={kpiValue}>{card.rank?`HR ${card.rank}`:'未設定'}</span></div>
   <div style={{...kpi,background:'#fffdf9',border:'1px solid #e4dacb'}}><span className={s.muted}>討伐数</span><span style={kpiValue}>{Number(card.kills||0).toLocaleString('ja-JP')} <span style={{fontSize:14}}>頭</span></span></div>
   <div style={{...kpi,background:'#fffdf9',border:'1px solid #e4dacb'}}><span className={s.muted}>受注クエスト</span><span style={{fontSize:14,fontWeight:700,color:'#22352b',whiteSpace:'pre-wrap'}}>{card.mission||'未設定'}</span></div>
  </section>

  <div style={{display:'flex',flexWrap:'wrap',gap:20,alignItems:'flex-start'}}>
   <section className={s.panel} style={{flex:'1 1 420px'}} aria-label="カード">
    <h2>カード</h2>
    <div className={s.imageBox}>{image?<img className={s.card} src={image} alt="ハンティングカード" style={{maxHeight:'none'}}/>:<p className={s.muted} style={{padding:16}}>画像を準備しています…</p>}</div>
    <div className={s.row} style={{margin:0}}><button className={s.primary} disabled={busy||!image} onClick={()=>run(async()=>{if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('この環境では画像コピーを利用できません。「PNGを保存」をお使いください。');try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob.current})])}catch{throw Error('画像コピーが許可されませんでした。ブラウザの権限を確認するか「PNGを保存」をお使いください。')}setMessage('表示中の画像をコピーしました。')})} style={{minHeight:40,fontSize:14}}>画像をコピー</button>{image&&<a href={image} download={`hunter-${card.hunter_no}-${page}.png`} style={{display:'inline-flex',alignItems:'center',minHeight:40,padding:'0 16px',border:'1px solid #d8ccb6',borderRadius:10,background:'#faf6ee',fontSize:14,textDecoration:'none'}}>PNGを保存</a>}</div>
    <p className={s.muted}>{dirty?'編集中です。画像には保存済みの内容を表示しています。':'保存済みの内容を表示しています。'}</p>
    <div className={s.publishBox}><strong style={{fontSize:13,color:'#22352b'}}>GTAで使う画像を新しくする</strong><p className={s.muted}>プロフィールを保存したあとに押してください。反映まで約60秒かかる場合があります。</p><button style={{minHeight:42,background:'#22352b',color:'#fbf6ec',border:0,fontWeight:700,fontSize:14}} disabled={busy||dirty} onClick={()=>run(async()=>{const d=await api({action:'prepare'});if(!d.print_ready)throw Error(d.print_error||'画像を更新できませんでした。');setMessage('印刷画像を更新しました。GTAへの反映には約60秒かかる場合があります。')})}>印刷画像へ反映</button></div>
   </section>

   <section className={s.panel} style={{flex:'1 1 360px'}} aria-label="プロフィールを編集">
    <h2>プロフィールを編集</h2>
    {dirty&&<span className={`${s.pill}`} style={{alignSelf:'flex-start',background:'#f4ede0',color:'#6a4a12'}}>編集中 ・ 画像は保存済みの内容のままです</span>}
    <form onSubmit={e=>{e.preventDefault();run(async()=>{const d=await api({version:card.version,operation_id:crypto.randomUUID(),tag:form.tag,display_name:form.display_name,bio:form.bio,photo_id:form.photo_id});setCard(d.card);setForm(d.card);setPhotoStatus(d.card.photo_id?'写真は保存済みです。':'写真なしで保存済みです。');setDirty(false);setRevision(v=>v+1);setMessage('プロフィールを保存しました。GTA用画像は「印刷画像へ反映」を押して更新してください。')})}}><fieldset disabled={busy} style={{display:'flex',flexDirection:'column',gap:12}}>
     <label>ハンタータグ<input {...field('tag',24)}/><span className={s.muted} style={{fontWeight:400}}>24文字まで</span></label>
     <label>名前（任意）<input {...field('display_name',40)}/><span className={s.muted} style={{fontWeight:400}}>40文字まで</span></label>
     <label>自己紹介<textarea {...field('bio',160)}/><span className={s.muted} style={{fontWeight:400}}>160文字まで</span></label>
     <label>写真（2MB以下）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files[0];e.target.value='';if(!f)return;run(async()=>{setPhotoStatus('写真を読み込んでいます…');try{const fd=new FormData();fd.set('file',f);const d=await api(fd);setForm({...form,photo_id:d.asset.id});setDirty(true);setPhotoStatus('写真を読み込みました。「プロフィールを保存」で反映してください。')}catch(e){setPhotoStatus('写真を読み込めませんでした。'+e.message);throw e}})}}/>{photoStatus&&<span className={s.photoStatus} role="status" aria-live="polite">{photoStatus}</span>}</label>
     {form.photo_id&&<div><button type="button" onClick={()=>{setForm({...form,photo_id:null});setPhotoStatus('写真を外しました。「プロフィールを保存」で反映してください。');setDirty(true)}} style={{background:'transparent',color:'#b8573f',borderColor:'#e3c2b8'}}>写真を外す</button></div>}
     <p className={s.muted}>写真は中央を縦長に切り抜きます。</p>
     <button className={s.primary} disabled={!dirty} style={{minHeight:46,fontSize:15}}>プロフィールを保存</button>
     <p className={s.muted}>ランク・受注クエスト・狩猟の記録は、お店が管理します。</p>
    </fieldset></form>
   </section>
  </div>
  </>}
 </main>
 </div>
}
