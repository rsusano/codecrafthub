import { NextResponse } from "next/server";
import {
  createCourse,
  listCourses,
  replaceCourses,
} from "@/lib/courses-store";
import type { CourseInput } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const courses = await listCourses();
  return NextResponse.json({ courses });
}

export async function POST(request: Request) {
  let body: CourseInput | { import?: boolean; courses?: CourseInput[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    body &&
    typeof body === "object" &&
    "import" in body &&
    body.import === true
  ) {
    const result = await replaceCourses(body.courses ?? []);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      courses: result.courses,
      message: `Imported ${result.courses.length} courses.`,
    });
  }

  const result = await createCourse(body as CourseInput);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    { course: result.course, message: "Course added successfully." },
    { status: 201 },
  );
}
