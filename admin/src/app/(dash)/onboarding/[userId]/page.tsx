import { redirect } from 'next/navigation';

/**
 * The per-user onboarding journey moved into Customers 360.
 *
 * This route was keyed by `userId`, and Customers 360 is keyed by customer id,
 * so there is no direct mapping without a lookup. `/users/:id` is the closest
 * equivalent for an old link — it shows that exact person and links through to
 * their 360 record.
 */
export default function OnboardingUserPage({ params }: { params: { userId: string } }) {
  redirect(`/users/${params.userId}`);
}
