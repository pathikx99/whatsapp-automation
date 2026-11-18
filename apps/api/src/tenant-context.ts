import { FastifyRequest, FastifyReply } from 'fastify';
import {
  getMultiTenantRepository,
  TenantType,
  TenantIsolationMode,
  BusinessRole,
  TenantRecord,
} from '@whatsapp-platform/database';
import { verifySupabaseJwt, SupabaseAuthClaims } from '@whatsapp-platform/shared';

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantType: TenantType;
  isolationMode: TenantIsolationMode;
  userId: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  platformRole?: 'platform_owner' | 'platform_admin' | 'platform_support';
  businessRole?: BusinessRole;
  permissions: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext;
  }
}

/**
 * Resolves the authenticated user's tenant context from cryptographically verified Supabase Auth JWTs.
 * Enforces server-side authentication, active status, membership, and RBAC boundaries.
 */
export async function resolveTenantContext(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const multiTenantRepo = getMultiTenantRepository();

  // 1. Mandatory Cryptographic Authentication
  // Reject all unauthenticated requests with HTTP 401. Never default anonymous requests.
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication token required (Bearer JWT)',
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  let claims: SupabaseAuthClaims;
  try {
    claims = await verifySupabaseJwt(token);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid or expired token';
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: `Authentication failed: ${msg}`,
    });
    return;
  }

  // 2. Resolve User Identity from Verified Claims ONLY
  // Discard all client-provided identity headers (x-user-email, unverified role headers)
  const userId = claims.sub;
  const userEmail = claims.email.toLowerCase();

  // Load platform user from trusted persisted records (lookup by verified userId or verified email)
  let platformUser = await multiTenantRepo.getPlatformUserById(userId);
  if (!platformUser) {
    const byEmail = await multiTenantRepo.getPlatformUserByEmail(userEmail);
    if (byEmail && byEmail.id === userId) {
      platformUser = byEmail;
    }
  }

  // Active platform user check
  if (platformUser && !platformUser.isActive) {
    reply.status(403).send({
      statusCode: 403,
      error: 'UserInactive',
      message: `Platform user account '${userEmail}' is deactivated`,
    });
    return;
  }

  // Platform admin is granted strictly if verified user ID matches active persisted platform user
  const isPlatformAdmin = Boolean(platformUser && platformUser.isActive);
  const platformRole = isPlatformAdmin ? platformUser?.role : undefined;

  // 3. Resolve Target Tenant
  const isPlatformRoute = req.url.startsWith('/api/platform');
  if (isPlatformRoute && !isPlatformAdmin) {
    reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Platform administrator privileges required',
    });
    return;
  }

  const headerTenantId = req.headers['x-tenant-id'];
  const headerTenantSlug = req.headers['x-tenant-slug'];
  const queryTenantId = (req.query as Record<string, string> | undefined)?.tenantId;
  const paramTenantId = (req.params as Record<string, string> | undefined)?.tenantId;

  let targetTenantId =
    (typeof headerTenantId === 'string' && headerTenantId.length > 0 && headerTenantId) ||
    (typeof queryTenantId === 'string' && queryTenantId.length > 0 && queryTenantId) ||
    (typeof paramTenantId === 'string' && paramTenantId.length > 0 && paramTenantId);

  let tenant: TenantRecord | null = null;

  if (targetTenantId) {
    tenant = await multiTenantRepo.getTenantById(targetTenantId);
    if (!tenant) {
      tenant = await multiTenantRepo.getTenantBySlug(targetTenantId);
    }
    if (!tenant) {
      reply.status(404).send({
        statusCode: 404,
        error: 'TenantNotFound',
        message: `Tenant '${targetTenantId}' does not exist`,
      });
      return;
    }
  } else if (typeof headerTenantSlug === 'string' && headerTenantSlug.length > 0) {
    tenant = await multiTenantRepo.getTenantBySlug(headerTenantSlug);
    if (!tenant) {
      reply.status(404).send({
        statusCode: 404,
        error: 'TenantNotFound',
        message: `Tenant '${headerTenantSlug}' does not exist`,
      });
      return;
    }
  } else {
    // If no target tenant explicitly supplied in request:
    // If platform route or platform admin on control plane, default to platform tenant
    if (isPlatformRoute || isPlatformAdmin) {
      tenant = await multiTenantRepo.getTenantById('00000000-0000-0000-0000-000000000000');
    } else {
      // Find user's active tenant membership from trusted persistent records
      const userMemberships = await multiTenantRepo.listMembershipsForUser(userId, userEmail);
      const activeMem = userMemberships.find((m) => m.isActive);
      if (activeMem) {
        tenant = await multiTenantRepo.getTenantById(activeMem.tenantId);
      }
    }
  }

  if (!tenant) {
    reply.status(404).send({
      statusCode: 404,
      error: 'TenantNotFound',
      message: 'No accessible tenant could be resolved for authenticated user',
    });
    return;
  }

  // 4. Validate Membership and Access Boundaries
  // Membership is verified against persistent records; client-provided roles are ignored
  let membership = await multiTenantRepo.getMembershipByUserId(tenant.id, userId);
  if (!membership) {
    membership = await multiTenantRepo.getMembership(tenant.id, userEmail);
  }

  // If user is a member, verify active user status
  if (membership && !membership.isActive) {
    reply.status(403).send({
      statusCode: 403,
      error: 'UserInactive',
      message: `User '${userEmail}' account is deactivated in tenant '${tenant.slug}'`,
    });
    return;
  }

  // Non-platform-admin users MUST have active membership in the target tenant.
  // Blocks cross-tenant access (Tenant A accessing Tenant B) and unauthorized tenant switching!
  if (!isPlatformAdmin) {
    if (!membership || !membership.isActive) {
      reply.status(403).send({
        statusCode: 403,
        error: 'TenantAccessDenied',
        message: `User '${userEmail}' has no membership in tenant '${tenant.slug}'`,
      });
      return;
    }
  }

  // Suspended tenant protection
  if (tenant.status === 'suspended' && !isPlatformAdmin) {
    reply.status(403).send({
      statusCode: 403,
      error: 'TenantSuspended',
      message: `Tenant '${tenant.name}' is currently suspended. Please contact platform support.`,
    });
    return;
  }

  // Roles and permissions are separated between platform and tenant
  const businessRole = membership?.role || (isPlatformAdmin && tenant.tenantType === 'internal' ? 'business_owner' : undefined);
  const permissions = membership?.permissions || (isPlatformAdmin ? ['*'] : []);

  req.tenantContext = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tenantType: tenant.tenantType,
    isolationMode: tenant.isolationMode,
    userId,
    userEmail,
    isPlatformAdmin,
    platformRole,
    businessRole,
    permissions,
  };
}

/**
 * Route preHandler that requires verified platform-level role.
 */
export function requirePlatformRole(
  ...allowedRoles: Array<'platform_owner' | 'platform_admin' | 'platform_support'>
) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.tenantContext) {
      await resolveTenantContext(req, reply);
      if (reply.sent) return;
    }

    const ctx = req.tenantContext!;
    if (!ctx.isPlatformAdmin || !ctx.platformRole) {
      reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Platform administrator privileges required',
      });
      return;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(ctx.platformRole)) {
      reply.status(403).send({
        statusCode: 403,
        error: 'InsufficientPlatformRole',
        message: `Requires one of [${allowedRoles.join(', ')}], user has '${ctx.platformRole}'`,
      });
      return;
    }
  };
}

/**
 * Route preHandler that requires specific business workspace role.
 */
export function requireTenantRole(...allowedRoles: BusinessRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.tenantContext) {
      await resolveTenantContext(req, reply);
      if (reply.sent) return;
    }

    const ctx = req.tenantContext!;
    if (ctx.isPlatformAdmin && (ctx.platformRole === 'platform_owner' || ctx.platformRole === 'platform_admin')) {
      return; // Platform owner/admin can administer business workspaces
    }

    if (!ctx.businessRole || !allowedRoles.includes(ctx.businessRole)) {
      reply.status(403).send({
        statusCode: 403,
        error: 'InsufficientRole',
        message: `Tenant action requires one of [${allowedRoles.join(', ')}], current role is '${ctx.businessRole || 'none'}'`,
      });
      return;
    }
  };
}
