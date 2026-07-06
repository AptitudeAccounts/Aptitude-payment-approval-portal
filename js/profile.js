/* =========================================================================
   profile.js
   User Profile page: shows current user's info and lets them change
   their password via Firebase Authentication.
   ========================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth();
  } catch (e) {
    return;
  }
  renderShell("profile.html", "My Profile", "Manage your account");

  document.getElementById("profileAvatar").textContent = initials(CURRENT_USER.name);
  document.getElementById("profileName").textContent = CURRENT_USER.name;
  document.getElementById("profileRole").textContent = CURRENT_USER.role;
  document.getElementById("profileEmail").textContent = CURRENT_USER.email;

  document.getElementById("logoutProfileBtn").addEventListener("click", async () => {
    showSpinner("Signing out...");
    await auth.signOut();
    window.location.href = "login.html";
  });

  document.getElementById("changePasswordBtn").addEventListener("click", async () => {
    const pass1 = document.getElementById("newPassword").value;
    const pass2 = document.getElementById("confirmPassword").value;
    const errorBox = document.getElementById("passwordError");
    errorBox.classList.add("d-none");

    if (pass1.length < 6) {
      errorBox.textContent = "Password must be at least 6 characters.";
      errorBox.classList.remove("d-none");
      return;
    }
    if (pass1 !== pass2) {
      errorBox.textContent = "Passwords do not match.";
      errorBox.classList.remove("d-none");
      return;
    }

    showSpinner("Updating password...");
    try {
      await auth.currentUser.updatePassword(pass1);
      hideSpinner();
      showToast("Success", "Password updated successfully.", "success");
      document.getElementById("newPassword").value = "";
      document.getElementById("confirmPassword").value = "";
    } catch (err) {
      hideSpinner();
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        errorBox.textContent = "Please log out and log back in, then try changing your password again.";
      } else {
        errorBox.textContent = "Could not update password: " + err.message;
      }
      errorBox.classList.remove("d-none");
    }
  });
});
