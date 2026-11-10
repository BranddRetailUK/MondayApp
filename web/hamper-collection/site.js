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
  const count = document.querySelector('#price-filter-count');
  const cards = [...document.querySelectorAll('#collection .card[data-price]')];
  const applyPriceFilter = () => {
    const [minimum, maximum] = range.value === 'all' ? [0, Infinity] : range.value.split(':').map((value, index) => value === '' && index === 1 ? Infinity : Number(value));
    let visible = 0;
    cards.forEach(card => {
      const price = Number(card.dataset.price);
      card.hidden = !(price >= minimum && price < maximum);
      if (!card.hidden) visible += 1;
    });
    count.textContent = `${visible} ${visible === 1 ? 'gift' : 'gifts'}${range.value === 'all' ? '' : ' in this price range'}`;
  };
  range.addEventListener('change', applyPriceFilter);
  priceFilter.hidden = false;
  applyPriceFilter();
}
