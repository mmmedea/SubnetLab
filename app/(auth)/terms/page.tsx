import Link from "next/link";

export default function TermsPage(){
  return <main className="auth-wrap"><article className="auth-card" style={{maxWidth:760}}>
    <Link className="brand" href="/">Subnet<span>Lab</span></Link>
    <p className="eyebrow">LEGAL / TERMS</p>
    <h1>Terms of Service</h1>
    <p className="muted">Last updated: November 22, 2026</p>
    <p>These terms describe the rules for using SubnetLab. By creating an account or using the service, you agree to follow them. If you do not agree, do not use the service.</p>
    <h2>1. Educational purpose</h2>
    <p>SubnetLab provides networking education and planning tools, including CIDR calculations, VLSM allocation, IP address inventory, and practice exercises. It is an educational aid. You are responsible for independently verifying all addressing, routing, access-control, and configuration decisions before using them on a real network.</p>
    <h2>2. Your account</h2>
    <p>Keep your sign-in credentials private and provide accurate account information. You are responsible for activity performed through your account. Tell the service operator if you believe your account has been accessed without permission.</p>
    <h2>3. Acceptable use</h2>
    <p>Do not use SubnetLab to break the law, interfere with networks or systems you do not own or administer, bypass security controls, abuse the service, or attempt to access another user's data. Do not upload content that you are not allowed to share.</p>
    <h2>4. Your data</h2>
    <p>You retain rights to the network plans, labels, notes, and other content you submit. You give SubnetLab permission to store and process that content only as needed to operate the features you use. Account and data handling is described in the <Link className="link" href="/privacy">Privacy Policy</Link>.</p>
    <h2>5. Availability and changes</h2>
    <p>The service may change, be interrupted, or become unavailable. Features may be added, modified, or removed. We do not promise uninterrupted availability, error-free calculations, or suitability for a particular production environment.</p>
    <h2>6. Disclaimer</h2>
    <p>SubnetLab is provided for learning and convenience. To the extent permitted by applicable law, it is provided without warranties. Always validate outputs and keep independent backups of important network documentation.</p>
    <h2>7. Suspension and termination</h2>
    <p>Access may be restricted where necessary to protect the service, other users, or comply with law. You may stop using the service and request account deletion through the account settings where that feature is available.</p>
    <h2>8. Changes to these terms</h2>
    <p>These terms may be updated as the service changes. The date above indicates the latest revision. Continued use after an update means you accept the updated terms.</p>
    <p className="auth-foot"><Link className="link" href="/signup">Back to sign up</Link> · <Link className="link" href="/privacy">Privacy Policy</Link></p>
  </article></main>;
}
