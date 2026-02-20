# 📘 API REST — Sistema Completo de Endpoints

> **Base URL Principal:** `https://infresxpaglulwiooanc.supabase.co/functions/v1/api`
>
> **Autenticação (API):** Header `x-api-key` com o token configurado no secret `N8N_API_KEY`
>
> **Content-Type:** `application/json`
>
> **CORS:** Habilitado para todas as origens (`*`)
>
> **Métodos permitidos:** `GET, POST, PUT, DELETE, OPTIONS`

---

## 📑 Índice

1. [Autenticação do Sistema (auth-login)](#1-autenticação-do-sistema--auth-login)
2. [Criação de Usuários Admin (admin-create-user)](#2-criação-de-usuários-admin--admin-create-user)
3. [Normalização de Telefone](#3-normalização-de-telefone)
4. [Clientes — `/api/customers`](#4-clientes--apicustomers)
5. [Produtos — `/api/products`](#5-produtos--apiproducts)
6. [Produtos com Estoque Baixo — `/api/products-low-stock`](#6-produtos-com-estoque-baixo--apiproducts-low-stock)
7. [Pedidos — `/api/orders`](#7-pedidos--apiorders)
8. [Assinaturas — `/api/subscriptions`](#8-assinaturas--apisubscriptions)
9. [Entregas — `/api/deliveries`](#9-entregas--apideliveries)
10. [Configurações — `/api/settings`](#10-configurações--apisettings)
11. [Resumo Financeiro — `/api/financial-summary`](#11-resumo-financeiro--apifinancial-summary)
12. [Contexto de Conversa — `/api/conversation-context`](#12-contexto-de-conversa--apiconversation-context)
13. [Logs de Auditoria — `/api/audit-logs`](#13-logs-de-auditoria--apiaudit-logs)
14. [Validação de Documento — `/api/validate-document`](#14-validação-de-documento--apivalidate-document)
15. [Pagamentos — `/api/payments/*`](#15-pagamentos--apipayments)
16. [Admin — `/api/admin/*`](#16-admin--apiadmin)
17. [MCP — `/api/mcp/*`](#17-mcp--apimcp)
18. [Códigos de Erro Globais](#18-códigos-de-erro-globais)
19. [Enums do Banco de Dados](#19-enums-do-banco-de-dados)
20. [Rotas Disponíveis (resumo)](#20-rotas-disponíveis-resumo)

---

## 1. Autenticação do Sistema — `auth-login`

> **URL:** `https://infresxpaglulwiooanc.supabase.co/functions/v1/auth-login`
>
> **Autenticação:** Nenhuma (endpoint público)
>
> **Método:** `POST` apenas

Este endpoint é independente da API principal. Utiliza lógica própria com `SERVICE_ROLE_KEY` para autenticar usuários administrativos.

### POST `/auth-login`

Autenticar um usuário do sistema (admin/operador).

**Body:**
```json
{
  "login": "Joelson_Santos",
  "senha": "MinhaSenh@123"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `login` | string | Sim | Email, username ou nome completo |
| `senha` | string | Sim | Senha do usuário |

**Lógica de resolução do login:**
1. Se contiver `@` → trata como email diretamente
2. Caso contrário → busca por `username` exato em `app_users`
3. Fallback → busca por `name` (case-insensitive) em `app_users`

**Proteções ativas:**
- Usuário `status = "suspenso"` → erro 403
- `tentativas_login >= 5` → bloqueio por excesso de tentativas (403)
- Falha no login → incrementa `tentativas_login`
- Login bem-sucedido → zera `tentativas_login` e atualiza `last_login_at`

**Auto-healing:** Se o usuário existe em `app_users` mas não tem conta no Supabase Auth, o sistema cria automaticamente a conta Auth com a senha fornecida e atualiza o `user_id`.

**Resposta (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "refresh_token": "k3dga6vnp644",
  "expires_at": 1771547078,
  "user": {
    "id": "uuid-auth",
    "email": "joao@email.com",
    "nome": "Joelson Santos",
    "username": "Joelson_Santos",
    "nivel_acesso": "admin",
    "roles": ["admin"],
    "role_name": "Administrador",
    "status": "ativo",
    "permissoes": {
      "cargo": "CEO",
      "departamento": null,
      "tipo_vinculo": "socio"
    }
  }
}
```

**Erros:**
- `400` — `"Campos 'login' e 'senha' são obrigatórios"`
- `401` — `"Usuário não encontrado"` ou `"Credenciais inválidas"`
- `403` — `"Usuário suspenso."` ou `"Conta bloqueada por excesso de tentativas."`
- `405` — `"Method not allowed"` (não-POST)
- `500` — Erro interno

---

## 2. Criação de Usuários Admin — `admin-create-user`

> **URL:** `https://infresxpaglulwiooanc.supabase.co/functions/v1/admin-create-user`
>
> **Autenticação:** Bearer token de um usuário admin (Supabase session token)
>
> **Método:** `POST` apenas

Endpoint separado para criação segura de usuários administrativos usando `SERVICE_ROLE_KEY`. Apenas admins autenticados podem criar usuários.

### POST `/admin-create-user`

**Headers:**
```
Authorization: Bearer <token_do_admin>
Content-Type: application/json
```

**Body:**
```json
{
  "email": "novo@email.com",
  "password": "Senha@Forte123",
  "name": "Nome Completo",
  "username": "nome_usuario",
  "phone": "+5589999000000",
  "role_id": "uuid-do-role",
  "cargo": "Gerente",
  "tipo_vinculo": "clt",
  "status": "ativo"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `email` | string | Sim | Email do novo usuário |
| `password` | string | Sim | Senha (mínimo 6 caracteres) |
| `name` | string | Sim | Nome completo |
| `username` | string | Não | Username único (letras, números, underscore) |
| `phone` | string | Não | Telefone |
| `role_id` | UUID | Não | ID do papel/função |
| `cargo` | string | Não | Cargo na empresa |
| `tipo_vinculo` | string | Não | Tipo de vínculo trabalhista |
| `status` | string | Não | `"ativo"` (default) |

**Lógica:**
1. Verifica se o solicitante tem role `admin` via `user_roles`
2. Cria conta no Supabase Auth via `auth.admin.createUser()` com `email_confirm: true`
3. Insere registro em `app_users` com o `user_id` gerado
4. Registra em `system_audit_logs`

**Resposta (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid-auth",
    "email": "novo@email.com",
    "app_user_id": "uuid-app-users"
  }
}
```

**Erros:**
- `401` — Não autenticado
- `403` — `"Apenas administradores podem criar usuários"`
- `400` — Email ou senha ausentes
- `500` — Erro na criação

---

## 3. Normalização de Telefone

A API principal utiliza uma estratégia de **busca multi-variante** para telefones, garantindo correspondência independente da formatação.

**Função `phoneVariants(phone)`** gera até 3 variantes:
1. Apenas dígitos: `5589999308213`
2. Com prefixo `+`: `+5589999308213`
3. Texto original trimado: `+55 89 99930-8213`

Aplicado em:
- `GET /api/customers?phone=...`
- `GET /api/conversation-context?phone=...`
- `GET /api/admin/validate?phone=...`
- `GET /api/admin/permissions?phone=...`
- `POST /api/admin/confirm` (campo `admin_phone`)
- `POST /api/admin/execute` (campo `admin_phone`)

---

## 4. Clientes — `/api/customers`

### 4.1 GET `/api/customers`

Buscar clientes com filtros opcionais.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Filtrar por ID |
| `phone` | string | Filtrar por telefone (multi-variante) |
| `cpf_cnpj` | string | Filtrar por CPF/CNPJ (apenas dígitos) |
| `cpf` | string | Alias para `cpf_cnpj` |
| `cnpj` | string | Alias para `cpf_cnpj` |

**Resposta (200):**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": "uuid",
      "name": "João Silva",
      "customer_type": "PF",
      "cpf_cnpj": "12345678901",
      "email": "joao@email.com",
      "phone": "5589999308213",
      "street": "Rua A",
      "number": "123",
      "complement": "Apt 1",
      "neighborhood": "Centro",
      "city": "Teresina",
      "state": "PI",
      "zip_code": "64000000",
      "trading_name": null,
      "responsible_name": null,
      "responsible_contact": null,
      "validated": false,
      "validation_data": null,
      "bank_name": null,
      "bank_agency": null,
      "bank_account": null,
      "bank_pix_key": null,
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### 4.2 POST `/api/customers`

Criar novo cliente.

**Body (obrigatório):**
```json
{
  "name": "João Silva",
  "cpf_cnpj": "123.456.789-01",
  "phone": "(89) 99930-8213",
  "email": "joao@email.com",
  "customer_type": "PF",
  "street": "Rua A",
  "number": "123",
  "complement": "Apt 1",
  "neighborhood": "Centro",
  "city": "Teresina",
  "state": "PI",
  "zip_code": "64000-000",
  "trading_name": null,
  "responsible_name": null,
  "responsible_contact": null,
  "validated": false,
  "validation_data": null
}
```

**Campos obrigatórios:** `name`, `cpf_cnpj`, `phone`

**Regras de negócio:**
- `cpf_cnpj` é limpo (apenas dígitos) antes de salvar
- `phone` é limpo (apenas dígitos) antes de salvar
- `customer_type` é inferido automaticamente: 14 dígitos = `PJ`, caso contrário = `PF`
- Se já existe um cliente com o mesmo `cpf_cnpj`, retorna **409 Conflict** com o cliente existente
- `zip_code` é limpo (apenas dígitos) antes de salvar

**Resposta (201):**
```json
{ "success": true, "data": { "id": "uuid", "...": "..." } }
```

**Resposta (409) — Duplicado:**
```json
{
  "success": false,
  "error": "Documento já cadastrado",
  "message": "Já existe um cliente com este CPF/CNPJ",
  "existing_customer": { "...": "..." }
}
```

### 4.3 PUT `/api/customers`

Atualizar cliente existente.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | ID do cliente |
| `cpf_cnpj` | string | CPF/CNPJ do cliente |

**Requer** pelo menos `id` ou `cpf_cnpj`.

**Body (todos opcionais):**
```json
{
  "name": "João Atualizado",
  "customer_type": "PF",
  "email": "novo@email.com",
  "phone": "5589999000000",
  "street": "Rua B",
  "number": "456",
  "complement": null,
  "neighborhood": "Bairro",
  "city": "Cidade",
  "state": "PI",
  "zip_code": "64000000",
  "trading_name": null,
  "responsible_name": null,
  "responsible_contact": null,
  "validated": true,
  "validation_data": {}
}
```

**Resposta (200):**
```json
{ "success": true, "data": { "...": "..." } }
```

### 4.4 DELETE `/api/customers`

Excluir cliente.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | ID do cliente |
| `cpf_cnpj` | string | CPF/CNPJ do cliente |

**Resposta (200):**
```json
{ "success": true, "message": "Customer deleted" }
```

---

## 5. Produtos — `/api/products`

### 5.1 GET `/api/products`

Listar produtos.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Filtrar por ID |
| `code` | string | Filtrar por código (ex: `PROD-a1b2c3d4`) |
| `include_inactive` | boolean | Se `true`, inclui produtos inativos (default: `false`) |

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "PROD-a1b2c3d4",
      "name": "Galão 20L",
      "description": "Água mineral 20 litros",
      "images": [],
      "price_single": 12.00,
      "price_kit": 10.00,
      "price_subscription": 9.00,
      "stock": 100,
      "stock_min": 20,
      "stock_max": 200,
      "active": true,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### 5.2 POST `/api/products`

Criar produto.

**Body:**
```json
{
  "name": "Galão 20L",
  "description": "Água mineral 20 litros",
  "images": [],
  "price_single": 12.00,
  "price_kit": 10.00,
  "price_subscription": 9.00,
  "stock": 100,
  "stock_min": 20,
  "stock_max": 200,
  "active": true
}
```

**Campos obrigatórios:** `name`

**Campos com defaults:**
- `price_single` → alias `price` aceito, default `0`
- `price_kit` → default `0`
- `price_subscription` → default `0`
- `stock`, `stock_min`, `stock_max` → default `0`
- `images` → default `[]`
- `active` → default `true`
- `code` → gerado automaticamente (`PROD-xxxxxxxx`)

**Resposta (201):**
```json
{ "success": true, "data": { "...": "..." } }
```

### 5.3 PUT `/api/products`

Atualizar produto.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | ID do produto |
| `code` | string | Código do produto |

**Requer** pelo menos `id` ou `code`.

**Resposta (200):**
```json
{ "success": true, "data": { "...": "..." } }
```

### 5.4 DELETE `/api/products`

Excluir produto.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | ID do produto |
| `code` | string | Código do produto |

**Resposta (200):**
```json
{ "success": true, "message": "Product deleted" }
```

---

## 6. Produtos com Estoque Baixo — `/api/products-low-stock`

### GET `/api/products-low-stock`

Retorna produtos ativos cujo `stock <= stock_min` e `stock_min > 0`.

**Resposta (200):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "uuid",
      "code": "PROD-a1b2c3d4",
      "name": "Galão 20L",
      "stock": 5,
      "stock_min": 20,
      "stock_max": 200,
      "deficit": 15
    }
  ]
}
```

**Regra:** `deficit = stock_min - stock`

---

## 7. Pedidos — `/api/orders`

### 7.1 GET `/api/orders`

Consultar pedidos com dados relacionados (cliente, itens, produtos).

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Filtrar por ID do pedido |
| `customer_id` | UUID | Filtrar por cliente |
| `order_number` | string | Filtrar por número do pedido (ex: `ORD-a1b2c3d4`) |

**Select retornado:** `*, customer:customers(*), items:order_items(*, product:products(*))`

**Ordenação:** `created_at DESC`

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "order_number": "ORD-a1b2c3d4",
      "customer_id": "uuid",
      "total_amount": 36.00,
      "payment_method": "pix",
      "payment_status": "pendente",
      "delivery_status": "aguardando",
      "delivery_date": null,
      "delivery_time_slot": null,
      "payment_confirmed_at": null,
      "stripe_payment_intent_id": null,
      "pix_transaction_id": null,
      "pix_copia_e_cola": null,
      "payment_url": null,
      "notes": null,
      "cancellation_reason": null,
      "cancelled_at": null,
      "cancelled_by": null,
      "created_at": "...",
      "updated_at": "...",
      "customer": { "...": "..." },
      "items": [
        {
          "id": "uuid",
          "order_id": "uuid",
          "product_id": "uuid",
          "quantity": 3,
          "unit_price": 12.00,
          "total_price": 36.00,
          "product": { "...": "..." }
        }
      ]
    }
  ]
}
```

### 7.2 POST `/api/orders`

Criar pedido com itens.

**Body:**
```json
{
  "customer_id": "uuid",
  "payment_method": "pix",
  "notes": "Entregar na portaria",
  "total_amount": 0,
  "items": [
    { "product_id": "uuid", "quantity": 3, "unit_price": null },
    { "product_id": "uuid", "quantity": 2, "unit_price": null }
  ]
}
```

**Regras de negócio — Preço Kit:**
1. Busca a configuração `min_qtd_kit_preco` em `system_settings` (default: `3`)
2. Soma a quantidade total de todos os itens do pedido
3. Se `totalQuantity >= kitMinQuantity` → usa `price_kit` do produto
4. Caso contrário → usa `price_single` do produto
5. Se `unit_price` é passado explicitamente no item, ele tem prioridade
6. `total_price` do item = `unit_price × quantity`
7. `total_amount` do pedido = soma de todos os `total_price`

**Resposta (201):**
```json
{
  "success": true,
  "data": { "...pedido completo com customer e items..." },
  "pricing": {
    "kit_min_quantity": 3,
    "total_items": 5,
    "using_kit_price": true
  }
}
```

### 7.3 PUT `/api/orders`

Atualizar pedido.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | ID do pedido |
| `order_number` | string | Número do pedido |

**Requer** pelo menos `id` ou `order_number`.

**Body (todos opcionais):**
```json
{
  "payment_status": "confirmado",
  "delivery_status": "em_rota",
  "payment_method": "pix",
  "stripe_payment_intent_id": "pi_...",
  "pix_transaction_id": "txn_...",
  "notes": "Observação",
  "delivery_date": "2025-01-15",
  "delivery_time_slot": "manha"
}
```

**Regras de negócio — Confirmação de Pagamento:**

Quando `payment_status = "confirmado"`:
1. Calcula `delivery_date` automaticamente usando `calculateDeliveryDate()`
2. Busca `hora_limite_entrega_dia` em `system_settings` (default: `"12:00"`)
3. Busca `feriados` em `system_settings` (default: `[]`)
4. Se horário atual ≤ hora limite → entrega no mesmo dia (se dia útil), `time_slot = "tarde"`
5. Se horário atual > hora limite → entrega no próximo dia, `time_slot = "manha"`
6. Avança para o próximo dia útil (pula sábados, domingos e feriados)
7. Define `payment_confirmed_at = now()`
8. Se `delivery_time_slot` foi passado no body, ele tem prioridade sobre o calculado

**Resposta (200):**
```json
{ "success": true, "data": { "...": "..." } }
```

### 7.4 DELETE `/api/orders`

Cancelar pedido (soft delete — atualiza status).

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | ID do pedido |
| `order_number` | string | Número do pedido |

**Body (opcional):**
```json
{ "reason": "Cliente desistiu" }
```

**Ações executadas:**
- `payment_status` → `"cancelado"`
- `delivery_status` → `"cancelado"`
- `cancelled_at` → timestamp atual
- `cancellation_reason` → reason do body ou `null`

**Resposta (200):**
```json
{ "success": true, "message": "Order cancelled", "data": { "...": "..." } }
```

---

## 8. Assinaturas — `/api/subscriptions`

### 8.1 GET `/api/subscriptions`

Consultar assinaturas com dados relacionados.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Filtrar por ID |
| `customer_id` | UUID | Filtrar por cliente |
| `subscription_number` | string | Filtrar por número (ex: `SUB-a1b2c3d4`) |

**Select:** `*, customer:customers(*), items:subscription_items(*, product:products(*))`

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "subscription_number": "SUB-a1b2c3d4",
      "customer_id": "uuid",
      "status": "ativa",
      "frequency": "semanal",
      "delivery_weekday": "segunda",
      "delivery_weekdays": ["segunda", "quarta"],
      "delivery_time_slot": "manha",
      "total_amount": 160.00,
      "is_emergency": false,
      "next_delivery_date": "2025-01-20",
      "notes": null,
      "payment_url": null,
      "pix_copia_e_cola": null,
      "pix_transaction_id": null,
      "pix_autorizacao_id": null,
      "pix_recorrencia_status": null,
      "pix_recorrencia_autorizada": false,
      "pix_recorrencia_data_inicio": null,
      "pix_recorrencia_valor_mensal": null,
      "stripe_subscription_id": null,
      "stripe_customer_id": null,
      "stripe_price_id": null,
      "created_at": "...",
      "updated_at": "...",
      "customer": { "...": "..." },
      "items": [
        {
          "id": "uuid",
          "subscription_id": "uuid",
          "product_id": "uuid",
          "quantity": 5,
          "unit_price": 8.00,
          "reserved_stock": 5,
          "product": { "...": "..." }
        }
      ]
    }
  ]
}
```

### 8.2 POST `/api/subscriptions`

Criar assinatura com validação PF/PJ e emergência.

**Body:**
```json
{
  "customer_id": "uuid",
  "delivery_weekday": "segunda",
  "delivery_weekdays": ["segunda", "quarta"],
  "delivery_time_slot": "manha",
  "frequency": "semanal",
  "notes": null,
  "is_emergency": false,
  "items": [
    { "product_id": "uuid", "quantity": 5, "unit_price": 8.00 },
    { "product_id": "uuid", "quantity": 3, "unit_price": 10.00 }
  ]
}
```

**Regras de negócio:**

1. **Tipo do cliente:** Busca `customer_type` do cliente (PF ou PJ)
2. **Mínimo de itens:**
   - PF: busca `min_itens_assinatura_pf` em `system_settings` (fallback: `min_itens_assinatura`, default: `1`)
   - PJ: busca `min_itens_assinatura_pj` em `system_settings` (fallback: `min_itens_assinatura`, default: `1`)
   - Se `totalItems < minItens` → erro 400
3. **Pedido emergencial (`is_emergency: true`):**
   - Só permitido para clientes PJ → se PF, erro 400
   - `frequency` é definido como `null`
   - `monthly_deliveries` = `1`
4. **Cálculo de valor:**
   - `per_delivery_total` = soma de `(unit_price × quantity)` de todos os itens
   - Busca `entregas_por_recorrencia` em `system_settings` (default: `{ diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 }`)
   - `monthly_total` = `per_delivery_total × monthly_deliveries` (exceto emergencial = `per_delivery_total`)
   - `total_amount` da assinatura = `monthly_total`
5. **Itens:** `reserved_stock` = `quantity` de cada item

**Resposta (201):**
```json
{
  "success": true,
  "data": { "...assinatura completa com customer e items..." },
  "pricing": {
    "customer_type": "PJ",
    "min_items": 5,
    "is_emergency": false,
    "frequency": "semanal",
    "monthly_deliveries": 4,
    "per_delivery_total": 70.00,
    "monthly_total": 280.00
  }
}
```

**Erros possíveis:**
- `400` — `"Mínimo de X item(ns) necessário para PF/PJ"`
- `400` — `"Pedido emergencial só é permitido para clientes PJ"`

### 8.3 PUT `/api/subscriptions`

Atualizar assinatura.

| Query Param | Tipo | Descrição |
|---|---|---|
| `id` | UUID | ID da assinatura |
| `subscription_number` | string | Número da assinatura |

**Body (todos opcionais):**
```json
{
  "status": "pausada",
  "delivery_weekday": "terca",
  "delivery_time_slot": "tarde",
  "frequency": "quinzenal",
  "stripe_subscription_id": "sub_...",
  "next_delivery_date": "2025-02-01",
  "notes": "Observação",
  "total_amount": 200.00,
  "delivery_weekdays": ["terca", "quinta"]
}
```

**Valores de status:** `"ativa"`, `"pausada"`, `"cancelada"`

**Resposta (200):**
```json
{ "success": true, "data": { "...": "..." } }
```

---

## 9. Entregas — `/api/deliveries`

### GET `/api/deliveries`

Relatório diário de entregas (pedidos avulsos + assinaturas).

| Query Param | Tipo | Descrição |
|---|---|---|
| `date` | string `YYYY-MM-DD` | Data da entrega (default: hoje) |

**Regras de negócio:**
1. Busca `dias_funcionamento` em `system_settings` (default: `["segunda","terca","quarta","quinta","sexta"]`)
2. Busca `feriados` em `system_settings` (default: `[]`)
3. Se a data não é dia de funcionamento ou é feriado → retorna `working_day: false`
4. Busca pedidos (`orders`) com `delivery_date = date` e `payment_status != "cancelado"`
5. Busca entregas de assinatura (`subscription_deliveries`) com `delivery_date = date`
6. Monta lista unificada com tipo (`avulso`, `assinatura`, `emergencial`)
7. Agrupa por `time_slot` (manhã, tarde, outro)
8. Gera resumo com totais de produtos e contagem por tipo

**Resposta (200) — Dia útil:**
```json
{
  "success": true,
  "date": "2025-01-15",
  "working_day": true,
  "total_deliveries": 8,
  "summary": {
    "total_products": [
      { "name": "Galão 20L", "quantity": 25 },
      { "name": "Galão 10L", "quantity": 10 }
    ],
    "by_type": {
      "avulso": 3,
      "assinatura": 4,
      "emergencial": 1
    }
  },
  "by_time_slot": {
    "manha": [ { "...": "..." } ],
    "tarde": [ { "...": "..." } ]
  },
  "deliveries": [
    {
      "type": "avulso",
      "order_number": "ORD-a1b2c3d4",
      "customer": "João Silva",
      "customer_cpf_cnpj": "12345678901",
      "address": "Rua A, 123, Centro, Teresina, PI, CEP: 64000000",
      "time_slot": "manha",
      "delivery_status": "aguardando",
      "products": [
        { "name": "Galão 20L", "quantity": 3 }
      ],
      "total_quantity": 3,
      "total_amount": 36.00,
      "notes": null
    }
  ]
}
```

**Resposta (200) — Dia não-útil:**
```json
{
  "success": true,
  "date": "2025-01-18",
  "working_day": false,
  "message": "Sem operação nesta data",
  "deliveries": []
}
```

---

## 10. Configurações — `/api/settings`

### 10.1 GET `/api/settings`

Consultar configurações do sistema.

| Query Param | Tipo | Descrição |
|---|---|---|
| `key` | string | Filtrar por chave específica (opcional) |

**Resposta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "key": "hora_limite_entrega_dia",
      "value": "12:00",
      "description": "Hora limite para entrega no mesmo dia",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### 10.2 PUT `/api/settings`

Criar ou atualizar configuração (upsert por `key`).

| Query Param | Tipo | Descrição |
|---|---|---|
| `key` | string | **Obrigatório** — Chave da configuração |

**Body:**
```json
{
  "value": "14:00",
  "description": "Hora limite para entrega no mesmo dia"
}
```

**Regra:** Usa `upsert` com `onConflict: 'key'`, ou seja, cria se não existe, atualiza se já existe.

**Resposta (200):**
```json
{ "success": true, "data": { "...": "..." } }
```

### Chaves de configuração conhecidas

| Chave | Tipo | Default | Descrição |
|---|---|---|---|
| `hora_limite_entrega_dia` | string | `"12:00"` | Hora limite para entrega no mesmo dia |
| `feriados` | string[] | `[]` | Lista de datas `YYYY-MM-DD` de feriados |
| `dias_funcionamento` | string[] | `["segunda","terca","quarta","quinta","sexta"]` | Dias de funcionamento |
| `min_qtd_kit_preco` | number | `3` | Qtd mínima de itens para usar preço kit |
| `min_itens_assinatura` | number | `1` | Mínimo de itens para assinatura (legado) |
| `min_itens_assinatura_pf` | number | fallback para `min_itens_assinatura` | Mínimo de itens para assinatura PF |
| `min_itens_assinatura_pj` | number | fallback para `min_itens_assinatura` | Mínimo de itens para assinatura PJ |
| `entregas_por_recorrencia` | object | `{diaria:20, semanal:4, quinzenal:2, mensal:1}` | Entregas mensais por frequência |
| `mcp_enabled` | boolean | `true` | Habilitar/desabilitar MCP |
| `mcp_allowlist_tools` | string[] | todas as tools | Lista de tools MCP permitidas |
| `mcp_rate_limit_per_minute` | number | `60` | Rate limit MCP por IP por minuto |
| `n8n_token` | string | — | Token interno para comunicação API |

---

## 11. Resumo Financeiro — `/api/financial-summary`

### GET `/api/financial-summary`

Resumo financeiro consolidado.

| Query Param | Tipo | Descrição |
|---|---|---|
| `start` | string `YYYY-MM-DD` | Início do período (default: primeiro dia do mês atual) |
| `end` | string `YYYY-MM-DD` | Fim do período (default: hoje) |

**Regras:**
- Pedidos filtrados por `created_at` entre `start` e `end`
- Assinaturas: todas (sem filtro de data)
- `churn_rate` = `(canceladas / total) × 100`
- `recurring_projection` = soma de `total_amount × multiplicador_frequência` para assinaturas ativas
  - Multiplicadores: `diaria: 20`, `semanal: 4`, `quinzenal: 2`, `mensal: 1`

**Resposta (200):**
```json
{
  "success": true,
  "period": { "start": "2025-01-01", "end": "2025-01-31" },
  "data": {
    "total_orders": 50,
    "confirmed_orders": 42,
    "canceled_orders": 8,
    "total_order_revenue": 5040.00,
    "total_subscriptions": 30,
    "active_subscriptions": 25,
    "paused_subscriptions": 2,
    "canceled_subscriptions": 3,
    "total_emergency": 1,
    "churn_rate": 10.00,
    "recurring_projection": 12500.00,
    "total_revenue": 7540.00
  }
}
```

---

## 12. Contexto de Conversa — `/api/conversation-context`

Memória de estado para agentes n8n/WhatsApp.

### 12.1 GET `/api/conversation-context`

Buscar contexto de conversa por telefone.

| Query Param | Tipo | Descrição |
|---|---|---|
| `phone` | string | **Obrigatório** — Telefone (multi-variante) |

**Resposta (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "phone": "5589999308213",
    "last_intent": "criar_pedido",
    "open_order_id": "uuid",
    "open_subscription_id": null,
    "abandoned_cart": { "items": [] },
    "last_interaction_at": "2025-01-15T14:30:00Z",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

**Se não encontrado:** `data: null`

### 12.2 POST `/api/conversation-context`

Criar ou atualizar contexto de conversa (upsert por `phone`).

**Body:**
```json
{
  "phone": "5589999308213",
  "last_intent": "consultar_pedido",
  "open_order_id": "uuid",
  "open_subscription_id": null,
  "abandoned_cart": null
}
```

**Campo obrigatório:** `phone`

**Regras:**
- `phone` é limpo (apenas dígitos)
- `last_interaction_at` é definido automaticamente como `now()`
- Usa `upsert` com `onConflict: "phone"`
- Campos `open_order_id` e `open_subscription_id` aceitam `null` para limpar

**Resposta (200):**
```json
{ "success": true, "data": { "...": "..." } }
```

---

## 13. Logs de Auditoria — `/api/audit-logs`

### GET `/api/audit-logs`

Consultar logs de auditoria do sistema (`system_audit_logs`).

| Query Param | Tipo | Descrição |
|---|---|---|
| `entity_type` | string | Filtrar por tipo de entidade (ex: `order`, `subscription`) |
| `entity_id` | string | Filtrar por ID da entidade |
| `status` | string | Filtrar por status (ex: `success`, `error`) |
| `limit` | number | Limite de registros (default: `100`) |

**Ordenação:** `created_at DESC`

**Resposta (200):**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": "uuid",
      "event_type": "order_created",
      "entity_type": "order",
      "entity_id": "uuid",
      "status": "success",
      "payload_json": { "...": "..." },
      "created_at": "..."
    }
  ]
}
```

---

## 14. Validação de Documento — `/api/validate-document`

### GET `/api/validate-document`

Validar CNPJ ou CEP via Brasil API.

| Query Param | Tipo | Descrição |
|---|---|---|
| `type` | string | **Obrigatório** — `"cnpj"` ou `"cep"` |
| `value` | string | **Obrigatório** — Valor do documento |

**Regras:**
- `value` é limpo (apenas dígitos)
- CNPJ deve ter 14 dígitos → consulta `brasilapi.com.br/api/cnpj/v1/{value}`
- CEP deve ter 8 dígitos → consulta `brasilapi.com.br/api/cep/v2/{value}`

**Resposta (200) — CNPJ:**
```json
{
  "success": true,
  "data": {
    "cnpj": "12345678000199",
    "razao_social": "Empresa X LTDA",
    "nome_fantasia": "Empresa X",
    "situacao_cadastral": "ATIVA",
    "logradouro": "Rua B",
    "numero": "456",
    "complemento": "",
    "bairro": "Centro",
    "municipio": "Teresina",
    "uf": "PI",
    "cep": "64000000",
    "telefone": "8632221111",
    "email": "contato@empresa.com",
    "porte": "MICRO EMPRESA",
    "qsa": [ { "...": "..." } ],
    "raw": { "...dados completos da Brasil API..." }
  }
}
```

**Resposta (200) — CEP:**
```json
{
  "success": true,
  "data": {
    "cep": "64000000",
    "logradouro": "Praça da Bandeira",
    "bairro": "Centro",
    "cidade": "Teresina",
    "estado": "PI",
    "raw": { "...dados completos da Brasil API..." }
  }
}
```

**Erros:**
- `400` — `"CNPJ deve ter 14 dígitos"` / `"CEP deve ter 8 dígitos"` / `"Tipo inválido. Use 'cnpj' ou 'cep'"`

---

## 15. Pagamentos — `/api/payments/*`

### 15.1 POST `/api/payments/create`

Criar pagamento (proxy para edge function `create-payment`).

**Body:**
```json
{
  "type": "order",
  "order_id": "uuid",
  "subscription_id": null,
  "payment_method": "pix",
  "return_url": "https://exemplo.com/retorno"
}
```

| Campo | Tipo | Obrigatório | Valores |
|---|---|---|---|
| `type` | string | Sim | `"order"` ou `"subscription"` |
| `order_id` | UUID | Sim (se type=order) | ID do pedido |
| `subscription_id` | UUID | Sim (se type=subscription) | ID da assinatura |
| `payment_method` | string | Sim | `"cartao"` ou `"pix"` |
| `return_url` | string | Não | URL de retorno após pagamento |

**Resposta:** Depende da edge function `create-payment` (Stripe ou Pix).

### 15.2 POST `/api/payments/check`

Verificar status de pagamento (proxy para `check-pix-payment`).

**Body:**
```json
{
  "type": "order",
  "order_id": "uuid",
  "subscription_id": null
}
```

| Campo | Tipo | Obrigatório | Valores |
|---|---|---|---|
| `type` | string | Sim | `"order"` ou `"subscription"` |
| `order_id` | UUID | Sim (se type=order) | — |
| `subscription_id` | UUID | Sim (se type=subscription) | — |

### 15.3 POST/GET `/api/payments/test-pix`

Testar conexão com provedor Pix (proxy para `test-pix-connection`).

Sem body obrigatório.

---

## 16. Admin — `/api/admin/*`

### 16.1 GET `/api/admin/validate`

Validar se um telefone pertence a um administrador e retornar permissões.

| Query Param | Tipo | Descrição |
|---|---|---|
| `phone` | string | **Obrigatório** — Telefone do admin |

**Busca:** Tabela `app_users` com multi-variante de telefone.

**Resposta (200) — Encontrado:**
```json
{
  "success": true,
  "user_exists": true,
  "user_id": "uuid (auth.users)",
  "app_user_id": "uuid (app_users)",
  "name": "Admin Fulano",
  "role": "Super Admin",
  "permissions": ["orders.cancel", "subscriptions.cancel", "settings.edit", "..."],
  "status": "ativo"
}
```

**Regras:**
- Se a role contém "admin" (case-insensitive) E tem mais de 20 permissões → `permissions: ["*"]` (wildcard)
- Aplica overrides de `user_permission_overrides`:
  - `effect: "deny"` → remove a permissão
  - `effect: "allow"` → adiciona a permissão

**Resposta (200) — Não encontrado:**
```json
{ "success": true, "user_exists": false }
```

### 16.2 GET `/api/admin/permissions`

Consultar permissões de um admin por telefone.

| Query Param | Tipo | Descrição |
|---|---|---|
| `phone` | string | **Obrigatório** |

**Resposta (200):**
```json
{
  "success": true,
  "role": "Super Admin",
  "permissions": ["orders.cancel", "orders.view", "..."]
}
```

**Resposta (404):**
```json
{ "success": false, "error": "Usuário não encontrado" }
```

### 16.3 POST `/api/admin/confirm`

Registrar solicitação de confirmação para ação sensível.

**Body:**
```json
{
  "admin_phone": "5589999308213",
  "command_type": "cancel_order",
  "target_id": "uuid-do-pedido"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `admin_phone` | string | Sim | Telefone do admin |
| `command_type` | string | Sim | Tipo do comando |
| `target_id` | UUID | Não | ID do recurso alvo |

**Tipos de comando e permissões requeridas:**

| command_type | Permissão requerida |
|---|---|
| `cancel_order` | `orders.cancel` |
| `cancel_subscription` | `subscriptions.cancel` |
| `pause_subscription` | `subscriptions.pause` |
| `update_settings` | `settings.edit` |
| `revoke_token` | `tokens.revoke` |
| `suspend_user` | `users.suspend` |

**Resposta (201):**
```json
{ "success": true, "confirmation_id": "uuid", "status": "pending" }
```

**Erros:**
- `404` — `"Admin não encontrado"`
- `403` — `"Usuário não está ativo"` ou `"Permissão 'X' não encontrada para este usuário"`

### 16.4 POST `/api/admin/execute`

Executar ação administrativa após confirmação.

**Body:**
```json
{
  "admin_phone": "5589999308213",
  "command": "cancel_order",
  "target_id": "uuid-ou-order-number",
  "reason": "Motivo do cancelamento"
}
```

**Fluxo de execução:**
1. Verifica se admin existe e está ativo
2. Busca `admin_confirmations` pendentes para este admin + comando
3. Se não há confirmação pendente → erro 400
4. Executa a ação

**Comandos suportados:**

| Comando | Ação | target_id |
|---|---|---|
| `cancel_order` | Cancela pedido (status → `"cancelado"`, registra `cancelled_at`, `cancelled_by`, `cancellation_reason`) | UUID do pedido ou `order_number` |
| `cancel_subscription` | Define status como `"cancelada"` | UUID da assinatura |
| `pause_subscription` | Define status como `"pausada"` | UUID da assinatura |

5. Atualiza confirmação: `confirmation_received: true`, `confirmed_at`, `executed_at`, `execution_status`, `status`
6. Registra em `audit_logs`

**Resposta (200) — Sucesso:**
```json
{
  "success": true,
  "command": "cancel_order",
  "target_id": "ORD-a1b2c3d4",
  "result": { "...dados do recurso atualizado..." },
  "confirmation_id": "uuid"
}
```

### 16.5 GET `/api/admin/users`

Listar todos os usuários administrativos.

**Resposta (200):**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "uuid (app_users)",
      "user_id": "uuid (auth.users)",
      "name": "Admin Fulano",
      "phone": "+5589999308213",
      "email": "admin@email.com",
      "role": "Super Admin",
      "status": "ativo"
    }
  ]
}
```

---

## 17. MCP — `/api/mcp/*`

Model Context Protocol — interface para integração com agentes IA.

> **Nota:** Existe também a função dedicada `mcp-hub` em `https://infresxpaglulwiooanc.supabase.co/functions/v1/mcp-hub` com suporte a ambientes `prod`/`hml`, autenticação Bearer token separada por ambiente e envio de eventos para n8n via webhook. Para uso pelo n8n, recomenda-se `/api/mcp/*` (autenticação por `x-api-key`).

### 17.1 GET `/api/mcp/health`

Health check (não requer MCP habilitado).

**Resposta (200):**
```json
{
  "ok": true,
  "timestamp": "2025-01-15T14:30:00.000Z",
  "version": "mcp-v1"
}
```

### 17.2 GET `/api/mcp/tools`

Listar ferramentas MCP disponíveis.

**Regras:**
- Requer MCP habilitado (`mcp_enabled: true`)
- Filtra por `mcp_allowlist_tools` (se configurado; caso contrário, todas)
- Rate limit por IP

**Resposta (200):**
```json
{
  "ok": true,
  "tools": [
    { "name": "lovable.customers.getByPhone", "description": "Buscar cliente por telefone", "args": { "phone": "string (obrigatório)" } },
    { "name": "lovable.customers.getByCpfCnpj", "description": "Buscar cliente por CPF/CNPJ", "args": { "cpf_cnpj": "string (obrigatório)" } },
    { "name": "lovable.customers.create", "description": "Criar novo cliente", "args": { "payload": "object (name, cpf_cnpj, phone obrigatórios)" } },
    { "name": "lovable.customers.update", "description": "Atualizar cliente", "args": { "id": "string?", "cpf_cnpj": "string?", "payload": "object" } },
    { "name": "lovable.products.list", "description": "Listar produtos", "args": { "include_inactive": "boolean?" } },
    { "name": "lovable.products.getByCode", "description": "Buscar produto por código", "args": { "code": "string (obrigatório)" } },
    { "name": "lovable.products.create", "description": "Criar produto", "args": { "payload": "object (name obrigatório)" } },
    { "name": "lovable.products.update", "description": "Atualizar produto", "args": { "id": "string?", "code": "string?", "payload": "object" } },
    { "name": "lovable.products.lowStock", "description": "Produtos com estoque baixo", "args": {} },
    { "name": "lovable.orders.create", "description": "Criar pedido", "args": { "payload": "object" } },
    { "name": "lovable.orders.get", "description": "Consultar pedidos", "args": { "id": "string?", "order_number": "string?", "customer_id": "string?" } },
    { "name": "lovable.orders.cancel", "description": "Cancelar pedido", "args": { "id": "string?", "order_number": "string?", "reason": "string (obrigatório)" } },
    { "name": "lovable.deliveries.getByDate", "description": "Entregas por data", "args": { "date": "string YYYY-MM-DD (obrigatório)" } },
    { "name": "lovable.subscriptions.create", "description": "Criar assinatura", "args": { "payload": "object" } },
    { "name": "lovable.subscriptions.get", "description": "Consultar assinaturas", "args": { "id": "string?", "subscription_number": "string?", "customer_id": "string?" } },
    { "name": "lovable.subscriptions.update", "description": "Atualizar assinatura", "args": { "id": "string?", "subscription_number": "string?", "payload": "object" } },
    { "name": "lovable.subscriptions.cancel", "description": "Cancelar assinatura", "args": { "id": "string?", "subscription_number": "string?", "reason": "string (obrigatório)" } },
    { "name": "lovable.settings.get", "description": "Consultar configurações", "args": { "key": "string?" } },
    { "name": "lovable.settings.set", "description": "Definir configuração", "args": { "key": "string (obrigatório)", "value": "any", "description": "string?" } }
  ]
}
```

### 17.3 POST `/api/mcp/call`

Executar uma ferramenta MCP.

**Body:**
```json
{
  "tool": "lovable.customers.getByPhone",
  "args": { "phone": "5589999308213" },
  "trace_id": "opcional-uuid"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `tool` | string | Sim | Nome da ferramenta |
| `args` | object | Não | Argumentos da ferramenta |
| `trace_id` | string | Não | ID de rastreio (gerado automaticamente se omitido) |

**Regras:**
- Verifica se tool está na allowlist → 403 se não
- Executa via acesso direto ao DB (sem loop HTTP)
- Registra em `mcp_audit_logs` (sucesso e erro)

**Resposta (200):**
```json
{
  "ok": true,
  "trace_id": "uuid",
  "result": { "success": true, "data": [] }
}
```

#### Detalhes de cada MCP Tool:

| Tool | Ação | Args |
|---|---|---|
| `lovable.customers.getByPhone` | `SELECT * FROM customers WHERE phone = digits` | `phone` |
| `lovable.customers.getByCpfCnpj` | `SELECT * FROM customers WHERE cpf_cnpj = digits` | `cpf_cnpj` |
| `lovable.customers.create` | `INSERT INTO customers` | `payload: { name, cpf_cnpj, phone, email?, customer_type?, street?, number?, complement?, neighborhood?, city?, state?, zip_code? }` |
| `lovable.customers.update` | `UPDATE customers WHERE id/cpf_cnpj` | `id?`, `cpf_cnpj?`, `payload: { ...campos }` |
| `lovable.products.list` | `SELECT * FROM products` (ativos por default) | `include_inactive?` |
| `lovable.products.getByCode` | `SELECT * FROM products WHERE code = X` | `code` |
| `lovable.products.create` | `INSERT INTO products` | `payload: { name, description?, images?, price_single?, price_kit?, price_subscription?, stock?, stock_min?, stock_max?, active? }` |
| `lovable.products.update` | `UPDATE products WHERE id/code` | `id?`, `code?`, `payload: { ...campos }` |
| `lovable.products.lowStock` | Produtos ativos com `stock ≤ stock_min` e `stock_min > 0` | — |
| `lovable.orders.get` | `SELECT * FROM orders` com joins | `id?`, `order_number?`, `customer_id?` |
| `lovable.orders.create` | `INSERT INTO orders` (simples, sem itens) | `payload: { customer_id, payment_method?, notes?, total_amount? }` |
| `lovable.orders.cancel` | Soft cancel: status → cancelado | `id?`, `order_number?`, `reason?` |
| `lovable.deliveries.getByDate` | Pedidos + assinaturas por data | `date` (YYYY-MM-DD) |
| `lovable.subscriptions.get` | `SELECT * FROM subscriptions` com joins | `id?`, `subscription_number?`, `customer_id?` |
| `lovable.subscriptions.create` | `INSERT INTO subscriptions` (simples, sem itens) | `payload: { customer_id, delivery_weekday, delivery_time_slot?, frequency?, notes?, total_amount?, is_emergency?, delivery_weekdays? }` |
| `lovable.subscriptions.update` | `UPDATE subscriptions WHERE id/number` | `id?`, `subscription_number?`, `payload: { ...campos }` |
| `lovable.subscriptions.cancel` | Define `status: "cancelada"` e notas | `id?`, `subscription_number?`, `reason?` |
| `lovable.settings.get` | `SELECT * FROM system_settings` | `key?` |
| `lovable.settings.set` | `UPSERT system_settings` | `key`, `value`, `description?` |

### 17.4 POST `/api/mcp/events/publish`

Publicar evento MCP (registrado em audit logs).

**Body:**
```json
{
  "type": "order_created",
  "payload": { "order_id": "uuid", "...": "..." },
  "trace_id": "opcional-uuid"
}
```

**Resposta (200):**
```json
{ "ok": true, "trace_id": "uuid" }
```

---

## 18. Códigos de Erro Globais

| Status | Descrição |
|---|---|
| `200` | Sucesso |
| `201` | Recurso criado com sucesso |
| `400` | Requisição inválida (campo obrigatório ausente, validação falhou) |
| `401` | API key inválida ou ausente / Credenciais inválidas |
| `403` | MCP desativado / Tool não permitida / Permissão insuficiente / Usuário inativo/suspenso |
| `404` | Recurso ou rota não encontrada |
| `405` | Método HTTP não permitido |
| `409` | Conflito (duplicata, ex: CPF/CNPJ já cadastrado) |
| `429` | Rate limit excedido (MCP) |
| `500` | Erro interno do servidor |

**Formato padrão de erro:**
```json
{ "error": "Mensagem descritiva do erro" }
```

---

## 19. Enums do Banco de Dados

| Enum | Valores |
|---|---|
| `customer_type` | `PF`, `PJ` |
| `delivery_status` | `aguardando`, `em_rota`, `entregue`, `cancelado` |
| `payment_method` | `pix`, `cartao`, `boleto`, `stripe` |
| `payment_status` | `pendente`, `confirmado`, `recusado`, `cancelado` |
| `subscription_frequency` | `diaria`, `semanal`, `quinzenal`, `mensal` |
| `subscription_status` | `ativa`, `pausada`, `cancelada` |
| `time_slot` | `manha`, `tarde` |
| `weekday` | `domingo`, `segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado` |

---

## 20. Rotas Disponíveis (resumo)

### Endpoints independentes (fora da API principal)

```
POST   https://infresxpaglulwiooanc.supabase.co/functions/v1/auth-login
         Body: { login, senha }
         Auth: nenhuma (endpoint público)

POST   https://infresxpaglulwiooanc.supabase.co/functions/v1/admin-create-user
         Body: { email, password, name, ... }
         Auth: Bearer token de admin (Supabase session)
```

### API principal — `https://infresxpaglulwiooanc.supabase.co/functions/v1/api`

> **Auth:** `x-api-key: <N8N_API_KEY>`

```
# Produtos
GET    /api/products
GET    /api/products?id=...
GET    /api/products?code=...
GET    /api/products?include_inactive=true
POST   /api/products
PUT    /api/products?id=...
PUT    /api/products?code=...
DELETE /api/products?id=...
DELETE /api/products?code=...

# Estoque Baixo
GET    /api/products-low-stock

# Clientes
GET    /api/customers
GET    /api/customers?id=...
GET    /api/customers?phone=...
GET    /api/customers?cpf_cnpj=...
POST   /api/customers
PUT    /api/customers?id=...
PUT    /api/customers?cpf_cnpj=...
DELETE /api/customers?id=...
DELETE /api/customers?cpf_cnpj=...

# Pedidos
GET    /api/orders
GET    /api/orders?id=...
GET    /api/orders?order_number=...
GET    /api/orders?customer_id=...
POST   /api/orders
PUT    /api/orders?id=...
PUT    /api/orders?order_number=...
DELETE /api/orders?id=...
DELETE /api/orders?order_number=...

# Assinaturas
GET    /api/subscriptions
GET    /api/subscriptions?id=...
GET    /api/subscriptions?subscription_number=...
GET    /api/subscriptions?customer_id=...
POST   /api/subscriptions
PUT    /api/subscriptions?id=...
PUT    /api/subscriptions?subscription_number=...

# Entregas
GET    /api/deliveries
GET    /api/deliveries?date=YYYY-MM-DD

# Configurações
GET    /api/settings
GET    /api/settings?key=...
PUT    /api/settings?key=...

# Financeiro
GET    /api/financial-summary
GET    /api/financial-summary?start=YYYY-MM-DD&end=YYYY-MM-DD

# Contexto de Conversa (memória n8n)
GET    /api/conversation-context?phone=...
POST   /api/conversation-context

# Auditoria
GET    /api/audit-logs
GET    /api/audit-logs?entity_type=...&status=...&limit=100

# Validação de Documentos
GET    /api/validate-document?type=cnpj&value=...
GET    /api/validate-document?type=cep&value=...

# Pagamentos
POST   /api/payments/create
POST   /api/payments/check
POST   /api/payments/test-pix

# Admin (via WhatsApp/n8n)
GET    /api/admin/validate?phone=...
GET    /api/admin/permissions?phone=...
POST   /api/admin/confirm
POST   /api/admin/execute
GET    /api/admin/users

# MCP
GET    /api/mcp/health
GET    /api/mcp/tools
POST   /api/mcp/call
POST   /api/mcp/events/publish
```
