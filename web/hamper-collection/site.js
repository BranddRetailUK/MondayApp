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
  const categoryLinks = [...document.querySelectorAll('header [data-category]')];
  const validCategories = new Set(categoryLinks.map(link => link.dataset.category));
  let category = 'all';
  const applyPriceFilter = () => {
    const [minimum, maximum] = range.value === 'all' ? [0, Infinity] : range.value.split(':').map((value, index) => value === '' && index === 1 ? Infinity : Number(value));
    cards.forEach(card => {
      const price = Number(card.dataset.price);
      card.hidden = !(price >= minimum && price < maximum && (category === 'all' || (card.dataset.categories || '').split(' ').includes(category)));
    });
    document.querySelector('.collection-empty').hidden = cards.some(card => !card.hidden);
  };
  const readCategory = () => {
    const requested = new URL(location.href).searchParams.get('category');
    category = validCategories.has(requested) ? requested : 'all';
    categoryLinks.forEach(link => {
      if (link.dataset.category === category) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    applyPriceFilter();
  };
  categoryLinks.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.searchParams.set('category', link.dataset.category);
    url.hash = 'collection';
    history.pushState(null, '', url);
    readCategory();
    document.querySelector('#collection').scrollIntoView({behavior: 'instant'});
  }));
  window.addEventListener('popstate', readCategory);
  sort.addEventListener('change', () => {
    const sorted = [...cards];
    if (sort.value !== 'featured') {
      const direction = sort.value === 'ascending' ? 1 : -1;
      sorted.sort((a, b) => direction * (Number(a.dataset.price) - Number(b.dataset.price)));
    }
    grid.append(...sorted);
  });
  range.addEventListener('change', applyPriceFilter);
  priceFilter.hidden = false;
  readCategory();
}
