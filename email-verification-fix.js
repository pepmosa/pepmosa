/* PEPMOSA email verification repair layer.
   Flow: admin-approved fee -> customer clicks VERIFY EMAIL -> magic link -> verified state.
*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const sb = () => window.sb || window.__sb;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));

  function addStyles() {
    if ($('pepEmailFixStyles')) return;
    const s = document.createElement('style');
    s.id = 'pepEmailFixStyles';
    s.textContent = `
      #pepVerifyModal .pepFeeBox{border:1px solid #ead9e5}
      #pepVerifyModal .pepEmailFixNote{background:#fff1fa;border-radius:13px;padding:13px 15px;margin:12px 0;color:#6f5367;font-size:13px;line-height:1.5}
      #pepVerifyModal .pepEmailFixSuccess{background:#e8f8ef;color:#176e42}
    `;
    document.head.appendChild(s);
  }

  function closeVerifyIfAutoOpened() {
    const modal = $('pepVerifyModal');
    if (!modal) return;
    // The older repair layer auto-opened this modal immediately after approval.
    // Close that automatic opening so the customer explicitly clicks VERIFY EMAIL.
    if (modal.classList.contains('open') && localStorage.getItem('pepmosa_email_fix_auto_close') !== 'done') {
      const feeId = localStorage.getItem('pepmosa_fee_payment_id');
      const openedAt = Number(localStorage.getItem('pepmosa_fee_approved_at') || 0);
      if (feeId && openedAt && Date.now() - openedAt < 5000) {
        modal.classList.remove('open');
        localStorage.setItem('pepmosa_email_fix_auto_close', 'done');
      }
    }
  }

  async function checkApprovedPayment() {
    const S = sb();
    if (!S) return;
    const feeId = localStorage.getItem('pepmosa_fee_payment_id');
    const gb = window.pepmosaCurrentGB || window.currentGB || null;
    if (!feeId) return;

    try {
      let q = S.from('admin_fee_payments').select('*').eq('id', feeId).maybeSingle();
      const { data, error } = await q;
      if (error || !data) return;
      if (data.status === 'PAID') {
        const was = localStorage.getItem('pepmosa_fee_approved_at');
        if (!was) localStorage.setItem('pepmosa_fee_approved_at', String(Date.now()));
      }
    } catch (_) {}
  }

  async function sendVerification() {
    const emailEl = $('pepVerifyEmail');
    const msg = $('pepVerifyMsg');
    const btn = $('pepVerifySend');
    const email = (emailEl?.value || '').trim().toLowerCase();
    const S = sb();

    if (!S) {
      if (msg) msg.innerHTML = '<div class="pepFeeNotice error">System is still loading. Please refresh and try again.</div>';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (msg) msg.innerHTML = '<div class="pepFeeNotice error">Please enter a valid email address.</div>';
      return;
    }

    const feeId = localStorage.getItem('pepmosa_fee_payment_id');
    if (!feeId) {
      if (msg) msg.innerHTML = '<div class="pepFeeNotice error">Please submit your admin fee first.</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'SENDING…';
    if (msg) msg.innerHTML = '';

    try {
      const { data: payment, error: paymentError } = await S
        .from('admin_fee_payments')
        .select('id,status,gb_number')
        .eq('id', feeId)
        .maybeSingle();

      if (paymentError) throw paymentError;
      if (!payment || payment.status !== 'PAID') {
        throw new Error('Your admin fee has not been approved yet. Please wait for admin approval.');
      }

      // Save the email locally for the consolidated customer flow.
      localStorage.setItem('pepmosa_customer_email', email);
      localStorage.setItem('pepmosa_pending_verify_email', email);

      // Supabase passwordless email sends a confirmation/magic link.
      // After the link is clicked, the session contains the confirmed email.
      const { error } = await S.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;

      if (msg) msg.innerHTML = '<div class="pepFeeNotice success pepEmailFixSuccess"><b>Verification email sent ✓</b><br>Check your Gmail inbox (and Spam/Promotions), then click the PEPMOSA verification link. You will return to PEPMOSA automatically.</div>';
    } catch (e) {
      console.error('PEPMOSA EMAIL VERIFICATION ERROR:', e);
      let text = e?.message || 'Unable to send verification email.';
      if (/rate limit|too many|email address not authorized/i.test(text)) {
        text += ' Supabase email delivery is currently rate-limited or restricted. Configure Custom SMTP in Supabase for customer emails.';
      }
      if (msg) msg.innerHTML = '<div class="pepFeeNotice error">' + esc(text) + '</div>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'SEND VERIFICATION EMAIL';
    }
  }

  async function handleAuthReturn() {
    const S = sb();
    if (!S) return;
    try {
      const { data: sessionData } = await S.auth.getSession();
      const user = sessionData?.session?.user;
      const pending = (localStorage.getItem('pepmosa_pending_verify_email') || '').toLowerCase();
      if (!user || !user.email) return;
      if (pending && user.email.toLowerCase() !== pending) return;

      const verified = !!user.email_confirmed_at;
      if (!verified) return;

      const email = user.email.toLowerCase();
      localStorage.setItem('pepmosa_verified_email', email);
      localStorage.setItem('pepmosa_customer_email', email);
      localStorage.removeItem('pepmosa_pending_verify_email');

      // Associate the approved payment with the verified email.
      const feeId = localStorage.getItem('pepmosa_fee_payment_id');
      if (feeId) {
        try {
          await S.from('admin_fee_payments')
            .update({ email })
            .eq('id', feeId)
            .eq('status', 'PAID');
        } catch (_) {}
      }

      $('pepVerifyModal')?.classList.remove('open');

      // Show the existing PEPMOSA success popup when available.
      if ($('pepInfoTitle') && $('pepInfoText') && $('pepInfoModal')) {
        $('pepInfoTitle').textContent = 'Email Verified ✓';
        $('pepInfoText').textContent = 'Your email has been verified. You can now add products to your cart and place an order.';
        $('pepInfoOk').textContent = 'START ORDERING';
        $('pepInfoModal').classList.add('open');
      } else {
        alert('Email Verified ✓\nYou can now continue ordering.');
      }

      if (typeof window.renderProducts === 'function') window.renderProducts();
      if (typeof window.refreshFeeState === 'function') window.refreshFeeState();
    } catch (e) {
      console.error('PEPMOSA AUTH RETURN ERROR:', e);
    }
  }

  function install() {
    addStyles();

    const verifyButton = $('pepVerifySend');
    if (verifyButton && !verifyButton.dataset.emailFixInstalled) {
      verifyButton.dataset.emailFixInstalled = '1';
      // Remove the previous inline/property handler and install the repaired one.
      verifyButton.onclick = sendVerification;
    }

    closeVerifyIfAutoOpened();
    checkApprovedPayment();
    handleAuthReturn();
  }

  document.addEventListener('DOMContentLoaded', () => {
    let n = 0;
    const timer = setInterval(() => {
      n++;
      install();
      if (n > 300) clearInterval(timer);
    }, 100);
  });

  // Also catch the auth callback/session event without requiring a reload.
  const timer = setInterval(() => {
    if (sb()?.auth?.onAuthStateChange) {
      clearInterval(timer);
      sb().auth.onAuthStateChange(() => setTimeout(handleAuthReturn, 150));
    }
  }, 250);
})();
