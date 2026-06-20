// ============================================
//  AVAR1ON'S ARCHIVE — login.js
// ============================================

let mode = "login"; // 'login' of 'signup'

const form = document.getElementById("authForm");
const submitBtn = document.getElementById("submitBtn");
const messageEl = document.getElementById("loginMessage");
const tabs = document.querySelectorAll(".login-tab");

// --- Als er al een sessie is, meteen doorsturen naar de homepage ---

async function checkExistingSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) window.location.href = "index.html";
}
checkExistingSession();

// --- Tabs wisselen tussen inloggen / account maken ---

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    mode = tab.dataset.mode;
    submitBtn.textContent = mode === "login" ? "Inloggen" : "Account maken";
    messageEl.textContent = "";
    messageEl.className = "login-message";
  });
});

// --- Formulier versturen ---

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitBtn.disabled = true;
  messageEl.textContent = "";
  messageEl.className = "login-message";

  try {
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      messageEl.textContent =
        "Account aangemaakt! Check je e-mail om te bevestigen, log dan in.";
      messageEl.className = "login-message success";
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      window.location.href = "index.html";
    }
  } catch (err) {
    messageEl.textContent = vertaalFout(err.message);
    messageEl.className = "login-message error";
  } finally {
    submitBtn.disabled = false;
  }
});

// --- Veelvoorkomende Supabase foutmeldingen vertalen naar NL ---

function vertaalFout(msg) {
  if (msg.includes("Invalid login credentials"))
    return "E-mail of wachtwoord klopt niet.";
  if (msg.includes("User already registered"))
    return "Er bestaat al een account met dit e-mailadres.";
  if (msg.includes("Password should be at least"))
    return "Wachtwoord moet minstens 6 tekens zijn.";
  if (msg.includes("Email not confirmed"))
    return "Bevestig eerst je e-mailadres via de link die we stuurden.";
  return msg;
}
