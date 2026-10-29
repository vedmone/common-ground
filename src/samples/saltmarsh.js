export default `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saltmarsh — Slow stays on the Konkan coast</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--sand:#f5eee2;--paper:#fffaf1;--ink:#1f2a28;--muted:#6c6f66;--clay:#bf6440;--clay-deep:#9b4c2f;--teal:#23423e;--sea:#3a6a63;--sun:#e8a65c;--line:#e3d7c3}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'DM Sans',system-ui,-apple-system,sans-serif;background:var(--sand);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:0 40px}

.nav{display:flex;align-items:center;justify-content:space-between;padding:24px 0}
.brand{display:flex;align-items:center;gap:11px;font-family:Fraunces,Georgia,serif;font-size:23px;font-weight:600;letter-spacing:-.015em}
.brand-mark{width:30px;height:30px;border-radius:50%;background:var(--sun);position:relative;overflow:hidden}
.brand-mark::after{content:'';position:absolute;left:-10%;right:-10%;bottom:0;height:46%;background:var(--teal);border-radius:50% 50% 0 0/30% 30% 0 0}
.nav-links{display:flex;gap:30px;font-size:15px;color:var(--muted);list-style:none}
.nav-links a:hover{color:var(--ink)}
.nav-cta{background:var(--ink);color:var(--paper);padding:11px 20px;border-radius:999px;font-size:14px;font-weight:500}

.hero{display:grid;grid-template-columns:1.08fr 1fr;gap:64px;align-items:center;padding:40px 0 88px}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--clay-deep);font-weight:600}
.eyebrow::before{content:'';width:22px;height:1px;background:currentColor}
.hero h1{font-family:Fraunces,Georgia,serif;font-weight:300;font-size:68px;line-height:1.0;letter-spacing:-.025em;margin:20px 0 22px}
.hero h1 em{font-style:italic;color:var(--clay)}
.lede{font-size:18.5px;color:var(--muted);max-width:29em}
.search{margin-top:34px;background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:8px;display:grid;grid-template-columns:1.3fr 1fr .8fr auto;gap:2px;box-shadow:0 22px 44px -28px rgba(31,42,40,.38)}
.field{padding:11px 16px;border-radius:14px}
.field + .field{border-left:1px solid var(--line);border-radius:0}
.field small{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}
.field strong{font-size:15px;font-weight:500}
.search-button{background:var(--clay);color:#fff;border:0;border-radius:14px;padding:0 24px;font:600 15px 'DM Sans',sans-serif;cursor:pointer}
.trust{display:flex;gap:26px;margin-top:24px;font-size:14px;color:var(--muted);list-style:none}
.trust b{color:var(--ink);font-weight:600}

.art{position:relative;aspect-ratio:4/4.6;border-radius:30px;overflow:hidden;background:#f2dcbc}
.art .sun{position:absolute;width:40%;aspect-ratio:1;border-radius:50%;background:var(--sun);left:52%;top:15%;transform:translateX(-50%)}
.art .ridge{position:absolute;left:0;right:0;bottom:33%;height:36%;background:#d8a072;clip-path:polygon(0 62%,18% 34%,36% 52%,58% 18%,78% 44%,100% 28%,100% 100%,0 100%)}
.art .ridge-near{position:absolute;left:0;right:0;bottom:30%;height:26%;background:#a8573a;clip-path:polygon(0 58%,24% 30%,48% 62%,72% 36%,100% 60%,100% 100%,0 100%)}
.art .sea{position:absolute;left:0;right:0;bottom:0;height:31%;background:repeating-linear-gradient(180deg,#2c5651 0 13px,#376760 13px 26px)}
.art .hull{position:absolute;left:22%;bottom:19%;width:62px;height:16px;background:var(--paper);clip-path:polygon(0 0,100% 0,84% 100%,16% 100%)}
.art .sail{position:absolute;left:calc(22% + 24px);bottom:calc(19% + 16px);width:28px;height:44px;background:var(--paper);clip-path:polygon(0 100%,100% 100%,14% 0)}
.art .palm{position:absolute;right:12%;bottom:30%;width:10px;height:34%;background:var(--teal);border-radius:6px;transform:rotate(-6deg);transform-origin:bottom}
.art .frond{position:absolute;right:calc(12% - 34px);bottom:calc(30% + 33%);width:78px;height:30px;background:var(--teal);border-radius:50% 50% 0 50%;transform:rotate(-14deg)}
.art-caption{position:absolute;left:18px;right:18px;bottom:18px;background:rgba(255,250,241,.94);border-radius:16px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center;font-size:13.5px;backdrop-filter:blur(6px)}
.art-caption b{display:block;font-size:14.5px}
.art-caption span{color:var(--muted)}
.rating{font-weight:600;color:var(--ink)}

.section-head{display:flex;align-items:end;justify-content:space-between;gap:32px;margin-bottom:30px}
.section-head h2{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:42px;letter-spacing:-.02em;line-height:1.08}
.section-head p{color:var(--muted);max-width:26em}
.stays{padding:40px 0 90px}
.stay-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
.stay-card{background:var(--paper);border:1px solid var(--line);border-radius:22px;overflow:hidden}
.thumb{height:210px;position:relative;overflow:hidden}
.thumb.tide{background:#cfe0d8}
.thumb.tide .arch{position:absolute;left:50%;bottom:0;width:46%;height:78%;transform:translateX(-50%);background:var(--paper);border-radius:999px 999px 0 0}
.thumb.tide .arch::after{content:'';position:absolute;inset:16% 18% 0;border-radius:999px 999px 0 0;background:#2e5e57}
.thumb.casuarina{background:#f0d3b0}
.thumb.casuarina i{position:absolute;bottom:0;width:18%;border-radius:999px 999px 0 0;background:#55764d}
.thumb.casuarina i:nth-child(1){left:10%;height:62%}.thumb.casuarina i:nth-child(2){left:34%;height:82%;background:#3f5f3a}.thumb.casuarina i:nth-child(3){left:58%;height:56%}.thumb.casuarina i:nth-child(4){left:80%;height:72%;background:#3f5f3a}
.thumb.laterite{background:#b55c3c}
.thumb.laterite .block{position:absolute;background:#d68b5f;border-radius:6px}
.thumb.laterite .b1{left:12%;top:20%;width:34%;height:30%}.thumb.laterite .b2{left:50%;top:20%;width:38%;height:30%;background:#e8b48a}.thumb.laterite .b3{left:12%;top:56%;width:76%;height:28%;background:#9a4a2f}
.thumb .tag{position:absolute;left:14px;top:14px;background:rgba(255,250,241,.92);padding:5px 10px;border-radius:999px;font-size:12px;font-weight:600}
.stay-body{padding:18px 20px 20px}
.stay-body h3{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:22px;letter-spacing:-.01em}
.stay-meta{color:var(--muted);font-size:14px;margin-top:2px}
.stay-foot{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:14px}
.price{font-weight:600}
.price span{color:var(--muted);font-weight:400}

.slow{background:var(--teal);color:#f4ede0;border-radius:32px;padding:64px;display:grid;grid-template-columns:1fr 1.4fr;gap:56px;margin-bottom:90px}
.slow h2{font-family:Fraunces,Georgia,serif;font-weight:300;font-size:44px;line-height:1.06;letter-spacing:-.02em}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;list-style:none}
.steps li{border-top:1px solid rgba(244,237,224,.25);padding-top:18px}
.steps b{display:block;font-family:Fraunces,Georgia,serif;font-weight:400;font-size:20px;margin:8px 0 6px}
.steps span{font-size:12px;letter-spacing:.14em;color:var(--sun);font-weight:600}
.steps p{color:rgba(244,237,224,.72);font-size:15px}

.quote{text-align:center;max-width:820px;margin:0 auto 96px}
.quote blockquote{font-family:Fraunces,Georgia,serif;font-weight:300;font-size:34px;line-height:1.25;letter-spacing:-.015em}
.quote cite{display:block;margin-top:18px;font-style:normal;color:var(--muted);font-size:15px}

.signup{background:var(--paper);border:1px solid var(--line);border-radius:28px;padding:44px 48px;display:flex;justify-content:space-between;align-items:center;gap:32px;margin-bottom:56px}
.signup h2{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:30px;letter-spacing:-.015em}
.signup p{color:var(--muted)}
.signup-form{display:flex;gap:8px}
.signup-form input{border:1px solid var(--line);background:var(--sand);border-radius:999px;padding:13px 18px;font:15px 'DM Sans',sans-serif;width:260px;color:var(--ink)}
.signup-form button{background:var(--ink);color:var(--paper);border:0;border-radius:999px;padding:0 22px;font:600 15px 'DM Sans',sans-serif}
.footer{display:flex;justify-content:space-between;padding:28px 0 40px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
.footer ul{display:flex;gap:22px;list-style:none}

@media (max-width:900px){
  .wrap{padding:0 22px}
  .nav-links{display:none}
  .hero{grid-template-columns:1fr;gap:36px;padding-top:16px}
  .hero h1{font-size:46px}
  .search{grid-template-columns:1fr 1fr}
  .field + .field{border-left:0}
  .search-button{grid-column:1/-1;padding:14px}
  .stay-grid,.steps{grid-template-columns:1fr}
  .slow{grid-template-columns:1fr;padding:36px}
  .signup{flex-direction:column;align-items:flex-start;padding:32px}
  .signup-form{width:100%}.signup-form input{flex:1;width:auto}
  .section-head{flex-direction:column;align-items:flex-start}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="nav" data-cg-id="nav">
    <a class="brand" href="#" data-cg-id="brand"><span class="brand-mark"></span>Saltmarsh</a>
    <ul class="nav-links" data-cg-id="nav-links">
      <li><a href="#stays">Stays</a></li>
      <li><a href="#slow">Journeys</a></li>
      <li><a href="#journal">Journal</a></li>
      <li><a href="#about">About</a></li>
    </ul>
    <a class="nav-cta" href="#stays" data-cg-id="nav-cta">Plan a stay</a>
  </header>

  <section class="hero" data-cg-id="hero">
    <div class="hero-copy" data-cg-id="hero-copy">
      <span class="eyebrow" data-cg-id="hero-eyebrow">Konkan coast · 14 hand-picked homes</span>
      <h1 data-cg-id="hero-title">Find a place to stay where the days run slow.</h1>
      <p class="lede" data-cg-id="hero-lede">Small stays between Alibag and Goa, chosen for the quiet mornings, the long lunches and hosts who know the tide tables by heart.</p>
      <div class="search" data-cg-id="search">
        <div class="field" data-cg-id="field-where"><small>Where</small><strong>Devbagh, Malvan</strong></div>
        <div class="field" data-cg-id="field-when"><small>When</small><strong>12 – 15 Dec</strong></div>
        <div class="field" data-cg-id="field-guests"><small>Guests</small><strong>2 adults</strong></div>
        <button class="search-button" data-cg-id="search-button">Search stays</button>
      </div>
      <ul class="trust" data-cg-id="trust">
        <li><b>4.9</b> average stay rating</li>
        <li><b>Free</b> changes up to 7 days</li>
      </ul>
    </div>
    <figure class="art" data-cg-id="hero-art" aria-label="Illustration of a sun over hills, sea and a small sailboat">
      <span class="sun"></span><span class="ridge"></span><span class="ridge-near"></span><span class="palm"></span><span class="frond"></span><span class="sea"></span><span class="hull"></span><span class="sail"></span>
      <figcaption class="art-caption" data-cg-id="hero-caption"><span><b>The Tidewater House</b><span>Alibag · sleeps 4</span></span><span class="rating">★ 4.96</span></figcaption>
    </figure>
  </section>

  <section class="stays" id="stays" data-cg-id="stays">
    <div class="section-head" data-cg-id="stays-head">
      <h2 data-cg-id="stays-title">Stays for this season</h2>
      <p data-cg-id="stays-intro">Each home is visited by our team before it is listed. Fewer places, chosen with more care.</p>
    </div>
    <div class="stay-grid" data-cg-id="stay-grid">
      <article class="stay-card" data-cg-id="stay-tidewater">
        <div class="thumb tide"><span class="arch"></span><span class="tag">Sea view</span></div>
        <div class="stay-body">
          <h3>The Tidewater House</h3>
          <p class="stay-meta">Alibag · 3 rooms · breakfast included</p>
          <div class="stay-foot"><span class="price">₹9,800 <span>/ night</span></span><span>★ 4.96</span></div>
        </div>
      </article>
      <article class="stay-card" data-cg-id="stay-casuarina">
        <div class="thumb casuarina"><i></i><i></i><i></i><i></i><span class="tag">Beachfront</span></div>
        <div class="stay-body">
          <h3>Casuarina Cottages</h3>
          <p class="stay-meta">Devbagh · 5 cottages · kayaks</p>
          <div class="stay-foot"><span class="price">₹7,200 <span>/ night</span></span><span>★ 4.91</span></div>
        </div>
      </article>
      <article class="stay-card" data-cg-id="stay-laterite">
        <div class="thumb laterite"><span class="block b1"></span><span class="block b2"></span><span class="block b3"></span><span class="tag">New</span></div>
        <div class="stay-body">
          <h3>Laterite Loft</h3>
          <p class="stay-meta">Ganpatipule · 1 loft · studio for two</p>
          <div class="stay-foot"><span class="price">₹6,400 <span>/ night</span></span><span>★ 4.88</span></div>
        </div>
      </article>
    </div>
  </section>

  <section class="slow" id="slow" data-cg-id="slow">
    <h2 data-cg-id="slow-title">The slow way to arrive.</h2>
    <ol class="steps" data-cg-id="steps">
      <li><span>01</span><b>Tell us your pace</b><p>Beach days, food trails or simply a hammock. We shortlist three homes.</p></li>
      <li><span>02</span><b>Talk to the host</b><p>Every booking starts with a short call, so nothing about the stay is a surprise.</p></li>
      <li><span>03</span><b>Arrive unhurried</b><p>Drivers, ferries and fish-market mornings, arranged before you leave.</p></li>
    </ol>
  </section>

  <section class="quote" data-cg-id="quote">
    <blockquote data-cg-id="quote-text">“We came for a weekend and left knowing the names of the fishermen, the cat and every bend of the creek.”</blockquote>
    <cite data-cg-id="quote-cite">Ananya &amp; Rohan, stayed at Casuarina Cottages</cite>
  </section>

  <section class="signup" id="journal" data-cg-id="signup">
    <div>
      <h2 data-cg-id="signup-title">Letters from the coast</h2>
      <p data-cg-id="signup-copy">One unhurried email a month: new homes, monsoon menus and quiet weekends.</p>
    </div>
    <form class="signup-form" data-cg-id="signup-form">
      <input type="email" placeholder="you@example.com" aria-label="Email address" data-cg-id="signup-input">
      <button type="submit" data-cg-id="signup-button">Subscribe</button>
    </form>
  </section>

  <footer class="footer" id="about" data-cg-id="footer">
    <span>© 2026 Saltmarsh Stays · Made on the Konkan coast</span>
    <ul><li><a href="#">Hosts</a></li><li><a href="#">Care promise</a></li><li><a href="#">Contact</a></li></ul>
  </footer>
</div>
</body>
</html>`;
