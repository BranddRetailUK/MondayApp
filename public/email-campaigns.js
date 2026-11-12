(() => {
  const root = document.querySelector('#tab-email-campaigns');
  if (!root) return;
  const $ = id => root.querySelector(`#campaign-${id}`);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const count = value => Number(value || 0).toLocaleString('en-GB');
  const date = value => value ? new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London'}) : '—';
  const rate = (value, total) => total ? `${(100 * value / total).toFixed(1)}% of delivered` : 'Awaiting delivery';
  let page = 0, generation = 0, loading = false, timer;
  async function get(path) { const response = await fetch(`/api/email-campaigns${path}`,{cache:'no-store'}); if (!response.ok) throw Error('Unable to load campaign data. Please refresh.'); return response.json(); }
  function metric(label,value,note='') { return `<div><span>${label}</span><strong>${count(value)}</strong>${note ? `<small>${escape(note)}</small>` : ''}</div>`; }
  async function exclusions() {
    const request = ++generation;
    try {
      const data = await get(`/suppressions?kind=${encodeURIComponent($('kind').value)}&search=${encodeURIComponent($('search').value)}&page=${page}`);
      if (request !== generation) return;
      $('list-note').textContent = $('kind').value === 'invalid' ? 'Confirmed invalid addresses only. Temporary failures and policy blocks are listed separately.' : 'Excluded from future campaign sends. Customer records are retained.';
      $('exclusions').innerHTML = data.rows.length ? data.rows.map(r=>`<tr><td>${escape(r.email)}</td><td>${escape(r.reason || r.kind.replaceAll('_',' '))}</td><td>${escape(date(r.occurred_at))}</td></tr>`).join('') : '<tr><td colspan="3">No matching email addresses.</td></tr>';
      $('page').textContent = `${count(data.total)} addresses · Page ${page+1}`;
      $('prev').disabled = page === 0; $('next').disabled = (page+1)*50 >= data.total;
    } catch(e) { if (request === generation) $('status').textContent = e.message; }
  }
  async function load() {
    if (loading) return;
    loading = true; $('refresh').disabled = true;
    try {
      const data = await get('');
      $('status').textContent = !data.trackingConfigured ? 'Tracking setup pending. Campaigns have not been enabled for sending.' : data.latestEvent ? `Latest activity: ${date(data.latestEvent)}. Opens can include privacy-proxy activity; clicks can include security scans.` : 'No campaign activity received yet. Opens and clicks will appear after sending.';
      $('list').innerHTML = data.campaigns.length ? data.campaigns.map(c=>{
        const m=c.metrics, delivered=m.delivered || 0;
        return `<article class="proof-card campaign-card"><div class="campaign-heading"><h2>${escape(c.name)}</h2><span class="campaign-badge">${escape(c.status)}</span></div><p class="campaign-subject">${escape(c.subject)}</p><p class="campaign-sync">${escape(c.sync_error || (c.sync_at ? `Analytics refreshed ${date(c.sync_at)}` : 'Not sent · awaiting campaign activity'))}</p><div class="campaign-metrics">${metric('Audience',c.audience)}${metric('Submitted',c.submitted,'Provider acceptance')}${metric('Delivered',delivered)}${metric('Unique opens',m.open,rate(m.open||0,delivered))}${metric('Unique clicks',m.click,rate(m.click||0,delivered))}${metric('Unsubscribed',m.unsubscribe_count ?? m.unsubscribe ?? 0)}${metric('Bounced',m.bounce)}${metric('Deferred',m.deferred,'Temporary delivery delays')}${metric('Dropped',m.dropped)}${metric('Spam complaints',m.spamreport)}</div></article>`;
      }).join('') : '<div class="proof-card campaign-empty"><h2>No campaigns yet</h2><p>Prepared campaigns and their delivery results will appear here.</p></div>';
      await exclusions();
    } catch(e) { $('status').textContent = e.message; }
    finally { loading=false; $('refresh').disabled=false; }
  }
  $('refresh').addEventListener('click',load);
  $('kind').addEventListener('change',()=>{page=0;exclusions();});
  $('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=0;exclusions();},250);});
  $('prev').addEventListener('click',()=>{page=Math.max(0,page-1);exclusions();});
  $('next').addEventListener('click',()=>{page++;exclusions();});
  window.loadEmailCampaigns=load;
  setInterval(()=>{if(root.classList.contains('active') && !document.hidden) load();},60000);
})();
