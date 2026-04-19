# Propozycja integracji Ziher ↔ zhr-ksef

## Kontekst

**zhr-ksef** to wydzielony mikroserwis TypeScript (Hono + PostgreSQL + BullMQ), który przejmuje z Zihera całą komunikację z KSeF. Serwis jest multi-tenant, posiada własną bazę danych, system szyfrowania certyfikatów (envelope encryption), automatyczną synchronizację faktur, workflow stanowy i renderowanie faktur (HTML/PDF).

**Ziher** to monolityczna aplikacja Rails — system księgowy ZHR. Posiada model `Entry` (zapis księgowy) z pozycjami (`Item`), hierarchiczną strukturę jednostek (`Unit`), autoryzację CanCanCan i audyt zmian.

**Cel:** Ziher staje się klientem zhr-ksef przez REST API. Nie trzyma certyfikatów KSeF, nie uruchamia synchronizacji, nie parsuje XML — deleguje to do mikroserwisu.

---

## Architektura integracji

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│         Ziher            │         │          zhr-ksef            │
│      (Rails 8)           │         │     (Hono + Node.js)         │
│                          │         │                              │
│  KsefApiClient ─────────────────►  API  /api/v1/tenants/:id/...  │
│  (Faraday + retry)       │  HTTP   │                              │
│                          │         │  ┌── sync (BullMQ worker) ──┐│
│  Ksef::InvoicesController│         │  │  cron scheduler          ││
│  Ksef::SettingsController│         │  │  KSeF API integration    ││
│                          │         │  └──────────────────────────┘│
│  KsefConfig (local)      │         │                              │
│  Import → Entry/Item     │         │  PostgreSQL (invoices, sync) │
│                          │         │  Redis (BullMQ)              │
└──────────────────────────┘         └──────────────────────────────┘
```

---

## Co jest gotowe w zhr-ksef

| Komponent | Status | Endpoint / Moduł |
|---|---|---|
| Provisioning tenanta | ✅ | `POST /api/v1/tenants` (admin) |
| Upload certyfikatu | ✅ | `PATCH /api/v1/tenants/:id` z `credentials` |
| Rotacja klucza API | ✅ | `POST /api/v1/tenants/:id/rotate-key` |
| Sync inkrementalny | ✅ | `POST /api/v1/tenants/:id/sync` |
| Sync zakresowy | ✅ | `POST /api/v1/tenants/:id/sync/range` |
| Auto-sync (cron) | ✅ | `sync_cron` w PATCH tenant → BullMQ scheduler |
| Historia sync runów | ✅ | `GET /api/v1/tenants/:id/sync/runs` |
| Lista faktur (filtry) | ✅ | `GET /api/v1/tenants/:id/invoices?status=&nip=&dateFrom=&dateTo=` |
| Szczegóły faktury | ✅ | `GET /api/v1/tenants/:id/invoices/:iid` |
| Workflow (maszyna stanów) | ✅ | `POST /api/v1/tenants/:id/invoices/:iid/transition` |
| Audit trail | ✅ | `GET /api/v1/tenants/:id/invoices/:iid/events` |
| Oryginalny XML | ✅ | `GET /api/v1/tenants/:id/invoices/:iid/xml` |
| Renderowanie HTML | ✅ | `GET /api/v1/tenants/:id/invoices/:iid/html` |
| Renderowanie PDF | ✅ | `GET /api/v1/tenants/:id/invoices/:iid/pdf` |
| OpenAPI spec | ✅ | `GET /api/v1/openapi.json` (Swagger UI: `GET /api/v1/docs`) |

---

## Co trzeba zbudować w Ziher

### 1. `KsefApiClient` — klient HTTP

Wrapper Faraday z retry, timeoutem i obsługą błędów. Komunikuje się z zhr-ksef używając klucza API (header `X-API-Key`).

```ruby
# app/services/ksef/api_client.rb
class Ksef::ApiClient
  # Faktury
  def invoices(status: nil, nip: nil, date_from: nil, date_to: nil, page: 1, page_size: 50)
    get("invoices", status:, nip:, dateFrom: date_from, dateTo: date_to, page:, pageSize: page_size)
  end

  def invoice(id) = get("invoices/#{id}")
  def invoice_html(id) = get_raw("invoices/#{id}/html")
  def invoice_pdf(id) = get_raw("invoices/#{id}/pdf")
  def invoice_events(id) = get("invoices/#{id}/events")

  # Workflow
  def transition(id, action:, actor: nil, metadata: nil)
    post("invoices/#{id}/transition", { action:, actor:, metadata: }.compact)
  end

  # Sync
  def sync = post("sync", {})
  def sync_range(date_from:, date_to:) = post("sync/range", { dateFrom: date_from, dateTo: date_to })
  def sync_runs = get("sync/runs")
  def sync_run(id) = get("sync/runs/#{id}")

  # Tenant (używa tenant_conn — ścieżka bez trailing subresource)
  def tenant
    JSON.parse(tenant_conn.get("").body, symbolize_names: true)
  end

  def update_tenant(params)
    JSON.parse(tenant_conn.patch("", params).body, symbolize_names: true)
  end

  private

  def config
    @config ||= {
      base_url: ENV.fetch("ZHR_KSEF_URL"),
      api_key: Rails.application.credentials.dig(:zhr_ksef, :api_key),
      tenant_id: Rails.application.credentials.dig(:zhr_ksef, :tenant_id),
    }
  end

  def build_conn(url)
    Faraday.new(url:) do |f|
      f.request :json
      f.request :retry, max: 2, interval: 0.5
      f.response :raise_error
      f.headers["X-API-Key"] = config[:api_key]
    end
  end

  # /api/v1/tenants/:id/invoices/..., /api/v1/tenants/:id/sync/...
  # Trailing slash jest kluczowy — bez niego URI.merge zastępuje
  # ostatni segment (TENANT_ID) zamiast dopisywać ścieżkę.
  def conn
    @conn ||= build_conn("#{config[:base_url]}/api/v1/tenants/#{config[:tenant_id]}/")
  end

  # /api/v1/tenants/:id (GET tenant, PATCH tenant)
  def tenant_conn
    @tenant_conn ||= build_conn("#{config[:base_url]}/api/v1/tenants/#{config[:tenant_id]}")
  end

  def get(path, params = {})
    JSON.parse(conn.get(path, params.compact).body, symbolize_names: true)
  end

  def get_raw(path) = conn.get(path).body

  def post(path, body)
    JSON.parse(conn.post(path, body).body, symbolize_names: true)
  end
end
```

> **Uwaga:** Ziher jest single-tenant w kontekście KSeF (jeden NIP dla całej organizacji). `TENANT_ID` i `API_KEY` są ustawiane raz, w credentials.

### 2. Lokalny model `KsefConfig`

Ziher nie duplikuje stanu faktur ani konfiguracji tenanta z zhr-ksef. Jedynym lokalnym modelem jest `KsefConfig` — prosta tabela key-value przechowująca ustawienia UI specyficzne dla danej instancji Zihera (nie związane z API mikroserwisu):

```ruby
# db/migrate/..._create_ksef_configs.rb
create_table :ksef_configs do |t|
  t.string :key, null: false, index: { unique: true }
  t.text :value
  t.timestamps
end
```

```ruby
# app/models/ksef_config.rb
class KsefConfig < ApplicationRecord
  validates :key, presence: true, uniqueness: true

  DEFAULTS = {
    "user_visible_statuses" => %w[unassigned assigned imported].to_json,
  }.freeze

  def self.get(key)
    find_by(key:)&.value || DEFAULTS[key]
  end

  def self.set(key, value)
    upsert({ key:, value:, updated_at: Time.current }, unique_by: :key)
  end
end
```

**Konfigurowane ustawienia:**

| Klucz | Typ | Domyślnie | Opis |
|---|---|---|---|
| `user_visible_statuses` | JSON array | `["unassigned", "assigned", "imported"]` | Statusy faktur widoczne dla zwykłych użytkowników. Superadmin zawsze widzi wszystkie. |

Poza `KsefConfig` jedyny stan KSeF w bazie Zihera to pole `ksef_invoice_id` (UUID z zhr-ksef) na `entries`, zapisywane przy imporcie.

### 3. Kontrolery i widoki

Docelowa struktura po integracji z zhr-ksef:

#### Kontrolery

```
app/controllers/ksef/
  base_controller.rb          # before_action: authenticate
  invoices_controller.rb      # index, show, html_preview, pdf, assign, release, dismiss, import, do_import
  settings_controller.rb      # show, update, sync, sync_range (superadmin only)
```

**`Ksef::InvoicesController`** — thin proxy + import flow:

| Akcja | Metoda | Opis |
|---|---|---|
| `index` | GET | Lista faktur z API (`api_client.invoices`). Zakładki statusów filtrowane przez `KsefConfig.get("user_visible_statuses")` — superadmin widzi wszystkie, zwykły user tylko skonfigurowane. Paginacja. |
| `show` | GET | Szczegóły z API + iframe podgląd + badge statusu + przyciski akcji |
| `html_preview` | GET | Proxy `api_client.invoice_html(id)` → render bez layoutu (src iframe) |
| `pdf` | GET | Proxy `api_client.invoice_pdf(id)` → `send_data` |
| `assign` | PATCH | `api_client.transition(id, action: "assign", metadata: { unit_id:, assigned_by: })` |
| `release` | PATCH | `api_client.transition(id, action: "release")` |
| `dismiss` | PATCH | `api_client.transition(id, action: "dismiss")` |
| `import` | GET | Formularz importu — pozycje z `parsedData` (z API), dzienniki i kategorie z Zihera |
| `do_import` | POST | Tworzy Entry/Items, wywołuje `api_client.transition(id, action: "import")` |

**`Ksef::SettingsController`** — proxy do tenant API (superadmin only):

| Akcja | Metoda | Opis |
|---|---|---|
| `show` | GET | Read-only status z `api_client.tenant` — NIP, środowisko, sync cron, `lastSyncAt`, `lastSyncStatus`, `lastSyncError`, `certNotAfter`. Wyświetla też lokalne ustawienia z `KsefConfig` (widoczność statusów). |
| `update` | PATCH | Dwie sekcje formularza: |
|  |  | **Ustawienia tenanta** (proxy do `PATCH /api/v1/tenants/:id`): |
|  |  | • `name` — nazwa tenanta |
|  |  | • `nip` — NIP (10 cyfr) |
|  |  | • `apiUrl` — środowisko KSeF (`production` / `test` / `demo`) |
|  |  | • `syncEnabled` — włącz/wyłącz auto-sync |
|  |  | • `syncCron` — wyrażenie cron (np. `*/30 * * * *`) |
|  |  | • `credentials` — certyfikat (`certBase64`), klucz (`keyBase64`), passphrase |
|  |  | **Ustawienia lokalne** (zapisywane w `KsefConfig`): |
|  |  | • `user_visible_statuses` — checkboxy: które statusy faktur widzą zwykli użytkownicy (superadmin widzi zawsze wszystkie) |
| `sync` | POST | `api_client.sync` — trigger manual sync w zhr-ksef |
| `sync_range` | POST | `api_client.sync_range(date_from:, date_to:)` — sync zakresowy |

#### Widoki

```
app/views/ksef/
  invoices/
    index.html.erb            # zakładki statusów z licznikami, tabela, paginacja
    show.html.erb             # podgląd: iframe z proxy HTML + link do PDF
    import.html.erb           # wizard importu z podglądem na żywo (JS)
    _list.html.erb            # partial tabeli (numer, data, sprzedawca, kwota, unit, status, akcje)
    _action_cell.html.erb     # przyciski per-wiersz (przejmij/zwolnij/importuj)
    _assign_form.html.erb     # formularz przypisania (unit selector + notatka)
  settings/
    show.html.erb             # status tenanta (read-only) + formularz edycji + przyciski sync
```

Renderowanie faktur (HTML i PDF) jest w całości po stronie zhr-ksef. Ziher proxy'uje odpowiedzi przez swój kontroler (unika CORS, nie eksponuje adresu mikroserwisu).

#### Routes

```ruby
namespace :ksef do
  resource :setting, only: [:show, :update] do
    post :sync
    post :sync_range
  end
  resources :invoices, only: [:index, :show] do
    member do
      get   :html_preview
      get   :pdf
      patch :assign
      patch :release
      patch :dismiss
      get   :import
      post  :import, action: :do_import
    end
  end
end
```

#### Uprawnienia (CanCanCan)

- **Superadmin**: pełen dostęp — settings, wszystkie faktury (w tym zakładki "Nowe" i "Odrzucone"), assign/release/dismiss
- **Użytkownik jednostki**: widzi faktury przypisane do swoich jednostek + pulę nieprzypisanych, może przejmować i importować tylko w ramach zarządzanych jednostek

### 4. Flow importu faktury → Entry

```
Użytkownik klika "Importuj" (GET /ksef/invoices/:id/import)
  │
  ├── api_client.invoice(id)
  │     → pobiera dane faktury z zhr-ksef (w tym parsedData z pozycjami)
  │
  ├── Formularz importu wyświetla:
  │     • Podsumowanie faktury (sprzedawca, numer, data, kwota brutto)
  │     • Wybór dziennika (otwarte dzienniki jednostki z tego samego roku)
  │     • Pole opisu (prefill: sellerName)
  │     • Tabela pozycji (z parsedData.fa.wiersze) z wyborem kategorii:
  │         - Checkboxy (bulk select) + Nr + Nazwa + Kwota brutto + Kategoria
  │         - Bulk assignment: "Dla wszystkich" / "Dla zaznaczonych" / "Dla niewybranych"
  │     • Podgląd na żywo (JS): zagregowane pozycje per kategoria
  │     • Submit zablokowany dopóki wszystkie pozycje nie mają kategorii
  │
  ▼
Użytkownik potwierdza (POST /ksef/invoices/:id/import → do_import)
  │
  ├── Walidacja:
  │     • Dziennik należy do jednostki użytkownika
  │     • Wszystkie pozycje mają category_id
  │     • Sumy per kategoria > 0
  │
  ├── W transakcji:
  │     1. Entry.create!(
  │          journal:, date: issueDate,
  │          name: opis || sellerName || "KSeF #{ksefNumber}",
  │          document_number: invoiceNumber || ksefNumber,
  │          is_expense: true,
  │          ksef_invoice_id: id  ← UUID z zhr-ksef
  │        )
  │     2. Agregacja pozycji per kategoria (sum amounts)
  │     3. Item.create! dla każdej unikalnej kategorii
  │     4. api_client.transition(id, action: "import", actor: current_user.email)
  │
  └── Redirect → journal_path(journal)
```

Ziher nie parsuje XML — pozycje faktury pochodzą z `parsedData` zwracanego przez API zhr-ksef (sparsowane przy synchronizacji). Walidacja „czy faktura jest już zaimportowana" opiera się o status z API (transition `import` na już-zaimportowanej fakturze zwróci 409).

**Kluczowe reguły biznesowe:**

- Wiele pozycji z tą samą kategorią agreguje się w jeden `Item` (suma kwot)
- Dziennik musi należeć do jednostki użytkownika
- Kwoty to `BigDecimal`, nigdy `Float`
- `ksef_invoice_id` na `Entry` to jedyny stan KSeF w bazie Zihera

### 5. Przypisanie faktury do jednostki (Unit)

Przypisanie jest realizowane przez transition `assign` w zhr-ksef. Ziher przekazuje dane jednostki w polu `metadata`:

```ruby
api_client.transition(invoice_id,
  action: "assign",
  actor: current_user.email,
  metadata: { unit_id: unit.id, unit_name: unit.name, assigned_by: current_user.name }
)
```

**Widoczność faktur a filtrowanie:**

API zhr-ksef nie filtruje po `metadata` — zwraca wszystkie faktury tenanta. Filtrowanie per jednostka jest logiką Zihera:

- **Superadmin** — widzi wszystkie faktury (filtruje po statusie)
- **Użytkownik jednostki** — Ziher pobiera faktury z API i filtruje po stronie klienta po `metadata.unit_id` (jednostki użytkownika) + pokazuje pulę `unassigned`

> **Uwaga dot. skalowalności:** przy dużej liczbie faktur filtrowanie client-side może być nieefektywne. Jeśli okaże się problemem, można dodać query param `metadata.unit_id` do API zhr-ksef (filtr JSONB po stronie PostgreSQL) lub wrócić do lokalnego cache'a z tabelą `ksef_invoices` w Ziher.

### 6. Podgląd faktury

Całość renderowania faktur jest po stronie zhr-ksef. Ziher nie parsuje XML, nie generuje PDF — zero partiali FA, zero wkhtmltopdf.

- **Podgląd HTML** — `<iframe>` wskazujący na `GET /api/v1/tenants/:id/invoices/:iid/html` (self-contained dokument z strict CSP, bez zewnętrznych zasobów)
- **PDF** — link otwierający `GET /api/v1/tenants/:id/invoices/:iid/pdf` w nowej karcie

Kontroler Zihera proxy'uje oba endpointy (via `KsefApiClient#invoice_html` / `#invoice_pdf`), żeby nie eksponować adresu mikroserwisu i uniknąć CORS:

```ruby
# Ksef::InvoicesController
def html_preview
  html = api_client.invoice_html(params[:id])
  render html: html.html_safe, layout: false
end

def pdf
  pdf = api_client.invoice_pdf(params[:id])
  send_data pdf, type: "application/pdf", disposition: "inline"
end
```

Widok `show.html.erb` osadza iframe + link do PDF:

```erb
<iframe src="<%= html_preview_ksef_invoice_path(@invoice) %>"
        style="width: 100%; height: 800px; border: 1px solid #ddd;"></iframe>

<a href="<%= pdf_ksef_invoice_path(@invoice) %>" target="_blank">Pobierz PDF</a>
```

---

## Konfiguracja i deployment

### Zmienne środowiskowe / credentials w Ziher

```yaml
# config/credentials.yml.enc
zhr_ksef:
  url: "https://ksef.zhr.pl"        # URL mikroserwisu
  tenant_id: "fea758c5-..."          # UUID tenanta
  api_key: "<apiKeyId>_<secret>"     # klucz API z provisioningu
```

### Provisioning (jednorazowy setup)

1. Admin tworzy tenanta w zhr-ksef: `POST /api/v1/tenants` → dostaje `tenant.id` + `apiKey`
2. Admin uploaduje certyfikat: `PATCH /api/v1/tenants/:id` z `credentials.certBase64` + `credentials.keyBase64`
3. Admin ustawia auto-sync: `PATCH /api/v1/tenants/:id` z `syncEnabled: true`, `syncCron: "*/30 * * * *"`
4. Credentials (`tenant_id`, `api_key`) wchodzą do `credentials.yml.enc` w Ziher

### Docker / sieć

zhr-ksef wymaga:

- PostgreSQL (może być wspólna instancja, osobna baza)
- Redis (dla BullMQ)
- Worker (`pnpm dev:worker` / `node dist/jobs/worker.js`)

```yaml
# docker-compose.dev.yml (fragment)
services:
  zhr-ksef:
    build: ../zhr-ksef
    ports: ["3001:3000"]
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://redis:6379
      ENCRYPTION_KEY: <base64>
      ADMIN_API_KEY: <secret>
    depends_on: [postgres, redis]

  zhr-ksef-worker:
    build: ../zhr-ksef
    command: node dist/jobs/worker.js
    environment: *ksef-env
    depends_on: [postgres, redis]
```

---

## Bezpieczeństwo

| Aspekt | Realizacja |
|---|---|
| Certyfikaty KSeF | Przechowywane wyłącznie w zhr-ksef (envelope encryption AES-256-GCM). Ziher przekazuje PEM tranzytem (settings → API) ale nie persystuje — materiał kryptograficzny nie jest zapisywany w bazie ani logach Zihera. |
| Klucz API | Bcrypt-hashowany w zhr-ksef. Ziher przechowuje plaintext w `credentials.yml.enc` (Rails encrypted). |
| Rotacja klucza | `POST /api/v1/tenants/:id/rotate-key` → 24h grace period na starym kluczu. |
| Izolacja danych | PostgreSQL RLS per tenant. Ziher ma dostęp tylko do swojego tenanta. |
| Transport | HTTPS między Ziher a zhr-ksef (w produkcji). |

---
