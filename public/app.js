const form = document.getElementById('issue-form');
const formMessage = document.getElementById('form-message');
const issueList = document.getElementById('issue-list');
const issueTypeSelect = document.getElementById('issueType');
const difficultySelect = document.getElementById('difficulty');
const filterType = document.getElementById('filterType');
const filterDifficulty = document.getElementById('filterDifficulty');
const filterConfidence = document.getElementById('filterConfidence');
const refreshBtn = document.getElementById('refresh-btn');

async function loadMetadata() {
  const res = await fetch('/api/metadata');
  const metadata = await res.json();

  for (const type of metadata.issueTypes) {
    issueTypeSelect.insertAdjacentHTML('beforeend', `<option value="${type}">${type}</option>`);
    filterType.insertAdjacentHTML('beforeend', `<option value="${type}">${type}</option>`);
  }

  for (const level of metadata.difficultyLevels) {
    difficultySelect.insertAdjacentHTML('beforeend', `<option value="${level}">${level}</option>`);
    filterDifficulty.insertAdjacentHTML('beforeend', `<option value="${level}">${level}</option>`);
  }
}

function issueCard(issue) {
  const created = new Date(issue.createdAt).toLocaleString();
  return `
    <article class="issue-card">
      <h3>${issue.title}</h3>
      <div class="issue-meta">
        <span class="pill">Type: ${issue.issueType}</span>
        <span class="pill">Difficulty: ${issue.difficulty}</span>
        <span class="pill">Confidence: ${issue.solutionConfidence}%</span>
        <span class="pill">Logged: ${created}</span>
      </div>
      <p><strong>Problem:</strong> ${issue.problem}</p>
      <p><strong>Solution:</strong> ${issue.solution}</p>
    </article>
  `;
}

async function loadIssues() {
  const params = new URLSearchParams();
  if (filterType.value) params.set('issueType', filterType.value);
  if (filterDifficulty.value) params.set('difficulty', filterDifficulty.value);
  if (filterConfidence.value !== '') params.set('minConfidence', filterConfidence.value);

  const res = await fetch(`/api/issues?${params.toString()}`);
  const issues = await res.json();

  if (issues.length === 0) {
    issueList.innerHTML = '<p>No issues found for current filters.</p>';
    return;
  }

  issueList.innerHTML = issues.map(issueCard).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';

  const payload = Object.fromEntries(new FormData(form).entries());

  const res = await fetch('/api/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await res.json();
    formMessage.textContent = data.errors?.join(' ') || 'Unable to save issue.';
    return;
  }

  form.reset();
  formMessage.textContent = 'Issue saved.';
  await loadIssues();
});

refreshBtn.addEventListener('click', loadIssues);

(async function init() {
  await loadMetadata();
  await loadIssues();
})();
