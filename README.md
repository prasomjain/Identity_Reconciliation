# Bitespeed Identity Reconciliation Service

A production-quality Node.js + TypeScript backend for customer identity reconciliation. Given an incoming `email` and/or `phoneNumber`, the service links contacts across multiple purchases into a consolidated identity graph.

## 🔗 Live Endpoint

> **`https://identity-reconciliation-cj2q.onrender.com`**
>
> POST `/identify` → `https://identity-reconciliation-cj2q.onrender.com/identify`

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript
- **Framework**: Express
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Testing**: Jest + Supertest
- **Logging**: Pino
- **CI**: GitHub Actions
- **Deploy**: Render.com (Docker)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (local or remote)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/prasomjain/Identity_Reconciliation.git
cd Identity_Reconciliation

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# 4. Generate Prisma client
npx prisma generate

# 5. Run database migrations
npx prisma migrate dev

# 6. Start the development server
npm run dev
```

The server will start on `http://localhost:3000`.

> **Live production endpoint:** `https://identity-reconciliation-cj2q.onrender.com/identify`

## API Reference

### `POST /identify`

Identifies and links a customer contact based on email and/or phone number.

**Request Body:**

```json
{
  "email": "string | null",
  "phoneNumber": "string | null"
}
```

At least one of `email` or `phoneNumber` must be provided.

**Response (200 OK):**

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["123456", "789012"],
    "secondaryContactIds": [2, 3]
  }
}
```

> **Note:** The response property `primaryContatctId` matches the spelling in the assignment PDF for grading compatibility.

**Errors:**

| Status | Description |
|--------|-------------|
| 400    | Missing both email and phoneNumber, or invalid input |
| 500    | Internal server error |

## Example Requests

### Create a new contact

```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}'
```

Response:
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

### Link a new email to existing phone (creates secondary)

```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
```

Response:
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [2]
  }
}
```

### Merge two separate primaries

When an incoming request connects two previously unlinked contact chains, the newer primary is merged into the older one:

```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "george@hillvalley.edu", "phoneNumber": "717171"}'
```

*(See assignment PDF pages 8–9 for the full merge example.)*

## Business Logic

### Algorithm (executed in a single serializable transaction)

1. **Normalize** inputs (lowercase email, strip non-digits from phone)
2. **Find** all contacts matching the email OR phone number
3. **Resolve** each match to its primary (follow `linkedId` chain)
4. **No matches** → create a new primary contact
5. **Single primary** → create a secondary if incoming data contains new info
6. **Multiple primaries** → merge into the oldest (`createdAt`), re-link all secondaries
7. **Build** consolidated response with deduped arrays, primary's values first

### Transaction Strategy

All mutations use **serializable isolation** (`Prisma.$transaction` with `Serializable` isolation level) to prevent race conditions that could create duplicate primaries under concurrent requests.

### Contact Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | `SERIAL` | Auto-incrementing primary key |
| `phoneNumber` | `VARCHAR(50)` | Nullable |
| `email` | `VARCHAR(320)` | Nullable |
| `linkedId` | `INTEGER` | FK to `Contact.id` (null for primaries) |
| `linkPrecedence` | `VARCHAR(10)` | `"primary"` or `"secondary"` |
| `createdAt` | `TIMESTAMP` | Row creation time |
| `updatedAt` | `TIMESTAMP` | Auto-updated on modification |
| `deletedAt` | `TIMESTAMP` | Nullable, soft-delete |

**No unique constraints** on email or phone — multiple rows may share them (as shown in the PDF examples).

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests (normalizers)
npm run test:unit

# Run only integration tests (requires DATABASE_URL)
npm run test:integration
```

The integration tests follow the exact examples from the assignment PDF (pages 3–9):
- Create new primary (empty DB)
- Add secondary when phone matches (Lorraine/McFly example)
- Query with only phone or only email
- Merge two separate primaries (George/Biff example)
- Idempotent requests
- Multiple secondaries
- Concurrency safety
- Soft-delete handling

## Deployment

### Render.com (recommended)

1. Push to GitHub
2. Connect repo in Render Dashboard
3. Use the included `render.yaml` for Blueprint deploy (creates a free PostgreSQL + Docker web service)
4. Or manually: create a PostgreSQL database, then a Web Service using Docker

### Docker

```bash
docker build -t bitespeed-identity .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://..." bitespeed-identity
```

## Project Structure

```
├── src/
│   ├── app.ts                     # Express app factory
│   ├── server.ts                  # Entry point
│   ├── routes/identify.ts         # POST /identify handler
│   ├── services/contactService.ts # Business logic (transactional)
│   ├── db/prismaClient.ts         # Prisma client singleton
│   ├── utils/normalizers.ts       # Email/phone normalization
│   └── tests/
│       ├── normalizers.test.ts    # Unit tests
│       └── identify.test.ts      # Integration tests
├── prisma/
│   └── schema.prisma              # Database schema
├── .github/workflows/ci.yml       # CI pipeline
├── Dockerfile                     # Multi-stage Docker build
├── render.yaml                    # Render.com config
└── README.md
```

## References

- Business logic and examples are implemented per **pages 3–9** of the Bitespeed Backend Task assignment PDF.
- Live endpoint: `https://identity-reconciliation-cj2q.onrender.com/identify`

