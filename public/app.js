const issueList = document.getElementById('issue-list');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const clearSearchButton = document.getElementById('clear-search');
const navCreateButton = document.getElementById('nav-create-btn');
const navGitHubButton = document.getElementById('nav-github-btn');

const createModal = document.getElementById('create-modal');
const createIssueForm = document.getElementById('create-issue-form');
const createStatus = document.getElementById('create-status');
const createSubmitButton = document.getElementById('create-submit-btn');
const createIssueTypeSelect = document.getElementById('create-issue-type');
const createDifficultySelect = document.getElementById('create-difficulty');
const modalCloseElements = document.querySelectorAll('[data-close-modal="true"]');
const githubModal = document.getElementById('github-modal');
const githubConnectForm = document.getElementById('github-connect-form');
const githubConnectStatus = document.getElementById('github-connect-status');
const githubStatusCopy = document.getElementById('github-status-copy');
const githubModalCloseElements = document.querySelectorAll('[data-close-github-modal="true"]');

const RECENT_ISSUE_LIMIT = 6;
const STATIC_DATA_PATH = '../data/issues.json';
const FALLBACK_ISSUE_TYPES = ['IT', 'Password', 'Software Engineering', 'Solution', 'Product', 'Other'];
const FALLBACK_DIFFICULTIES = ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'];
let allIssues = [];
let closeModalTimer = null;
let closeGitHubModalTimer = null;
let isGitHubConnected = false;
let apiAvailable = true;

function updateCreateSubmitState() {
  createSubmitButton.disabled = !isGitHubConnected;
  createSubmitButton.setAttribute('aria-disabled', String(!isGitHubConnected));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function issueCard(issue) {
  const created = new Date(issue.createdAt).toLocaleString();
  return `
    <a
      class="issue-link-card"
      href="./issue.html?id=${encodeURIComponent(issue.id)}"
      data-issue-id="${encodeURIComponent(issue.id)}"
      aria-label="Open issue ${escapeHtml(issue.title)}"
    >
      <article class="issue-card">
        <h3>${escapeHtml(issue.title)}</h3>
        <div class="issue-meta">
          <span class="pill">Type: ${escapeHtml(issue.issueType)}</span>
          <span class="pill">Difficulty: ${escapeHtml(issue.difficulty)}</span>
          <span class="pill">Confidence: ${escapeHtml(issue.solutionConfidence)}%</span>
          <span class="pill">Logged: ${escapeHtml(created)}</span>
        </div>
        <p><strong>Problem:</strong> ${escapeHtml(issue.problem)}</p>
        <p><strong>Solution:</strong> ${escapeHtml(issue.solution)}</p>
      </article>
    </a>
  `;
}

function renderIssues(issues) {
  if (issues.length === 0) {
    issueList.innerHTML = '<p>No issues found for this search.</p>';
    return;
  }

  issueList.innerHTML = issues.map(issueCard).join('');
}

function updateLanding(query = '') {
  const trimmedQuery = query.trim().toLowerCase();
  const hasQuery = trimmedQuery.length > 0;

  if (!hasQuery) {
    renderIssues(allIssues.slice(0, RECENT_ISSUE_LIMIT));
    searchStatus.textContent = `Showing ${Math.min(allIssues.length, RECENT_ISSUE_LIMIT)} most recent issues.`;
    clearSearchButton.hidden = true;
    return;
  }

  const results = allIssues.filter((issue) => {
    const haystack = `${issue.title} ${issue.problem} ${issue.solution} ${issue.issueType} ${issue.difficulty}`.toLowerCase();
    return haystack.includes(trimmedQuery);
  });

  renderIssues(results);
  searchStatus.textContent = `Found ${results.length} issue${results.length === 1 ? '' : 's'} for "${query.trim()}".`;
  clearSearchButton.hidden = false;
}

function openCreateModal() {
  if (closeModalTimer) {
    clearTimeout(closeModalTimer);
    closeModalTimer = null;
  }

  createModal.hidden = false;
  createModal.setAttribute('aria-hidden', 'false');
  createModal.classList.remove('is-closing');
  requestAnimationFrame(() => {
    createModal.classList.add('is-open');
  });
  document.body.classList.add('modal-open');
  updateCreateSubmitState();

  if (!isGitHubConnected) {
    createStatus.textContent = 'Connect GitHub to enable submit.';
  }
}

function closeCreateModal() {
  createModal.classList.remove('is-open');
  createModal.classList.add('is-closing');
  document.body.classList.remove('modal-open');

  closeModalTimer = setTimeout(() => {
    createModal.hidden = true;
    createModal.setAttribute('aria-hidden', 'true');
    createModal.classList.remove('is-closing');
    closeModalTimer = null;
  }, 260);
}

function openGitHubModal() {
  if (closeGitHubModalTimer) {
    clearTimeout(closeGitHubModalTimer);
    closeGitHubModalTimer = null;
  }

  githubModal.hidden = false;
  githubModal.setAttribute('aria-hidden', 'false');
  githubModal.classList.remove('is-closing');
  requestAnimationFrame(() => {
    githubModal.classList.add('is-open');
  });
  document.body.classList.add('modal-open');
}

function closeGitHubModal() {
  githubModal.classList.remove('is-open');
  githubModal.classList.add('is-closing');
  document.body.classList.remove('modal-open');

  closeGitHubModalTimer = setTimeout(() => {
    githubModal.hidden = true;
    githubModal.setAttribute('aria-hidden', 'true');
    githubModal.classList.remove('is-closing');
    closeGitHubModalTimer = null;
  }, 260);
}

function populateIssueFormMetadata(metadata) {
  createIssueTypeSelect.innerHTML = '';
  createDifficultySelect.innerHTML = '';

  for (const issueType of metadata.issueTypes) {
    createIssueTypeSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(issueType)}">${escapeHtml(issueType)}</option>`);
  }

  for (const difficulty of metadata.difficultyLevels) {
    createDifficultySelect.insertAdjacentHTML(
      'beforeend',
      `<option value="${escapeHtml(difficulty)}">${escapeHtml(difficulty)}</option>`
    );
  }
}

async function loadMetadata() {
  try {
    const metadataResponse = await fetch('/api/metadata');
    if (!metadataResponse.ok) {
      throw new Error('Metadata API unavailable.');
    }

    const metadata = await metadataResponse.json();
    populateIssueFormMetadata(metadata);
    apiAvailable = true;
    return;
  } catch {
    apiAvailable = false;
    populateIssueFormMetadata({
      issueTypes: FALLBACK_ISSUE_TYPES,
      difficultyLevels: FALLBACK_DIFFICULTIES
    });
  }
}

async function loadIssues() {
  try {
    const issuesResponse = await fetch('/api/issues');
    if (!issuesResponse.ok) {
      throw new Error('Issues API unavailable.');
    }

    allIssues = await issuesResponse.json();
    apiAvailable = true;
    updateLanding();
    return;
  } catch {
    const staticResponse = await fetch(STATIC_DATA_PATH);
    if (!staticResponse.ok) {
      throw new Error('Unable to load issues.');
    }

    allIssues = await staticResponse.json();
    apiAvailable = false;
    updateLanding();
  }
}

async function refreshGitHubStatus() {
  if (!apiAvailable) {
    isGitHubConnected = false;
    updateCreateSubmitState();
    navGitHubButton.textContent = 'GitHub (Server Only)';
    navGitHubButton.disabled = true;
    githubStatusCopy.textContent =
      'GitHub Pages mode detected. PR creation requires running the Node server backend.';
    return;
  }

  navGitHubButton.disabled = false;

  try {
    const response = await fetch('/api/github/auth-status');
    const status = await response.json();
    isGitHubConnected = Boolean(status.connected);

    if (isGitHubConnected) {
      navGitHubButton.textContent = 'GitHub Connected';
      const source = status.source ? ` (${status.source})` : '';
      const login = status.login ? ` as ${status.login}` : '';
      githubStatusCopy.textContent = `GitHub is connected${login}${source}. You can update your token below.`;
    } else {
      navGitHubButton.textContent = 'Connect GitHub';
      githubStatusCopy.textContent =
        'Save a personal GitHub token securely in your OS keychain so PRs can be created without gh CLI.';
    }

    updateCreateSubmitState();
  } catch {
    isGitHubConnected = false;
    updateCreateSubmitState();
    navGitHubButton.textContent = 'Connect GitHub';
    githubStatusCopy.textContent = 'Unable to check GitHub connection status right now.';
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  updateLanding(searchInput.value);
});

clearSearchButton.addEventListener('click', () => {
  searchInput.value = '';
  updateLanding();
});

navCreateButton.addEventListener('click', () => {
  createStatus.textContent = '';
  openCreateModal();
});

navGitHubButton.addEventListener('click', () => {
  githubConnectStatus.textContent = '';
  openGitHubModal();
});

for (const closeElement of modalCloseElements) {
  closeElement.addEventListener('click', () => {
    closeCreateModal();
  });
}

for (const closeElement of githubModalCloseElements) {
  closeElement.addEventListener('click', () => {
    closeGitHubModal();
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  if (!createModal.hidden) {
    closeCreateModal();
  }

  if (!githubModal.hidden) {
    closeGitHubModal();
  }
});

issueList.addEventListener('click', (event) => {
  const link = event.target.closest('.issue-link-card');
  if (!link) return;

  const issueId = Number(link.dataset.issueId);
  if (!Number.isInteger(issueId)) return;

  const issue = allIssues.find((item) => item.id === issueId);
  if (!issue) return;

  sessionStorage.setItem(`askops_issue_${issueId}`, JSON.stringify(issue));
});

createIssueForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  createSubmitButton.disabled = true;
  createStatus.textContent = 'Creating pull request...';

  try {
    if (!isGitHubConnected) {
      createStatus.textContent = 'Connect GitHub first to securely store your token.';
      openGitHubModal();
      return;
    }

    const payload = Object.fromEntries(new FormData(createIssueForm).entries());
    const response = await fetch('/api/issues/propose-pr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseBody = await response.json();
    if (!response.ok) {
      if (responseBody.errors?.length > 0) {
        createStatus.textContent = responseBody.errors.join(' ');
      } else {
        createStatus.textContent = responseBody.error || 'Unable to create pull request.';
      }
      return;
    }

    const safeBranch = escapeHtml(responseBody.branchName || '');
    const safeIssueId = escapeHtml(responseBody.issue?.id || '');
    const safePrUrl = responseBody.prUrl;

    if (safePrUrl) {
      createStatus.innerHTML = `Pull request created for ASKOPS-${safeIssueId} on branch ${safeBranch}: <a href="${safePrUrl}" target="_blank" rel="noopener noreferrer">View PR</a>`;
    } else {
      createStatus.textContent = `Issue proposal created on branch ${safeBranch}.`;
    }

    createIssueForm.reset();
    await loadIssues();
  } catch {
    createStatus.textContent = 'Unable to create pull request right now. Please try again.';
  } finally {
    createSubmitButton.disabled = false;
  }
});

githubConnectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  githubConnectStatus.textContent = 'Saving token securely...';

  const payload = Object.fromEntries(new FormData(githubConnectForm).entries());

  try {
    const response = await fetch('/api/github/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      githubConnectStatus.textContent = result.error || 'Unable to connect GitHub.';
      return;
    }

    githubConnectStatus.textContent = `Connected${result.login ? ` as ${result.login}` : ''}.`;
    githubConnectForm.reset();
    await refreshGitHubStatus();
  } catch {
    githubConnectStatus.textContent = 'Unable to connect GitHub right now.';
  }
});

(async function init() {
  try {
    await Promise.all([loadMetadata(), loadIssues()]);
    await refreshGitHubStatus();
  } catch {
    searchStatus.textContent = 'Unable to load issue data right now.';
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('create') === '1') {
    openCreateModal();
  }
})();
