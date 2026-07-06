/* =========================================================================
   auth.js
   Login page logic: sign-in, "remember me", forgot password, redirect
   already-authenticated users straight to the dashboard.
   ========================================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("loginEmail");
  const passInput = document.getElementById("loginPassword");
  const rememberInput = document.getElementById("rememberMe");
  const errorBox = document.getElementById("loginError");
  const toggleBtn = document.getElementById("togglePassword");
  const forgotLink = document.getElementById("forgotPasswordLink");
  const submitBtn = document.getElementById("loginSubmitBtn");

  // Pre-fill remembered email
  const rememberedEmail = localStorage.getItem("aptitude_remember_email");
  if (rememberedEmail) {
    emailInput.value = rememberedEmail;
    rememberInput.checked = true;
  }

  // If already logged in with a valid role, skip straight to dashboard
  auth.onAuthStateChanged((user) => {
    if (user && getRoleForEmail(user.email)) {
      window.location.href = "dashboard.html";
    }
  });

  toggleBtn.addEventListener("click", () => {
    const isPass = passInput.type === "password";
    passInput.type = isPass ? "text" : "password";
    toggleBtn.innerHTML = isPass
      ? '<i class="fa-solid fa-eye-slash"></i>'
      : '<i class="fa-solid fa-eye"></i>';
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.style.display = "none";

    const email = emailInput.value.trim();
    const password = passInput.value;

    const roleInfo = getRoleForEmail(email);
    if (!roleInfo) {
      errorBox.textContent = "This email is not registered with the Aptitude Payment Approval Portal.";
      errorBox.style.display = "block";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';

    try {
      const persistence = rememberInput.checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      await auth.setPersistence(persistence);

      if (rememberInput.checked) {
        localStorage.setItem("aptitude_remember_email", email);
      } else {
        localStorage.removeItem("aptitude_remember_email");
      }

      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      console.error(err);
      errorBox.textContent = friendlyAuthError(err);
      errorBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-2"></i>Login';
    }
  });

  forgotLink.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
      errorBox.textContent = "Enter your email address above first, then click Forgot Password.";
      errorBox.style.display = "block";
      return;
    }
    try {
      await auth.sendPasswordResetEmail(email);
      errorBox.style.display = "none";
      showResetSentMessage();
    } catch (err) {
      errorBox.textContent = friendlyAuthError(err);
      errorBox.style.display = "block";
    }
  });

  function showResetSentMessage() {
    const box = document.getElementById("loginError");
    box.className = "login-error";
    box.style.cssText = "display:block; background:rgba(31,162,166,0.18); border-color:rgba(31,162,166,0.45); color:#d4f5f6;";
    box.textContent = "Password reset link sent. Please check your inbox.";
  }

  function friendlyAuthError(err) {
    const map = {
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
      "auth/invalid-credential": "Incorrect email or password."
    };
    return map[err.code] || "Unable to sign in. Please check your credentials and try again.";
  }
});
