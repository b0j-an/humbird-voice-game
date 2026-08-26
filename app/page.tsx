'use client';

import { useMemo, useState } from 'react';

const phases = [
  { number: '01', range: '$0–$10K', title: 'Find the signal', copy: 'Choose one painful problem for one specific viewer. Publish 30 useful videos before you judge the niche.', metric: '30 videos · 1 clear promise' },
  { number: '02', range: '$10K–$100K', title: 'Build the machine', copy: 'Turn winning topics into repeatable series. Obsess over packaging, retention, and a dependable weekly cadence.', metric: '8%+ CTR · 45%+ retention' },
  { number: '03', range: '$100K–$500K', title: 'Multiply revenue', copy: 'Add sponsors, affiliates, and one owned offer. Your audience should solve the same problem in four ways.', metric: '3–4 revenue streams' },
  { number: '04', range: '$500K–$1M', title: 'Become the studio', copy: 'Hire around the bottleneck, protect your creative edge, and reinvest in ideas with asymmetric upside.', metric: 'Team of 3–5 · 30% reinvested' },
];

const plays = [
  ['Attention', 'Publish ideas people already want, packaged with a sharper promise.'],
  ['Trust', 'Teach from evidence, show your work, and give away your second-best insight.'],
  ['Ownership', 'Move viewers to an email list so one algorithm never owns your future.'],
  ['Leverage', 'Build products and systems that earn after the upload day is over.'],
];

export default function Home() {
  const [views, setViews] = useState(500000);
  const [rpm, setRpm] = useState(6);
  const [other, setOther] = useState(12000);
  const monthly = useMemo(() => (views / 1000) * rpm + other, [views, rpm, other]);
  const years = monthly > 0 ? 1000000 / (monthly * 12) : 0;

  return <main>
    <nav className="nav shell">
      <a className="brand" href="#top" aria-label="Million Dollar Creator home">MDC<span>↗</span></a>
      <div className="nav-links" aria-label="Main navigation"><a href="#roadmap">Roadmap</a><a href="#model">Revenue model</a><a href="#rules">Rules</a></div>
      <a className="nav-cta" href="#roadmap">Start here <span>↓</span></a>
    </nav>

    <section className="hero shell" id="top">
      <div className="eyebrow"><span /> A practical field guide for YouTubers</div>
      <h1>Your first <em>$1,000,000</em><br />starts with one useful video.</h1>
      <div className="hero-bottom"><p>Not a lottery ticket. A creator business built on attention, trust, ownership, and leverage.</p><a className="circle-link" href="#roadmap" aria-label="Explore the roadmap">↘</a></div>
      <div className="hero-rule"><span>THE CREATOR WEALTH BLUEPRINT</span><span>EST. 2026</span></div>
    </section>

    <section className="equation-wrap"><div className="shell equation">
      <div><span className="kicker">The real equation</span><h2>Audience × trust<br />× offers × time</h2></div>
      <div className="equation-card"><p className="equation-mark">$1M</p><p>You do not need a million subscribers. You need a valuable audience, multiple ways to serve them, and enough time for the flywheel to compound.</p></div>
    </div></section>

    <section className="roadmap shell" id="roadmap">
      <header className="section-head"><div><span className="kicker">Your route</span><h2>Four phases.<br />One destination.</h2></div><p>Revenue milestones, not vanity metrics. Master the constraint in your current phase before adding complexity.</p></header>
      <div className="phase-grid">{phases.map((phase) => <article className="phase" key={phase.number}>
        <div className="phase-top"><span>{phase.number}</span><span>{phase.range}</span></div><h3>{phase.title}</h3><p>{phase.copy}</p><div className="metric"><span>TRACK</span>{phase.metric}</div>
      </article>)}</div>
    </section>

    <section className="model" id="model"><div className="shell model-grid">
      <div className="model-copy"><span className="kicker">Model your path</span><h2>Make the number<br />less mythical.</h2><p>Adjust the inputs to see how a diversified creator business can reach $1M in cumulative revenue. This is a planning model—not a promise.</p><div className="result"><span>At this pace</span><strong>{years ? years.toFixed(1) : '—'} years</strong><small>${Math.round(monthly).toLocaleString()} / month</small></div></div>
      <div className="controls">
        <label><span><b>Monthly views</b><output>{views.toLocaleString()}</output></span><input aria-label="Monthly views" type="range" min="50000" max="5000000" step="50000" value={views} onChange={(e) => setViews(Number(e.target.value))} /></label>
        <label><span><b>Ad RPM</b><output>${rpm}</output></span><input aria-label="Ad RPM" type="range" min="1" max="25" step="1" value={rpm} onChange={(e) => setRpm(Number(e.target.value))} /></label>
        <label><span><b>Sponsors + products / mo.</b><output>${other.toLocaleString()}</output></span><input aria-label="Other monthly revenue" type="range" min="0" max="100000" step="1000" value={other} onChange={(e) => setOther(Number(e.target.value))} /></label>
        <p className="control-note">Tip: drag the sliders. The fastest unlock is rarely “more views”—it is increasing value per viewer.</p>
      </div>
    </div></section>

    <section className="playbook shell" id="rules"><header className="section-head"><div><span className="kicker">The operating system</span><h2>Build these<br />four assets.</h2></div><p>A durable channel is not a feed of videos. It is a portfolio of compounding assets.</p></header>
      <div className="plays">{plays.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p><i>↗</i></article>)}</div>
    </section>

    <section className="truth"><div className="shell truth-grid"><p className="truth-label">THE UNCOMFORTABLE TRUTH</p><blockquote>“Your first 100 videos are tuition. Your next 100 are the business.”</blockquote><p className="truth-copy">Consistency matters, but iteration matters more. After every upload, write down what earned the click, where attention dropped, and what the comments asked for next.</p></div></section>

    <section className="final shell"><span className="kicker">Your next move</span><h2>Pick one audience.<br />Solve one problem.<br /><em>Publish this week.</em></h2><div className="final-row"><p>The million is a lagging indicator. The leading indicator is whether you shipped something genuinely useful today.</p><a href="#top">Back to top ↑</a></div></section>
    <footer className="footer shell"><span>MILLION DOLLAR CREATOR</span><span>BUILD VALUE. OWN THE UPSIDE.</span><span>2026</span></footer>
  </main>;
}
