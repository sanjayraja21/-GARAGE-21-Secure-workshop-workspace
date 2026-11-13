import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, getToken, setSession, clearSession } from "./api";
import { connectWebSocket } from "./websocket";
import { Logo, Emblem, CarArt } from "./Brand";

const STATUS_OPTIONS = ["Received", "Inspection", "Waiting for Approval", "Repairing", "Quality Check", "Ready for Delivery", "Delivered"];
const NAV = [
  ["Dashboard", "▦", "Overview"], ["Customers", "♙", "CRM"], ["Vehicles", "▰", "Vehicle passport"],
  ["Service Jobs", "⚙", "Repair workflow"], ["appointments", "▣", "Appointments"], ["inspections", "✓", "Vehicle inspection"],
  ["estimates", "₹", "Estimates"], ["invoices", "▤", "Invoices"], ["payments", "↗", "Payments"],
  ["inventory", "▦", "Spare parts"], ["suppliers", "♧", "Suppliers"], ["employees", "♙", "Mechanics & staff"],
  ["attendance", "◷", "Attendance"], ["leave", "☷", "Leave requests"], ["quality-control", "✓", "Quality control"],
  ["feedback", "☆", "Feedback"], ["complaints", "!", "Complaints"], ["maintenance", "◷", "Maintenance reminders"],
  ["warranties", "◇", "Warranty & free service"], ["branches", "⌂", "Branches"], ["purchase-orders", "▤", "Purchase orders"],
  ["service-packages", "✳", "Service packages"], ["time-logs", "◴", "Labour time logs"], ["notifications", "♧", "Notifications"],
  ["audit-logs", "≡", "Audit logs"], ["Reports", "▥", "Reports & analytics"], ["AI Assistant", "✦", "Local AI assistant"], ["QR Tracking", "▦", "QR job tracking"],
  ["users", "⚿", "Users & roles"]
];
// Friendlier names for the customer role.
const CUSTOMER_LABELS = { "Customers": "My profile", "Vehicles": "My vehicles", "QR Tracking": "Job tracking", appointments: "My appointments", feedback: "My feedback", complaints: "My complaints" };
const LABELS = {
  customer_name:"Customer name", registration_number:"Registration number", time_slot:"Time slot", job_id:"Job ID",
  fuel_level:"Fuel level", damage_notes:"Damage / scratch notes", accessories:"Accessories received", customer_complaint:"Customer complaint",
  photos_note:"Photo references / notes", handover_confirmed:"Handover confirmed", tax_rate:"Tax rate (%)", customer_approval:"Customer approval",
  unit_cost:"Unit cost", reorder_level:"Reorder level", complaint_status:"Complaint status", service_due:"Service due", due_date:"Due date",
  start_date:"Start date", end_date:"End date", check_in:"Check-in", check_out:"Check-out", expected_date:"Expected date",
  labour_cost:"Labour cost", parts_cost:"Parts cost", duration_hours:"Duration (hours)", test_drive:"Test drive record", approved:"Approved",
  follow_up:"Follow-up required", low_stock:"Low stock", paid_at:"Payment date/time"
};
const titleCase = (value) => LABELS[value] || value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));

export default function App() {
  const [token, setToken] = useState(() => getToken());
  const [authUser, setAuthUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem("garage_pro_user") || "null"); } catch { return null; } });
  const [authMode, setAuthMode] = useState(() => new URLSearchParams(window.location.search).get("reset_token") ? "reset" : "login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset_token") || "");
  const [authInfo, setAuthInfo] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [changedPassword, setChangedPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [page, setPage] = useState("Dashboard");
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [modules, setModules] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name:"", phone:"", email:"", address:"" });
  const [vehicleForm, setVehicleForm] = useState({ customer_id:"", registration_number:"", make:"", model:"", year:"", odometer:"0", vin:"", insurance_expiry:"" });
  const [jobForm, setJobForm] = useState({ customer_id:"", vehicle_id:"", complaint:"", estimated_cost:"0", mechanic_name:"" });
  const [moduleForm, setModuleForm] = useState({});
  const [users, setUsers] = useState([]);
  const [roleSummary, setRoleSummary] = useState([]);
  const role = authUser?.role || "customer";
  const allowedPages = authUser?.allowed_pages || [];
  const can = (key) => allowedPages.includes("*") || allowedPages.includes(key);
  const visibleNav = NAV.filter(([key]) => can(key));
  const homePage = visibleNav[0]?.[0] || "Dashboard";
  const view = can(page) ? page : homePage;
  const navLabel = (key, label) => (role === "customer" && CUSTOMER_LABELS[key]) || label;

  const refreshCore = useCallback(async () => {
    // Each role is only allowed some of these calls, so load them independently.
    const results = await Promise.allSettled([
      api.getCustomers(), api.getVehicles(), api.getJobs(), api.getModules(),
      role === "admin" ? api.getSummary() : Promise.resolve({})
    ]);
    const val = (i, fallback) => results[i].status === "fulfilled" ? results[i].value : fallback;
    setCustomers(val(0, [])); setVehicles(val(1, [])); setJobs(val(2, [])); setModules(val(3, [])); setSummary(val(4, {}));
    const failure = results.find(r => r.status === "rejected" && !/does not have access/i.test(r.reason?.message || ""));
    setError(failure ? failure.reason.message : "");
  }, [role]);

  const refreshModule = useCallback(async (moduleKey) => {
    if (!moduleKey || !modules.some(m => m.key === moduleKey)) return;
    try { setRecords(await api.getModuleRecords(moduleKey)); }
    catch (e) { setError(e.message); }
  }, [modules]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getMe().then(user => { if (!cancelled) { setAuthUser(user); sessionStorage.setItem("garage_pro_user", JSON.stringify(user)); } }).catch(() => { if (!cancelled) doLogout(); });
    refreshCore();
    const socket = connectWebSocket(() => refreshCore());
    const timer = setInterval(refreshCore, 30000);
    const onExpired = () => doLogout("Your session expired. Please log in again.");
    window.addEventListener("garage-pro-session-expired", onExpired);
    const onPageShow = () => { if (!getToken()) { setToken(null); setAuthUser(null); } };
    window.addEventListener("pageshow", onPageShow);
    return () => { cancelled = true; socket.close(); clearInterval(timer); window.removeEventListener("garage-pro-session-expired", onExpired); window.removeEventListener("pageshow", onPageShow); };
  }, [refreshCore, token]);

  useEffect(() => {
    if (modules.some(m => m.key === page)) { setRecords([]); setModuleForm({}); refreshModule(page); }
  }, [page, modules, refreshModule]);

  useEffect(() => { if (token && authUser && !can(page)) setPage(homePage); }, [token, authUser, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (token && role === "admin" && page === "users") {
      Promise.all([api.getUsers(), api.getRoleSummary()]).then(([u, r]) => { setUsers(u); setRoleSummary(r); }).catch(e => setError(e.message));
    }
  }, [token, role, page]);

  async function perform(action, successMessage) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await action();
      await refreshCore();
      if (modules.some(m => m.key === page)) await refreshModule(page);
      setNotice(typeof successMessage === "function" ? successMessage(result) : successMessage);
      return result;
    } catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  }
  function update(setter, key, value) { setter(prev => ({...prev, [key]:value})); }
  function doLogout(message = "") {
    clearSession(); setToken(null); setAuthUser(null); setAuthPassword(""); setAuthError(message); setError(""); setNotice("");
    window.history.replaceState(null, "", window.location.pathname);
  }
  async function submitAuth(e) {
    e.preventDefault(); setAuthBusy(true); setAuthError(""); setAuthInfo("");
    try {
      if (authMode === "forgot") {
        const result = await api.forgotPassword({ email: authEmail });
        setAuthInfo(result.message || "If that email is registered, reset instructions will be sent.");
      } else if (authMode === "reset") {
        const result = await api.resetPassword({ token: resetToken, new_password: authNewPassword });
        setAuthInfo(result.message || "Password reset. Please log in."); setAuthMode("login"); setAuthPassword(""); setAuthNewPassword("");
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        const data = authMode === "login"
          ? await api.login({ email: authEmail, password: authPassword })
          : await api.register({ name: authName, email: authEmail, password: authPassword, phone: authPhone });
        setSession(data); setToken(data.access_token); setAuthUser(data.user); setAuthPassword("");
      }
    } catch (e) { setAuthError(e.message || "Unable to complete the request. Please try again."); }
    finally { setAuthBusy(false); }
  }
  async function submitChangePassword(e) {
    e.preventDefault(); setAuthBusy(true); setError("");
    try {
      await api.changePassword({ current_password: currentPassword, new_password: changedPassword });
      doLogout("Password changed successfully. Please log in with your new password.");
      setShowPasswordChange(false); setCurrentPassword(""); setChangedPassword("");
    } catch (e) { setError(e.message); }
    finally { setAuthBusy(false); }
  }
  function customerName(id) { return customers.find(c => c.customer_id === id)?.name || id || "—"; }
  function vehicleName(id) {
    const v = vehicles.find(item => item.vehicle_id === id);
    return v ? `${v.registration_number} · ${v.make} ${v.model}` : id || "—";
  }
  async function changeStatus(jobId, status) {
    await perform(() => api.updateJobStatus(jobId, status), `Job ${jobId} updated to ${status}.`);
  }
  const activeJobs = jobs.filter(j => j.status !== "Delivered");
  const filteredRecords = useMemo(() => records.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())), [records, search]);
  const currentModule = modules.find(m => m.key === view);

  if (!token) return <div className="auth-page"><aside className="auth-showcase" aria-hidden="true"><span className="big-21">21</span><CarArt variant="coupe" tone="red" className="showcase-car"/><div className="showcase-copy"><h2>Every job, from check-in to handover.</h2><p>Customers, vehicles, repairs, parts and payments in one workshop system.</p></div></aside><div className="auth-card"><div className="auth-brand"><Logo size={54} tagline="Secure workshop workspace"/></div><div className="auth-heading"><p className="eyebrow">Workshop management system</p><h1>{authMode === "login" ? "Welcome back" : authMode === "register" ? "Create your account" : authMode === "forgot" ? "Forgot password?" : "Reset password"}</h1><p>{authMode === "login" ? "Log in with your email and password to continue." : authMode === "register" ? "Create a customer account to track your vehicles and service jobs." : authMode === "forgot" ? "Enter your email and we will send reset instructions if the account exists." : "Choose a new password with at least 8 characters."}</p></div>{authError && <div className="auth-error" role="alert">{authError}</div>}{authInfo && <div className="alert success" role="status">{authInfo}</div>}<form className="auth-form" onSubmit={submitAuth}>{authMode === "register" && <label className="field"><span>Full name</span><input autoComplete="name" required minLength={2} maxLength={80} value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="Your name"/></label>}{authMode === "register" && <label className="field"><span>Phone number</span><input type="tel" autoComplete="tel" minLength={10} maxLength={15} value={authPhone} onChange={e=>setAuthPhone(e.target.value)} placeholder="10-digit phone number"/></label>}{authMode !== "reset" && <label className="field"><span>Email address</span><input type="email" autoComplete="email" required value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com"/></label>}{authMode === "login" || authMode === "register" ? <label className="field"><span>Password</span><input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} required minLength={authMode === "register" ? 8 : 1} maxLength={128} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder={authMode === "register" ? "At least 8 characters" : "Enter your password"}/></label> : null}{authMode === "reset" && <><label className="field"><span>Reset token</span><input required value={resetToken} onChange={e=>setResetToken(e.target.value)} placeholder="Token from reset email"/></label><label className="field"><span>New password</span><input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={authNewPassword} onChange={e=>setAuthNewPassword(e.target.value)} placeholder="At least 8 characters"/></label></>}{<button className="button primary auth-submit" disabled={authBusy}>{authBusy ? "Please wait..." : authMode === "login" ? "Log in securely" : authMode === "register" ? "Create account" : authMode === "forgot" ? "Send reset instructions" : "Reset password"}</button>}</form>{authMode === "login" && <p className="auth-switch"><button type="button" onClick={()=>{setAuthMode("forgot");setAuthError("");setAuthInfo("");}}>Forgot password?</button></p>}{authMode !== "reset" && <p className="auth-switch">{authMode === "register" ? "Already have an account?" : authMode === "forgot" ? "Remember your password?" : "New to Garage 21?"} <button type="button" onClick={()=>{setAuthMode(authMode === "register" || authMode === "forgot" ? "login" : "register");setAuthError("");setAuthInfo("");}}>{authMode === "register" || authMode === "forgot" ? "Log in" : "Create account"}</button></p>}{authMode === "reset" && <p className="auth-switch"><button type="button" onClick={()=>setAuthMode("login")}>Back to login</button></p>}<p className="auth-footnote">Passwords are securely hashed. Mechanic, employee and admin accounts are created by a workshop admin. Log out when finished on a shared computer.</p></div></div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><Logo size={44} tagline="Workshop OS · Local-first"/></div>
      <p className="nav-label">Workspace</p>
      <nav className="side-nav">
        {visibleNav.map(([key, icon, label]) => <button key={key} className={`nav-item ${view === key ? "active" : ""}`} onClick={() => {setPage(key); setSearch(""); setError(""); setNotice("");}}>
          <span>{icon}</span>{navLabel(key, label)}
          {key === "notifications" && summary.unread_notifications > 0 && <b className="nav-count">{summary.unread_notifications}</b>}
        </button>)}
      </nav>
      <div className="sidebar-bottom"><span className="status-dot" /> Local workshop system<small>Garage 21 v2.0 · MongoDB</small></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">Garage 21</p><h1>{view === "Dashboard" ? "Workshop overview" : navLabel(view, NAV.find(n => n[0] === view)?.[2] || view)}</h1></div><div className="top-actions"><span className="live-pill"><i/> Local system</span><span className={`role-badge role-${role}`}>{authUser?.role_label || role}</span><span className="signed-in-user">{authUser?.name || authUser?.email || "Signed in"}</span><button className="button secondary" onClick={refreshCore}>↻ Refresh</button><button className="button secondary" onClick={() => setShowPasswordChange(v=>!v)}>Change password</button><button className="button secondary logout-button" onClick={() => doLogout()}>Log out</button></div></header>
      {showPasswordChange && <section className="panel password-change-panel"><PanelTitle title="Change password" sub="Verify your current password and choose a new one."/><form onSubmit={submitChangePassword} className="auth-form"><Field label="Current password"><input type="password" autoComplete="current-password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></Field><Field label="New password (at least 8 characters)"><input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={changedPassword} onChange={e=>setChangedPassword(e.target.value)}/></Field><button className="button primary" disabled={authBusy}>{authBusy ? "Saving..." : "Update password"}</button><button type="button" className="button secondary" onClick={()=>setShowPasswordChange(false)}>Cancel</button></form></section>}{error && <div className="alert error"><strong>Something went wrong</strong><p>{error}</p><button onClick={() => setError("")}>Dismiss</button></div>}
      {notice && <div className="alert success">{notice}</div>}

      {view === "Dashboard" && <Dashboard summary={summary} customers={customers} vehicles={vehicles} jobs={jobs} activeJobs={activeJobs} onOpen={setPage} onStatus={changeStatus} busy={busy} customerName={customerName} vehicleName={vehicleName} />}
      {view === "Customers" && <section className="content-grid">
        {role === "admin" ? <section className="panel"><PanelTitle title="Add customer" sub="Create a profile and unique customer ID."/><form onSubmit={e => {e.preventDefault(); perform(() => api.createCustomer(customerForm), r => `Customer ${r.customer_id} created.`).then(r => {if(r)setCustomerForm({name:"",phone:"",email:"",address:""});});}}>
          <Field label="Full name"><input required minLength={2} value={customerForm.name} onChange={e=>update(setCustomerForm,"name",e.target.value)} placeholder="e.g. Arun Kumar"/></Field>
          <Field label="Phone number"><input required minLength={10} maxLength={15} value={customerForm.phone} onChange={e=>update(setCustomerForm,"phone",e.target.value)} placeholder="10-digit phone number"/></Field>
          <Field label="Email"><input type="email" value={customerForm.email} onChange={e=>update(setCustomerForm,"email",e.target.value)} placeholder="name@example.com"/></Field>
          <Field label="Address"><textarea value={customerForm.address} onChange={e=>update(setCustomerForm,"address",e.target.value)} placeholder="Customer address"/></Field>
          <button className="button primary" disabled={busy}>＋ Save customer</button></form></section> : <section className="panel"><PanelTitle title="Your account" sub="Your details are linked to your vehicles and job cards."/><div className="notice-card"><strong>{authUser?.name}</strong><p>{authUser?.email}<br/>Customer ID: {authUser?.customer_id || "—"}</p></div><p className="muted tiny">To change your details, ask the workshop to update your profile.</p></section>}
        <section className="panel"><PanelTitle title={role === "admin" ? "Customer directory" : "Your profile"} sub={role === "admin" ? `${customers.length} customer profiles` : "Visible only to you and the workshop."}/><SearchBox value={search} onChange={setSearch}/><div className="record-list">{customers.filter(c=>JSON.stringify(c).toLowerCase().includes(search.toLowerCase())).map(c=><div className="record" key={c.customer_id}><div className="avatar">{c.name?.[0]?.toUpperCase()}</div><div className="record-info"><strong>{c.name}</strong><span>{c.phone} · {c.email || "No email"}</span><small>{c.customer_id} · {c.address || "Address not added"}</small></div></div>)}{customers.length===0&&<Empty text="No customers yet. Add the first profile."/>}</div></section>
      </section>}
      {view === "Vehicles" && <section className="content-grid">
        <section className="panel"><PanelTitle title="Register vehicle" sub="Digital vehicle passport basics."/><form onSubmit={e=>{e.preventDefault();perform(()=>api.createVehicle({...vehicleForm,year:vehicleForm.year?Number(vehicleForm.year):null,odometer:Number(vehicleForm.odometer)}),"Vehicle passport created.").then(r=>{if(r)setVehicleForm({customer_id:"",registration_number:"",make:"",model:"",year:"",odometer:"0",vin:"",insurance_expiry:""});});}}>
          <Field label="Customer"><select required value={vehicleForm.customer_id} onChange={e=>update(setVehicleForm,"customer_id",e.target.value)}><option value="">Select customer</option>{customers.map(c=><option key={c.customer_id} value={c.customer_id}>{c.name} ({c.customer_id})</option>)}</select></Field>
          <Field label="Registration number"><input required value={vehicleForm.registration_number} onChange={e=>update(setVehicleForm,"registration_number",e.target.value)} placeholder="TN 01 AB 1234"/></Field>
          <div className="form-row"><Field label="Make"><input required value={vehicleForm.make} onChange={e=>update(setVehicleForm,"make",e.target.value)} placeholder="Maruti"/></Field><Field label="Model"><input required value={vehicleForm.model} onChange={e=>update(setVehicleForm,"model",e.target.value)} placeholder="Swift"/></Field></div>
          <div className="form-row"><Field label="Year"><input type="number" min="1950" max="2100" value={vehicleForm.year} onChange={e=>update(setVehicleForm,"year",e.target.value)} placeholder="2022"/></Field><Field label="Odometer (km)"><input type="number" min="0" value={vehicleForm.odometer} onChange={e=>update(setVehicleForm,"odometer",e.target.value)}/></Field></div>
          <Field label="VIN / chassis number"><input value={vehicleForm.vin} onChange={e=>update(setVehicleForm,"vin",e.target.value)} placeholder="Optional"/></Field><Field label="Insurance expiry"><input type="date" value={vehicleForm.insurance_expiry} onChange={e=>update(setVehicleForm,"insurance_expiry",e.target.value)}/></Field>
          <button className="button primary" disabled={busy}>＋ Register vehicle</button></form></section>
        <section className="panel"><PanelTitle title="Vehicle passports" sub={`${vehicles.length} vehicles registered`}/><SearchBox value={search} onChange={setSearch}/><div className="record-list">{vehicles.filter(v=>JSON.stringify(v).toLowerCase().includes(search.toLowerCase())).map(v=><div className="record" key={v.vehicle_id}><div className="avatar vehicle-avatar"><CarArt variant="coupe" tone="grey"/></div><div className="record-info"><strong>{v.registration_number} · {v.make} {v.model}</strong><span>Owner: {customerName(v.customer_id)}</span><small>{v.vehicle_id} · {v.odometer || 0} km · {v.year || "Year not set"}{v.insurance_expiry?` · Insurance to ${v.insurance_expiry}`:""}</small></div></div>)}{vehicles.length===0&&<Empty text="Register a vehicle to create its digital passport."/>}</div></section>
      </section>}
      {view === "Service Jobs" && <section className="content-grid">
        <section className="panel"><PanelTitle title="Open job card" sub="Create a repair job and track its status."/><form onSubmit={e=>{e.preventDefault();perform(()=>api.createJob({...jobForm,estimated_cost:Number(jobForm.estimated_cost)}),r=>`Job card ${r.job_id} created.`).then(r=>{if(r)setJobForm({customer_id:"",vehicle_id:"",complaint:"",estimated_cost:"0",mechanic_name:""});});}}>
          <Field label="Customer"><select required value={jobForm.customer_id} onChange={e=>{update(setJobForm,"customer_id",e.target.value);update(setJobForm,"vehicle_id","");}}><option value="">Select customer</option>{customers.map(c=><option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}</select></Field>
          <Field label="Vehicle"><select required value={jobForm.vehicle_id} onChange={e=>update(setJobForm,"vehicle_id",e.target.value)}><option value="">Select vehicle</option>{vehicles.filter(v=>!jobForm.customer_id||v.customer_id===jobForm.customer_id).map(v=><option key={v.vehicle_id} value={v.vehicle_id}>{v.registration_number} · {v.make} {v.model}</option>)}</select></Field>
          <Field label="Customer complaint"><textarea required minLength={3} value={jobForm.complaint} onChange={e=>update(setJobForm,"complaint",e.target.value)} placeholder="Describe the concern reported by customer"/></Field>
          <div className="form-row"><Field label="Estimated cost (₹)"><input type="number" min="0" value={jobForm.estimated_cost} onChange={e=>update(setJobForm,"estimated_cost",e.target.value)}/></Field><Field label="Assigned mechanic"><input value={jobForm.mechanic_name} onChange={e=>update(setJobForm,"mechanic_name",e.target.value)} placeholder="Mechanic name"/></Field></div>
          <button className="button primary" disabled={busy}>＋ Create job card</button></form></section>
        <section className="panel"><PanelTitle title="Live repair workflow" sub={`${jobs.length} job cards · update status as work progresses`}/><JobTable jobs={jobs} customerName={customerName} vehicleName={vehicleName} onStatus={changeStatus} busy={busy}/></section>
      </section>}
      {currentModule && <ModulePage readOnly={currentModule.access === "r"} module={currentModule} records={filteredRecords} count={records.length} form={moduleForm} setForm={setModuleForm} search={search} setSearch={setSearch} busy={busy} onCreate={async data=>{const result=await perform(()=>api.createModuleRecord(page,data),r=>`${currentModule.label} record ${r.record_id} saved.`);if(result)setModuleForm({});}}/>}
      {view === "Reports" && <Reports summary={summary} jobs={jobs} customers={customers} vehicles={vehicles} onExport={()=>exportCsv("garage-21-jobs.csv",jobs)}/>}
      {view === "AI Assistant" && <section className="ai-layout"><section className="panel ai-intro"><div className="ai-orb"><Emblem size={52}/></div><span className="tag">Local AI · Ollama</span><h2>Garage 21 Assistant</h2><p className="muted">Ask for help summarising repair notes, drafting customer-friendly explanations, or preparing a checklist. Responses are generated locally by Ollama when it is running.</p><div className="notice-card"><strong>Mechanic review required</strong><p>AI suggestions are drafts, not a diagnosis. Verify repair recommendations, estimates and safety-critical decisions with a qualified mechanic.</p></div><p className="muted tiny">Default model: llama3.2 · No paid AI API required.</p></section><section className="panel"><PanelTitle title="Ask the assistant" sub="Your prompt is sent to your local Ollama server."/><div className="prompt-chips">{["Explain this repair in simple language","Create a vehicle inspection checklist","Summarise these mechanic notes"].map(x=><button className="chip" key={x} onClick={()=>setAiPrompt(x)}>{x}</button>)}</div><form onSubmit={async e=>{e.preventDefault();setAiBusy(true);setError("");setAiReply("");try{const result=await api.askAI(aiPrompt);setAiReply(result.reply||"No response.");}catch(err){setError(err.message);}finally{setAiBusy(false);}}}><Field label="Question or notes"><textarea required rows="6" value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Paste mechanic notes or enter a question..."/></Field><button className="button primary" disabled={aiBusy}>{aiBusy?"Thinking locally...":"✦ Ask Garage 21 Assistant"}</button></form>{aiReply&&<div className="ai-reply"><strong>Assistant response</strong><p>{aiReply}</p><button className="button secondary" onClick={()=>navigator.clipboard?.writeText(aiReply)}>Copy response</button></div>}</section></section>}
      {view === "users" && <UsersPage users={users} summary={roleSummary} me={authUser} busy={busy} onCreate={async data=>{const r=await perform(()=>api.createUser(data),x=>`${x.role_label} account created for ${x.name}.`);if(r){setUsers(await api.getUsers());setRoleSummary(await api.getRoleSummary());}return r;}} onUpdate={async(id,data)=>{const r=await perform(()=>api.updateUser(id,data),"Account updated.");if(r){setUsers(await api.getUsers());setRoleSummary(await api.getRoleSummary());}}}/>}
      {view === "QR Tracking" && <QRTracking jobs={jobs} customerName={customerName} vehicleName={vehicleName}/>}
    </main>
  </div>;
}

function Dashboard({summary,customers,vehicles,jobs,activeJobs,onOpen,onStatus,busy,customerName,vehicleName}) {
  const ready=jobs.filter(j=>j.status==="Ready for Delivery").length;
  const cards=[["Customers",summary.customers??customers.length,"CRM", "♙"],["Vehicles",summary.vehicles??vehicles.length,"Digital passports","▰"],["Active jobs",summary.active_jobs??activeJobs.length,"In workshop","⚙"],["Collected",money(summary.revenue_collected),"Payments received","₹"],["Outstanding",money(summary.outstanding_balance),"Invoice balances","▤"],["Low stock",summary.low_stock_items??0,"Reorder attention","!"],["Appointments",summary.appointments??0,"Bookings recorded","▣"],["Ready for delivery",ready,"Awaiting collection","✓"]];
  return <><section className="welcome-panel"><span className="big-21" aria-hidden="true">21</span><div className="welcome-copy"><p className="eyebrow light">Your workshop at a glance</p><h2>Keep every repair moving.</h2><p>Customers, vehicles, job cards, payments and stock — together in one local workspace.</p><div className="welcome-actions"><button className="button light-button" onClick={()=>onOpen("Service Jobs")}>Open job cards</button><button className="button outline-light" onClick={()=>onOpen("appointments")}>Book appointment</button></div></div><CarArt variant="coupe" tone="red" className="welcome-car" title="Red sports coupe"/></section>
  <section className="stats-grid">{cards.map(([title,value,sub,icon])=><div className="stat-card" key={title}><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{sub}</small></div>)}</section>
  <section className="bay-gallery" aria-label="Cars in the bay">{[["wedge","red","Track build","Tune-up and brake upgrade"],["suv","black","Executive sedan","Full service and inspection"],["coupe","grey","Weekend coupe","Detailing and ceramic coat"]].map(([v,t,name,note])=><figure className="bay-card" key={name}><CarArt variant={v} tone={t} title={name}/><figcaption><strong>{name}</strong><span>{note}</span></figcaption></figure>)}</section>
  <section className="dashboard-grid"><section className="panel"><PanelTitle title="Recent service jobs" sub="Change the status as a repair progresses."/><JobTable jobs={jobs.slice(0,6)} customerName={customerName} vehicleName={vehicleName} onStatus={onStatus} busy={busy}/></section><section className="panel"><PanelTitle title="Quick actions" sub="Go straight to a common workflow."/><div className="quick-actions">{[["＋","Register customer","Customers"],["▰","Add vehicle passport","Vehicles"],["⚙","Create job card","Service Jobs"],["▣","Book appointment","appointments"],["▤","Create invoice","invoices"],["✦","Ask local AI assistant","AI Assistant"]].map(([icon,label,key])=><button key={label} onClick={()=>onOpen(key)}><span>{icon}</span><strong>{label}</strong><b>→</b></button>)}</div><div className="notice-card dashboard-note"><strong>Live updates</strong><p>Dashboard refreshes automatically every 30 seconds while the backend is running.</p></div></section></section></>;
}
function PanelTitle({title,sub}) { return <div className="panel-heading"><div><h2>{title}</h2><p className="muted">{sub}</p></div></div>; }
function Field({label,children}) { return <label className="field"><span>{label}</span>{children}</label>; }
function Empty({text}) { return <div className="empty"><CarArt variant="wedge" tone="grey"/><p>{text}</p></div>; }
function SearchBox({value,onChange}) { return <div className="search-box"><span>⌕</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder="Search records..."/></div>; }
function JobTable({jobs,customerName,vehicleName,onStatus,busy}) {
  if(!jobs.length) return <Empty text="No service jobs yet. Create a job card to start tracking repairs." />;
  return <div className="table-wrap"><table><thead><tr><th>Job / Vehicle</th><th>Customer</th><th>Estimate</th><th>Status</th></tr></thead><tbody>{jobs.map(j=><tr key={j.job_id}><td><strong>{j.job_id}</strong><small>{vehicleName(j.vehicle_id)}</small><small className="complaint">{j.complaint}</small></td><td>{customerName(j.customer_id)}</td><td>{money(j.estimated_cost)}</td><td><select className={`status-select status-${(j.status||"").toLowerCase().replaceAll(" ","-")}`} disabled={busy} value={j.status} onChange={e=>onStatus(j.job_id,e.target.value)}>{STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div>;
}
function ModulePage({module,readOnly,records,count,form,setForm,search,setSearch,busy,onCreate}) {
  const fields=module.fields||[];
  const wide = fields.length>5;
  const valueFor=(f)=>form[f]??"";
  function inputFor(field) {
    const val=valueFor(field);
    if(["approved","active","read","handover_confirmed","follow_up","test_drive"].includes(field)) return <select value={val} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))}><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>;
    if(["date","start_date","end_date","due_date","expected_date","order_date","service_due","paid_at"].includes(field)) return <input type={field==="paid_at"?"datetime-local":"date"} value={val} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))}/>;
    if(["notes","description","comments","damage_notes","customer_complaint","accessories","photos_note","checklist","defects","items","address","resolution","details","skills","coverage","reason"].includes(field)) return <textarea rows="2" value={val} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))} placeholder={titleCase(field)}/>;
    if(["quantity","reorder_level","odometer","rating","labour","parts","tax_rate","subtotal","tax","total","paid","balance","amount","unit_cost","price","labour_cost","parts_cost","duration_hours","hours"].includes(field)) return <input type="number" min="0" step="any" value={val} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))} placeholder="0"/>;
    if(["status","priority","method","fuel_level","availability","branch","role","category","shift","supplier","customer_approval"].includes(field)) return <input value={val} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))} placeholder={`Enter ${titleCase(field).toLowerCase()}`}/>;
    return <input value={val} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))} placeholder={titleCase(field)}/>;
  }
  return <section className={`module-layout ${readOnly ? "module-readonly" : ""}`}>{!readOnly && <section className="panel"><PanelTitle title={`New ${module.label.toLowerCase()} record`} sub="Complete the relevant details and save to MongoDB."/><form onSubmit={e=>{e.preventDefault();const data={...form};onCreate(data);}}><div className={`dynamic-fields ${wide?"wide-fields":""}`}>{fields.map(f=><Field key={f} label={titleCase(f)}>{inputFor(f)}</Field>)}</div><button className="button primary" disabled={busy}>＋ Save {module.label}</button></form><p className="tiny muted">Records are stored locally in your Garage 21 MongoDB database.</p></section>}
  <section className="panel"><PanelTitle title={`${module.label} records`} sub={readOnly ? `${count} saved records · view only for your role` : `${count} saved records`}/><SearchBox value={search} onChange={setSearch}/>{records.length===0?<Empty text="No matching records. Add one using the form."/>:<div className="module-records">{records.map((r,i)=><article className="module-record" key={r.record_id||r._id||i}><div className="module-record-head"><strong>{r.title||r.part_name||r.name||r.record_type||module.label}</strong><span className="record-id">{r.record_id||r.job_id||""}</span></div><div className="record-data">{Object.entries(r).filter(([k,v])=>!["_id","record_id","created_at","updated_at","record_type"].includes(k)&&v!==""&&v!==null&&v!==undefined).slice(0,9).map(([k,v])=><div key={k}><small>{titleCase(k)}</small><span>{typeof v==="object"?JSON.stringify(v):String(v)}</span></div>)}</div></article>)}</div>}</section></section>;
}
function Reports({summary,jobs,customers,vehicles,onExport}) {
  const statusCounts=STATUS_OPTIONS.map(s=>({status:s,count:jobs.filter(j=>j.status===s).length}));
  return <><section className="stats-grid report-stats">{[["Collected revenue",money(summary.revenue_collected)],["Outstanding",money(summary.outstanding_balance)],["Active jobs",summary.active_jobs??0],["Low-stock items",summary.low_stock_items??0]].map(([a,b])=><div className="stat-card" key={a}><small>{a}</small><strong>{b}</strong></div>)}</section><section className="content-grid"><section className="panel"><PanelTitle title="Job workflow distribution" sub="Current service jobs grouped by status."/><div className="bar-list">{statusCounts.map(x=><div className="bar-row" key={x.status}><div><span>{x.status}</span><strong>{x.count}</strong></div><div className="bar-track"><i style={{width:`${jobs.length?x.count/jobs.length*100:0}%`}}/></div></div>)}</div></section><section className="panel"><PanelTitle title="Export & operational totals" sub="Download the current job list for spreadsheet review."/><div className="report-totals"><div><span>Customer profiles</span><strong>{customers.length}</strong></div><div><span>Vehicle passports</span><strong>{vehicles.length}</strong></div><div><span>Total job cards</span><strong>{jobs.length}</strong></div><div><span>Delivered jobs</span><strong>{jobs.filter(j=>j.status==="Delivered").length}</strong></div></div><button className="button primary" onClick={onExport}>↓ Export jobs as CSV</button><p className="tiny muted">These are operational summaries from saved records; they are not audited financial statements.</p></section></section></>;
}
function QRTracking({jobs,customerName,vehicleName}) {
  const [selected,setSelected]=useState(jobs[0]?.job_id||"");
  useEffect(()=>{if(!jobs.some(j=>j.job_id===selected))setSelected(jobs[0]?.job_id||"");},[jobs,selected]);
  const job=jobs.find(j=>j.job_id===selected);
  const text=job?`Garage 21 job tracking\nJob: ${job.job_id}\nStatus: ${job.status}\nVehicle: ${vehicleName(job.vehicle_id)}\nCustomer: ${customerName(job.customer_id)}\nThis view contains workshop status only.`:"Create a job card first.";
  return <section className="content-grid"><section className="panel"><PanelTitle title="Job tracking card" sub="Prepare a customer-safe summary for a QR label or printed handover card."/><Field label="Select job card"><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select job</option>{jobs.map(j=><option key={j.job_id} value={j.job_id}>{j.job_id} — {j.status}</option>)}</select></Field>{job?<div className="tracking-card"><div className="tracking-icon"><Emblem size={56}/></div><span className="tag">Customer-safe summary</span><h2>{job.job_id}</h2><p>{vehicleName(job.vehicle_id)}</p><span className="status-badge">{job.status}</span><p className="muted">This printable card does not expose staff notes or private workshop information.</p><button className="button primary" onClick={()=>window.print()}>Print tracking card</button><button className="button secondary" onClick={()=>navigator.clipboard?.writeText(text)}>Copy tracking details</button></div>:<Empty text="No job cards are available yet."/>}</section><section className="panel"><PanelTitle title="QR implementation note" sub="Current version creates a safe tracking card and printable summary."/><p className="muted">A scannable QR code requires a public or local tracking page URL. This build intentionally does not expose the private staff dashboard as a customer link. For use on a single computer, print this status card; before customer-facing deployment, add a dedicated read-only tracking endpoint with a random token per job.</p><div className="notice-card"><strong>Privacy by design</strong><p>Do not put customer phone numbers, staff notes, estimates or internal photos in a public QR payload.</p></div></section></section>;
}
function UsersPage({users,summary,me,busy,onCreate,onUpdate}) {
  const blank={name:"",email:"",phone:"",role:"mechanic",password:""};
  const [form,setForm]=useState(blank);
  const [filter,setFilter]=useState("all");
  const shown=users.filter(u=>filter==="all"||u.role===filter);
  const blurbs={admin:"Full access, user management",customer:"Own vehicles, jobs and feedback",mechanic:"Job cards, inspections, quality, labour",employee:"Staff directory, attendance, leave"};
  return <>
    <section className="role-grid">{summary.map(r=><button key={r.role} className={`role-card role-${r.role} ${filter===r.role?"selected":""}`} onClick={()=>setFilter(filter===r.role?"all":r.role)}><span className="role-count">{r.count}</span><strong>{r.label}</strong><small>{blurbs[r.role]}</small><em>{r.collection}</em></button>)}</section>
    <section className="content-grid">
      <section className="panel"><PanelTitle title="Create account" sub="Add a staff member, customer or another admin."/>
        <form onSubmit={async e=>{e.preventDefault();const r=await onCreate(form);if(r)setForm(blank);}}>
          <Field label="Full name"><input required minLength={2} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Mani Kumar"/></Field>
          <Field label="Email address"><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@example.com"/></Field>
          <div className="form-row"><Field label="Role"><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="admin">Admin</option><option value="customer">Customer</option><option value="mechanic">Mechanic</option><option value="employee">Employee</option></select></Field><Field label="Phone number"><input minLength={10} maxLength={15} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="Optional"/></Field></div>
          <Field label="Temporary password (at least 8 characters)"><input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field>
          <button className="button primary" disabled={busy}>＋ Create account</button></form></section>
      <section className="panel"><PanelTitle title="Accounts" sub={`${shown.length} ${filter==="all"?"accounts":filter+" accounts"} · click a role card to filter`}/>
        <div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>{shown.map(u=><tr key={u.id}><td><strong>{u.name}</strong><small>{u.email}</small></td><td><select className="status-select" aria-label={`Role for ${u.name}`} disabled={busy||u.id===me?.id} value={u.role} onChange={e=>onUpdate(u.id,{role:e.target.value})}>{["admin","customer","mechanic","employee"].map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}</select></td><td><button className={`button secondary small ${u.active?"":"inactive"}`} disabled={busy||u.id===me?.id} onClick={()=>onUpdate(u.id,{active:!u.active})}>{u.active?"Active · deactivate":"Inactive · activate"}</button></td></tr>)}{shown.length===0&&<tr><td colSpan="3"><Empty text="No accounts for this role yet."/></td></tr>}</tbody></table></div></section>
    </section></>;
}
function exportCsv(filename,rows) {
  const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const quote=v=>`"${String(v??"").replaceAll('"','""')}"`;
  const csv=[cols.map(quote).join(","),...rows.map(r=>cols.map(c=>quote(r[c])).join(","))].join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
