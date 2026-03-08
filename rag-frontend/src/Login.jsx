import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };

export default function Login({ onLogin }) {
  const handleGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result   = await signInWithPopup(auth, provider);
      onLogin(result.user);
    } catch (e) {
      alert("Login failed: " + e.message);
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:"100vh", background:"#0a0a0a", color:"#fff" }}>
      <h1 style={{ fontSize:"2rem", marginBottom:"0.5rem" }}>🧠 Gyana AI</h1>
      <p style={{ color:"#888", marginBottom:"2rem" }}>Document Intelligence</p>
      <button onClick={handleGoogle} style={{
        background:"#fff", color:"#000", border:"none", padding:"12px 28px",
        borderRadius:"8px", fontSize:"1rem", cursor:"pointer", fontWeight:"600"
      }}>
        Sign in with Google
      </button>
    </div>
  );
}
