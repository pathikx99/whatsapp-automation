-- ================================================================
-- Mintara Bites & WhatsApp Automation - Local Seed Data
-- ================================================================

-- 1. Seed Paan Mukhwas
DO $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Paan Mukhwas',
        'paan-mukhwas',
        'A light, premium, and refreshing paan-flavoured mukhwas crafted without areca nut or supari. Designed for smooth after-meal digestive enjoyment and crisp texture.',
        'Mukhwas & Digestive Treats',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_sticker_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_sticker_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_mukhwas_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_standup_front.png"
        ]'::jsonb,
        true,
        true,
        '{
          "benefits": [
            "100% Supari & Areca Nut Free",
            "Crafted with natural gulkand, fennel & herbs",
            "Refrigerated freshness for crisp texture",
            "Natural long-lasting after-meal breath freshener",
            "Supports smooth post-meal digestion"
          ],
          "primaryKeyword": "paan mukhwas surat",
          "ingredients": [
            "Natural Gulkand – Pure rose petal preserve for cooling refreshment",
            "Fennel Seeds (Variyali) – Premium sweet fennel for aroma and digestion",
            "Dhanadal – Roasted coriander seeds for crisp digestive crunch",
            "Cardamom & Menthol – Natural spices for crisp, lingering fresh breath"
          ]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES 
        (v_product_id, 'paan-mukhwas-150g', 'Original', 150, 199, 149, 100),
        (v_product_id, 'paan-mukhwas-300g', 'Original', 300, 299, 249, 100),
        (v_product_id, 'paan-mukhwas-500g', 'Original', 500, 499, 399, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price, 
        sale_price   = EXCLUDED.sale_price, 
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 2. Seed Seeds Fusion (Regular & Lime)
DO $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Seeds Fusion',
        'seed-fusion',
        'A wholesome blend of six premium seeds — white sesame, pumpkin, watermelon, sunflower, black sesame, and flax seeds. A nutritious and flavorful mouth freshener that supports digestion while satisfying your taste buds. Available in Regular and Lime variants.',
        'Mukhwas & Digestive Treats',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_sticker_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_sticker_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_front.png"
        ]'::jsonb,
        false,
        true,
        '{
          "benefits": [
            "Rich in protein, fiber, and healthy fats",
            "Supports healthy digestion",
            "Naturally packed with vitamins and minerals",
            "Helps keep you feeling full for longer",
            "No artificial flavors or preservatives",
            "A delicious and crunchy post-meal mouth freshener"
          ],
          "primaryKeyword": "seeds fusion mukhwas surat",
          "ingredients": [
            "White Sesame Seeds – Rich in calcium, iron, and antioxidants",
            "Pumpkin Seeds – Great source of protein, magnesium, and zinc",
            "Watermelon Seeds – Loaded with protein, iron, and magnesium",
            "Sunflower Seeds – High in vitamin E and healthy fats",
            "Black Sesame Seeds – Packed with calcium and antioxidants",
            "Flax Seeds – Excellent source of omega-3 and fiber"
          ],
          "variantTypes": ["Regular", "Lime"]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES
        (v_product_id, 'seeds-regular-100g', 'Regular', 100, 199, 149, 100),
        (v_product_id, 'seeds-regular-200g', 'Regular', 200, 349, 249, 100),
        (v_product_id, 'seeds-lime-100g',    'Lime',    100, 199, 149, 100),
        (v_product_id, 'seeds-lime-200g',    'Lime',    200, 349, 249, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price,
        sale_price   = EXCLUDED.sale_price,
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 3. Seed Coconut Crunch
DO $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Coconut Crunch',
        'coconut-crunch',
        'A delightful fusion of chocolate coated till (sesame seeds), premium toasted coconut flakes, and classic dhanadal — crafted for a rich, crunchy, and indulgent mukhwas experience. A perfect harmony of wholesome sweetness and crisp digestive refreshment.',
        'Mukhwas & Digestive Treats',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_sticker_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_sticker_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_front.png"
        ]'::jsonb,
        false,
        true,
        '{
          "benefits": [
            "Rich in wholesome dietary fats from pure coconut and toasted sesame",
            "Natural post-meal digestion support with roasted coriander dhanadal",
            "Naturally satisfying crunch with zero artificial colors or preservatives",
            "A guilt-free sweet digestive treat crafted for the whole family",
            "100% tobacco, supari, and areca nut free"
          ],
          "primaryKeyword": "coconut crunch mukhwas surat",
          "ingredients": [
            "Chocolate Coated Till – Roasted sesame seeds coated in rich chocolate for decadent crunch",
            "Toasted Coconut Flakes – Premium sun-dried coconut for authentic sweetness and crisp texture",
            "Dhanadal – Classic roasted coriander seeds for traditional digestive refreshment",
            "Fennel & Cardamom – Aromatic herbal notes that naturally cleanse the palate",
            "Rock Salt – Subtle mineral seasoning that elevates the flavors"
          ],
          "variantTypes": ["Original"]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES
        (v_product_id, 'coconut-crunch-100g', 'Original', 100, 199, 149, 100),
        (v_product_id, 'coconut-crunch-200g', 'Original', 200, 349, 249, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price,
        sale_price   = EXCLUDED.sale_price,
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 4. Seed Combos & Value Packs
DO $$
DECLARE
    v_trio_id uuid;
    v_family_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Mintara Trio Pack',
        'mintara-trio-pack',
        'The complete Mintara experience in one bundle. Includes our three signature handcrafted blends: Paan Mukhwas (150g), Seeds Fusion (100g), and Coconut Crunch (100g). 100% supari-free, tobacco-free, and preservative-free.',
        'Combos & Gift Packs',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/combos/mintara-trio-pack.webp",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_front.png"
        ]'::jsonb,
        true,
        true,
        '{
          "is_combo": true,
          "benefits": [
            "Taste all 3 signature Mintara flavours in one box",
            "Includes Paan Mukhwas (150g), Seeds Fusion (100g) & Coconut Crunch (100g)",
            "100% free of supari (areca nut), tobacco, and artificial chemicals",
            "Special bundle savings vs purchasing individually"
          ]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_trio_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES 
        (v_trio_id, 'combo-trio-350g', 'Signature Trio', 350, 597, 399, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price, 
        sale_price   = EXCLUDED.sale_price, 
        stock_qty    = EXCLUDED.stock_qty;

    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Family Feast Pack (Free Delivery)',
        'family-feast-pack',
        'Our largest sharing bundle designed for the whole family. Includes full-size packs of Paan Mukhwas (300g), Seeds Fusion (200g), and Coconut Crunch (200g). Automatically unlocks FREE Pan-India express delivery!',
        'Combos & Gift Packs',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/combos/mintara-family-feast-pack.webp",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_front.png"
        ]'::jsonb,
        true,
        true,
        '{
          "is_combo": true,
          "benefits": [
            "Includes FREE Pan-India Express Delivery (Orders ₹699+)",
            "Generous family-sized packs: 300g Paan + 200g Seeds + 200g Coconut",
            "Total 700g of artisanal, 100% supari-free after-meal mukhwas",
            "Massive savings of over ₹290 compared to single MRP"
          ]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_family_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES 
        (v_family_id, 'combo-family-700g', 'Family Trio (Large)', 700, 997, 699, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price, 
        sale_price   = EXCLUDED.sale_price, 
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 5. Seed Promotional Discount Codes
INSERT INTO public.promo_codes (
    code,
    type,
    value,
    min_subtotal,
    max_discount,
    expires_at,
    usage_limit,
    used
) VALUES
    ('MINFREE',    'free_delivery', 0,   0,   NULL, NULL,                     NULL, 0),
    ('WELCOME10',  'percent',       10,  199, 100,  NOW() + INTERVAL '1 year', 1000, 0),
    ('MINTARA50',  'flat',          50,  299, 50,   NOW() + INTERVAL '1 year', 500,  0),
    ('FREESHIP',   'free_delivery', 0,   199, NULL, NOW() + INTERVAL '1 year', 1000, 0),
    ('FESTIVE20',  'percent',       20,  499, 200,  NOW() + INTERVAL '1 year', 500,  0)
ON CONFLICT (code) DO UPDATE SET
    type         = EXCLUDED.type,
    value        = EXCLUDED.value,
    min_subtotal = EXCLUDED.min_subtotal,
    max_discount = EXCLUDED.max_discount,
    expires_at   = EXCLUDED.expires_at,
    usage_limit  = EXCLUDED.usage_limit;
