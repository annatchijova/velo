import { describe, expect, it } from "vitest";
import { loadAllCases } from "@/lib/corpus";

/**
 * ADR-002 (docs/ADRS_001_006.md): the corpus is served statically at build
 * time so the Vercel serverless runtime never needs the repository
 * filesystem at request time. These tests pin the route-config exports that
 * make that true — removing any of them would silently re-break deployment.
 *
 * AC-J1.2 deployment precondition.
 */

type RouteConfig = {
  runtime?: string;
  dynamic?: string;
  generateStaticParams?: () => Promise<Array<{ id: string }>>;
};

describe("corpus API routes are build-time static (ADR-002)", () => {
  it("/api/cases exports nodejs runtime and force-static", async () => {
    const route = (await import("@/app/api/cases/route")) as unknown as RouteConfig;
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-static");
  });

  it("/api/peritos exports nodejs runtime and force-static", async () => {
    const route = (await import("@/app/api/peritos/route")) as unknown as RouteConfig;
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-static");
  });

  it("/api/cases/[id] exports nodejs runtime and force-static", async () => {
    const route = (await import("@/app/api/cases/[id]/route")) as unknown as RouteConfig;
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-static");
  });

  it("/api/cases/[id] enumerates exactly the corpus in generateStaticParams", async () => {
    const route = (await import("@/app/api/cases/[id]/route")) as unknown as RouteConfig;
    expect(route.generateStaticParams).toBeTypeOf("function");
    const params = await route.generateStaticParams!();
    const ids = loadAllCases().map((c) => c.case_id);
    expect(params.map((p) => p.id).sort()).toEqual([...ids].sort());
  });
});
