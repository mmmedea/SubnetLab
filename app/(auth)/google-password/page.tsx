import GooglePasswordSetup from "@/components/auth/GooglePasswordSetup";

export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const params=await searchParams;
  return <GooglePasswordSetup next={params.next??"/dashboard"}/>;
}
