const issueList = document.getElementById('issue-list');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchStatus = document.getElementById('search-status');
const clearSearchButton = document.getElementById('clear-search');

const RECENT_ISSUE_LIMIT = 6;
let allIssues = [];

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

async function loadIssues() {
  const res = await fetch('/api/issues');
  allIssues = await res.json();
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

issueList.addEventListener('click', (event) => {
  const link = event.target.closest('.issue-link-card');
  if (!link) return;

  const issueId = Number(link.dataset.issueId);
  if (!Number.isInteger(issueId)) return;

  const issue = allIssues.find((item) => item.id === issueId);
  if (!issue) return;

  sessionStorage.setItem(`askops_issue_${issueId}`, JSON.stringify(issue));
});

(async function init() {
  await loadIssues();
})();
