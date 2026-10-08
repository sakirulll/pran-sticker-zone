import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, LockKeyhole, Mail, Package, ShieldCheck, ShoppingCart, Store, UserRound } from "lucide-react";
import { hostingApi, type HostingUser } from "./hostingApi";
import { currentLanguage, switchLanguage } from "./i18n";

type AuthMode = "login" | "register" | "forgot" | "reset";

export function AuthScreen({ onSignedIn, initialNotice = "" }: { onSignedIn: (user: HostingUser) => void; initialNotice?: string }) {
  // A password reset email links back here with the one-time token in the address.
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("reset") || "");
  const [mode, setMode] = useState<AuthMode>(resetToken ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);

  const switchTo = (next: AuthMode) => {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (mode === "reset" && password !== confirmPassword) {
      setError("দুটো password মিলছে না।");
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        await hostingApi.requestPasswordReset(email.trim());
        switchTo("login");
        setNotice("এই email দিয়ে account থাকলে একটি reset link পাঠানো হয়েছে। Inbox ও Spam folder দেখুন।");
      } else if (mode === "reset") {
        await hostingApi.resetPassword(resetToken, password);
        window.history.replaceState(null, "", window.location.pathname);
        switchTo("login");
        setNotice("Password বদলানো হয়েছে। এখন নতুন password দিয়ে login করুন।");
      } else {
        const result = mode === "register"
          ? await hostingApi.register(name.trim(), shopName.trim(), email.trim(), password)
          : await hostingApi.login(email.trim(), password);
        onSignedIn(result.user);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      const messages: Record<number, string> = {
        400: mode === "forgot" ? "একটি সঠিক email address দিন।" : "নাম, সঠিক email এবং কমপক্ষে ৮ অক্ষরের password দিন।",
        401: "Email বা password সঠিক নয়।",
        409: "এই email দিয়ে account আগে থেকেই আছে।",
        410: "এই reset link আর কাজ করে না। নতুন link চেয়ে নিন।",
        429: "অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
      };
      // No usable status means the API itself did not answer (offline, or the server is down).
      const unreachable = !status || status === 200 || status >= 500;
      setError(messages[status || 0] || (unreachable
        ? "সার্ভারের সাথে যোগাযোগ করা যায়নি। Internet সংযোগ দেখে একটু পরে আবার চেষ্টা করুন।"
        : "অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(false);
    }
  };

  const copy: Record<AuthMode, { title: string; subtitle: string; action: string }> = {
    login: { title: "Log in to your account", subtitle: "Welcome back. Enter your details to continue.", action: "Log In" },
    register: { title: "Create your account", subtitle: "Set up a new shop account in a minute.", action: "Create Account" },
    forgot: { title: "Forgot your password?", subtitle: "Enter your email and we will send you a link to choose a new one.", action: "Send Reset Link" },
    reset: { title: "Choose a new password", subtitle: "Enter a new password for your account.", action: "Save New Password" },
  };
  const choosingPassword = mode === "register" || mode === "reset";
  const passwordField = (label: string, value: string, onChange: (next: string) => void, placeholder: string) => (
    <label className="auth-label">{label}<span className="auth-field"><span className="auth-icon"><LockKeyhole size={18} /></span><input type={showPassword ? "text" : "password"} autoComplete={choosingPassword ? "new-password" : "current-password"} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} minLength={choosingPassword ? 8 : undefined} required /><button className="auth-eye" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
  );

  return (
    <main className="auth-page">
      <aside className="auth-brand">
        <div className="auth-logo"><img src="/favicon.svg" alt="" width={58} height={58} />Hishab<span>POS</span></div>
        <div className="auth-pitch">
          <h2>Run your whole shop from one place.</h2>
          <p>Sales, stock, customers and reports for your shop, ready on any device.</p>
        </div>
        <ul className="auth-points">
          <li><span><ShoppingCart size={19} /></span>Fast billing with printable invoices</li>
          <li><span><Package size={19} /></span>Live stock and purchase tracking</li>
          <li><span><ShieldCheck size={19} /></span>Separate staff logins with their own permissions</li>
        </ul>
      </aside>
      <div className="auth-panel">
        <button className="auth-language" type="button" data-no-translate onClick={() => switchLanguage(currentLanguage() === "bn" ? "en" : "bn")}>{currentLanguage() === "bn" ? "English" : "বাংলা"}</button>
        <section className="auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title">{copy[mode].title}</h1>
          <p className="auth-subtitle">{copy[mode].subtitle}</p>
          <form onSubmit={submit}>
            {mode === "register" && <label className="auth-label">Your name<span className="auth-field"><span className="auth-icon"><UserRound size={18} /></span><input autoComplete="name" placeholder="e.g. Rahim Uddin" value={name} onChange={(e) => setName(e.target.value)} required /></span></label>}
            {mode === "register" && <label className="auth-label">Shop name<span className="auth-field"><span className="auth-icon"><Store size={18} /></span><input autoComplete="organization" placeholder="e.g. Rahim Store" value={shopName} onChange={(e) => setShopName(e.target.value)} maxLength={160} required /></span></label>}
            {mode !== "reset" && <label className="auth-label">Email address<span className="auth-field"><span className="auth-icon"><Mail size={18} /></span><input type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></span></label>}
            {mode === "login" && passwordField("Password", password, setPassword, "Enter your password")}
            {mode === "register" && passwordField("Password", password, setPassword, "At least 8 characters")}
            {mode === "reset" && passwordField("New password", password, setPassword, "At least 8 characters")}
            {mode === "reset" && passwordField("Confirm new password", confirmPassword, setConfirmPassword, "Enter it again")}
            {mode === "login" && <div className="auth-forgot"><button type="button" onClick={() => switchTo("forgot")}>Forgot password?</button></div>}
            {notice && <p className="auth-feedback success" role="status"><CircleCheck size={17} />{notice}</p>}
            {error && <p className="auth-feedback error" role="alert"><CircleAlert size={17} />{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy && <span className="auth-spinner" aria-hidden="true" />}{busy ? "Please wait…" : copy[mode].action}</button>
          </form>
          <div className="auth-switch">
            {mode === "login" && <>New here? <button type="button" onClick={() => switchTo("register")}>Create an account</button></>}
            {mode === "register" && <>Already have an account? <button type="button" onClick={() => switchTo("login")}>Log in</button></>}
            {(mode === "forgot" || mode === "reset") && <button type="button" onClick={() => switchTo("login")}>Back to log in</button>}
          </div>
          <p className="auth-legal"><a href="/terms.html" target="_blank" rel="noopener">{mode === "register" ? "By creating an account you agree to the Terms and Privacy Policy" : "Terms and Privacy Policy"}</a></p>
        </section>
      </div>
    </main>
  );
}
