import Dashboard from "@/components/Dashboard";
import LearningAssistant from "@/components/LearningAssistant";
import { AuthProvider } from "@/components/AuthProvider";
import SiteHeader from "@/components/SiteHeader";

export default function Home() {
  return (
    <AuthProvider>
      <SiteHeader />
      <main className="shell">
        <Dashboard />
        <LearningAssistant />
      </main>
    </AuthProvider>
  );
}
