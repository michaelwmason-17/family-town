// Family Town on the web (Vercel + Supabase).
// The app was built for a Claude artifact, which offers four abilities through window.claude.use():
//   db (shared saved data), user (who is this), room (who's here right now), assets (photo storage).
// This file provides the same four abilities backed by Supabase, so the app itself barely changes.
// It also shows the sign-in screen and adds a few web-only extras (ESV text, Apple Calendar link).
(function () {
  const CFG = window.FT_CONFIG || {};
  const configured = CFG.supabaseUrl && !/PASTE_/.test(CFG.supabaseUrl) && CFG.supabaseAnonKey && !/PASTE_/.test(CFG.supabaseAnonKey);
  if (!configured) { console.info('Family Town: Supabase not set up yet, so everything saves on this device only.'); return; }

  const SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  const caps = {};
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  // each phone or tablet gets its own id, so it can ignore the echo of its own saves
  const DEVICE = (() => { try { let d = localStorage.getItem('ft_device_id'); if (!d) { d = uuid(); localStorage.setItem('ft_device_id', d); } return d; } catch (e) { return uuid(); } })();
  window.claude = { use: name => ready.then(ctx => (ctx && MAKERS[name] ? (caps[name] ??= MAKERS[name](ctx)) : null)) };

  // ---------- the four abilities ----------
  const MAKERS = {
    db(ctx) {
      const { sb, fam, me } = ctx;
      const mk = (key, value) => ({ id: key, data: () => ({ v: value }) });
      return {
        collection() {
          return {
            onSnapshot(cb, onErr) {
              let loaded = false, buffer = [];
              const deliver = rows => cb({ metadata: { fromCache: false }, docs: rows.map(r => mk(r.key, r.value)), docChanges: () => rows.map(r => ({ type: 'modified', doc: mk(r.key, r.value) })) });
              const fetchAll = async () => {
                const { data, error } = await sb.from('kv').select('key,value').eq('family_id', fam);
                if (error) { onErr && onErr(error); return; }
                deliver(data); loaded = true;
                if (buffer.length) { const b = buffer; buffer = []; deliver(b); }
              };
              sb.channel('kv-' + fam)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kv', filter: 'family_id=eq.' + fam }, p => {
                  const r = p.new; if (!r || !r.key || r.device === DEVICE) return;   // skip this device's own echoes
                  if (loaded) deliver([r]); else buffer.push(r);
                })
                .subscribe(status => {
                  if (status === 'SUBSCRIBED') fetchAll();   // also re-syncs after the phone reconnects
                  else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !loaded) fetchAll();
                });
            },
          };
        },
        doc(path) {
          const key = path.replace(/^kv\//, '');
          return {
            async set(obj) {
              const { error } = await sb.from('kv').upsert({ family_id: fam, key, value: obj.v, updated_by: me, device: DEVICE, updated_at: new Date().toISOString() });
              if (error) throw Object.assign(new Error(error.message), { code: error.code === '42501' ? 'invalid_argument' : 'unavailable' });
            },
          };
        },
      };
    },
    user(ctx) {
      return { id: async () => ctx.me, me: async () => ({ id: ctx.me, name: '' }), isOwner: () => true, canEdit: () => true, can: () => true };
    },
    room(ctx) {
      const { sb, fam, me } = ctx;
      const ch = sb.channel('room-' + fam, { config: { presence: { key: me } } });
      let peersCb = null, last = null, timer = null, joined = false;
      const emit = () => {
        if (!peersCb) return;
        const st = ch.presenceState();
        peersCb({ peers: Object.entries(st).map(([k, arr]) => ({ isMe: k === me, kind: 'viewer', presence: (arr[arr.length - 1] || {}).p || null })) });
      };
      ch.on('presence', { event: 'sync' }, emit).on('presence', { event: 'join' }, emit).on('presence', { event: 'leave' }, emit)
        .subscribe(status => { if (status === 'SUBSCRIBED') { joined = true; if (last) ch.track({ p: last }); } });
      return {
        onPeers(cb) { peersCb = cb; emit(); },
        presence(p) {   // the app sends updates often; send at most ~8 a second
          last = p;
          if (!timer) timer = setTimeout(() => { timer = null; if (joined) ch.track({ p: last }); }, 120);
          return Promise.resolve();
        },
      };
    },
    assets(ctx) {
      const { sb, fam } = ctx;
      return {
        async upload(blob) {
          const id = `${fam}/${uuid()}.jpg`;
          const up = await sb.storage.from('photos').upload(id, blob, { contentType: blob.type || 'image/jpeg' });
          if (up.error) throw up.error;
          const sig = await sb.storage.from('photos').createSignedUrl(id, 60 * 60 * 24 * 365 * 10);
          if (sig.error) throw sig.error;
          return { id, url: sig.data.signedUrl, sizeBytes: blob.size, contentType: blob.type };
        },
      };
    },
  };

  // ---------- web-only extras the app can use ----------
  let CTX = null;
  window.FT_WEB = {
    async esv(q) {
      const r = await fetch('/api/esv?q=' + encodeURIComponent(q));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The ESV text could not load.');
      return r.json();
    },
    async calendarUrl() {
      if (!CTX) return null;
      const { data } = await CTX.sb.from('families').select('ics_token').eq('id', CTX.fam).maybeSingle();
      return data ? `webcal://${location.host}/api/calendar?t=${data.ics_token}` : null;
    },
    async familyCode() {
      if (!CTX) return null;
      const { data } = await CTX.sb.from('families').select('code').eq('id', CTX.fam).maybeSingle();
      return data && data.code;
    },
    email: () => CTX && CTX.email,
    async signOut() { if (CTX) await CTX.sb.auth.signOut(); try { for (const k of Object.keys(localStorage)) if (k.startsWith('ft_')) localStorage.removeItem(k); } catch (e) {} location.reload(); },
  };

  // ---------- sign in, then find (or start) your family ----------
  const css = `
    #ftGate { position:fixed; inset:0; z-index:1000; background:#edf3f5; color:#1c2a33; font-family:Nunito, system-ui, sans-serif; display:flex; align-items:center; justify-content:center; padding:24px; overflow:auto; }
    #ftGate .box { width:100%; max-width:380px; background:#fff; border-radius:20px; padding:26px 22px; box-shadow:0 10px 30px rgba(0,0,0,.08); }
    #ftGate h1 { font-family:'Pixelify Sans', Nunito, sans-serif; font-size:30px; margin:0 0 4px; color:#24698f; }
    #ftGate p { margin:6px 0 14px; color:#5a6b76; line-height:1.45; }
    #ftGate label { display:block; font-weight:800; font-size:14px; margin:12px 0 6px; }
    #ftGate input { width:100%; box-sizing:border-box; font:inherit; font-size:17px; padding:12px 14px; border:1px solid #d6e1e7; border-radius:12px; background:#fff; color:inherit; }
    #ftGate button { width:100%; font:inherit; font-weight:800; font-size:17px; padding:13px; border:none; border-radius:14px; margin-top:14px; cursor:pointer; background:#24698f; color:#fff; }
    #ftGate button.ghost { background:#dbeaf2; color:#24698f; }
    #ftGate .err { color:#c0442c; font-weight:700; min-height:1.2em; margin:10px 0 0; }
    #ftGate .code { font-family:'Press Start 2P', monospace; font-size:24px; letter-spacing:4px; text-align:center; background:#f2e5c7; border-radius:14px; padding:18px; margin:10px 0; }
    #ftGate .or { text-align:center; color:#5a6b76; margin:16px 0 0; font-size:14px; }
    @media (prefers-color-scheme: dark) { #ftGate { background:#0d171e; color:#e3ecf1; } #ftGate .box { background:#15232c; } #ftGate input { background:#0d171e; border-color:#243744; } #ftGate p, #ftGate .or { color:#98adb9; } #ftGate h1 { color:#72b4dc; } #ftGate .code { background:#352e20; } }`;
  let gate;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function show(html) {
    if (!gate) {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      gate = document.createElement('div'); gate.id = 'ftGate'; document.body.appendChild(gate);
    }
    gate.innerHTML = `<div class="box">${html}</div>`;
    gate.hidden = false;
  }
  const hide = () => { if (gate) gate.remove(); gate = null; };
  const errBox = msg => { const e = gate && gate.querySelector('.err'); if (e) e.textContent = msg || ''; };
  const busy = (on) => gate && gate.querySelectorAll('button').forEach(b => { b.disabled = on; b.style.opacity = on ? .6 : 1; });

  function signInScreen(sb, note) {
    show(`<h1>Family Town</h1><p>${note ? esc(note) : 'Sign in to your family’s town.'}</p>
      <form id="ftAuth"><label for="ftEmail">Email</label><input id="ftEmail" type="email" autocomplete="email" required>
      <label for="ftPass">Password</label><input id="ftPass" type="password" autocomplete="current-password" minlength="6" required>
      <button type="submit">Sign in</button><button type="button" class="ghost" id="ftNew">Create an account</button><p class="err"></p></form>`);
    const email = () => gate.querySelector('#ftEmail').value.trim(), pass = () => gate.querySelector('#ftPass').value;
    gate.querySelector('#ftAuth').onsubmit = async e => {
      e.preventDefault(); busy(true); errBox('');
      const { error } = await sb.auth.signInWithPassword({ email: email(), password: pass() });
      busy(false);
      if (error) errBox(/confirm/i.test(error.message) ? 'Check your email and tap the confirm link first.' : 'That email and password didn’t work.');
    };
    gate.querySelector('#ftNew').onclick = async () => {
      if (!gate.querySelector('#ftAuth').reportValidity()) return;
      busy(true); errBox('');
      const { data, error } = await sb.auth.signUp({ email: email(), password: pass(), options: { emailRedirectTo: location.origin } });
      busy(false);
      if (error) { errBox(error.message); return; }
      if (!data.session) signInScreen(sb, 'Almost there! Open the email we just sent, tap the link to confirm, then come back here and sign in.');
    };
  }

  function familyScreen(sb, user) {
    show(`<h1>Welcome!</h1><p>Is this the first phone in your family, or is someone already set up?</p>
      <button id="ftStart">Start our family</button>
      <p class="or">Already have a code from your spouse?</p>
      <form id="ftJoin"><input id="ftCode" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off" aria-label="Family code"><button class="ghost">Join with code</button></form>
      <p class="err"></p>`);
    gate.querySelector('#ftStart').onclick = async () => {
      busy(true); const { data, error } = await sb.rpc('create_family'); busy(false);
      if (error) { errBox(error.message); return; }
      codeScreen(sb, user, data);
    };
    gate.querySelector('#ftJoin').onsubmit = async e => {
      e.preventDefault(); busy(true);
      const { error } = await sb.rpc('join_family', { p_code: gate.querySelector('#ftCode').value });
      busy(false);
      if (error) { errBox(error.message); return; }
      enter(sb, user);
    };
  }

  function codeScreen(sb, user, code) {
    show(`<h1>Your family code</h1><p>Your spouse signs up on their phone, then enters this code to join your town:</p>
      <div class="code">${esc(code)}</div>
      <p>Moving over from the Claude app? If you saved your data file, bring it in now.</p>
      <label for="ftImport">Data file (optional)</label><input id="ftImport" type="file" accept="application/json,.json">
      <button id="ftGo">Open Family Town</button><p class="err"></p>`);
    gate.querySelector('#ftGo').onclick = async () => {
      const f = gate.querySelector('#ftImport').files[0];
      if (f) {
        busy(true); errBox('Bringing in your data...');
        try { await importFile(sb, f, user); } catch (e) { busy(false); errBox('That file couldn’t be read: ' + e.message); return; }
      }
      enter(sb, user);
    };
  }

  async function importFile(sb, file, user) {
    const all = JSON.parse(await file.text()), fam = (await sb.from('members').select('family_id').eq('user_id', user.id).maybeSingle()).data.family_id;
    const skip = new Set(['players', 'me', 'tab', 'seen', 'sound']);   // each of you picks your player again on the new site
    const rows = Object.entries(all).filter(([k]) => !skip.has(k)).map(([key, value]) => ({ family_id: fam, key, value, updated_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 50) { const { error } = await sb.from('kv').upsert(rows.slice(i, i + 50)); if (error) throw error; }
  }

  async function enter(sb, user) {
    const { data, error } = await sb.from('members').select('family_id').eq('user_id', user.id).maybeSingle();
    if (error) { show(`<h1>Hmm.</h1><p>Couldn’t reach your town: ${esc(error.message)}</p><button onclick="location.reload()">Try again</button>`); return; }
    if (!data) { familyScreen(sb, user); return; }
    CTX = { sb, fam: data.family_id, me: user.id, email: user.email };
    hide();
    resolveReady(CTX);
  }

  function loadLib() {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = SB_LIB; s.onload = res; s.onerror = () => rej(new Error('offline')); document.head.appendChild(s); });
  }

  async function boot() {
    try { await loadLib(); } catch (e) { resolveReady(null); return; }   // offline: the app still works on this phone
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    let entered = false;
    const go = session => { if (entered) return; if (!session) { signInScreen(sb); return; } entered = true; enter(sb, session.user); };
    sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') go(session); if (ev === 'SIGNED_OUT') location.reload(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
