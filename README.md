# PayClearly Chrome Extension

Internal Chrome Extension (Manifest V3) for accelerating concierge AP portal payments.

## Quick Links

- **[Testing Guide](./TESTING_README.md)** - How to test the extension in your browser
- **[Remaining Work Plan](./REMAINING_WORK_PLAN.md)** - What's left to implement for production
- **[Quick Start](./QUICK_START.md)** - Get started quickly
- **[Testing Instructions](./TESTING_INSTRUCTIONS.md)** - Detailed testing workflow

## Overview

This extension helps payment operators execute queued payments faster by:
- Auto-filling known portal forms
- Learning new portal forms for future use
- Obfuscating sensitive inputs
- Capturing confirmation evidence automatically
- Guiding operators with step-by-step notifications

## Documentation

### Planning Documents
- **[ENGINEERING_PLAN.md](./ENGINEERING_PLAN.md)** - Complete engineering plan with architecture, task breakdown, risks, and test plan
- **[EXTENSION_BLUEPRINT.md](./EXTENSION_BLUEPRINT.md)** - Detailed implementation blueprint for extension components
- **[BACKEND_PLAN.md](./BACKEND_PLAN.md)** - Backend services build plan (Queue Passthrough, Portal Learning, Telemetry)
- **[PULUMI_PLAN.md](./PULUMI_PLAN.md)** - Infrastructure as Code plan with Pulumi

### Implementation Guides
- **[REFINEMENT_PASS_2.md](./REFINEMENT_PASS_2.md)** - Second pass refinement: assumptions resolved, API contracts, state machines, risks, PR breakdown
- **[PR_SEQUENCE.md](./PR_SEQUENCE.md)** - PR-ready task breakdown (PR0-PR10) with exact file lists and acceptance criteria
- **[SCAFFOLDING_GUIDE.md](./SCAFFOLDING_GUIDE.md)** - Step-by-step guide to set up and start development
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Summary of all deliverables and code structure

## Quick Start

See [SCAFFOLDING_GUIDE.md](./SCAFFOLDING_GUIDE.md) for detailed setup instructions.

```bash
# Install dependencies
npm install

# Build extension
npm run build:dev

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the `dist/` directory
```

## Development

```bash
# Watch mode (auto-rebuild)
npm run watch

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Tests
npm test
```

## Project Structure

```
src/
├── background/     # Service worker (auth, state machine, evidence, telemetry)
├── content/        # Content scripts (portal detection, autofill, learning)
├── popup/          # React popup UI
└── shared/         # Shared types, utilities, API client

infra/
├── queue-service/           # Queue Passthrough Service (Pulumi)
├── portal-learning-service/ # Portal Learning Service (Pulumi)
└── telemetry/              # BigQuery telemetry (Pulumi)
```

## Environment Variables

See [SCAFFOLDING_GUIDE.md](./SCAFFOLDING_GUIDE.md) for required environment variables.

## License

Internal use only - PayClearly

