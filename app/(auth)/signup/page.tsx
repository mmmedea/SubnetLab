import AuthForm from "@/components/auth/AuthForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reason?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="signup" searchParams={params} />;
}
