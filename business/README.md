# 🏢 Business Configuration Hub

This `business/` folder is the **single source of truth** for all business identity, offerings (products or services), message instructions, AI persona guidance, notifications, and customer communication workflows across the entire platform.

When setting up this platform for a new client or changing business models (including switching between an **E-Commerce / Product** business and an **Appointment / Service** business), **you only need to edit the files in this directory**.

---

## 📁 Directory Structure

```
business/
├── business-profile.json         # Active business profile (brand, offerings, templates, prompts)
├── business-knowledge.md         # Active instructions & domain knowledge for the AI agent
├── business-profile.schema.json  # JSON schema for autocomplete and validation
├── README.md                     # This documentation
└── examples/
    ├── ecommerce-business-profile.json      # Complete reference for a physical product business
    ├── service-business-profile.json        # Complete reference for an appointment/service clinic
    └── service-business-knowledge.md        # Reference instructions for a service practice
```

---

## 🚀 Setting Up a New Business in 3 Simple Steps

### Step 1: Choose Your Business Model

In `business/business-profile.json`, set `businessType`:
* `"ecommerce"`: For physical goods, packaged foods, apparel, cosmetics, etc.
* `"service"`: For clinics, salons, spas, consulting agencies, repair services, fitness coaching, etc.
* `"hybrid"`: For businesses providing both products and services.

### Step 2: Define Your Offerings & Terminology

Configure your terminology and catalog in `business-profile.json`:

#### For a Product Business (e.g. Mintara Bites)
```json
{
  "businessType": "ecommerce",
  "terminology": {
    "itemNoun": "treat",
    "itemNounPlural": "treats",
    "actionVerb": "Order",
    "browseButtonTitle": "🛒 Browse Treats",
    "trackingButtonTitle": "📦 Track on Web",
    "reorderButtonTitle": "🔄 Reorder Favorites"
  },
  "offerings": [
    {
      "id": "paan-mukhwas",
      "title": "Artisanal Paan Mukhwas",
      "type": "product",
      "price": "₹149 (150g) / ₹249 (300g)",
      "requiresRefrigeration": true,
      "variants": [
        { "id": "btn_size_paan_150g", "title": "150g", "price": 149, "sku": "paan-150g" },
        { "id": "btn_size_paan_300g", "title": "300g", "price": 249, "sku": "paan-300g" }
      ]
    }
  ]
}
```

#### For a Service Business (e.g. Lumina Clinic)
```json
{
  "businessType": "service",
  "terminology": {
    "itemNoun": "service",
    "itemNounPlural": "services",
    "actionVerb": "Book",
    "browseButtonTitle": "🗓️ View Services",
    "trackingButtonTitle": "📅 My Appointments",
    "reorderButtonTitle": "🔁 Rebook Session"
  },
  "offerings": [
    {
      "id": "dental-scaling",
      "title": "Ultrasonic Dental Scaling & Polish",
      "type": "service",
      "price": "₹999 (30 Mins) / ₹1,899 (60 Mins Deep)",
      "durationMinutes": 45,
      "bookingUrl": "https://luminaclinic.com/book?service=scaling",
      "variants": [
        { "id": "btn_service_scaling_30m", "title": "30 Mins Standard", "price": 999, "sku": "scaling-30m" },
        { "id": "btn_service_scaling_60m", "title": "60 Mins Deep Clean", "price": 1899, "sku": "scaling-60m" }
      ]
    }
  ]
}
```

### Step 3: Update AI Knowledge & Persona

1. Edit `business/business-knowledge.md` with:
   - About the business and its founder story.
   - Operating hours and physical location.
   - Service / product details, pricing, and benefits.
   - Pre-appointment instructions or product care guidelines.
   - Cancellation and refund policies.
2. In `business/business-profile.json`:
   - Set `brand.links`: website, cart/booking URL, order/appointment tracking dashboard, Instagram, Google review link.
   - Customize `notifications` templates for instant order/booking confirmations, delivery/completion messages, and review prompts.

---

## 🔄 Dynamic Template Placeholders

All notification and support templates in `business-profile.json` automatically format the following dynamic variables:

| Placeholder | Meaning / Source | Example Output |
| :--- | :--- | :--- |
| `{{customerName}}` | Customer's first name | Aarav |
| `{{customerPhone}}` | Customer's WhatsApp phone number | 919876543210 |
| `{{brandName}}` | Brand name from profile | Mintara Bites / Lumina Clinic |
| `{{orderNumber}}` | Order or Appointment Reference Number | MB-8801 / APT-402 |
| `{{itemsSummary}}` | List of items or services booked | 1x Artisanal Paan Mukhwas (300g) |
| `{{totalAmount}}` | Total price in rupees | 249 |
| `{{websiteUrl}}` | Main brand website URL | https://mintarabites.com |
| `{{cartUrl}}` | Cart checkout or online booking link | https://mintarabites.com/cart |
| `{{orderTrackingUrl}}` | Web dashboard for tracking or booking management | https://mintarabites.com/account/orders |
| `{{instagram}}` | Instagram handle | @mintarabites |
| `{{location}}` | Business headquarters or clinic location | Surat, Gujarat, India |
| `{{reason}}` | NDR courier failure reason or reschedule note | Customer unavailable / Time conflict |
| `{{favoriteItem}}` | Frequently ordered product or service | Artisanal Paan Mukhwas (300g) |
| `{{reorderOrBookingUrl}}` | Direct 1-click reorder or rebooking link | Prefilled checkout / booking URL |

---

## ⚡ Instant Business Switching

To test or switch to another business model:
1. **To switch to a Service Practice**:
   ```bash
   cp business/examples/service-business-profile.json business/business-profile.json
   cp business/examples/service-business-knowledge.md business/business-knowledge.md
   ```
2. **To switch back to E-Commerce (Mintara Bites)**:
   ```bash
   cp business/examples/ecommerce-business-profile.json business/business-profile.json
   ```

No backend code changes are required! The API, Background Worker, Support Engine, Marketing Engine, and AI Assistant automatically adapt based on `business/business-profile.json` and `business/business-knowledge.md`.
