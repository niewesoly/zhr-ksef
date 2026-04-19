# zhr-ksef

Mikroserwis TypeScript do integracji z **KSeF** (Krajowy System e-Faktur) -- wydzielany z monolitu ziher.

## Stack

| Warstwa | Technologia |
|---------|-------------|
| HTTP | Hono (Node.js) |
| Baza danych | PostgreSQL 16 + Drizzle ORM |
| Kolejki | BullMQ + Redis 7 |
| PDF | @react-pdf/renderer |
| XML | fast-xml-parser |
| Walidacja | Zod |

## Wymagania

- Node.js >= 18
- pnpm
- PostgreSQL 16+
- Redis 7+

## Szybki start

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

## Komendy

| Komenda | Opis |
|---------|------|
| `pnpm dev` | Serwer deweloperski (tsx watch) |
| `pnpm build` | Kompilacja TypeScript (tsc) |
| `pnpm start` | Uruchomienie produkcyjne |
| `pnpm test` | Testy (Node test runner + tsx) |

## API

Dokumentacja endpointow dostepna w Swagger UI po uruchomieniu serwera: `http://localhost:3000/api/v1/docs`

## Wizualizacja faktur

Oba renderery (HTML i PDF) obsluguja pelny zakres FA(3):

- Dane podmiotow (sprzedawca, nabywca) z NIP, adresem, danymi rejestrowymi (KRS, REGON)
- VAT UE (NrVatUE, KodUE)
- Wiersze z rabatami, datami dostawy (P_6A), numerami WZ
- Podsumowanie stawek VAT z opcjonalna kolumna VAT w PLN (P_14_*W)
- Adnotacje (TP, znaczniki GTU, mechanizm podzielonej platnosci)
- Rozliczenie (obciazenia, odliczenia, kwoty naleznosci)
- Warunki transakcji i platnosci
- Korekty (dane faktury korygowanej, przyczyna korekty)
- Informacje dodatkowe (DodatkowyOpis)
- Okres rozliczeniowy (OkresFa)
- Faktury zaliczkowe

## Kolekcja Bruno

Katalog `bruno/` zawiera kolekcje API do testowania:

```
bruno/
  Health/            # Health check
  Invoices/          # CRUD faktur
  Sync/              # Synchronizacja z KSeF
  Preview/           # Podglad HTML/PDF z przykladowymi XML
  Tenants/           # Zarzadzanie tenantami
```

## Struktura projektu

```
src/
  api/routes/        # Endpointy Hono
  ksef/              # Klient KSeF, parser XML, podpisy XAdES
  visualization/     # Renderery HTML i PDF, tabele, slowniki
  jobs/              # Workery BullMQ (sync, PDF)
  db/                # Schemat Drizzle, migracje
  lib/               # Szyfrowanie, walidacja, narzedzia
  workflow/          # Maszyna stanow faktur
tests/
  ksef/              # Testy parsera
  visualization/     # Testy rendererow
  fixtures/          # Przykladowe XML FA(3)
```

## Model bezpieczenstwa

- **Envelope encryption** -- per-tenant DEK (AES-256-GCM) opakowuje cert/klucz; DEK opakowuje KEK z env
- **Klucze API** -- bcrypt (cost 12), rotacja z 24h grace period
- **Row Level Security** -- izolacja danych miedzy tenantami (PostgreSQL RLS)
- **Ochrona SSRF** -- `api_url` jako enum, walidacja URL z odpowiedzi KSeF
- **Redakcja logow** -- pino z lista pol do redakcji (cert, klucze, API key)
