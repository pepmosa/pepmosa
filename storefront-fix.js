/* PEPMOSA storefront repair layer.
   Loads the active/open GB, products + variants, admin-fee payment modal,
   and email verification without replacing the existing page markup. */
(function () {
  'use strict';

  let fixGB = null;
  let fixProducts = [];
  let fixCart = JSON.parse(localStorage.pepmosaCart || '[]');
  let verifiedEmail = localStorage.getItem('pepmosa_verified_email') || '';

  const esc = window.esc || function (v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  };
  const peso = v => '₱' + Number(v || 0).toLocaleString('en-PH',{minimumFractionDigits:2});
  const $ = id => document.getElementById(id);

  function ensureStyles() {
    if ($('pepFixStyles')) return;
    const s = document.createElement('style'); s.id='pepFixStyles';
    s.textContent = `
      .pepFixBtn{border:0;border-radius:12px;padding:11px 16px;font-weight:900;cursor:pointer;background:#d72b91;color:#fff}
      .pepFixBtn.secondary{background:#fff;color:#2a2029;border:1px solid #ead9e5}
      .pepFixBtn.success{background:#e6f8ef;color:#147644}
      .pepFixBtn.danger{background:#fde9ed;color:#b52842}
      .pepFixActions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
      .pepFixBadge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:900;background:#e5f7ed;color:#147644}
      .pepFixModal{position:fixed;inset:0;background:rgba(35,20,32,.52);display:none;align-items:center;justify-content:center;padding:18px;z-index:99999}
      .pepFixModal.open{display:flex}
      .pepFixBox{width:min(560px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:24px;box-shadow:0 25px 80px rgba(0,0,0,.22)}
      .pepFixBox h2{margin:0 0 8px}.pepFixMuted{color:#766b74;font-size:13px;line-height:1.55}
      .pepFixField{display:flex;flex-direction:column;gap:6px;margin-top:12px}.pepFixField label{font-size:11px;font-weight:900;text-transform:uppercase}
      .pepFixField input{border:1px solid #e5d5e1;border-radius:11px;padding:12px;width:100%;box-sizing:border-box}
      .pepFixQr{display:block;max-width:250px;max-height:250px;margin:15px auto;border:1px solid #ead9e5;border-radius:14px;padding:8px;object-fit:contain}
      .pepFixProduct{height:100%;display:flex;flex-direction:column}.pepFixVariant{display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px dashed #ead9e5;padding:10px 0}.pepFixQty{width:70px;padding:8px;border:1px solid #e5d5e1;border-radius:9px}
      .pepFixNotice{padding:12px 14px;border-radius:12px;background:#fff2fa;margin:12px 0}.pepFixNotice.success{background:#e8f8ef;color:#176d41}.pepFixNotice.error{background:#fff0f3;color:#a6243d}
    `;
    document.head.appendChild(s);
  }

  function addModal(id, html) {
    if ($(id)) return;
    const d=document.createElement('div'); d.id=id; d.className='pepFixModal'; d.innerHTML=html;
    d.addEventListener('click',e=>{if(e.target===d)d.classList.remove('open')});
    document.body.appendChild(d);
  }

  function ensureUI() {
    ensureStyles();
    const status=$('gbStatus');
    if (status && !$('pepAdminFeeCard')) {
      const card=document.createElement('div'); card.id='pepAdminFeeCard'; card.className='notice';
      card.style.marginTop='14px';
      card.innerHTML='<div style="font-weight:900">Admin Fee</div><div id="pepAdminFeeText" class="pepFixMuted" style="margin:4px 0 10px">Loading…</div><button class="pepFixBtn" id="pepPayAdminBtn">PAY ADMIN FEE</button>';
      status.parentNode.insertBefore(card,status.nextSibling);
      $('pepPayAdminBtn').onclick=openAdminFee;
    }
    addModal('pepAdminFeeModal', `
      <div class="pepFixBox"><h2>Pay Admin Fee</h2><div id="pepFeeBody"></div>
      <div class="pepFixField"><label>Email</label><input id="pepFeeEmail" type="email" placeholder="your@email.com"></div>
      <div class="pepFixField"><label>Payment Reference / Transaction ID</label><input id="pepFeeRef" placeholder="Enter your reference number"></div>
      <div class="pepFixField"><label>Payment Note (optional)</label><input id="pepFeeNote" placeholder="GCash / Maya / Bank"></div>
      <div id="pepFeeMsg"></div><div class="pepFixActions"><button class="pepFixBtn" id="pepSubmitFee">I HAVE PAID</button><button class="pepFixBtn secondary" onclick="document.getElementById('pepAdminFeeModal').classList.remove('open')">CANCEL</button></div></div>`);
    addModal('pepVerifyModal', `
      <div class="pepFixBox"><h2>Verify Your Email</h2><div id="pepVerifyBody" class="pepFixMuted">Enter your email and we’ll send a verification link.</div>
      <div class="pepFixField"><label>Email</label><input id="pepVerifyEmail" type="email" placeholder="your@email.com"></div>
      <div id="pepVerifyMsg"></div><div class="pepFixActions"><button class="pepFixBtn" id="pepSendVerify">SEND VERIFICATION EMAIL</button><button class="pepFixBtn secondary" onclick="document.getElementById('pepVerifyModal').classList.remove('open')">CLOSE</button></div></div>`);
    addModal('pepSuccessModal', `
      <div class="pepFixBox" style="text-align:center"><div style="font-size:44px">✓</div><h2 id="pepSuccessTitle">Success!</h2><div id="pepSuccessText" class="pepFixMuted"></div><div class="pepFixActions" style="justify-content:center"><button class="pepFixBtn" onclick="document.getElementById('pepSuccessModal').classList.remove('open')">OK</button></div></div>`);
    $('pepSubmitFee').onclick=submitAdminFee;
    $('pepSendVerify').onclick=sendVerification;
  }

  function openAdminFee(){
    if(!fixGB){return showSuccess('Unavailable','There is no open Group Buy right now.','pepSuccessModal');}
    $('pepFeeBody').innerHTML = `<div class="pepFixNotice"><b>${esc(fixGB.gb_number)}</b> — ${esc(fixGB.customer_facing_name||fixGB.gb_number)}<br><b>Admin Fee: ${peso(fixGB.admin_fee)}</b></div>` +
      (fixGB.admin_fee_qr_url ? `<img class="pepFixQr" src="${esc(fixGB.admin_fee_qr_url)}" alt="Admin Fee QR">` : '<div class="pepFixNotice error">Admin Fee QR is not configured yet.</div>');
    $('pepFeeEmail').value=localStorage.getItem('pepmosa_customer_email')||'';
    $('pepAdminFeeModal').classList.add('open');
  }

  async function submitAdminFee(){
    const email=$('pepFeeEmail').value.trim().toLowerCase(), ref=$('pepFeeRef').value.trim(), note=$('pepFeeNote').value.trim();
    const msg=$('pepFeeMsg');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg.innerHTML='<div class="pepFixNotice error">Please enter a valid email.</div>';
    if(!ref) return msg.innerHTML='<div class="pepFixNotice error">Please enter your payment reference.</div>';
    localStorage.setItem('pepmosa_customer_email',email);
    const {error}=await window.sb.from('admin_fee_payments').insert({gb_number:fixGB.gb_number,email,amount:Number(fixGB.admin_fee||0),payment_reference:ref,note,status:'SUBMITTED'});
    if(error){
      console.error(error);
      msg.innerHTML='<div class="pepFixNotice error">Payment could not be recorded. Please make sure the admin-fee SQL migration has been run.</div>';
      return;
    }
    $('pepAdminFeeModal').classList.remove('open');
    showSuccess('Admin Fee Submitted','Your admin fee payment has been recorded. Next, verify your email so we can attach your order and payment to your account.','pepSuccessModal');
    setTimeout(()=>openVerify(email),250);
  }

  function openVerify(email){$('pepVerifyEmail').value=email||localStorage.getItem('pepmosa_customer_email')||'';$('pepVerifyMsg').innerHTML='';$('pepVerifyModal').classList.add('open');}

  async function sendVerification(){
    const email=$('pepVerifyEmail').value.trim().toLowerCase(), msg=$('pepVerifyMsg');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg.innerHTML='<div class="pepFixNotice error">Please enter a valid email.</div>';
    const {error}=await window.sb.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.href,shouldCreateUser:true}});
    if(error) return msg.innerHTML='<div class="pepFixNotice error">'+esc(error.message)+'</div>';
    localStorage.setItem('pepmosa_pending_verify_email',email);
    msg.innerHTML='<div class="pepFixNotice success">Verification email sent. Check your inbox and click the verification link. When you return here, you will see a confirmation popup.</div>';
  }

  function showSuccess(title,text){$('pepSuccessTitle').textContent=title;$('pepSuccessText').textContent=text;$('pepSuccessModal').classList.add('open')}

  function renderFixProducts(){
    const grid=$('productGrid'); if(!grid)return;
    const q=($('search')?.value||'').toLowerCase();
    const list=fixProducts.filter(p=>`${p.product_name} ${p.category} ${(p.product_variants||[]).map(v=>v.strength).join(' ')}`.toLowerCase().includes(q));
    if(!list.length){grid.innerHTML='<div class="card"><b>No products available yet.</b><br><span class="muted">No active products are available for the current Group Buy.</span></div>';return;}
    grid.innerHTML=list.map(p=>`<div class="card pepFixProduct"><div class="productImg" style="height:180px">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.product_name)}">`:''}</div><h3>${esc(p.product_name)}</h3><div class="muted" style="margin-bottom:10px">${esc(p.description||'')}</div>${(p.product_variants||[]).map(v=>{const min=getMinimum(v.variant_id);return `<div class="pepFixVariant"><div><b>${esc(v.strength)}</b><br><span class="muted">${peso(v.price)} • minimum ${min}</span></div><input class="pepFixQty" id="qty_${esc(v.variant_id)}" type="number" min="${min}" value="${min}"><button class="pepFixBtn" onclick="window.pepAddToCart('${esc(p.product_id)}','${esc(v.variant_id)}')">ADD</button></div>`}).join('')}</div>`).join('');
  }

  function getMinimum(variantId){const row=(fixGB?window.pepMinimums||[]:[]).find(x=>x.variant_id===variantId&&x.gb_number===fixGB.gb_number);return Math.max(1,Number(row?.minimum_qty||1));}

  window.pepAddToCart=function(pid,vid){const p=fixProducts.find(x=>x.product_id===pid),v=p?.product_variants?.find(x=>x.variant_id===vid);if(!p||!v)return;const min=getMinimum(vid),q=Math.max(min,Number($('qty_'+vid)?.value||min));const found=fixCart.find(x=>x.variant_id===vid&&x.gb_number===fixGB.gb_number);if(found)found.qty+=q;else fixCart.push({gb_number:fixGB.gb_number,product_id:pid,variant_id:vid,product_name:p.product_name,strength:v.strength,unit_price:Number(v.price),qty:q});localStorage.pepmosaCart=JSON.stringify(fixCart);if(typeof window.renderCart==='function')window.renderCart();if($('cartCount'))$('cartCount').textContent=fixCart.reduce((a,x)=>a+x.qty,0);showSuccess('Added to Cart',`${q} × ${p.product_name} ${v.strength} added to your cart.`);};

  async function loadFix(){
    try{
      if(!window.sb) initSupabase();
      ensureUI();
      const {data:gb,error:ge}=await window.sb.from('group_buys').select('*').eq('status','OPEN').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(ge)throw ge; fixGB=gb;
      if(!gb){$('gbStatus').innerHTML='<div class="notice error">No open Group Buy right now.</div>'; if($('pepAdminFeeCard'))$('pepAdminFeeCard').style.display='none'; return;}
      if($('gbStatus'))$('gbStatus').innerHTML=`<b>${esc(gb.customer_facing_name||gb.gb_number)}</b> <span class="status open">OPEN</span>`;
      $('pepAdminFeeText').textContent=`${peso(gb.admin_fee)} admin fee for ${gb.gb_number}`;$('pepAdminFeeCard').style.display='block';
      const {data:links,error:le}=await window.sb.from('gb_categories').select('category_name').eq('gb_number',gb.gb_number); if(le)throw le;
      const allowed=new Set((links||[]).map(x=>x.category_name));
      let pq=window.sb.from('products').select('product_id,product_name,category,description,image_url,active,product_variants(variant_id,strength,price,active)').eq('active',true);
      const {data:ps,error:pe}=await pq; if(pe)throw pe;
      // If the GB has explicit category assignments, respect them. If none are assigned,
      // fall back to all active products so an OPEN GB never appears empty by accident.
      fixProducts=(allowed.size?ps.filter(p=>allowed.has(p.category)):ps).map(p=>({...p,product_variants:(p.product_variants||[]).filter(v=>v.active!==false)}));
      const {data:mins,error:me}=await window.sb.from('gb_minimum_quantities').select('gb_number,product_id,variant_id,minimum_qty').eq('gb_number',gb.gb_number);window.pepMinimums=me?[]:(mins||[]);
      renderFixProducts();
      hookCheckout(); hookPlaceOrder();
    }catch(e){console.error('PEPMOSA storefront repair:',e);if($('gbStatus'))$('gbStatus').innerHTML='<div class="notice error">Unable to load the current Group Buy. Please refresh and try again.</div>';}
  }

  function hookSearch(){const s=$('search');if(s)s.addEventListener('input',renderFixProducts);}

  function hookCheckout(){
    if(typeof window.checkout!=='function' || window.checkout.__pepWrapped) return;
    const originalCheckout=window.checkout;
    const wrappedCheckout=async function(){
      const email=localStorage.getItem('pepmosa_verified_email')||'';
      if(!email){ openVerify(localStorage.getItem('pepmosa_customer_email')||''); return; }
      if(!fixGB){ showSuccess('No Open Group Buy','There is no open Group Buy right now.'); return; }
      try{
        const {data,error}=await window.sb.from('admin_fee_payments').select('id,status').eq('gb_number',fixGB.gb_number).eq('email',email).in('status',['SUBMITTED','PAID']).order('created_at',{ascending:false}).limit(1);
        if(error || !(data||[]).length){ openAdminFee(); return; }
      }catch(e){ console.error(e); openAdminFee(); return; }
      return originalCheckout();
    };
    wrappedCheckout.__pepWrapped=true; window.checkout=wrappedCheckout;
  }

  function hookPlaceOrder(){
    if(typeof window.placeOrder!=='function' || window.placeOrder.__pepWrapped) return;
    const originalPlaceOrder=window.placeOrder;
    const wrappedPlaceOrder=async function(){
      const verified=localStorage.getItem('pepmosa_verified_email')||'';
      const entered=($('email')?.value||'').trim().toLowerCase();
      if(!verified){ openVerify(entered); return; }
      if(entered && entered!==verified){ alert('Please use the same verified email: '+verified); if($('email'))$('email').value=verified; return; }
      if($('email'))$('email').value=verified;
      return originalPlaceOrder();
    };
    wrappedPlaceOrder.__pepWrapped=true; window.placeOrder=wrappedPlaceOrder;
  }

  async function authReturn(){
    const pending=localStorage.getItem('pepmosa_pending_verify_email'); if(!pending)return;
    const {data:{session}}=await window.sb.auth.getSession();
    if(session?.user?.email && session.user.email.toLowerCase()===pending.toLowerCase()){
      verifiedEmail=session.user.email.toLowerCase();localStorage.setItem('pepmosa_verified_email',verifiedEmail);localStorage.removeItem('pepmosa_pending_verify_email');
      if($('pepVerifyModal'))$('pepVerifyModal').classList.remove('open');showSuccess('Email Verified ✓','Your email has been successfully verified. You can now continue with your order.');
    }
  }

  function boot(){
    if(!document.body)return; ensureUI(); hookSearch();
    let tries=0;const t=setInterval(()=>{tries++;if(window.sb){clearInterval(t);loadFix();authReturn();}if(tries>100)clearInterval(t)},100);
    if(window.sb){clearInterval(t);loadFix();authReturn();}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
