import { Suspense } from "react";
import CaregiverPage from "./client";

export default function Page(props: PageProps<"/c/[token]">) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md p-6"><div className="skeleton h-48" /></main>}>
      <CaregiverPage params={props.params} />
    </Suspense>
  );
}
