# Public Repo Scope

This repository is prepared to be shared publicly for architecture, demo workflows, and community collaboration.

## Safe for public
- App and smart-contract source code
- Demo portal and synthetic/sample data
- Setup scripts and developer docs
- Tests and CI/lint scripts

## Keep private (extension layer)
- Proprietary scoring/risk logic and care pathways
- Customer-specific integrations and deployment configs
- Real patient/customer data, logs, and secrets
- Production infrastructure and runbooks
- Optional private module code under `Telemedicine-Remote-Monitoring-System/extensions/hooks/hooks.local.js`

## Publishing notes
- Keep generated secrets and local runtime data out of git (`.gitignore` enforces this).
- Use environment variables or untracked local files for any keys.
- Do not commit real credentials, private keys, or production endpoints.
