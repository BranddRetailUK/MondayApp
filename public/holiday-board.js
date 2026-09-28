(() => {
  const root = document.getElementById('holiday-board');
  let year = new Date().getFullYear(), data = { users: [], members: [], days: [] }, loading = false;
  let calendarZoom = 1, zoomObserver, zoomInitialized = false;
  let selectedMember = null, saving = false, suppressClickUntil = 0;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const name = id => { const u = data.users.find(u => Number(u.id) === Number(id)); return u ? `${u.first_name} ${u.last_name}`.trim() : 'User'; };
  const londonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  const isPast = date => date < londonToday();
  const portionName = p => p === 'am' ? 'morning' : p === 'pm' ? 'afternoon' : 'full day';
  const dot = m => { const c = /^#[0-9a-f]{6}$/i.test(m.colour) ? m.colour : '#63b3ff'; const rgb = c.slice(1).match(/../g).map(x => parseInt(x,16)); return `<span class="hb-dot hb-dot-${m.portion || 'full'}" style="--dot:${c};color:${rgb[0]*.299+rgb[1]*.587+rgb[2]*.114 > 150 ? '#101112' : '#fff'}">${esc(m.initials)}</span>`; };
  async function api(path, body) {
    const response = await fetch(`/api/holiday-board${path}`, body ? { method: path.startsWith('/members') ? 'PUT' : 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) } : { cache:'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save the holiday board.');
    return result;
  }
  async function load() {
    if (loading) return;
    loading = true;
    if (!root.innerHTML) root.innerHTML = '<p role="status">Loading Holiday Board…</p>';
    try { data = await api(`?year=${year}`); render(); }
    catch (e) { root.innerHTML = `<p role="alert">${esc(e.message)}</p><button id="hb-retry">Try again</button>`; root.querySelector('button').onclick = load; }
    finally { loading = false; }
  }
  window.loadHolidayBoard = load;
  function render() {
    hideDayPopup();
    const previousScroll = root.querySelector('.hb-scroll');
    const scroll = { left: previousScroll?.scrollLeft || 0, top: previousScroll?.scrollTop || 0 };
    root.innerHTML = `<header class="hb-head"><div><h1>Holiday Board</h1></div><div class="hb-actions"><div class="hb-year"><button id="hb-prev" aria-label="Previous year" ${year <= 2000 ? 'disabled' : ''}>‹</button><strong>${year}</strong><button id="hb-next" aria-label="Next year" ${year >= 2100 ? 'disabled' : ''}>›</button></div><button id="hb-members">Manage people</button><button class="hb-primary" id="hb-add" ${!data.members.length || year < +londonToday().slice(0,4) ? 'disabled' : ''}>+ Add holiday</button></div></header>
      ${data.preview ? '<div class="hb-preview">LOCAL PREVIEW · Registered users are live; holiday changes are saved only on this Mac.</div>' : ''}
      <div class="hb-legend"><div class="hb-people">${data.members.length ? data.members.map(m => `<button data-member="${m.user_id}" aria-pressed="${Number(selectedMember) === Number(m.user_id)}" title="Drag to a date. Right-click to change colour. Click to select ${esc(name(m.user_id))}.">${dot(m)}<span>${esc(name(m.user_id))}</span></button>`).join('') : '<span>Add people from registered users to start your board.</span>'}</div><div class="hb-zoom" aria-label="Calendar zoom"><button id="hb-zoom-out" aria-label="Zoom out">−</button><button id="hb-zoom-fit">Fit year</button><button id="hb-zoom-in" aria-label="Zoom in">+</button></div></div><p id="hb-feedback" class="hb-feedback" role="status" aria-live="polite"></p><div class="hb-scroll"><div class="hb-calendar" role="group" aria-label="${year} holiday calendar"><div class="hb-weekdays"><span></span>${Array.from({length:37}, (_,i) => `<span class="${i%7>4?'hb-weekend':''}">${weekdays[i%7]}</span>`).join('')}</div>${months.map((month,m) => {
        const offset = (new Date(Date.UTC(year,m,1)).getUTCDay()+6)%7, count = new Date(Date.UTC(year,m+1,0)).getUTCDate();
        return `<div class="hb-month"><strong>${month.slice(0,3)}</strong>${Array.from({length:37},(_,i) => {
          const day = i-offset+1;
          if(day<1 || day>count) return '<span class="hb-blank"></span>';
          const date = `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const members = data.days.filter(d=>d.day===date).map(d=>{const p=data.members.find(p=>Number(p.user_id)===Number(d.user_id));return p ? {...p,portion:d.portion || 'full'} : null;}).filter(Boolean);
          const today = londonToday() === date, locked = isPast(date);
          const label = `${day} ${month} ${year}${members.length ? ': '+members.map(p=>name(p.user_id)+' ('+portionName(p.portion)+')').join(', ') : ': no holiday'}`;
          return `<div class="hb-day ${i%7>4?'hb-weekend':''} ${today?'hb-today':''} ${locked?'hb-past':''}" data-date="${date}" role="group" aria-label="${esc(label)}" title="${esc(label)}${locked ? ' · Past date — locked' : ''}"><button class="hb-number" ${locked ? 'disabled' : ''} aria-label="Edit ${day} ${month} ${year}"><svg class="hb-date-number" viewBox="0 0 26 20" width="26" height="20" aria-hidden="true" focusable="false"><text x="0" y="15">${day}</text></svg></button><span class="hb-dots">${members.map(p => `<button class="hb-grid-dot" ${locked ? 'disabled' : ''} data-person="${p.user_id}" aria-label="${esc(name(p.user_id))}, ${date}, ${portionName(p.portion)}. ${locked ? 'Past date — locked.' : 'Click for '+(p.portion === 'am' ? 'afternoon' : p.portion === 'pm' ? 'remove' : 'morning')+'.'}" title="${esc(name(p.user_id))}: ${portionName(p.portion)}">${dot(p)}</button>`).join('')}</span></div>`;
        }).join('')}</div>`;
      }).join('')}</div></div>`;
    root.querySelector('#hb-prev').onclick=()=>{year--;load();};
    root.querySelector('#hb-next').onclick=()=>{year++;load();};
    root.querySelector('#hb-members').onclick=()=>memberDialog();
    root.querySelector('#hb-add').onclick=()=>dayDialog(year === +londonToday().slice(0,4) ? londonToday() : `${year}-01-01`);
    root.querySelectorAll('[data-member]').forEach(b => {
      b.onclick = () => {
        if (Date.now() < suppressClickUntil) return;
        selectedMember = Number(b.dataset.member);
        root.querySelectorAll('[data-member]').forEach(p => p.setAttribute('aria-pressed', String(p === b)));
        feedback(`${name(selectedMember)} selected. Click a date to place a full-day dot.`);
      };
      b.onpointerdown = e => beginDrag(e, b);
      b.oncontextmenu = e => { e.preventDefault(); colourDialog(Number(b.dataset.member)); };
      b.onkeydown = e => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); colourDialog(Number(b.dataset.member)); } };
    });
    root.querySelectorAll('[data-date]').forEach(cell => {
      cell.onclick = e => {
        if (Date.now() < suppressClickUntil) return;
        if (isPast(cell.dataset.date)) { feedback('Past dates are locked. Only today and future dates can be changed.'); return; }
        const marker = e.target.closest('[data-person]');
        if (marker) { cycleDay(Number(marker.dataset.person), cell.dataset.date); return; }
        if (selectedMember) placeDay(selectedMember, cell.dataset.date);
        else if (data.members.length) dayDialog(cell.dataset.date);
        else memberDialog();
      };
    });
    const viewport = root.querySelector('.hb-scroll');
    setupDayPopups(viewport);
    setupCalendarZoom(viewport);
    viewport.scrollLeft = scroll.left; viewport.scrollTop = scroll.top;
  }
  let dayPopup = null;
  function hideDayPopup() {
    if (dayPopup) dayPopup.hidden = true;
  }
  window.addEventListener('blur', hideDayPopup);
  window.addEventListener('scroll', hideDayPopup, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideDayPopup(); });
  function setupDayPopups(viewport) {
    dayPopup = document.createElement('div');
    dayPopup.className = 'hb-day-popup'; dayPopup.hidden = true;
    dayPopup.setAttribute('role', 'tooltip');
    root.append(dayPopup);
    viewport.querySelectorAll('.hb-day').forEach(cell => {
      const people = data.days.filter(d => d.day === cell.dataset.date).map(d => {
        const member = data.members.find(m => Number(m.user_id) === Number(d.user_id));
        return member ? { ...member, portion:d.portion || 'full' } : null;
      }).filter(Boolean);
      if (people.length < 2) return;
      // Avoid a second native tooltip covering the full-size popup.
      cell.removeAttribute('title');
      cell.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));
      const show = event => {
        if (event.pointerType === 'touch' || document.querySelector('.hb-dialog[open]')) return;
        if (dayPopup.hidden || dayPopup.dataset.date !== cell.dataset.date) {
          dayPopup.dataset.date = cell.dataset.date;
          dayPopup.innerHTML = `${people.map(person => `<div class="hb-popup-person"><span class="hb-popup-circle">${dot(person)}</span><span>${esc(name(person.user_id))}<small>${portionName(person.portion)}</small></span></div>`).join('')}`;
          dayPopup.hidden = false;
        }
        const gap = 16, margin = 8, width = dayPopup.offsetWidth, height = dayPopup.offsetHeight;
        const left = event.clientX + gap + width <= window.innerWidth - margin ? event.clientX + gap : event.clientX - width - gap;
        const top = event.clientY + gap + height <= window.innerHeight - margin ? event.clientY + gap : event.clientY - height - gap;
        dayPopup.style.left = `${Math.max(margin, left)}px`;
        dayPopup.style.top = `${Math.max(margin, top)}px`;
      };
      cell.addEventListener('pointerenter', show);
      cell.addEventListener('pointermove', show);
      cell.addEventListener('pointerleave', hideDayPopup);
      cell.addEventListener('pointerdown', hideDayPopup);
    });
    viewport.addEventListener('pointerleave', hideDayPopup);
  }
  function setupCalendarZoom(viewport) {
    zoomObserver?.disconnect();
    const calendar = viewport.querySelector('.hb-calendar');
    const minimum = () => Math.min(1, (viewport.clientWidth - 24) / calendar.offsetWidth, (viewport.clientHeight - 28) / calendar.offsetHeight);
    const change = (next, x, y) => {
      hideDayPopup();
      const box = viewport.getBoundingClientRect();
      const anchorX = x == null ? viewport.clientWidth / 2 : x - box.left;
      const anchorY = y == null ? viewport.clientHeight / 2 : y - box.top;
      const previous = calendarZoom;
      calendarZoom = Math.min(1, Math.max(minimum(), next));
      calendar.style.zoom = String(calendarZoom);
      viewport.scrollLeft = (viewport.scrollLeft + anchorX) * calendarZoom / previous - anchorX;
      viewport.scrollTop = (viewport.scrollTop + anchorY) * calendarZoom / previous - anchorY;
      root.querySelector('#hb-zoom-out').disabled = calendarZoom <= minimum() + 0.001;
      root.querySelector('#hb-zoom-in').disabled = calendarZoom >= 1;
    };
    if (!zoomInitialized) {
      calendarZoom = window.matchMedia('(min-width: 961px) and (pointer: fine)').matches ? minimum() : 1;
      zoomInitialized = true;
    }
    calendar.style.zoom = String(calendarZoom);
    change(calendarZoom);
    root.querySelector('#hb-zoom-out').onclick = () => change(calendarZoom / 1.2);
    root.querySelector('#hb-zoom-in').onclick = () => change(calendarZoom * 1.2);
    root.querySelector('#hb-zoom-fit').onclick = () => { change(minimum()); viewport.scrollLeft = 0; viewport.scrollTop = 0; };
    let gestureActive = false, gestureZoom = 1, touchDistance = 0, touchZoom = 1;
    // Chromium trackpads emit pinch gestures as Ctrl+wheel; ordinary wheel scrolling is unchanged.
    viewport.addEventListener('wheel', event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (!gestureActive) change(calendarZoom * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    }, { passive:false });
    // Safari trackpads expose gesture events instead.
    viewport.addEventListener('gesturestart', event => { event.preventDefault(); gestureActive = true; gestureZoom = calendarZoom; });
    viewport.addEventListener('gesturechange', event => { event.preventDefault(); change(gestureZoom * event.scale, event.clientX, event.clientY); });
    viewport.addEventListener('gestureend', event => { event.preventDefault(); gestureActive = false; });
    const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    viewport.addEventListener('touchstart', event => {
      if (event.touches.length === 2) { event.preventDefault(); touchDistance = distance(event.touches); touchZoom = calendarZoom; suppressClickUntil = Date.now() + 500; }
    }, { passive:false });
    viewport.addEventListener('touchmove', event => {
      if (event.touches.length !== 2 || !touchDistance) return;
      event.preventDefault();
      change(touchZoom * distance(event.touches) / touchDistance, (event.touches[0].clientX + event.touches[1].clientX) / 2, (event.touches[0].clientY + event.touches[1].clientY) / 2);
      suppressClickUntil = Date.now() + 500;
    }, { passive:false });
    const endTouch = () => { if (touchDistance) suppressClickUntil = Date.now() + 500; touchDistance = 0; };
    viewport.addEventListener('touchend', endTouch); viewport.addEventListener('touchcancel', endTouch);
    zoomObserver = new ResizeObserver(() => { if (viewport.clientWidth) change(calendarZoom); });
    zoomObserver.observe(viewport);
  }
  function feedback(message, error = false) {
    const el = root.querySelector('#hb-feedback');
    if (el) { el.textContent = message; el.classList.toggle('hb-error', error); }
  }
  async function saveQuickly(path, body) {
    if (saving) return;
    saving = true; root.setAttribute('aria-busy', 'true'); feedback('Saving…');
    try {
      await api(path, body);
      data = await api(`?year=${year}`); render(); feedback('');
    } catch (e) { feedback(e.message, true); }
    finally { saving = false; root.removeAttribute('aria-busy'); }
  }
  function placeDay(userId, date) {
    if (isPast(date)) { feedback('Past dates are locked.', true); return; }
    if (!data.members.some(m => Number(m.user_id) === userId)) return;
    return saveQuickly('/days', { userId, start:date, end:date, action:'add', portion:'full' });
  }
  function cycleDay(userId, date) {
    if (isPast(date)) return;
    const entry = data.days.find(d => Number(d.user_id) === userId && d.day === date);
    if (!entry) return;
    const portion = entry.portion === 'am' ? 'pm' : entry.portion === 'pm' ? null : 'am';
    return saveQuickly('/days', { userId, start:date, end:date, action:portion ? 'add' : 'remove', portion:portion || 'full' });
  }
  function colourDialog(userId) {
    if (saving) return;
    const member = data.members.find(m => Number(m.user_id) === userId);
    const colours = [['Blue','#159de3'],['Pink','#f36b99'],['Purple','#a78bfa'],['Green','#48d8a4'],['Orange','#ffad55'],['Yellow','#f5d16b'],['Red','#ef6262'],['Teal','#4fd1c5'],['White','#e9edf5'],['Grey','#a6a8ad']];
    const el = dialog(`${esc(name(userId))} · Dot colour`, `<p>Choose a colour for this person and all their calendar dots.</p><div class="hb-palette">${colours.map(([label,c]) => `<button type="button" class="hb-swatch" data-colour="${c}" style="--swatch:${c}" aria-label="${label}" aria-pressed="${member.colour.toLowerCase() === c}"><span></span>${label}</button>`).join('')}</div><label>Custom colour<input type="color" name="colour" value="${member.colour}"></label>`);
    const apply = async colour => {
      await api(`/members/${userId}`, { initials:member.initials, colour });
    };
    el.querySelectorAll('[data-colour]').forEach(b => b.onclick = async () => {
      el.querySelectorAll('button').forEach(button => button.disabled = true);
      try { await apply(b.dataset.colour); el.close(); await load(); feedback(''); }
      catch(e) { el.querySelector('.hb-error').textContent = e.message; el.querySelectorAll('button').forEach(button => button.disabled = false); }
    });
    submit(el, f => apply(f.get('colour')));
  }
  function beginDrag(event, source) {
    if (event.button !== 0 || saving) return;
    const userId = Number(source.dataset.member), startX = event.clientX, startY = event.clientY;
    let x = startX, y = startY, ghost = null, target = null, frame;
    const viewport = root.querySelector('.hb-scroll');
    const highlight = () => {
      const cell = document.elementFromPoint(x, y)?.closest('.hb-day[data-date]');
      const next = cell && !isPast(cell.dataset.date) ? cell : null;
      if (target !== next) { target?.classList.remove('hb-drop-target'); target = next; target?.classList.add('hb-drop-target'); }
    };
    const tick = () => {
      if (!ghost) return;
      const box = viewport.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        viewport.scrollLeft += x > box.right - 48 ? 14 : x < box.left + 48 ? -14 : 0;
        viewport.scrollTop += y > box.bottom - 48 ? 12 : y < box.top + 48 ? -12 : 0;
      }
      highlight(); frame = requestAnimationFrame(tick);
    };
    const move = e => {
      if (e.pointerId !== event.pointerId) return;
      x = e.clientX; y = e.clientY;
      if (!ghost && Math.hypot(x-startX,y-startY) > 6) {
        ghost = document.createElement('div'); ghost.className = 'hb-drag-ghost'; ghost.innerHTML = dot(data.members.find(m => Number(m.user_id) === userId)); document.body.append(ghost);
        source.classList.add('hb-dragging'); tick();
      }
      if (ghost) { e.preventDefault(); ghost.style.left = `${x}px`; ghost.style.top = `${y}px`; highlight(); }
    };
    const finish = e => {
      if (e.pointerId !== event.pointerId) return;
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', finish); document.removeEventListener('pointercancel', finish);
      cancelAnimationFrame(frame); source.classList.remove('hb-dragging'); target?.classList.remove('hb-drop-target');
      if (ghost) { ghost.remove(); suppressClickUntil = Date.now()+400; if (e.type === 'pointerup' && target) placeDay(userId, target.dataset.date); }
    };
    document.addEventListener('pointermove', move, { passive:false }); document.addEventListener('pointerup', finish); document.addEventListener('pointercancel', finish);
  }
  function dialog(title, content) {
    hideDayPopup();
    const el = document.createElement('dialog'); el.className='hb-dialog';
    el.innerHTML=`<form><div class="hb-dialog-head"><h2>${title}</h2><button type="button" class="hb-close" aria-label="Close">×</button></div>${content}<p class="hb-error" role="alert"></p><div class="hb-dialog-actions"><button type="button" class="hb-cancel">Cancel</button><button type="submit" class="hb-primary">Save</button></div></form>`;
    document.body.append(el); el.querySelector('.hb-close').onclick=()=>el.close(); el.querySelector('.hb-cancel').onclick=()=>el.close(); el.onclose=()=>el.remove(); el.showModal(); return el;
  }
  function submit(el, fn) {
    el.querySelector('form').onsubmit=async e=>{e.preventDefault(); const b=el.querySelector('[type=submit]');b.disabled=true;
      try {await fn(new FormData(e.target));el.close();await load();} catch(err){el.querySelector('.hb-error').textContent=err.message;b.disabled=false;}
    };
  }
  function memberDialog(id) {
    const el=dialog('Manage people', `<p>Choose a registered user and their circle. Changing a circle updates all of their holiday dates.</p><label>Registered user<select name="user" required>${data.users.map(u=>`<option value="${u.id}" ${Number(u.id)===id?'selected':''}>${esc(name(u.id))}${data.members.some(m=>Number(m.user_id)===Number(u.id))?' · On board':''}</option>`).join('')}</select></label><div class="hb-fields"><label>Circle letters<input name="initials" maxlength="3" pattern="[A-Za-z0-9]{1,3}" required></label><label>Circle colour<input name="colour" type="color" value="#57b5ff" required></label></div><p class="hb-help">New accounts are added through DATABASE → Users. They will then appear here.</p>`);
    const select=el.querySelector('select');
    const update=()=>{const m=data.members.find(m=>Number(m.user_id)===Number(select.value));el.querySelector('[name=initials]').value=m?.initials || name(select.value).slice(0,1).toUpperCase();el.querySelector('[name=colour]').value=m?.colour || '#57b5ff';};
    select.onchange=update;update();
    submit(el, f=>api(`/members/${f.get('user')}`,{initials:f.get('initials'),colour:f.get('colour')}));
  }
  function dayDialog(date) {
    if (isPast(date)) return;
    const existing=data.days.filter(d=>d.day===date);
    const el=dialog('Holiday dates', `<p>${existing.length ? 'On this day: '+existing.map(d=>esc(name(d.user_id))+' ('+portionName(d.portion)+')').join(', ') : 'Add a circle to one day or a range of dates.'}</p><label>Person<select name="user" required>${data.members.map(m=>`<option value="${m.user_id}">${esc(name(m.user_id))} (${esc(m.initials)})</option>`).join('')}</select></label><div class="hb-fields"><label>From<input name="start" type="date" value="${date}" min="${londonToday()}" max="2100-12-31" required></label><label>To<input name="end" type="date" value="${date}" min="${londonToday()}" max="2100-12-31" required></label></div><label class="hb-check"><input name="weekdays" type="checkbox"> Weekdays only</label><label>Time off<select name="portion"><option value="full">Full day · whole circle</option><option value="am">Morning · left half</option><option value="pm">Afternoon · right half</option></select></label><label>Action<select name="action"><option value="add">Add holiday circles</option><option value="remove">Remove holiday circles</option></select></label>`);
    const person = el.querySelector('[name=user]');
    if (existing.length) person.value = String(existing[0].user_id);
    const syncPortion = () => { el.querySelector('[name=portion]').value = existing.find(d => Number(d.user_id) === Number(person.value))?.portion || 'full'; };
    person.onchange = syncPortion; syncPortion();
    submit(el,f=>api('/days',{userId:Number(f.get('user')),start:f.get('start'),end:f.get('end'),weekdaysOnly:f.has('weekdays'),action:f.get('action'),portion:f.get('portion')}));
  }
})();
