import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("N8N_API_KEY") || "default-api-key";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function validateApiKey(req: Request): boolean {
  const apiKey = req.headers.get("x-api-key");
  return apiKey === API_KEY;
}

// ============================================
// UTILITY: Calculate next business day
// ============================================
function getNextBusinessDay(date: Date, feriados: string[]): Date {
  const result = new Date(date);
  while (true) {
    const dow = result.getDay(); // 0=Sunday, 6=Saturday
    const dateStr = result.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !feriados.includes(dateStr)) {
      break;
    }
    result.setDate(result.getDate() + 1);
  }
  return result;
}

// ============================================
// UTILITY: Calculate delivery date based on settings
// ============================================
async function calculateDeliveryDate(confirmationTime?: Date): Promise<{ delivery_date: string; delivery_time_slot: string }> {
  const now = confirmationTime || new Date();

  // Fetch settings
  const { data: settingsData } = await supabase
    .from("system_settings")
    .select("*");

  const settingsMap = new Map(settingsData?.map((s: any) => [s.key, s.value]) || []);

  const getValue = (key: string, defaultValue: any) => {
    const val = settingsMap.get(key);
    if (val === undefined || val === null) return defaultValue;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return val; }
    }
    return val;
  };

  const horaLimite: string = getValue('hora_limite_entrega_dia', '12:00');
  const feriados: string[] = getValue('feriados', []);

  // Parse hora limite
  const [limitHour, limitMin] = horaLimite.split(':').map(Number);
  const limitMinutes = limitHour * 60 + (limitMin || 0);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let deliveryDate: Date;
  let timeSlot: string;

  if (currentMinutes <= limitMinutes) {
    // Before or at cutoff: same day if business day
    deliveryDate = new Date(now);
    timeSlot = 'tarde';
  } else {
    // After cutoff: next day
    deliveryDate = new Date(now);
    deliveryDate.setDate(deliveryDate.getDate() + 1);
    timeSlot = 'manha';
  }

  // Advance to next business day (skip weekends and holidays)
  deliveryDate = getNextBusinessDay(deliveryDate, feriados);

  return {
    delivery_date: deliveryDate.toISOString().split('T')[0],
    delivery_time_slot: timeSlot,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!validateApiKey(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized - Invalid API Key" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const resource = pathParts[1];

  try {
    // MCP routes: /api/mcp/health, /api/mcp/tools, /api/mcp/call, /api/mcp/events/publish
    if (resource === "mcp") {
      const mcpRoute = pathParts[2] || "";
      const mcpSubRoute = pathParts[3] || "";
      return handleMcp(req, mcpRoute, mcpSubRoute);
    }

    // Admin routes: /api/admin/validate, /api/admin/permissions, /api/admin/confirm, /api/admin/execute, /api/admin/users
    if (resource === "admin") {
      const adminRoute = pathParts[2] || "";
      return handleAdmin(req, url, adminRoute);
    }

    // Payments routes: /api/payments/create, /api/payments/check, /api/payments/test-pix
    if (resource === "payments") {
      const paymentsRoute = pathParts[2] || "";
      return handlePayments(req, url, paymentsRoute);
    }

    // V2 routes: /api/v2/users, /api/v2/users/create-in-company
    if (resource === "v2") {
      const v2Resource = pathParts[2] || "";
      const v2Action = pathParts[3] || "";
      return handleV2(req, url, v2Resource, v2Action);
    }

    switch (resource) {
      case "products":
        return handleProducts(req, url);
      case "products-low-stock":
        return handleLowStockProducts(req);
      case "customers":
        return handleCustomers(req, url);
      case "orders":
        return handleOrders(req, url);
      case "subscriptions":
        return handleSubscriptions(req, url);
      case "settings":
        return handleSettings(req, url);
      case "deliveries":
        return handleDeliveries(req, url);
      case "financial-summary":
        return handleFinancialSummary(req, url);
      case "conversation-context":
        return handleConversationContext(req, url);
      case "audit-logs":
        return handleAuditLogs(req, url);
      case "validate-document":
        return handleValidateDocument(req, url);
      default:
        return new Response(
          JSON.stringify({ 
            error: "Not Found",
            endpoints: [
              "/api/products",
              "/api/products-low-stock",
              "/api/customers",
              "/api/orders",
              "/api/subscriptions",
              "/api/settings",
              "/api/deliveries",
              "/api/financial-summary?start=YYYY-MM-DD&end=YYYY-MM-DD",
              "/api/conversation-context?phone=55...",
              "/api/audit-logs?entity_type=order&status=error",
              "/api/validate-document?type=cnpj&value=...",
              "/api/validate-document?type=cep&value=...",
              "/api/payments/create",
              "/api/payments/check",
              "/api/payments/test-pix",
              "/api/admin/validate?phone=55...",
              "/api/admin/permissions?phone=55...",
              "/api/admin/confirm",
              "/api/admin/execute",
              "/api/admin/users",
              "/api/mcp/health",
              "/api/mcp/tools",
              "/api/mcp/call",
              "/api/mcp/events/publish",
              "POST /api/v2/users/create-in-company",
              "GET /api/v2/users",
              "PUT /api/v2/users/:id",
              "DELETE /api/v2/users/:id"
            ]
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================
// SETTINGS HANDLER
// ============================================
async function handleSettings(req: Request, url: URL) {
  const key = url.searchParams.get("key");

  switch (req.method) {
    case "GET": {
      let query = supabase.from("system_settings").select("*");
      if (key) query = query.eq("key", key);
      const { data, error } = await query;
      if (error) throw error;
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    case "PUT": {
      if (!key) {
        return new Response(
          JSON.stringify({ error: "Setting key is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const body = await req.json();
      const { data, error } = await supabase
        .from("system_settings")
        .upsert({ key, value: body.value, description: body.description }, { onConflict: 'key' })
        .select()
        .single();
      if (error) throw error;
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    default:
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
  }
}

// ============================================
// PRODUCTS HANDLER
// ============================================
async function handleProducts(req: Request, url: URL) {
  const id = url.searchParams.get("id");
  const code = url.searchParams.get("code");
  const includeInactive = url.searchParams.get("include_inactive") === "true";

  switch (req.method) {
    case "GET": {
      let query = supabase.from("products").select("*");
      if (!includeInactive) query = query.eq("active", true);
      if (id) query = query.eq("id", id);
      if (code) query = query.eq("code", code);
      const { data, error } = await query.order("name");
      if (error) throw error;
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    case "POST": {
      const body = await req.json();
      if (!body.name) {
        return new Response(
          JSON.stringify({ error: "Campo 'name' é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data, error } = await supabase
        .from("products")
        .insert({
          name: body.name,
          description: body.description || null,
          images: body.images || [],
          price_single: body.price_single || body.price || 0,
          price_kit: body.price_kit || 0,
          price_subscription: body.price_subscription || 0,
          stock: body.stock || 0,
          stock_min: body.stock_min || 0,
          stock_max: body.stock_max || 0,
          active: body.active !== false,
        })
        .select()
        .single();
      if (error) throw error;
      console.log(`Product created: ${data.code} - ${data.name}`);
      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    case "PUT": {
      if (!id && !code) {
        return new Response(
          JSON.stringify({ error: "Product ID or code is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const body = await req.json();
      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.images !== undefined) updateData.images = body.images;
      if (body.price_single !== undefined) updateData.price_single = body.price_single;
      if (body.price_kit !== undefined) updateData.price_kit = body.price_kit;
      if (body.price_subscription !== undefined) updateData.price_subscription = body.price_subscription;
      if (body.stock !== undefined) updateData.stock = body.stock;
      if (body.stock_min !== undefined) updateData.stock_min = body.stock_min;
      if (body.stock_max !== undefined) updateData.stock_max = body.stock_max;
      if (body.active !== undefined) updateData.active = body.active;
      let query = supabase.from("products").update(updateData);
      if (id) query = query.eq("id", id);
      else if (code) query = query.eq("code", code);
      const { data, error } = await query.select().single();
      if (error) throw error;
      console.log(`Product updated: ${data.code} - ${data.name}`);
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    case "DELETE": {
      if (!id && !code) {
        return new Response(
          JSON.stringify({ error: "Product ID or code is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let query = supabase.from("products").delete();
      if (id) query = query.eq("id", id);
      else if (code) query = query.eq("code", code);
      const { error } = await query;
      if (error) throw error;
      console.log(`Product deleted: ${id || code}`);
      return new Response(
        JSON.stringify({ success: true, message: "Product deleted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    default:
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
  }
}

// ============================================
// LOW STOCK PRODUCTS HANDLER
// ============================================
async function handleLowStockProducts(req: Request) {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true);
  if (error) throw error;
  const lowStockProducts = (data || []).filter((p: any) => p.stock <= p.stock_min && p.stock_min > 0);
  console.log(`Found ${lowStockProducts.length} products with low stock`);
  return new Response(
    JSON.stringify({ 
      success: true, 
      count: lowStockProducts.length,
      data: lowStockProducts.map((p: any) => ({
        id: p.id, code: p.code, name: p.name, stock: p.stock,
        stock_min: p.stock_min, stock_max: p.stock_max, deficit: p.stock_min - p.stock,
      }))
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ============================================
// CUSTOMERS HANDLER
// ============================================
async function handleCustomers(req: Request, url: URL) {
  const id = url.searchParams.get("id");
  const phone = url.searchParams.get("phone");
  const cpf = url.searchParams.get("cpf");
  const cnpj = url.searchParams.get("cnpj");
  const cpf_cnpj = url.searchParams.get("cpf_cnpj") || cpf || cnpj;

  switch (req.method) {
    case "GET": {
      let query = supabase.from("customers").select("*");
      if (id) query = query.eq("id", id);
      if (phone) query = query.in("phone", phoneVariants(phone));
      if (cpf_cnpj) query = query.eq("cpf_cnpj", cpf_cnpj.replace(/\D/g, ""));
      const { data, error } = await query.order("name");
      if (error) throw error;
      console.log(`Customers query: found ${data?.length || 0} results`);
      return new Response(
        JSON.stringify({ success: true, count: data?.length || 0, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    case "POST": {
      const body = await req.json();
      if (!body.cpf_cnpj) return new Response(JSON.stringify({ error: "Campo 'cpf_cnpj' é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!body.name) return new Response(JSON.stringify({ error: "Campo 'name' é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!body.phone) return new Response(JSON.stringify({ error: "Campo 'phone' é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const cleanDoc = body.cpf_cnpj.replace(/\D/g, "");
      const cleanPhone = body.phone.replace(/\D/g, "");
      const customerType = cleanDoc.length === 14 ? "PJ" : "PF";
      
      const { data: existing } = await supabase.from("customers").select("*").eq("cpf_cnpj", cleanDoc).maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ success: false, error: "Documento já cadastrado", message: "Já existe um cliente com este CPF/CNPJ", existing_customer: existing }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: body.name, customer_type: body.customer_type || customerType,
          cpf_cnpj: cleanDoc, email: body.email || null, phone: cleanPhone,
          street: body.street || null, number: body.number || null,
          complement: body.complement || null, neighborhood: body.neighborhood || null,
          city: body.city || null, state: body.state || null,
          zip_code: body.zip_code?.replace(/\D/g, "") || null,
          trading_name: body.trading_name || null,
          responsible_name: body.responsible_name || null,
          responsible_contact: body.responsible_contact || null,
          validated: body.validated || false, validation_data: body.validation_data || null,
        })
        .select().single();
      if (error) throw error;
      console.log(`Customer created: ${data.name} (${data.cpf_cnpj})`);
      return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    case "PUT": {
      if (!id && !cpf_cnpj) {
        return new Response(JSON.stringify({ error: "Customer ID or cpf_cnpj is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const body = await req.json();
      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.customer_type !== undefined) updateData.customer_type = body.customer_type;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.phone !== undefined) updateData.phone = body.phone.replace(/\D/g, "");
      if (body.street !== undefined) updateData.street = body.street;
      if (body.number !== undefined) updateData.number = body.number;
      if (body.complement !== undefined) updateData.complement = body.complement;
      if (body.neighborhood !== undefined) updateData.neighborhood = body.neighborhood;
      if (body.city !== undefined) updateData.city = body.city;
      if (body.state !== undefined) updateData.state = body.state;
      if (body.zip_code !== undefined) updateData.zip_code = body.zip_code?.replace(/\D/g, "");
      if (body.trading_name !== undefined) updateData.trading_name = body.trading_name;
      if (body.responsible_name !== undefined) updateData.responsible_name = body.responsible_name;
      if (body.responsible_contact !== undefined) updateData.responsible_contact = body.responsible_contact;
      if (body.validated !== undefined) updateData.validated = body.validated;
      if (body.validation_data !== undefined) updateData.validation_data = body.validation_data;
      let query = supabase.from("customers").update(updateData);
      if (id) query = query.eq("id", id);
      else if (cpf_cnpj) query = query.eq("cpf_cnpj", cpf_cnpj.replace(/\D/g, ""));
      const { data, error } = await query.select().single();
      if (error) throw error;
      console.log(`Customer updated: ${data.name} (${data.cpf_cnpj})`);
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    case "DELETE": {
      if (!id && !cpf_cnpj) {
        return new Response(JSON.stringify({ error: "Customer ID or cpf_cnpj is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let query = supabase.from("customers").delete();
      if (id) query = query.eq("id", id);
      else if (cpf_cnpj) query = query.eq("cpf_cnpj", cpf_cnpj.replace(/\D/g, ""));
      const { error } = await query;
      if (error) throw error;
      console.log(`Customer deleted: ${id || cpf_cnpj}`);
      return new Response(JSON.stringify({ success: true, message: "Customer deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    default:
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ============================================
// ORDERS HANDLER (with fixed delivery scheduling)
// ============================================
async function handleOrders(req: Request, url: URL) {
  const id = url.searchParams.get("id");
  const customer_id = url.searchParams.get("customer_id");
  const order_number = url.searchParams.get("order_number");

  switch (req.method) {
    case "GET": {
      let query = supabase.from("orders").select(`*, customer:customers(*), items:order_items(*, product:products(*))`);
      if (id) query = query.eq("id", id);
      if (customer_id) query = query.eq("customer_id", customer_id);
      if (order_number) query = query.eq("order_number", order_number);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    case "POST": {
      const body = await req.json();
      
      const { data: settingData } = await supabase.from("system_settings").select("value").eq("key", "min_qtd_kit_preco").maybeSingle();
      const kitMinQuantity = settingData?.value ? (typeof settingData.value === 'string' ? parseInt(settingData.value) : settingData.value) : 3;

      const totalQuantity = body.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || 0;
      const useKitPrice = totalQuantity >= kitMinQuantity;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: body.customer_id,
          payment_method: body.payment_method,
          notes: body.notes,
          total_amount: body.total_amount || 0,
        })
        .select().single();
      if (orderError) throw orderError;

      if (body.items && body.items.length > 0) {
        const productIds = body.items.map((item: any) => item.product_id);
        const { data: products } = await supabase.from("products").select("id, price_single, price_kit").in("id", productIds);
        const productMap = new Map(products?.map((p: any) => [p.id, p]) || []);

        const items = body.items.map((item: any) => {
          const product = productMap.get(item.product_id);
          const unitPrice = item.unit_price || (useKitPrice && product?.price_kit ? product.price_kit : product?.price_single) || 0;
          return {
            order_id: order.id, product_id: item.product_id,
            quantity: item.quantity, unit_price: unitPrice,
            total_price: unitPrice * item.quantity,
          };
        });

        const { error: itemsError } = await supabase.from("order_items").insert(items);
        if (itemsError) throw itemsError;

        const total = items.reduce((sum: number, item: any) => sum + item.total_price, 0);
        await supabase.from("orders").update({ total_amount: total }).eq("id", order.id);
      }

      const { data: completeOrder } = await supabase.from("orders")
        .select(`*, customer:customers(*), items:order_items(*, product:products(*))`)
        .eq("id", order.id).single();

      return new Response(
        JSON.stringify({ success: true, data: completeOrder, pricing: { kit_min_quantity: kitMinQuantity, total_items: totalQuantity, using_kit_price: useKitPrice } }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    case "PUT": {
      if (!id && !order_number) {
        return new Response(JSON.stringify({ error: "Order ID or order_number is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const body = await req.json();
      const updateData: Record<string, unknown> = {};
      if (body.payment_status !== undefined) updateData.payment_status = body.payment_status;
      if (body.delivery_status !== undefined) updateData.delivery_status = body.delivery_status;
      if (body.payment_method !== undefined) updateData.payment_method = body.payment_method;
      if (body.stripe_payment_intent_id !== undefined) updateData.stripe_payment_intent_id = body.stripe_payment_intent_id;
      if (body.pix_transaction_id !== undefined) updateData.pix_transaction_id = body.pix_transaction_id;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.delivery_date !== undefined) updateData.delivery_date = body.delivery_date;
      if (body.delivery_time_slot !== undefined) updateData.delivery_time_slot = body.delivery_time_slot;

      // FIXED: Calculate delivery date based on PAYMENT CONFIRMATION time + settings
      if (body.payment_status === 'confirmado') {
        const delivery = await calculateDeliveryDate(new Date());
        updateData.delivery_date = delivery.delivery_date;
        // Only set time_slot if not already set by client or body
        if (!body.delivery_time_slot) {
          updateData.delivery_time_slot = delivery.delivery_time_slot;
        }
        updateData.payment_confirmed_at = new Date().toISOString();
      }

      let query = supabase.from("orders").update(updateData);
      if (id) query = query.eq("id", id);
      else if (order_number) query = query.eq("order_number", order_number);

      const { data, error } = await query.select().single();
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    case "DELETE": {
      if (!id && !order_number) {
        return new Response(JSON.stringify({ error: "Order ID or order_number is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const body = await req.json().catch(() => ({}));
      let query = supabase.from("orders").update({
        payment_status: 'cancelado', delivery_status: 'cancelado',
        cancelled_at: new Date().toISOString(), cancellation_reason: body.reason || null,
      });
      if (id) query = query.eq("id", id);
      else if (order_number) query = query.eq("order_number", order_number);
      const { data, error } = await query.select().single();
      if (error) throw error;
      console.log(`Order cancelled: ${data.order_number}`);
      return new Response(JSON.stringify({ success: true, message: "Order cancelled", data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    default:
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ============================================
// SUBSCRIPTIONS HANDLER (with PF/PJ rules, emergency)
// ============================================
async function handleSubscriptions(req: Request, url: URL) {
  const id = url.searchParams.get("id");
  const customer_id = url.searchParams.get("customer_id");
  const subscription_number = url.searchParams.get("subscription_number");

  switch (req.method) {
    case "GET": {
      let query = supabase.from("subscriptions").select(`*, customer:customers(*), items:subscription_items(*, product:products(*))`);
      if (id) query = query.eq("id", id);
      if (customer_id) query = query.eq("customer_id", customer_id);
      if (subscription_number) query = query.eq("subscription_number", subscription_number);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    case "POST": {
      const body = await req.json();
      
      // Fetch settings for validation
      const { data: settingsData } = await supabase.from("system_settings").select("*");
      const settingsMap = new Map(settingsData?.map((s: any) => [s.key, s.value]) || []);
      
      const getValue = (key: string, defaultValue: any) => {
        const val = settingsMap.get(key);
        if (val === undefined || val === null) return defaultValue;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return val; }
        }
        return val;
      };

      // Determine customer type
      let customerType = 'PF';
      if (body.customer_id) {
        const { data: customer } = await supabase.from("customers").select("customer_type").eq("id", body.customer_id).single();
        if (customer) customerType = customer.customer_type;
      }

      const oldMinItens = getValue('min_itens_assinatura', 1);
      const minItens = customerType === 'PJ' 
        ? getValue('min_itens_assinatura_pj', oldMinItens)
        : getValue('min_itens_assinatura_pf', oldMinItens);

      // Validate minimum items
      const totalItems = body.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || 0;
      if (totalItems < minItens) {
        return new Response(
          JSON.stringify({ error: `Mínimo de ${minItens} item(ns) necessário para ${customerType}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check emergency PJ
      const isEmergency = body.is_emergency === true;
      if (isEmergency && customerType !== 'PJ') {
        return new Response(
          JSON.stringify({ error: "Pedido emergencial só é permitido para clientes PJ" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const entregas = getValue('entregas_por_recorrencia', { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 });
      const frequency = isEmergency ? null : (body.frequency || 'semanal');
      const monthlyDeliveries = isEmergency ? 1 : (entregas[frequency!] || 4);

      const perDeliveryTotal = body.items?.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0) || 0;
      const monthlyTotal = isEmergency ? perDeliveryTotal : perDeliveryTotal * monthlyDeliveries;

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          customer_id: body.customer_id,
          delivery_weekday: body.delivery_weekday,
          delivery_time_slot: body.delivery_time_slot || "manha",
          frequency: frequency,
          notes: body.notes,
          total_amount: monthlyTotal,
          is_emergency: isEmergency,
          delivery_weekdays: body.delivery_weekdays || null,
        })
        .select().single();
      if (subError) throw subError;

      if (body.items && body.items.length > 0) {
        const items = body.items.map((item: any) => ({
          subscription_id: subscription.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          reserved_stock: item.quantity,
        }));
        const { error: itemsError } = await supabase.from("subscription_items").insert(items);
        if (itemsError) throw itemsError;
      }

      const { data: completeSub } = await supabase.from("subscriptions")
        .select(`*, customer:customers(*), items:subscription_items(*, product:products(*))`)
        .eq("id", subscription.id).single();

      return new Response(
        JSON.stringify({ 
          success: true, data: completeSub,
          pricing: {
            customer_type: customerType,
            min_items: minItens,
            is_emergency: isEmergency,
            frequency, monthly_deliveries: monthlyDeliveries,
            per_delivery_total: perDeliveryTotal, monthly_total: monthlyTotal
          }
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    case "PUT": {
      if (!id && !subscription_number) {
        return new Response(JSON.stringify({ error: "Subscription ID or subscription_number is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const body = await req.json();
      const updateData: Record<string, unknown> = {};
      if (body.status !== undefined) updateData.status = body.status;
      if (body.delivery_weekday !== undefined) updateData.delivery_weekday = body.delivery_weekday;
      if (body.delivery_time_slot !== undefined) updateData.delivery_time_slot = body.delivery_time_slot;
      if (body.frequency !== undefined) updateData.frequency = body.frequency;
      if (body.stripe_subscription_id !== undefined) updateData.stripe_subscription_id = body.stripe_subscription_id;
      if (body.next_delivery_date !== undefined) updateData.next_delivery_date = body.next_delivery_date;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.total_amount !== undefined) updateData.total_amount = body.total_amount;
      if (body.delivery_weekdays !== undefined) updateData.delivery_weekdays = body.delivery_weekdays;

      let query = supabase.from("subscriptions").update(updateData);
      if (id) query = query.eq("id", id);
      else if (subscription_number) query = query.eq("subscription_number", subscription_number);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    default:
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ============================================
// DELIVERIES HANDLER (daily report for n8n)
// ============================================
async function handleDeliveries(req: Request, url: URL) {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const dateParam = url.searchParams.get("date") || new Date().toISOString().split('T')[0];

  // Fetch settings
  const { data: settingsData } = await supabase.from("system_settings").select("*");
  const settingsMap = new Map(settingsData?.map((s: any) => [s.key, s.value]) || []);
  const getValue = (key: string, defaultValue: any) => {
    const val = settingsMap.get(key);
    if (val == null) return defaultValue;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
    return val;
  };

  const diasFuncionamento: string[] = getValue('dias_funcionamento', ['segunda','terca','quarta','quinta','sexta']);
  const feriados: string[] = getValue('feriados', []);

  // Check if working day
  const dateObj = new Date(dateParam + 'T12:00:00');
  const weekdayMap: Record<number, string> = { 0:'domingo',1:'segunda',2:'terca',3:'quarta',4:'quinta',5:'sexta',6:'sabado' };
  const dayOfWeek = weekdayMap[dateObj.getDay()];
  
  if (!diasFuncionamento.includes(dayOfWeek) || feriados.includes(dateParam)) {
    return new Response(
      JSON.stringify({ success: true, date: dateParam, working_day: false, message: "Sem operação nesta data", deliveries: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Fetch orders
  const { data: orders } = await supabase
    .from("orders")
    .select("*, customer:customers(*), items:order_items(*, product:products(*))")
    .eq("delivery_date", dateParam)
    .neq("payment_status", "cancelado");

  // Fetch subscription deliveries
  const { data: subDeliveries } = await supabase
    .from("subscription_deliveries")
    .select("*, subscription:subscriptions(*, customer:customers(*), items:subscription_items(*, product:products(*)))")
    .eq("delivery_date", dateParam);

  const buildAddress = (c: any) => {
    if (!c) return '';
    return [c.street, c.number, c.complement, c.neighborhood, c.city, c.state, c.zip_code ? `CEP: ${c.zip_code}` : null].filter(Boolean).join(', ');
  };

  // Build unified list
  const deliveries: any[] = [];

  for (const o of orders || []) {
    deliveries.push({
      type: 'avulso',
      order_number: o.order_number,
      customer: o.customer?.name || '',
      customer_cpf_cnpj: o.customer?.cpf_cnpj || '',
      address: buildAddress(o.customer),
      time_slot: o.delivery_time_slot || 'manha',
      delivery_status: o.delivery_status,
      products: (o.items || []).map((i: any) => ({ name: i.product?.name, quantity: i.quantity })),
      total_quantity: (o.items || []).reduce((s: number, i: any) => s + i.quantity, 0),
      total_amount: o.total_amount,
      notes: o.notes,
    });
  }

  for (const sd of subDeliveries || []) {
    const sub = sd.subscription as any;
    if (!sub) continue;
    deliveries.push({
      type: sub.is_emergency ? 'emergencial' : 'assinatura',
      subscription_number: sub.subscription_number,
      customer: sub.customer?.name || '',
      customer_cpf_cnpj: sub.customer?.cpf_cnpj || '',
      address: buildAddress(sub.customer),
      time_slot: sub.delivery_time_slot || 'manha',
      delivery_status: sd.delivery_status,
      products: (sub.items || []).map((i: any) => ({ name: i.product?.name, quantity: i.quantity })),
      total_quantity: (sub.items || []).reduce((s: number, i: any) => s + i.quantity, 0),
      total_amount: sd.total_amount,
      notes: sd.notes,
    });
  }

  // Group by time slot
  const grouped: Record<string, any[]> = {};
  for (const d of deliveries) {
    const slot = d.time_slot || 'outro';
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot].push(d);
  }

  // Summary
  const totalProducts: Record<string, number> = {};
  for (const d of deliveries) {
    for (const p of d.products) {
      totalProducts[p.name] = (totalProducts[p.name] || 0) + p.quantity;
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      date: dateParam,
      working_day: true,
      total_deliveries: deliveries.length,
      summary: {
        total_products: Object.entries(totalProducts).map(([name, qty]) => ({ name, quantity: qty })),
        by_type: {
          avulso: deliveries.filter(d => d.type === 'avulso').length,
          assinatura: deliveries.filter(d => d.type === 'assinatura').length,
          emergencial: deliveries.filter(d => d.type === 'emergencial').length,
        }
      },
      by_time_slot: grouped,
      deliveries,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ============================================
// MCP TOOLS REGISTRY
// ============================================
const MCP_TOOLS_REGISTRY = [
  { name: "lovable.customers.getByPhone", description: "Buscar cliente por telefone", args: { phone: "string (obrigatório)" } },
  { name: "lovable.customers.getByCpfCnpj", description: "Buscar cliente por CPF/CNPJ", args: { cpf_cnpj: "string (obrigatório)" } },
  { name: "lovable.customers.create", description: "Criar novo cliente", args: { payload: "object (name, cpf_cnpj, phone obrigatórios)" } },
  { name: "lovable.customers.update", description: "Atualizar cliente", args: { id: "string?", cpf_cnpj: "string?", payload: "object" } },
  { name: "lovable.products.list", description: "Listar produtos", args: { include_inactive: "boolean?" } },
  { name: "lovable.products.getByCode", description: "Buscar produto por código", args: { code: "string (obrigatório)" } },
  { name: "lovable.products.create", description: "Criar produto", args: { payload: "object (name obrigatório)" } },
  { name: "lovable.products.update", description: "Atualizar produto", args: { id: "string?", code: "string?", payload: "object" } },
  { name: "lovable.products.lowStock", description: "Produtos com estoque baixo", args: {} },
  { name: "lovable.orders.create", description: "Criar pedido", args: { payload: "object" } },
  { name: "lovable.orders.get", description: "Consultar pedidos", args: { id: "string?", order_number: "string?", customer_id: "string?" } },
  { name: "lovable.orders.cancel", description: "Cancelar pedido", args: { id: "string?", order_number: "string?", reason: "string (obrigatório)" } },
  { name: "lovable.deliveries.getByDate", description: "Entregas por data", args: { date: "string YYYY-MM-DD (obrigatório)" } },
  { name: "lovable.subscriptions.create", description: "Criar assinatura", args: { payload: "object" } },
  { name: "lovable.subscriptions.get", description: "Consultar assinaturas", args: { id: "string?", subscription_number: "string?", customer_id: "string?" } },
  { name: "lovable.subscriptions.update", description: "Atualizar assinatura", args: { id: "string?", subscription_number: "string?", payload: "object" } },
  { name: "lovable.subscriptions.cancel", description: "Cancelar assinatura", args: { id: "string?", subscription_number: "string?", reason: "string (obrigatório)" } },
  { name: "lovable.settings.get", description: "Consultar configurações", args: { key: "string?" } },
  { name: "lovable.settings.set", description: "Definir configuração", args: { key: "string (obrigatório)", value: "any", description: "string?" } },
];

// In-memory rate limiter for MCP
const mcpRateBuckets = new Map<string, { count: number; resetAt: number }>();
function mcpCheckRateLimit(ip: string, limit: number): boolean {
  const now = Date.now();
  const bucket = mcpRateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    mcpRateBuckets.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

function getMcpClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// ============================================
// MCP HANDLER (all routes under /api/mcp/*)
// ============================================
async function handleMcp(req: Request, route: string, subRoute: string) {
  const ip = getMcpClientIp(req);

  // Health doesn't require mcp_enabled check (to allow diagnostics)
  if (route === "health") {
    const { data: enabledRow } = await supabase.from("system_settings").select("value").eq("key", "mcp_enabled").maybeSingle();
    let mcpEnabled = true;
    if (enabledRow) {
      const v = enabledRow.value;
      mcpEnabled = v === true || v === "true";
    }
    return new Response(
      JSON.stringify({ ok: mcpEnabled, timestamp: new Date().toISOString(), version: "mcp-v1" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Fetch MCP settings
  const { data: mcpSettings } = await supabase.from("system_settings").select("key, value")
    .in("key", ["mcp_enabled", "mcp_allowlist_tools", "mcp_rate_limit_per_minute"]);
  const settingsMap = new Map<string, any>();
  for (const row of mcpSettings || []) {
    let v = row.value;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch {} }
    settingsMap.set(row.key, v);
  }

  const mcpEnabled = settingsMap.get("mcp_enabled");
  if (mcpEnabled === false || mcpEnabled === "false") {
    return new Response(
      JSON.stringify({ ok: false, error: "MCP desativado" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Rate limit
  const rateLimit = Number(settingsMap.get("mcp_rate_limit_per_minute")) || 60;
  if (!mcpCheckRateLimit(ip, rateLimit)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Rate limit excedido" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // GET /api/mcp/tools
  if (route === "tools" && req.method === "GET") {
    const allowlist: string[] = settingsMap.get("mcp_allowlist_tools") || MCP_TOOLS_REGISTRY.map(t => t.name);
    const filtered = MCP_TOOLS_REGISTRY.filter(t => allowlist.includes(t.name));
    return new Response(
      JSON.stringify({ ok: true, tools: filtered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // POST /api/mcp/call
  if (route === "call" && req.method === "POST") {
    const body = await req.json();
    const { tool, args = {}, trace_id } = body;
    const traceId = trace_id || crypto.randomUUID();

    if (!tool) {
      return new Response(
        JSON.stringify({ ok: false, error: "Campo 'tool' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check allowlist
    const allowlist: string[] = settingsMap.get("mcp_allowlist_tools") || MCP_TOOLS_REGISTRY.map(t => t.name);
    if (!allowlist.includes(tool)) {
      await supabase.from("mcp_audit_logs").insert({
        env: "prod", actor: "n8n", tool, trace_id: traceId, request: body, response: null, ok: false, error_message: "Tool não permitida na allowlist", ip,
      });
      return new Response(
        JSON.stringify({ ok: false, error: `Tool '${tool}' não está na allowlist` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await executeMcpTool(tool, args);
      await supabase.from("mcp_audit_logs").insert({
        env: "prod", actor: "n8n", tool, trace_id: traceId, request: body, response: result, ok: true, error_message: null, ip,
      });
      return new Response(
        JSON.stringify({ ok: true, trace_id: traceId, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      await supabase.from("mcp_audit_logs").insert({
        env: "prod", actor: "n8n", tool, trace_id: traceId, request: body, response: null, ok: false, error_message: err.message, ip,
      });
      return new Response(
        JSON.stringify({ ok: false, trace_id: traceId, error: err.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // POST /api/mcp/events/publish
  if (route === "events" && subRoute === "publish" && req.method === "POST") {
    const body = await req.json();
    const { type, payload, trace_id } = body;
    const traceId = trace_id || crypto.randomUUID();

    await supabase.from("mcp_audit_logs").insert({
      env: "prod", actor: "n8n", tool: `event:${type || "unknown"}`, trace_id: traceId, request: body, response: { received: true }, ok: true, error_message: null, ip,
    });

    return new Response(
      JSON.stringify({ ok: true, trace_id: traceId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ error: "MCP route not found", available: ["/api/mcp/health", "/api/mcp/tools", "/api/mcp/call", "/api/mcp/events/publish"] }),
    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ============================================
// MCP TOOL EXECUTOR (direct DB access, no HTTP loop)
// ============================================
async function executeMcpTool(toolName: string, args: any): Promise<any> {
  switch (toolName) {
    case "lovable.products.list": {
      let query = supabase.from("products").select("*");
      if (!args.include_inactive) query = query.eq("active", true);
      const { data, error } = await query.order("name");
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.products.getByCode": {
      const { data, error } = await supabase.from("products").select("*").eq("code", args.code);
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.products.create": {
      const p = args.payload || args;
      const { data, error } = await supabase.from("products").insert({ name: p.name, description: p.description || null, images: p.images || [], price_single: p.price_single || 0, price_kit: p.price_kit || 0, price_subscription: p.price_subscription || 0, stock: p.stock || 0, stock_min: p.stock_min || 0, stock_max: p.stock_max || 0, active: p.active !== false }).select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.products.update": {
      const p = args.payload || {};
      let query = supabase.from("products").update(p);
      if (args.id) query = query.eq("id", args.id);
      else if (args.code) query = query.eq("code", args.code);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.products.lowStock": {
      const { data, error } = await supabase.from("products").select("*").eq("active", true);
      if (error) throw error;
      const low = (data || []).filter((p: any) => p.stock <= p.stock_min && p.stock_min > 0);
      return { success: true, count: low.length, data: low };
    }
    case "lovable.customers.getByPhone": {
      const { data, error } = await supabase.from("customers").select("*").eq("phone", (args.phone || "").replace(/\D/g, ""));
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.customers.getByCpfCnpj": {
      const { data, error } = await supabase.from("customers").select("*").eq("cpf_cnpj", (args.cpf_cnpj || "").replace(/\D/g, ""));
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.customers.create": {
      const c = args.payload || args;
      const { data, error } = await supabase.from("customers").insert({ name: c.name, cpf_cnpj: (c.cpf_cnpj || "").replace(/\D/g, ""), phone: (c.phone || "").replace(/\D/g, ""), email: c.email || null, customer_type: c.customer_type || ((c.cpf_cnpj || "").replace(/\D/g, "").length === 14 ? "PJ" : "PF"), street: c.street || null, number: c.number || null, complement: c.complement || null, neighborhood: c.neighborhood || null, city: c.city || null, state: c.state || null, zip_code: c.zip_code || null }).select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.customers.update": {
      const c = args.payload || {};
      let query = supabase.from("customers").update(c);
      if (args.id) query = query.eq("id", args.id);
      else if (args.cpf_cnpj) query = query.eq("cpf_cnpj", (args.cpf_cnpj || "").replace(/\D/g, ""));
      const { data, error } = await query.select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.orders.get": {
      let query = supabase.from("orders").select("*, customer:customers(*), items:order_items(*, product:products(*))");
      if (args.id) query = query.eq("id", args.id);
      if (args.order_number) query = query.eq("order_number", args.order_number);
      if (args.customer_id) query = query.eq("customer_id", args.customer_id);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.orders.create": {
      const o = args.payload || args;
      const { data, error } = await supabase.from("orders").insert({ customer_id: o.customer_id, payment_method: o.payment_method, notes: o.notes, total_amount: o.total_amount || 0 }).select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.orders.cancel": {
      let query = supabase.from("orders").update({ payment_status: "cancelado", delivery_status: "cancelado", cancelled_at: new Date().toISOString(), cancellation_reason: args.reason || null });
      if (args.id) query = query.eq("id", args.id);
      else if (args.order_number) query = query.eq("order_number", args.order_number);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.deliveries.getByDate": {
      const date = args.date || new Date().toISOString().split("T")[0];
      const { data: orders } = await supabase.from("orders").select("*, customer:customers(*), items:order_items(*, product:products(*))").eq("delivery_date", date).neq("payment_status", "cancelado");
      const { data: subDel } = await supabase.from("subscription_deliveries").select("*, subscription:subscriptions(*, customer:customers(*), items:subscription_items(*, product:products(*)))").eq("delivery_date", date);
      return { success: true, orders: orders || [], subscription_deliveries: subDel || [] };
    }
    case "lovable.subscriptions.get": {
      let query = supabase.from("subscriptions").select("*, customer:customers(*), items:subscription_items(*, product:products(*))");
      if (args.id) query = query.eq("id", args.id);
      if (args.subscription_number) query = query.eq("subscription_number", args.subscription_number);
      if (args.customer_id) query = query.eq("customer_id", args.customer_id);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.subscriptions.create": {
      const s = args.payload || args;
      const { data, error } = await supabase.from("subscriptions").insert({ customer_id: s.customer_id, delivery_weekday: s.delivery_weekday, delivery_time_slot: s.delivery_time_slot || "manha", frequency: s.frequency, notes: s.notes, total_amount: s.total_amount || 0, is_emergency: s.is_emergency || false, delivery_weekdays: s.delivery_weekdays || null }).select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.subscriptions.update": {
      const s = args.payload || {};
      let query = supabase.from("subscriptions").update(s);
      if (args.id) query = query.eq("id", args.id);
      else if (args.subscription_number) query = query.eq("subscription_number", args.subscription_number);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.subscriptions.cancel": {
      let query = supabase.from("subscriptions").update({ status: "cancelada", notes: args.reason || "Cancelada via MCP" });
      if (args.id) query = query.eq("id", args.id);
      else if (args.subscription_number) query = query.eq("subscription_number", args.subscription_number);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.settings.get": {
      let query = supabase.from("system_settings").select("*");
      if (args.key) query = query.eq("key", args.key);
      const { data, error } = await query;
      if (error) throw error;
      return { success: true, data };
    }
    case "lovable.settings.set": {
      const { data, error } = await supabase.from("system_settings").upsert({ key: args.key, value: args.value, description: args.description || null }, { onConflict: "key" }).select().single();
      if (error) throw error;
      return { success: true, data };
    }
    default:
      throw new Error(`Tool desconhecida: ${toolName}`);
  }
}

// ============================================
// FINANCIAL SUMMARY HANDLER
// GET /api/financial-summary?start=YYYY-MM-DD&end=YYYY-MM-DD
// ============================================
async function handleFinancialSummary(req: Request, url: URL) {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const start = url.searchParams.get("start") || new Date(new Date().setDate(1)).toISOString().split('T')[0];
  const end = url.searchParams.get("end") || new Date().toISOString().split('T')[0];

  const [ordersRes, subsRes] = await Promise.all([
    supabase.from("orders").select("id, total_amount, payment_status, delivery_status, created_at")
      .gte("created_at", `${start}T00:00:00`)
      .lte("created_at", `${end}T23:59:59`),
    supabase.from("subscriptions").select("id, total_amount, status, frequency, is_emergency, created_at"),
  ]);

  const orders = ordersRes.data || [];
  const allSubs = subsRes.data || [];

  const confirmedOrders = orders.filter((o: any) => o.payment_status === 'confirmado');
  const canceledOrders = orders.filter((o: any) => o.payment_status === 'cancelado');
  const activeSubs = allSubs.filter((s: any) => s.status === 'ativa');
  const pausedSubs = allSubs.filter((s: any) => s.status === 'pausada');
  const canceledSubs = allSubs.filter((s: any) => s.status === 'cancelada');
  const emergencySubs = activeSubs.filter((s: any) => s.is_emergency);

  const totalOrderRevenue = confirmedOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
  const totalSubRevenue = activeSubs.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

  const recurringProjection = activeSubs.reduce((sum: number, s: any) => {
    const freqMultiplier: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
    const multiplier = freqMultiplier[s.frequency] || 4;
    return sum + (Number(s.total_amount) * multiplier);
  }, 0);

  const churnRate = allSubs.length > 0
    ? Math.round((canceledSubs.length / allSubs.length) * 10000) / 100
    : 0;

  return new Response(JSON.stringify({
    success: true,
    period: { start, end },
    data: {
      total_orders: orders.length,
      confirmed_orders: confirmedOrders.length,
      canceled_orders: canceledOrders.length,
      total_order_revenue: Math.round(totalOrderRevenue * 100) / 100,
      total_subscriptions: allSubs.length,
      active_subscriptions: activeSubs.length,
      paused_subscriptions: pausedSubs.length,
      canceled_subscriptions: canceledSubs.length,
      total_emergency: emergencySubs.length,
      churn_rate: churnRate,
      recurring_projection: Math.round(recurringProjection * 100) / 100,
      total_revenue: Math.round((totalOrderRevenue + totalSubRevenue) * 100) / 100,
    }
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================
// CONVERSATION CONTEXT HANDLER (memória n8n)
// GET /api/conversation-context?phone=55...
// POST /api/conversation-context (body: { phone, last_intent, ... })
// ============================================
async function handleConversationContext(req: Request, url: URL) {
  const phone = url.searchParams.get("phone");

  switch (req.method) {
    case "GET": {
      if (!phone) {
        return new Response(JSON.stringify({ error: "Parâmetro 'phone' é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await supabase
        .from("conversation_context")
        .select("*")
        .in("phone", phoneVariants(phone))
        .maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    case "POST": {
      const body = await req.json();
      if (!body.phone) return new Response(JSON.stringify({ error: "Campo 'phone' é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const cleanPhone = body.phone.replace(/\D/g, "");
      const upsertData: Record<string, any> = {
        phone: cleanPhone,
        last_interaction_at: new Date().toISOString(),
      };
      if (body.last_intent !== undefined) upsertData.last_intent = body.last_intent;
      if (body.open_order_id !== undefined) upsertData.open_order_id = body.open_order_id || null;
      if (body.open_subscription_id !== undefined) upsertData.open_subscription_id = body.open_subscription_id || null;
      if (body.abandoned_cart !== undefined) upsertData.abandoned_cart = body.abandoned_cart;

      const { data, error } = await supabase
        .from("conversation_context")
        .upsert(upsertData, { onConflict: "phone" })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    default:
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ============================================
// AUDIT LOGS HANDLER (leitura de system_audit_logs)
// GET /api/audit-logs?entity_type=order&status=error&limit=50
// ============================================
async function handleAuditLogs(req: Request, url: URL) {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const entity_type = url.searchParams.get("entity_type");
  const entity_id = url.searchParams.get("entity_id");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  let query = supabase.from("system_audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (entity_type) query = query.eq("entity_type", entity_type);
  if (entity_id) query = query.eq("entity_id", entity_id);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  return new Response(JSON.stringify({ success: true, count: data?.length || 0, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================
// ADMIN HANDLER — /api/admin/*
// ============================================
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function phoneVariants(phone: string): string[] {
  const digitsOnly = normalizePhone(phone);
  return [...new Set([digitsOnly, `+${digitsOnly}`, phone.trim()])];
}

async function getAdminByPhone(phone: string) {
  const digitsOnly = normalizePhone(phone);
  // Try multiple formats: digits only, with +, with + prefix
  const variants = [digitsOnly, `+${digitsOnly}`, phone.trim()];
  const uniqueVariants = [...new Set(variants)];

  const { data, error } = await supabase
    .from("app_users")
    .select("id, user_id, name, email, phone, status, role_id, roles:role_id(id, name, description)")
    .in("phone", uniqueVariants)
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

async function getPermissionsForRole(roleId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permissions:permission_id(resource, action)")
    .eq("role_id", roleId);
  if (error) throw error;
  return (data || []).map((rp: any) => `${rp.permissions.resource}.${rp.permissions.action}`);
}

async function handleAdmin(req: Request, url: URL, route: string) {
  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  switch (route) {
    // ── GET /api/admin/validate?phone=... ──
    case "validate": {
      if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const phone = url.searchParams.get("phone");
      if (!phone) return json({ error: "Query param 'phone' é obrigatório" }, 400);

      const user = await getAdminByPhone(phone);
      if (!user) return json({ success: true, user_exists: false });

      const roleName = (user.roles as any)?.name || "unknown";
      let permissions: string[] = [];

      if (user.role_id) {
        permissions = await getPermissionsForRole(user.role_id);
      }

      // Check for user-level overrides
      const { data: overrides } = await supabase
        .from("user_permission_overrides")
        .select("effect, permissions:permission_id(resource, action)")
        .eq("user_id", user.id);

      const denied = new Set<string>();
      const allowed = new Set<string>();
      (overrides || []).forEach((o: any) => {
        const perm = `${o.permissions.resource}.${o.permissions.action}`;
        if (o.effect === "deny") denied.add(perm);
        else if (o.effect === "allow") allowed.add(perm);
      });

      // Apply overrides: remove denied, add allowed
      const effectivePerms = permissions.filter(p => !denied.has(p));
      allowed.forEach(p => { if (!effectivePerms.includes(p)) effectivePerms.push(p); });

      // If role is super_admin or admin with all perms, use wildcard
      const isFullAdmin = roleName.toLowerCase().includes("admin") && effectivePerms.length > 20;

      return json({
        success: true,
        user_exists: true,
        user_id: user.user_id,
        app_user_id: user.id,
        name: user.name,
        role: roleName,
        permissions: isFullAdmin ? ["*"] : effectivePerms,
        status: user.status,
      });
    }

    // ── GET /api/admin/permissions?phone=... ──
    case "permissions": {
      if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const phone = url.searchParams.get("phone");
      if (!phone) return json({ error: "Query param 'phone' é obrigatório" }, 400);

      const user = await getAdminByPhone(phone);
      if (!user) return json({ success: false, error: "Usuário não encontrado" }, 404);

      const roleName = (user.roles as any)?.name || "unknown";
      let permissions: string[] = [];
      if (user.role_id) {
        permissions = await getPermissionsForRole(user.role_id);
      }

      return json({ success: true, role: roleName, permissions });
    }

    // ── POST /api/admin/confirm ──
    case "confirm": {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await req.json();
      const { admin_phone, command_type, target_id } = body;

      if (!admin_phone || !command_type) {
        return json({ error: "Campos 'admin_phone' e 'command_type' são obrigatórios" }, 400);
      }

      const user = await getAdminByPhone(admin_phone);
      if (!user) return json({ error: "Admin não encontrado" }, 404);
      if (user.status !== "ativo") return json({ error: "Usuário não está ativo" }, 403);

      // Validate permission for the command
      const permMap: Record<string, string> = {
        cancel_order: "orders.cancel",
        cancel_subscription: "subscriptions.cancel",
        pause_subscription: "subscriptions.pause",
        update_settings: "settings.edit",
        revoke_token: "tokens.revoke",
        suspend_user: "users.suspend",
      };

      const requiredPerm = permMap[command_type];
      if (requiredPerm && user.role_id) {
        const perms = await getPermissionsForRole(user.role_id);
        const roleName = (user.roles as any)?.name || "";
        const isAdmin = roleName.toLowerCase().includes("admin");
        if (!isAdmin && !perms.includes(requiredPerm)) {
          return json({ error: `Permissão '${requiredPerm}' não encontrada para este usuário` }, 403);
        }
      }

      const { data, error } = await supabase
        .from("admin_confirmations")
        .insert({
          admin_phone: normalizePhone(admin_phone),
          command_type,
          target_id: target_id || null,
          user_id: user.user_id,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;

      console.log(`Admin confirmation created: ${data.id} by ${user.name} for ${command_type}`);
      return json({ success: true, confirmation_id: data.id, status: "pending" }, 201);
    }

    // ── POST /api/admin/execute ──
    case "execute": {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await req.json();
      const { admin_phone, command, target_id } = body;

      if (!admin_phone || !command) {
        return json({ error: "Campos 'admin_phone' e 'command' são obrigatórios" }, 400);
      }

      const user = await getAdminByPhone(admin_phone);
      if (!user) return json({ error: "Admin não encontrado" }, 404);
      if (user.status !== "ativo") return json({ error: "Usuário não está ativo" }, 403);

      // Check for pending confirmation
      const { data: confirmation } = await supabase
        .from("admin_confirmations")
        .select("*")
        .eq("admin_phone", normalizePhone(admin_phone))
        .eq("command_type", command)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!confirmation) {
        return json({ error: "Nenhuma confirmação pendente encontrada para este comando" }, 400);
      }

      // Execute the action
      let result: any = null;
      let executionStatus = "success";
      let errorMessage: string | null = null;

      try {
        switch (command) {
          case "cancel_order": {
            if (!target_id) throw new Error("target_id (order id ou order_number) é obrigatório");
            const isUuid = target_id.match(/^[0-9a-f-]{36}$/i);
            let query = supabase.from("orders").update({
              payment_status: "cancelado", delivery_status: "cancelado",
              cancelled_at: new Date().toISOString(), cancelled_by: user.user_id,
              cancellation_reason: body.reason || "Cancelado via admin API",
            });
            if (isUuid) query = query.eq("id", target_id);
            else query = query.eq("order_number", target_id);
            const { data: order, error: orderErr } = await query.select().single();
            if (orderErr) throw orderErr;
            result = order;
            break;
          }
          case "cancel_subscription": {
            if (!target_id) throw new Error("target_id é obrigatório");
            const { data: sub, error: subErr } = await supabase
              .from("subscriptions").update({ status: "cancelada" })
              .eq("id", target_id).select().single();
            if (subErr) throw subErr;
            result = sub;
            break;
          }
          case "pause_subscription": {
            if (!target_id) throw new Error("target_id é obrigatório");
            const { data: sub, error: subErr } = await supabase
              .from("subscriptions").update({ status: "pausada" })
              .eq("id", target_id).select().single();
            if (subErr) throw subErr;
            result = sub;
            break;
          }
          default:
            throw new Error(`Comando '${command}' não suportado para execução automática`);
        }
      } catch (e: any) {
        executionStatus = "error";
        errorMessage = e.message;
      }

      // Update confirmation
      await supabase.from("admin_confirmations").update({
        confirmation_received: true,
        confirmed_at: new Date().toISOString(),
        executed_at: new Date().toISOString(),
        execution_status: executionStatus,
        status: executionStatus === "success" ? "executed" : "failed",
      }).eq("id", confirmation.id);

      // Register in audit_logs
      await supabase.from("audit_logs").insert({
        actor_type: "user",
        actor_id: user.user_id,
        action: command.toUpperCase(),
        resource_type: command.includes("order") ? "orders" : command.includes("subscription") ? "subscriptions" : "system",
        resource_id: target_id || null,
        after_data: result,
        justification: body.reason || `Executado via admin API por ${user.name}`,
        metadata: { confirmation_id: confirmation.id, admin_phone: normalizePhone(admin_phone) },
      });

      if (executionStatus === "error") {
        return json({ success: false, error: errorMessage, confirmation_id: confirmation.id }, 500);
      }

      console.log(`Admin action executed: ${command} on ${target_id} by ${user.name}`);
      return json({ success: true, command, target_id, result, confirmation_id: confirmation.id });
    }

    // ── GET /api/admin/users ──
    case "users": {
      if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

      const { data, error } = await supabase
        .from("app_users")
        .select("id, user_id, name, phone, email, status, roles:role_id(name)")
        .order("name");
      if (error) throw error;

      const users = (data || []).map((u: any) => ({
        id: u.id,
        user_id: u.user_id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        role: (u.roles as any)?.name || "sem_role",
        status: u.status,
      }));

      return json({ success: true, count: users.length, data: users });
    }

    default:
      return json({
        error: "Admin route not found",
        available_routes: [
          "GET /api/admin/validate?phone=...",
          "GET /api/admin/permissions?phone=...",
          "POST /api/admin/confirm",
          "POST /api/admin/execute",
          "GET /api/admin/users",
        ],
      }, 404);
  }
}

// ============================================
// VALIDATE DOCUMENT HANDLER — /api/validate-document
// GET /api/validate-document?type=cnpj&value=12345678000199
// GET /api/validate-document?type=cep&value=64000000
// ============================================
async function handleValidateDocument(req: Request, url: URL) {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const type = url.searchParams.get("type");
  const value = url.searchParams.get("value");

  if (!type || !value) {
    return new Response(JSON.stringify({ error: "Parâmetros 'type' e 'value' são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const cleanValue = value.replace(/\D/g, "");
  let apiUrl: string;

  switch (type) {
    case "cnpj":
      if (cleanValue.length !== 14) return new Response(JSON.stringify({ error: "CNPJ deve ter 14 dígitos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      apiUrl = `https://brasilapi.com.br/api/cnpj/v1/${cleanValue}`;
      break;
    case "cep":
      if (cleanValue.length !== 8) return new Response(JSON.stringify({ error: "CEP deve ter 8 dígitos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      apiUrl = `https://brasilapi.com.br/api/cep/v2/${cleanValue}`;
      break;
    default:
      return new Response(JSON.stringify({ error: "Tipo inválido. Use 'cnpj' ou 'cep'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const response = await fetch(apiUrl, { headers: { "Accept": "application/json", "User-Agent": "Comercial-JR-API/1.0" } });
  const data = await response.json();

  if (!response.ok) {
    return new Response(JSON.stringify({ error: data.message || `Erro ao consultar ${type.toUpperCase()}`, details: data }), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let formattedData: any;
  if (type === "cnpj") {
    formattedData = {
      cnpj: data.cnpj, razao_social: data.razao_social, nome_fantasia: data.nome_fantasia,
      situacao_cadastral: data.descricao_situacao_cadastral, logradouro: data.logradouro,
      numero: data.numero, complemento: data.complemento, bairro: data.bairro,
      municipio: data.municipio, uf: data.uf, cep: data.cep, telefone: data.ddd_telefone_1,
      email: data.email, porte: data.porte, qsa: data.qsa, raw: data,
    };
  } else {
    formattedData = { cep: data.cep, logradouro: data.street, bairro: data.neighborhood, cidade: data.city, estado: data.state, raw: data };
  }

  return new Response(JSON.stringify({ success: true, data: formattedData }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================
// PAYMENTS HANDLER — /api/payments/*
// ============================================
async function handlePayments(req: Request, url: URL, route: string) {
  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  switch (route) {
    // ── POST /api/payments/create ──
    case "create": {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await req.json();
      const { type, order_id, subscription_id, payment_method, return_url } = body;

      if (!payment_method || !['cartao', 'pix'].includes(payment_method)) {
        return json({ error: "payment_method deve ser 'cartao' ou 'pix'" }, 400);
      }
      if (!type || !['order', 'subscription'].includes(type)) {
        return json({ error: "type deve ser 'order' ou 'subscription'" }, 400);
      }

      // Proxy to create-payment edge function
      const createPaymentUrl = `${SUPABASE_URL}/functions/v1/create-payment`;
      const resp = await fetch(createPaymentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ type, order_id, subscription_id, payment_method, return_url }),
      });
      const result = await resp.json();
      return json(result, resp.status);
    }

    // ── POST /api/payments/check ──
    case "check": {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await req.json();
      const { type, order_id, subscription_id } = body;

      if (!type || !['order', 'subscription'].includes(type)) {
        return json({ error: "type deve ser 'order' ou 'subscription'" }, 400);
      }

      // Proxy to check-pix-payment edge function
      const checkUrl = `${SUPABASE_URL}/functions/v1/check-pix-payment`;
      const resp = await fetch(checkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ type, order_id, subscription_id }),
      });
      const result = await resp.json();
      return json(result, resp.status);
    }

    // ── POST /api/payments/test-pix ──
    case "test-pix": {
      if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);

      // Proxy to test-pix-connection edge function
      const testUrl = `${SUPABASE_URL}/functions/v1/test-pix-connection`;
      const resp = await fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({}),
      });
      const result = await resp.json();
      return json(result, resp.status);
    }

    default:
      return json({
        error: "Payments route not found",
        available_routes: [
          "POST /api/payments/create — Criar pagamento (Pix ou Stripe)",
          "POST /api/payments/check — Verificar status de pagamento",
          "POST /api/payments/test-pix — Testar conexão mTLS com Efí Pay",
        ],
      }, 404);
  }
}

// ============================================
// V2 HANDLER — /api/v2/users/*
// Sistema SINGLE-TENANT: todos os usuários compartilham
// os mesmos dados (customers, orders, subscriptions).
// Diferenciação ocorre APENAS por nivel_acesso e permissoes.
// ============================================
async function handleV2(req: Request, url: URL, v2Resource: string, v2Action: string) {
  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // ── GET /api/v2/debug/session ──
  if (v2Resource === "debug" && v2Action === "session") {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    // Extract user from Authorization header if present
    const authHeader = req.headers.get("authorization");
    let sessionInfo: any = { sistema: "single-tenant", message: "Use Authorization Bearer token para ver dados da sessão" };

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();

      if (user) {
        const { data: appUser } = await supabase
          .from("app_users")
          .select("id, name, email, username, cargo, departamento, tipo_vinculo, status")
          .eq("user_id", user.id)
          .maybeSingle();

        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const roles = (userRoles || []).map((r: any) => r.role);
        const nivelAcesso = roles.includes("admin") ? "admin" : roles.includes("moderator") ? "moderator" : "user";

        sessionInfo = {
          sistema: "single-tenant",
          user_id: user.id,
          email: user.email,
          nivel_acesso: nivelAcesso,
          roles,
          is_owner: roles.includes("admin"),
          app_user: appUser,
        };
      }
    }

    return json(sessionInfo);
  }

  // ── GET /api/v2/me ──
  if (v2Resource === "me" && !v2Action) {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Token de autenticação necessário" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) return json({ error: "Token inválido ou expirado" }, 401);

    const { data: appUser } = await supabase
      .from("app_users")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles = (userRoles || []).map((r: any) => r.role);
    const nivelAcesso = roles.includes("admin") ? "admin" : roles.includes("moderator") ? "moderator" : "user";

    return json({
      success: true,
      sistema: "single-tenant",
      user_id: user.id,
      email: user.email,
      nivel_acesso: nivelAcesso,
      is_owner: roles.includes("admin"),
      roles,
      profile: appUser ? {
        name: appUser.name,
        username: appUser.username,
        cargo: appUser.cargo,
        departamento: appUser.departamento,
        tipo_vinculo: appUser.tipo_vinculo,
        status: appUser.status,
        phone: appUser.phone,
      } : null,
    });
  }

  if (v2Resource !== "users") {
    return json({ error: "V2 resource not found. Available: users, me, debug/session" }, 404);
  }

  // ── POST /api/v2/users/create-in-company ──
  // Cria usuário vinculado ao sistema existente (single-tenant)
  if (v2Action === "create-in-company") {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json();
    const { dados_usuario, nivel_acesso, permissoes } = body;

    if (!dados_usuario?.email || !dados_usuario?.password) {
      return json({ error: "dados_usuario.email e dados_usuario.password são obrigatórios" }, 400);
    }
    if (!dados_usuario?.name) {
      return json({ error: "dados_usuario.name é obrigatório" }, 400);
    }

    // Mapeamento de nivel_acesso para app_role
    const nivelMap: Record<string, string> = {
      admin: "admin",
      moderador: "moderator",
      moderator: "moderator",
      financeiro: "user",
      rh: "user",
      vendas: "user",
      operacional: "user",
      user: "user",
    };
    const appRole = nivelMap[nivel_acesso?.toLowerCase()] || "user";

    // 1. Criar auth user no Supabase
    const { data: newAuthUser, error: authError } = await supabase.auth.admin.createUser({
      email: dados_usuario.email.trim(),
      password: dados_usuario.password,
      email_confirm: true,
    });

    if (authError) {
      console.error("Auth user creation error:", authError);
      return json({ error: authError.message }, 400);
    }

    const authUserId = newAuthUser.user.id;

    // 2. Buscar role_id correspondente se nivel_acesso for um role customizado
    let roleId: string | null = null;
    if (nivel_acesso && !["admin", "moderator", "moderador", "user"].includes(nivel_acesso?.toLowerCase())) {
      const { data: roleData } = await supabase
        .from("roles")
        .select("id")
        .ilike("name", nivel_acesso)
        .maybeSingle();
      roleId = roleData?.id || null;
    }

    // 3. Inserir em app_users — MESMO sistema, sem isolamento
    const appUserPayload: Record<string, any> = {
      user_id: authUserId,
      email: dados_usuario.email.trim(),
      name: dados_usuario.name,
      username: dados_usuario.username || null,
      phone: dados_usuario.phone || null,
      cargo: dados_usuario.cargo || nivel_acesso || null,
      departamento: dados_usuario.departamento || null,
      tipo_vinculo: dados_usuario.tipo_vinculo || null,
      status: "ativo",
      tentativas_login: 0,
      auth_provider: "email",
      must_change_password: dados_usuario.must_change_password !== false,
      ...(roleId ? { role_id: roleId } : {}),
      // Campos adicionais opcionais
      cpf: dados_usuario.cpf || null,
      rg: dados_usuario.rg || null,
      celular: dados_usuario.celular || null,
      data_nascimento: dados_usuario.data_nascimento || null,
      data_admissao: dados_usuario.data_admissao || null,
      salario_base: dados_usuario.salario_base || null,
      centro_custo: dados_usuario.centro_custo || null,
      notes: dados_usuario.notes || null,
    };

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .insert(appUserPayload)
      .select()
      .single();

    if (appUserError) {
      console.error("app_users insert error:", appUserError);
      await supabase.auth.admin.deleteUser(authUserId);
      return json({ error: appUserError.message }, 400);
    }

    // 4. Atribuir role na tabela user_roles (separada — sem escalada de privilégio)
    await supabase.from("user_roles").insert({
      user_id: authUserId,
      role: appRole as any,
    });

    // 5. Log de auditoria
    await supabase.from("system_audit_logs").insert({
      event_type: "USER_CREATED_VIA_API",
      entity_type: "user",
      entity_id: authUserId,
      status: "success",
      payload_json: {
        source: "n8n_api_v2",
        email: dados_usuario.email.trim(),
        nivel_acesso: nivel_acesso || "user",
        app_role: appRole,
      },
    });

    console.log(`User created via API v2: ${dados_usuario.email} — nivel: ${nivel_acesso}`);

    return json({
      success: true,
      message: "Usuário criado e vinculado ao sistema existente",
      sistema: "single-tenant",
      user: {
        id: authUserId,
        app_user_id: appUser.id,
        email: appUser.email,
        name: appUser.name,
        nivel_acesso: nivel_acesso || "user",
        app_role: appRole,
        status: appUser.status,
        cargo: appUser.cargo,
        departamento: appUser.departamento,
      },
    }, 201);
  }

  // ── GET /api/v2/users ──
  if (!v2Action && req.method === "GET") {
    const status = url.searchParams.get("status");
    const role = url.searchParams.get("role");

    let query = supabase
      .from("app_users")
      .select(`
        id, user_id, name, email, username, phone, cargo, departamento,
        tipo_vinculo, status, created_at, last_login_at,
        roles:role_id(name, description)
      `);

    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("name");
    if (error) throw error;

    // Enriquecer com roles da tabela user_roles
    const userIds = (data || []).map((u: any) => u.user_id);
    const { data: userRolesData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    const rolesMap = new Map<string, string[]>();
    for (const ur of userRolesData || []) {
      if (!rolesMap.has(ur.user_id)) rolesMap.set(ur.user_id, []);
      rolesMap.get(ur.user_id)!.push(ur.role);
    }

    const users = (data || [])
      .map((u: any) => ({
        id: u.user_id,
        app_user_id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        phone: u.phone,
        cargo: u.cargo,
        departamento: u.departamento,
        tipo_vinculo: u.tipo_vinculo,
        status: u.status,
        created_at: u.created_at,
        last_login_at: u.last_login_at,
        role_name: (u.roles as any)?.name || null,
        app_roles: rolesMap.get(u.user_id) || [],
        nivel_acesso: (rolesMap.get(u.user_id) || []).includes("admin")
          ? "admin"
          : (rolesMap.get(u.user_id) || []).includes("moderator")
          ? "moderator"
          : u.cargo || "user",
      }))
      .filter((u: any) => !role || u.app_roles.includes(role));

    return json({ success: true, sistema: "single-tenant", count: users.length, data: users });
  }

  // ── PUT /api/v2/users/:id ── (update user status/role)
  if (!v2Action && req.method === "PUT") {
    const userId = url.searchParams.get("id");
    if (!userId) return json({ error: "Parâmetro 'id' (user_id) é obrigatório" }, 400);

    const body = await req.json();
    const updateData: Record<string, any> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.cargo !== undefined) updateData.cargo = body.cargo;
    if (body.departamento !== undefined) updateData.departamento = body.departamento;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.phone !== undefined) updateData.phone = body.phone;

    const { data, error } = await supabase
      .from("app_users")
      .update(updateData)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    // Se mudar role
    if (body.app_role) {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("user_roles").insert({ user_id: userId, role: body.app_role });
    }

    return json({ success: true, data });
  }

  // ── DELETE /api/v2/users/:id ── (suspend user)
  if (!v2Action && req.method === "DELETE") {
    const userId = url.searchParams.get("id");
    if (!userId) return json({ error: "Parâmetro 'id' (user_id) é obrigatório" }, 400);

    // Suspender (não deletar) para preservar histórico
    const { data, error } = await supabase
      .from("app_users")
      .update({ status: "suspenso" })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("system_audit_logs").insert({
      event_type: "USER_SUSPENDED_VIA_API",
      entity_type: "user",
      entity_id: userId,
      status: "success",
      payload_json: { source: "n8n_api_v2" },
    });

    return json({ success: true, message: "Usuário suspenso (dados preservados)", data });
  }

  return json({
    error: "V2 Users route not found",
    available_routes: [
      "POST /api/v2/users/create-in-company — Criar usuário no sistema existente",
      "GET /api/v2/users — Listar todos os usuários",
      "GET /api/v2/users?status=ativo — Filtrar por status",
      "GET /api/v2/users?role=admin — Filtrar por role",
      "PUT /api/v2/users?id=<user_id> — Atualizar usuário",
      "DELETE /api/v2/users?id=<user_id> — Suspender usuário",
    ],
  }, 404);
}
