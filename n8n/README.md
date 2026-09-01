# TaskFlow n8n Workflows

## Import Workflow

1. Open n8n (local or cloud instance)
2. Go to **Workflows** → **Import from File**
3. Select `workflows/taskflow-order-webhook.json`
4. Activate the workflow after import

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TASKFLOW_API_URL` | TaskFlow backend URL | `http://localhost:4000` |
| `TASKFLOW_API_TOKEN` | Bearer token for TaskFlow API | `eyJhbGci...` |
| `OLLAMA_API_URL` | Ollama LLM service URL | `http://localhost:11434` |
| `SMTP_FROM` | Sender email address | `noreply@taskflow.dev` |
| `MANAGER_EMAIL` | Recipient for order notifications | `manager@company.com` |

## Workflow Overview

```
Webhook Trigger → Validate Data → Get Order Details → High Value?
                                                          │
                              ┌───────────────────────────┤
                              │                           │
                    Process High-Value           Auto-Fulfill Standard
                              │                           │
                              └───────────┬───────────────┘
                                          │
                                    Log to Database
                                          │
                                  Summarize with Ollama
                                          │
                                    Send Email
                                          │
                                  Respond to Webhook
```

## How It Connects to TaskFlow

1. TaskFlow dispatches order events via signed webhook to n8n
2. n8n validates the payload (`orderId`, `event` required)
3. Fetches full order details from `GET /api/sc/orders/:id`
4. Branches on order value (> 10,000 VND = high-value)
5. High-value orders → `POST /api/sc/agentic/process-order` (human-in-the-loop)
6. Standard orders → auto-transition to `IN_FULFILLMENT`
7. Logs to PostgreSQL for audit trail
8. Summarizes order with Ollama LLM
9. Sends email notification to manager
10. Returns JSON response to TaskFlow

## Screenshot

![TaskFlow Order Automation Workflow](workflow-screenshot.png)

## Setup

Run the Ollama setup script to install required LLM models:

```bash
./scripts/setup-ollama.sh
```

This installs and configures:
- `qwen2.5:7b` — primary model for order summarization
- `llama3.2:latest` — fallback model
