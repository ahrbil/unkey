import { db, eq, schema } from "@/lib/db";
import { ingestAuditLogs } from "@/lib/tinybird";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auth, t } from "../../trpc";

export const updateKeyOwnerId = t.procedure
  .use(auth)
  .input(
    z.object({
      keyId: z.string(),
      ownerId: z.string().nullish(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const key = await db.query.keys.findFirst({
      where: (table, { eq, and, isNull }) =>
        and(eq(table.id, input.keyId), isNull(table.deletedAt)),
      with: {
        workspace: true,
      },
    });
    if (!key || key.workspace.tenantId !== ctx.tenant.id) {
      throw new TRPCError({ message: "key not found", code: "NOT_FOUND" });
    }
    await db
      .update(schema.keys)
      .set({
        ownerId: input.ownerId ?? null,
      })
      .where(eq(schema.keys.id, key.id));
    await ingestAuditLogs({
      workspaceId: key.workspace.id,
      actor: {
        type: "user",
        id: ctx.user.id,
      },
      event: "key.update",
      description: `Changed ownerId of ${key.id} to ${input.ownerId}`,
      resources: [
        {
          type: "key",
          id: key.id,
        },
      ],
      context: {
        location: ctx.audit.location,
        userAgent: ctx.audit.userAgent,
      },
    });

    return true;
  });
