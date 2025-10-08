# Contributing Guidelines

Thanks for your interest in contributing to the Liquidium Staking application! This document explains how to get started, the standards we follow, and how to propose changes.

## Development Environment

- **Node.js**: Use Node 20 (LTS) or newer. We recommend managing versions with [`fnm`](https://github.com/Schniz/fnm) or [`nvm`](https://github.com/nvm-sh/nvm).
- **Package manager**: The repository uses npm. Run `npm install` after cloning.
- **Environment variables**: Duplicate `.env.example` to `.env` (or `.env.local`) and provide your own credentials. Never commit real secrets to the repository.
- **Database & services**: Local development expects access to PostgreSQL, Redis, mempool.space, Ordiscan, Best In Slot, and the Liquidium Internet Computer canisters. The `.env.example` file documents the required configuration.

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Run quality checks before submitting changes:

```bash
npm run lint
npm test
```

## Workflow

1. **Fork the repository** and create a feature branch from `main`.
2. **Keep changes focused.** Separate unrelated fixes into different pull requests.
3. **Write tests** for new functionality or bug fixes whenever feasible.
4. **Document behavior changes** in the README or inline code comments.
5. **Open a pull request** describing the problem, your solution, and any follow-up work. Reference related issues if they exist.

## Coding Standards

- Follow the existing TypeScript, React 19, and Next.js 15 patterns used throughout the project.
- Use functional components and hooks; avoid class components.
- Rely on schema validation (Zod) for runtime input validation instead of ad hoc checks.
- Keep components small, extract shared logic into hooks, and avoid unnecessary global state.
- Prefer server actions and server-side data fetching over client-side requests.
- Run `npm run lint` and `npm test` before pushing.

## Commit & PR Guidelines

- Use descriptive commit messages (e.g., `fix: correct staking APR calculation`).
- Squash commits as appropriate before merging.
- Ensure CI checks pass. If your PR introduces new tooling requirements, update documentation accordingly.

## Communication

- Use GitHub Discussions or issues for feature proposals and questions.
- For urgent matters, mention `@Liquidium-Inc/staking-app-maintainers` (or the relevant team) in your pull request.

By contributing, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

We appreciate your help making the Liquidium Staking protocol better!
