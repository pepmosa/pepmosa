/* PEPMOSA admin repair layer. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const peso=v=>'₱'+Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2});

  async function deleteGB(gbNumber){
    if(!gbNumber)return;
    if(!confirm(`DELETE ${gbNumber}?\n\nThis permanently deletes the Group Buy and ALL records belonging to it, including orders, order items, admin-fee payments, GB category settings, minimums, kit inventory and kit reservations.\n\nThis cannot be undone.`))return;
    try{
      const sb=window.sb||window.__sb; if(!sb)throw new Error('Supabase is not initialized. Please refresh the page.');
      const steps=[
        ['kit_reservations','gb_number'],['kit_inventory','gb_number'],['admin_fee_payments','gb_number'],
        ['gb_minimum_quantities','gb_number'],['gb_categories','gb_number'],['orders','gb_number'],['group_buys','gb_number']
      ];
      for(const [table,col] of steps){
        const {error}=await sb.from(table).delete().eq(col,gbNumber);
        if(error && !/does not exist|relation .* does not exist/i.test(error.message||'')) throw error;
      }
      if(typeof window.loadGroupBuys==='function')await window.loadGroupBuys();
      else if(typeof window.renderGroupBuys==='function')await window.renderGroupBuys();
      if(typeof window.showMessage==='function')window.showMessage(`${gbNumber} and all related records were deleted.`,`success`);
      else alert(`${gbNumber} deleted successfully.`);
    }catch(e){console.error(e);alert('DELETE FAILED: '+(e.message||e));}
  }
  window.pepDeleteGB=deleteGB;

  async function renderFeesFix(){
    const box=$('feeList');if(!box)return;
    const sb=window.sb||window.__sb;if(!sb){box.innerHTML='<div class="notice error">Supabase is not initialized.</div>';return;}
    box.innerHTML='Loading…';
    const q=($('feeSearch')?.value||'').trim().toLowerCase();
    let query=sb.from('admin_fee_payments').select('*').order('created_at',{ascending:false}).limit(200);
    if(q)query=query.ilike('email','%'+q+'%');
    const {data,error}=await query;
    if(error){box.innerHTML='<div class="notice error">Admin fee payments table is not ready. Run the admin_fee_payments migration once.</div>';return;}
    if(!(data||[]).length){box.innerHTML='<div class="empty">No admin fee payments yet.</div>';return;}
    box.innerHTML=data.map(x=>`<div class="item"><div class="itemHead"><div><b>${esc(x.email)}</b><div class="small">${esc(x.gb_number)} • ${peso(x.amount)} • ${new Date(x.created_at).toLocaleString('en-PH')}</div><div class="small">Reference: ${esc(x.payment_reference||'—')}</div><div class="small">${esc(x.note||'')}</div></div><span class="badge ${x.status==='PAID'?'green':x.status==='REJECTED'?'red':'yellow'}">${esc(x.status)}</span></div><div class="actions"><button class="btn success" onclick="window.pepSetFeeStatus('${esc(x.id)}','PAID')">MARK PAID</button><button class="btn danger" onclick="window.pepSetFeeStatus('${esc(x.id)}','REJECTED')">REJECT</button></div></div>`).join('');
  }

  window.pepSetFeeStatus=async function(id,status){
    const sb=window.sb||window.__sb;if(!sb)return;
    const {error}=await sb.from('admin_fee_payments').update({status,updated_at:new Date().toISOString()}).eq('id',id);
    if(error)alert(error.message);else renderFeesFix();
  };
  window.renderFees=renderFeesFix;

  function addGBDeleteButtons(){
    const list=$('gbList');if(!list)return;
    list.querySelectorAll('.item').forEach(item=>{
      if(item.querySelector('.pepDeleteGBBtn'))return;
      const text=item.textContent||'';
      const match=text.match(/\b(GB[-\w]+)\b/); if(!match)return;
      const actions=item.querySelector('.actions')||item.appendChild(Object.assign(document.createElement('div'),{className:'actions'}));
      const b=document.createElement('button');b.className='btn danger pepDeleteGBBtn';b.textContent='DELETE GB';b.onclick=()=>deleteGB(match[1]);actions.appendChild(b);
    });
  }

  function boot(){
    let tries=0;const t=setInterval(()=>{
      tries++;
      if(window.sb && $('adminApp')){
        clearInterval(t);
        const feeTab=document.querySelector('[data-panel="feesPanel"]');
        if(feeTab)feeTab.addEventListener('click',()=>setTimeout(renderFeesFix,50));
        if($('feeSearch'))$('feeSearch').addEventListener('input',renderFeesFix);
        const gbList=$('gbList');if(gbList)new MutationObserver(addGBDeleteButtons).observe(gbList,{childList:true,subtree:true});
        setTimeout(addGBDeleteButtons,500);
      }
      if(tries>120)clearInterval(t);
    },100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
