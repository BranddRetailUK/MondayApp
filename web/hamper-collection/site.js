'use strict';
const form=document.querySelector('#enquiry');
if(form){const quantity=document.querySelector('#quantity');
 document.querySelector('#minus').addEventListener('click',()=>quantity.value=Math.max(1,(Number(quantity.value)||1)-1));
 document.querySelector('#plus').addEventListener('click',()=>quantity.value=Math.min(10000,(Number(quantity.value)||1)+1));
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;
 const subject=`Christmas hamper enquiry — ${form.dataset.product}`;
 const body=`Hello,\n\nI’m interested in ${form.dataset.product} (${form.dataset.sku}).\nQuantity: ${quantity.value}\n\nPreferred delivery date:\nDelivery postcode(s):\nAny dietary requirements:\n\nPlease let me know availability and the total including delivery.\n\nThank you`;
 window.location.href=`mailto:sales@ultimatepromotions.co.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 });}


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
  };
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
  applyPriceFilter();
}
