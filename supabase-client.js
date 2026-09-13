// Sawaal Better — Supabase sync layer.
// Fill these in from your Supabase project (Project Settings > API).
// The anon key is safe to expose in client-side code — that's what it's for.
const SUPABASE_URL = "https://rejnfcvzrvzadecodttq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlam5mY3Z6cnZ6YWRlY29kdHRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDYwMzQsImV4cCI6MjEwNDg4MjAzNH0.gD7USYWZqkHXOREfK2pccB3bRS6ZroA64XBtE4kRzXk";

const sb = (window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const Sync = (function () {
  let studentId = null, sessionId = null, code = null;
  let queue = {}, flushTimer = null;

  function enabled() { return !!(sb && sessionId); }

  // Called from the login screen. Returns {ok, resumed, current_screen, code, error}
  async function loginOrResume(name, school, klass, pin) {
    if (!sb) return { ok: false, error: "Supabase not configured" };
    const { data, error } = await sb.rpc("login_or_resume", {
      p_name: name, p_school: school, p_class: klass, p_pin: pin
    });
    if (error) return { ok: false, error: error.message.includes("wrong_pin") ? "Wrong PIN for that name/school/class." : error.message };
    const row = data[0];
    studentId = row.student_id; sessionId = row.session_id; code = row.code;
    localStorage.setItem("sb_session", JSON.stringify({ studentId, sessionId, code }));
    return { ok: true, resumed: row.resumed, current_screen: row.current_screen, code };
  }

  // Restore a session already on this device without asking for the PIN again.
  function restoreLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem("sb_session") || "null");
      if (saved) { studentId = saved.studentId; sessionId = saved.sessionId; code = saved.code; }
      return saved;
    } catch (e) { return null; }
  }

  // Queue an answer for sync. Debounced so rapid typing doesn't spam the network.
  function queueAnswer(item) {
    if (!enabled()) return;
    queue[item.id] = item;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 1200);
  }

  async function flush() {
    if (!enabled()) return;
    const items = Object.values(queue);
    queue = {};
    if (!items.length) return;
    const rows = items.map(it => ({
      session_id: sessionId, item_id: it.id, module: it.mod || "",
      question: it.q || "", answer: JSON.stringify(it.a), correct: String(it.correct ?? ""),
      answered_at: it.t || new Date().toISOString()
    }));
    const { error } = await sb.from("answers").upsert(rows, { onConflict: "session_id,item_id" });
    if (error) { // retry later — keep it simple, put items back on the queue
      items.forEach(it => queue[it.id] = it);
      console.warn("Sync failed, will retry:", error.message);
    } else {
      window.dispatchEvent(new CustomEvent("sb-saved"));
    }
  }

  async function updateProgress(screenIndex) {
    if (!enabled()) return;
    const { error } = await sb.from("sessions").update({ current_screen: screenIndex }).eq("id", sessionId);
    if (!error) window.dispatchEvent(new CustomEvent("sb-saved"));
  }

  async function markComplete() {
    if (!enabled()) return;
    await flush();
    await sb.from("sessions").update({ completed_at: new Date().toISOString() }).eq("id", sessionId);
  }

  window.addEventListener("beforeunload", flush);

  return { loginOrResume, restoreLocal, queueAnswer, updateProgress, markComplete, enabled, getCode: () => code };
})();
