import Link from "next/link";

export default function PrivacyPage(){
  return <main className="auth-wrap"><article className="auth-card" style={{maxWidth:760}}>
    <Link className="brand" href="/">Subnet<span>Lab</span></Link>
    <p className="eyebrow">LEGAL / PRIVACY</p>
    <h1>Privacy Policy</h1>
    <p className="muted">Last updated: November 22, 2026</p>
    <p>This policy explains what SubnetLab stores when you use its account and networking features.</p>
    <h2>1. Information you provide</h2>
    <ul>
      <li>Account information such as email address, username, and sign-in provider details.</li>
      <li>Profile information such as display name, biography, and avatar image.</li>
      <li>Workspace content such as saved network plans, VLSM allocations, IP address labels, status, and notes.</li>
      <li>Learning information such as practice answers, correctness, topics, and attempt timestamps.</li>
      <li>Preferences such as appearance, notifications, and default IP version.</li>
    </ul>
    <h2>2. Information processed automatically</h2>
    <p>The hosting, authentication, and database providers may process technical information needed to deliver and secure the service, such as request metadata, security events, and session cookies. Provider logging and retention are governed by their own policies and configuration.</p>
    <h2>3. How information is used</h2>
    <p>Information is used to authenticate you, display your profile, save and retrieve your workspace, record learning progress, protect the service, and respond to support or security issues. SubnetLab does not need your network passwords, device credentials, or private keys to provide its core features. Do not enter them into notes or labels.</p>
    <h2>4. Service providers</h2>
    <p>SubnetLab uses Supabase for authentication, database, and avatar storage, and Vercel for hosting and deployment. If you choose Google sign-in, Google processes the authentication request under its own privacy terms. These providers process information to deliver their respective services.</p>
    <h2>5. Sharing</h2>
    <p>Your private workspace records are protected by account-based access rules. We do not intentionally publish your network plans, IP inventory, practice history, or private profile fields. Information may be disclosed where required by law or when necessary to protect the service and its users.</p>
    <h2>6. Retention and deletion</h2>
    <p>Information is kept while your account is active or as needed to operate and secure the service. You can edit profile information and request account deletion in settings. Account deletion requires the server-side administrative configuration to be enabled; if the action is unavailable or fails, your data may remain until the operator completes the request.</p>
    <h2>7. Security</h2>
    <p>SubnetLab uses authenticated sessions, database row-level security, and restricted server-side credentials. No internet service can guarantee absolute security. Use a strong, unique password and avoid storing sensitive credentials in workspace notes.</p>
    <h2>8. Your choices</h2>
    <p>You can update profile details and preferences, sign out other sessions, export the account information currently available in settings, or request deletion where enabled.</p>
    <h2>9. Changes</h2>
    <p>This policy may be updated as features and providers change. The date above indicates the latest revision.</p>
    <p className="auth-foot"><Link className="link" href="/signup">Back to sign up</Link> · <Link className="link" href="/terms">Terms of Service</Link></p>
  </article></main>;
}
