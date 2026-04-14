# AskOps

AskOps is a small web app for storing previously resolved IT issues and their solutions in a git-tracked datastore, so anyone who clones the repo sees the same known fixes.

## Features

- Create and store resolved issues with:
  - Issue title
  - Problem description
  - Solution steps
  - Issue type (`IT`, `Password`, `Software Engineering`, `Solution`, `Product`, `Other`)
  - Difficulty level (`Very Easy`, `Easy`, `Medium`, `Hard`, `Very Hard`)
  - Solution confidence (0-100%)
- Filter issues by type, difficulty, and minimum confidence.
- Data persistence in `data/issues.json` (committed to git).

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Storage model

All issue records are stored in:

- `data/issues.json`

Because this file is in the repository, the saved issue data is shared through git and visible to anyone cloning the project.
