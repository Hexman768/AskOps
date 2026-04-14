const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'issues.json');

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

app.listen(PORT, async () => {
  await ensureDataFile();
  console.log(`AskOps running at http://localhost:${PORT}`);
});
