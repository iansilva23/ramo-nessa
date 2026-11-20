export type DriverPhotoPolicy = {
  startsAt: Date | null;
  deadlineAt: Date | null;
  reviewGraceHours: number;
};

export type DriverPhotoReadiness = {
  approved: number;
  submittedOnTime: number;
};

export function driverPhotoWorkStatus(
  policy: DriverPhotoPolicy,
  profileCreatedAt: Date,
  photos: DriverPhotoReadiness,
  now: Date,
) {
  const { startsAt, deadlineAt, reviewGraceHours } = policy;
  if (!startsAt || !deadlineAt || now < startsAt) {
    return { state: 'off', allowed: true, deadline: null } as const;
  }
  const deadline = profileCreatedAt >= startsAt ? null : deadlineAt;
  if (photos.approved === 5) return { state: 'approved', allowed: true, deadline } as const;
  if (deadline && now < deadline) return { state: 'notice', allowed: true, deadline } as const;
  const graceEnd = deadline && new Date(deadline.getTime() + reviewGraceHours * 3600_000);
  if (graceEnd && now < graceEnd && photos.submittedOnTime === 5) {
    return { state: 'review_grace', allowed: true, deadline: graceEnd } as const;
  }
  return { state: 'required', allowed: false, deadline } as const;
}
