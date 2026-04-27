const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const https = require('https');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'issues.json');
const REPO_ROOT = __dirname;
const BASE_BRANCH = 'master';
const execFileAsync = promisify(execFile);

const ISSUE_TYPES = ['IT', 'Password', 'Software Engineering', 'Solution', 'Product', 'Other'];
const DIFFICULTY_LEVELS = ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2));
  }
}

async function readIssues() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function writeIssues(issues) {
  await fs.writeFile(DATA_FILE, JSON.stringify(issues, null, 2));
}

async function runCommand(command, args, cwd = REPO_ROOT) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd });
    return { stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' };
  } catch (error) {
    const message = error.stderr?.trim() || error.stdout?.trim() || error.message || 'Command failed.';
    throw new Error(`${command} ${args.join(' ')} failed: ${message}`);
  }
}

async function commandExists(command) {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    return false;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function parseGitHubRemote(remoteUrl) {
  if (!remoteUrl) return null;

  const sshMatch = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

async function createGitHubPrWithApi({ owner, repo, headBranch, title, body }) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const payload = JSON.stringify({
    title,
    body,
    base: BASE_BRANCH,
    head: headBranch
  });

  const requestOptions = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/pulls`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'askops-server',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const response = await new Promise((resolve, reject) => {
    const request = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 500, body: data });
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });

  const parsed = response.body ? JSON.parse(response.body) : {};
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const message = parsed.message || 'Unable to create GitHub PR via API.';
    throw new Error(message);
  }

  return parsed.html_url || null;
}

async function createIssuePr(issueInput) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'askops-pr-'));
  let worktreeAttached = false;

  try {
    const { stdout: branchCheck } = await runCommand('git', ['rev-parse', '--verify', BASE_BRANCH], REPO_ROOT);
    if (!branchCheck) {
      throw new Error(`Base branch "${BASE_BRANCH}" was not found locally.`);
    }

    await runCommand('git', ['worktree', 'add', '--detach', tempRoot, BASE_BRANCH], REPO_ROOT);
    worktreeAttached = true;

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const issueSlug = slugify(issueInput.title) || 'new-issue';
    const branchName = `issue/${timestamp}-${issueSlug}`;

    await runCommand('git', ['checkout', '-b', branchName], tempRoot);

    const tempDataFile = path.join(tempRoot, 'data', 'issues.json');
    const rawIssues = await fs.readFile(tempDataFile, 'utf-8');
    const issues = JSON.parse(rawIssues);
    const nextId = issues.length > 0 ? Math.max(...issues.map((item) => Number(item.id) || 0)) + 1 : 1;

    const newIssue = {
      id: nextId,
      title: issueInput.title.trim(),
      problem: issueInput.problem.trim(),
      solution: issueInput.solution.trim(),
      issueType: issueInput.issueType,
      difficulty: issueInput.difficulty,
      solutionConfidence: issueInput.solutionConfidence,
      createdAt: new Date().toISOString()
    };

    issues.push(newIssue);
    await fs.writeFile(tempDataFile, JSON.stringify(issues, null, 2));

    await runCommand('git', ['add', 'data/issues.json'], tempRoot);
    await runCommand('git', ['commit', '-m', `Add AskOps issue: ${newIssue.title}`], tempRoot);
    await runCommand('git', ['push', '-u', 'origin', branchName], tempRoot);

    const prTitle = `Add AskOps issue: ${newIssue.title}`;
    const prBody = [
      '## AskOps Issue Submission',
      '',
      `- Title: ${newIssue.title}`,
      `- Type: ${newIssue.issueType}`,
      `- Difficulty: ${newIssue.difficulty}`,
      `- Confidence: ${newIssue.solutionConfidence}%`,
      '',
      'Submitted from the AskOps Create Issue modal.'
    ].join('\n');

    let prUrl = null;

    if (await commandExists('gh')) {
      const { stdout } = await runCommand(
        'gh',
        ['pr', 'create', '--base', BASE_BRANCH, '--head', branchName, '--title', prTitle, '--body', prBody],
        tempRoot
      );
      prUrl = stdout.split('\n').find((line) => line.startsWith('http')) || null;
    } else {
      const { stdout: remoteUrl } = await runCommand('git', ['config', '--get', 'remote.origin.url'], REPO_ROOT);
      const repoInfo = parseGitHubRemote(remoteUrl);

      if (!repoInfo) {
        throw new Error('Unable to parse GitHub remote URL; install gh CLI or set a valid origin URL.');
      }

      prUrl = await createGitHubPrWithApi({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        headBranch: branchName,
        title: prTitle,
        body: prBody
      });

      if (!prUrl) {
        throw new Error('gh CLI is not installed and GITHUB_TOKEN is not set for GitHub API PR creation.');
      }
    }

    return { issue: newIssue, branchName, prUrl };
  } finally {
    if (worktreeAttached) {
      try {
        await runCommand('git', ['worktree', 'remove', '--force', tempRoot], REPO_ROOT);
      } catch {
        // no-op cleanup safeguard
      }
    }
  }
}

function validateIssue(payload) {
  const errors = [];

  if (!payload.title || typeof payload.title !== 'string' || payload.title.trim().length < 3) {
    errors.push('Title must be at least 3 characters.');
  }

  if (!payload.problem || typeof payload.problem !== 'string' || payload.problem.trim().length < 10) {
    errors.push('Problem description must be at least 10 characters.');
  }

  if (!payload.solution || typeof payload.solution !== 'string' || payload.solution.trim().length < 10) {
    errors.push('Solution must be at least 10 characters.');
  }

  if (!ISSUE_TYPES.includes(payload.issueType)) {
    errors.push(`Issue type must be one of: ${ISSUE_TYPES.join(', ')}.`);
  }

  if (!DIFFICULTY_LEVELS.includes(payload.difficulty)) {
    errors.push(`Difficulty must be one of: ${DIFFICULTY_LEVELS.join(', ')}.`);
  }

  const confidence = Number(payload.solutionConfidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    errors.push('Solution confidence must be a number between 0 and 100.');
  }

  return { errors, confidence };
}

app.get('/api/metadata', (_req, res) => {
  res.json({ issueTypes: ISSUE_TYPES, difficultyLevels: DIFFICULTY_LEVELS });
});

app.get('/api/issues', async (req, res) => {
  const issues = await readIssues();

  const issueType = req.query.issueType;
  const difficulty = req.query.difficulty;
  const minConfidence = req.query.minConfidence;

  let filtered = [...issues];

  if (issueType) {
    filtered = filtered.filter((item) => item.issueType === issueType);
  }

  if (difficulty) {
    filtered = filtered.filter((item) => item.difficulty === difficulty);
  }

  if (minConfidence !== undefined) {
    const min = Number(minConfidence);
    if (!Number.isNaN(min)) {
      filtered = filtered.filter((item) => Number(item.solutionConfidence) >= min);
    }
  }

  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(filtered);
});

app.get('/api/issues/:id', async (req, res) => {
  const issueId = Number(req.params.id);
  if (!Number.isInteger(issueId) || issueId <= 0) {
    return res.status(400).json({ error: 'Issue id must be a positive integer.' });
  }

  const issues = await readIssues();
  const issue = issues.find((item) => item.id === issueId);

  if (!issue) {
    return res.status(404).json({ error: 'Issue not found.' });
  }

  return res.json(issue);
});

app.post('/api/issues', async (req, res) => {
  const payload = req.body;
  const { errors, confidence } = validateIssue(payload);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const issues = await readIssues();
  const nextId = issues.length > 0 ? Math.max(...issues.map((i) => i.id)) + 1 : 1;

  const newIssue = {
    id: nextId,
    title: payload.title.trim(),
    problem: payload.problem.trim(),
    solution: payload.solution.trim(),
    issueType: payload.issueType,
    difficulty: payload.difficulty,
    solutionConfidence: confidence,
    createdAt: new Date().toISOString()
  };

  issues.push(newIssue);
  await writeIssues(issues);

  return res.status(201).json(newIssue);
});

app.post('/api/issues/propose-pr', async (req, res) => {
  const payload = req.body;
  const { errors, confidence } = validateIssue(payload);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const result = await createIssuePr({
      title: payload.title,
      problem: payload.problem,
      solution: payload.solution,
      issueType: payload.issueType,
      difficulty: payload.difficulty,
      solutionConfidence: confidence
    });

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Unable to create pull request for this issue.'
    });
  }
});

app.listen(PORT, async () => {
  await ensureDataFile();
  console.log(`AskOps running at http://localhost:${PORT}`);
});
