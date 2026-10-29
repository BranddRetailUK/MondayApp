# Christmas hamper development site

Run `python3 -m http.server 3119 --bind 127.0.0.1 --directory web/hamper-collection` from the repository root, then open http://127.0.0.1:3119/.

Static landing page and nine individual product pages. No production route, checkout, customer records or sending integration. Enquiry buttons open the user's email client with the product, SKU and selected quantity. The existing email shots are unchanged.

Prices are the VAT-inclusive RRPs from the supplied AW26 Spicers of Hythe Corporate Brochure May 2026, PDF pages 2, 3, 9, 21, 23, 25, 32, 34 and 45. They match the original proposed price bands. `products.json` records each price, SKU and source page. Delivery, availability and dietary requirements are confirmed by enquiry. Photographs and the Ultimate logo are local assets for dependable previewing.
