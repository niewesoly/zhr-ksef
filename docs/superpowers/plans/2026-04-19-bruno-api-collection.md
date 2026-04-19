# Bruno API Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Bruno API collection (OpenCollection YAML format) covering every endpoint in the zhr-ksef service, with environments, tests, and scripted auth — so developers can exercise the API from Bruno with zero manual setup.

**Architecture:** The collection lives in `bruno/` at the repo root, organized into folders mirroring the API's resource groups (Health, Tenants, Invoices, Sync, Preview). Each request file is self-contained YAML. A collection-level pre-request script injects the `X-API-Key` header on every authenticated request, keeping individual files DRY. Environments separate Local dev from a future Production target.

**Tech Stack:** Bruno v3.1+ (OpenCollection YAML format), Chai.js assertions (built into Bruno), JavaScript pre/post-request scripts.

---

## File Structure

```
bruno/
├── opencollection.yml                          # Collection root
├── collection.yml                              # Collection-level auth script
├── environments/
│   ├── Local.yml                               # localhost:3000, test creds
│   └── Production.yml                          # placeholder prod env
├── Health/
│   ├── folder.yml
│   ├── Liveness.yml                            # GET /health
│   └── Readiness.yml                           # GET /health/detailed
├── Tenants/
│   ├── folder.yml
│   ├── Create Tenant.yml                       # POST /api/v1/tenants
│   ├── Get Tenant.yml                          # GET /api/v1/tenants/:id
│   ├── Update Tenant.yml                       # PATCH /api/v1/tenants/:id
│   ├── Delete Tenant.yml                       # DELETE /api/v1/tenants/:id
│   ├── Rotate Key.yml                          # POST /api/v1/tenants/:id/rotate-key
│   └── Clear Credentials.yml                   # DELETE /api/v1/tenants/:id/credentials
├── Invoices/
│   ├── folder.yml
│   ├── List Invoices.yml                       # GET  .../invoices
│   ├── Get Invoice.yml                         # GET  .../invoices/:iid
│   ├── Transition Invoice.yml                  # POST .../invoices/:iid/transition
│   ├── Get Invoice Events.yml                  # GET  .../invoices/:iid/events
│   ├── Get Invoice XML.yml                     # GET  .../invoices/:iid/xml
│   ├── Get Invoice HTML.yml                    # GET  .../invoices/:iid/html
│   └── Get Invoice PDF.yml                     # GET  .../invoices/:iid/pdf
├── Sync/
│   ├── folder.yml
│   ├── Trigger Incremental Sync.yml            # POST .../sync
│   ├── Trigger Range Sync.yml                  # POST .../sync/range
│   ├── List Sync Runs.yml                      # GET  .../sync/runs
│   └── Get Sync Run.yml                        # GET  .../sync/runs/:rid
└── Preview/
    ├── folder.yml
    ├── Preview HTML.yml                        # POST /api/v1/preview/html
    └── Preview PDF.yml                         # POST /api/v1/preview/pdf
```

---

## Task 1: Collection Root + Environments

**Files:**
- Create: `bruno/opencollection.yml`
- Create: `bruno/collection.yml`
- Create: `bruno/environments/Local.yml`
- Create: `bruno/environments/Production.yml`

- [ ] **Step 1: Create `opencollection.yml`**

```yaml
opencollection: 1.0.0

info:
  name: zhr-ksef
```

- [ ] **Step 2: Create `collection.yml` with collection-level auth script**

The collection-level pre-request script injects the `X-API-Key` header on every request that doesn't already carry an `X-Admin-Key`. This keeps individual request files DRY — they never set auth headers themselves.

```yaml
request:
  variables:
    - name: tenantId
      value: ""
    - name: invoiceId
      value: ""
    - name: syncRunId
      value: ""
  scripts:
    - type: before-request
      code: |-
        const apiKey = bru.getEnvVar("apiKey");
        const adminKey = bru.getEnvVar("adminKey");
        // If the request already has X-Admin-Key, leave it alone
        const existingAdmin = req.getHeader("X-Admin-Key");
        if (!existingAdmin && apiKey) {
          req.setHeader("X-API-Key", apiKey);
        }
docs:
  content: |-
    # zhr-ksef API Collection

    Polish national e-invoicing (KSeF) integration microservice.

    ## Quick start

    1. Select the **Local** environment
    2. Set `adminKey` to your `ADMIN_API_KEY` value
    3. Run **Create Tenant** — it auto-captures `tenantId` and `apiKey`
    4. Exercise any endpoint

    ## Auth model

    - **Admin endpoints** (create/delete tenant): `X-Admin-Key` header
    - **Tenant endpoints** (everything else): `X-API-Key` header (`<id>_<secret>`)
    - The collection-level pre-request script auto-injects `X-API-Key` on every request
  type: text/markdown
```

- [ ] **Step 3: Create `Local.yml` environment**

```yaml
variables:
  - name: baseUrl
    value: http://localhost:3000
  - name: adminKey
    value: ""
    secret: true
  - name: apiKey
    value: ""
    secret: true
```

- [ ] **Step 4: Create `Production.yml` environment**

```yaml
variables:
  - name: baseUrl
    value: https://ksef.example.com
  - name: adminKey
    value: ""
    secret: true
  - name: apiKey
    value: ""
    secret: true
```

- [ ] **Step 5: Verify the collection opens in Bruno**

Open Bruno, click "Open Collection", select `bruno/`. Confirm:
- Collection name shows "zhr-ksef"
- Both environments appear in the environment selector
- No parse errors

- [ ] **Step 6: Commit**

```bash
git add bruno/opencollection.yml bruno/collection.yml bruno/environments/
git commit -m "feat(bruno): scaffold collection root and environments"
```

---

## Task 2: Health Endpoints

**Files:**
- Create: `bruno/Health/folder.yml`
- Create: `bruno/Health/Liveness.yml`
- Create: `bruno/Health/Readiness.yml`

- [ ] **Step 1: Create `folder.yml`**

```yaml
info:
  name: Health
```

- [ ] **Step 2: Create `Liveness.yml`**

```yaml
info:
  name: Liveness
  type: http
  seq: 1

http:
  method: GET
  url: "{{baseUrl}}/health"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("body has status ok", function() {
          expect(res.body.status).to.equal("ok");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 3: Create `Readiness.yml`**

This endpoint requires auth. The collection-level script injects `X-API-Key` automatically.

```yaml
info:
  name: Readiness
  type: http
  seq: 2

http:
  method: GET
  url: "{{baseUrl}}/health/detailed"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("body has status ok and tenant UUID", function() {
          expect(res.body.status).to.equal("ok");
          expect(res.body.tenant).to.be.a("string");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 4: Open Bruno, run Liveness against Local env**

Expected: 200 `{ "status": "ok" }` (dev server must be running).

- [ ] **Step 5: Commit**

```bash
git add bruno/Health/
git commit -m "feat(bruno): add health check requests"
```

---

## Task 3: Tenants Endpoints

**Files:**
- Create: `bruno/Tenants/folder.yml`
- Create: `bruno/Tenants/Create Tenant.yml`
- Create: `bruno/Tenants/Get Tenant.yml`
- Create: `bruno/Tenants/Update Tenant.yml`
- Create: `bruno/Tenants/Delete Tenant.yml`
- Create: `bruno/Tenants/Rotate Key.yml`
- Create: `bruno/Tenants/Clear Credentials.yml`

- [ ] **Step 1: Create `folder.yml`**

```yaml
info:
  name: Tenants
```

- [ ] **Step 2: Create `Create Tenant.yml`**

This is the one admin-auth request. It sets `X-Admin-Key` explicitly so the collection-level script skips `X-API-Key` injection. The post-response script captures `tenantId` and `apiKey` into collection variables for all subsequent requests.

```yaml
info:
  name: Create Tenant
  type: http
  seq: 1

http:
  method: POST
  url: "{{baseUrl}}/api/v1/tenants"
  headers:
    - name: content-type
      value: application/json
    - name: X-Admin-Key
      value: "{{adminKey}}"
  body:
    type: json
    data: |-
      {
        "name": "Test Tenant",
        "nip": "1234567890",
        "apiUrl": "test"
      }
  auth:
    type: none

runtime:
  scripts:
    - type: after-response
      code: |-
        if (res.status === 201) {
          bru.setVar("tenantId", res.body.tenant.id);
          bru.setVar("apiKey", res.body.apiKey);
          bru.setEnvVar("apiKey", res.body.apiKey);
        }
    - type: tests
      code: |-
        test("returns 201", function() {
          expect(res.status).to.equal(201);
        });

        test("response has tenant and apiKey", function() {
          expect(res.body.tenant).to.be.an("object");
          expect(res.body.tenant.id).to.be.a("string");
          expect(res.body.tenant.nip).to.equal("1234567890");
          expect(res.body.apiKey).to.be.a("string");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 3: Create `Get Tenant.yml`**

```yaml
info:
  name: Get Tenant
  type: http
  seq: 2

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("response has tenant object", function() {
          expect(res.body.tenant).to.be.an("object");
          expect(res.body.tenant.id).to.be.a("string");
          expect(res.body.tenant.nip).to.be.a("string");
          expect(res.body.tenant.hasCertificate).to.be.a("boolean");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 4: Create `Update Tenant.yml`**

```yaml
info:
  name: Update Tenant
  type: http
  seq: 3

http:
  method: PATCH
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}"
  headers:
    - name: content-type
      value: application/json
  body:
    type: json
    data: |-
      {
        "name": "Updated Tenant Name"
      }
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("tenant name is updated", function() {
          expect(res.body.tenant.name).to.equal("Updated Tenant Name");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 5: Create `Delete Tenant.yml`**

```yaml
info:
  name: Delete Tenant
  type: http
  seq: 6

http:
  method: DELETE
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}"
  headers:
    - name: X-Admin-Key
      value: "{{adminKey}}"
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("confirms deletion", function() {
          expect(res.body.deleted).to.equal(true);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 6: Create `Rotate Key.yml`**

```yaml
info:
  name: Rotate Key
  type: http
  seq: 4

http:
  method: POST
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/rotate-key"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: after-response
      code: |-
        if (res.status === 200) {
          bru.setVar("apiKey", res.body.apiKey);
          bru.setEnvVar("apiKey", res.body.apiKey);
        }
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("returns new apiKey and grace period", function() {
          expect(res.body.apiKey).to.be.a("string");
          expect(res.body.gracePeriodHours).to.be.a("number");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 7: Create `Clear Credentials.yml`**

```yaml
info:
  name: Clear Credentials
  type: http
  seq: 5

http:
  method: DELETE
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/credentials"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("confirms credentials cleared", function() {
          expect(res.body.cleared).to.equal(true);
          expect(res.body.tenant.hasCertificate).to.equal(false);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 8: Run Create Tenant in Bruno, verify tenantId and apiKey are captured**

After running, check Bruno's variables panel — `tenantId` and `apiKey` should be populated. Then run Get Tenant — it should return 200 using the auto-injected API key.

- [ ] **Step 9: Commit**

```bash
git add bruno/Tenants/
git commit -m "feat(bruno): add tenant management requests"
```

---

## Task 4: Invoices Endpoints

**Files:**
- Create: `bruno/Invoices/folder.yml`
- Create: `bruno/Invoices/List Invoices.yml`
- Create: `bruno/Invoices/Get Invoice.yml`
- Create: `bruno/Invoices/Transition Invoice.yml`
- Create: `bruno/Invoices/Get Invoice Events.yml`
- Create: `bruno/Invoices/Get Invoice XML.yml`
- Create: `bruno/Invoices/Get Invoice HTML.yml`
- Create: `bruno/Invoices/Get Invoice PDF.yml`

- [ ] **Step 1: Create `folder.yml`**

```yaml
info:
  name: Invoices
```

- [ ] **Step 2: Create `List Invoices.yml`**

```yaml
info:
  name: List Invoices
  type: http
  seq: 1

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/invoices?page=1&pageSize=20"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: after-response
      code: |-
        if (res.status === 200 && res.body.items && res.body.items.length > 0) {
          bru.setVar("invoiceId", res.body.items[0].id);
        }
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("response has pagination and items array", function() {
          expect(res.body.page).to.be.a("number");
          expect(res.body.pageSize).to.be.a("number");
          expect(res.body.items).to.be.an("array");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 3: Create `Get Invoice.yml`**

```yaml
info:
  name: Get Invoice
  type: http
  seq: 2

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/invoices/{{invoiceId}}"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("response has invoice detail", function() {
          expect(res.body.invoice).to.be.an("object");
          expect(res.body.invoice.id).to.be.a("string");
          expect(res.body.invoice.ksefNumber).to.be.a("string");
          expect(res.body.invoice.status).to.be.a("string");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 4: Create `Transition Invoice.yml`**

```yaml
info:
  name: Transition Invoice
  type: http
  seq: 3

http:
  method: POST
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/invoices/{{invoiceId}}/transition"
  headers:
    - name: content-type
      value: application/json
  body:
    type: json
    data: |-
      {
        "action": "release",
        "actor": "bruno-test"
      }
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("response shows transition result", function() {
          expect(res.body.invoice).to.be.an("object");
          expect(res.body.invoice.fromStatus).to.be.a("string");
          expect(res.body.invoice.toStatus).to.be.a("string");
          expect(res.body.invoice.eventId).to.be.a("string");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 5: Create `Get Invoice Events.yml`**

```yaml
info:
  name: Get Invoice Events
  type: http
  seq: 4

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/invoices/{{invoiceId}}/events"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("response has events array", function() {
          expect(res.body.items).to.be.an("array");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 6: Create `Get Invoice XML.yml`**

```yaml
info:
  name: Get Invoice XML
  type: http
  seq: 5

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/invoices/{{invoiceId}}/xml"
  headers:
    - name: accept
      value: application/xml
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 7: Create `Get Invoice HTML.yml`**

```yaml
info:
  name: Get Invoice HTML
  type: http
  seq: 6

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/invoices/{{invoiceId}}/html"
  headers:
    - name: accept
      value: text/html
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200 with HTML content", function() {
          expect(res.status).to.equal(200);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 8: Create `Get Invoice PDF.yml`**

```yaml
info:
  name: Get Invoice PDF
  type: http
  seq: 7

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/invoices/{{invoiceId}}/pdf"
  headers:
    - name: accept
      value: application/pdf
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 9: Run List Invoices in Bruno, verify invoiceId is captured**

If the tenant has synced invoices, the post-response script captures the first invoice's ID into `invoiceId`. Subsequent invoice requests should resolve the variable.

- [ ] **Step 10: Commit**

```bash
git add bruno/Invoices/
git commit -m "feat(bruno): add invoice requests with auto-capture"
```

---

## Task 5: Sync Endpoints

**Files:**
- Create: `bruno/Sync/folder.yml`
- Create: `bruno/Sync/Trigger Incremental Sync.yml`
- Create: `bruno/Sync/Trigger Range Sync.yml`
- Create: `bruno/Sync/List Sync Runs.yml`
- Create: `bruno/Sync/Get Sync Run.yml`

- [ ] **Step 1: Create `folder.yml`**

```yaml
info:
  name: Sync
```

- [ ] **Step 2: Create `Trigger Incremental Sync.yml`**

```yaml
info:
  name: Trigger Incremental Sync
  type: http
  seq: 1

http:
  method: POST
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/sync"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: after-response
      code: |-
        if (res.status === 202) {
          bru.setVar("syncRunId", res.body.jobId);
        }
    - type: tests
      code: |-
        test("returns 202 Accepted", function() {
          expect(res.status).to.equal(202);
        });

        test("response has job details", function() {
          expect(res.body.jobId).to.be.a("string");
          expect(res.body.kind).to.equal("incremental");
          expect(res.body.tenantId).to.be.a("string");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 3: Create `Trigger Range Sync.yml`**

```yaml
info:
  name: Trigger Range Sync
  type: http
  seq: 2

http:
  method: POST
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/sync/range"
  headers:
    - name: content-type
      value: application/json
  body:
    type: json
    data: |-
      {
        "dateFrom": "2026-04-01",
        "dateTo": "2026-04-19"
      }
  auth:
    type: none

runtime:
  scripts:
    - type: after-response
      code: |-
        if (res.status === 202) {
          bru.setVar("syncRunId", res.body.jobId);
        }
    - type: tests
      code: |-
        test("returns 202 Accepted", function() {
          expect(res.status).to.equal(202);
        });

        test("response has range details", function() {
          expect(res.body.kind).to.equal("range");
          expect(res.body.dateFrom).to.be.a("string");
          expect(res.body.dateTo).to.be.a("string");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 4: Create `List Sync Runs.yml`**

```yaml
info:
  name: List Sync Runs
  type: http
  seq: 3

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/sync/runs"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: after-response
      code: |-
        if (res.status === 200 && res.body.items && res.body.items.length > 0) {
          bru.setVar("syncRunId", res.body.items[0].id);
        }
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("response has items array", function() {
          expect(res.body.items).to.be.an("array");
        });

settings:
  encodeUrl: true
```

- [ ] **Step 5: Create `Get Sync Run.yml`**

```yaml
info:
  name: Get Sync Run
  type: http
  seq: 4

http:
  method: GET
  url: "{{baseUrl}}/api/v1/tenants/{{tenantId}}/sync/runs/{{syncRunId}}"
  headers: []
  body:
    type: none
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

        test("response has run details", function() {
          expect(res.body.run).to.be.an("object");
          expect(res.body.run.id).to.be.a("string");
          expect(res.body.run.status).to.be.oneOf(["running", "ok", "error"]);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 6: Commit**

```bash
git add bruno/Sync/
git commit -m "feat(bruno): add sync requests with job ID capture"
```

---

## Task 6: Preview Endpoints (Dev Only)

**Files:**
- Create: `bruno/Preview/folder.yml`
- Create: `bruno/Preview/Preview HTML.yml`
- Create: `bruno/Preview/Preview PDF.yml`

- [ ] **Step 1: Create `folder.yml`**

```yaml
info:
  name: Preview
```

- [ ] **Step 2: Create `Preview HTML.yml`**

The preview endpoints accept raw FA(3) XML in the request body (content-type `text/xml`). They do not require authentication and are disabled in production.

```yaml
info:
  name: Preview HTML
  type: http
  seq: 1

http:
  method: POST
  url: "{{baseUrl}}/api/v1/preview/html"
  headers:
    - name: content-type
      value: text/xml
  body:
    type: xml
    data: |-
      <?xml version="1.0" encoding="UTF-8"?>
      <Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
        <Naglowek>
          <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
          <WariantFormularza>3</WariantFormularza>
          <DataWytworzeniaFa>2026-04-19T10:00:00</DataWytworzeniaFa>
          <SystemInfo>Bruno Test</SystemInfo>
        </Naglowek>
        <Podmiot1>
          <DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Sprzedawca Sp. z o.o.</Nazwa></DaneIdentyfikacyjne>
          <Adres><KodKraju>PL</KodKraju><AdresL1>ul. Testowa 1, 00-001 Warszawa</AdresL1></Adres>
        </Podmiot1>
        <Podmiot2>
          <DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>Nabywca S.A.</Nazwa></DaneIdentyfikacyjne>
          <Adres><KodKraju>PL</KodKraju><AdresL1>ul. Przykładowa 2, 00-002 Kraków</AdresL1></Adres>
        </Podmiot2>
        <Fa>
          <KodWaluty>PLN</KodWaluty>
          <P_1>2026-04-19</P_1>
          <P_2>FV/2026/04/001</P_2>
          <P_15>1230.00</P_15>
          <FaWiersz>
            <NrWierszaFa>1</NrWierszaFa>
            <P_7>Usługa testowa</P_7>
            <P_8A>szt.</P_8A>
            <P_8B>10</P_8B>
            <P_9A>100.00</P_9A>
            <P_11>1000.00</P_11>
            <P_12>23</P_12>
          </FaWiersz>
        </Fa>
      </Faktura>
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 3: Create `Preview PDF.yml`**

```yaml
info:
  name: Preview PDF
  type: http
  seq: 2

http:
  method: POST
  url: "{{baseUrl}}/api/v1/preview/pdf"
  headers:
    - name: content-type
      value: text/xml
  body:
    type: xml
    data: |-
      <?xml version="1.0" encoding="UTF-8"?>
      <Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
        <Naglowek>
          <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
          <WariantFormularza>3</WariantFormularza>
          <DataWytworzeniaFa>2026-04-19T10:00:00</DataWytworzeniaFa>
          <SystemInfo>Bruno Test</SystemInfo>
        </Naglowek>
        <Podmiot1>
          <DaneIdentyfikacyjne><NIP>1234567890</NIP><Nazwa>Sprzedawca Sp. z o.o.</Nazwa></DaneIdentyfikacyjne>
          <Adres><KodKraju>PL</KodKraju><AdresL1>ul. Testowa 1, 00-001 Warszawa</AdresL1></Adres>
        </Podmiot1>
        <Podmiot2>
          <DaneIdentyfikacyjne><NIP>0987654321</NIP><Nazwa>Nabywca S.A.</Nazwa></DaneIdentyfikacyjne>
          <Adres><KodKraju>PL</KodKraju><AdresL1>ul. Przykładowa 2, 00-002 Kraków</AdresL1></Adres>
        </Podmiot2>
        <Fa>
          <KodWaluty>PLN</KodWaluty>
          <P_1>2026-04-19</P_1>
          <P_2>FV/2026/04/001</P_2>
          <P_15>1230.00</P_15>
          <FaWiersz>
            <NrWierszaFa>1</NrWierszaFa>
            <P_7>Usługa testowa</P_7>
            <P_8A>szt.</P_8A>
            <P_8B>10</P_8B>
            <P_9A>100.00</P_9A>
            <P_11>1000.00</P_11>
            <P_12>23</P_12>
          </FaWiersz>
        </Fa>
      </Faktura>
  auth:
    type: none

runtime:
  scripts:
    - type: tests
      code: |-
        test("returns 200", function() {
          expect(res.status).to.equal(200);
        });

settings:
  encodeUrl: true
```

- [ ] **Step 4: Run Preview HTML against Local env**

Expected: 200 with self-contained HTML document showing the sample invoice.

- [ ] **Step 5: Commit**

```bash
git add bruno/Preview/
git commit -m "feat(bruno): add preview requests with sample FA(3) XML"
```

---

## Task 7: Add `.gitignore` for Bruno Secrets and Update README

**Files:**
- Create: `bruno/.gitignore`

- [ ] **Step 1: Create `bruno/.gitignore`**

Bruno stores environment secret values in local files that must not be committed.

```
# Bruno stores secret values in environment override files
environments/*.local.yml
```

- [ ] **Step 2: Commit**

```bash
git add bruno/.gitignore
git commit -m "chore(bruno): gitignore local environment secrets"
```

---

## Task 8: End-to-End Smoke Test — Full Workflow

This is a manual verification task, not code. It validates the complete collection works as a coherent workflow.

- [ ] **Step 1: Start the dev server and backing services**

```bash
docker compose up -d
pnpm dev
```

- [ ] **Step 2: Open Bruno, select Local environment, set `adminKey`**

Set the `adminKey` env variable to your `ADMIN_API_KEY` value.

- [ ] **Step 3: Run requests in this order**

1. **Liveness** — expect 200 `{ "status": "ok" }`
2. **Create Tenant** — expect 201, verify `tenantId` and `apiKey` captured in variables
3. **Get Tenant** — expect 200 (proves auto-injected `X-API-Key` works)
4. **Update Tenant** — expect 200 with updated name
5. **Preview HTML** — expect 200 with HTML body
6. **Preview PDF** — expect 200 with PDF body
7. **Readiness** — expect 200 (authenticated health check)
8. **Delete Tenant** — expect 200 `{ "deleted": true }`

- [ ] **Step 4: Verify all tests pass in Bruno's test runner**

Use Bruno's "Run Collection" feature. All test assertions written in the request files should pass (excluding requests that depend on synced invoice data).
