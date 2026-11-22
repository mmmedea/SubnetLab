import Link from "next/link";
import { ArrowRight, Binary, BookOpen, Calculator, Check, Network, ShieldCheck } from "lucide-react";
import { details } from "@/lib/subnet/ipv4";

const sample = details("192.168.10.0/26");

function Brand() {
  return <Link className="brand" href="/" aria-label="SubnetLab home"><img className="brand-mark" src="/logo.svg" alt="" width="36" height="32" /><span className="brand-word">Subnet<span>Lab</span></span></Link>;
}

const features = [
  { step: "01 // CALCULATE", icon: Calculator, title: "Instant VLSM & CIDR Engine", body: "Calculate network ranges, subnet masks, host capacity, and VLSM allocations with clear results." },
  { step: "02 // VISUALIZE", icon: Binary, title: "Binary & Bitmask Visualizer", body: "Understand network and host bits, address boundaries, and how each prefix changes the block." },
  { step: "03 // PRACTICE", icon: BookOpen, title: "Timed Exam Drills", body: "Build speed and confidence with focused networking practice and step-by-step feedback." },
];

function TerminalPreview() {
  const rows = [["NETWORK", sample.network], ["USABLE HOSTS", String(sample.usable)], ["BROADCAST", sample.broadcast], ["SUBNET MASK", sample.mask]];
  return <div className="welcome-terminal" aria-label="Example subnet calculation">
    <div className="terminal-top"><span className="terminal-dots"><i /><i /><i /></span><span>SUBNETLAB // LIVE PREVIEW</span><span className="terminal-state"><b /> READY</span></div>
    <div className="terminal-body">
      <p className="terminal-comment">// SAMPLE INPUT</p>
      <div className="terminal-input"><span>›</span> 192.168.10.0/26</div>
      <div className="terminal-rule" />
      <p className="terminal-comment">// ADDRESS BREAKDOWN</p>
      <div className="terminal-rows">{rows.map(([label,value]) => <div className="terminal-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="terminal-foot"><Check size={14} /> CALCULATION COMPLETE <span>IPv4 / CIDR</span></div>
    </div>
  </div>;
}

export default function Home() {
  return <main className="welcome-page">
    <header className="welcome-nav">
      <div className="welcome-nav-inner">
        <Brand />
        <nav className="welcome-links" aria-label="Main navigation">
          <a href="#tools">Tools</a><Link href="/planner">VLSM Lab</Link><Link href="/practice">Practice Drills</Link><a href="#resources">Cheat Sheet</a>
        </nav>
        <div className="welcome-actions"><Link className="welcome-ghost" href="/login">Sign in</Link><Link className="welcome-primary nav-cta" href="/planner">Launch Lab <ArrowRight size={15}/></Link></div>
      </div>
    </header>

    <section className="welcome-hero">
      <div className="welcome-hero-copy">
        <h1>Master <span>Subnetting</span><br/> & Network Architecture.</h1>
        <p className="welcome-lead">Calculate VLSM, visualize CIDR blocks in real time, and drill binary conversions in one fast, distraction-free lab.</p>
        <div className="welcome-cta-row"><Link className="welcome-primary" href="/planner">Start Free Lab <ArrowRight size={17}/></Link><Link className="welcome-secondary" href="/planner"><Calculator size={16}/> Try Live Calculator</Link></div>
      </div>
      <TerminalPreview />
    </section>

    <section className="welcome-features" id="tools">
      <div className="welcome-section-heading"><p className="welcome-kicker">THE WORKSPACE // 01—03</p><h2>Everything you need to understand the network.</h2><p>From the first prefix to a complete address plan, work through the details with tools built for clarity.</p></div>
      <div className="welcome-feature-grid">{features.map(({step,icon:Icon,title,body},index)=><article className="welcome-feature" key={step}><p className="welcome-kicker">{step}</p><div className={`welcome-feature-icon tone-${index+1}`}><Icon size={21}/></div><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section className="welcome-banner" id="resources"><div><p className="welcome-kicker">YOUR NEXT NETWORK STARTS HERE</p><h2>Ready to ace your next networking lab?</h2><p>Open the workspace and turn subnetting concepts into practical skills.</p></div><Link className="welcome-primary" href="/signup">Create Free Account <ArrowRight size={17}/></Link></section>

    <footer className="welcome-footer">
      <div className="welcome-footer-grid">
        <div className="welcome-footer-brand"><Brand/><p>Practical tools for learning and planning computer networks.</p><span className="welcome-status"><i/> CALCULATOR ENGINE READY</span></div>
        <div><h3>WORKSPACE</h3><Link href="/planner">CIDR Calculator</Link><Link href="/planner">VLSM Planner</Link><Link href="/practice">Binary Trainer</Link><Link href="/ipam">IP Address Manager</Link></div>
        <div><h3>RESOURCES</h3><a href="#tools">Subnetting Tools</a><Link href="/practice">Practice Drills</Link><Link href="/signup?next=%2Fplanner">Learning Workspace</Link></div>
        <div><h3>ACCOUNT</h3><Link href="/login">Sign In</Link><Link href="/signup">Create Account</Link></div>
      </div>
      <div className="welcome-footer-bottom"><span>© 2026 SubnetLab. Built for network engineers & students.</span><span>PLAN // ALLOCATE // UNDERSTAND</span></div>
    </footer>
  </main>;
}
