"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <button
      type="button"
      onClick={logout}
      className="font-body cursor-pointer text-sm text-ink-soft underline decoration-ink/30 underline-offset-2 transition hover:text-ink"
    >
      Log out
    </button>
  );
}
