import os, sys, json, subprocess, tempfile

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "https://app.hellobonsai.com/public-api/v1"
ENV_FILE = r"E:\envs\.env"

def get_token():
    token = os.environ.get("BONSAI_API_KEY") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not token and os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("BONSAI_API_KEY="):
                    token = line.split("=", 1)[1].strip().strip("'").strip('"')
                    break
    return token.strip()

def api_request(method, path, token, payload=None):
    url = f"{BASE_URL}{path}"
    cmd = [
        "curl.exe", "-s", "-X", method, url,
        "-H", f"Authorization: Bearer {token}",
        "-H", "Accept: application/json",
        "-H", "Content-Type: application/json"
    ]
    tmp_path = None
    if payload is not None:
        fd, tmp_path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f)
        cmd.extend(["--data-binary", f"@{tmp_path}"])
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        if res.returncode != 0:
            raise RuntimeError(f"curl failed: {res.stderr}")
        return json.loads(res.stdout)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

def main():
    token = get_token()
    if not token:
        print("Usage: python create-bonsai-invoice.py [bonsai_at_...]")
        sys.exit(1)

    # Verified Towing One LLC IDs in Hello Bonsai:
    # Company: Towing One LLC (id: 1318033, default_contact_id: 1437428)
    # Project: Towing One LLC (id: 1032978)
    company_id = 1318033
    contact_id = 1437428
    project_id = 1032978

    co_resp = api_request("GET", f"/companies/{company_id}", token).get("data", {})
    print(f"Verified Company: {co_resp.get('name', 'Towing One LLC')} (ID: {company_id})")
    print(f"Using Contact ID: {contact_id} (Fausto Orozco)")
    print(f"Using Project ID: {project_id}")

    invoice_payload = {
        "company_id": company_id,
        "contact_id": contact_id,
        "project_id": project_id,
        "title": "Towing One LLC — Google Ads (LSA) & Website Optimization (G3Z-2026-1101)",
        "currency": "USD",
        "due": "upon_receipt",
        "invoice_items": [
            {
                "name": "1.1 — Connect New Google Ads Account & Save Call History / Conectar Nueva Cuenta y Guardar Historial",
                "description": "Connect migrated Local Services Ads account (skylandoroz@hotmail.com) to Google Ads Manager and back up all 2,870 historical leads.",
                "amount": "1.5",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "1.2 — Separate Towing vs. Roadside Pricing & Disable Heavy Trucks / Separar Precios de Grúa vs. Asistencia",
                "description": "Restructure Target CPL bidding so Roadside calls aren't billed at full flatbed tow rates; disable Heavy Truck Roadside (82% rejection rate).",
                "amount": "2.0",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "1.3 — Turn Off Expensive Text Message Leads (Phone Calls Only) / Apagar Mensajes de Texto Caros",
                "description": "Disable LSA Message Leads (94% charge rate, 89% missing names) to direct 100% of ad spend into live emergency dispatch phone calls.",
                "amount": "0.5",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "1.4 — Focus Budget on Boca Raton, Delray & Boynton Core + Peak Hours / Enfocar Presupuesto en Boca, Delray y Boynton",
                "description": "Exclude low-converting faraway zones and focus 100% of budget on Boca Raton, Delray Beach & Boynton Beach (87% of business) + Mon/Fri/Sun schedule tuning.",
                "amount": "1.5",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "2.1 — Update Website Homepage to Highlight Boca Raton & Delray Beach / Cambiar Portada Web para Destacar Boca y Delray",
                "description": "Update homepage title, H1, and copy on index.html to target top 3 revenue cities: Boca Raton, Delray Beach, and Boynton Beach.",
                "amount": "1.5",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "2.2 — Register 11 Hidden Boca Raton & Delray Pages with Google / Conectar 11 Páginas Ocultas en Google",
                "description": "Add all 11 omitted Boca Raton, Delray Beach, and 'Near Me' landing pages to sitemap.xml and submit to Google Search Console.",
                "amount": "1.5",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "2.3 — Make Boca & Delray Pages Stand Out in Google (5.0★ & 25-Min ETA) / Mejorar Anuncios Gratis de Boca y Delray",
                "description": "Upgrade titles, meta descriptions, and JSON-LD schema on Boca & Delray emergency pages (~1,000 Page-1 impressions with 0 clicks).",
                "amount": "2.0",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "2.4 — Create New '24/7 Roadside Assistance' Page / Crear Página Nueva para Asistencia en Carretera 24/7",
                "description": "Build and launch dedicated services/roadside-assistance.html targeting jump starts, flat tires, lockouts, and fuel delivery (1,045 LSA calls/yr).",
                "amount": "3.0",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "3.1 — Sticky '1-Tap Call Now' Bar on Mobile Phones / Botón Fijo en el Celular para Llamar con 1 Toque",
                "description": "Deploy persistent mobile bottom bar ('Call 24/7 Dispatch: (561) 909-5712 • ~25 Min Arrival') across all pages.",
                "amount": "1.5",
                "rate": "125.00",
                "unit_type": "per_hour"
            },
            {
                "name": "3.2 — Replace Slow Email Form with Instant Emergency Call Buttons / Botones Directos de Emergencia en Portada",
                "description": "Streamline above-the-fold hero section with 1-tap emergency call buttons for Flatbed Towing, Roadside Assistance, and Cash for Junk Cars.",
                "amount": "1.5",
                "rate": "125.00",
                "unit_type": "per_hour"
            }
        ]
    }

    resp = api_request("POST", "/invoices", token, {"invoice": invoice_payload})
    if "error" in resp:
        print("API Error:", json.dumps(resp, indent=2))
        sys.exit(1)

    created = resp.get("data", resp)
    inv_id = created.get("id")
    print(f"\nSUCCESS! Created Draft Invoice #{created.get('invoice_number')} (ID: {inv_id})")
    print(f"Total Amount: ${created.get('total_amount')} | Status: {created.get('status')}")
    print(f"Review/Edit in Bonsai: {created.get('url') or f'https://app.hellobonsai.com/invoices/{inv_id}'}")
    print(json.dumps(created, indent=2))

if __name__ == "__main__":
    main()
