// Report gate shared by every whitepaper page: TechSpheres (Mailchimp) double opt-in via the
// techspheres Edge Function, then a short-lived download link. Needs js/supabase.js first and a
// <form id="leadForm" data-slug="..."> with the formBody / formPending / formDone blocks.
(() => {
  const $ = id => document.getElementById(id);
  const form = $('leadForm'); if (!form) return;
  const SLUG = form.dataset.slug, TOKEN_KEY = 'atares-ts-' + SLUG, err = $('err');
  const store = { get() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (_) { return null; } },
                  set(v) { try { v ? localStorage.setItem(TOKEN_KEY, JSON.stringify(v)) : localStorage.removeItem(TOKEN_KEY); } catch (_) {} } };
  const ERRORS = {
    invalid_email: 'Please enter your business email, for example name@company.com.',
    address_blocked: 'This address cannot receive our newsletter. Please use a different email.',
    not_configured: 'The subscription is not available right now. Please try again later.',
    default: 'Something went wrong. Please try again in a moment.'
  };
  function show(state) {
    $('formBody').hidden = state !== 'form'; $('formPending').hidden = state !== 'pending'; $('formDone').hidden = state !== 'done';
  }
  function unlocked(url, name) {
    $('doneTitle').textContent = name ? 'Thank you, ' + name : 'Thank you';
    const ready = !!url;
    $('dlLink').hidden = !ready; $('dlNote').hidden = !ready; $('notYet').hidden = ready;
    if (ready) $('dlLink').href = url;
    show('done');
  }
  let poll = null;
  function pending(saved) {
    $('pendingEmail').textContent = saved.email; show('pending');
    clearInterval(poll);
    let n = 0; // check quietly every 6 s for 10 minutes while the tab is visible
    poll = setInterval(() => { if (++n > 100) return clearInterval(poll); if (!document.hidden) check(true); }, 6000);
  }
  async function check(quiet) {
    const saved = store.get(); if (!saved) return show('form');
    const btn = $('checkBtn'); if (!quiet) { btn.disabled = true; $('pendingMsg').textContent = ''; }
    try {
      const r = await window.ataresSupabase.techspheres({ action: 'check', token: saved.token });
      if (r.status === 'subscribed') { clearInterval(poll); unlocked(r.url, saved.name); }
      else if (!quiet) $('pendingMsg').textContent =
        r.status === 'not_techspheres' ? 'Your address is subscribed, but not to TechSpheres. Please submit the form again to add TechSpheres.'
        : r.status === 'unsubscribed' || r.status === 'missing' ? 'This subscription is not active. Please submit the form again.'
        : 'We have not received your confirmation yet. Please click the link in the email, then try again.';
    } catch (e) {
      if (e.code === 'invalid_token') { store.set(null); show('form'); }
      else if (!quiet) $('pendingMsg').textContent = ERRORS[e.code] || ERRORS.default;
    } finally { btn.disabled = false; }
  }
  $('checkBtn').addEventListener('click', () => check(false));
  $('restart').addEventListener('click', () => { clearInterval(poll); store.set(null); show('form'); $('em').focus(); });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const em = $('em'), ok = $('ok'), fn = $('fn'), ln = $('ln');
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim());
    [fn, ln].forEach(f => f.setAttribute('aria-invalid', f.value.trim() ? 'false' : 'true'));
    em.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!form.querySelector('input[name=sal]:checked')) { err.textContent = 'Please choose a salutation.'; form.querySelector('input[name=sal]').focus(); return; }
    if (!fn.value.trim() || !ln.value.trim()) { err.textContent = 'Please enter your first and last name.'; (fn.value.trim() ? ln : fn).focus(); return; }
    if (!valid) { err.textContent = ERRORS.invalid_email; em.focus(); return; }
    if (!ok.checked) { err.textContent = 'The report is reserved for TechSpheres subscribers. Please tick the box to subscribe.'; ok.focus(); return; }
    err.textContent = '';
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    const val = n => (form.querySelector(`input[name=${n}]:checked`) || {}).value || null;
    try {
      const r = await window.ataresSupabase.techspheres({
        action: 'subscribe', slug: SLUG, email: em.value.trim(),
        firstName: fn.value.trim(), lastName: ln.value.trim(), company: $('co').value.trim(), position: $('po').value.trim(),
        salutation: val('sal'), language: val('lang'), website: $('website').value,
        consentText: $('consentText').textContent.trim(), userAgent: navigator.userAgent
      });
      const saved = { token: r.token, email: em.value.trim(), name: fn.value.trim() };
      store.set(saved);
      if (r.status === 'subscribed') unlocked(r.url, saved.name); else pending(saved);
    } catch (e) {
      err.textContent = ERRORS[e.code] || ERRORS.default;
    } finally { btn.disabled = false; }
  });

  // Returning visitor (e.g. back from the confirmation email): pick up where they left off.
  const saved = store.get();
  if (saved && saved.token) { pending(saved); check(true); }
})();
