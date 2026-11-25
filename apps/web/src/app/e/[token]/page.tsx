import { Suspense } from "react";
import EmergencyCardPage from "./client";

export default function Page(props: PageProps<"/e/[token]">) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md p-6"><div className="skeleton h-64" /></main>}>
      <EmergencyCardPage params={props.params} />
    </Suspense>
  );
}
