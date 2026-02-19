
import { redirect } from 'next/navigation';

export default async function InternalEditEventPageCatcher({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/events/${id}`);
}
