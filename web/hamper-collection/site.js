'use strict';
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
 let count=0;document.querySelectorAll('.card').forEach(card=>{card.hidden=button.dataset.filter!=='all'&&card.dataset.group!==button.dataset.filter;if(!card.hidden)count++;});
 document.querySelector('#count').textContent=`${count} hampers`;
}));
const form=document.querySelector('#enquiry');
if(form){const quantity=document.querySelector('#quantity');
 document.querySelector('#minus').addEventListener('click',()=>quantity.value=Math.max(1,(Number(quantity.value)||1)-1));
 document.querySelector('#plus').addEventListener('click',()=>quantity.value=Math.min(10000,(Number(quantity.value)||1)+1));
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;
 const subject=`Christmas hamper enquiry — ${form.dataset.product}`;
 const body=`Hello,\n\nI’m interested in ${form.dataset.product} (${form.dataset.sku}).\nQuantity: ${quantity.value}\n\nPreferred delivery date:\nDelivery postcode(s):\nAny dietary requirements:\n\nPlease let me know availability and the total including delivery.\n\nThank you`;
 window.location.href=`mailto:sales@ultimatepromotions.co.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 });}
