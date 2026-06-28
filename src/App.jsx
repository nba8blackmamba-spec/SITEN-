import { useState, useMemo, useRef, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, query, orderBy } from "firebase/firestore";

// ── 定数 ────────────────────────────────────────────────
const SEATS = 4;
const ADMINS = [
  {pass:"3561212", name:"店長"},
  {pass:"3561213", name:"スタッフA"},
  {pass:"3561214", name:"スタッフB"},
];
const TABLES = [
  {id:1,label:"1卓"},{id:2,label:"2卓"},{id:3,label:"3卓"},
  {id:4,label:"4卓"},{id:5,label:"5卓"},{id:6,label:"6卓"},
];
const COURSES = [
  {id:"health",label:"健康麻雀",price:"3時間 ¥2,000",unit:2000,desc:"賭けなし・のんびり楽しむ"},
  {id:"labo",  label:"ラボ",    price:"1シート ¥4,000",unit:4000,desc:"戦術研究・本格競技"},
];
const TIME_SLOTS = ["12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00"];
const TAGS_PRESET = ["常連","初心者","VIP","要対応","初来店"];
const WEEKDAYS = ["日","月","火","水","木","金","土"];
const TODAY = new Date();
const fmt  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const disp = (s) => { const d=new Date(s+"T00:00:00"); return `${d.getMonth()+1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`; };
const dispShort = (s) => { const d=new Date(s+"T00:00:00"); return `${d.getMonth()+1}/${d.getDate()}`; };
const uid  = () => Math.random().toString(36).slice(2,8).toUpperCase();
const maxDate = () => { const d=new Date(TODAY); d.setDate(d.getDate()+60); return fmt(d); };
const getDates = (n=14) => { const arr=[]; for(let i=0;i<n;i++){const d=new Date(TODAY);d.setDate(d.getDate()+i);arr.push(fmt(d));} return arr; };
const addDays = (dateStr,n) => { const d=new Date(dateStr+"T00:00:00"); d.setDate(d.getDate()+n); return fmt(d); };
const daysBetween = (d1,d2) => Math.round((new Date(d2+"T00:00:00")-new Date(d1+"T00:00:00"))/86400000);

// ── バリデーション ──────────────────────────────────────
const validateName = (v) => {
  if(!v.trim()) return "お名前を入力してください";
  if(v.trim().length < 2) return "2文字以上で入力してください";
  if(/^[0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\s]+$/.test(v.trim())) return "正しいお名前を入力してください";
  return null;
};
const validatePhone = (v) => {
  const d = v.replace(/[-\s]/g,"");
  if(!/^\d+$/.test(d)) return "数字で入力してください";
  if(d.length<10||d.length>11) return "10〜11桁で入力してください";
  if(!/^0\d{9,10}$/.test(d)) return "正しい電話番号を入力してください（例: 090-1234-5678）";
  return null;
};

// ── カラー ──────────────────────────────────────────────
const C = {
  bg:"#F0F4F8",surface:"#FFFFFF",card:"#FFFFFF",border:"#D9E2EC",
  gold:"#1565C0",goldL:"#1E88E5",green:"#2ECC71",red:"#E74C3C",
  orange:"#F5B400",blue:"#1565C0",purple:"#9B6BE8",text:"#1A2B3C",muted:"#7A8A9A",white:"#FFFFFF",
};

// ── スタイル ─────────────────────────────────────────────
const F   = {fontFamily:"'Hiragino Kaku Gothic Pro','Yu Gothic',sans-serif",boxSizing:"border-box"};
const inp = {...F,width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"9px 11px",color:C.text,fontSize:14,outline:"none"};
const sel = {...inp,cursor:"pointer"};
const crd = {background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:18,marginBottom:14,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"};
const rw  = {display:"flex",gap:10,flexWrap:"wrap"};
const lbl = {fontSize:11,color:C.muted,marginBottom:5,display:"block"};
const tag = {fontSize:11,fontWeight:700,color:C.gold,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:16};
const btn = (v="primary",sm=false) => ({
  padding:sm?"6px 12px":"10px 22px",borderRadius:6,border:"none",cursor:"pointer",
  fontSize:sm?12:14,fontWeight:700,
  background:v==="primary"?C.gold:v==="danger"?C.red:v==="blue"?C.blue:v==="green"?C.green:C.border,
  color:v==="primary"?C.white:C.white,
});
const chip = (a) => ({
  padding:"10px 16px",borderRadius:8,border:`1px solid ${a?C.gold:C.border}`,
  background:a?`${C.gold}20`:"transparent",color:a?C.goldL:C.muted,
  cursor:"pointer",fontSize:13,fontWeight:a?700:400,flex:1,transition:"all 0.15s",
});
const tCard = (a,ok) => ({
  padding:"11px 6px",borderRadius:8,border:`1.5px solid ${a?C.gold:ok?C.border:C.red+"66"}`,
  background:a?`${C.gold}18`:ok?C.surface:`${C.red}08`,
  cursor:ok?"pointer":"not-allowed",textAlign:"center",transition:"all 0.15s",opacity:ok?1:0.5,
});
const bdg = (c) => ({
  display:"inline-block",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:700,
  background:c==="green"?`${C.green}22`:c==="red"?`${C.red}22`:c==="blue"?`${C.blue}22`:c==="orange"?`${C.orange}22`:c==="purple"?`${C.purple}22`:c==="muted"?`${C.muted}22`:`${C.gold}22`,
  color:c==="green"?C.green:c==="red"?C.red:c==="blue"?C.blue:c==="orange"?C.orange:c==="purple"?C.purple:c==="muted"?C.muted:C.gold,
});
const statusInfo = (s) => ({
  confirmed:{label:"予約確定",color:"green"},
  waitlist: {label:"キャンセル待ち",color:"blue"},
  cancelled:{label:"キャンセル",color:"red"},
}[s]||{label:s,color:"muted"});

// ════════════════════════════════════════════════════════
export default function App() {
  const [mode,      setMode]     = useState("customer");
  const [tab,       setTab]      = useState("book");
  const [adminTab,  setAdminTab] = useState("today");
  const [profile,   setProfileLocal]  = useState(() => {
    try {
      const saved = localStorage.getItem("siten_profile");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const setProfile = (p) => {
    setProfileLocal(p);
    try {
      if (p) localStorage.setItem("siten_profile", JSON.stringify(p));
      else localStorage.removeItem("siten_profile");
    } catch {}
  };

  const [rsvList,   setRsvListLocal]  = useState([]);
  const [dbReady,   setDbReady]  = useState(false);

  useEffect(() => {
    const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      setRsvListLocal(list);
      setDbReady(true);
    }, (err) => {
      console.error("Firestore読み込みエラー:", err);
      setDbReady(true);
    });
    return () => unsub();
  }, []);

  const setRsvList = (updater) => {
    const newList = typeof updater === "function" ? updater(rsvList) : updater;
    const prevMap = new Map(rsvList.map(r => [r.id, r]));
    newList.forEach(r => {
      const prev = prevMap.get(r.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(r)) {
        setDoc(doc(db, "reservations", r.id), r).catch(e => console.error("保存エラー:", e));
      }
    });
  };

  const [toast,     setToast]    = useState(null);
  const [editing,   setEditing]  = useState(null);
  const [adminAuth, setAdminAuth]= useState(false);
  const [adminName, setAdminName]= useState("");

  const [closedDays,setClosedDaysLocal]= useState([]);
  const [closedWeekdays,setClosedWeekdaysLocal]=useState([]);
  const [cancelDeadlineHours,setCancelDeadlineHoursLocal]=useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "store"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setClosedDaysLocal(data.closedDays || []);
        setClosedWeekdaysLocal(data.closedWeekdays || []);
        setCancelDeadlineHoursLocal(data.cancelDeadlineHours || 0);
      }
    }, (err) => console.error("設定読み込みエラー:", err));
    return () => unsub();
  }, []);

  const saveSettings = (partial) => {
    setDoc(doc(db, "settings", "store"), {
      closedDays, closedWeekdays, cancelDeadlineHours, ...partial,
    }, { merge: true }).catch(e => console.error("設定保存エラー:", e));
  };
  const setClosedDays = (updater) => {
    const v = typeof updater === "function" ? updater(closedDays) : updater;
    setClosedDaysLocal(v); saveSettings({ closedDays: v });
  };
  const setClosedWeekdays = (updater) => {
    const v = typeof updater === "function" ? updater(closedWeekdays) : updater;
    setClosedWeekdaysLocal(v); saveSettings({ closedWeekdays: v });
  };
  const setCancelDeadlineHours = (v) => {
    setCancelDeadlineHoursLocal(v); saveSettings({ cancelDeadlineHours: v });
  };

  const flash = (msg,ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),2800); };

  const isClosedDate = (date) => {
    if(closedDays.includes(date)) return true;
    const wd = new Date(date+"T00:00:00").getDay();
    return closedWeekdays.includes(wd);
  };

  const bookedCount = (tid,date,time,skip=null) =>
    rsvList.filter(r=>r.tableId===tid&&r.date===date&&r.time===time&&r.status==="confirmed"&&!r.finished&&r.id!==skip)
           .reduce((s,r)=>s+r.people,0);
  const seatsLeft  = (tid,date,time,skip=null) => SEATS - bookedCount(tid,date,time,skip);
  const isOccupied = (tid,date,time,skip=null) => seatsLeft(tid,date,time,skip)<=0;

  // 同一人物が同日に確定済み予約を持っているか
  const hasDuplicate = (phone,date,skip=null) =>
    rsvList.some(r=>r.phone===phone&&r.date===date&&r.status!=="cancelled"&&r.id!==skip);

  // キャンセル可否（期限チェック）
  const canCancel = (rsv) => {
    if(cancelDeadlineHours<=0) return true;
    const target = new Date(`${rsv.date}T${rsv.time}:00`);
    const now = new Date();
    return (target-now)/3600000 >= cancelDeadlineHours;
  };

  const waitlistRank = (id) => {
    const r=rsvList.find(x=>x.id===id);
    if(!r||r.status!=="waitlist") return null;
    const list=rsvList.filter(x=>x.status==="waitlist"&&x.tableId===r.tableId&&x.date===r.date&&x.time===r.time)
                      .sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    return list.findIndex(x=>x.id===id)+1;
  };

  const promoteWaitlist = (list,date,time,tableId) => {
    const waiting=list.filter(r=>r.status==="waitlist"&&r.date===date&&r.time===time&&r.tableId===tableId)
                      .sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    let updated=[...list];
    for(const w of waiting){
      const left=SEATS-updated.filter(r=>r.tableId===tableId&&r.date===date&&r.time===time&&r.status==="confirmed"&&!r.finished).reduce((s,r)=>s+r.people,0);
      if(left>=w.people){updated=updated.map(r=>r.id===w.id?{...r,status:"confirmed"}:r);break;}
    }
    return updated;
  };

  const handleBook = (rsv) => {
    if(!profile) setProfile({name:rsv.name,phone:rsv.phone});
    if(rsv.repeatWeeks>1){
      // 定期予約：複数件まとめて作成
      let list=[...rsvList];
      let createdCount=0, waitCount=0;
      for(let i=0;i<rsv.repeatWeeks;i++){
        const d = addDays(rsv.date, i*7);
        if(isClosedDate(d)) continue;
        const left = SEATS - list.filter(r=>r.tableId===rsv.tableId&&r.date===d&&r.time===rsv.time&&r.status==="confirmed"&&!r.finished).reduce((s,r)=>s+r.people,0);
        const status = left>=rsv.people ? "confirmed" : "waitlist";
        list = [{...rsv,id:uid(),date:d,status,createdAt:new Date().toISOString(),memo:"",tags:rsv.tags||[],checkedIn:false,noShow:false,finished:false},...list];
        status==="confirmed" ? createdCount++ : waitCount++;
      }
      setRsvList(list);
      flash(`定期予約：確定${createdCount}件${waitCount>0?`／待ち${waitCount}件`:""} ✓`);
    } else {
      const left=seatsLeft(rsv.tableId,rsv.date,rsv.time);
      const status=left>=rsv.people?"confirmed":"waitlist";
      setRsvList(p=>[{...rsv,status,createdAt:new Date().toISOString(),memo:"",tags:rsv.tags||[],checkedIn:false,noShow:false,finished:false},...p]);
      flash(status==="confirmed"?"予約が確定しました ✓":"キャンセル待ちで登録しました");
    }
    setTab("list");
  };
  const handleCancel = (id) => {
    const rsv=rsvList.find(r=>r.id===id);
    const next=rsvList.map(r=>r.id===id?{...r,status:"cancelled"}:r);
    setRsvList(rsv?promoteWaitlist(next,rsv.date,rsv.time,rsv.tableId):next);
    flash("キャンセルしました");
  };
  const handleUpdate = (rsv) => { setRsvList(p=>p.map(r=>r.id===rsv.id?rsv:r)); setEditing(null); flash("変更しました ✓"); };
  const adminCancel  = (id) => {
    const rsv=rsvList.find(r=>r.id===id);
    const next=rsvList.map(r=>r.id===id?{...r,status:"cancelled"}:r);
    setRsvList(rsv?promoteWaitlist(next,rsv.date,rsv.time,rsv.tableId):next);
    flash("キャンセルしました");
  };
  const adminUpdate  = (rsv) => setRsvList(p=>p.map(r=>r.id===rsv.id?rsv:r));

  const activeCount=rsvList.filter(r=>r.status==="confirmed").length;
  const ADMIN_TABS=[["today","今日"],["list","予約一覧"],["calendar","カレンダー"],["sales","売上"],["regulars","常連"],["settings","設定"]];

  if (!dbReady) {
    return (
      <div style={{...F,background:C.bg,minHeight:"100vh",color:C.text,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
        <div style={{width:34,height:34,background:C.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:C.blue,border:`2px solid ${C.blue}`}}>SI</div>
        <div style={{fontSize:13,color:C.muted}}>読み込み中...</div>
      </div>
    );
  }

  return (
    <div style={{...F,background:C.bg,minHeight:"100vh",color:C.text}}>
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,background:C.orange,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:C.blue,border:`2px solid ${C.blue}`}}>SI</div>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text,letterSpacing:"0.14em"}}>SITEN</div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:"0.14em"}}>MAHJONG SALON</div>
          </div>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
          {mode==="customer"?(
            <>
              {[["book","予約する"],["list",`予約一覧${activeCount>0?` (${activeCount})`:""}`]].map(([k,l])=>(
                <button key={k} onClick={()=>setTab(k)} style={{padding:"7px 13px",borderRadius:6,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:tab===k?C.gold:"transparent",color:tab===k?C.white:C.muted}}>{l}</button>
              ))}
              <button onClick={()=>setMode("admin")} style={{padding:"7px 13px",borderRadius:6,border:`1px solid ${C.border}`,cursor:"pointer",fontSize:12,background:"transparent",color:C.muted,marginLeft:4}}>店舗管理</button>
            </>
          ):(
            <>
              {ADMIN_TABS.map(([k,l])=>(
                <button key={k} onClick={()=>setAdminTab(k)} style={{padding:"7px 11px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:adminTab===k?C.gold:"transparent",color:adminTab===k?C.white:C.muted}}>{l}</button>
              ))}
              <button onClick={()=>setMode("customer")} style={{padding:"7px 11px",borderRadius:6,border:`1px solid ${C.border}`,cursor:"pointer",fontSize:12,background:"transparent",color:C.muted,marginLeft:4}}>← 客側</button>
            </>
          )}
        </div>
      </header>

      <main style={{maxWidth:980,margin:"0 auto",padding:"24px 16px"}}>
        {mode==="customer"&&(
          <>
            {tab==="book"&&!profile&&<ProfileSetup onDone={setProfile}/>}
            {tab==="book"&&profile&&<BookForm profile={profile} onProfileReset={()=>setProfile(null)} onSubmit={handleBook} isOccupied={isOccupied} seatsLeft={seatsLeft} rsvList={rsvList} isClosedDate={isClosedDate} hasDuplicate={hasDuplicate}/>}
            {tab==="list"&&profile&&<ReservationList rsvList={rsvList.filter(r=>r.phone===profile.phone)} onCancel={handleCancel} onEdit={setEditing} waitlistRank={waitlistRank} seatsLeft={seatsLeft} canCancel={canCancel} cancelDeadlineHours={cancelDeadlineHours}/>}
            {tab==="list"&&!profile&&<ProfileSetup onDone={setProfile}/>}
          </>
        )}
        {mode==="admin"&&(
          adminAuth
            ?<AdminArea
                tab={adminTab} rsvList={rsvList} onCancel={adminCancel} onUpdate={adminUpdate} waitlistRank={waitlistRank} seatsLeft={seatsLeft}
                adminName={adminName}
                closedDays={closedDays} setClosedDays={setClosedDays}
                closedWeekdays={closedWeekdays} setClosedWeekdays={setClosedWeekdays}
                cancelDeadlineHours={cancelDeadlineHours} setCancelDeadlineHours={setCancelDeadlineHours}
              />
            :<AdminLogin onAuth={(name)=>{setAdminAuth(true);setAdminName(name);}}/>
        )}
      </main>

      {editing&&<EditModal rsv={editing} isOccupied={isOccupied} seatsLeft={seatsLeft} onSave={handleUpdate} onClose={()=>setEditing(null)}/>}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.ok?C.green:C.red,color:"#fff",padding:"11px 22px",borderRadius:8,fontWeight:700,fontSize:14,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",whiteSpace:"nowrap"}}>{toast.msg}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 管理エリア ルーター
// ════════════════════════════════════════════════════════
function AdminArea({tab,rsvList,onCancel,onUpdate,waitlistRank,seatsLeft,adminName,closedDays,setClosedDays,closedWeekdays,setClosedWeekdays,cancelDeadlineHours,setCancelDeadlineHours}){
  if(tab==="today")    return <AdminToday    rsvList={rsvList} onCancel={onCancel} onUpdate={onUpdate} waitlistRank={waitlistRank} adminName={adminName}/>;
  if(tab==="list")     return <AdminList     rsvList={rsvList} onCancel={onCancel} onUpdate={onUpdate} waitlistRank={waitlistRank}/>;
  if(tab==="calendar") return <AdminCalendar rsvList={rsvList}/>;
  if(tab==="sales")    return <AdminSales    rsvList={rsvList}/>;
  if(tab==="regulars") return <AdminRegulars rsvList={rsvList}/>;
  if(tab==="settings") return <AdminSettings closedDays={closedDays} setClosedDays={setClosedDays} closedWeekdays={closedWeekdays} setClosedWeekdays={setClosedWeekdays} cancelDeadlineHours={cancelDeadlineHours} setCancelDeadlineHours={setCancelDeadlineHours}/>;
  return null;
}

// ── 管理ログイン ─────────────────────────────────────────
function AdminLogin({onAuth}){
  const [pw,setPw]=useState(""); const [err,setErr]=useState("");
  const submit=()=>{
    const found=ADMINS.find(a=>a.pass===pw);
    if(found){onAuth(found.name);}else{setErr("パスワードが違います");}
  };
  return(
    <div style={{maxWidth:360,margin:"60px auto"}}>
      <div style={tag}>店舗管理ログイン</div>
      <div style={crd}>
        <span style={lbl}>パスワード</span>
        <input type="password" style={inp} placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
        {err&&<div style={{color:C.red,fontSize:12,marginTop:8}}>⚠ {err}</div>}
        <button style={{...btn("primary"),marginTop:14}} onClick={submit}>ログイン</button>
      </div>
    </div>
  );
}

// ── 管理：今日のサマリー ─────────────────────────────────
function AdminToday({rsvList,onCancel,onUpdate,waitlistRank,adminName}){
  const todayStr=fmt(TODAY);
  const todayRsvs=rsvList.filter(r=>r.date===todayStr);
  const confirmed=todayRsvs.filter(r=>r.status==="confirmed");
  const waiting  =todayRsvs.filter(r=>r.status==="waitlist");
  const checkedIn=confirmed.filter(r=>r.checkedIn);
  const totalPeople=confirmed.reduce((s,r)=>s+r.people,0);
  const revenue=confirmed.reduce((s,r)=>{
    const c=COURSES.find(x=>x.id===r.course); return s+(c?c.unit*r.people:0);
  },0);
  const occupiedTables=new Set(confirmed.map(r=>r.tableId)).size;

  const stats=[
    {label:"本日の予約",value:`${confirmed.length}件`,sub:`${totalPeople}名`,color:C.green},
    {label:"来店済み",value:`${checkedIn.length}名`,sub:`未来店 ${totalPeople-checkedIn.length}名`,color:C.blue},
    {label:"使用卓",value:`${occupiedTables} / ${TABLES.length}卓`,sub:`残り ${TABLES.length-occupiedTables}卓`,color:C.gold},
    {label:"待ち人数",value:`${waiting.length}件`,sub:`キャンセル待ち`,color:waiting.length>0?C.orange:C.muted},
    {label:"本日売上（予想）",value:`¥${revenue.toLocaleString()}`,sub:"確定予約ベース",color:C.purple},
  ];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:6}}>
        <div style={tag}>今日のサマリー — {disp(todayStr)}</div>
        {adminName&&<div style={{fontSize:12,color:C.muted}}>ログイン中: <span style={{color:C.gold,fontWeight:700}}>{adminName}</span></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:20}}>
        {stats.map(s=>(
          <div key={s.label} style={{...crd,marginBottom:0,borderLeft:`3px solid ${s.color}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{s.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>本日の予約一覧</div>
      {confirmed.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:C.muted}}>本日の予約はありません</div>}
      {[...confirmed].sort((a,b)=>a.time.localeCompare(b.time)).map(r=>(
        <AdminCard key={r.id} rsv={r} onCancel={onCancel} onUpdate={onUpdate} rank={waitlistRank(r.id)} showCheckin/>
      ))}
      {waiting.length>0&&(
        <>
          <div style={{fontSize:13,fontWeight:700,color:C.blue,marginTop:16,marginBottom:10}}>キャンセル待ち</div>
          {waiting.map(r=><AdminCard key={r.id} rsv={r} onCancel={onCancel} onUpdate={onUpdate} rank={waitlistRank(r.id)}/>)}
        </>
      )}
    </div>
  );
}

// ── CSV出力 ──────────────────────────────────────────────
function exportCSV(rsvList){
  const headers=["ID","名前","電話番号","日付","時間","卓","コース","人数","ステータス","ノーショー","タグ","メモ","作成日時"];
  const rows=rsvList.map(r=>{
    const table=TABLES.find(t=>t.id===r.tableId);
    const course=COURSES.find(c=>c.id===r.course);
    const st=statusInfo(r.status);
    return [r.id,r.name,r.phone,r.date,r.time,table?.label||"",course?.label||"",r.people,st.label,r.noShow?"はい":"いいえ",(r.tags||[]).join("/"),r.memo||"",r.createdAt].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",");
  });
  const csv="\uFEFF"+[headers.join(","),...rows].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`siten_予約データ_${fmt(TODAY)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── 管理：予約一覧 ───────────────────────────────────────
function AdminList({rsvList,onCancel,onUpdate,waitlistRank}){
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [sortBy,setSortBy]=useState("created_desc");
  const filters=[{k:"all",l:"すべて"},{k:"confirmed",l:"確定"},{k:"waitlist",l:"待ち"},{k:"cancelled",l:"キャンセル"},{k:"noshow",l:"ノーショー"}];
  const shown=rsvList.filter(r=>{
    if(filter==="noshow"){ if(!r.noShow) return false; }
    else if(filter!=="all"&&r.status!==filter) return false;
    if(search&&!r.name.includes(search)&&!r.phone.includes(search)&&!r.id.includes(search)) return false;
    return true;
  });
  const sortFns={
    created_desc:(a,b)=>new Date(b.createdAt)-new Date(a.createdAt),
    created_asc: (a,b)=>new Date(a.createdAt)-new Date(b.createdAt),
    date_asc:    (a,b)=>(a.date+a.time).localeCompare(b.date+b.time),
    date_desc:   (a,b)=>(b.date+b.time).localeCompare(a.date+a.time),
    people_desc: (a,b)=>b.people-a.people,
    name_asc:    (a,b)=>a.name.localeCompare(b.name,"ja"),
  };
  const sorted=[...shown].sort(sortFns[sortBy]);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:8}}>
        <div style={tag}>予約一覧</div>
        <button style={btn("secondary",true)} onClick={()=>exportCSV(rsvList)}>📥 CSVダウンロード</button>
      </div>
      <div style={{...rw,marginBottom:14,alignItems:"center"}}>
        <div style={{flex:1,minWidth:160}}>
          <input style={inp} placeholder="名前・電話番号・IDで検索" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select style={{...sel,minWidth:140,flex:"0 0 auto"}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="created_desc">登録が新しい順</option>
          <option value="created_asc">登録が古い順</option>
          <option value="date_asc">予約日が近い順</option>
          <option value="date_desc">予約日が遠い順</option>
          <option value="people_desc">人数が多い順</option>
          <option value="name_asc">名前順</option>
        </select>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {filters.map(f=>(
            <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${filter===f.k?C.gold:C.border}`,background:filter===f.k?`${C.gold}20`:"transparent",color:filter===f.k?C.goldL:C.muted,cursor:"pointer",fontSize:12,fontWeight:filter===f.k?700:400}}>{f.l}</button>
          ))}
        </div>
      </div>
      {sorted.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.muted}}>該当する予約がありません</div>}
      {sorted.map(r=><AdminCard key={r.id} rsv={r} onCancel={onCancel} onUpdate={onUpdate} rank={waitlistRank(r.id)}/>)}
    </div>
  );
}

// ── 管理：共通カード ─────────────────────────────────────
function AdminCard({rsv,onCancel,onUpdate,rank,showCheckin}){
  const [confirm,setConfirm]=useState(false);
  const [editMemo,setEditMemo]=useState(false);
  const [memo,setMemo]=useState(rsv.memo||"");
  const course=COURSES.find(c=>c.id===rsv.course); const table=TABLES.find(t=>t.id===rsv.tableId);
  const st=statusInfo(rsv.status); const isDone=rsv.status==="cancelled";
  const borderCol=rsv.finished?C.muted:rsv.status==="confirmed"?C.green:rsv.status==="waitlist"?C.blue:C.border;
  const isPast = new Date(`${rsv.date}T${rsv.time}:00`) < new Date();

  const saveMemo=()=>{ onUpdate({...rsv,memo}); setEditMemo(false); };
  const toggleTag=(t)=>{ const tags=rsv.tags||[]; onUpdate({...rsv,tags:tags.includes(t)?tags.filter(x=>x!==t):[...tags,t]}); };
  const toggleCheckin=()=>onUpdate({...rsv,checkedIn:!rsv.checkedIn});
  const toggleNoShow=()=>onUpdate({...rsv,noShow:!rsv.noShow});
  const toggleFinished=()=>onUpdate({...rsv,finished:!rsv.finished});

  return(
    <div style={{...crd,opacity:isDone||rsv.finished?0.55:1,borderLeft:`3px solid ${rsv.noShow?C.red:borderCol}`,marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div style={{flex:1,minWidth:220}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:700}}>{rsv.name} 様　{rsv.people}名</span>
            <span style={bdg(st.color)}>{st.label}</span>
            {rank&&<span style={bdg("blue")}>{rank}番待ち</span>}
            {rsv.checkedIn&&!rsv.finished&&<span style={bdg("purple")}>来店済み</span>}
            {rsv.finished&&<span style={bdg("muted")}>利用終了・卓解放済み</span>}
            {rsv.noShow&&<span style={bdg("red")}>ノーショー</span>}
          </div>
          <div style={{fontSize:13,color:C.muted}}>📅 {disp(rsv.date)}　🕐 {rsv.time}〜　🀄 {table?.label}　📋 {course?.label}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>ID: {rsv.id} · {rsv.phone}</div>
          {/* タグ */}
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>
            {TAGS_PRESET.map(t=>(
              <span key={t} onClick={()=>!isDone&&toggleTag(t)} style={{padding:"2px 8px",borderRadius:4,fontSize:11,cursor:isDone?"default":"pointer",border:`1px solid ${(rsv.tags||[]).includes(t)?C.gold:C.border}`,background:(rsv.tags||[]).includes(t)?`${C.gold}22`:"transparent",color:(rsv.tags||[]).includes(t)?C.gold:C.muted}}>
                {t}
              </span>
            ))}
          </div>
          {/* メモ */}
          <div style={{marginTop:8}}>
            {editMemo?(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input style={{...inp,fontSize:12,padding:"5px 8px"}} value={memo} onChange={e=>setMemo(e.target.value)} placeholder="メモを入力"/>
                <button style={btn("primary",true)} onClick={saveMemo}>保存</button>
                <button style={btn("secondary",true)} onClick={()=>setEditMemo(false)}>×</button>
              </div>
            ):(
              <div onClick={()=>!isDone&&setEditMemo(true)} style={{fontSize:12,color:rsv.memo?C.text:C.muted,cursor:isDone?"default":"pointer",padding:"3px 0",borderBottom:`1px dashed ${isDone?"transparent":C.border}`}}>
                {rsv.memo||"メモを追加..."}
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-start"}}>
          {showCheckin&&rsv.status==="confirmed"&&!rsv.finished&&(
            <button style={btn(rsv.checkedIn?"secondary":"green",true)} onClick={toggleCheckin}>
              {rsv.checkedIn?"来店取消":"来店チェック"}
            </button>
          )}
          {rsv.status==="confirmed"&&!rsv.finished&&(
            <button style={btn("blue",true)} onClick={toggleFinished}>
              利用終了（卓を解放）
            </button>
          )}
          {rsv.finished&&(
            <button style={btn("secondary",true)} onClick={toggleFinished}>
              終了を取消
            </button>
          )}
          {isPast&&rsv.status==="confirmed"&&!rsv.checkedIn&&!rsv.finished&&(
            <button style={btn(rsv.noShow?"secondary":"danger",true)} onClick={toggleNoShow}>
              {rsv.noShow?"NS取消":"ノーショー登録"}
            </button>
          )}
          {!isDone&&!rsv.finished&&(
            confirm
              ?<button style={btn("danger",true)} onClick={()=>{onCancel(rsv.id);setConfirm(false);}}>本当にキャンセル</button>
              :<button style={btn("secondary",true)} onClick={()=>setConfirm(true)}>キャンセル</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 管理：カレンダー ─────────────────────────────────────
function AdminCalendar({rsvList}){
  const dates=getDates();
  const [selDate,setSelDate]=useState(fmt(TODAY));
  const cellColor=(date)=>{
    const c=rsvList.filter(r=>r.date===date&&r.status==="confirmed").length;
    const w=rsvList.filter(r=>r.date===date&&r.status==="waitlist").length;
    if(c>0&&w>0) return C.orange;
    if(c>0) return C.green;
    return C.border;
  };
  return(
    <div>
      <div style={tag}>カレンダー</div>
      <div style={{display:"flex",gap:6,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
        {dates.map(d=>{
          const col=cellColor(d); const isToday=d===fmt(TODAY);
          return(
            <div key={d} onClick={()=>setSelDate(d)} style={{minWidth:48,padding:"7px 4px",borderRadius:8,border:`1.5px solid ${selDate===d?C.gold:col}`,background:selDate===d?`${C.gold}20`:"transparent",cursor:"pointer",textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:9,color:C.muted}}>{["日","月","火","水","木","金","土"][new Date(d+"T00:00:00").getDay()]}</div>
              <div style={{fontSize:13,fontWeight:700,color:selDate===d?C.goldL:C.text}}>{new Date(d+"T00:00:00").getDate()}</div>
              {col!==C.border&&<div style={{width:5,height:5,borderRadius:"50%",background:col,margin:"3px auto 0"}}/>}
              {isToday&&<div style={{fontSize:8,color:C.gold}}>今日</div>}
            </div>
          );
        })}
      </div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>{disp(selDate)} の予約状況</div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
          <thead>
            <tr>
              <th style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:600,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>時間</th>
              {TABLES.map(t=><th key={t.id} style={{padding:"6px 8px",textAlign:"center",color:C.muted,fontWeight:600,borderBottom:`1px solid ${C.border}`}}>{t.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map(time=>(
              <tr key={time} style={{borderBottom:`1px solid ${C.border}22`}}>
                <td style={{padding:"4px 8px",color:C.muted,whiteSpace:"nowrap"}}>{time}</td>
                {TABLES.map(t=>{
                  const conf=rsvList.filter(r=>r.date===selDate&&r.time===time&&r.tableId===t.id&&r.status==="confirmed");
                  const wait=rsvList.filter(r=>r.date===selDate&&r.time===time&&r.tableId===t.id&&r.status==="waitlist");
                  const total=conf.reduce((s,r)=>s+r.people,0);
                  return(
                    <td key={t.id} style={{padding:"3px 4px",textAlign:"center"}}>
                      <div style={{borderRadius:5,border:`1px solid ${conf.length>0?C.green:wait.length>0?C.blue:C.border}`,background:conf.length>0?`${C.green}18`:"transparent",padding:"3px 2px",minHeight:32}}>
                        {conf.length===0&&wait.length===0?<span style={{color:C.border}}>―</span>:<>
                          {conf.length>0&&<div style={{fontWeight:700,color:C.green,fontSize:11}}>{total}名</div>}
                          {wait.length>0&&<div style={{fontSize:9,color:C.blue}}>{wait.length}人待</div>}
                        </>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",gap:12,marginTop:10,fontSize:11,color:C.muted}}>
        <span><span style={{color:C.green}}>■</span> 確定</span>
        <span><span style={{color:C.blue}}>■</span> 待ちあり</span>
        <span><span style={{color:C.orange}}>■</span> 両方あり</span>
      </div>
    </div>
  );
}

// ── 管理：売上集計 ───────────────────────────────────────
function AdminSales({rsvList}){
  const dates=getDates();
  const calcRevenue=(list)=>list.reduce((s,r)=>{const c=COURSES.find(x=>x.id===r.course);return s+(c?c.unit*r.people:0);},0);

  const dailyData=dates.map(date=>{
    const conf=rsvList.filter(r=>r.date===date&&r.status==="confirmed");
    const health=conf.filter(r=>r.course==="health");
    const labo  =conf.filter(r=>r.course==="labo");
    return{
      date,
      total:calcRevenue(conf),
      health:calcRevenue(health),
      labo:calcRevenue(labo),
      people:conf.reduce((s,r)=>s+r.people,0),
      count:conf.length,
    };
  });

  const todayStr=fmt(TODAY);
  const todayData=dailyData.find(d=>d.date===todayStr)||{total:0,health:0,labo:0,people:0,count:0};
  const totalAll=dailyData.reduce((s,d)=>s+d.total,0);
  const maxRevenue=Math.max(...dailyData.map(d=>d.total),1);

  return(
    <div>
      <div style={tag}>売上集計</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:20}}>
        {[
          {label:"本日売上",value:`¥${todayData.total.toLocaleString()}`,color:C.gold},
          {label:"本日　健康麻雀",value:`¥${todayData.health.toLocaleString()}`,color:C.green},
          {label:"本日　ラボ",value:`¥${todayData.labo.toLocaleString()}`,color:C.blue},
          {label:"14日間合計",value:`¥${totalAll.toLocaleString()}`,color:C.purple},
        ].map(s=>(
          <div key={s.label} style={{...crd,marginBottom:0}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{s.label}</div>
            <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>日別売上（14日間）</div>
      {dailyData.map(d=>(
        <div key={d.date} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
            <span style={{color:C.muted}}>{dispShort(d.date)}{d.date===todayStr&&<span style={{color:C.gold}}> 今日</span>}</span>
            <span style={{fontWeight:700,color:d.total>0?C.text:C.muted}}>¥{d.total.toLocaleString()}　<span style={{color:C.muted,fontWeight:400}}>{d.count}件 / {d.people}名</span></span>
          </div>
          <div style={{height:8,background:C.border,borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${(d.health/maxRevenue)*100}%`,background:C.green,float:"left"}}/>
            <div style={{height:"100%",width:`${(d.labo/maxRevenue)*100}%`,background:C.blue,float:"left"}}/>
          </div>
        </div>
      ))}
      <div style={{display:"flex",gap:12,marginTop:8,fontSize:11,color:C.muted}}>
        <span><span style={{color:C.green}}>■</span> 健康麻雀</span>
        <span><span style={{color:C.blue}}>■</span> ラボ</span>
      </div>
    </div>
  );
}

// ── 管理：常連管理 ───────────────────────────────────────
function AdminRegulars({rsvList}){
  const [sel,setSel]=useState(null);
  const regulars=useMemo(()=>{
    const map={};
    rsvList.forEach(r=>{
      if(!map[r.phone]) map[r.phone]={name:r.name,phone:r.phone,visits:[],cancelled:0,noShow:0};
      if(r.status==="confirmed") map[r.phone].visits.push(r);
      if(r.status==="cancelled") map[r.phone].cancelled++;
      if(r.noShow) map[r.phone].noShow++;
    });
    return Object.values(map).sort((a,b)=>b.visits.length-a.visits.length);
  },[rsvList]);

  const selected=sel?regulars.find(r=>r.phone===sel):null;

  return(
    <div>
      <div style={tag}>常連管理</div>
      {regulars.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.muted}}>まだ来店記録がありません</div>}
      <div style={rw}>
        <div style={{flex:1,minWidth:240}}>
          {regulars.map(r=>(
            <div key={r.phone} onClick={()=>setSel(r.phone===sel?null:r.phone)} style={{...crd,marginBottom:8,cursor:"pointer",borderColor:sel===r.phone?C.gold:C.border,background:sel===r.phone?`${C.gold}10`:C.card}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{r.name} 様</div>
                  <div style={{fontSize:11,color:C.muted}}>{r.phone}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:800,color:C.gold}}>{r.visits.length}<span style={{fontSize:11,color:C.muted,fontWeight:400}}>回</span></div>
                  {r.cancelled>0&&<div style={{fontSize:10,color:C.muted}}>キャンセル{r.cancelled}回</div>}
                  {r.noShow>0&&<div style={{fontSize:10,color:C.red,fontWeight:700}}>NC {r.noShow}回</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {selected&&(
          <div style={{flex:1,minWidth:240}}>
            <div style={crd}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>{selected.name} 様　来店履歴</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:14}}>{selected.phone} · 計{selected.visits.length}回{selected.noShow>0&&<span style={{color:C.red}}> · ノーショー{selected.noShow}回</span>}</div>
              {[...selected.visits].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(v=>{
                const c=COURSES.find(x=>x.id===v.course); const t=TABLES.find(x=>x.id===v.tableId);
                return(
                  <div key={v.id} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
                    <div style={{fontWeight:600}}>{disp(v.date)} {v.time}〜</div>
                    <div style={{color:C.muted}}>{t?.label} · {c?.label} · {v.people}名</div>
                    {v.memo&&<div style={{color:C.gold,fontSize:11,marginTop:2}}>📝 {v.memo}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 管理：設定 ───────────────────────────────────────────
function AdminSettings({closedDays,setClosedDays,closedWeekdays,setClosedWeekdays,cancelDeadlineHours,setCancelDeadlineHours}){
  const [newDate,setNewDate]=useState(fmt(TODAY));

  const toggleWeekday=(wd)=>{
    setClosedWeekdays(p=>p.includes(wd)?p.filter(x=>x!==wd):[...p,wd]);
  };
  const addClosedDay=()=>{
    if(!closedDays.includes(newDate)) setClosedDays(p=>[...p,newDate].sort());
  };
  const removeClosedDay=(d)=>setClosedDays(p=>p.filter(x=>x!==d));

  return(
    <div>
      <div style={tag}>店舗設定</div>

      {/* 定休日（曜日） */}
      <div style={crd}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>定休日（毎週）</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>選択した曜日は毎週自動的に休業日になります</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {WEEKDAYS.map((w,i)=>(
            <button key={i} onClick={()=>toggleWeekday(i)} style={{width:44,height:44,borderRadius:8,border:`1.5px solid ${closedWeekdays.includes(i)?C.red:C.border}`,background:closedWeekdays.includes(i)?`${C.red}15`:"transparent",color:closedWeekdays.includes(i)?C.red:C.text,cursor:"pointer",fontWeight:700,fontSize:14}}>
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 臨時休業日 */}
      <div style={crd}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>臨時休業日</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>特定の日付を個別に休業日として設定できます</div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <input type="date" style={{...inp,flex:1,minWidth:160}} value={newDate} onChange={e=>setNewDate(e.target.value)}/>
          <button style={btn("primary",true)} onClick={addClosedDay}>追加</button>
        </div>
        {closedDays.length===0
          ?<div style={{fontSize:12,color:C.muted}}>臨時休業日は登録されていません</div>
          :(
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {closedDays.map(d=>(
                <span key={d} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,border:`1px solid ${C.red}55`,background:`${C.red}10`,fontSize:12,color:C.red}}>
                  {disp(d)}
                  <button onClick={()=>removeClosedDay(d)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontWeight:700,padding:0}}>×</button>
                </span>
              ))}
            </div>
          )
        }
      </div>

      {/* キャンセル期限 */}
      <div style={crd}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>キャンセル期限</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>予約時間の何時間前までキャンセルを受け付けるか設定します</div>
        <div style={rw}>
          {[0,1,3,6,12,24].map(h=>(
            <div key={h} style={chip(cancelDeadlineHours===h)} onClick={()=>setCancelDeadlineHours(h)}>
              <div style={{fontWeight:700}}>{h===0?"制限なし":`${h}時間前まで`}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{fontSize:11,color:C.muted,marginTop:8}}>
        ※ この設定はブラウザのメモリ上に保存されています。データを永続化するには別途データベース連携が必要です。
      </div>
    </div>
  );
}

// ── 客側：プロフィール ───────────────────────────────────
function ProfileSetup({onDone}){
  const [name,setName]=useState(""); const [phone,setPhone]=useState("");
  const [nameErr,setNameErr]=useState(""); const [phoneErr,setPhoneErr]=useState("");
  const submit=()=>{
    const ne=validateName(name); const pe=validatePhone(phone);
    setNameErr(ne||""); setPhoneErr(pe||"");
    if(ne||pe) return;
    onDone({name:name.trim(),phone:phone.trim()});
  };
  return(
    <div>
      <div style={tag}>はじめに</div>
      <div style={crd}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:3}}>お客様情報を登録</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:16}}>一度登録すると、次回から自動で入力されます。</div>
        <div style={{...rw,marginBottom:12}}>
          <div style={{flex:1,minWidth:140}}>
            <span style={lbl}>お名前</span>
            <input style={{...inp,borderColor:nameErr?C.red:C.border}} placeholder="山田 太郎" value={name} onChange={e=>{setName(e.target.value);setNameErr("");}}/>
            {nameErr&&<div style={{color:C.red,fontSize:11,marginTop:4}}>⚠ {nameErr}</div>}
          </div>
          <div style={{flex:1,minWidth:140}}>
            <span style={lbl}>電話番号</span>
            <input style={{...inp,borderColor:phoneErr?C.red:C.border}} placeholder="090-1234-5678" value={phone} onChange={e=>{setPhone(e.target.value);setPhoneErr("");}}/>
            {phoneErr&&<div style={{color:C.red,fontSize:11,marginTop:4}}>⚠ {phoneErr}</div>}
          </div>
        </div>
        <button style={btn("primary")} onClick={submit}>登録して予約へ →</button>
      </div>
    </div>
  );
}

// ── 客側：予約フォーム ───────────────────────────────────
function BookForm({profile,onProfileReset,onSubmit,isOccupied,seatsLeft,rsvList,isClosedDate,hasDuplicate}){
  const [people,setPeople]=useState(1); const [date,setDate]=useState(fmt(TODAY));
  const [time,setTime]=useState("12:30"); const [tableId,setTableId]=useState(null);
  const [course,setCourse]=useState("health"); const [err,setErr]=useState("");
  const [showWaitlist,setShowWaitlist]=useState(false);
  const [isBeginner,setIsBeginner]=useState(false);
  const [peekTable,setPeekTable]=useState(null);
  const [repeatWeeks,setRepeatWeeks]=useState(1);
  const pressTimer=useRef(null);
  const reset=()=>{setTableId(null);setShowWaitlist(false);};
  const closed=isClosedDate(date);
  const dup=hasDuplicate(profile.phone,date);

  const submit=(forceWaitlist=false)=>{
    if(closed) return setErr("休業日のため予約できません");
    if(!tableId&&!forceWaitlist) return setErr("卓を選択してください");
    setErr("");
    const tags=isBeginner?["初心者"]:[];
    onSubmit({id:uid(),name:profile.name,phone:profile.phone,people,date,time,tableId:tableId||(forceWaitlist?parseInt(showWaitlist):null),course,tags,repeatWeeks});
    setTableId(null);setShowWaitlist(false);setIsBeginner(false);setRepeatWeeks(1);
  };
  const allFull=TABLES.every(t=>seatsLeft(t.id,date,time)<=0);
  const tableGuests=(tid)=>rsvList.filter(r=>r.tableId===tid&&r.date===date&&r.time===time&&r.status==="confirmed");

  const startPress=(tid)=>{ pressTimer.current=setTimeout(()=>setPeekTable(tid),420); };
  const endPress=()=>{ if(pressTimer.current) clearTimeout(pressTimer.current); };

  return(
    <div>
      <div style={tag}>予約する</div>
      <div style={{background:C.surface,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"11px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div><div style={{fontSize:15,fontWeight:700}}>{profile.name} 様</div><div style={{fontSize:12,color:C.muted}}>{profile.phone}</div></div>
        <button onClick={onProfileReset} style={{fontSize:12,color:C.gold,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>変更</button>
      </div>

      {closed&&(
        <div style={{background:`${C.red}15`,border:`1px solid ${C.red}55`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:C.red,fontWeight:700}}>
          ⚠ {disp(date)} は休業日です。別の日付をお選びください
        </div>
      )}
      {!closed&&dup&&(
        <div style={{background:`${C.orange}15`,border:`1px solid ${C.orange}55`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.orange}}>
          ℹ️ {disp(date)} には既にご予約があります。重複してご予約されますがよろしいですか？
        </div>
      )}

      <div style={crd}>
        <div style={rw}>
          <div style={{flex:2,minWidth:130}}><span style={lbl}>日付</span><input type="date" style={inp} value={date} min={fmt(TODAY)} max={maxDate()} onChange={e=>{setDate(e.target.value);reset();}}/></div>
          <div style={{flex:1,minWidth:100}}><span style={lbl}>時間</span><select style={sel} value={time} onChange={e=>{setTime(e.target.value);reset();}}>{TIME_SLOTS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div style={{minWidth:90}}><span style={lbl}>人数</span><select style={sel} value={people} onChange={e=>setPeople(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}名</option>)}</select></div>
        </div>
      </div>

      <div style={crd}>
        <span style={lbl}>コース</span>
        <div style={rw}>
          {COURSES.map(c=>(
            <div key={c.id} style={chip(course===c.id)} onClick={()=>setCourse(c.id)}>
              <div style={{fontWeight:700,marginBottom:2}}>{c.label}</div>
              <div style={{fontSize:12,color:course===c.id?C.goldL:C.gold,marginBottom:2}}>{c.price}</div>
              <div style={{fontSize:11,opacity:0.65}}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={crd}>
        <span style={lbl}>卓を選択 — {disp(date)} {time}〜　（卓を長押しで予約者を確認できます）</span>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,opacity:closed?0.4:1,pointerEvents:closed?"none":"auto"}}>
          {TABLES.map(t=>{
            const left=seatsLeft(t.id,date,time); const occ=left<=0;
            const col=occ?C.red:left<=1?"#E8A84C":C.green;
            const guests=tableGuests(t.id);
            return(
              <div
                key={t.id}
                style={{...tCard(tableId===t.id,!occ),position:"relative",userSelect:"none"}}
                onClick={()=>!occ&&setTableId(t.id)}
                onMouseDown={()=>startPress(t.id)}
                onMouseUp={endPress}
                onMouseLeave={endPress}
                onTouchStart={()=>startPress(t.id)}
                onTouchEnd={endPress}
                onContextMenu={(e)=>{e.preventDefault();setPeekTable(t.id);}}
              >
                <div style={{fontSize:20,marginBottom:2}}>🀄</div>
                <div style={{fontWeight:700,fontSize:13}}>{t.label}</div>
                <div style={{fontSize:10,color:col,marginTop:2}}>{occ?"満席":`残り${left}席`}</div>
                {occ&&(
                  <div onClick={e=>{e.stopPropagation();setShowWaitlist(t.id);setTableId(null);}} style={{marginTop:6,fontSize:9,color:C.blue,cursor:"pointer",textDecoration:"underline"}}>
                    待ちで申込む
                  </div>
                )}
                {showWaitlist===t.id&&<div style={{position:"absolute",inset:0,borderRadius:8,border:`2px solid ${C.blue}`,background:`${C.blue}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.blue,fontWeight:700,pointerEvents:"none"}}>待ち選択中</div>}
                {peekTable===t.id&&(
                  <div
                    onClick={e=>e.stopPropagation()}
                    style={{position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:C.text,color:"#fff",borderRadius:8,padding:"8px 12px",fontSize:11,whiteSpace:"nowrap",zIndex:20,boxShadow:"0 4px 12px rgba(0,0,0,0.25)"}}
                  >
                    {guests.length>0
                      ? guests.map(g=><div key={g.id} style={{padding:"1px 0"}}>{g.name} 様（{g.people}名）</div>)
                      : <div style={{opacity:0.7}}>予約者なし</div>
                    }
                    <button onClick={()=>setPeekTable(null)} style={{marginTop:4,fontSize:10,color:"#aaa",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>閉じる</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {allFull&&<div style={{fontSize:11,color:C.muted,marginTop:10}}>※ 全卓満席の場合、卓の「待ちで申込む」からキャンセル待ち登録できます</div>}
      </div>

      {/* 定期予約 */}
      <div style={crd}>
        <span style={lbl}>定期予約（毎週同じ曜日・時間で繰り返す）</span>
        <div style={rw}>
          {[1,4,8,12].map(n=>(
            <div key={n} style={chip(repeatWeeks===n)} onClick={()=>setRepeatWeeks(n)}>
              <div style={{fontWeight:700}}>{n===1?"1回のみ":`${n}週連続`}</div>
            </div>
          ))}
        </div>
        {repeatWeeks>1&&<div style={{fontSize:11,color:C.muted,marginTop:8}}>※ 同じ卓・時間で空きがない週は自動的にキャンセル待ちになります</div>}
      </div>

      {/* 初心者申告 */}
      <div style={{marginBottom:14,display:"flex",justifyContent:"flex-end"}}>
        <button
          onClick={()=>setIsBeginner(p=>!p)}
          style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${isBeginner?C.orange:C.border}`,background:isBeginner?`${C.orange}22`:"transparent",color:isBeginner?C.orange:C.muted,cursor:"pointer",fontSize:12,fontWeight:isBeginner?700:400,transition:"all 0.15s"}}
        >
          {isBeginner?"🙋 初心者・初めてとして申告中":"🙋 初心者・初めての方はこちら"}
        </button>
      </div>
      {err&&<div style={{color:C.red,fontSize:13,marginBottom:10}}>⚠ {err}</div>}
      {showWaitlist
        ?<button style={btn("blue")} disabled={closed} onClick={()=>submit(true)}>キャンセル待ちで申し込む →</button>
        :<button style={btn("primary")} disabled={closed} onClick={()=>submit(false)}>{repeatWeeks>1?`予約を確定する（${repeatWeeks}回分）→`:"予約を確定する →"}</button>
      }
    </div>
  );
}

// ── 客側：予約一覧 ───────────────────────────────────────
function ReservationList({rsvList,onCancel,onEdit,waitlistRank,seatsLeft,canCancel,cancelDeadlineHours}){
  const active=rsvList.filter(r=>r.status!=="cancelled");
  const done  =rsvList.filter(r=>r.status==="cancelled");
  if(!rsvList.length) return<div><div style={tag}>予約一覧</div><div style={{textAlign:"center",padding:"48px 0",color:C.muted}}>まだ予約がありません</div></div>;
  return(
    <div>
      <div style={tag}>予約一覧 — {active.length}件</div>
      {cancelDeadlineHours>0&&<div style={{fontSize:11,color:C.muted,marginBottom:12}}>※ キャンセルは予約時間の{cancelDeadlineHours}時間前まで可能です</div>}
      {active.map(r=><ResCard key={r.id} rsv={r} onCancel={onCancel} onEdit={onEdit} rank={waitlistRank(r.id)} seatsLeft={seatsLeft} canCancel={canCancel}/>)}
      {done.length>0&&(<><hr style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"14px 0"}}/><div style={{...tag,opacity:0.4}}>キャンセル済み</div>{done.map(r=><ResCard key={r.id} rsv={r} onCancel={onCancel} onEdit={onEdit} rank={null} seatsLeft={seatsLeft} canCancel={canCancel}/>)}</>)}
    </div>
  );
}

function ResCard({rsv,onCancel,onEdit,rank,seatsLeft,canCancel}){
  const [confirm,setConfirm]=useState(false);
  const course=COURSES.find(c=>c.id===rsv.course); const table=TABLES.find(t=>t.id===rsv.tableId);
  const st=statusInfo(rsv.status); const isDone=rsv.status==="cancelled";
  const left=rsv.tableId?seatsLeft(rsv.tableId,rsv.date,rsv.time):null;
  const isFull=left!==null&&left<=0;
  const cancelOk=canCancel(rsv);
  return(
    <div style={{...crd,opacity:isDone?0.55:1,borderLeft:`3px solid ${rsv.status==="confirmed"?C.green:rsv.status==="waitlist"?C.blue:C.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:700}}>{rsv.name} 様　{rsv.people}名</span>
            <span style={bdg(st.color)}>{st.label}</span>
            {rank&&<span style={bdg("blue")}>{rank}番待ち</span>}
          </div>
          <div style={{fontSize:13,color:C.muted}}>📅 {disp(rsv.date)}　🕐 {rsv.time}〜　🀄 {table?.label||"―"}　📋 {course?.label}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:3}}>ID: {rsv.id} · {rsv.phone}</div>
          {!isDone&&rsv.status==="confirmed"&&left!==null&&(
            <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:6,background:isFull?`${C.green}18`:`${C.orange}18`,border:`1px solid ${isFull?C.green:C.orange}`,borderRadius:6,padding:"4px 10px"}}>
              <span style={{fontSize:12,color:isFull?C.green:C.orange,fontWeight:700}}>{isFull?"🀄 満卓です":`あと ${left} 人で満卓`}</span>
            </div>
          )}
          {!isDone&&!cancelOk&&(
            <div style={{marginTop:6,fontSize:11,color:C.red}}>⚠ キャンセル期限を過ぎています。お店に直接ご連絡ください</div>
          )}
        </div>
        {!isDone&&(
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            {rsv.status!=="waitlist"&&<button style={btn("blue",true)} onClick={()=>onEdit(rsv)}>変更</button>}
            {cancelOk&&(confirm?<button style={btn("danger",true)} onClick={()=>{onCancel(rsv.id);setConfirm(false);}}>本当にキャンセル</button>:<button style={btn("danger",true)} onClick={()=>setConfirm(true)}>キャンセル</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 変更モーダル ────────────────────────────────────────
function EditModal({rsv,isOccupied,seatsLeft,onSave,onClose}){
  const [date,setDate]=useState(rsv.date); const [time,setTime]=useState(rsv.time);
  const [tableId,setTableId]=useState(rsv.tableId); const [people,setPeople]=useState(rsv.people);
  const [course,setCourse]=useState(rsv.course);
  const reset=()=>setTableId(null);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}} onClick={onClose}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:26,maxWidth:420,width:"90%",boxSizing:"border-box",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{...tag,marginBottom:14}}>予約を変更</div>
        <div style={{marginBottom:10}}><span style={lbl}>日付</span><input type="date" style={inp} value={date} min={fmt(TODAY)} max={maxDate()} onChange={e=>{setDate(e.target.value);reset();}}/></div>
        <div style={{...rw,marginBottom:10}}>
          <div style={{flex:1}}><span style={lbl}>時間</span><select style={sel} value={time} onChange={e=>{setTime(e.target.value);reset();}}>{TIME_SLOTS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div style={{flex:1}}><span style={lbl}>人数</span><select style={sel} value={people} onChange={e=>setPeople(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}名</option>)}</select></div>
        </div>
        <div style={{marginBottom:10}}><span style={lbl}>コース</span><select style={sel} value={course} onChange={e=>setCourse(e.target.value)}>{COURSES.map(c=><option key={c.id} value={c.id}>{c.label}（{c.price}）</option>)}</select></div>
        <div style={{marginBottom:4}}>
          <span style={lbl}>卓 — {disp(date)} {time}〜</span>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {TABLES.map(t=>{
              const left=seatsLeft(t.id,date,time,rsv.id); const occ=left<=0;
              const col=occ?C.red:left<=1?"#E8A84C":C.green;
              return(
                <div key={t.id} style={tCard(tableId===t.id,!occ)} onClick={()=>!occ&&setTableId(t.id)}>
                  <div style={{fontSize:16}}>🀄</div>
                  <div style={{fontWeight:700,fontSize:12}}>{t.label}</div>
                  <div style={{fontSize:10,color:col}}>{occ?"満席":`残り${left}席`}</div>
                </div>
              );
            })}
          </div>
        </div>
        <hr style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"14px 0"}}/>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button style={btn("secondary")} onClick={onClose}>閉じる</button>
          <button style={btn("primary")} onClick={()=>onSave({...rsv,date,time,tableId,people,course})}>変更を保存</button>
        </div>
      </div>
    </div>
  );
}
