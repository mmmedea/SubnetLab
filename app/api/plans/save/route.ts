import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { details, vlsm } from "@/lib/subnet/ipv4";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireSameOrigin } from "@/utils/security/require-same-origin";

const savePlanSchema = z.object({
  name: z.string().trim().min(1).max(100),
  cidr: z.string().trim().min(1).max(64),
  requirements: z.array(z.object({
    name: z.string().trim().min(1).max(50),
    hosts: z.number().int().min(1).max(1_000_000_000),
  }).strict()).max(50),
  emailOwner: z.boolean().optional().default(false),
}).strict();

function errorResponse(message = "Could not save this plan.", status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) return errorResponse("Could not save this plan.", 403);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse("Could not save this plan.", 401);

  const { data: emailOtpVerified, error: emailOtpError } =
    await supabase.rpc("is_email_otp_session_verified");
  if (emailOtpError || !emailOtpVerified) {
    return errorResponse("Verify your email with the six-digit OTP before continuing.", 403);
  }

  const { data: securityProfile, error: securityProfileError } = await supabase
    .from("profiles")
    .select("password_configured_at")
    .eq("id", user.id)
    .maybeSingle();
  if (securityProfileError || !securityProfile?.password_configured_at) {
    return errorResponse("Set your SubnetLab password before continuing.", 403);
  }

  const admin = createAdminClient();
  if (!admin) return errorResponse("Could not save this plan.", 503);

  const rateLimitKey = createHash("sha256")
    .update("plan-save:user:" + user.id)
    .digest("hex");
  const { data: rateLimit, error: rateLimitError } = await admin.rpc(
    "consume_api_rate_limit",
    { p_key_hash: rateLimitKey, p_limit: 20, p_window_seconds: 3600 },
  );
  if (
    rateLimitError ||
    !rateLimit ||
    typeof rateLimit !== "object" ||
    typeof rateLimit.allowed !== "boolean"
  ) {
    return errorResponse("Could not save this plan.", 503);
  }
  if (!rateLimit.allowed) return errorResponse("Could not save this plan.", 429);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Could not save this plan.", 400);
  }

  const parsed = savePlanSchema.safeParse(rawBody);
  if (!parsed.success) return errorResponse("Could not save this plan.", 400);

  let base: ReturnType<typeof details>;
  let blocks: ReturnType<typeof vlsm>;
  try {
    base = details(parsed.data.cidr);
    blocks = vlsm(
      base.network + "/" + base.prefix,
      parsed.data.requirements,
    );
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Could not save this plan.",
      400,
    );
  }

  const canonicalCidr = base.network + "/" + base.prefix;
  const allocations = blocks.map((block) => ({
    segment: block.name,
    network: block.network,
    prefix: block.prefix,
    hosts: block.hosts,
    start_num: block.start.toString(),
    end_num: block.end.toString(),
    notes: "",
  }));

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || !/^[A-Za-z0-9:_-]{1,128}$/.test(idempotencyKey)) {
    return errorResponse("Could not save this plan.", 400);
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify({
      userId: user.id,
      name: parsed.data.name,
      cidr: canonicalCidr,
      requirements: parsed.data.requirements,
      emailOwner: parsed.data.emailOwner,
    }))
    .digest("hex");

  const { data, error } = await admin.rpc("save_plan_with_outbox", {
    p_user_id: user.id,
    p_name: parsed.data.name,
    p_cidr: canonicalCidr,
    p_ip_version: 4,
    p_allocations: allocations,
    p_dedupe_key: idempotencyKey,
    p_request_hash: requestHash,
    p_email_owner: parsed.data.emailOwner,
  });

  if (error) {
    const message = error.code === "23P01"
      ? "The plan could not save its VLSM allocations: " + error.message
      : error.message || "Could not save this plan.";
    return errorResponse(message, 400);
  }

  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.plan_id || !saved?.event_id) {
    return errorResponse("Could not save this plan.", 500);
  }

  return NextResponse.json({
    plan: {
      id: saved.plan_id,
      name: saved.plan_name,
      cidr: saved.cidr,
      ip_version: saved.ip_version,
      updated_at: saved.updated_at,
    },
    allocationCount: saved.allocation_count,
  });
}