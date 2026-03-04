import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <section className="app-page min-h-[calc(100vh-9rem)] px-4 py-10">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
        <LoginForm />
      </div>
    </section>
  );
}
