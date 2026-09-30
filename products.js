// ===================== RICHMIND PRODUCTS =====================
// This file is PRIVATE (it is never shown to visitors).
// To add or change a product, copy one block { ... } and edit it.
//   slug     = the short name used in the buy link:  /checkout?product=SLUG
//   price    = number only, e.g. 22 or 19.99   (0 = free)
//   active   = true to sell it, false to hide it
//   links    = what the buyer gets after payment (Drive / YouTube / file links)
// =============================================================
export default [
  {
    slug: "productivity-system",
    title: "The Productivity System",
    price: 22,
    currency: "USD",
    active: true,
    delivery: {
      title: "Your product is ready",
      text: "Thanks for your purchase! Your files are below. They also stay in your account forever.",
      links: [
        { label: "Download the guide (PDF)", url: "https://example.com/REPLACE-WITH-YOUR-PRIVATE-LINK" }
      ]
    }
  }
];
