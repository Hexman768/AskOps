function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getIssueIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || params.get('issueId');
}

function setPageError(message) {
  document.getElementById('issue-title').textContent = 'Issue not available';
  document.getElementById('issue-problem').textContent = message;
  document.getElementById('issue-solution').textContent = 'Please return to search and choose another issue.';
  document.getElementById('issue-key').textContent = 'ASKOPS-?';
  document.getElementById('jira-badges').innerHTML = '';
  document.getElementById('issue-type').textContent = '-';
  document.getElementById('issue-difficulty').textContent = '-';
  document.getElementById('issue-confidence').textContent = '-';
  document.getElementById('issue-created-at').textContent = '-';
}

function renderIssue(issue) {
  document.title = `${issue.title} | AskOps`;
  document.getElementById('issue-key').textContent = `ASKOPS-${issue.id}`;
  document.getElementById('issue-title').textContent = issue.title;
  document.getElementById('issue-problem').textContent = issue.problem;
  document.getElementById('issue-solution').textContent = issue.solution;
  document.getElementById('issue-type').textContent = issue.issueType;
  document.getElementById('issue-difficulty').textContent = issue.difficulty;
  document.getElementById('issue-confidence').textContent = `${issue.solutionConfidence}%`;
  document.getElementById('issue-created-at').textContent = formatDate(issue.createdAt);

  const badges = `
    <span class="pill">Type: ${escapeHtml(issue.issueType)}</span>
    <span class="pill">Difficulty: ${escapeHtml(issue.difficulty)}</span>
    <span class="pill">Confidence: ${escapeHtml(issue.solutionConfidence)}%</span>
  `;
  document.getElementById('jira-badges').innerHTML = badges;
}

async function loadIssue() {
  const issueId = getIssueIdFromQuery();
  const issueIdAsNumber = Number(issueId);

  if (!Number.isInteger(issueIdAsNumber) || issueIdAsNumber <= 0) {
    setPageError('The issue link is invalid.');
    return;
  }

  try {
    const cachedIssue = sessionStorage.getItem(`askops_issue_${issueIdAsNumber}`);
    if (cachedIssue) {
      const parsedCachedIssue = JSON.parse(cachedIssue);
      if (parsedCachedIssue && Number(parsedCachedIssue.id) === issueIdAsNumber) {
        renderIssue(parsedCachedIssue);
      }
    }

    const response = await fetch(`/api/issues/${issueIdAsNumber}`);
    if (response.ok) {
      const issue = await response.json();
      renderIssue(issue);
      return;
    }

    const allIssuesResponse = await fetch('/api/issues');
    if (!allIssuesResponse.ok) {
      setPageError('This issue could not be found in the dataset.');
      return;
    }

    const allIssues = await allIssuesResponse.json();
    const matchedIssue = allIssues.find((item) => Number(item.id) === issueIdAsNumber);
    if (!matchedIssue) {
      setPageError('This issue could not be found in the dataset.');
      return;
    }

    renderIssue(matchedIssue);
  } catch {
    setPageError('The issue details could not be loaded right now.');
  }
}

loadIssue();
