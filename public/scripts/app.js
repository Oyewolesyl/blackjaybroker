const state = {
  token: localStorage.getItem("ibkr_study_token") || "",
  mode: "signup",
  wallet: null
};

const authModal = document.querySelector("#authModal");
const riskModal = document.querySelector("#riskModal");
const appPanel = document.querySelector("#appPanel");
const authTitle = document.querySelector("#authTitle");
const authName = document.querySelector("#authName");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authSubmit = document.querySelector("#authSubmit");
const authToggle = document.querySelector("#authToggle");

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setAuthMode(mode) {
  state.mode = mode;
  const isSignup = mode === "signup";
  authTitle.textContent = isSignup ? "Open Account" : "Log In";
  authName.parentElement.style.display = isSignup ? "grid" : "none";
  authSubmit.textContent = isSignup ? "Create Account" : "Log In";
  authToggle.textContent = isSignup ? "Already have an account? Log in" : "Need an account? Open one";
}

function showAuth(mode) {
  setAuthMode(mode);
  authModal.showModal();
}

function renderSignedOut() {
  appPanel.innerHTML = `
    <div class="signed-out-panel">
      <h3>Create a study account</h3>
      <p>Use any email and password. This is a local learning backend, not a real brokerage account.</p>
      <button class="primary-button" data-auth-open="signup" type="button">Open Account</button>
    </div>
  `;
  bindAuthButtons();
}

function transactionLabel(tx) {
  const detail = tx.to ? ` to ${tx.to}` : tx.from ? ` from ${tx.from}` : "";
  return `${tx.type}${detail}`;
}

function renderDashboard() {
  const transactions = state.wallet.transactions
    .slice()
    .reverse()
    .map((tx) => `
      <li>
        <span>${transactionLabel(tx)}<br><small>${new Date(tx.createdAt).toLocaleString()}</small></span>
        <strong>${money(tx.amount)}</strong>
      </li>
    `)
    .join("");

  appPanel.innerHTML = `
    <div class="account-grid">
      <section class="account-card">
        <p class="section-kicker">Cash wallet</p>
        <span class="balance">${money(state.wallet.balance)}</span>
        <p>Welcome, ${state.wallet.user.name}. Account ${state.wallet.accountNumber}</p>
        <button class="ghost-button" id="logoutButton" type="button">Log Out</button>
      </section>
      <section class="account-card">
        <h3>Move funds</h3>
        <form class="wallet-form" id="walletForm">
          <select id="walletAction">
            <option value="deposit">Deposit</option>
            <option value="withdraw">Withdraw</option>
            <option value="transfer">Transfer</option>
          </select>
          <input id="walletAmount" type="number" min="1" step="0.01" placeholder="Amount" required />
          <input id="walletRecipient" type="email" placeholder="Recipient email for transfer" />
          <button class="primary-button" type="submit">Submit</button>
          <p id="walletMessage" class="status-note" role="status"></p>
        </form>
      </section>
      <section class="transaction-list">
        <h3>Transactions</h3>
        <ul>${transactions || "<li><span>No transactions yet.</span><strong>$0.00</strong></li>"}</ul>
      </section>
    </div>
  `;

  document.querySelector("#logoutButton").addEventListener("click", () => {
    state.token = "";
    localStorage.removeItem("ibkr_study_token");
    state.wallet = null;
    renderSignedOut();
  });

  document.querySelector("#walletForm").addEventListener("submit", submitWalletAction);
}

async function loadWallet() {
  if (!state.token) {
    renderSignedOut();
    return;
  }

  try {
    state.wallet = await api("/api/wallet");
    renderDashboard();
  } catch (error) {
    state.token = "";
    localStorage.removeItem("ibkr_study_token");
    renderSignedOut();
  }
}

async function submitWalletAction(event) {
  event.preventDefault();
  const message = document.querySelector("#walletMessage");
  const action = document.querySelector("#walletAction").value;
  const amount = Number(document.querySelector("#walletAmount").value);
  const recipientEmail = document.querySelector("#walletRecipient").value.trim();

  message.className = "status-note";
  message.textContent = "Processing...";

  try {
    const payload = action === "transfer" ? { amount, recipientEmail } : { amount };
    await api(`/api/wallet/${action}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadWallet();
  } catch (error) {
    message.className = "error-note";
    message.textContent = error.message;
  }
}

async function submitAuth() {
  const endpoint = state.mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
  const payload = {
    name: authName.value.trim(),
    email: authEmail.value.trim(),
    password: authPassword.value
  };

  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.token = data.token;
    localStorage.setItem("ibkr_study_token", data.token);
    authModal.close();
    authPassword.value = "";
    await loadWallet();
    document.querySelector("#dashboard").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    alert(error.message);
  }
}

function bindAuthButtons() {
  document.querySelectorAll("[data-auth-open]").forEach((button) => {
    button.addEventListener("click", () => showAuth(button.dataset.authOpen));
  });
}

document.querySelector("#menuButton").addEventListener("click", () => {
  document.querySelector(".main-nav").classList.toggle("open");
});

document.querySelector("#riskButton").addEventListener("click", () => {
  riskModal.showModal();
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(button.dataset.scroll).scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelector("#searchButton").addEventListener("click", () => {
  const query = prompt("Search this study page");
  if (!query) return;
  const match = [...document.querySelectorAll("h2, h3, p, li")].find((node) =>
    node.textContent.toLowerCase().includes(query.toLowerCase())
  );
  if (match) {
    match.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

authToggle.addEventListener("click", () => {
  setAuthMode(state.mode === "signup" ? "login" : "signup");
});

authSubmit.addEventListener("click", submitAuth);

bindAuthButtons();
loadWallet();
