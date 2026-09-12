import { NextResponse } from "next/server";
import {
  deleteCourse,
  getCourse,
  updateCourse,
} from "@/lib/courses-store";
import type { CourseInput } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = await getCourse(id);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({ course });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: CourseInput;

  try {
    body = (await request.json()) as CourseInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await updateCourse(id, body);
  if (result.notFound) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    course: result.course,
    message: "Course updated successfully.",
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await deleteCourse(id);
  if (result.notFound) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({ message: "Course removed successfully." });
}
