import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("teacher");
  const [password, setPassword] = useState("teacher123");
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const data = await api.login(username, password);
      localStorage.setItem("teacher_token", data.access_token);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={onSubmit}>
        <h1>Student Performance Tracker</h1>
        <p>Teacher sign-in for dashboard management</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit">Sign In</button>
      </form>
    </div>
  );
}
