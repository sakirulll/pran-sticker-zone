import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./AuthScreen";
import { hostingApi, type HostingUser } from "./hostingApi";
import { POSApp } from "./PosApp";

export default function App() {
  const [user, setUser] = useState<HostingUser | null>(null);
  const [ready, setReady] = useState(false);
  const logout = useCallback(() => setUser(null), []);

  const [verifyNotice, setVerifyNotice] = useState("");

  useEffect(() => {
    let active = true;
    // An email confirmation link brings its one-time token in the address.
    const verifyToken = new URLSearchParams(window.location.search).get("verify");
    const confirmed = verifyToken
      ? hostingApi.verifyEmail(verifyToken)
          .then(() => "Email confirmed. Thank you!")
          .catch((error) => (error instanceof Error ? error.message : "The email could not be confirmed."))
          .then((text) => {
            window.history.replaceState(null, "", window.location.pathname);
            if (active) setVerifyNotice(text);
          })
      : Promise.resolve();
    confirmed
      .then(() => hostingApi.session())
      .then((result) => { if (active) setUser(result.user); })
      .catch((error) => console.error("Could not check the login session", error))
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  if (!ready) return <div className="auth-loading" aria-label="Loading" />;
  if (!user) return <AuthScreen onSignedIn={setUser} initialNotice={verifyNotice} />;
  return <div className="signed-in-app"><POSApp user={user} onLogout={logout} /></div>;
}
