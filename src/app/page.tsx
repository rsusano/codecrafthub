import Dashboard from "@/components/Dashboard";
import LearningAssistant from "@/components/LearningAssistant";
import { AuthProvider } from "@/components/AuthProvider";

export default function Home() {
  return (
    <AuthProvider>
      <main className="shell">
        <Dashboard />
        <LearningAssistant />
      </main>
    </AuthProvider>
  );
}
