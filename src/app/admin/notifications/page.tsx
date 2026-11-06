import { redirect } from "next/navigation";

/**
 * The old broadcast screen (in-page only, nobody saw it when the site was
 * closed) is replaced by the push notification centre.
 */
export default function OldNotificationsPage() {
  redirect("/admin/push");
}
