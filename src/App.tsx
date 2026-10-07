import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./AuthScreen";
import { hostingApi, type HostingUser } from "./hostingApi";
import { POSApp } from "./PosApp";

// Who was signed in last on this device, so the shop can open without internet.
const REMEMBERED_USER = "hishabpos_user";
function rememberedUser(): HostingUser | null {
  try {
    return JSON.parse(localStorage.getItem(REMEMBERED_USER) || "null");
  } catch {
    return null;
  }
}
function rememberUser(user: HostingUser | null) {
  try {
    if (user) localStorage.setItem(REMEMBERED_USER, JSON.stringify(user));
    else localStorage.removeItem(REMEMBERED_USER);
  } catch {
    // Storage is unavailable (a private window); the app then needs internet to open.
  }
}

export default function App() {
  const [user, setUserState] = useState<HostingUser | null>(null);
  const [ready, setReady] = useState(false);
  const setUser = useCallback((next: HostingUser | null) => {
    rememberUser(next);
    setUserState(next);
  }, []);
  const logout = useCallback(() => setUser(null), [setUser]);

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
      .catch((error) => {
        console.error("Could not check the login session", error);
        // The server could not be reached at all: carry on as the last signed-in user.
        if (active && (error as { status?: number })?.status === undefined) setUserState(rememberedUser());
      })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [setUser]);

  if (!ready) return <div className="auth-loading" aria-label="Loading" />;
  if (!user) return <AuthScreen onSignedIn={setUser} initialNotice={verifyNotice} />;
  return <div className="signed-in-app"><POSApp user={user} onLogout={logout} /></div>;
}
