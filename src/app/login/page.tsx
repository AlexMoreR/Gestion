import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <section className="app-page grid min-h-[calc(100vh-9rem)] place-items-center px-4 py-10">
      <LoginForm />
    </section>
  );
}
