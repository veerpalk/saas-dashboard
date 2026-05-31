import { redirect } from "next/navigation";

// Root "/" redirects to the dashboard (middleware will catch unauthenticated users
// and redirect them to /login before this component is ever rendered).
export default function RootPage() {
  redirect("/dashboard");
}
