export const ledgerline = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ledgerline — Pricing</title>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter Tight',system-ui,sans-serif;background:#f6f6f3;color:#16181a;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1100px;margin:0 auto;padding:0 36px}
.nav{display:flex;justify-content:space-between;align-items:center;padding:22px 0}
.logo{font-weight:700;font-size:19px;letter-spacing:-.02em;display:flex;gap:9px;align-items:center}
.logo i{width:20px;height:20px;border-radius:5px;background:#16181a;display:inline-block;box-shadow:6px 6px 0 -2px #c9d36a}
.nav a{color:#5a5f63;font-size:14px;text-decoration:none;margin-left:24px}
.head{text-align:center;padding:64px 0 44px}
.head h1{font-size:52px;letter-spacing:-.035em;line-height:1.04;font-weight:600}
.head p{color:#5a5f63;font-size:18px;margin-top:14px}
.toggle{display:inline-flex;background:#e9e9e4;border-radius:999px;padding:4px;margin-top:26px;font-size:14px}
.toggle span{padding:8px 16px;border-radius:999px}
.toggle .on{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding-bottom:70px}
.plan{background:#fff;border:1px solid #e4e4de;border-radius:18px;padding:28px}
.plan.featured{background:#16181a;color:#f3f3ee;border-color:#16181a}
.plan h2{font-size:17px;font-weight:600}
.plan .price{font-size:44px;font-weight:600;letter-spacing:-.03em;margin:16px 0 4px}
.plan .price small{font-size:15px;font-weight:400;color:#8a8f93}
.plan p{color:#6a6f73;font-size:14.5px}
.plan.featured p{color:#b9bcb5}
.plan ul{list-style:none;margin:22px 0;display:grid;gap:10px;font-size:14.5px}
.plan li::before{content:'✓';margin-right:9px;color:#7d8a2f}
.plan.featured li::before{color:#c9d36a}
.plan button{width:100%;padding:13px;border-radius:10px;border:1px solid #d8d8d1;background:#fff;font:600 15px 'Inter Tight',sans-serif}
.plan.featured button{background:#c9d36a;border-color:#c9d36a;color:#16181a}
.badge{display:inline-block;font-size:12px;background:#c9d36a;color:#16181a;border-radius:999px;padding:3px 10px;margin-left:8px;font-weight:600}
.faq{max-width:720px;margin:0 auto;padding-bottom:80px}
.faq h2{font-size:28px;letter-spacing:-.02em;margin-bottom:18px}
.faq details{border-top:1px solid #e4e4de;padding:16px 0}
.faq summary{font-weight:500;cursor:pointer}
.faq details p{color:#5a5f63;margin-top:8px}
@media (max-width:860px){.plans{grid-template-columns:1fr}.head h1{font-size:38px}}
</style>
</head>
<body>
<div class="wrap">
  <nav class="nav" data-cg-id="nav"><span class="logo"><i></i>Ledgerline</span><span><a href="#">Product</a><a href="#">Customers</a><a href="#">Sign in</a></span></nav>
  <header class="head" data-cg-id="pricing-head">
    <h1 data-cg-id="pricing-title">Bookkeeping that closes<br>the month for you.</h1>
    <p data-cg-id="pricing-sub">Simple plans for studios and small teams. Cancel any time.</p>
    <div class="toggle" data-cg-id="billing-toggle"><span class="on">Monthly</span><span>Yearly · save 20%</span></div>
  </header>
  <section class="plans" data-cg-id="plans">
    <article class="plan" data-cg-id="plan-solo"><h2>Solo</h2><div class="price">₹900<small> / month</small></div><p>For freelancers keeping one set of books.</p><ul><li>1 bank connection</li><li>GST-ready invoices</li><li>Monthly summary</li></ul><button data-cg-id="plan-solo-cta">Start free</button></article>
    <article class="plan featured" data-cg-id="plan-studio"><h2>Studio <span class="badge">Popular</span></h2><div class="price">₹2,400<small> / month</small></div><p>For studios with a few people and many clients.</p><ul><li>5 bank connections</li><li>Automatic reconciliation</li><li>Accountant access</li><li>Priority support</li></ul><button data-cg-id="plan-studio-cta">Start 14-day trial</button></article>
    <article class="plan" data-cg-id="plan-team"><h2>Team</h2><div class="price">₹5,800<small> / month</small></div><p>For growing teams with approvals and budgets.</p><ul><li>Unlimited connections</li><li>Approval flows</li><li>Budgets &amp; forecasts</li></ul><button data-cg-id="plan-team-cta">Talk to us</button></article>
  </section>
  <section class="faq" data-cg-id="faq">
    <h2>Questions</h2>
    <details><summary>Can I switch plans later?</summary><p>Yes, upgrades apply instantly and downgrades at the end of the cycle.</p></details>
    <details><summary>Do you support GST filing?</summary><p>We prepare GSTR-1 and 3B summaries your accountant can file.</p></details>
  </section>
</div>
</body>
</html>`;

export const morningPages = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Morning Pages — a gentle journal</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Figtree,system-ui,sans-serif;background:#eef0ea;color:#22261f;min-height:100vh;display:grid;place-items:center;padding:48px 20px}
.shell{display:grid;grid-template-columns:1fr 380px;gap:64px;max-width:1040px;width:100%;align-items:center}
.intro h1{font-family:Newsreader,Georgia,serif;font-weight:400;font-size:56px;line-height:1.02;letter-spacing:-.02em}
.intro p{color:#61685c;font-size:18px;margin:18px 0 26px;max-width:26em}
.intro .stores{display:flex;gap:10px}
.intro .stores a{background:#22261f;color:#eef0ea;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:500;font-size:14px}
.intro .stores a.ghost{background:transparent;color:#22261f;border:1px solid #c9cdc1}
.phone{background:#fbfbf7;border-radius:38px;padding:26px 22px;border:1px solid #d9dcd2;box-shadow:0 40px 60px -40px rgba(34,38,31,.45)}
.phone .date{font-size:13px;color:#7c8376;letter-spacing:.06em;text-transform:uppercase}
.phone h2{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:28px;margin:6px 0 18px}
.mood{display:flex;gap:8px;margin-bottom:18px}
.mood span{flex:1;text-align:center;padding:10px 0;border-radius:12px;background:#eef0ea;font-size:13px}
.mood span.on{background:#5d7552;color:#fff}
.entry{background:#fff;border:1px solid #e2e5dc;border-radius:16px;padding:16px;font-family:Newsreader,Georgia,serif;font-size:17px;line-height:1.55;color:#3b4136;min-height:150px}
.prompt{margin-top:14px;font-size:13.5px;color:#61685c;display:flex;justify-content:space-between}
.streak{margin-top:20px;display:flex;gap:6px}
.streak i{flex:1;height:30px;border-radius:8px;background:#dfe3d7}
.streak i.done{background:#a9b89c}
.save{margin-top:20px;width:100%;padding:14px;border:0;border-radius:14px;background:#22261f;color:#fff;font:600 15px Figtree,sans-serif}
@media (max-width:860px){.shell{grid-template-columns:1fr}.intro h1{font-size:40px}}
</style>
</head>
<body>
<main class="shell" data-cg-id="shell">
  <section class="intro" data-cg-id="intro">
    <h1 data-cg-id="intro-title">Three pages,<br>every morning.</h1>
    <p data-cg-id="intro-copy">A quiet journal that asks one good question a day and keeps your streak without the guilt.</p>
    <div class="stores" data-cg-id="stores"><a href="#" data-cg-id="store-ios">Download for iPhone</a><a class="ghost" href="#" data-cg-id="store-android">Android</a></div>
  </section>
  <section class="phone" data-cg-id="phone" aria-label="App preview">
    <div class="date">Wednesday, 29 October</div>
    <h2 data-cg-id="phone-title">How did you sleep?</h2>
    <div class="mood" data-cg-id="mood"><span>Restless</span><span class="on">Okay</span><span>Rested</span></div>
    <div class="entry" data-cg-id="entry">Woke before the alarm. The light on the balcony was the colour of weak tea, and for once I didn't reach for my phone…</div>
    <div class="prompt" data-cg-id="prompt"><span>Prompt: one small thing to protect today</span><span>212 words</span></div>
    <div class="streak" data-cg-id="streak"><i class="done"></i><i class="done"></i><i class="done"></i><i class="done"></i><i></i><i></i><i></i></div>
    <button class="save" data-cg-id="save">Save today's page</button>
  </section>
</main>
</body>
</html>`;
