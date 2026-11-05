import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Store, CommercialDb } from "../db/store";
import { user, organizations, memberships, preferences } from "../db/schema";
import type { Actor, Context } from "../organizations/service";
import { DomainError } from "../core/errors";

export const workspaceId = (id: string) =>
  createHash("sha256")
    .update(`agromax:legacy-workspace:${id}`)
    .digest("hex")
    .slice(0, 32);

// A projection of real, owned source records. Original accounts, sessions and
// parcel writes remain authoritative in the existing production tables.
export async function projectWorkspace(
  store: Store,
  actor: Actor,
): Promise<Context> {
  const orgId = workspaceId(actor.id);
  await store.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`workspace:${actor.id}`}))`,
    );
    await tx
      .insert(user)
      .values({
        id: actor.id,
        name: actor.name,
        email: actor.email,
        emailVerified: false,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: { name: actor.name, email: actor.email },
      });
    await tx
      .insert(organizations)
      .values({ id: orgId, name: `${actor.name.slice(0, 65)} · çalışma alanı` })
      .onConflictDoNothing();
    await tx
      .insert(memberships)
      .values({
        id: workspaceId(`member:${actor.id}`),
        organizationId: orgId,
        userId: actor.id,
        role: "owner",
      })
      .onConflictDoNothing();
    await tx
      .insert(preferences)
      .values({ userId: actor.id, activeOrganizationId: orgId })
      .onConflictDoNothing();
    const collisions = await tx.execute(
      sql`select f.id from farm_records f join records r on r.id=f.id where r.user_id=${actor.id} and f.user_id<>${orgId} limit 1`,
    );
    if ((collisions as unknown as { rows: unknown[] }).rows.length)
      throw new DomainError(
        "PROJECTION_CONFLICT",
        "Kayıt sahipliği doğrulanamadı.",
        409,
      );
    await tx.execute(
      sql`insert into farm_records(id,user_id,kind,body) select id,${orgId},kind,body from records where user_id=${actor.id} on conflict(id) do update set body=excluded.body,kind=excluded.kind where farm_records.user_id=excluded.user_id`,
    );
    await tx.execute(
      sql`insert into farm_analyses(field_id,geometry_hash,body) select a.field_id,a.geometry_hash,a.body from analyses a join records r on r.id=a.field_id where r.user_id=${actor.id} on conflict(field_id) do update set geometry_hash=excluded.geometry_hash,body=excluded.body`,
    );
    await tx.execute(
      sql`insert into farm_analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at,started_at,finished_at,result,error) select id,${orgId},field_id,geometry_hash,snapshot,state,created_at,started_at,finished_at,result,error from analysis_jobs where user_id=${actor.id} on conflict(id) do update set state=excluded.state,result=excluded.result,error=excluded.error,started_at=excluded.started_at,finished_at=excluded.finished_at where farm_analysis_jobs.user_id=excluded.user_id`,
    );
  });
  const result = await store.raw.query(
    "select * from organizations where id=$1",
    [orgId],
  );
  const row = result.rows[0]!;
  return {
    actor,
    role: "owner",
    organization: {
      id: orgId,
      name: String(row.name),
      countryCode: String(row.country_code),
      locale: String(row.locale),
      timezone: String(row.timezone),
      createdAt: new Date(String(row.created_at)),
    },
  };
}

export async function publishConfirmedTask(
  db: CommercialDb,
  ctx: Context,
  resultId: string,
) {
  await db.execute(
    sql`insert into records(id,user_id,kind,body) select id,${ctx.actor.id},kind,body from farm_records where id=${resultId} and user_id=${ctx.organization.id} and kind='task' on conflict(id) do nothing`,
  );
}
