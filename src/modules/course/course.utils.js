import { prisma } from "../../../db/index.js";

// Create any missing course records for the teacher's declared offerings.
export const syncTeacherCourses = async (teacherId, offerings, transaction = prisma) => {
  await Promise.all(
    offerings.map(({ trackId, subjectId }) =>
      transaction.course.upsert({
        where: {
          teacherId_trackId_subjectId: { teacherId, trackId, subjectId },
        },
        update: {},
        create: { teacherId, trackId, subjectId },
      })
    )
  );
};
