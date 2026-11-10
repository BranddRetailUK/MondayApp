'use strict';
const form=document.querySelector('#enquiry');
if(form){const quantity=document.querySelector('#quantity');
 document.querySelector('#minus').addEventListener('click',()=>quantity.value=Math.max(1,(Number(quantity.value)||1)-1));
 document.querySelector('#plus').addEventListener('click',()=>quantity.value=Math.min(10000,(Number(quantity.value)||1)+1));
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;
 if(Number(quantity.value)<=10){
   if(e.submitter?.value==='add'){window.HamperCart.add(form.dataset.sku,Number(quantity.value)).catch(()=>{window.HamperCart.open();});}
   else {window.location.href=`https://www.ultimatehub.co.uk/hamper-checkout.html?sku=${encodeURIComponent(form.dataset.sku)}&quantity=${Number(quantity.value)}`;}
   return;
 }

 const subject=`Christmas hamper enquiry — ${form.dataset.product}`;
 const body=`Hello,\n\nI’m interested in ${form.dataset.product} (${form.dataset.sku}).\nQuantity: ${quantity.value}\n\nPreferred delivery date:\nDelivery postcode(s):\nAny dietary requirements:\n\nPlease let me know availability and the total including delivery.\n\nThank you`;
 window.location.href=`mailto:sales@ultimatepromotions.co.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 });
 const buyButton=form.querySelector('[value=buy]');
 const addButton=form.querySelector('[value=add]');
 const updateBuyButton=()=>{const bulk=Number(quantity.value)>10;buyButton.textContent=bulk?'Contact us for bulk options':'Buy now';addButton.hidden=bulk;};
 form.addEventListener('input',updateBuyButton);
 form.addEventListener('click',updateBuyButton);
 updateBuyButton();}


const priceFilter = document.querySelector('#price-filter');
if (priceFilter) {
  const range = document.querySelector('#price-range');
  const sort = document.querySelector('#price-sort');
  const grid = document.querySelector('#collection .grid');
  const cards = [...document.querySelectorAll('#collection .card[data-price]')];
  const applyPriceFilter = () => {
    const [minimum, maximum] = range.value === 'all' ? [0, Infinity] : range.value.split(':').map((value, index) => value === '' && index === 1 ? Infinity : Number(value));
    cards.forEach(card => {
      const price = Number(card.dataset.price);
      card.hidden = !(price >= minimum && price < maximum);
    });
    document.querySelector('.collection-empty').hidden = cards.some(card => !card.hidden);
  };
  const applyPriceSort = () => {
    const sorted = [...cards];
    if (sort.value !== 'featured') {
      const direction = sort.value === 'ascending' ? 1 : -1;
      sorted.sort((a, b) => direction * (Number(a.dataset.price) - Number(b.dataset.price)));
    }
    grid.append(...sorted);
  };
  sort.addEventListener('change', applyPriceSort);
  applyPriceSort();
  range.addEventListener('change', applyPriceFilter);
  priceFilter.hidden = false;
  applyPriceFilter();
}

// One shared gold indicator follows hover/focus and returns to the current page.
const categoryNav = document.querySelector('header nav');
if (categoryNav) {
  const links = [...categoryNav.querySelectorAll('[data-category]')];
  const active = links.find(link => link.dataset.category === document.body.dataset.category);
  if (active) active.setAttribute('aria-current', 'page');
  const indicator = document.createElement('span');
  indicator.className = 'nav-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  categoryNav.append(indicator);
  let target = active;
  const positionIndicator = link => {
    target = link;
    if (!link) { indicator.style.opacity = '0'; return; }
    const navRect = categoryNav.getBoundingClientRect();
    const rect = link.getBoundingClientRect();
    indicator.style.width = `${rect.width}px`;
    indicator.style.transform = `translate(${rect.left - navRect.left}px, ${rect.bottom - navRect.top - 3}px)`;
    indicator.style.opacity = '1';
  };
  links.forEach(link => {
    link.addEventListener('pointerenter', () => positionIndicator(link));
    link.addEventListener('focus', () => positionIndicator(link));
  });
  categoryNav.addEventListener('pointerleave', () => positionIndicator(links.includes(document.activeElement) ? document.activeElement : active));
  categoryNav.addEventListener('focusout', event => { if (!categoryNav.contains(event.relatedTarget)) positionIndicator(active); });
  new ResizeObserver(() => positionIndicator(target)).observe(categoryNav);
  positionIndicator(active);
  requestAnimationFrame(() => requestAnimationFrame(() => indicator.classList.add('is-ready')));
}
// Preserve previously shared collection links using the new standalone pages.
const legacyCategory = new URL(location.href).searchParams.get('category');
const groupPages = {all:'all-hampers', 'sweet-treats':'sweet-treats', 'cheese-savoury':'cheese-savoury', 'wine-fizz':'wine-fizz', luxury:'luxury-hampers'};
if (legacyCategory && Object.hasOwn(groupPages, legacyCategory) && /(?:\/|\/index.html)$/.test(location.pathname)) {
  location.replace(`${groupPages[legacyCategory]}.html`);
}

// A short capped stagger keeps large collections quick to browse.
document.querySelectorAll(".grid .card").forEach((card, index) => {
  card.style.setProperty("--card-delay", `${Math.min(index, 5) * 45}ms`);
});

// Native dialog provides focus trapping and makes the page inert while open.
if (categoryNav) {
  const header = document.querySelector('body > header');
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'mobile-menu-trigger';
  menuButton.setAttribute('aria-label', 'Open navigation');
  menuButton.setAttribute('aria-haspopup', 'dialog');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-controls', 'mobile-navigation');
  menuButton.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  header.prepend(menuButton);
  const menu = document.createElement('dialog');
  menu.id = 'mobile-navigation';
  menu.className = 'mobile-nav-drawer';
  menu.setAttribute('aria-labelledby', 'mobile-nav-title');
  menu.innerHTML = '<div class="mobile-nav-heading"><h2 id="mobile-nav-title">Explore the collection</h2><button type="button" class="mobile-nav-close" aria-label="Close navigation">×</button></div><nav aria-label="Mobile navigation"></nav><div class="mobile-nav-footer"><a href="index.html#help">Help with gifting</a><a class="button" href="mailto:sales@ultimatepromotions.co.uk">Get in touch</a></div>';
  const drawerNav = menu.querySelector('nav');
  categoryNav.querySelectorAll('a').forEach(link => drawerNav.append(link.cloneNode(true)));
  document.body.append(menu);
  document.body.classList.add('mobile-nav-ready');
  const mobile = matchMedia('(max-width:750px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
  let menuCloseTimer;
  const finishMenuClose = () => {
    clearTimeout(menuCloseTimer);
    menu.classList.remove('is-closing');
    if (menu.open) menu.close();
    document.body.classList.remove('mobile-nav-open');
    menuButton.setAttribute('aria-expanded', 'false');
    if (mobile.matches) menuButton.focus();
  };
  const closeMenu = () => {
    if (!menu.open || menu.classList.contains('is-closing')) return;
    if (reducedMotion.matches) { finishMenuClose(); return; }
    menu.classList.add('is-closing');
    menuCloseTimer = setTimeout(finishMenuClose, 230);
  };
  menuButton.addEventListener('click', () => {
    if (!mobile.matches || menu.open) return;
    clearTimeout(menuCloseTimer);
    menu.classList.remove('is-closing');
    menu.showModal();
    document.body.classList.add('mobile-nav-open');
    menuButton.setAttribute('aria-expanded', 'true');
  });
  menu.querySelector('.mobile-nav-close').addEventListener('click', closeMenu);
  menu.addEventListener('cancel', event => { event.preventDefault(); closeMenu(); });
  menu.addEventListener('click', event => {
    const rect = menu.getBoundingClientRect();
    if (event.target === menu && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeMenu();
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  mobile.addEventListener('change', () => { if (!mobile.matches && menu.open) finishMenuClose(); });
  window.addEventListener('pagehide', finishMenuClose);
}
