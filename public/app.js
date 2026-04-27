const issueList = document.getElementById('issue-list');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const clearSearchButton = document.getElementById('clear-search');
const navCreateButton = document.getElementById('nav-create-btn');

const createModal = document.getElementById('create-modal');
const createIssueForm = document.getElementById('create-issue-form');
const createStatus = document.getElementById('create-status');
const createSubmitButton = document.getElementById('create-submit-btn');
const createIssueTypeSelect = document.getElementById('create-issue-type');
const createDifficultySelect = document.getElementById('create-difficulty');
const modalCloseElements = document.querySelectorAll('[data-close-modal="true"]');

const RECENT_ISSUE_LIMIT = 6;
let allIssues = [];
let closeModalTimer = null;

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
      href="/issue.html?id=${encodeURIComponent(issue.id)}"
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
  const metadataResponse = await fetch('/api/metadata');
  if (!metadataResponse.ok) {
    throw new Error('Unable to load issue metadata.');
  }

  const metadata = await metadataResponse.json();
  populateIssueFormMetadata(metadata);
}

async function loadIssues() {
  const issuesResponse = await fetch('/api/issues');
  if (!issuesResponse.ok) {
    throw new Error('Unable to load issues.');
  }

  allIssues = await issuesResponse.json();
  updateLanding();
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

for (const closeElement of modalCloseElements) {
  closeElement.addEventListener('click', () => {
    closeCreateModal();
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !createModal.hidden) {
    closeCreateModal();
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

(async function init() {
  try {
    await Promise.all([loadMetadata(), loadIssues()]);
  } catch {
    searchStatus.textContent = 'Unable to load issue data right now.';
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('create') === '1') {
    openCreateModal();
  }
})();
