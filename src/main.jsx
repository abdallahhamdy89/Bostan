import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell, Building2, ChevronDown, ChevronLeft, CreditCard, Download, FileText,
  Home, Menu, MoreHorizontal, Plus, Printer, Search, Settings, UserRound,
  Users, Wallet, X, ArrowUpLeft, CheckCircle2, Clock3, AlertTriangle, Upload
} from 'lucide-react';
import './styles.css';
import logoImage from './assets/logo.png';

const money = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n) + ' ج.م';
const num = (n) => new Intl.NumberFormat('ar-EG').format(n);
const dateText = (value) => value ? new Intl.DateTimeFormat('ar-EG', { day:'numeric', month:'short', year:'numeric' }).format(new Date(value)) : '—';

function SortableTh({label, sortKey, activeKey, dir, onSort}) {
  const active = activeKey===sortKey;
  return <th onClick={()=>onSort(sortKey)} style={{cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}>{label}<span style={{marginRight:4,fontSize:8,color:active?'#2d6a4f':'#c3ccc7'}}>{active?(dir==='asc'?'▲':'▼'):'▲'}</span></th>
}

function sortRows(rows, columns, sortKey, sortDir) {
  if (!sortKey) return rows;
  const col = columns.find(c=>c.key===sortKey);
  if (!col) return rows;
  const arr = [...rows];
  arr.sort((a,b) => {
    const va=col.value(a), vb=col.value(b);
    let cmp;
    if (va instanceof Date || vb instanceof Date) cmp=(va?va.getTime():0)-(vb?vb.getTime():0);
    else if (typeof va==='number' || typeof vb==='number') cmp=(va??0)-(vb??0);
    else cmp=String(va??'').localeCompare(String(vb??''),'ar');
    return sortDir==='asc'?cmp:-cmp;
  });
  return arr;
}

function useSortable(defaultKey=null) {
  const [sortKey,setSortKey]=useState(defaultKey);
  const [sortDir,setSortDir]=useState('asc');
  const onSort=(key)=>{ if(sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc'); else {setSortKey(key);setSortDir('asc')} };
  return {sortKey, sortDir, onSort};
}
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';


const nav = [
  ['الرئيسية', Home], ['الملاك', Users], ['المدفوعات', Wallet], ['التقارير', FileText], ['انواع المدفوعات', FileText]
];

function IconButton({children, className='', ...props}) { return <button className={`icon-btn ${className}`} {...props}>{children}</button> }

function Logo() {
  return <img src={logoImage} width="34" height="34" alt="شعار بستان" style={{borderRadius:'9px',display:'block'}}/>
}

function Stat({icon: Icon, title, value, note, trend, amber}) {
  return <div className="stat-card">
    <div className={`stat-icon ${amber ? 'amber' : ''}`}><Icon size={21}/></div>
    <div className="stat-label">{title}</div>
    <div className="stat-value">{value}</div>
    <div className={`stat-note ${trend ? 'good' : ''}`}>{trend && <ArrowUpLeft size={14}/>} {note}</div>
  </div>
}

function Sidebar({active, setActive, mobile, close}) {
 return <aside className={`sidebar ${mobile ? 'mobile-sidebar' : ''}`}>
   <div className="brand"><div className="brand-mark"><Logo/></div><div><strong>بستان</strong><small>إدارة المرافق</small></div>{mobile && <IconButton onClick={close}><X size={20}/></IconButton>}</div>
   <div className="nav-label">القائمة الرئيسية</div>
   <nav>{nav.map(([label, Icon]) => <button key={label} onClick={() => {setActive(label); close?.()}} className={active===label ? 'active' : ''}><Icon size={19}/><span>{label}</span>{label==='المدفوعات' && <em>٨</em>}</button>)}</nav>
   <div className="sidebar-bottom"><button><Settings size={19}/><span>الإعدادات</span></button><div className="user-card"><div className="avatar">عم</div><div><strong>عمر مصطفى</strong><small>مدير النظام</small></div><ChevronDown size={16}/></div></div>
 </aside>
}

function Header({setMobile, onImport, breadcrumb, onBack}) { return <header><div className="breadcrumb"><button className="menu-open" onClick={()=>setMobile(true)}><Menu size={23}/></button>{breadcrumb.parent&&<><button className="text-btn" onClick={onBack}>{breadcrumb.parent}</button><ChevronLeft size={16}/></>}<strong>{breadcrumb.current}</strong></div><div className="header-actions"><button className="import-header-btn" onClick={onImport}><Upload size={16}/> استيراد Excel</button><div className="search"><Search size={18}/><input placeholder="ابحث عن مالك أو شقة..." /></div><IconButton className="notification"><Bell size={19}/><i></i></IconButton></div></header> }

function BuildingHero({setPayment, setPaymentApartment, building}) { return <section className="building-hero"><div className="building-title"><div className="building-icon"><Building2 size={27}/></div><div><div className="eyebrow">عمارة سكنية</div><h1>{building?.name||'لا توجد عمارات'}</h1><p>{building?.address||'بيانات مستوردة من Excel'} · {num(building?.floors||0)} طوابق · {num(building?.apartmentCount||0)} شقة</p></div></div><div className="hero-actions"><button className="btn ghost"><Download size={17}/> تصدير التقرير</button><button className="btn primary" onClick={()=>{setPaymentApartment(building?.apartments?.[0]?.id||null);setPayment(true)}}><Plus size={18}/> تسجيل دفعة</button></div></section> }

function FinanceOverview({totals}) { const percent=totals.specialFeesOwed?Math.round((totals.specialFeesCollected/totals.specialFeesOwed)*100):0; return <section className="finance"><div className="section-title"><div><h2>الملخص المالي</h2><p>من بيانات PostgreSQL الحالية</p></div><button className="select-btn">كل الفترات <ChevronDown size={15}/></button></div><div className="finance-grid"><Stat icon={Wallet} title="إجمالي المستحقات" value={money(totals.specialFeesOwed)} note={`عبر ${num(totals.apartments)} شقة`}/><Stat icon={CheckCircle2} title="إجمالي المحصّل" value={money(totals.specialFeesCollected)} note={`${num(percent)}٪ من المستحقات`} trend/><Stat icon={AlertTriangle} title="الرصيد المتبقي" value={money(totals.specialFeesBalance)} note={`${num(totals.specialFeesOverdue)} شقق لديها رصيد`} amber/></div></section> }

function PaymentChart() { return <section className="chart-card"><div className="section-title"><div><h2>حركة التحصيل</h2><p>مقارنة المستحقات بالمدفوعات</p></div><button className="dots"><MoreHorizontal size={20}/></button></div><div className="legend"><span><i className="blue-dot"></i> المدفوعات</span><span><i className="pale-dot"></i> المستحقات</span></div><div className="chart"><div className="axis"><span>٢٠٬٠٠٠</span><span>١٥٬٠٠٠</span><span>١٠٬٠٠٠</span><span>٥٬٠٠٠</span><span>٠</span></div><div className="bars">{[['يناير',55,72],['فبراير',64,70],['مارس',46,69],['أبريل',73,74],['مايو',80,86],['يونيو',38,52]].map(([m,p,d])=><div className="bar-group" key={m}><div className="bar-pair"><i style={{height:p+'%'}}></i><b style={{height:d+'%'}}></b></div><span>{m}</span></div>)}</div></div></section> }

function RecentPayments({payments}) { return <section className="payments-card"><div className="section-title"><div><h2>آخر المدفوعات</h2><p>الدفعات المستوردة والمسجلة</p></div><button className="text-btn">عرض الكل <ChevronLeft size={16}/></button></div><div className="recent-list">{payments.length?payments.map((p,i)=><div className="recent-row" key={p.id}><div className={`pay-avatar c${i%3}`}>{p.ownerName.slice(0,1)}</div><div className="recent-main"><strong>{p.ownerName}</strong><span>شقة {p.apartmentNumber} · {p.feeNames.join('، ')||'دفعة'}</span></div><div className="recent-amount"><strong>{money(p.amount)}</strong><span>{dateText(p.paidOn)}</span></div></div>):<div className="empty-list">لا توجد دفعات بعد.</div>}</div></section> }

const APARTMENT_COLUMNS=[
  {key:'number',label:'الشقة',value:a=>Number(a.number)||0},
  {key:'floor',label:'الطابق',value:a=>a.floor},
  {key:'ownerName',label:'المالك',value:a=>a.ownerName},
  {key:'area',label:'المساحة',value:a=>a.area},
  {key:'owed',label:'إجمالي المستحق',value:a=>a.owed},
  {key:'paid',label:'المدفوع',value:a=>a.paid},
  {key:'balance',label:'الرصيد',value:a=>a.balance},
  {key:'lastPaymentDate',label:'آخر دفعة',value:a=>a.lastPaymentDate?new Date(a.lastPaymentDate):null},
  {key:'specialFeesBalance',label:'المبلغ المستحق',value:a=>a.specialFeesBalance},
];

function ApartmentsTable({apartments, onSelect}) { const [filter, setFilter]=useState('الكل'); const [query,setQuery]=useState(''); const {sortKey,sortDir,onSort}=useSortable(); const filtered=useMemo(()=>apartments.filter(a=>{const matchesFilter=filter==='الكل'||(filter==='متأخرات'?a.specialFeesBalance>0:a.specialFeesBalance<=0);return matchesFilter&&`${a.number} ${a.ownerName}`.includes(query)}),[apartments,filter,query]); const sorted=useMemo(()=>sortRows(filtered,APARTMENT_COLUMNS,sortKey,sortDir),[filtered,sortKey,sortDir]); return <section className="apartments-section"><div className="section-title"><div><h2>الشقق</h2><p>بيان تفصيلي من قاعدة البيانات</p></div><div className="table-actions"><div className="tiny-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث"/></div><button className="filter"><span></span> تصفية</button></div></div><div className="tabs">{['الكل','متأخرات','مسدد'].map(t=><button className={filter===t?'tab-active':''} onClick={()=>setFilter(t)} key={t}>{t}{t==='الكل' && <b>{num(apartments.length)}</b>}</button>)}</div><div className="table-scroll"><table><thead><tr>{APARTMENT_COLUMNS.map(c=><SortableTh key={c.key} label={c.label} sortKey={c.key} activeKey={sortKey} dir={sortDir} onSort={onSort}/>)}<th></th></tr></thead><tbody>{sorted.map(a=>{const tone=a.balance>0?'late':'paid';const dueTone=a.specialFeesBalance>0?'late':'paid';return <tr key={a.id} onClick={()=>onSelect(a.id)}><td><span className="apt-number">{a.number}</span></td><td>{a.floor}</td><td><div className="owner-cell"><div className="mini-avatar">{a.ownerName[0]}</div><div><strong>{a.ownerName}</strong><small>{a.phone||'—'}</small></div></div></td><td>{a.area===null?'—':`${num(a.area)} م²`}</td><td>{money(a.owed)}</td><td className="paid">{money(a.paid)}</td><td className={a.balance?'balance':'paid'}>{money(a.balance)}</td><td>{dateText(a.lastPaymentDate)}</td><td><span className={`status ${dueTone}`}>{a.specialFeesBalance>0?`مستحق ${money(a.specialFeesBalance)}`:'مسدّد'}</span></td><td><IconButton><MoreHorizontal size={20}/></IconButton></td></tr>})}</tbody></table></div></section> }

function ApartmentPanel({apartmentId, close, setPayment, setPaymentApartment}) { const [apartment,setApartment]=useState(null); const [error,setError]=useState(''); useEffect(()=>{if(!apartmentId)return;setApartment(null);fetch(`${apiBase}/api/apartments/${apartmentId}/ledger`).then(r=>r.json()).then(setApartment).catch(()=>setError('تعذر تحميل كشف الحساب.'))},[apartmentId]); if(error)return <div className="drawer-backdrop"><aside className="apartment-drawer"><button onClick={close}>إغلاق</button><p>{error}</p></aside></div>; if(!apartment)return <div className="drawer-backdrop"><aside className="apartment-drawer">جارٍ تحميل كشف الحساب...</aside></div>; const normalize=(str)=>str.replace(/\s+/g,' ').trim(); const specialFeeNames=apartment.specialFees?.map(sf=>normalize(sf.feeName))||[]; const legacyChargesToExclude=['مصاريف صيانه 5/2018','مصاريف صيانه5/2018','م صيانه من 4-2016','صيانه حتى 3-2016','صيانه حتى 3 - 2016','فروق صيانة 4 - 2024','فروق صيانة 4-2024']; const filteredCharges=apartment.charges.filter(c=>!specialFeeNames.includes(normalize(c.feeName))&&!legacyChargesToExclude.includes(normalize(c.feeName))); const legacyDebtsTotal=apartment.legacyDebts?.reduce((sum,d)=>sum+d.amount,0)||0; const specialFeesBalance=(apartment.specialFees?.reduce((sum,sf)=>sum+(sf.totalCollectionAmount-sf.totalCollectedAmount),0)||0)+legacyDebtsTotal; const specialFeesTotal=(apartment.specialFees?.reduce((sum,sf)=>sum+sf.totalCollectionAmount,0)||0)+legacyDebtsTotal; return <div className="drawer-backdrop" onMouseDown={close}><aside className="apartment-drawer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">{apartment.buildingName} · الطابق {apartment.floor}</span><h2>الشقة {apartment.number}</h2></div><IconButton onClick={close}><X size={21}/></IconButton></div><div className="drawer-owner"><div className="avatar large">{apartment.ownerName[0]}</div><div><h3>{apartment.ownerName}</h3><p>{apartment.phone||'—'}</p></div><span className="status paid">المالك الحالي</span></div><div className="drawer-balance"><span>المبلغ المستحق</span><strong>{money(specialFeesBalance)}</strong><small>من إجمالي {money(specialFeesTotal)}</small></div><div className="ledger-title"><h3>كشف الحساب</h3><button className="text-btn"><Download size={15}/> تصدير</button></div>{apartment.specialFees&&apartment.specialFees.length>0&&<><div style={{marginBottom:'20px',padding:'12px',background:'#f5f5f5',borderRadius:'4px',borderRight:'4px solid #2196f3'}}><h3 style={{margin:'0 0 12px 0',fontSize:'16px',color:'#1976d2'}}>الرسوم الخاصة</h3>{apartment.specialFees.map((sf,idx)=><div key={idx} style={{marginBottom:'15px',padding:'12px',background:'white',borderRadius:'4px',fontSize:'14px',border:'1px solid #e0e0e0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'10px'}}><div><strong style={{fontSize:'15px'}}>{sf.feeName}</strong></div><span style={{padding:'4px 10px',borderRadius:'4px',background:sf.status==='PAID'?'#4caf5040':'#ff973740',color:sf.status==='PAID'?'#2e7d32':'#d32f2f',fontSize:'12px',fontWeight:'600'}}>{sf.status==='PAID'?'مسدد':'مستحق'}</span></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',fontSize:'13px',marginBottom:'10px',color:'#333'}}><div><span style={{color:'#666'}}>المبلغ المطلوب:</span> <br/><strong>{money(sf.totalCollectionAmount)}</strong></div><div><span style={{color:'#666'}}>المبلغ المسدد:</span> <br/><strong style={{color:sf.totalCollectedAmount>0?'#4caf50':'#d32f2f'}}>{money(sf.totalCollectedAmount)}</strong></div></div>{sf.remainingBalance>0&&<div style={{padding:'8px',background:'#fff3cd',borderRadius:'3px',fontSize:'13px',color:'#856404',marginBottom:'10px'}}><strong>المتبقي:</strong> {money(sf.remainingBalance)} ج.م</div>}{sf.entries&&sf.entries.length>0&&<details style={{fontSize:'12px',color:'#666',cursor:'pointer',marginTop:'8px'}}><summary style={{fontWeight:'600'}}>عرض التفاصيل ({sf.entries.length} بند)</summary><div style={{marginTop:'8px',paddingTop:'8px',borderTop:'1px solid #e0e0e0'}}>{sf.entries.map((entry,i)=><div key={i} style={{padding:'6px',fontSize:'12px',background:'#fafafa',marginBottom:'4px',borderRadius:'3px',display:'flex',justifyContent:'space-between'}}><span>{entry.collectionAmount > 0 ? money(entry.collectionAmount) : `${money(entry.collectedAmount)} [دفعة يدوية]`}</span>{entry.receiptNumber&&<span style={{color:'#0066cc'}}>{entry.receiptNumber}</span>}</div>)}</div></details>}</div>)}</div></>}{apartment.legacyDebts&&apartment.legacyDebts.length>0&&<div style={{marginBottom:'20px',padding:'12px',background:'#f5f5f5',borderRadius:'4px',borderRight:'4px solid #d32f2f'}}><h3 style={{margin:'0 0 12px 0',fontSize:'16px',color:'#d32f2f'}}>مستحقات مستوردة من الشيت الإجمالي</h3>{apartment.legacyDebts.map((debt)=><div key={debt.id} style={{marginBottom:'15px',padding:'12px',background:'white',borderRadius:'4px',fontSize:'14px',border:'1px solid #e0e0e0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'10px'}}><div><strong style={{fontSize:'15px'}}>{debt.feeName}</strong></div><span style={{padding:'4px 10px',borderRadius:'4px',background:'#ff973740',color:'#d32f2f',fontSize:'12px',fontWeight:'600'}}>مستحق</span></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',fontSize:'13px',color:'#333'}}><div><span style={{color:'#666'}}>المبلغ المطلوب:</span> <br/><strong>{money(debt.amount)}</strong></div><div><span style={{color:'#666'}}>المبلغ المسدد:</span> <br/><strong style={{color:'#d32f2f'}}>{money(0)}</strong></div></div></div>)}</div>}{filteredCharges.length>0&&<div className="ledger">{filteredCharges.map(charge=><div key={charge.id}><i className="fee-dot"></i><section><strong>{charge.feeName}</strong><span>{charge.periodLabel||dateText(charge.dueDate)||'رسم مستورد'}</span></section><b className="negative">+{money(charge.amount)}</b></div>)}</div>}<button className="btn primary full" onClick={()=>{setPaymentApartment(apartmentId);setPayment(true)}}><Plus size={18}/> تسجيل دفعة للشقة</button></aside></div> }

function PaymentModal({close, selectedApartmentId, apartments=[], onSuccess}) { const [specialFeeTypes,setSpecialFeeTypes]=useState([]); const [done,setDone]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [receipt,setReceipt]=useState(null); const [amount,setAmount]=useState(''); const [payDate,setPayDate]=useState(new Date().toISOString().split('T')[0]); const [specialFeeTypeId,setSpecialFeeTypeId]=useState(''); const [apartmentId,setApartmentId]=useState(selectedApartmentId||''); useEffect(()=>{fetch(`${apiBase}/api/special-fee-types`).then(r=>r.json()).then(setSpecialFeeTypes).catch(()=>setError('تعذر تحميل أنواع الرسوم.'))},[]);const submit=async()=>{if(!apartmentId||!amount||!specialFeeTypeId)return;setLoading(true);setError('');try{const response=await fetch(`${apiBase}/api/payments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apartmentId,amount:parseFloat(amount),paidOn:payDate,chargeIds:[],specialFeeTypeId})});const data=await response.json();if(!response.ok)throw new Error(data.error);setReceipt(data);setDone(true);onSuccess&&onSuccess()}catch(e){setError(e.message||'تعذر تسجيل الدفعة.')}finally{setLoading(false)}}; if(done)return <div className="modal-backdrop"><div className="receipt-success"><div className="success-icon"><CheckCircle2 size={37}/></div><h2>تم تسجيل الدفعة</h2><p>تم إنشاء الإيصال رقم <b>{receipt?.receiptNumber||'—'}</b> بنجاح</p><div className="receipt-mini"><span>المبلغ المسدّد</span><strong>{money(amount)}</strong><small>الشقة {apartments?.find(a=>a.id===apartmentId)?.number||'—'}</small></div><div className="receipt-buttons"><button className="btn ghost"><Printer size={17}/> طباعة الإيصال</button><button className="btn primary" onClick={close}>تم</button></div></div></div>; return <div className="modal-backdrop" onMouseDown={close}><div className="payment-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>تسجيل دفعة جديدة</h2><p>اختر نوع الرسم الخاص المراد سداده</p></div><IconButton onClick={close}><X size={20}/></IconButton></div><div className="form-grid"><label>الشقة<select value={apartmentId} onChange={e=>setApartmentId(e.target.value)} style={{padding:'8px',borderRadius:'4px',border:'1px solid #ddd',position:'relative',zIndex:'100'}}><option value="">اختر الشقة</option>{Array.isArray(apartments)&&apartments.map(a=><option key={a.id} value={a.id}>شقة {a.number} - {a.ownerName}</option>)}</select></label><label style={{position:'relative',zIndex:'1000'}}>نوع الرسم الخاص<select value={specialFeeTypeId} onChange={e=>setSpecialFeeTypeId(e.target.value)} style={{padding:'8px',borderRadius:'4px',border:'1px solid #ddd',width:'100%',position:'relative',zIndex:'1000'}}><option value="">اختر نوع الرسم</option>{Array.isArray(specialFeeTypes)&&specialFeeTypes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>المبلغ المدفوع<div className="money-input">ج.م <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></div></label><label>تاريخ الدفع<input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></label></div>{error&&<div style={{color:'#d32f2f',padding:'10px',fontSize:'14px'}}>{error}</div>}<div className="modal-footer"><button className="btn ghost" onClick={close}>إلغاء</button><button className="btn primary" disabled={!apartmentId||!amount||!specialFeeTypeId||loading} onClick={submit}>{loading?'جارٍ الحفظ...':<><CheckCircle2 size={17}/> حفظ وإنشاء إيصال</>}</button></div></div></div> }

const residenceLabel=(status)=>status==='RESIDENT'?'مقيم':status==='NON_RESIDENT'?'غير مقيم':'غير معروف';

const OWNER_COLUMNS=[
  {key:'ownerName',label:'المالك',value:r=>r.ownerName},
  {key:'phone',label:'الهاتف',value:r=>r.phone},
  {key:'residenceStatus',label:'حالة الإقامة',value:r=>residenceLabel(r.residenceStatus)},
  {key:'buildingName',label:'العمارة',value:r=>r.buildingName},
  {key:'apartmentNumber',label:'الشقة',value:r=>Number(r.apartmentNumber)||0},
  {key:'floor',label:'الطابق',value:r=>r.floor},
  {key:'area',label:'المساحة',value:r=>r.area},
  {key:'specialFeesBalance',label:'المبلغ المستحق',value:r=>r.specialFeesBalance},
];

function OwnersPage() { const [rows,setRows]=useState([]); const [error,setError]=useState(''); const [query,setQuery]=useState(''); const {sortKey,sortDir,onSort}=useSortable(); useEffect(()=>{fetch(`${apiBase}/api/owners`).then(r=>r.json()).then(setRows).catch(()=>setError('تعذر تحميل بيانات الملاك.'))},[]); const filtered=useMemo(()=>rows.filter(r=>`${r.ownerName} ${r.phone||''} ${r.buildingName||''} ${r.apartmentNumber||''}`.includes(query)),[rows,query]); const sorted=useMemo(()=>sortRows(filtered,OWNER_COLUMNS,sortKey,sortDir),[filtered,sortKey,sortDir]); if(error)return <section style={{padding:'20px'}}><p>{error}</p></section>; return <section className="apartments-section" style={{marginTop:0}}><div className="section-title" style={{padding:'20px 21px 0'}}><div><h2>الملاك</h2><p>بيان بجميع ملاك الشقق وأرقام التواصل</p></div><div className="table-actions"><div className="tiny-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث بالاسم أو الهاتف أو الشقة"/></div></div></div><div className="table-scroll"><table><thead><tr>{OWNER_COLUMNS.map(c=><SortableTh key={c.key} label={c.label} sortKey={c.key} activeKey={sortKey} dir={sortDir} onSort={onSort}/>)}</tr></thead><tbody>{sorted.map((r,i)=><tr key={r.ownerId+'-'+i}><td><div className="owner-cell"><div className="mini-avatar">{r.ownerName[0]}</div><strong>{r.ownerName}</strong></div></td><td style={{direction:'ltr',textAlign:'right'}}>{r.phone||'—'}</td><td>{residenceLabel(r.residenceStatus)}</td><td>{r.buildingName||'—'}</td><td>{r.apartmentNumber?<span className="apt-number">{r.apartmentNumber}</span>:'—'}</td><td>{r.floor??'—'}</td><td>{r.area===null||r.area===undefined?'—':`${num(r.area)} م²`}</td><td className={r.specialFeesBalance>0?'balance':'paid'}>{money(r.specialFeesBalance)}</td></tr>)}</tbody></table></div></section> }

function PaymentTypesPage() { const [paymentTypes,setPaymentTypes]=useState([]); const [specialFeeTypes,setSpecialFeeTypes]=useState([]); const [newType,setNewType]=useState(''); const [loading,setLoading]=useState(false); useEffect(()=>{Promise.all([fetch(`${apiBase}/api/payment-types`).then(r=>r.json()),fetch(`${apiBase}/api/special-fee-types`).then(r=>r.json())]).then(([pt,sft])=>{setPaymentTypes(pt);setSpecialFeeTypes(sft)}).catch(()=>alert('تعذر تحميل أنواع المدفوعات'))},[]);const add=async()=>{if(!newType.trim())return;setLoading(true);try{const response=await fetch(`${apiBase}/api/payment-types`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newType})});if(!response.ok)throw new Error('فشل إضافة النوع');setNewType('');fetch(`${apiBase}/api/payment-types`).then(r=>r.json()).then(setPaymentTypes)}catch(e){alert(e.message)}finally{setLoading(false)}}; const remove=async(id)=>{if(!confirm('هل تريد حذف هذا النوع؟'))return;try{const response=await fetch(`${apiBase}/api/payment-types/${id}`,{method:'DELETE'});if(!response.ok)throw new Error('فشل حذف النوع');fetch(`${apiBase}/api/payment-types`).then(r=>r.json()).then(setPaymentTypes)}catch(e){alert(e.message)}}; return <section style={{padding:'20px'}}><div className="section-title"><h2>أنواع المدفوعات</h2><p>إدارة فئات الدفع المتاحة</p></div><div style={{marginBottom:'30px'}}><div style={{marginBottom:'20px',display:'flex',gap:'10px'}}><input type="text" value={newType} onChange={e=>setNewType(e.target.value)} placeholder="أضف نوع دفع جديد" onKeyPress={e=>e.key==='Enter'&&add()} style={{flex:1,padding:'8px',borderRadius:'4px',border:'1px solid #ddd'}}/><button className="btn primary" disabled={loading} onClick={add}>{loading?'جارٍ الإضافة...':'إضافة'}</button></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:'12px'}}>{Array.isArray(paymentTypes)&&paymentTypes.map(t=><div key={t.id} style={{padding:'12px',border:'1px solid #e0e0e0',borderRadius:'4px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>{t.name}</span><button onClick={()=>remove(t.id)} style={{padding:'4px 8px',background:'#d32f2f',color:'white',border:'none',borderRadius:'4px',cursor:'pointer'}}>حذف</button></div>)}</div></div><div style={{borderTop:'2px solid #e0e0e0',paddingTop:'20px'}}><h3 style={{margin:'0 0 15px 0',color:'#1976d2'}}>الرسوم الخاصة (من استيراد Excel)</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(250px, 1fr))',gap:'12px'}}>{Array.isArray(specialFeeTypes)&&specialFeeTypes.map(t=><div key={t.id} style={{padding:'12px',border:'1px solid #2196f340',borderRadius:'4px',background:'#f5f9ff'}}><div style={{marginBottom:'6px'}}><strong style={{color:'#1976d2'}}>{t.name}</strong></div><div style={{fontSize:'13px',color:'#666',marginBottom:'8px'}}>{t.description}</div><div style={{fontSize:'12px',color:'#999',borderTop:'1px solid #e0e0e0',paddingTop:'6px'}}><span>معرّف: </span><code style={{background:'#f0f0f0',padding:'2px 4px',borderRadius:'2px'}}>{t.id.slice(0,12)}...</code></div></div>)}</div></div></section> }

function ImportModal({close}) { const [file,setFile]=useState(null),[loading,setLoading]=useState(false),[result,setResult]=useState(null),[error,setError]=useState(''); const submit=async()=>{if(!file)return;setLoading(true);setError('');try{const body=new FormData();body.append('file',file);const apiBase=import.meta.env.VITE_API_URL||'http://localhost:3001';const response=await fetch(`${apiBase}/api/imports/excel`,{method:'POST',body});const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!response.ok)throw new Error(data.error||text||`تعذر الوصول إلى خادم الاستيراد (HTTP ${response.status}).`);setResult(data)}catch(e){setError(e.message||'تعذر استيراد الملف.')}finally{setLoading(false)}};return <div className="modal-backdrop" onMouseDown={close}><div className="import-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>استيراد بيانات عمارة</h2><p>ملف Excel يحتوي على صفحة «مجمع» وصفحات الشقق</p></div><IconButton onClick={close}><X size={20}/></IconButton></div>{result?<div className="import-result"><div className="success-icon"><CheckCircle2 size={34}/></div><h3>تم حفظ البيانات بنجاح</h3><p>{result.buildingName}</p><div className="import-stats"><span><b>{num(result.apartments)}</b> شقة</span><span><b>{num(result.owners)}</b> مالك جديد</span><span><b>{num(result.payments)}</b> دفعة</span></div>{result.warnings?.length>0&&<small>تم الاستيراد مع {num(result.warnings.length)} تنبيه. راجع سجل الاستيراد لاحقًا.</small>}<button className="btn primary" onClick={close}>تم</button></div>:<div className="import-body"><label className="drop-zone"><Upload size={27}/><strong>{file?file.name:'اختر ملف Excel'}</strong><span>الصيغة المدعومة: XLSX · حتى ٢٠ م.ب</span><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><div className="import-note"><AlertTriangle size={16}/><span>الاستيراد يعيد استخدام العمارة والشقق الموجودة، ولا يكرر الإيصالات المستوردة سابقًا.</span></div>{error&&<div className="import-error">{error}</div>}<div className="modal-footer"><button className="btn ghost" onClick={close}>إلغاء</button><button className="btn primary" disabled={!file||loading} onClick={submit}>{loading?'جارٍ الاستيراد...':<><Upload size={16}/> بدء الاستيراد</>}</button></div></div>}</div></div> }

const BUILDING_NUMBERS=[1,3,5,9,10,12,14,16,17,18,19,20,21,25,60,63,67,68,69,70];

function HomePage({buildings, onSelectBuilding}) {
  const byName=useMemo(()=>new Map(buildings.map(b=>[b.name,b])),[buildings]);
  return <section className="apartments-section" style={{marginTop:0}}>
    <div className="section-title" style={{padding:'20px 21px 0'}}>
      <div><h2>العمارات</h2><p>اضغط على عمارة لعرض تفاصيلها الكاملة</p></div>
    </div>
    <div className="table-scroll">
      <table>
        <thead><tr><th>العمارة</th><th>عدد الشقق</th><th>المبلغ المستحق</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          {BUILDING_NUMBERS.map(n=>{
            const name=`عمارة ${n}`;
            const b=byName.get(name);
            const hasData=!!b;
            return <tr key={n} onClick={()=>hasData&&onSelectBuilding(b.id)} style={{cursor:hasData?'pointer':'default',opacity:hasData?1:0.5}}>
              <td><strong>{name}</strong></td>
              <td>{hasData?num(b.apartmentCount):'—'}</td>
              <td>{hasData?money(b.specialFeesBalance):'—'}</td>
              <td><span className="status" style={hasData?{background:'#e5f2e9',color:'#2f8057'}:{background:'#f1f3f1',color:'#8a978f'}}>{hasData?'بيانات متاحة':'لا توجد بيانات بعد'}</span></td>
              <td>{hasData&&<IconButton><ChevronLeft size={18}/></IconButton>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}

function App(){
  const [active,setActive]=useState('العمارات');
  const [mobile,setMobile]=useState(false);
  const [selected,setSelected]=useState(null);
  const [payment,setPayment]=useState(false);
  const [paymentApartment,setPaymentApartment]=useState(null);
  const [importOpen,setImportOpen]=useState(false);
  const [dashboardData,setDashboardData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedBuildingId,setSelectedBuildingId]=useState(null);

  const refreshData=async()=>{try{const dashData=await fetch(`${apiBase}/api/dashboard`).then(r=>r.json());setDashboardData(dashData)}catch(e){console.error('Error refreshing data:',e)}};

  useEffect(()=>{
    fetch(`${apiBase}/api/dashboard`).then(r=>r.json()).then(setDashboardData).catch(()=>setError('تعذر تحميل البيانات من الخادم')).finally(()=>setLoading(false));
  },[]);

  const buildings=dashboardData?.buildings||[];
  const currentBuilding=buildings.find(b=>b.id===selectedBuildingId)||buildings[0]||null;
  const apartments=currentBuilding?.apartments||[];
  const totals=dashboardData?.totals||{owed:0,paid:0,balance:0,apartments:0,overdue:0};
  const buildingTotals=currentBuilding?{apartments:currentBuilding.apartmentCount,specialFeesOwed:currentBuilding.specialFeesOwed,specialFeesCollected:currentBuilding.specialFeesCollected,specialFeesBalance:currentBuilding.specialFeesBalance,specialFeesOverdue:currentBuilding.apartments.filter(a=>a.specialFeesBalance>0).length}:totals;
  const recentPayments=dashboardData?.recentPayments||[];
  const goToBuilding=(id)=>{setSelectedBuildingId(id);setActive('العمارات')};
  const breadcrumb=active==='العمارات'?{parent:'العمارات',current:currentBuilding?.name||'لا توجد عمارات'}:{parent:null,current:active};

  if(loading)return <div className="app-shell loading">جارٍ تحميل البيانات...</div>;
  if(error)return <div className="app-shell error">{error}</div>;

  return <div className="app-shell"><Sidebar active={active} setActive={setActive}/>{mobile&&<><div className="mobile-scrim" onClick={()=>setMobile(false)}/><Sidebar mobile active={active} setActive={setActive} close={()=>setMobile(false)}/></>}<main><Header setMobile={setMobile} onImport={()=>setImportOpen(true)} breadcrumb={breadcrumb} onBack={()=>setActive('الرئيسية')}/><div className="content">{active==='انواع المدفوعات'?<PaymentTypesPage/>:active==='الملاك'?<OwnersPage/>:active==='الرئيسية'?<HomePage buildings={buildings} onSelectBuilding={goToBuilding}/>:<><BuildingHero setPayment={setPayment} setPaymentApartment={setPaymentApartment} building={currentBuilding}/><FinanceOverview totals={buildingTotals}/><div className="insights"><PaymentChart/><RecentPayments payments={recentPayments}/></div><ApartmentsTable apartments={apartments} onSelect={setSelected}/></>}</div></main>{selected&&<ApartmentPanel apartmentId={selected} close={()=>setSelected(null)} setPayment={setPayment} setPaymentApartment={setPaymentApartment}/>}{payment&&<PaymentModal close={()=>{setPayment(false);setPaymentApartment(null)}} selectedApartmentId={paymentApartment} apartments={apartments} onSuccess={()=>{refreshData();setSelected(null)}}/>} {importOpen&&<ImportModal close={()=>setImportOpen(false)}/>}</div>}

createRoot(document.getElementById('root')).render(<App/>);
