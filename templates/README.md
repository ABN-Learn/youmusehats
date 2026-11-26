# YOUMUSE product detail template v1

Use templates/product-detail.html as the starting point for all future hat product detail pages. This is an example populated with the cotton twill baseball cap; replace all product-specific copy, metadata, images, category URL and related links before publishing another product.

Required layout: shared site header/footer; category breadcrumb; five-view carousel with thumbnails, arrows, keyboard and swipe; title; clickable category; short product introduction; six product attributes (craft, fabric, material, gender, scene, series); four service benefits; quote/design actions; five accessible tabs (Specification, Description, Product Attributes, Customized Service, Packaging & Shipping); related product cards.

Shared assets: /assets/css/product-detail.css and /assets/js/product-detail.js. Gallery photos must show the same product, with front, right, back, left and three-quarter views. Avoid invented dimensions and packing weights. Use actual approved specifications; quote order-specific values. Product catalogue records in data/products.json must match detail title/image/materials/techniques. Retain existing slugs when updating published products. Related cards must use working product or category URLs, never placeholder links. Future published products can replace category-level related cards with direct product links.

English copy should describe YOUMUSE specifications and services in original language, using peer sites only for structure. Keep the B2B quote flow; no cart, checkout or payment.

Catalogue card standard: white background, no shadow or frame, product image, short left-aligned regular-weight title (catalogName optional), and plain READ MORE arrow. Do not render descriptions on catalogue cards. Keep full specifications and descriptions on the detail page. All future products use this shared card layout.
