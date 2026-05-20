import { NextResponse } from "next/server";
import { verifyCandidate } from "@/lib/safety";
import type { SafetyMode, VerificationInput } from "@/lib/safety";

function parseMode(value: unknown): SafetyMode {
  return value === "balanced" ? "balanced" : "strict";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<VerificationInput>;

    if (!body.userPrompt?.trim() || !body.modelOutput?.trim()) {
      return NextResponse.json(
        {
          error:
            "Both userPrompt and modelOutput are required to run verification.",
        },
        { status: 400 },
      );
    }

    const report = verifyCandidate({
      userPrompt: body.userPrompt,
      modelOutput: body.modelOutput,
      mode: parseMode(body.mode),
    });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json(
      { error: "Unable to verify the candidate output." },
      { status: 500 },
    );
  }
}
