"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthorsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/manage");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0d0f12] text-slate-400 flex items-center justify-center">
      <span>Redirecting to Authors & Categories Manager...</span>
    </div>
  );
}

