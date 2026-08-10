# Security Policy

We take the security of the Liquidium Staking application seriously and appreciate responsible disclosure of vulnerabilities.

## Reporting a Vulnerability

- **Email**: Send a detailed report to `security@liquidium.org`.
- **GitHub Security Advisory**: Alternatively, open a private security advisory via the repository's **Security ➝ Advisories ➝ Report a vulnerability** workflow.

Please include:

- A description of the vulnerability and the potential impact.
- Steps to reproduce the issue (proof of concept, logs, screenshots).
- Any suggested fixes or mitigations.

We prefer encrypted communication; request PGP details in your initial email if required.

## Disclosure Policy

- We will acknowledge receipt within 3 business days.
- We aim to provide an initial assessment within 7 business days.
- We will work with you on a coordinated disclosure timeline and give credit if desired.
- Do not publicly disclose vulnerabilities or exploit them beyond what is necessary to demonstrate the issue until we release a fix.

## Scope

This policy covers the open-source code in this repository. Hosted production incidents for Liquidium infrastructure should also be reported through the channels above.

## Known Temporary Dependency Risk

As of 2026-08-10, we temporarily accept the low-severity [`elliptic@6.6.1` advisory (GHSA-848j-6mx2-7j84 / CVE-2025-14505)](https://github.com/advisories/GHSA-848j-6mx2-7j84). This acceptance is limited to the single installed `elliptic@6.6.1` version, which is reached through these dependency paths:

- `@omnisat/lasereyes-core` → `@oyl/sdk` → `@sadoprotocol/ordit-sdk` → `bip322-js@1.1.1`.
- `@oyl/sdk` → `bip322-js@2.0.0`, and the app directly → `bip322-js@3.0.0`.
- `@omnisat/lasereyes-core` → `crypto-browserify` → `browserify-sign` or `create-ecdh`.
- `secp256k1@3.8.1` (through `bitcoinjs-message`) and `secp256k1@5.0.1`, reached through the `bip322-js` and Ordit SDK paths above.

No patched `elliptic` version is available. This acceptance does not cover other versions or advisories and will be removed when the upstream dependency paths can be upgraded to a patched version.

## Safe Harbor

When you follow this policy in good faith, we will not initiate legal action against you or ask law enforcement to investigate. Avoid actions that may disrupt services or compromise user data (e.g., DDoS, social engineering, or accessing personal data).

Thank you for helping to keep the Liquidium ecosystem secure.
