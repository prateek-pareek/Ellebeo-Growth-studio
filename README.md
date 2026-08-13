# Elle.Be.O Growth Studio — AI Orchestration Layer

This repository contains the full source code for the Elle.Be.O Growth Studio platform, a multi-tenant SaaS for beauty and wellness professionals.

## Project Structure

- **`/frontend`**: A modern React application built with TanStack Router, Vite, and Tailwind CSS. It handles client management, appointment intake, and AI content generation reviews.
- **`/backend`**: A production-grade NestJS API that orchestrates the AI pipeline, manages multitenancy, and integrates with Firebase, Cloudinary, and BullMQ.

## Key Features

- **AI Orchestration**: Multi-model LLM routing (GPT-4o, Claude 3.5 Sonnet) for high-quality content generation.
- **Brand DNA**: Automated brand voice profiling and pillar matching.
- **Consent-Aware Processing**: Automatic face blurring and privacy-first image handling.
- **Multitenancy**: Secure tenant isolation with Firebase and custom middleware.

## Getting Started

### Prerequisites

- Node.js (v18+)
- Docker (for Redis/BullMQ)
- Firebase Account

### Local Development

From the repo root (runs both apps with auto-reload on code changes):

```bash
# Install root + app dependencies once
npm install
npm install --prefix backend
npm install --prefix frontend
# Configure backend/.env and frontend/.env

npm run dev
```

Or run apps individually:

```bash
npm run dev:backend
npm run dev:frontend
```

## License

Copyright © 2026 Elle.Be.O. All rights reserved
